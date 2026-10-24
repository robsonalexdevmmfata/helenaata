// Rotas do servidor HELENA AI. Usado em dois lugares, sempre na mesma porta do site:
//  - desenvolvimento: plugin do Vite (vite.config.ts)
//  - produção / Render: server/index.mjs
import { checkLogin, issueToken, verifyToken } from "./auth.mjs";
import { aiProvider, chatCompletion } from "./ai.mjs";

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
  res.setHeader("Access-Control-Allow-Origin", allowed === "*" ? "*" : allowed);
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
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
    (await whatsapp()).resumeIfSaved();
  } catch (e) {
    console.warn("[Helena] WhatsApp indisponível:", e?.message || e);
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
      });
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
