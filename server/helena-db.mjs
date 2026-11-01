/**
 * Fonte oficial Helena 1.0 (Supabase Postgres). Só no servidor.
 * Sem DATABASE_URL vira no-op — o mock continua.
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
  if (!p) return { rows: [], skipped: true };
  return p.query(text, params);
}

export async function dbReady() {
  const p = await getPool();
  return Boolean(p);
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
  }
  return { organizationId, orgSlug, appUserId };
}

export async function saveCycle(payload) {
  const tenant = await ensureTenant(payload.tenant || {});
  if (!tenant?.organizationId || tenant.skipped) return { ok: false, skipped: true };
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
