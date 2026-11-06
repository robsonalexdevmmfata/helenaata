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

const FALLBACK_GALLERY = [
  "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&q=80",
  "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1200&q=80",
  "https://images.unsplash.com/photo-1559339352-11d035aa65de?w=1200&q=80",
  "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=1200&q=80",
  "https://images.unsplash.com/photo-1476224203421-9ac39bcb3327?w=1200&q=80",
  "https://images.unsplash.com/photo-1552566626-52f8b828add9?w=1200&q=80",
  "https://images.unsplash.com/photo-1615141982883-c7ad0e69fd62?w=1200&q=80",
  "https://images.unsplash.com/photo-1551248429-40975aa4de74?w=1200&q=80",
];
const FALLBACK_DISH = [
  "https://images.unsplash.com/photo-1541014741259-de529411b96a?w=800&q=80",
  "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&q=80",
  "https://images.unsplash.com/photo-1625944230946-1d2b0cdd4f4b?w=800&q=80",
  "https://images.unsplash.com/photo-1615141982883-c7ad0e69fd62?w=800&q=80",
  "https://images.unsplash.com/photo-1546173159-315724a31696?w=800&q=80",
  "https://images.unsplash.com/photo-1488477181946-6428a0291777?w=800&q=80",
];

function padPhotos(photos) {
  const out = [...(Array.isArray(photos) ? photos : [])];
  for (const src of FALLBACK_GALLERY) {
    if (out.length >= 8) break;
    if (!out.includes(src)) out.push(src);
  }
  return out;
}

function withDishImages(menu) {
  let i = 0;
  return (Array.isArray(menu) ? menu : []).map((cat) => ({
    ...cat,
    items: (cat.items || []).map((item) => ({
      ...item,
      image: item.image || FALLBACK_DISH[i++ % FALLBACK_DISH.length],
    })),
  }));
}

export function previewToHtml(p) {
  const pal = p.palette || { bg: "#111", fg: "#f5f0e8", accent: "#c4a574" };
  const wa = String(p.phone || "").replace(/\D/g, "");
  const waLink = `https://wa.me/${wa.startsWith("55") ? wa : `55${wa}`}`;
  const menu = withDishImages(p.menu);
  const services = Array.isArray(p.services) ? p.services : [];
  const photos = padPhotos(p.photos);
  const reviews = Array.isArray(p.reviews) ? p.reviews : [];
  const featured = menu.flatMap((c) => c.items || []).filter((it) => it.image).slice(0, 4);
  const menuHtml = menu
    .map(
      (cat) => `
      <h3 style="color:${esc(pal.accent)};font-family:Georgia,serif;font-size:1.35rem;margin:1.75rem 0 .75rem">${esc(cat.category)}</h3>
      <div class="menu-grid">
      ${(cat.items || [])
        .map(
          (item) => `<article class="dish">
            ${item.image ? `<img src="${esc(item.image)}" alt="" />` : ""}
            <div><strong>${esc(item.name)}</strong><p>${esc(item.description)}</p>
            <span class="price">${esc(money(item.price))}</span></div>
          </article>`,
        )
        .join("")}
      </div>`,
    )
    .join("");
  const featuredHtml = featured.length
    ? `<h2>Destaques do cardápio</h2><div class="feat">${featured
        .map(
          (item) => `<article><img src="${esc(item.image)}" alt="" /><div><strong>${esc(item.name)}</strong><span class="price">${esc(money(item.price))}</span></div></article>`,
        )
        .join("")}</div>`
    : "";
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

  const logo = p.logoUrl
    ? `<img class="logo" src="${esc(p.logoUrl)}" alt="${esc(p.name)}" width="72" height="72" />`
    : "";
  const ratingLine = p.rating
    ? `<p class="rating">${esc(String(p.rating))} ★ · ${esc(String(p.reviewCount || 0))} avaliações no mapa</p>`
    : "";

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(p.name)}</title>
  <style>
    body{margin:0;font-family:Georgia,serif;background:${esc(pal.bg)};color:${esc(pal.fg)};}
    header{position:relative;min-height:48vh;padding:4rem 1.25rem 3rem;overflow:hidden}
    header img.cover{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.4}
    .logo{position:relative;border-radius:1rem;border:2px solid #fff4;margin-bottom:.75rem;object-fit:cover}
    .wrap{position:relative;max-width:48rem;margin:0 auto;padding:0 1.25rem 5rem}
    a.btn{display:inline-block;margin:.4rem .4rem 0 0;padding:.7rem 1.1rem;border-radius:999px;background:${esc(pal.accent)};color:${esc(pal.bg)};text-decoration:none;font-family:system-ui,sans-serif;font-size:.9rem}
    a.ghost{background:transparent;color:${esc(pal.fg)};border:1px solid #fff3}
    .row{display:flex;justify-content:space-between;gap:1rem;padding:.75rem 0;border-bottom:1px solid #fff2}
    .grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:.6rem;margin:1.25rem 0 2rem}
    .grid img{width:100%;height:9.5rem;object-fit:cover;border-radius:.85rem}
    .grid img:first-child{grid-column:span 2;height:14rem}
    .menu-grid{display:grid;grid-template-columns:1fr 1fr;gap:.75rem}
    .dish{display:flex;gap:.75rem;padding:.55rem;border:1px solid #fff2;border-radius:1rem;background:#ffffff08}
    .dish img{width:6.5rem;height:6.5rem;object-fit:cover;border-radius:.75rem;flex-shrink:0}
    .dish p{margin:.25rem 0 .5rem;font-size:.85rem;opacity:.75;font-family:system-ui,sans-serif}
    .price{color:${esc(pal.accent)};font-family:system-ui,sans-serif;font-size:.9rem}
    .feat{display:flex;gap:.75rem;overflow-x:auto;padding-bottom:.5rem;margin:1rem 0 1.5rem}
    .feat article{flex:0 0 11rem;border:1px solid #fff2;border-radius:1rem;overflow:hidden;background:#ffffff08}
    .feat img{width:100%;height:8rem;object-fit:cover;display:block}
    .feat div{padding:.65rem .75rem}
    .feat strong{display:block;font-size:.9rem;margin-bottom:.25rem}
    h1{font-size:2.2rem;margin:.4rem 0}
    h2{font-size:.75rem;letter-spacing:.16em;text-transform:uppercase;opacity:.7;margin:2rem 0 .75rem}
    p,dd{opacity:.9;line-height:1.5}
    .rating{font-family:system-ui,sans-serif;font-size:.9rem;opacity:.85}
    blockquote{margin:1rem 0;padding-left:1rem;border-left:3px solid ${esc(pal.accent)};opacity:.9}
    @media(max-width:640px){
      .menu-grid,.grid{grid-template-columns:1fr}
      .grid img:first-child{grid-column:span 1;height:11rem}
      .dish img{width:5.25rem;height:5.25rem}
    }
  </style>
</head>
<body>
  <header>
    ${photos[0] ? `<img class="cover" src="${esc(photos[0])}" alt="" />` : ""}
    <div class="wrap">
      ${logo}
      <p>${esc(p.segment)} · ${esc(p.city)}</p>
      <h1>${esc(p.name)}</h1>
      ${ratingLine}
      <p>${esc(p.tagline)}</p>
      <a class="btn" href="${esc(waLink)}">Pedir no WhatsApp</a>
      <a class="btn ghost" href="${esc(p.mapsUrl)}" target="_blank" rel="noreferrer">Ver no mapa</a>
    </div>
  </header>
  <div class="wrap">
    ${photosHtml ? `<h2>Ambiente &amp; pratos</h2><div class="grid">${photosHtml}</div>` : ""}
    <h2>Sobre</h2>
    <p>${esc(p.about)}</p>
    <p>${esc(p.address)} · ${esc(p.hours)} · ${esc(p.phone)}</p>
    ${featuredHtml}
    ${menuHtml ? `<h2>Cardápio online</h2>${menuHtml}` : ""}
    ${servicesHtml ? `<h2>Serviços</h2>${servicesHtml}` : ""}
    ${reviewsHtml ? `<h2>Avaliações (Google Maps)</h2>${reviewsHtml}` : ""}
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
  if (!process.env.VERCEL_TOKEN) {
    return {
      ok: false,
      error: "VERCEL_TOKEN ausente no Render (Environment). Não vai no GitHub — o servidor é quem publica.",
    };
  }
  const html = previewToHtml(preview);
  let githubUrl = "";
  let githubError = "";
  if (process.env.GITHUB_TOKEN) {
    try {
      githubUrl = await publishGithub(preview, html);
    } catch (err) {
      githubError = err instanceof Error ? err.message : String(err);
    }
  }
  const vercelUrl = await publishVercel(preview, html);
  return {
    ok: true,
    githubUrl,
    vercelUrl,
    githubError: githubError || undefined,
  };
}
