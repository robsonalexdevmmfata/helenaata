// Servidor de produção (Render): site + API na MESMA porta (padrão 8081).
// Antes rode: npm run build:render
import http from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { handleApi, startBackground } from "./api.mjs";
import { log } from "./log.mjs";
import { remoteEvolutionUrl } from "./evolution-bridge.mjs";

const PORT = Number(process.env.PORT || 8081);
const HOST = process.env.HOST || "0.0.0.0";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const siteEntry = path.join(root, ".output", "server", "index.mjs");
const publicDir = path.join(root, ".output", "public");

const MIME = {
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".map": "application/json; charset=utf-8",
};

/** Entrega arquivos de .output/public (JS, CSS, imagens). */
function serveStatic(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url || "/", "http://localhost").pathname);
  } catch {
    return false;
  }
  if (pathname === "/") return false;
  const file = path.join(publicDir, pathname);
  if (!file.startsWith(publicDir + path.sep)) return false;
  let stat;
  try {
    stat = statSync(file);
  } catch {
    return false;
  }
  if (!stat.isFile()) return false;
  res.statusCode = 200;
  res.setHeader("Content-Type", MIME[path.extname(file).toLowerCase()] || "application/octet-stream");
  res.setHeader("Content-Length", stat.size);
  res.setHeader(
    "Cache-Control",
    pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "public, max-age=3600",
  );
  if (req.method === "HEAD") return res.end(), true;
  createReadStream(file).pipe(res);
  return true;
}

let site = null;
if (existsSync(siteEntry)) {
  try {
    site = (await import(pathToFileURL(siteEntry).href)).middleware;
    log("info", "site compilado", { entry: ".output/server/index.mjs" });
  } catch (e) {
    log("error", "falha ao carregar o site compilado", { err: e?.message || String(e) });
  }
} else {
  log("warn", "site não compilado — rode npm run build:render");
}

const server = http.createServer(async (req, res) => {
  try {
    if (await handleApi(req, res)) return;
    if (serveStatic(req, res)) return;
    if (site) return site(req, res);
    res.statusCode = 503;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Site ainda não compilado. Rode npm run build:render.");
  } catch (e) {
    log("error", "request", { path: req.url, err: e?.message || String(e) });
    if (!res.headersSent) {
      res.statusCode = 500;
      res.end("Erro interno");
    }
  }
});

process.on("unhandledRejection", (e) => {
  log("error", "unhandledRejection", { err: e?.message || String(e) });
});
process.on("uncaughtException", (e) => {
  log("error", "uncaughtException", { err: e?.message || String(e) });
});

server.listen(PORT, HOST, () => {
  const evo = remoteEvolutionUrl();
  log("info", "servidor no ar", {
    host: HOST,
    port: PORT,
    groq: Boolean(process.env.GROQ_API_KEY),
    whatsapp: process.env.WHATSAPP_AUTH_DIR || "data/whatsapp-auth",
    evolution: evo || "baileys-no-mesmo-render",
  });
  startBackground().catch((e) => log("warn", "whatsapp background", { err: e?.message || String(e) }));
});
