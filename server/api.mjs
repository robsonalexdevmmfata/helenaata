// Rotas do servidor HELENA AI. Usado em dois lugares, sempre na mesma porta do site:
//  - desenvolvimento: plugin do Vite (vite.config.ts)
//  - produção / Render: server/index.mjs
import { checkLogin, issueToken, verifyToken } from "./auth.mjs";
import { aiProvider, chatCompletion } from "./ai.mjs";
import { evolutionApiKey, handleEvolutionLocal, remoteEvolutionUrl } from "./evolution-bridge.mjs";
import { loadPreview, savePreview } from "./previews.mjs";

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

function cors(req, res) {
  const allowed = process.env.CORS_ORIGIN || "*";
  const origin = req.headers.origin || "";
  if (allowed === "*") {
    res.setHeader("Access-Control-Allow-Origin", "*");
  } else {
    const list = allowed.split(",").map((s) => s.trim()).filter(Boolean);
    const match = list.includes(origin) ? origin : list[0];
    if (match) res.setHeader("Access-Control-Allow-Origin", match);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, apikey");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
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
    const wa = await whatsapp();
    console.log("[Helena] Baileys carregado.");
    wa.resumeIfSaved();
    console.log("[Helena] WhatsApp: sessão salva será retomada se existir creds.json no disco.");
  } catch (e) {
    console.warn("[Helena] WhatsApp indisponível no boot (o site sobe mesmo assim):", e?.message || e);
  }
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
      });
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

    if (p === "/api/whatsapp/status" && req.method === "GET") {
      send(res, 200, (await whatsapp()).getStatus());
      return true;
    }
    if (p === "/api/whatsapp/connect" && req.method === "POST") {
      send(res, 200, await (await whatsapp()).connect());
      return true;
    }
    if (p === "/api/whatsapp/logout" && req.method === "POST") {
      send(res, 200, await (await whatsapp()).logout());
      return true;
    }
    if (p === "/api/whatsapp/messages" && req.method === "GET") {
      send(res, 200, { messages: (await whatsapp()).getMessages() });
      return true;
    }
    if (p === "/api/whatsapp/send" && req.method === "POST") {
      const { to, text } = await readJson(req);
      if (!to || !text) return send(res, 400, { error: "Informe o número e a mensagem." }), true;
      send(res, 200, await (await whatsapp()).sendText(to, text));
      return true;
    }
    if (p === "/api/whatsapp/auto-reply" && req.method === "POST") {
      const { enabled } = await readJson(req);
      send(res, 200, { autoReply: (await whatsapp()).setAutoReply(enabled) });
      return true;
    }

    if (p.startsWith("/api/evolution/") || p === "/api/evolution") {
      const rest = p.slice("/api/evolution".length) || "/";
      const hasBody = req.method !== "GET" && req.method !== "HEAD";
      const payload = hasBody ? await readJson(req) : {};
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
      if (!checkLogin(username, password)) return send(res, 401, { error: "Usuário ou senha inválidos." }), true;
      send(res, 200, { token: issueToken() });
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
        send(res, 200, { ok: true });
        return true;
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
