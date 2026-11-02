/**
 * Ponte Evolution API.
 * - Se EVOLUTION_URL apontar para um host real (VPS), o proxy encaminha.
 * - Sem VPS: o mesmo Render responde no formato da Evolution usando Baileys.
 */
import { getStatus, connect, sendText, logout } from "./whatsapp.mjs";

export function remoteEvolutionUrl() {
  const raw = String(process.env.EVOLUTION_URL || process.env.VITE_EVOLUTION_URL || "").trim();
  if (!raw) return "";
  try {
    const host = new URL(raw).hostname;
    if (!host || host === "localhost" || host === "127.0.0.1") return "";
    return raw.replace(/\/$/, "");
  } catch {
    return "";
  }
}

export function evolutionApiKey(_req) {
  return process.env.EVOLUTION_KEY || "";
}

function stateFromBaileys(status) {
  if (status === "connected") return "open";
  if (status === "awaiting_qr" || status === "connecting") return "connecting";
  return "close";
}

/** Responde rotas Evolution com o WhatsApp do próprio Render. Retorna true se atendeu. */
export async function handleEvolutionLocal(pathname, method, body, send, res) {
  const sendMatch = pathname.match(/^\/message\/sendText\/([^/]+)$/);
  if (sendMatch && method === "POST") {
    const number = body?.number || body?.phone || "";
    const text = body?.text || body?.textMessage?.text || "";
    if (!number || !text) return send(res, 400, { error: "Informe number e text." }), true;
    try {
      const result = await sendText(number, text, "helena");
      return send(res, 200, { key: { id: `baileys-${Date.now()}`, remoteJid: result.to }, message: { conversation: text } }), true;
    } catch (e) {
      return send(res, e.status || 500, { error: e.message || "Falha ao enviar." }), true;
    }
  }

  const stateMatch = pathname.match(/^\/instance\/connectionState\/([^/]+)$/);
  if (stateMatch && method === "GET") {
    const s = getStatus();
    return send(res, 200, {
      instance: {
        instanceName: stateMatch[1],
        state: stateFromBaileys(s.status),
        owner: s.phone || "",
      },
    }), true;
  }

  const fetchMatch = pathname.match(/^\/instance\/fetchInstances/);
  if (fetchMatch && method === "GET") {
    const s = getStatus();
    return send(res, 200, [
      {
        name: process.env.EVOLUTION_INSTANCE || "helena",
        connectionStatus: stateFromBaileys(s.status),
        owner: s.phone || "",
        qrcode: s.qrCode ? { base64: s.qrCode } : undefined,
      },
    ]), true;
  }

  const connectMatch = pathname.match(/^\/instance\/connect\/([^/]+)$/);
  if (connectMatch && (method === "GET" || method === "POST")) {
    const s = await connect();
    return send(res, 200, {
      instance: { instanceName: connectMatch[1], state: stateFromBaileys(s.status) },
      qrcode: s.qrCode ? { base64: s.qrCode } : undefined,
    }), true;
  }

  const logoutMatch = pathname.match(/^\/instance\/logout\/([^/]+)$/);
  if (logoutMatch && method === "DELETE") {
    return send(res, 200, await logout()), true;
  }

  if (pathname.startsWith("/webhook/") && (method === "GET" || method === "POST")) {
    return send(res, 200, { webhook: { enabled: false, url: "", events: [] } }), true;
  }

  return send(res, 200, {
    status: "baileys-bridge",
    message: "Evolution API ainda não está na VPS. Este Render usa o WhatsApp nativo (QR em Integrações). Quando tiver VPS, defina EVOLUTION_URL.",
  }), true;
}
