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
  const pal = p.palette || { bg: "#1a1410", fg: "#f7f1e8", accent: "#e8b86d" };
  const wa = String(p.phone || "").replace(/\D/g, "");
  const waLink = `https://wa.me/${wa.startsWith("55") ? wa : `55${wa}`}`;
  const menu = withDishImages(p.menu);
  const services = Array.isArray(p.services) ? p.services : [];
  const photos = padPhotos(p.photos);
  const reviews = Array.isArray(p.reviews) ? p.reviews : [];
  const featured = menu.flatMap((c) => c.items || []).filter((it) => it.image).slice(0, 4);
  const hasMenu = menu.length > 0;
  const menuHtml = menu
    .map(
      (cat) => `
      <div class="cat">
        <h3>${esc(cat.category)}</h3>
        <div class="menu-grid">
        ${(cat.items || [])
          .map(
            (item) => `<article class="dish">
              ${item.image ? `<img src="${esc(item.image)}" alt="" loading="lazy" />` : ""}
              <div class="dish-body">
                <div class="dish-top"><strong>${esc(item.name)}</strong><span class="price">${esc(money(item.price))}</span></div>
                <p>${esc(item.description)}</p>
              </div>
            </article>`,
          )
          .join("")}
        </div>
      </div>`,
    )
    .join("");
  const featuredHtml = featured.length
    ? `<section class="sec"><p class="kicker">Assinatura visual · Sofia</p><h2>${hasMenu ? "Destaques do cardápio" : "Destaques"}</h2><div class="feat">${featured
        .map(
          (item) => `<article><img src="${esc(item.image)}" alt="" loading="lazy" /><div><strong>${esc(item.name)}</strong><span class="price">${esc(money(item.price))}</span></div></article>`,
        )
        .join("")}</div></section>`
    : "";
  const servicesHtml = services
    .map((s) => `<article class="svc"><strong>${esc(s.name)}</strong><p>${esc(s.description)}</p></article>`)
    .join("");
  const photosHtml = photos
    .slice(1)
    .map((src, i) => `<img class="${i === 0 ? "wide" : ""}" src="${esc(src)}" alt="" loading="lazy" />`)
    .join("");
  const reviewsHtml = reviews
    .map((r) => `<blockquote><div class="rev-head"><strong>${esc(r.author)}</strong><span>${esc(String(r.rating))} ★</span></div><p>${esc(r.text)}</p></blockquote>`)
    .join("");

  const logo = p.logoUrl
    ? `<img class="logo" src="${esc(p.logoUrl)}" alt="${esc(p.name)}" width="80" height="80" />`
    : "";
  const ratingLine = p.rating
    ? `<p class="rating"><span class="stars">${"★".repeat(Math.min(5, Math.round(Number(p.rating) || 0)))}</span> ${esc(String(p.rating))} · ${esc(String(p.reviewCount || 0))} avaliações</p>`
    : "";

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="description" content="${esc(p.tagline || p.name)}" />
  <title>${esc(p.name)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    :root{--bg:${esc(pal.bg)};--fg:${esc(pal.fg)};--acc:${esc(pal.accent)};--line:color-mix(in srgb, var(--fg) 14%, transparent);--soft:color-mix(in srgb, var(--fg) 6%, transparent)}
    *{box-sizing:border-box}
    html{scroll-behavior:smooth}
    body{margin:0;font-family:Manrope,system-ui,sans-serif;background:var(--bg);color:var(--fg);line-height:1.55;-webkit-font-smoothing:antialiased}
    body::before{content:"";position:fixed;inset:0;pointer-events:none;opacity:.35;background:
      radial-gradient(ellipse 80% 50% at 10% -10%, color-mix(in srgb, var(--acc) 28%, transparent), transparent 55%),
      radial-gradient(ellipse 60% 40% at 100% 0%, color-mix(in srgb, var(--fg) 8%, transparent), transparent 50%),
      repeating-linear-gradient(0deg, transparent, transparent 3px, color-mix(in srgb, var(--fg) 2%, transparent) 3px, color-mix(in srgb, var(--fg) 2%, transparent) 4px);
      z-index:0}
    .shell{position:relative;z-index:1}
    header{position:relative;min-height:min(78vh,640px);padding:4.5rem 1.25rem 3.5rem;overflow:hidden;display:flex;align-items:flex-end}
    header .cover{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transform:scale(1.04);filter:saturate(1.05) contrast(1.05);animation:ken 18s ease-in-out infinite alternate}
    header .veil{position:absolute;inset:0;background:linear-gradient(180deg, color-mix(in srgb, var(--bg) 25%, transparent) 0%, color-mix(in srgb, var(--bg) 72%, transparent) 45%, var(--bg) 100%)}
    .hero{position:relative;max-width:44rem;margin:0 auto;width:100%}
    .logo{border-radius:1.15rem;border:2px solid color-mix(in srgb, var(--fg) 22%, transparent);margin-bottom:1rem;object-fit:cover;box-shadow:0 12px 40px color-mix(in srgb, #000 35%, transparent);animation:rise .7s ease both}
    .eyebrow{font-size:.72rem;letter-spacing:.22em;text-transform:uppercase;opacity:.78;margin:0;animation:rise .75s .05s ease both}
    h1{font-family:Fraunces,Georgia,serif;font-weight:700;font-size:clamp(2.4rem,6vw,3.6rem);line-height:1.05;margin:.55rem 0 .4rem;letter-spacing:-.02em;animation:rise .8s .08s ease both}
    .tag{max-width:34rem;font-size:1.05rem;opacity:.92;margin:.75rem 0 0;animation:rise .85s .12s ease both}
    .rating{font-size:.92rem;margin:.9rem 0 0;opacity:.88;animation:rise .9s .15s ease both}
    .stars{color:var(--acc);letter-spacing:.08em}
    .cta{display:flex;flex-wrap:wrap;gap:.65rem;margin-top:1.6rem;animation:rise .95s .18s ease both}
    a.btn{display:inline-flex;align-items:center;justify-content:center;padding:.85rem 1.25rem;border-radius:.9rem;background:var(--acc);color:var(--bg);text-decoration:none;font-weight:700;font-size:.92rem;box-shadow:0 10px 30px color-mix(in srgb, var(--acc) 28%, transparent);transition:transform .2s ease, filter .2s ease}
    a.btn:hover{transform:translateY(-1px);filter:brightness(1.05)}
    a.ghost{background:transparent;color:var(--fg);border:1px solid var(--line);box-shadow:none;font-weight:600}
    .wrap{max-width:52rem;margin:0 auto;padding:0 1.25rem 6rem}
    .sec{margin-top:3.25rem}
    .kicker{margin:0 0 .35rem;font-size:.7rem;letter-spacing:.18em;text-transform:uppercase;color:var(--acc);opacity:.9}
    h2{font-family:Fraunces,Georgia,serif;font-size:clamp(1.45rem,3vw,1.85rem);font-weight:600;margin:0 0 1.1rem;letter-spacing:-.01em}
    .about{font-size:1.02rem;opacity:.9;max-width:40rem}
    .meta{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;margin-top:1.5rem}
    .meta div{padding:1rem 1.05rem;border:1px solid var(--line);border-radius:1rem;background:var(--soft)}
    .meta span{display:block;font-size:.72rem;letter-spacing:.12em;text-transform:uppercase;opacity:.55;margin-bottom:.35rem}
    .grid{display:grid;grid-template-columns:1.4fr 1fr 1fr;grid-auto-rows:9rem;gap:.7rem}
    .grid img{width:100%;height:100%;object-fit:cover;border-radius:1rem;border:1px solid var(--line)}
    .grid img.wide{grid-row:span 2;height:100%;min-height:18.7rem}
    .feat{display:flex;gap:.85rem;overflow-x:auto;padding-bottom:.35rem;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch}
    .feat article{flex:0 0 12.5rem;scroll-snap-align:start;border:1px solid var(--line);border-radius:1.1rem;overflow:hidden;background:var(--soft)}
    .feat img{width:100%;height:9rem;object-fit:cover;display:block}
    .feat div{padding:.8rem .85rem}
    .feat strong{display:block;font-size:.92rem;margin-bottom:.3rem}
    .cat{margin-top:2rem}
    .cat h3{font-family:Fraunces,Georgia,serif;color:var(--acc);font-size:1.35rem;margin:0 0 1rem;font-weight:600}
    .menu-grid{display:grid;grid-template-columns:1fr 1fr;gap:.85rem}
    .dish{display:flex;gap:.85rem;padding:.65rem;border:1px solid var(--line);border-radius:1.15rem;background:var(--soft);transition:border-color .2s ease, transform .2s ease}
    .dish:hover{border-color:color-mix(in srgb, var(--acc) 45%, var(--line));transform:translateY(-1px)}
    .dish img{width:7rem;height:7rem;object-fit:cover;border-radius:.9rem;flex-shrink:0}
    .dish-body{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:space-between;padding:.15rem 0}
    .dish-top{display:flex;justify-content:space-between;gap:.75rem;align-items:flex-start}
    .dish-top strong{font-size:.98rem;line-height:1.25}
    .dish p{margin:.35rem 0 0;font-size:.84rem;opacity:.72}
    .price{color:var(--acc);font-weight:700;font-size:.9rem;white-space:nowrap}
    .svc-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:.85rem}
    .svc{padding:1.1rem;border:1px solid var(--line);border-radius:1rem;background:var(--soft)}
    .svc p{margin:.45rem 0 0;font-size:.88rem;opacity:.72}
    blockquote{margin:0 0 .85rem;padding:1rem 1.1rem;border-left:3px solid var(--acc);border-radius:0 .85rem .85rem 0;background:var(--soft)}
    .rev-head{display:flex;justify-content:space-between;gap:.75rem;margin-bottom:.4rem;font-size:.9rem}
    .rev-head span{color:var(--acc)}
    blockquote p{margin:0;opacity:.86;font-size:.92rem}
    footer{margin-top:3.5rem;padding-top:1.5rem;border-top:1px solid var(--line);text-align:center}
    footer .credit{font-size:.78rem;opacity:.65;margin:0}
    footer .fine{font-size:.7rem;opacity:.45;margin:.55rem 0 0}
    .dock{display:none}
    @keyframes ken{from{transform:scale(1.04) translateY(0)}to{transform:scale(1.1) translateY(-1.5%)}}
    @keyframes rise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
    @media(max-width:720px){
      .menu-grid,.svc-grid,.meta{grid-template-columns:1fr}
      .grid{grid-template-columns:1fr 1fr}
      .grid img.wide{grid-row:span 1;min-height:12rem}
      .dish img{width:5.5rem;height:5.5rem}
      .dock{display:flex;position:fixed;left:0;right:0;bottom:0;gap:.55rem;padding:.75rem 1rem calc(.75rem + env(safe-area-inset-bottom));background:color-mix(in srgb, var(--bg) 92%, transparent);backdrop-filter:blur(12px);border-top:1px solid var(--line);z-index:20}
      .dock a{flex:1;text-align:center}
      .wrap{padding-bottom:6.5rem}
      .cta .btn:not(.ghost){display:none}
    }
  </style>
</head>
<body>
  <div class="shell">
  <header>
    ${photos[0] ? `<img class="cover" src="${esc(photos[0])}" alt="" />` : ""}
    <div class="veil"></div>
    <div class="hero">
      ${logo}
      <p class="eyebrow">${esc(p.segment)} · ${esc(p.city)}</p>
      <h1>${esc(p.name)}</h1>
      ${ratingLine}
      <p class="tag">${esc(p.tagline)}</p>
      <div class="cta">
        <a class="btn" href="${esc(waLink)}">${hasMenu ? "Pedir no WhatsApp" : "Falar no WhatsApp"}</a>
        <a class="btn ghost" href="${esc(p.mapsUrl)}" target="_blank" rel="noreferrer">Ver no mapa</a>
      </div>
    </div>
  </header>
  <div class="wrap">
    ${photosHtml ? `<section class="sec"><p class="kicker">Galeria</p><h2>Ambiente &amp; ${hasMenu ? "pratos" : "espaço"}</h2><div class="grid">${photosHtml}</div></section>` : ""}
    <section class="sec">
      <p class="kicker">Quem somos</p>
      <h2>Sobre</h2>
      <p class="about">${esc(p.about)}</p>
      <div class="meta">
        <div><span>Endereço</span>${esc(p.address)}</div>
        <div><span>Horário</span>${esc(p.hours)}</div>
        <div><span>Contato</span>${esc(p.phone)}</div>
      </div>
    </section>
    ${featuredHtml}
    ${menuHtml ? `<section class="sec"><p class="kicker">Cardápio digital</p><h2>Cardápio online</h2>${menuHtml}</section>` : ""}
    ${servicesHtml ? `<section class="sec"><p class="kicker">O que fazemos</p><h2>Serviços</h2><div class="svc-grid">${servicesHtml}</div></section>` : ""}
    ${reviewsHtml ? `<section class="sec"><p class="kicker">Prova social</p><h2>Avaliações no mapa</h2>${reviewsHtml}</section>` : ""}
    <footer>
      <p class="credit">Arte · Sofia Almeida · Designer Gráfico · Time Dev Info Tech</p>
      <p class="fine">Prévia hospedada na Vercel a partir de dados públicos do mapa. Não é o site oficial até o proprietário aprovar.</p>
    </footer>
  </div>
  <div class="dock">
    <a class="btn" href="${esc(waLink)}">${hasMenu ? "Pedir no WhatsApp" : "WhatsApp"}</a>
    <a class="btn ghost" href="${esc(p.mapsUrl)}" target="_blank" rel="noreferrer">Mapa</a>
  </div>
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
    `# ${preview.name}\n\nPrévia · Sofia Almeida (Designer Gráfico) + Time Dev Helena · hospedada na Vercel.\n`,
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
