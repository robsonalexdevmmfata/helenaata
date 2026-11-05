/**
 * Sobe variáveis de hospedagem (sem imprimir valores).
 * Uso: node scripts/sync-cloud-env.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function loadEnv() {
  const env = { ...process.env };
  for (const name of [".env.local", ".env"]) {
    const file = path.resolve(name);
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const k = line.slice(0, i).trim();
      let v = line.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (k && env[k] == null) env[k] = v;
    }
  }
  return env;
}

const env = loadEnv();
const team = env.VERCEL_TEAM_ID ? `?teamId=${encodeURIComponent(env.VERCEL_TEAM_ID)}` : "";

function log(msg) {
  console.log(msg);
}

async function upsertVercel(projectId, key, value, extra = {}) {
  const q = new URLSearchParams({ upsert: "true" });
  if (env.VERCEL_TEAM_ID) q.set("teamId", env.VERCEL_TEAM_ID);
  const res = await fetch(`https://api.vercel.com/v10/projects/${projectId}/env?${q}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.VERCEL_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      key,
      value,
      type: extra.type || "encrypted",
      target: extra.target || ["production", "preview", "development"],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${key}: ${data?.error?.message || res.status}`);
  log(`vercel env ${key} ok`);
}

async function main() {
  if (!env.VERCEL_TOKEN) throw new Error("VERCEL_TOKEN ausente");
  const list = await fetch(`https://api.vercel.com/v9/projects${team}`, {
    headers: { Authorization: `Bearer ${env.VERCEL_TOKEN}` },
  });
  const projects = await list.json();
  const rows = projects.projects || projects;
  const project = (Array.isArray(rows) ? rows : []).find(
    (p) => /helenaata|helena|sample-admin-harbor/i.test(`${p.name} ${p.id}`),
  ) || (Array.isArray(rows) ? rows[0] : null);
  if (!project?.id) throw new Error("Projeto Vercel não encontrado");
  log(`vercel project=${project.name} (id oculto)`);

  // Cadastro/login rodam nas functions /api/auth na Vercel (mesmo domínio do site).
  // VITE_API_URL vazio = fetch relativo; o restante de /api continua no rewrite do Render.
  await upsertVercel(project.id, "VITE_API_URL", "");
  await upsertVercel(project.id, "VITE_PUBLIC_SITE_URL", "https://helenaata.vercel.app");
  await upsertVercel(project.id, "VITE_EVOLUTION_URL", "https://evolutionapi.hostless.app");
  await upsertVercel(project.id, "VITE_EVOLUTION_INSTANCE", "helena");
  await upsertVercel(project.id, "SUPABASE_POOLER_REGION", env.SUPABASE_POOLER_REGION || "us-east-1");
  if (env.DATABASE_URL) await upsertVercel(project.id, "DATABASE_URL", env.DATABASE_URL);
  else log("vercel skip DATABASE_URL vazio");
  if (env.SESSION_SECRET) await upsertVercel(project.id, "SESSION_SECRET", env.SESSION_SECRET);
  if (env.ADMIN_PASSWORD) await upsertVercel(project.id, "ADMIN_PASSWORD", env.ADMIN_PASSWORD);
  if (env.ADMIN_USER) await upsertVercel(project.id, "ADMIN_USER", env.ADMIN_USER);

  if (!env.RENDER_API_KEY) {
    log("render: RENDER_API_KEY ausente — WhatsApp/Evolution seguem no Render; cadastro já usa a Vercel");
    return;
  }
  const svcRes = await fetch("https://api.render.com/v1/services?limit=50", {
    headers: { Authorization: `Bearer ${env.RENDER_API_KEY}`, Accept: "application/json" },
  });
  const svcs = await svcRes.json();
  const items = Array.isArray(svcs) ? svcs : [];
  const svc = items
    .map((x) => x.service || x)
    .find((s) => /helena/i.test(`${s.name} ${s.serviceDetails?.url || ""}`));
  if (!svc?.id) {
    log("render: serviço helena não encontrado via API");
    return;
  }
  log(`render service=${svc.name}`);
  const vars = {
    EVOLUTION_URL: "https://evolutionapi.hostless.app",
    EVOLUTION_KEY: env.EVOLUTION_KEY || env.VITE_EVOLUTION_KEY || "",
    EVOLUTION_INSTANCE: "helena",
    GITHUB_TOKEN: env.GITHUB_TOKEN || "",
    VERCEL_TOKEN: env.VERCEL_TOKEN || "",
    VERCEL_TEAM_ID: env.VERCEL_TEAM_ID || "",
    VITE_PUBLIC_SITE_URL: "https://helenaata.vercel.app",
    VITE_EVOLUTION_URL: "https://evolutionapi.hostless.app",
    DATABASE_URL: env.DATABASE_URL || "",
    SUPABASE_POOLER_REGION: env.SUPABASE_POOLER_REGION || "us-east-1",
  };
  for (const [key, value] of Object.entries(vars)) {
    if (!value) {
      log(`render skip ${key} vazio`);
      continue;
    }
    const r = await fetch(`https://api.render.com/v1/services/${svc.id}/env-vars/${encodeURIComponent(key)}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${env.RENDER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ value }),
    });
    log(`render env ${key} ${r.ok ? "ok" : r.status}`);
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
