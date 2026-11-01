/**
 * Fonte oficial Helena 1.0 (Supabase Postgres). Só no servidor.
 * A persistência de produção exige DATABASE_URL configurada no servidor.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

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

async function getPool() {
  if (pool) return pool;
  if (pgTried) return null;
  pgTried = true;
  const url = process.env.DATABASE_URL || "";
  if (!url || process.env.VITEST) return null;
  try {
    const { default: pg } = await import("pg");
    pool = new pg.Pool({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
      max: 4,
    });
    return pool;
  } catch (err) {
    console.warn("[helena-db] pg indisponível:", err?.message || err);
    return null;
  }
}

async function q(text, params = []) {
  const p = await getPool();
  if (!p) throw new Error("Supabase/PostgreSQL indisponível: DATABASE_URL não configurada.");
  return p.query(text, params);
}

export async function dbReady() {
  const p = await getPool();
  if (!p) return false;
  try {
    await p.query("select 1");
    return true;
  } catch (error) {
    console.warn("[helena-db] conexão indisponível:", error?.message || error);
    return false;
  }
}

export async function createWorkspaceAccount({ user, passwordHash }) {
  const p = await getPool();
  if (!p) throw new Error("Supabase/PostgreSQL indisponível: DATABASE_URL não configurada.");
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
  const p = await getPool();
  if (!p) throw new Error("Supabase/PostgreSQL indisponível: DATABASE_URL não configurada.");
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
  const p = await getPool();
  if (!p) throw new Error("Supabase/PostgreSQL indisponível: DATABASE_URL não configurada.");
  const result = await p.query(
    `select profile from public.app_accounts where app_user_id = $1 limit 1`,
    [userId],
  );
  return result.rows[0]?.profile ?? null;
}

export async function listWorkspaceAccountProfiles() {
  const p = await getPool();
  if (!p) throw new Error("Supabase/PostgreSQL indisponível: DATABASE_URL não configurada.");
  const result = await p.query(
    `select profile from public.app_accounts order by created_at asc`,
  );
  return result.rows.map((row) => row.profile);
}

export async function loadWorkspaceSnapshot(organizationId) {
  const p = await getPool();
  if (!p) throw new Error("Supabase/PostgreSQL indisponível: DATABASE_URL não configurada.");
  const result = await p.query(
    `select payload, revision from public.workspace_snapshots
      where app_organization_id = $1 limit 1`,
    [organizationId],
  );
  return result.rows[0]
    ? { snapshot: result.rows[0].payload, revision: Number(result.rows[0].revision) }
    : { snapshot: null, revision: 0 };
}

export async function saveWorkspaceSnapshot(organizationId, snapshot, expectedRevision, accountProfiles = []) {
  const p = await getPool();
  if (!p) throw new Error("Supabase/PostgreSQL indisponível: DATABASE_URL não configurada.");
  const client = await p.connect();
  try {
    await client.query("begin");
    const result = await client.query(
      `insert into public.workspace_snapshots (app_organization_id, payload, revision)
       values ($1, $2::jsonb, 1)
       on conflict (app_organization_id) do update
         set payload = excluded.payload,
             revision = public.workspace_snapshots.revision + 1,
             updated_at = now()
         where public.workspace_snapshots.revision = $3
       returning revision`,
      [organizationId, JSON.stringify(snapshot), expectedRevision],
    );
    if (!result.rows[0]) {
      await client.query("rollback");
      return null;
    }
    for (const profile of accountProfiles) {
      if (!profile?.id || !profile.organizationId || !profile.email || !profile.username) continue;
      await client.query(
        `update public.app_accounts
            set username = $3, email = $4, profile = $5::jsonb, updated_at = now()
          where app_user_id = $1 and app_organization_id = $2`,
        [profile.id, profile.organizationId, profile.username, profile.email, JSON.stringify(profile)],
      );
    }
    await client.query("commit");
    return Number(result.rows[0].revision);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function saveAppPreview(organizationId, preview) {
  const slug = String(preview?.slug || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 80);
  if (!slug) throw new Error("Slug inválido.");
  const payload = { ...preview, slug };
  const result = await q(
    `insert into public.app_previews (slug, app_organization_id, payload)
     values ($1, $2, $3::jsonb)
     on conflict (slug) do update
       set payload = excluded.payload, updated_at = now()
       where public.app_previews.app_organization_id = excluded.app_organization_id
     returning slug`,
    [slug, organizationId, JSON.stringify(payload)],
  );
  if (!result.rows[0]) {
    const error = new Error("Este slug já pertence a outra organização.");
    error.status = 409;
    throw error;
  }
  return { slug };
}

export async function loadAppPreview(slug) {
  const clean = String(slug || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 80);
  if (!clean) return null;
  const result = await q(
    `select payload from public.app_previews where slug = $1 limit 1`,
    [clean],
  );
  return result.rows[0]?.payload ?? null;
}

export async function recordAppBillingEvent(row) {
  const result = await q(
    `insert into public.app_billing_events
       (id, source_id, email, name, plan_id, status, event, amount, paid, occurred_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     on conflict (source_id) where source_id <> '' do update set
       email = excluded.email, name = excluded.name, plan_id = excluded.plan_id,
       status = excluded.status, event = excluded.event, amount = excluded.amount,
       paid = excluded.paid, occurred_at = excluded.occurred_at
     returning id`,
    [
      randomUUID(),
      row.sourceId || "",
      row.email || "",
      row.name || "",
      row.planId || "",
      row.status || "",
      row.event || "",
      row.amount ?? null,
      Boolean(row.paid),
      row.at || new Date().toISOString(),
    ],
  );
  return result.rows[0];
}

export async function listAppBillingEvents(limit = 80) {
  const result = await q(
    `select email, name, plan_id as "planId", status, event, amount, paid,
            occurred_at as at, source_id as "sourceId"
       from public.app_billing_events
      order by occurred_at desc limit $1`,
    [Math.max(1, Math.min(500, Number(limit) || 80))],
  );
  return result.rows;
}

export async function latestPaidAppBillingEvent(email) {
  const result = await q(
    `select email, name, plan_id as "planId", status, event, amount, paid,
            occurred_at as at, source_id as "sourceId"
       from public.app_billing_events
      where lower(email) = lower($1) and paid = true and plan_id <> ''
      order by occurred_at desc limit 1`,
    [String(email || "").trim()],
  );
  return result.rows[0] ?? null;
}

export async function ensureTenant(input) {
  const orgSlug = String(input.orgSlug || input.organizationId || "").slice(0, 80);
  const appUserId = String(input.appUserId || input.userId || "");
  if (!orgSlug || !appUserId) throw new Error("A conta e a organização são obrigatórias para persistir o ciclo.");
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
  }
  return { organizationId, orgSlug, appUserId };
}

export async function saveCycle(payload) {
  const tenant = await ensureTenant(payload.tenant || {});
  if (!tenant?.organizationId) throw new Error("Não foi possível resolver a organização do ciclo.");
  const oid = tenant.organizationId;

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

  return { ok: true, organizationId: oid };
}

export async function loadCycle({ appUserId, email }) {
  const prof = appUserId
    ? await q("select * from profiles where app_user_id = $1 limit 1", [appUserId])
    : await q("select * from profiles where lower(email) = lower($1) limit 1", [email || ""]);
  const profile = prof.rows[0];
  if (!profile) return { ok: false, empty: true };
  const oid = profile.organization_id;
  const contacts = (await q("select * from contacts where organization_id = $1 order by created_at desc limit 400", [oid])).rows;
  const companies = (await q("select * from companies where organization_id = $1 limit 400", [oid])).rows;
  const executions = (await q("select * from executions where organization_id = $1 order by created_at desc limit 200", [oid])).rows;
  const diagnoses = (await q("select * from lead_diagnoses where organization_id = $1", [oid])).rows;
  const memories = (await q("select * from commercial_memory where organization_id = $1 order by created_at desc limit 200", [oid])).rows;
  const deals = (await q("select * from deals where organization_id = $1 limit 200", [oid])).rows;
  return {
    ok: true,
    profile,
    contacts,
    companies,
    executions,
    diagnoses,
    memories,
    deals,
  };
}

export async function dueRpaJobs(limit = 1) {
  const p = await getPool();
  if (!p) throw new Error("Supabase/PostgreSQL indisponível: DATABASE_URL não configurada.");
  const client = await p.connect();
  try {
    await client.query("begin");
    const res = await client.query(
      `update public.rpa_jobs set status = 'running', attempts = attempts + 1, started_at = now()
       where id in (
         select id from public.rpa_jobs
         where kind = 'send_wa' and status = 'queued' and run_at <= now()
           and attempts < coalesce(max_attempts, 3)
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
    throw e;
  } finally {
    client.release();
  }
}

export async function markRpaJob(id, status, error) {
  const row = (await q("select attempts, max_attempts, started_at from public.rpa_jobs where id = $1", [id])).rows[0];
  if (!row) throw new Error("Tarefa RPA não encontrada ao registrar o resultado.");
  const attempts = Number(row?.attempts) || 1;
  const max = Number(row?.max_attempts) || 3;
  let next = status;
  let runAt = null;
  if (status === "failed" && attempts < max) {
    next = "queued";
    runAt = new Date(Date.now() + Math.min(3600_000, 2 ** attempts * 60_000)).toISOString();
  }
  await q(
    `update public.rpa_jobs set
       status = $2, error = $3, finished_at = now(),
       duration_ms = case when started_at is null then duration_ms else extract(epoch from (now() - started_at)) * 1000 end,
       run_at = coalesce($4::timestamptz, run_at)
     where id = $1`,
    [id, next, error || null, runAt],
  );
}

export async function enqueueRpaJobDb({ appUserId, orgSlug, email, name, companyName, instance, number, text, delayMs = 35_000 }) {
  const tenant = await ensureTenant({ appUserId, orgSlug, email, name, companyName });
  const p = await getPool();
  if (!p) throw new Error("Supabase/PostgreSQL indisponível: DATABASE_URL não configurada.");
  const client = await p.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext('helena-rpa-hourly-limit'))");
    const count = Number((await client.query(
      `select count(*)::int as count from public.rpa_jobs
        where (
          (status = 'sent' and finished_at >= now() - interval '1 hour')
          or status = 'running'
          or status = 'queued'
        )`,
    )).rows[0]?.count || 0);
    if (count >= 20) {
      await client.query("rollback");
      return { ok: false, error: "teto antiban 20/hora no worker", status: 429 };
    }

    const runAt = new Date(Date.now() + Math.max(5_000, Number(delayMs) || 35_000));
    const result = await client.query(
      `insert into public.rpa_jobs
         (organization_id, org_slug, kind, status, payload, run_at, max_attempts)
       values ($1, $2, 'send_wa', 'queued', $3::jsonb, $4, 3)
       returning id, run_at`,
      [
        tenant.organizationId,
        tenant.orgSlug,
        JSON.stringify({
          instance: instance || "helena",
          number: String(number).replace(/\D/g, ""),
          text: String(text),
        }),
        runAt.toISOString(),
      ],
    );
    await client.query("commit");
    return { ok: true, id: result.rows[0].id, runAt: result.rows[0].run_at };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function listRpaJobsDb({ appUserId, orgSlug, email, name, companyName }) {
  const tenant = await ensureTenant({ appUserId, orgSlug, email, name, companyName });
  const jobs = (await q(
    `select * from public.rpa_jobs where organization_id = $1 order by created_at desc limit 120`,
    [tenant.organizationId],
  )).rows;
  return {
    ok: true,
    jobs: jobs.map((job) => ({
      ...job,
      runAt: job.run_at,
      createdAt: job.created_at,
      finishedAt: job.finished_at,
      durationMs: job.duration_ms,
      instance: job.payload?.instance,
      number: job.payload?.number,
      text: job.payload?.text,
    })),
    organizationId: tenant.organizationId,
  };
}

export async function retryRpaJobDb(id, { appUserId, orgSlug, email, name, companyName }) {
  const tenant = await ensureTenant({ appUserId, orgSlug, email, name, companyName });
  const row = (await q("select * from public.rpa_jobs where id = $1 and organization_id = $2", [id, tenant.organizationId])).rows[0];
  if (!row) return { ok: false, error: "não encontrada" };
  if (row.attempts >= (row.max_attempts || 3) && row.status === "failed") {
    return { ok: false, error: "limite de tentativas" };
  }
  await q(
    `update public.rpa_jobs set status = 'queued', error = null, run_at = now(),
       finished_at = null, started_at = null where id = $1 and organization_id = $2`,
    [id, tenant.organizationId],
  );
  return { ok: true };
}

export async function rpaMonitorDb({ appUserId, orgSlug, email, name, companyName } = {}) {
  const tenant = appUserId ? await ensureTenant({ appUserId, orgSlug, email, name, companyName }) : null;
  const where = tenant ? " where organization_id = $1" : "";
  const params = tenant ? [tenant.organizationId] : [];
  const queued = (await q(`select count(*)::int as n from public.rpa_jobs${where}${tenant ? " and" : " where"} status = 'queued'`, params)).rows[0]?.n || 0;
  const failed = (await q(`select count(*)::int as n from public.rpa_jobs${where}${tenant ? " and" : " where"} status = 'failed'`, params)).rows[0]?.n || 0;
  const running = (await q(`select count(*)::int as n from public.rpa_jobs${where}${tenant ? " and" : " where"} status = 'running'`, params)).rows[0]?.n || 0;
  const last = (await q(
    `select finished_at, started_at from public.rpa_jobs${where}
      order by coalesce(finished_at, started_at, created_at) desc limit 1`,
    params,
  )).rows[0];
  const next = (await q(
    `select run_at from public.rpa_jobs${where}${tenant ? " and" : " where"} status = 'queued' order by run_at asc limit 1`,
    params,
  )).rows[0];
  const avg = (await q(
    `select coalesce(avg(duration_ms),0)::int as n from public.rpa_jobs${where}${tenant ? " and" : " where"} duration_ms is not null`,
    params,
  )).rows[0]?.n || 0;
  return { queued, failed, running, lastAt: last?.finished_at || last?.started_at || "", nextAt: next?.run_at || "", avgMs: avg };
}
