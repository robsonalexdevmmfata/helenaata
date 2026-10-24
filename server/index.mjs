// Servidor de produção (Render): site + API na MESMA porta (padrão 8081).
// Antes rode: npm run build:render
import http from "node:http";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { handleApi, startBackground } from "./api.mjs";

const PORT = Number(process.env.PORT || 8081);
const HOST = process.env.HOST || "0.0.0.0";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const siteEntry = path.join(root, ".output", "server", "index.mjs");

let site = null;
if (existsSync(siteEntry)) {
  site = (await import(pathToFileURL(siteEntry).href)).middleware;
} else {
  console.warn("[Helena] Site não compilado. Rode `npm run build:render` antes de `npm start`.");
}

const server = http.createServer(async (req, res) => {
  try {
    if (await handleApi(req, res)) return;
    if (site) return site(req, res);
    res.statusCode = 503;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Site ainda não compilado. Rode npm run build:render.");
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.statusCode = 500;
    res.end("Erro interno");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[Helena] Site e servidor rodando em http://localhost:${PORT}`);
  startBackground();
});
