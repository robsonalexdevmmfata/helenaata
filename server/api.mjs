// Rotas do servidor HELENA AI. Usado em dois lugares, sempre na mesma porta do site:
//  - desenvolvimento: plugin do Vite (vite.config.ts)
//  - produção / Render: server/index.mjs
import { adminProfile, adminUser, checkLogin, issueToken, readToken, verifyToken } from "./auth.mjs";
import { aiProvider, chatCompletion } from "./ai.mjs";
import { evolutionApiKey, handleEvolutionLocal, remoteEvolutionUrl } from "./evolution-bridge.mjs";
import { loadPreview, savePreview } from "./previews.mjs";
import { publishClientSite } from "./dev-publish.mjs";
import { probePublicSite } from "./site-signals.mjs";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { latestPaidPlan, listBillingEvents, parseCaktoPayload, recordBillingEvent } from "./billing.mjs";
import { enqueueRpaJob, listRpaJobs, tickRpaQueue } from "./rpa-queue.mjs";
import {
  createWorkspaceAccount,
  dbReady,
  hashWorkspacePassword,
  loadCycle,
  listRpaJobsDb,
  retryRpaJobDb,
  rpaMonitorDb,
  saveCycle,
  workspaceAccountById,
  workspaceAccountByLogin,
  workspacePasswordMatches,
} from "./helena-db.mjs";

function loadLocalEnv() {
  for (const name of [".env.local", ".env"]) {
    const file = path.resolve(name);
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      if (!line || line.startsWith("#")) continue;
      const i = line.indexOf("=");
      if (i < 1) continue;
      const key = line.slice(0, i).trim();
      let val = line.slice(i + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (key && process.env[key] == null) process.env[key] = val;
    }
  }
}
loadLocalEnv();

const VERSION = "1.0.0";
const startedAt = Date.now();
let waModule = null;

async function whatsapp() {
  waModule ??= await import("./whatsapp.mjs");
  return waModule;
}

function send(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
}

function corsList() {
  const raw = process.env.CORS_ORIGIN || "https://helenaata.vercel.app,https://helenaata.onrender.com,http://localhost:8081";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function originAllowed(req) {
  const list = corsList();
  if (list.includes("*")) return process.env.NODE_ENV !== "production";
  const origin = req.headers.origin || "";
  if (!origin) return true;
  return list.includes(origin);
}

function securityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
}

function cors(req, res) {
  securityHeaders(res);
  const origin = req.headers.origin || "";
  const list = corsList();
  if (list.includes("*") && process.env.NODE_ENV !== "production") {
    res.setHeader("Access-Control-Allow-Origin", "*");
  } else {
    const match = list.includes(origin) ? origin : "";
    if (match) res.setHeader("Access-Control-Allow-Origin", match);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  res.setHeader("Access-Control-Allow-Credentials", "true");
}

function isPublicPath(method, p) {
  if (p === "/health" || p === "/api/health") return true;
  if (p === "/api/auth/login" && method === "POST") return true;
  if (p === "/api/auth/register" && method === "POST") return true;
  if (p === "/api/billing/cakto" && method === "POST") return true;
  if (method === "GET" && p.startsWith("/api/previews/")) return true;
  if (p.startsWith("/api/maps/")) return true;
  if (p === "/api/helena/cycle") return true;
  if (p.startsWith("/api/evolution")) return true;
  if (p === "/api/billing/status") return true;
  return false;
}

async function readJson(req, limit = 1_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      const err = new Error("Corpo da requisição muito grande.");
      err.status = 413;
      throw err;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const err = new Error("JSON inválido.");
    err.status = 400;
    throw err;
  }
}

function bearer(req) {
  const h = req.headers.authorization || "";
  return h.startsWith("Bearer ") ? h.slice(7) : "";
}

/** Inicia tarefas de fundo (ex.: retomar o WhatsApp salvo). */
export async function startBackground() {
  try {
    (await whatsapp()).resumeIfSaved();
    console.log("[Helena] WhatsApp: sessão salva será retomada se existir creds.json no disco.");
  } catch (e) {
    console.warn("[Helena] WhatsApp indisponível no boot (o site sobe mesmo assim):", e?.message || e);
  }
  setInterval(() => {
    tickRpaQueue().catch(() => {});
  }, 15_000);
}

/**
 * Atende /health e /api/*. Retorna true quando a requisição foi respondida;
 * false para deixar o site (frontend) responder.
 */
export async function handleApi(req, res) {
  const url = new URL(req.url || "/", "http://localhost");
  const p = url.pathname;
  if (p !== "/health" && !p.startsWith("/api/")) return false;

  cors(req, res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return true;
  }

  try {
    if (p === "/health" || p === "/api/health") {
      let wa = "unavailable";
      try {
        wa = (await whatsapp()).getStatus().status;
      } catch {
        /* pacote do WhatsApp não instalado */
      }
      send(res, 200, {
        status: "ok",
        system: "Helena AI Backend",
        version: VERSION,
        uptime: Math.round((Date.now() - startedAt) / 1000),
        whatsapp: wa,
        ai: aiProvider(),
        evolution: process.env.EVOLUTION_URL && !/localhost|127\.0\.0\.1/.test(process.env.EVOLUTION_URL)
          ? "remote"
          : "baileys-bridge",
        rpaQueue: listRpaJobs().filter((j) => j.status === "queued").length,
        helenaDb: (await dbReady()) ? "postgres" : "unavailable",
      });
      return true;
    }

    if (p === "/api/helena/cycle" && req.method === "POST") {
      const body = await readJson(req, 2_000_000);
      const out = await saveCycle(body);
      send(res, out.ok || out.skipped ? 200 : 503, out);
      return true;
    }

    if (p === "/api/helena/cycle" && req.method === "GET") {
      const appUserId = url.searchParams.get("appUserId") || "";
      const email = url.searchParams.get("email") || "";
      if (!appUserId && !email) return send(res, 400, { error: "Informe a conta." }), true;
      const out = await loadCycle({ appUserId, email });
      send(res, 200, out);
      return true;
    }

    if (p === "/api/helena/rpa" && req.method === "GET") {
      if (!verifyToken(bearer(req))) return send(res, 401, { error: "Faça login." }), true;
      const out = await listRpaJobsDb({
        appUserId: url.searchParams.get("appUserId") || "",
        email: url.searchParams.get("email") || "",
      });
      send(res, 200, out);
      return true;
    }

    if (p === "/api/helena/rpa/retry" && req.method === "POST") {
      if (!verifyToken(bearer(req))) return send(res, 401, { error: "Faça login." }), true;
      const body = await readJson(req);
      send(res, 200, await retryRpaJobDb(body.id));
      return true;
    }

    if (p === "/api/helena/rpa/monitor" && req.method === "GET") {
      if (!verifyToken(bearer(req))) return send(res, 401, { error: "Faça login." }), true;
      if (!body?.number || !body?.text) return send(res, 400, { error: "number e text" }), true;
      const out = enqueueRpaJob({
        instance: body.instance,
        number: body.number,
        text: body.text,
        delayMs: body.delayMs,
      });
      if (body.orgSlug || body.appUserId) {
        const runAt = new Date(Date.now() + Math.max(5000, Number(body.delayMs) || 35_000)).toISOString();
        await saveCycle({
          tenant: {
            orgSlug: body.orgSlug,
            organizationId: body.orgSlug,
            appUserId: body.appUserId,
            email: body.email,
            name: body.name || "Helena",
          },
          rpaJobs: [{ kind: "send_wa", payload: { instance: body.instance, number: body.number, text: body.text }, runAt }],
        }).catch(() => {});
      }
      send(res, out.ok ? 200 : 429, out);
      return true;
    }

    if (p === "/api/rpa/jobs" && req.method === "GET") {
      send(res, 200, { jobs: listRpaJobs() });
      return true;
    }

    const OVERPASS = [
      "https://overpass.openstreetmap.fr/api/interpreter",
      "https://overpass.kumi.systems/api/interpreter",
      "https://overpass.osm.ch/api/interpreter",
      "https://overpass-api.de/api/interpreter",
    ];
    const MAPS_UA = "HelenaProspecting/1.0 (Info Tech Ltda)";

    if (p === "/api/maps/overpass" && req.method === "POST") {
      const { ql } = await readJson(req);
      if (!ql || typeof ql !== "string") return send(res, 400, { error: "Informe a consulta Overpass." }), true;
      let lastErr = "Overpass indisponível";
      for (const endpoint of OVERPASS) {
        try {
          const r = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
              Accept: "application/json",
              "User-Agent": MAPS_UA,
            },
            body: `data=${encodeURIComponent(ql)}`,
            signal: AbortSignal.timeout(40_000),
          });
          const text = await r.text();
          if (!r.ok) {
            lastErr = `HTTP ${r.status}`;
            continue;
          }
          const json = JSON.parse(text);
          send(res, 200, json);
          return true;
        } catch (e) {
          lastErr = e?.message || lastErr;
        }
      }
      send(res, 502, { error: lastErr, elements: [] });
      return true;
    }

    if (p === "/api/maps/geocode" && req.method === "GET") {
      const q = url.searchParams.get("q") || "";
      if (!q.trim()) return send(res, 400, { error: "Informe a cidade." }), true;
      const r = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=5`, {
        headers: { Accept: "application/json", "User-Agent": MAPS_UA },
        signal: AbortSignal.timeout(10_000),
      });
      if (!r.ok) return send(res, 502, { error: `Photon HTTP ${r.status}` }), true;
      const data = await r.json();
      const feats = Array.isArray(data?.features) ? data.features : [];
      const city = feats.find((f) => /city|town|municipality/i.test(String(f?.properties?.type || f?.properties?.osm_value || "")));
      send(res, 200, { ...data, features: city ? [city, ...feats.filter((f) => f !== city)] : feats });
      return true;
    }

    if (p === "/api/maps/photon" && req.method === "GET") {
      const q = url.searchParams.get("q") || "";
      const lat = url.searchParams.get("lat") || "";
      const lon = url.searchParams.get("lon") || "";
      const limit = url.searchParams.get("limit") || "20";
      if (!q.trim()) return send(res, 400, { error: "Informe a busca." }), true;
      const u = new URL("https://photon.komoot.io/api/");
      u.searchParams.set("q", q);
      u.searchParams.set("limit", limit);
      u.searchParams.set("lang", "pt");
      if (lat) u.searchParams.set("lat", lat);
      if (lon) u.searchParams.set("lon", lon);
      const r = await fetch(u, {
        headers: { Accept: "application/json", "User-Agent": MAPS_UA },
        signal: AbortSignal.timeout(15_000),
      });
      if (!r.ok) return send(res, 502, { error: `Photon HTTP ${r.status}` }), true;
      send(res, 200, await r.json());
      return true;
    }

    if (p === "/api/billing/cakto" && req.method === "POST") {
      const body = await readJson(req, 500_000);
      const expected = process.env.CAKTO_WEBHOOK_SECRET || "";
      if (expected) {
        const got = String(body?.secret || req.headers["x-webhook-secret"] || url.searchParams.get("secret") || "");
        if (got !== expected) return send(res, 401, { error: "Webhook Cakto recusado." }), true;
      }
      const row = parseCaktoPayload(body);
      recordBillingEvent(row);
      send(res, 200, { ok: true, email: row.email, planId: row.planId, paid: row.paid });
      return true;
    }

    if (p === "/api/billing/events" && req.method === "GET") {
      send(res, 200, { events: listBillingEvents().slice(0, 80) });
      return true;
    }

    if (p === "/api/billing/status" && req.method === "GET") {
      const email = url.searchParams.get("email") || "";
      const row = latestPaidPlan(email);
      send(res, 200, { planId: row?.planId || "", paid: Boolean(row), at: row?.at || "" });
      return true;
    }

    if (p === "/api/prospect/site-signals" && req.method === "POST") {
      const { url: siteUrl } = await readJson(req);
      if (!siteUrl) return send(res, 400, { error: "Informe a URL." }), true;
      try {
        send(res, 200, await probePublicSite(siteUrl));
      } catch (e) {
        send(res, 200, { ok: false, hit: false, signals: [], error: e?.message || "Falha ao ler o site" });
      }
      return true;
    }

    if (p === "/api/dev/publish-client" && req.method === "POST") {
      const body = await readJson(req, 2_000_000);
      const preview = body.preview || body;
      if (!preview?.slug || !preview?.name) return send(res, 400, { error: "Prévia inválida." }), true;
      try {
        const result = await publishClientSite(preview);
        send(res, result.ok ? 200 : 400, result);
      } catch (e) {
        send(res, 500, { ok: false, error: e?.message || "Falha no deploy." });
      }
      return true;
    }

    if (p === "/api/previews" && req.method === "POST") {
      const body = await readJson(req, 2_000_000);
      const list = Array.isArray(body.previews) ? body.previews : body.preview ? [body.preview] : [body];
      const slugs = [];
      for (const preview of list.slice(0, 50)) slugs.push(savePreview(preview).slug);
      send(res, 200, { ok: true, slugs });
      return true;
    }

    if (p.startsWith("/api/previews/") && req.method === "GET") {
      const slug = decodeURIComponent(p.slice("/api/previews/".length).split("/")[0] || "");
      const preview = loadPreview(slug);
      if (!preview) return send(res, 404, { error: "Prévia não encontrada." }), true;
      send(res, 200, { preview });
      return true;
    }

    if (p.startsWith("/api/evolution/") || p === "/api/evolution") {
      // A chave global da Evolution fica no servidor: só quem está logado usa este repasse.
      if (!readToken(sessionToken(req))) return send(res, 401, { error: "Faça login." }), true;
      const rest = p.slice("/api/evolution".length) || "/";
      const hasBody = req.method !== "GET" && req.method !== "HEAD";
      const payload = hasBody ? await readJson(req) : {};
      if (remoteEvolutionUrl() && !evolutionApiKey(req)) {
        return send(res, 500, { error: "EVOLUTION_KEY não configurada no servidor (Render)." }), true;
      }
      const remote = remoteEvolutionUrl();
      if (!remote) {
        await handleEvolutionLocal(rest, req.method, payload, send, res);
        return true;
      }
      const key = evolutionApiKey(req);
      const target = `${remote}${rest}${url.search}`;
      const r = await fetch(target, {
        method: req.method,
        headers: {
          apikey: key,
          "Content-Type": "application/json",
        },
        body: hasBody ? JSON.stringify(payload) : undefined,
        signal: AbortSignal.timeout(25_000),
      });
      const text = await r.text();
      res.statusCode = r.status;
      res.setHeader("Content-Type", r.headers.get("content-type") || "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(text);
      return true;
    }

    if (p === "/api/auth/login" && req.method === "POST") {
      const { username, password } = await readJson(req);
      let user = null;
      if (checkLogin(username, password)) {
        user = adminProfile();
      } else {
        if (!(await dbReady())) {
          return send(res, 503, { error: "Supabase indisponível. Verifique a conexão DATABASE_URL do servidor." }), true;
        }
        const account = await workspaceAccountByLogin(String(username || "").trim());
        if (account && await workspacePasswordMatches(password, account.password_hash)) user = account.profile;
      }
      if (!user) return send(res, 401, { error: "Usuário ou senha inválidos." }), true;
      const token = issueToken(Date.now(), { userId: user.id, organizationId: user.organizationId });
      send(res, 200, { token, user });
      return true;
    }

    if (p === "/api/auth/register" && req.method === "POST") {
      if (!(await dbReady())) {
        return send(res, 503, { error: "Supabase indisponível. Verifique a conexão DATABASE_URL do servidor." }), true;
      }
      const input = await readJson(req, 32_000);
      const name = String(input.name || "").trim();
      const companyName = String(input.company || "").trim();
      const email = String(input.email || "").trim().toLowerCase();
      const password = String(input.password || "");
      if (name.length < 2 || companyName.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return send(res, 400, { error: "Informe nome, empresa e um e-mail válido." }), true;
      }
      if (password.length < 8) {
        return send(res, 400, { error: "A senha precisa ter pelo menos 8 caracteres." }), true;
      }

      const id = `u_${randomUUID().replace(/-/g, "")}`;
      const organizationId = `org_${randomUUID().replace(/-/g, "")}`;
      const now = new Date().toISOString();
      const user = {
        id,
        organizationId,
        name,
        email,
        username: email,
        role: "owner",
        title: "Dona da conta",
        color: "chart-3",
        status: "ativo",
        workHours: "09:00–18:00",
        goal: 15_000,
        achieved: 0,
        lastSeen: now,
        createdAt: now,
        kind: "customer",
        planId: "trial",
        trialEndsAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        dailyProspectUsed: 0,
        dailyProspectDate: now.slice(0, 10),
        companyName,
        phone: String(input.phone || ""),
        evolutionInstance: `h${id.slice(2, 26)}`,
      };

      try {
        const savedUser = await createWorkspaceAccount({
          user,
          passwordHash: await hashWorkspacePassword(password),
        });
        const token = issueToken(Date.now(), { userId: id, organizationId });
        send(res, 201, { token, user: savedUser || user });
      } catch (error) {
        if (error?.code === "23505") {
          return send(res, 409, { error: "Já existe uma conta com este e-mail." }), true;
        }
        if (error?.code === "42P01") {
          return send(res, 503, { error: "A tabela public.app_accounts não existe. Execute a migration 006 no Supabase." }), true;
        }
        throw error;
      }
      return true;
    }

    // Todas as outras rotas exigem o token do login.
    if (!verifyToken(bearer(req))) {
      send(res, 401, { error: "Faça login para usar o servidor." });
      return true;
    }

    const route = `${req.method} ${p}`;
    switch (route) {
      case "GET /api/auth/me":
        {
          const session = readToken(bearer(req));
          const user = session?.u === "u1" || session?.u === adminUser()
            ? adminProfile()
            : session?.u
              ? await workspaceAccountById(session.u)
              : null;
          if (!user) return send(res, 401, { error: "Sessão inválida ou conta não encontrada." }), true;
          send(res, 200, { user });
        }
        return true;
      case "GET /api/whatsapp/status":
        send(res, 200, (await whatsapp()).getStatus());
        return true;
      case "POST /api/whatsapp/connect":
        send(res, 200, await (await whatsapp()).connect());
        return true;
      case "POST /api/whatsapp/logout":
        send(res, 200, await (await whatsapp()).logout());
        return true;
      case "GET /api/whatsapp/messages":
        send(res, 200, { messages: (await whatsapp()).getMessages() });
        return true;
      case "POST /api/whatsapp/send": {
        const { to, text } = await readJson(req);
        if (!to || !text) return send(res, 400, { error: "Informe o número e a mensagem." }), true;
        send(res, 200, await (await whatsapp()).sendText(to, text));
        return true;
      }
      case "POST /api/whatsapp/auto-reply": {
        const { enabled } = await readJson(req);
        send(res, 200, { autoReply: (await whatsapp()).setAutoReply(enabled) });
        return true;
      }
      case "POST /api/ai/chat": {
        const body = await readJson(req);
        if (!Array.isArray(body.messages)) return send(res, 400, { error: "Campo messages é obrigatório." }), true;
        const { messages, tools, tool_choice, temperature, max_tokens } = body;
        send(res, 200, await chatCompletion({ messages, tools, tool_choice, temperature, max_tokens }));
        return true;
      }
      default:
        send(res, 404, { error: "Rota não encontrada." });
        return true;
    }
  } catch (e) {
    console.error("[Helena API]", e);
    send(res, e?.status || 500, { error: e?.message || "Erro interno." });
    return true;
  }
}
