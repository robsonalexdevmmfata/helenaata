/**
 * Time Dev: repo GitHub público + deploy estático na Vercel.
 * Tokens só em process.env / .env.local — nunca no front.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

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

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(n) {
  return Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function repoName(slug) {
  return `helena-${String(slug || "site").replace(/[^a-z0-9-]/gi, "-")}`.slice(0, 90).toLowerCase();
}

export function previewToHtml(p) {
  const pal = p.palette || { bg: "#111", fg: "#f5f0e8", accent: "#c4a574" };
  const wa = String(p.phone || "").replace(/\D/g, "");
  const waLink = `https://wa.me/${wa.startsWith("55") ? wa : `55${wa}`}`;
  const menu = Array.isArray(p.menu) ? p.menu : [];
  const services = Array.isArray(p.services) ? p.services : [];
  const photos = Array.isArray(p.photos) ? p.photos : [];
  const reviews = Array.isArray(p.reviews) ? p.reviews : [];
  const menuHtml = menu
    .map(
      (cat) => `
      <h3 style="color:${esc(pal.accent)}">${esc(cat.category)}</h3>
      ${(cat.items || [])
        .map(
          (item) => `<div class="row"><div><strong>${esc(item.name)}</strong><p>${esc(item.description)}</p></div><span>${esc(money(item.price))}</span></div>`,
        )
        .join("")}`,
    )
    .join("");
  const servicesHtml = services
    .map((s) => `<div class="row"><div><strong>${esc(s.name)}</strong><p>${esc(s.description)}</p></div></div>`)
    .join("");
  const photosHtml = photos
    .slice(1)
    .map((src) => `<img src="${esc(src)}" alt="" />`)
    .join("");
  const reviewsHtml = reviews
    .map((r) => `<blockquote><strong>${esc(r.author)}</strong> · ${esc(r.rating)} ★<br/>${esc(r.text)}</blockquote>`)
    .join("");

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(p.name)}</title>
  <style>
    body{margin:0;font-family:Georgia,serif;background:${esc(pal.bg)};color:${esc(pal.fg)};}
    header{position:relative;min-height:42vh;padding:4rem 1.25rem 3rem;overflow:hidden}
    header img.cover{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.35}
    .wrap{position:relative;max-width:42rem;margin:0 auto;padding:0 1.25rem 5rem}
    a.btn{display:inline-block;margin:.4rem .4rem 0 0;padding:.7rem 1.1rem;border-radius:999px;background:${esc(pal.accent)};color:${esc(pal.bg)};text-decoration:none;font-family:system-ui,sans-serif;font-size:.9rem}
    a.ghost{background:transparent;color:${esc(pal.fg)};border:1px solid #fff3}
    .row{display:flex;justify-content:space-between;gap:1rem;padding:.75rem 0;border-bottom:1px solid #fff2}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:.75rem}
    .grid img{width:100%;height:10rem;object-fit:cover;border-radius:.75rem}
    h1{font-size:2.2rem;margin:.4rem 0}
    h2{font-size:.75rem;letter-spacing:.16em;text-transform:uppercase;opacity:.7}
    p,dd{opacity:.9;line-height:1.5}
    blockquote{margin:1rem 0;padding-left:1rem;border-left:3px solid ${esc(pal.accent)};opacity:.9}
  </style>
</head>
<body>
  <header>
    ${photos[0] ? `<img class="cover" src="${esc(photos[0])}" alt="" />` : ""}
    <div class="wrap">
      <p>${esc(p.segment)} · ${esc(p.city)}</p>
      <h1>${esc(p.name)}</h1>
      <p>${esc(p.tagline)}</p>
      <a class="btn" href="${esc(waLink)}">Pedir no WhatsApp</a>
      <a class="btn ghost" href="${esc(p.mapsUrl)}" target="_blank" rel="noreferrer">Ver no mapa</a>
    </div>
  </header>
  <div class="wrap">
    <h2>Sobre</h2>
    <p>${esc(p.about)}</p>
    <p>${esc(p.address)} · ${esc(p.hours)} · ${esc(p.phone)}</p>
    ${photosHtml ? `<div class="grid">${photosHtml}</div>` : ""}
    ${menuHtml ? `<h2>Cardápio online</h2>${menuHtml}` : ""}
    ${servicesHtml ? `<h2>Serviços</h2>${servicesHtml}` : ""}
    ${reviewsHtml ? `<h2>Avaliações</h2>${reviewsHtml}` : ""}
  </div>
</body>
</html>`;
}

function ghHeaders() {
  return {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "helena-ai-dev",
  };
}

async function putGithubFile(owner, repo, filePath, content, message) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
  let sha;
  const existing = await fetch(url, { headers: ghHeaders() });
  if (existing.ok) {
    const data = await existing.json();
    sha = data.sha;
  }
  const res = await fetch(url, {
    method: "PUT",
    headers: { ...ghHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      content: Buffer.from(content, "utf8").toString("base64"),
      ...(sha ? { sha } : {}),
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub arquivo ${filePath}: ${res.status} ${err.slice(0, 200)}`);
  }
}

async function publishGithub(preview, html) {
  const me = await fetch("https://api.github.com/user", { headers: ghHeaders() });
  if (!me.ok) throw new Error(`GitHub auth ${me.status}. Confira GITHUB_TOKEN (escopo repo).`);
  const user = await me.json();
  const name = repoName(preview.slug);
  const created = await fetch("https://api.github.com/user/repos", {
    method: "POST",
    headers: { ...ghHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      description: `Prévia Helena · ${preview.name}`,
      private: false,
      auto_init: true,
    }),
  });
  if (!created.ok && created.status !== 422) {
    const err = await created.text();
    throw new Error(`GitHub repo: ${created.status} ${err.slice(0, 220)}`);
  }
  await new Promise((r) => setTimeout(r, 800));
  await putGithubFile(user.login, name, "index.html", html, `site ${preview.name}`);
  await putGithubFile(
    user.login,
    name,
    "README.md",
    `# ${preview.name}\n\nPrévia gerada pelo Time Desenvolvimento IA (Helena).\n`,
    "readme",
  );
  return `https://github.com/${user.login}/${name}`;
}

async function publishVercel(preview, html) {
  const team = process.env.VERCEL_TEAM_ID;
  const q = team ? `?teamId=${encodeURIComponent(team)}` : "";
  const name = repoName(preview.slug);
  const res = await fetch(`https://api.vercel.com/v13/deployments${q}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.VERCEL_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      files: [{ file: "index.html", data: html }],
      projectSettings: { framework: null },
      target: "production",
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || `Vercel ${res.status}`);
  }
  const host = data.alias?.[0] || data.url;
  if (!host) throw new Error("Vercel não devolveu URL.");
  return host.startsWith("http") ? host : `https://${host}`;
}

export async function publishClientSite(preview) {
  loadLocalEnv();
  if (!process.env.GITHUB_TOKEN) return { ok: false, error: "GITHUB_TOKEN ausente no Render/.env.local" };
  if (!process.env.VERCEL_TOKEN) return { ok: false, error: "VERCEL_TOKEN ausente no Render/.env.local" };
  const html = previewToHtml(preview);
  const githubUrl = await publishGithub(preview, html);
  const vercelUrl = await publishVercel(preview, html);
  return { ok: true, githubUrl, vercelUrl };
}
