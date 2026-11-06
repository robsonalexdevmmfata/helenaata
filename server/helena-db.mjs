/**
 * Fonte oficial Helena 1.0 (Supabase Postgres). Só no servidor.
 * Sem DATABASE_URL vira no-op — o mock continua.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

function loadLocalEnv() {
  for (const name of [".env.local", ".env"]) {
    const file = path.resolve(name);
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const k = line.slice(0, i).trim();
      let v = line.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (k && process.env[k] == null) process.env[k] = v;
    }
  }
}
loadLocalEnv();

let pool = null;
let pgTried = false;

/**
 * db.<ref>.supabase.co é só IPv6. Render e várias redes IPv4 não resolvem esse host
 * e o cadastro fica pendurado ou cai em "Supabase indisponível".
 * O pooler de sessão em aws-0-<região>.pooler.supabase.com tem IPv4.
 */
export function ipv4SupabaseUrl(raw) {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return raw;
  }
  const match = parsed.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i);
  if (!match) return raw;
  const ref = match[1];
  const user = decodeURIComponent(parsed.username || "postgres");
  const poolUser = user.includes(".") ? user : `${user}.${ref}`;
  const region = String(process.env.SUPABASE_POOLER_REGION || "us-east-1").trim();
  const poolHost = String(process.env.SUPABASE_POOLER_HOST || `aws-0-${region}.pooler.supabase.com`).trim();
  parsed.hostname = poolHost;
  parsed.port = parsed.port === "6543" ? "6543" : "5432";
  parsed.username = poolUser;
  return parsed.toString();
}

async function getPool() {
  if (pool) return pool;
  if (pgTried) return null;
  pgTried = true;
  const url = process.env.DATABASE_URL || "";
  if (!url || process.env.VITEST) return null;
  const connectionString = ipv4SupabaseUrl(url);
  if (connectionString !== url) {
    console.warn("[helena-db] host direto do Supabase é IPv6; usando o pooler IPv4.");
  }
  try {
    const { default: pg } = await import("pg");
    const next = new pg.Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 4,
      connectionTimeoutMillis: 8000,
    });
    await next.query("select 1");
    pool = next;
    return pool;
  } catch (err) {
    console.warn("[helena-db] conexão indisponível:", err?.code || err?.message || err);
    return null;
  }
}

async function q(text, params = []) {
  const p = await getPool();
  if (!p) return { rows: [], skipped: true };
  return p.query(text, params);
}

export async function dbReady() {
  const p = await getPool();
  if (!p) return false;
  try {
    await p.query("select 1");
    return true;
  } catch (error) {
    console.warn("[helena-db] conexão indisponível:", error?.code || error?.message || error);
    return false;
  }
}

async function requiredPool() {
  const p = await getPool();
  if (!p) throw new Error("Supabase/PostgreSQL indisponível. Configure DATABASE_URL no servidor.");
  return p;
}

export async function hashWorkspacePassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(String(password), salt, 64);
  return `scrypt$${salt.toString("base64url")}$${Buffer.from(key).toString("base64url")}`;
}

export async function workspacePasswordMatches(password, encoded) {
  const [scheme, saltText, keyText] = String(encoded || "").split("$");
  if (scheme !== "scrypt" || !saltText || !keyText) return false;
  const salt = Buffer.from(saltText, "base64url");
  const expected = Buffer.from(keyText, "base64url");
  if (salt.length !== 16 || expected.length !== 64) return false;
  const actual = Buffer.from(await scrypt(String(password), salt, expected.length));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function createWorkspaceAccount({ user, passwordHash }) {
  const p = await requiredPool();
  const result = await p.query(
    `insert into public.app_accounts
       (app_user_id, app_organization_id, username, email, password_hash, profile)
     values ($1, $2, $3, $4, $5, $6::jsonb)
     returning profile`,
    [
      user.id,
      user.organizationId,
      user.username,
      user.email,
      passwordHash,
      JSON.stringify(user),
    ],
  );
  return result.rows[0]?.profile;
}

export async function workspaceAccountByLogin(login) {
  const p = await requiredPool();
  const result = await p.query(
    `select app_user_id, app_organization_id, username, email, password_hash, profile
       from public.app_accounts
      where lower(username) = lower($1) or lower(email) = lower($1)
      limit 1`,
    [login],
  );
  return result.rows[0] ?? null;
}

export async function workspaceAccountById(userId) {
  const p = await requiredPool();
  const result = await p.query(
    `select profile from public.app_accounts where app_user_id = $1 limit 1`,
    [userId],
  );
  return result.rows[0]?.profile ?? null;
}

export async function ensureTenant(input) {
  const orgSlug = String(input.orgSlug || input.organizationId || "").slice(0, 80);
  const appUserId = String(input.appUserId || input.userId || "");
  if (!orgSlug || !appUserId) return { skipped: true };
  const orgId = randomUUID();
  const profileId = randomUUID();
  const found = await q("select id from organizations where app_slug = $1 limit 1", [orgSlug]);
  let organizationId = found.rows[0]?.id;
  if (!organizationId) {
    await q(
      `insert into organizations (id, name, slug, app_slug, plan, kind)
       values ($1,$2,$3,$4,$5,'customer')
       on conflict (slug) do update set name = excluded.name, plan = excluded.plan
       returning id`,
      [orgId, input.companyName || input.name || orgSlug, orgSlug.slice(0, 90), orgSlug, input.plan || "trial"],
    );
    const again = await q("select id from organizations where app_slug = $1 or slug = $1 limit 1", [orgSlug]);
    organizationId = again.rows[0]?.id || orgId;
  } else {
    await q("update organizations set plan = coalesce($2, plan), name = coalesce($3, name) where id = $1", [
      organizationId,
      input.plan || null,
      input.companyName || null,
    ]);
  }
  const prof = await q("select id from profiles where app_user_id = $1 limit 1", [appUserId]);
  if (!prof.rows[0]) {
    await q(
      `insert into profiles (id, organization_id, full_name, email, role, company_name, phone, evolution_instance, app_user_id)
       values ($1,$2,$3,$4,'owner',$5,$6,$7,$8)
       on conflict (app_user_id) where app_user_id is not null do nothing`,
      [
        profileId,
        organizationId,
        input.name || "Conta",
        String(input.email || `${appUserId}@helena.local`).toLowerCase(),
        input.companyName || null,
        input.phone || null,
        input.evolutionInstance || null,
        appUserId,
      ],
    );
  } else {
    // Sempre atualiza telefone / instância Evolution (WhatsApp conectado não pode sumir).
    await q(
      `update profiles set
         phone = coalesce(nullif($2, ''), phone),
         evolution_instance = coalesce(nullif($3, ''), evolution_instance),
         full_name = coalesce(nullif($4, ''), full_name),
         company_name = coalesce(nullif($5, ''), company_name)
       where app_user_id = $1`,
      [
        appUserId,
        input.phone || input.whatsappPhone || null,
        input.evolutionInstance || null,
        input.name || null,
        input.companyName || null,
      ],
    );
  }
  return { organizationId, orgSlug, appUserId };
}

export async function saveCycle(payload) {
  const connections = Array.isArray(payload.connections) ? payload.connections : [];
  const waPhone =
    connections.find((c) => c?.status === "online" && c?.phone)?.phone
    || connections.find((c) => c?.phone)?.phone
    || payload.tenant?.whatsappPhone
    || payload.tenant?.phone
    || null;
  const tenantInput = {
    ...(payload.tenant || {}),
    phone: waPhone || payload.tenant?.phone || null,
    whatsappPhone: waPhone || null,
  };
  const tenant = await ensureTenant(tenantInput);
  if (!tenant?.organizationId || tenant.skipped) return { ok: false, skipped: true };
  const oid = tenant.organizationId;
  if (waPhone && tenant.appUserId) {
    await q(
      `update profiles set phone = $2 where app_user_id = $1`,
      [tenant.appUserId, waPhone],
    ).catch(() => {});
  }

  for (const c of payload.companies || []) {
    await q(
      `insert into companies (id, organization_id, app_id, name, segment, city, website, has_own_site)
       values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7)
       on conflict (organization_id, app_id) where app_id is not null do update set
         name = excluded.name, segment = excluded.segment, city = excluded.city, website = excluded.website`,
      [oid, c.id, c.name, c.segment || null, c.city || null, c.website || "", !(c.website || "").trim()],
    );
  }

  for (const c of payload.contacts || []) {
    await q(
      `insert into contacts (
         id, organization_id, app_id, name, email, phone, status, source, tags, consent, opted_out, score, opportunity, cycle_state
       ) values (
         gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
       )
       on conflict (organization_id, app_id) where app_id is not null do update set
         name = excluded.name, email = excluded.email, phone = excluded.phone, status = excluded.status,
         tags = excluded.tags, score = excluded.score, opportunity = excluded.opportunity,
         cycle_state = excluded.cycle_state, last_contact_at = now()`,
      [
        oid,
        c.id,
        c.name,
        c.email || null,
        c.phone || null,
        c.status || "lead",
        c.source || "Prospecção",
        c.tags || [],
        c.consent !== false,
        Boolean(c.opted_out),
        Number(c.score) || 0,
        c.opportunity || "media",
        c.cycle_state || "novo",
      ],
    );
  }

  for (const d of payload.diagnoses || []) {
    const contact = await q("select id from contacts where organization_id = $1 and app_id = $2 limit 1", [oid, d.contactId]);
    const cid = contact.rows[0]?.id;
    if (!cid) continue;
    await q(
      `insert into lead_diagnoses (id, organization_id, contact_id, score, opportunity, findings, recommend_offer, recommend_pitch)
       values (gen_random_uuid(), $1, $2, $3, $4, $5::jsonb, $6, $7)
       on conflict (contact_id) do update set
         score = excluded.score, opportunity = excluded.opportunity, findings = excluded.findings,
         recommend_offer = excluded.recommend_offer, recommend_pitch = excluded.recommend_pitch, analyzed_at = now()`,
      [oid, cid, d.score, d.opportunity, JSON.stringify(d.findings || []), d.recommend_offer || null, d.recommend_pitch || null],
    );
  }

  for (const m of payload.memories || []) {
    const contact = await q("select id from contacts where organization_id = $1 and app_id = $2 limit 1", [oid, m.contactId]);
    const cid = contact.rows[0]?.id;
    if (!cid) continue;
    await q(
      `insert into commercial_memory (id, organization_id, contact_id, kind, fact, due_at, created_by)
       values (gen_random_uuid(), $1, $2, $3, $4, $5, $6)`,
      [oid, cid, m.kind, m.fact, m.due_at || null, m.created_by || "Helena"],
    );
  }

  for (const e of (payload.executions || []).slice(0, 80)) {
    await q(
      `insert into executions (id, organization_id, app_id, actor, actor_type, action, description, result, params, duration_ms)
       values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
       on conflict (organization_id, app_id) where app_id is not null do nothing`,
      [
        oid,
        e.id || null,
        e.actor || "Helena",
        e.actorType || "helena",
        e.action || "unknown",
        e.description || "",
        e.result === "falha" ? "falha" : e.result === "pendente" ? "pendente" : "sucesso",
        JSON.stringify(e.params || {}),
        Number(e.durationMs) || 0,
      ],
    );
  }

  for (const job of payload.rpaJobs || []) {
    await q(
      `insert into rpa_jobs (
         id, organization_id, org_slug, kind, status, payload, run_at, idempotency_key, contact_app_id, app_id, max_attempts
       ) values (
         gen_random_uuid(), $1, $2, $3, 'queued', $4::jsonb, $5, $6, $7, $8, 3
       )
       on conflict (organization_id, idempotency_key) where idempotency_key is not null do nothing`,
      [
        oid,
        tenant.orgSlug,
        job.kind || "send_wa",
        JSON.stringify(job.payload || job),
        job.runAt ? new Date(job.runAt).toISOString() : new Date().toISOString(),
        job.idempotencyKey || job.id || null,
        job.contactId || null,
        job.id || null,
      ],
    );
  }

  // Snapshot durable: leads + conversas (evita Inbox temporário e reabordagem).
  const appOrg = String(payload.tenant?.organizationId || payload.tenant?.orgSlug || tenant.orgSlug || "");
  if (appOrg) {
    const inbox = {
      conversations: Array.isArray(payload.conversations) ? payload.conversations.slice(0, 800) : [],
      deals: Array.isArray(payload.deals) ? payload.deals.slice(0, 800) : [],
      contacts: Array.isArray(payload.contacts) ? payload.contacts.slice(0, 1000) : [],
      companies: Array.isArray(payload.companies) ? payload.companies.slice(0, 1000) : [],
      connections: connections.slice(0, 20),
      sitePreviews: Array.isArray(payload.sitePreviews) ? payload.sitePreviews.slice(0, 200) : [],
      whatsappPhone: waPhone || null,
      evolutionInstance: payload.tenant?.evolutionInstance || null,
      // Sistema inteiro: agents, teams, pipelines, RPA, Helena, agenda, etc.
      workspace: payload.workspace && typeof payload.workspace === "object" ? payload.workspace : null,
      savedAt: new Date().toISOString(),
    };
    try {
      await q(
        `insert into workspace_snapshots (app_organization_id, payload, revision, updated_at)
         values ($1, $2::jsonb, 1, now())
         on conflict (app_organization_id) do update set
           payload = excluded.payload,
           revision = workspace_snapshots.revision + 1,
           updated_at = now()`,
        [appOrg, JSON.stringify(inbox)],
      );
    } catch (err) {
      console.warn("[helena-db] workspace_snapshots:", err?.message || err);
    }
  }

  // Prévias públicas /v/:slug — durable no Supabase (disco do Render some no redeploy).
  try {
    const fullList = Array.isArray(payload.workspace?.sitePreviews)
      ? payload.workspace.sitePreviews
      : Array.isArray(payload.sitePreviews)
        ? payload.sitePreviews
        : [];
    for (const preview of fullList.slice(0, 200)) {
      if (preview?.slug) await upsertAppPreview(preview, appOrg || String(oid || ""));
    }
  } catch (err) {
    console.warn("[helena-db] app_previews upsert:", err?.message || err);
  }

  return { ok: true, organizationId: oid };
}

function cleanPreviewSlug(slug) {
  return String(slug || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 80);
}

/** Grava prévia completa pra link público /v/:slug (sem auth). */
export async function upsertAppPreview(preview, appOrganizationId = "") {
  const p = await getPool();
  if (!p || !preview) return { ok: false };
  const slug = cleanPreviewSlug(preview.slug);
  if (!slug) return { ok: false };
  const org = String(appOrganizationId || preview.organizationId || "public");
  const row = { ...preview, slug };
  try {
    await q(
      `insert into app_previews (slug, app_organization_id, payload, created_at, updated_at)
       values ($1, $2, $3::jsonb, now(), now())
       on conflict (slug) do update set
         payload = excluded.payload,
         app_organization_id = excluded.app_organization_id,
         updated_at = now()`,
      [slug, org, JSON.stringify(row)],
    );
    return { ok: true, slug };
  } catch (err) {
    console.warn("[helena-db] upsertAppPreview:", err?.message || err);
    return { ok: false, error: err?.message };
  }
}

export async function loadAppPreview(slug) {
  const p = await getPool();
  if (!p) return null;
  const clean = cleanPreviewSlug(slug);
  if (!clean) return null;
  try {
    const res = await q("select payload from app_previews where slug = $1 limit 1", [clean]);
    const payload = res.rows[0]?.payload;
    return payload && typeof payload === "object" ? payload : null;
  } catch (err) {
    console.warn("[helena-db] loadAppPreview:", err?.message || err);
    return null;
  }
}

export async function loadCycle({ appUserId, email }) {
  const prof = appUserId
    ? await q("select * from profiles where app_user_id = $1 limit 1", [appUserId])
    : await q("select * from profiles where lower(email) = lower($1) limit 1", [email || ""]);
  const profile = prof.rows[0];
  if (!profile) return { ok: false, empty: true };
  const oid = profile.organization_id;
  const contacts = (await q("select * from contacts where organization_id = $1 order by created_at desc limit 1000", [oid])).rows;
  const companies = (await q("select * from companies where organization_id = $1 limit 1000", [oid])).rows;
  const executions = (await q("select * from executions where organization_id = $1 order by created_at desc limit 200", [oid])).rows;
  const diagnoses = (await q("select * from lead_diagnoses where organization_id = $1", [oid])).rows;
  const memories = (await q("select * from commercial_memory where organization_id = $1 order by created_at desc limit 200", [oid])).rows;
  const deals = (await q("select * from deals where organization_id = $1 limit 800", [oid])).rows;
  let inbox = null;
  try {
    const acc = profile.app_user_id
      ? await q("select app_organization_id from app_accounts where app_user_id = $1 limit 1", [profile.app_user_id])
      : { rows: [] };
    const appOrg = String(acc.rows[0]?.app_organization_id || profile.app_organization_id || "");
    const snap = appOrg
      ? await q("select payload from workspace_snapshots where app_organization_id = $1 limit 1", [appOrg])
      : { rows: [] };
    inbox = snap.rows[0]?.payload || null;
  } catch {
    inbox = null;
  }
  return {
    ok: true,
    profile,
    contacts,
    companies,
    executions,
    diagnoses,
    memories,
    deals,
    conversations: inbox?.conversations || [],
    connections: inbox?.connections || [],
    whatsappPhone: inbox?.whatsappPhone || profile.phone || null,
    evolutionInstance: inbox?.evolutionInstance || profile.evolution_instance || null,
    workspace: inbox?.workspace || null,
    inbox,
  };
}

export async function dueRpaJobs(limit = 1) {
  const p = await getPool();
  if (!p) return [];
  const client = await p.connect();
  try {
    await client.query("begin");
    const res = await client.query(
      `update rpa_jobs set status = 'running', attempts = attempts + 1, started_at = now()
       where id in (
         select id from rpa_jobs
         where status = 'queued' and run_at <= now() and attempts < coalesce(max_attempts, 3)
         order by run_at asc
         for update skip locked
         limit $1
       )
       returning *`,
      [limit],
    );
    await client.query("commit");
    return res.rows || [];
  } catch (e) {
    await client.query("rollback");
    return [];
  } finally {
    client.release();
  }
}

export async function markRpaJob(id, status, error) {
  const row = (await q("select attempts, max_attempts, started_at from rpa_jobs where id = $1", [id])).rows[0];
  const attempts = Number(row?.attempts) || 1;
  const max = Number(row?.max_attempts) || 3;
  let next = status;
  let runAt = null;
  if (status === "failed" && attempts < max) {
    next = "queued";
    runAt = new Date(Date.now() + Math.min(3600_000, 2 ** attempts * 60_000)).toISOString();
  }
  await q(
    `update rpa_jobs set
       status = $2, error = $3, finished_at = now(),
       duration_ms = case when started_at is null then duration_ms else extract(epoch from (now() - started_at)) * 1000 end,
       run_at = coalesce($4::timestamptz, run_at)
     where id = $1`,
    [id, next, error || null, runAt],
  );
}

export async function listRpaJobsDb({ appUserId, email }) {
  const cycle = await loadCycle({ appUserId, email });
  if (!cycle.ok) return { ok: false, jobs: [] };
  const jobs = (await q(
    `select * from rpa_jobs where organization_id = $1 order by created_at desc limit 120`,
    [cycle.profile.organization_id],
  )).rows;
  return { ok: true, jobs, organizationId: cycle.profile.organization_id };
}

export async function retryRpaJobDb(id) {
  const row = (await q("select * from rpa_jobs where id = $1", [id])).rows[0];
  if (!row) return { ok: false, error: "não encontrada" };
  if (row.attempts >= (row.max_attempts || 3) && row.status === "failed") {
    return { ok: false, error: "limite de tentativas" };
  }
  await q(
    `update rpa_jobs set status = 'queued', error = null, run_at = now() where id = $1`,
    [id],
  );
  return { ok: true };
}

export async function rpaMonitorDb() {
  const queued = (await q("select count(*)::int as n from rpa_jobs where status = 'queued'")).rows[0]?.n || 0;
  const failed = (await q("select count(*)::int as n from rpa_jobs where status = 'failed'")).rows[0]?.n || 0;
  const running = (await q("select count(*)::int as n from rpa_jobs where status = 'running'")).rows[0]?.n || 0;
  const last = (await q("select finished_at, started_at from rpa_jobs order by coalesce(finished_at, started_at, created_at) desc limit 1")).rows[0];
  const next = (await q("select run_at from rpa_jobs where status = 'queued' order by run_at asc limit 1")).rows[0];
  const avg = (await q("select coalesce(avg(duration_ms),0)::int as n from rpa_jobs where duration_ms is not null")).rows[0]?.n || 0;
  return { queued, failed, running, lastAt: last?.finished_at || last?.started_at || "", nextAt: next?.run_at || "", avgMs: avg };
}

/** Cakto → Supabase (sobrevive restart do Render). */
export async function recordAppBillingEvent(row) {
  const p = await getPool();
  if (!p) return { ok: false, skipped: true };
  await p.query(
    `insert into public.app_billing_events
       (source_id, email, name, plan_id, status, event, amount, paid, occurred_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8, coalesce($9::timestamptz, now()))
     on conflict (source_id) where source_id <> '' do update set
       email = excluded.email,
       name = excluded.name,
       plan_id = excluded.plan_id,
       status = excluded.status,
       event = excluded.event,
       amount = excluded.amount,
       paid = excluded.paid,
       occurred_at = excluded.occurred_at`,
    [
      String(row.sourceId || ""),
      String(row.email || "").toLowerCase(),
      String(row.name || ""),
      String(row.planId || ""),
      String(row.status || ""),
      String(row.event || ""),
      row.amount ?? null,
      Boolean(row.paid),
      row.at || null,
    ],
  );
  return { ok: true };
}

export async function latestPaidAppBillingEvent(email) {
  const p = await getPool();
  if (!p) return null;
  const key = String(email || "").trim().toLowerCase();
  if (!key) return null;
  const result = await p.query(
    `select plan_id as "planId", occurred_at as at, paid
       from public.app_billing_events
      where lower(email) = $1 and paid = true and plan_id <> ''
      order by occurred_at desc
      limit 1`,
    [key],
  );
  return result.rows[0] ?? null;
}

/** Libera Impulso/Máquina no profile da conta após pagamento Cakto. */
export async function applyPaidPlanToAccount(email, planId) {
  if (!email || !planId) return { ok: false };
  const p = await getPool();
  if (!p) return { ok: false, skipped: true };
  const account = await workspaceAccountByLogin(email);
  if (!account?.profile) return { ok: false, error: "conta não encontrada" };
  const profile = { ...account.profile, planId, status: "ativo" };
  if (planId === "maquina" || planId === "impulso") {
    profile.lifetimeAccess = false;
  }
  await p.query(
    `update public.app_accounts
        set profile = $2::jsonb, updated_at = now()
      where lower(email) = lower($1)`,
    [email, JSON.stringify(profile)],
  );
  return { ok: true, userId: account.app_user_id, planId };
}
