import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { SitePreview, SitePreviewItem } from "@/lib/types";
import { enrichPreviewMedia, resolvePreviewKind } from "@/lib/dev/presence";
import { resolveNicheProduct, type NicheProduct } from "@/lib/dev/nicheProduct";
import { brl } from "@/lib/format";

function stars(n: number) {
  const full = Math.round(n);
  return "★".repeat(Math.min(5, full)) + "☆".repeat(Math.max(0, 5 - full));
}

function waHref(phone: string, text?: string) {
  const digits = phone.replace(/\D/g, "");
  const wa = digits.startsWith("55") ? digits : `55${digits}`;
  const q = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${wa}${q}`;
}

function usePreviewFonts() {
  useEffect(() => {
    const id = "helena-preview-fonts";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Manrope:wght@400;500;600;700;800&family=Syne:wght@600;700;800&display=swap";
    document.head.appendChild(link);
  }, []);
}

const PREVIEW_CSS = `
@keyframes helena-rise{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:none}}
@keyframes helena-ken{from{transform:scale(1.04)}to{transform:scale(1.12)}}
@keyframes helena-fade{from{opacity:0}to{opacity:1}}
@keyframes helena-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
@keyframes helena-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.04)}}
@keyframes helena-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
@keyframes helena-bag{0%{transform:scale(.92);opacity:.6}100%{transform:scale(1);opacity:1}}
.hp-rise{animation:helena-rise .85s cubic-bezier(.22,1,.36,1) both}
.hp-rise-2{animation:helena-rise .95s .08s cubic-bezier(.22,1,.36,1) both}
.hp-rise-3{animation:helena-rise 1.05s .16s cubic-bezier(.22,1,.36,1) both}
.hp-rise-4{animation:helena-rise 1.1s .24s cubic-bezier(.22,1,.36,1) both}
.hp-ken{animation:helena-ken 22s ease-in-out infinite alternate}
.hp-fade{animation:helena-fade .5s ease both}
.hp-pulse{animation:helena-pulse 2.8s ease-in-out infinite}
.hp-float{animation:helena-float 5s ease-in-out infinite}
.hp-bag{animation:helena-bag .35s cubic-bezier(.22,1,.36,1) both}
.hp-display{font-family:Fraunces,Instrument Serif,Georgia,serif}
.hp-syne{font-family:Syne,Manrope,system-ui,sans-serif}
.hp-body{font-family:Manrope,Geist,system-ui,sans-serif}
.hp-card{transition:transform .3s cubic-bezier(.22,1,.36,1),box-shadow .3s ease}
.hp-card:hover{transform:translateY(-5px)}
.hp-img{transition:transform .75s cubic-bezier(.22,1,.36,1)}
.hp-card:hover .hp-img{transform:scale(1.06)}
.hp-shine{background:linear-gradient(110deg,transparent 20%,rgba(255,255,255,.28) 45%,transparent 70%);background-size:200% 100%;animation:helena-shimmer 3.2s ease-in-out infinite}
.hp-chip{scrollbar-width:none;-ms-overflow-style:none}
.hp-chip::-webkit-scrollbar{display:none}
`;

type CartLine = { key: string; name: string; price: number; qty: number };

function mergeProduct(view: SitePreview, product: NicheProduct): SitePreview {
  const photos = product.photos.length ? [...product.photos] : view.photos;
  const services =
    product.family === "delivery"
      ? undefined
      : product.services.length
        ? product.services.map(({ name, description }) => ({ name, description }))
        : view.services;
  return {
    ...view,
    segment: product.label || view.segment,
    photos,
    services,
    menu: product.family === "delivery" ? view.menu : undefined,
    tagline: product.headlineHook,
    palette: { bg: product.colors.bg, fg: product.colors.fg, accent: product.colors.accent },
  };
}

function PreviewShell({ children }: { children: ReactNode }) {
  usePreviewFonts();
  return (
    <>
      <style>{PREVIEW_CSS}</style>
      <div className="hp-body hp-fade antialiased">{children}</div>
    </>
  );
}

/** Faixa que fala com o DONO — presença de produto, não template. */
function OwnerRibbon({ name, kind }: { name: string; kind: "cardapio" | "site" }) {
  return (
    <div className="relative z-30 border-b border-white/10 bg-[linear-gradient(90deg,#09090b,#18181b_50%,#09090b)] text-white">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 text-[11px] sm:text-xs">
        <p className="font-semibold tracking-tight">
          Experiência digital exclusiva · <span className="bg-gradient-to-r from-amber-200 to-amber-400 bg-clip-text text-transparent">{name}</span>
        </p>
        <p className="hidden shrink-0 font-medium text-zinc-400 sm:block">
          {kind === "cardapio" ? "Cardápio pronto pra receber pedido" : "Site pronto pra receber cliente"}
        </p>
      </div>
    </div>
  );
}

/** Fecha a venda: o dono se imagina com isso no ar. */
function CloseSellBlock({
  name,
  accent,
  accentFg,
  wa,
  light,
  kind,
}: {
  name: string;
  accent: string;
  accentFg: string;
  wa: string;
  light?: boolean;
  kind: "cardapio" | "site";
}) {
  return (
    <section
      className="relative overflow-hidden rounded-[2rem] px-6 py-12 text-center sm:px-12"
      style={{
        background: light
          ? `linear-gradient(160deg, ${accent}22 0%, #fff 42%, ${accent}12 100%)`
          : `linear-gradient(160deg, ${accent}32 0%, #050505 48%, ${accent}16 100%)`,
        border: `1px solid ${accent}50`,
        color: light ? "#1c1917" : "#f8fafc",
      }}
    >
      <div className="hp-shine pointer-events-none absolute inset-0 opacity-35" />
      <div className="hp-float absolute -right-8 -top-8 size-36 rounded-full opacity-30" style={{ background: accent }} />
      <div className="hp-float absolute -bottom-10 -left-6 size-28 rounded-full opacity-20" style={{ background: accent, animationDelay: "1s" }} />
      <p className="hp-syne relative text-[11px] font-bold uppercase tracking-[0.24em] opacity-55">Produto final · {name}</p>
      <h2 className="hp-display relative mt-3 text-[clamp(1.9rem,5.5vw,2.85rem)] font-bold leading-[1.05] tracking-tight">
        {kind === "cardapio"
          ? "Do olhar ao pedido — em segundos"
          : "Do primeiro olhar à mensagem no WhatsApp"}
      </h2>
      <p className="relative mx-auto mt-4 max-w-md text-[15px] leading-relaxed opacity-80">
        Visual de estúdio, prova social do mapa e WhatsApp em um toque. É assim que o cliente decide — e é assim que o dono fecha.
      </p>
      <a
        href={wa}
        className="hp-pulse relative mt-8 inline-flex rounded-2xl px-9 py-4 text-sm font-bold tracking-tight shadow-xl transition hover:-translate-y-0.5"
        style={{ background: accent, color: accentFg }}
      >
        Quero isso no meu negócio
      </a>
    </section>
  );
}

export function SitePreviewView({ preview }: { preview: SitePreview }) {
  const enriched = enrichPreviewMedia(preview);
  const product = resolveNicheProduct(enriched.name, enriched.segment);
  const view = mergeProduct(enriched, product);
  const kind = resolvePreviewKind(view.name, view.segment);

  if ((product.family === "delivery" || kind.food) && view.menu?.length) {
    return (
      <PreviewShell>
        <DeliveryStorefront view={view} product={product} />
      </PreviewShell>
    );
  }
  return (
    <PreviewShell>
      <NicheStorefront view={view} product={product} />
    </PreviewShell>
  );
}

function IconHome() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" />
    </svg>
  );
}
function IconFire() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 3c2 3 1 5 1 5s3-1 4 2c1 3-1 6-5 9-4-3-6-6-5-9 1-3 4-2 4-2s-1-2 1-5Z" />
    </svg>
  );
}
function IconBag() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M6 7h12l-1 11H7L6 7Z" /><path d="M9 7V5a3 3 0 0 1 6 0v2" />
    </svg>
  );
}

function DeliveryStorefront({ view, product }: { view: SitePreview; product: NicheProduct }) {
  const categories = view.menu ?? [];
  const [cat, setCat] = useState("Em destaque");
  const [q, setQ] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [justAdded, setJustAdded] = useState(false);
  const c = product.colors;
  const customerWa = waHref(view.phone, product.waPrefill(view.name));

  const items = useMemo(() => {
    const pool = categories.flatMap((x) => x.items.map((it) => ({ ...it, category: x.category })));
    return pool.filter((it) => {
      const hitCat = cat === "Em destaque" || it.category === cat;
      const hitQ = !q.trim() || `${it.name} ${it.description}`.toLowerCase().includes(q.toLowerCase());
      return hitCat && hitQ;
    });
  }, [categories, cat, q]);

  const featured = categories.flatMap((x) => x.items).slice(0, 8);
  const totalQty = cart.reduce((s, l) => s + l.qty, 0);
  const total = cart.reduce((s, l) => s + l.price * l.qty, 0);
  const heroImg = view.photos[0] || featured[0]?.image;

  const add = (item: SitePreviewItem) => {
    setCart((prev) => {
      const hit = prev.find((l) => l.key === item.name);
      if (hit) return prev.map((l) => (l.key === item.name ? { ...l, qty: l.qty + 1 } : l));
      return [...prev, { key: item.name, name: item.name, price: item.price, qty: 1 }];
    });
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 400);
  };
  const bump = (key: string, delta: number) => {
    setCart((prev) => prev.map((l) => (l.key === key ? { ...l, qty: l.qty + delta } : l)).filter((l) => l.qty > 0));
  };

  const orderText =
    `${product.waPrefill(view.name)}:\n` +
    cart.map((l) => `• ${l.qty}x ${l.name} — ${brl(l.price * l.qty)}`).join("\n") +
    `\n\nTotal: ${brl(total)}\n${view.address}`;

  return (
    <div className="min-h-screen bg-[#f4efe8] text-stone-900">
      <OwnerRibbon name={view.name} kind="cardapio" />

      {/* Hero cheio — o cliente já “sente” o cheiro */}
      <header className="relative h-[46svh] min-h-[260px] max-h-[420px] overflow-hidden sm:h-[52svh]">
        {heroImg && <img src={heroImg} alt="" className="hp-ken absolute inset-0 size-full object-cover" />}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(0,0,0,.15),transparent_55%),linear-gradient(to_top,#f4efe8_0%,rgba(0,0,0,.45)_42%,rgba(0,0,0,.62)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 px-4 pb-16 pt-24">
          <div className="mx-auto max-w-lg">
            <p className="hp-rise text-[11px] font-bold uppercase tracking-[0.22em] text-amber-200/95">
              Delivery · pedido em 1 toque
            </p>
            <h1 className="hp-syne hp-rise-2 mt-2 text-[clamp(2.15rem,8.5vw,3.1rem)] font-extrabold leading-[0.96] tracking-tight text-white drop-shadow-[0_8px_32px_rgba(0,0,0,.45)]">
              {view.name}
            </h1>
            <p className="hp-rise-3 mt-3 max-w-md text-[15px] leading-relaxed text-white/88">
              {product.headlineHook}
            </p>
          </div>
        </div>
      </header>

      <div className="relative z-10 mx-auto -mt-14 max-w-lg px-4 pb-40">
        {/* Identidade + confiança (o que o cliente olha antes de pedir) */}
        <div className="hp-rise flex items-end gap-4">
          {view.logoUrl ? (
            <img
              src={view.logoUrl}
              alt=""
              className="size-[5.25rem] rounded-[1.65rem] border-[3px] border-white object-cover shadow-[0_20px_50px_rgba(0,0,0,.28)]"
            />
          ) : (
            <div
              className="flex size-[5.25rem] items-center justify-center rounded-[1.65rem] border-[3px] border-white bg-white text-2xl font-black shadow-[0_20px_50px_rgba(0,0,0,.28)]"
              style={{ color: c.accent }}
            >
              {view.name.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="mb-1 min-w-0 flex-1">
            <div className="flex flex-wrap gap-1.5">
              <span className="rounded-md bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                Aberto agora
              </span>
              <span className="rounded-md bg-white/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-stone-700 shadow-sm">
                {product.label}
              </span>
            </div>
            <p className="mt-1.5 truncate text-sm font-medium text-stone-600">{view.city}</p>
          </div>
        </div>

        <div className="hp-rise-2 mt-4 grid grid-cols-3 gap-2">
          {[
            { k: "Nota", v: String(view.rating) },
            { k: "No mapa", v: `${view.reviewCount}+` },
            { k: "Pedido", v: "WhatsApp" },
          ].map((x) => (
            <div key={x.k} className="rounded-2xl bg-white px-3 py-3 text-center shadow-[0_8px_28px_rgba(0,0,0,.06)]">
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-stone-400">{x.k}</div>
              <div className="mt-1 text-sm font-extrabold tracking-tight" style={{ color: x.k === "Nota" ? "#d97706" : undefined }}>
                {x.k === "Nota" ? `${stars(view.rating)} ${x.v}` : x.v}
              </div>
            </div>
          ))}
        </div>

        <div className="hp-rise-3 mt-4 rounded-[1.65rem] bg-white p-4 shadow-[0_10px_36px_rgba(0,0,0,.07)]">
          <p className="text-[15px] leading-relaxed text-stone-600">
            Escolhe o que dá vontade, monta a sacola e manda no WhatsApp da casa —{" "}
            <span className="font-semibold text-stone-900">sem baixar app, sem taxa de marketplace</span>.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <a
              href={customerWa}
              className="rounded-2xl py-3.5 text-center text-sm font-bold text-white shadow-md transition hover:-translate-y-0.5"
              style={{ background: c.accent }}
            >
              Pedir agora
            </a>
            <a
              href={view.mapsUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-2xl bg-stone-100 py-3.5 text-center text-sm font-bold text-stone-800"
            >
              Como chegar
            </a>
          </div>
        </div>

        {/* Chips de categoria — scroll horizontal, como app de delivery */}
        <div className="hp-chip hp-rise-4 mt-5 flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setCat("Em destaque")}
            className="shrink-0 rounded-full px-4 py-2 text-xs font-bold transition"
            style={
              cat === "Em destaque"
                ? { background: c.accent, color: c.accentFg }
                : { background: "#fff", color: "#44403c" }
            }
          >
            Em destaque
          </button>
          {categories.map((x) => (
            <button
              key={x.category}
              type="button"
              onClick={() => setCat(x.category)}
              className="shrink-0 rounded-full px-4 py-2 text-xs font-bold transition"
              style={
                cat === x.category
                  ? { background: c.accent, color: c.accentFg }
                  : { background: "#fff", color: "#44403c" }
              }
            >
              {x.category}
            </button>
          ))}
        </div>

        <div className="mt-3">
          <input
            className="w-full rounded-2xl border-0 bg-white px-4 py-3.5 text-sm shadow-sm outline-none ring-0 placeholder:text-stone-400 focus:shadow-md"
            placeholder="O que você tá com vontade?"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {cat === "Em destaque" && !q && (
          <section className="mt-8">
            <div className="mb-3 flex items-end justify-between gap-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400">Os mais pedidos</p>
                <h2 className="hp-syne text-lg font-bold tracking-tight">Dá vontade só de olhar</h2>
              </div>
              <span className="text-[11px] font-semibold text-stone-400">toque no +</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {featured.map((item) => (
                <ProductCard key={`f-${item.name}`} item={item} accent={c.accent} onAdd={() => add(item)} />
              ))}
            </div>
          </section>
        )}

        <section className="mt-9">
          <h2 className="hp-syne mb-3 text-lg font-bold tracking-tight">
            {cat === "Em destaque" ? "Cardápio completo" : cat}
          </h2>
          <div className="space-y-3">
            {items.map((item) => (
              <ProductRow key={`${item.category}-${item.name}`} item={item} accent={c.accent} onAdd={() => add(item)} />
            ))}
            {items.length === 0 && (
              <p className="rounded-2xl bg-white py-10 text-center text-sm text-stone-400">Nada por aqui — tenta outro termo.</p>
            )}
          </div>
        </section>

        <div className="mt-14">
          <CloseSellBlock name={view.name} accent={c.accent} accentFg={c.accentFg} wa={customerWa} light kind="cardapio" />
        </div>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200/80 bg-white/93 backdrop-blur-xl"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto flex max-w-lg items-center justify-around px-2 py-2.5 text-[11px] font-semibold text-stone-500">
          <button
            type="button"
            className="flex flex-col items-center gap-1"
            style={{ color: c.accent }}
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          >
            <IconHome /> Início
          </button>
          <button type="button" className="flex flex-col items-center gap-1" onClick={() => setCat("Em destaque")}>
            <IconFire /> Destaques
          </button>
          <button type="button" className={`relative flex flex-col items-center gap-1 ${justAdded ? "hp-bag" : ""}`} onClick={() => setCartOpen(true)}>
            <IconBag /> Sacola
            {totalQty > 0 && (
              <span
                className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
                style={{ background: c.accent }}
              >
                {totalQty}
              </span>
            )}
          </button>
        </div>
      </nav>

      {cartOpen && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 backdrop-blur-[3px] sm:items-center"
          onClick={() => setCartOpen(false)}
        >
          <div
            className="max-h-[88vh] w-full max-w-lg overflow-auto rounded-t-[2rem] bg-white p-5 shadow-2xl sm:rounded-[2rem]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-stone-400">Seu pedido</p>
                <h3 className="hp-syne text-xl font-bold tracking-tight">Sacola</h3>
              </div>
              <button type="button" className="text-sm font-medium text-stone-400" onClick={() => setCartOpen(false)}>
                Fechar
              </button>
            </div>
            {cart.length === 0 ? (
              <p className="py-14 text-center text-sm text-stone-400">Ainda vazia — escolhe algo que dê vontade.</p>
            ) : (
              <ul className="mt-5 space-y-4">
                {cart.map((l) => (
                  <li key={l.key} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{l.name}</div>
                      <div className="text-sm text-stone-500">{brl(l.price)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" className="flex size-9 items-center justify-center rounded-full bg-stone-100 text-lg" onClick={() => bump(l.key, -1)}>
                        −
                      </button>
                      <span className="w-6 text-center font-bold">{l.qty}</span>
                      <button type="button" className="flex size-9 items-center justify-center rounded-full bg-stone-100 text-lg" onClick={() => bump(l.key, 1)}>
                        +
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-6 border-t border-stone-100 pt-4">
              <div className="mb-1 flex justify-between text-sm">
                <span className="text-stone-500">Subtotal</span>
                <span className="font-bold">{brl(total)}</span>
              </div>
              <p className="mb-4 text-[11px] text-stone-400">Frete e tempo combinados no WhatsApp com a casa.</p>
              <a
                href={cart.length ? waHref(view.phone, orderText) : undefined}
                className={`block rounded-2xl py-4 text-center text-sm font-bold text-white shadow-lg ${
                  cart.length ? "bg-emerald-600 hover:bg-emerald-500" : "pointer-events-none bg-stone-300"
                }`}
              >
                {product.cta}
              </a>
            </div>
          </div>
        </div>
      )}

      {totalQty > 0 && !cartOpen && (
        <button
          type="button"
          className="fixed bottom-[4.7rem] left-1/2 z-30 flex w-[min(100%-1.75rem,28rem)] -translate-x-1/2 items-center justify-between rounded-2xl px-5 py-3.5 text-sm font-bold text-white shadow-[0_16px_44px_rgba(5,150,105,.45)]"
          style={{ background: "linear-gradient(135deg,#059669,#047857)" }}
          onClick={() => setCartOpen(true)}
        >
          <span className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-full bg-white/20 text-xs">{totalQty}</span>
            Ver sacola
          </span>
          <span>{brl(total)}</span>
        </button>
      )}
    </div>
  );
}

function ProductCard({ item, accent, onAdd }: { item: SitePreviewItem; accent: string; onAdd: () => void }) {
  const from = item.price > 35 ? Math.round(item.price * 1.12) : null;
  return (
    <article className="hp-card overflow-hidden rounded-[1.45rem] bg-white shadow-[0_8px_28px_rgba(0,0,0,.07)]">
      <div className="relative aspect-[4/3] overflow-hidden bg-stone-100">
        {item.image && <img src={item.image} alt="" className="hp-img size-full object-cover" />}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/35 to-transparent" />
        <button
          type="button"
          aria-label={`Adicionar ${item.name}`}
          className="absolute bottom-2.5 right-2.5 flex size-10 items-center justify-center rounded-full text-xl font-bold text-white shadow-lg transition hover:scale-110"
          style={{ background: accent }}
          onClick={onAdd}
        >
          +
        </button>
      </div>
      <div className="p-3">
        <div className="line-clamp-2 text-[13px] font-bold leading-snug">{item.name}</div>
        <div className="mt-1.5 flex flex-wrap items-baseline gap-1.5">
          {from != null && <span className="text-[11px] text-stone-400 line-through">{brl(from)}</span>}
          {from != null && (
            <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-700">Promo</span>
          )}
          <span className="text-sm font-extrabold">{brl(item.price)}</span>
        </div>
      </div>
    </article>
  );
}

function ProductRow({ item, accent, onAdd }: { item: SitePreviewItem; accent: string; onAdd: () => void }) {
  return (
    <article className="hp-card flex gap-3.5 rounded-[1.45rem] bg-white p-2.5 shadow-[0_5px_22px_rgba(0,0,0,.05)]">
      <div className="min-w-0 flex-1 py-1.5 pl-2">
        <div className="font-bold leading-snug tracking-tight">{item.name}</div>
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-stone-500">{item.description}</p>
        <div className="mt-2.5 text-sm font-extrabold">{brl(item.price)}</div>
      </div>
      <div className="relative size-[7rem] shrink-0 overflow-hidden rounded-[1.15rem] bg-stone-100">
        {item.image && <img src={item.image} alt="" className="hp-img size-full object-cover" />}
        <button
          type="button"
          aria-label={`Adicionar ${item.name}`}
          className="absolute bottom-2 right-2 flex size-9 items-center justify-center rounded-full text-lg font-bold text-white shadow-lg transition hover:scale-110"
          style={{ background: accent }}
          onClick={onAdd}
        >
          +
        </button>
      </div>
    </article>
  );
}

function nicheDesireCopy(family: NicheProduct["family"], name: string, rating: number, reviews: number) {
  switch (family) {
    case "beauty":
      return {
        whyTitle: "A cadeira que o cliente já imagina",
        whyBody: `${name} com nota ${rating} e ${reviews} avaliações no mapa. Este site faz a pessoa marcar horário sem “vou pensar”.`,
        offerTitle: "Serviços que o cliente já quer",
        proofTitle: "Quem já saiu transformado",
      };
    case "clinic":
      return {
        whyTitle: "Confiança antes da consulta",
        whyBody: `Paciente escolhe quem transmite cuidado. ${reviews} avaliações e nota ${rating} — agora com agenda em 1 toque.`,
        offerTitle: "Jornada clara do paciente",
        proofTitle: "Pacientes que recomendam",
      };
    case "trade":
      return {
        whyTitle: "Quando o problema é agora",
        whyBody: `O cliente te acha no Google, vê presença profissional e chama no WhatsApp — ${reviews} pessoas já confiaram no mapa.`,
        offerTitle: "O que a gente resolve",
        proofTitle: "Quem já chamou e resolveu",
      };
    case "sweet":
      return {
        whyTitle: "Vitrine que dá vontade",
        whyBody: `Olhou, quis, pediu. Site doce com a cara da ${name} — nota ${rating} no mapa vira pedido no WhatsApp.`,
        offerTitle: "O que dá pra pedir",
        proofTitle: "Quem voltou por mais",
      };
    case "pro":
      return {
        whyTitle: "Autoridade que abre porta",
        whyBody: `Quem busca serviço sério julga em 3 segundos. Este site mostra que ${name} é o lugar certo — nota ${rating}.`,
        offerTitle: "Como o cliente entra",
        proofTitle: "Clientes no mapa",
      };
    case "estate":
      return {
        whyTitle: "Imóvel com atendimento humano",
        whyBody: `Visita e proposta sem fricção. ${name} com prova social do mapa (${reviews} avaliações) e corretor no WhatsApp.`,
        offerTitle: "Do interesse ao fechamento",
        proofTitle: "Quem já visitou",
      };
    case "pet":
      return {
        whyTitle: "Cuidado que o tutor sente",
        whyBody: `Quem ama o pet quer marcar fácil. ${name} com nota ${rating} — banho, tosa ou consulta no WhatsApp.`,
        offerTitle: "Carinho com hora marcada",
        proofTitle: "Tutores felizes",
      };
    case "fitness":
      return {
        whyTitle: "Estrutura que motiva a entrar",
        whyBody: `O aluno quer ver o espaço e falar com a equipe. ${name} com ${reviews} avaliações — planos claros no WhatsApp.`,
        offerTitle: "Planos & energia",
        proofTitle: "Alunos no mapa",
      };
    default:
      return {
        whyTitle: "Presença que o cliente confia",
        whyBody: `${name} já tem ${reviews} avaliações (nota ${rating}). Esta página transforma isso em conversa e venda.`,
        offerTitle: "Como te encontrar",
        proofTitle: "Prova social do mapa",
      };
  }
}

function NicheStorefront({ view, product }: { view: SitePreview; product: NicheProduct }) {
  const c = product.colors;
  const light = product.surface === "light";
  const wa = waHref(view.phone, product.waPrefill(view.name));
  const photos = view.photos.length ? view.photos : product.photos;
  const services = view.services?.length
    ? view.services.map((s, i) => ({ ...s, hint: product.services[i]?.hint }))
    : product.services;
  const displayClass = ["beauty", "pro", "trade", "fitness", "estate"].includes(product.family) ? "hp-display" : "hp-syne";
  const desire = nicheDesireCopy(product.family, view.name, view.rating, view.reviewCount);
  const urgent = product.family === "trade";

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: c.bg, color: c.fg }}>
      <OwnerRibbon name={view.name} kind="site" />

      <header className="relative isolate flex min-h-[94svh] max-h-[920px] items-end overflow-hidden">
        {photos[0] && (
          <img
            src={photos[0]}
            alt=""
            className="hp-ken absolute inset-0 size-full object-cover"
            style={{ opacity: light ? 0.42 : 0.62 }}
          />
        )}
        <div
          className="absolute inset-0"
          style={{
            background: light
              ? `linear-gradient(185deg, ${c.bg}10 0%, ${c.bg}78 38%, ${c.bg} 78%)`
              : `radial-gradient(ellipse 90% 55% at 85% 0%, ${c.accent}35, transparent 55%),
                 linear-gradient(185deg, ${c.bg}10 0%, ${c.bg}88 42%, ${c.bg} 80%)`,
          }}
        />

        <div className="relative mx-auto w-full max-w-3xl px-5 pb-16 pt-28 sm:pb-24">
          <div className="hp-rise flex flex-wrap items-center gap-2">
            <span
              className="rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em]"
              style={{ background: `${c.accent}${light ? "28" : "40"}`, color: light ? c.fg : c.accent }}
            >
              {product.badge}
            </span>
            {urgent && (
              <span className="rounded-lg bg-amber-400 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-zinc-950">
                Resposta rápida
              </span>
            )}
          </div>
          <p className="hp-rise mt-5 text-[11px] font-bold uppercase tracking-[0.28em] opacity-65">{product.eyebrow}</p>
          <h1 className={`hp-rise-2 mt-3 text-[clamp(3.1rem,10.5vw,5rem)] font-bold leading-[0.92] tracking-[-0.045em] ${displayClass}`}>
            {view.name}
          </h1>
          <p className="hp-rise-3 mt-6 max-w-xl text-[1.12rem] leading-relaxed opacity-92 sm:text-[1.2rem]">
            {product.headlineHook}
          </p>
          <div className="hp-rise-3 mt-5 flex flex-wrap items-center gap-3 text-sm">
            <span className="font-semibold" style={{ color: c.accent }}>
              {stars(view.rating)} {view.rating}
            </span>
            <span className="opacity-60">
              {view.reviewCount} avaliações · {view.city}
            </span>
          </div>
          <div className="hp-rise-4 mt-10 flex flex-wrap gap-3">
            <a
              href={wa}
              className="rounded-2xl px-7 py-4 text-sm font-bold tracking-tight shadow-[0_20px_55px_rgba(0,0,0,.28)] transition hover:-translate-y-0.5"
              style={{ background: c.accent, color: c.accentFg }}
            >
              {product.cta}
            </a>
            <a
              href={view.mapsUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-2xl border px-7 py-4 text-sm font-semibold backdrop-blur-sm"
              style={{ borderColor: `${c.fg}28`, background: light ? "rgba(255,255,255,.55)" : "rgba(0,0,0,.25)" }}
            >
              {product.ctaSecondary}
            </a>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-3xl space-y-16 px-5 pb-36 pt-2 sm:space-y-20">
        {photos.length > 1 && (
          <section>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] opacity-45">{product.galleryTitle}</p>
            <h2 className={`mt-2 text-[clamp(1.6rem,4vw,2.2rem)] font-bold tracking-tight ${displayClass}`}>
              O ambiente que o cliente imagina
            </h2>
            <div className="mt-6 grid grid-cols-12 gap-2.5 sm:gap-3">
              {photos.slice(1, 7).map((src, i) => {
                const span =
                  i === 0
                    ? "col-span-12 sm:col-span-7 h-64 sm:h-[22rem]"
                    : i === 1
                      ? "col-span-6 sm:col-span-5 h-48 sm:h-[22rem]"
                      : "col-span-6 sm:col-span-4 h-44 sm:h-56";
                return (
                  <div key={`${src}-${i}`} className={`hp-card overflow-hidden rounded-[1.6rem] shadow-xl ${span}`}>
                    <img src={src} alt="" className="hp-img size-full object-cover" />
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section className="grid gap-10 sm:grid-cols-[1.3fr_.85fr] sm:items-end">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] opacity-45">Por que o cliente escolhe</p>
            <h2 className={`mt-3 text-[clamp(1.9rem,4.5vw,2.7rem)] font-bold tracking-tight ${displayClass}`}>
              {desire.whyTitle}
            </h2>
            <p className="mt-4 max-w-md text-[1.05rem] leading-relaxed opacity-85">{desire.whyBody}</p>
          </div>
          <dl className="space-y-2.5 text-sm">
            {[
              ["Endereço", view.address],
              ["Horário", view.hours],
              ["WhatsApp", view.phone],
            ].map(([k, v]) => (
              <div
                key={k}
                className="rounded-2xl border px-4 py-3.5"
                style={{ borderColor: `${c.fg}12`, background: c.card }}
              >
                <dt className="text-[10px] font-bold uppercase tracking-[0.16em] opacity-45">{k}</dt>
                <dd className="mt-1.5 font-semibold leading-snug">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        {services.length > 0 && (
          <section>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] opacity-45">{product.servicesTitle}</p>
            <h2 className={`mt-3 text-[clamp(1.9rem,4.5vw,2.7rem)] font-bold tracking-tight ${displayClass}`}>
              {desire.offerTitle}
            </h2>
            <ul className="mt-8 grid gap-3 sm:grid-cols-3">
              {services.map((s, i) => (
                <li
                  key={s.name}
                  className="hp-card relative overflow-hidden rounded-[1.6rem] border p-5"
                  style={{ borderColor: `${c.fg}12`, background: c.card }}
                >
                  <span className="absolute right-4 top-3 text-4xl font-black opacity-[0.07]">{String(i + 1).padStart(2, "0")}</span>
                  {"hint" in s && s.hint ? (
                    <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: c.accent }}>
                      {s.hint}
                    </span>
                  ) : null}
                  <div className={`mt-2 text-xl font-bold tracking-tight ${displayClass}`} style={{ color: c.accent }}>
                    {s.name}
                  </div>
                  <p className="mt-2.5 text-sm leading-relaxed opacity-75">{s.description}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] opacity-45">{product.socialProofTitle}</p>
          <h2 className={`mt-3 text-[clamp(1.9rem,4.5vw,2.7rem)] font-bold tracking-tight ${displayClass}`}>
            {desire.proofTitle}
          </h2>
          <ul className="mt-8 space-y-3">
            {view.reviews.map((r) => (
              <li
                key={r.author}
                className="rounded-[1.6rem] border p-5"
                style={{ borderColor: `${c.fg}12`, background: c.card }}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-bold tracking-tight">{r.author}</span>
                  <span className="text-sm font-semibold" style={{ color: c.accent }}>
                    {stars(r.rating)}
                  </span>
                </div>
                <p className="mt-2.5 text-sm leading-relaxed opacity-80">&ldquo;{r.text}&rdquo;</p>
              </li>
            ))}
          </ul>
        </section>

        <CloseSellBlock name={view.name} accent={c.accent} accentFg={c.accentFg} wa={wa} light={light} kind="site" />

        <p className="text-center text-[10px] uppercase tracking-[0.18em] opacity-30">
          Prévia sob medida · {product.label} · Info Tech
        </p>
      </main>

      <div
        className="fixed inset-x-0 bottom-0 z-20 flex gap-2 border-t px-4 py-3 backdrop-blur-xl"
        style={{
          borderColor: `${c.fg}12`,
          background: `${c.bg}f0`,
          paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))",
        }}
      >
        <a href={wa} className="flex-1 rounded-2xl py-3.5 text-center text-sm font-bold shadow-lg" style={{ background: c.accent, color: c.accentFg }}>
          {product.cta}
        </a>
        <a
          href={view.mapsUrl}
          target="_blank"
          rel="noreferrer"
          className="rounded-2xl border px-5 py-3.5 text-sm font-semibold"
          style={{ borderColor: `${c.fg}28` }}
        >
          Mapa
        </a>
      </div>
    </div>
  );
}
