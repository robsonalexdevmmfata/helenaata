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
@keyframes helena-rise{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:none}}
@keyframes helena-ken{from{transform:scale(1.05)}to{transform:scale(1.14)}}
@keyframes helena-fade{from{opacity:0}to{opacity:1}}
@keyframes helena-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
.hp-rise{animation:helena-rise .8s cubic-bezier(.22,1,.36,1) both}
.hp-rise-2{animation:helena-rise .9s .1s cubic-bezier(.22,1,.36,1) both}
.hp-rise-3{animation:helena-rise 1s .18s cubic-bezier(.22,1,.36,1) both}
.hp-rise-4{animation:helena-rise 1.05s .26s cubic-bezier(.22,1,.36,1) both}
.hp-ken{animation:helena-ken 24s ease-in-out infinite alternate}
.hp-fade{animation:helena-fade .55s ease both}
.hp-display{font-family:Fraunces,Instrument Serif,Georgia,serif}
.hp-syne{font-family:Syne,Manrope,system-ui,sans-serif}
.hp-body{font-family:Manrope,Geist,system-ui,sans-serif}
.hp-card{transition:transform .28s cubic-bezier(.22,1,.36,1),box-shadow .28s ease}
.hp-card:hover{transform:translateY(-4px)}
.hp-img{transition:transform .7s cubic-bezier(.22,1,.36,1)}
.hp-card:hover .hp-img{transform:scale(1.05)}
.hp-shine{background:linear-gradient(110deg,transparent 20%,rgba(255,255,255,.35) 45%,transparent 70%);background-size:200% 100%;animation:helena-shimmer 3.5s ease-in-out infinite}
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

/** Faixa que impressiona o DONO — deixa claro que isso é produto sob medida. */
function OwnerRibbon({ name, kind }: { name: string; kind: "cardapio" | "site" }) {
  return (
    <div className="relative z-20 border-b border-black/5 bg-zinc-950 text-white">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-2.5 text-[11px] sm:text-xs">
        <p className="font-semibold tracking-tight">
          Prévia exclusiva · montada para <span className="text-amber-300">{name}</span>
        </p>
        <p className="hidden shrink-0 font-medium text-zinc-400 sm:block">
          {kind === "cardapio" ? "Cardápio digital pronto pra vender" : "Site profissional pronto pra vender"}
        </p>
      </div>
    </div>
  );
}

/** Fecha a venda com o dono: “isso já está no ar”. */
function CloseSellBlock({
  name,
  accent,
  accentFg,
  wa,
  light,
}: {
  name: string;
  accent: string;
  accentFg: string;
  wa: string;
  light?: boolean;
}) {
  return (
    <section
      className="relative overflow-hidden rounded-[1.85rem] px-6 py-11 text-center sm:px-12"
      style={{
        background: light
          ? `linear-gradient(145deg, ${accent}18 0%, #fff 45%, ${accent}10 100%)`
          : `linear-gradient(145deg, ${accent}28 0%, #0a0a0a 50%, ${accent}14 100%)`,
        border: `1px solid ${accent}55`,
        color: light ? "#1c1917" : "#f8fafc",
      }}
    >
      <div className="hp-shine pointer-events-none absolute inset-0 opacity-40" />
      <p className="hp-syne relative text-[11px] font-bold uppercase tracking-[0.22em] opacity-60">Produto final · já no ar</p>
      <h2 className="hp-display relative mt-3 text-[clamp(1.75rem,5vw,2.5rem)] font-bold leading-[1.05] tracking-tight">
        Imagine seus clientes abrindo isto agora
      </h2>
      <p className="relative mx-auto mt-4 max-w-lg text-[15px] leading-relaxed opacity-80">
        Esta página foi montada sob medida para <strong>{name}</strong>. Visual de agência, WhatsApp em 1 toque e prova social do mapa — o tipo de presença que faz o dono querer contratar.
      </p>
      <a
        href={wa}
        className="relative mt-7 inline-flex rounded-2xl px-8 py-4 text-sm font-bold tracking-tight shadow-lg transition hover:-translate-y-0.5"
        style={{ background: accent, color: accentFg }}
      >
        Falar no WhatsApp e validar com o time
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
function IconPercent() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="7.5" cy="7.5" r="2.5" /><circle cx="16.5" cy="16.5" r="2.5" /><path d="M18 6 6 18" />
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

  const featured = categories.flatMap((x) => x.items).slice(0, 6);
  const totalQty = cart.reduce((s, l) => s + l.qty, 0);
  const total = cart.reduce((s, l) => s + l.price * l.qty, 0);

  const add = (item: SitePreviewItem) => {
    setCart((prev) => {
      const hit = prev.find((l) => l.key === item.name);
      if (hit) return prev.map((l) => (l.key === item.name ? { ...l, qty: l.qty + 1 } : l));
      return [...prev, { key: item.name, name: item.name, price: item.price, qty: 1 }];
    });
  };
  const bump = (key: string, delta: number) => {
    setCart((prev) => prev.map((l) => (l.key === key ? { ...l, qty: l.qty + delta } : l)).filter((l) => l.qty > 0));
  };

  const orderText =
    `${product.waPrefill(view.name)}:\n` +
    cart.map((l) => `• ${l.qty}x ${l.name} — ${brl(l.price * l.qty)}`).join("\n") +
    `\n\nTotal: ${brl(total)}\n${view.address}`;

  return (
    <div className="min-h-screen bg-[#f7f4ef] text-stone-900">
      <OwnerRibbon name={view.name} kind="cardapio" />

      <header className="relative h-48 overflow-hidden sm:h-56">
        {(view.photos[0] || featured[0]?.image) && (
          <img src={view.photos[0] || featured[0]?.image} alt="" className="hp-ken absolute inset-0 size-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/25 to-[#f7f4ef]" />
        <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#f7f4ef] to-transparent" />
      </header>

      <div className="relative z-10 mx-auto -mt-20 max-w-lg px-4 pb-36">
        <div className="hp-rise flex flex-col items-center">
          {view.logoUrl ? (
            <img src={view.logoUrl} alt="" className="size-24 rounded-[1.85rem] border-[3px] border-white object-cover shadow-[0_18px_50px_rgba(0,0,0,.22)]" />
          ) : (
            <div className="flex size-24 items-center justify-center rounded-[1.85rem] border-[3px] border-white bg-white text-2xl font-black shadow-[0_18px_50px_rgba(0,0,0,.22)]" style={{ color: c.accent }}>
              {view.name.slice(0, 2).toUpperCase()}
            </div>
          )}
        </div>

        <div className="hp-rise-2 mt-4 rounded-[1.5rem] bg-white/95 p-5 shadow-[0_12px_40px_rgba(0,0,0,.08)] backdrop-blur">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-lg bg-stone-900 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white">{product.badge}</span>
            <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">Aberto · pedidos WhatsApp</span>
          </div>
          <h1 className="hp-syne mt-3 text-[1.75rem] font-extrabold leading-[1.05] tracking-tight">{view.name}</h1>
          <p className="mt-1 text-sm text-stone-500">{product.label} · {view.city}</p>
          <p className="mt-3 text-[15px] leading-relaxed text-stone-600">{product.headlineHook}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-bold text-amber-600">{stars(view.rating)}</span>
            <span className="font-bold">{view.rating}</span>
            <span className="text-stone-400">· {view.reviewCount} avaliações no mapa</span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <a href={customerWa} className="rounded-2xl py-3.5 text-center text-sm font-bold text-white shadow-md" style={{ background: c.accent }}>
              Pedir agora
            </a>
            <a href={view.mapsUrl} target="_blank" rel="noreferrer" className="rounded-2xl bg-stone-100 py-3.5 text-center text-sm font-bold text-stone-800">
              Ver no mapa
            </a>
          </div>
        </div>

        <div className="hp-rise-3 mt-3 flex gap-2">
          <select className="flex-1 appearance-none rounded-2xl border-0 bg-white px-4 py-3.5 text-sm font-semibold shadow-sm outline-none" value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="Em destaque">Em destaque</option>
            {categories.map((x) => <option key={x.category} value={x.category}>{x.category}</option>)}
          </select>
          <input className="min-w-0 flex-[1.15] rounded-2xl border-0 bg-white px-4 py-3.5 text-sm shadow-sm outline-none ring-rose-400/0 transition focus:ring-2" placeholder="Buscar no cardápio" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        {cat === "Em destaque" && !q && (
          <section className="hp-rise-4 mt-7">
            <div className="mb-3 flex items-end justify-between">
              <h2 className="hp-syne text-sm font-bold tracking-tight">{product.galleryTitle}</h2>
              <span className="text-[11px] font-semibold text-stone-400">toque no +</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {featured.map((item) => <ProductCard key={`f-${item.name}`} item={item} accent={c.accent} onAdd={() => add(item)} />)}
            </div>
          </section>
        )}

        <section className="mt-8">
          <h2 className="hp-syne mb-3 text-sm font-bold tracking-tight">{cat === "Em destaque" ? "Cardápio completo" : cat}</h2>
          <div className="space-y-2.5">
            {items.map((item) => <ProductRow key={`${item.category}-${item.name}`} item={item} accent={c.accent} onAdd={() => add(item)} />)}
          </div>
        </section>

        <div className="mt-12">
          <CloseSellBlock name={view.name} accent={c.accent} accentFg={c.accentFg} wa={customerWa} light />
        </div>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200/80 bg-white/92 backdrop-blur-xl" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="mx-auto flex max-w-lg items-center justify-around px-2 py-2.5 text-[11px] font-semibold text-stone-500">
          <button type="button" className="flex flex-col items-center gap-1" style={{ color: c.accent }} onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
            <IconHome /> Início
          </button>
          <button type="button" className="flex flex-col items-center gap-1" onClick={() => setCat("Em destaque")}>
            <IconPercent /> Promoções
          </button>
          <button type="button" className="relative flex flex-col items-center gap-1" onClick={() => setCartOpen(true)}>
            <IconBag /> Sacola
            {totalQty > 0 && <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: c.accent }}>{totalQty}</span>}
          </button>
        </div>
      </nav>

      {cartOpen && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/45 backdrop-blur-[2px] sm:items-center" onClick={() => setCartOpen(false)}>
          <div className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-t-[1.85rem] bg-white p-5 shadow-2xl sm:rounded-[1.85rem]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="hp-syne text-lg font-bold">Sua sacola</h3>
              <button type="button" className="text-sm font-medium text-stone-400" onClick={() => setCartOpen(false)}>Fechar</button>
            </div>
            {cart.length === 0 ? (
              <p className="py-12 text-center text-sm text-stone-400">Adicione itens com o +</p>
            ) : (
              <ul className="mt-5 space-y-4">
                {cart.map((l) => (
                  <li key={l.key} className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold">{l.name}</div>
                      <div className="text-sm text-stone-500">{brl(l.price)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" className="flex size-9 items-center justify-center rounded-full bg-stone-100 text-lg" onClick={() => bump(l.key, -1)}>−</button>
                      <span className="w-6 text-center font-bold">{l.qty}</span>
                      <button type="button" className="flex size-9 items-center justify-center rounded-full bg-stone-100 text-lg" onClick={() => bump(l.key, 1)}>+</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-5 border-t border-stone-100 pt-4">
              <div className="mb-4 flex justify-between text-sm font-bold">
                <span>Total</span><span>{brl(total)}</span>
              </div>
              <a href={cart.length ? waHref(view.phone, orderText) : undefined} className={`block rounded-2xl py-4 text-center text-sm font-bold text-white ${cart.length ? "bg-emerald-600 hover:bg-emerald-500" : "pointer-events-none bg-stone-300"}`}>
                {product.cta}
              </a>
            </div>
          </div>
        </div>
      )}

      {totalQty > 0 && !cartOpen && (
        <button type="button" className="fixed bottom-[4.6rem] left-1/2 z-30 flex w-[min(100%-1.75rem,28rem)] -translate-x-1/2 items-center justify-between rounded-2xl bg-emerald-600 px-5 py-3.5 text-sm font-bold text-white shadow-[0_14px_40px_rgba(5,150,105,.4)]" onClick={() => setCartOpen(true)}>
          <span>{totalQty} {totalQty === 1 ? "item" : "itens"}</span>
          <span>Ver sacola · {brl(total)}</span>
        </button>
      )}
    </div>
  );
}

function ProductCard({ item, accent, onAdd }: { item: SitePreviewItem; accent: string; onAdd: () => void }) {
  const from = item.price > 35 ? Math.round(item.price * 1.12) : null;
  return (
    <article className="hp-card overflow-hidden rounded-[1.35rem] bg-white shadow-[0_6px_24px_rgba(0,0,0,.06)]">
      <div className="relative aspect-square overflow-hidden bg-stone-100">
        {item.image && <img src={item.image} alt="" className="hp-img size-full object-cover" />}
        <button type="button" aria-label={`Adicionar ${item.name}`} className="absolute bottom-2.5 right-2.5 flex size-10 items-center justify-center rounded-full text-xl font-bold text-white shadow-lg transition hover:scale-105" style={{ background: accent }} onClick={onAdd}>+</button>
      </div>
      <div className="p-3">
        <div className="line-clamp-2 text-[13px] font-bold leading-snug">{item.name}</div>
        <div className="mt-1.5 flex flex-wrap items-baseline gap-1.5">
          {from != null && <span className="text-[11px] text-stone-400 line-through">{brl(from)}</span>}
          {from != null && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-700">Promo</span>}
          <span className="text-sm font-extrabold">{brl(item.price)}</span>
        </div>
      </div>
    </article>
  );
}

function ProductRow({ item, accent, onAdd }: { item: SitePreviewItem; accent: string; onAdd: () => void }) {
  return (
    <article className="hp-card flex gap-3.5 rounded-[1.35rem] bg-white p-2.5 shadow-[0_4px_18px_rgba(0,0,0,.045)]">
      <div className="min-w-0 flex-1 py-1 pl-1.5">
        <div className="font-bold leading-snug tracking-tight">{item.name}</div>
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-stone-500">{item.description}</p>
        <div className="mt-2.5 text-sm font-extrabold">{brl(item.price)}</div>
      </div>
      <div className="relative size-[6.75rem] shrink-0 overflow-hidden rounded-[1.1rem] bg-stone-100">
        {item.image && <img src={item.image} alt="" className="hp-img size-full object-cover" />}
        <button type="button" aria-label={`Adicionar ${item.name}`} className="absolute bottom-2 right-2 flex size-9 items-center justify-center rounded-full text-lg font-bold text-white shadow-lg" style={{ background: accent }} onClick={onAdd}>+</button>
      </div>
    </article>
  );
}

function NicheStorefront({ view, product }: { view: SitePreview; product: NicheProduct }) {
  const c = product.colors;
  const light = product.surface === "light";
  const wa = waHref(view.phone, product.waPrefill(view.name));
  const photos = view.photos.length ? view.photos : product.photos;
  const services = view.services?.length
    ? view.services.map((s, i) => ({ ...s, hint: product.services[i]?.hint }))
    : product.services;
  const displayClass = ["beauty", "pro", "trade", "fitness"].includes(product.family) ? "hp-display" : "hp-syne";

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: c.bg, color: c.fg }}>
      <OwnerRibbon name={view.name} kind="site" />

      <header className="relative isolate flex min-h-[92svh] max-h-[880px] items-end overflow-hidden">
        {photos[0] && (
          <img src={photos[0]} alt="" className="hp-ken absolute inset-0 size-full object-cover" style={{ opacity: light ? 0.4 : 0.58 }} />
        )}
        <div
          className="absolute inset-0"
          style={{
            background: light
              ? `linear-gradient(180deg, ${c.bg}25 0%, ${c.bg}90 48%, ${c.bg} 82%)`
              : `radial-gradient(ellipse 80% 50% at 10% -5%, ${c.accent}40, transparent 50%),
                 linear-gradient(180deg, ${c.bg}18 0%, ${c.bg}a8 40%, ${c.bg} 78%)`,
          }}
        />

        <div className="relative mx-auto w-full max-w-3xl px-5 pb-16 pt-28 sm:pb-20">
          <p className="hp-rise text-[11px] font-bold uppercase tracking-[0.28em] opacity-70">{product.eyebrow}</p>
          <h1 className={`hp-rise-2 mt-4 text-[clamp(2.9rem,9vw,4.5rem)] font-bold leading-[0.96] tracking-[-0.035em] ${displayClass}`}>
            {view.name}
          </h1>
          <p className="hp-rise-3 mt-5 max-w-lg text-[1.08rem] leading-relaxed opacity-92 sm:text-lg">
            {product.headlineHook}
          </p>
          <div className="hp-rise-3 mt-5 flex flex-wrap items-center gap-3 text-sm">
            <span className="rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide" style={{ background: `${c.accent}30`, color: light ? c.fg : c.accent }}>
              {product.badge}
            </span>
            <span className="font-semibold" style={{ color: c.accent }}>{stars(view.rating)} {view.rating}</span>
            <span className="opacity-65">{view.reviewCount} avaliações · {view.city}</span>
          </div>
          <div className="hp-rise-4 mt-10 flex flex-wrap gap-3">
            <a href={wa} className="rounded-2xl px-7 py-4 text-sm font-bold tracking-tight shadow-[0_18px_50px_rgba(0,0,0,.25)] transition hover:-translate-y-0.5" style={{ background: c.accent, color: c.accentFg }}>
              {product.cta}
            </a>
            <a href={view.mapsUrl} target="_blank" rel="noreferrer" className="rounded-2xl border px-7 py-4 text-sm font-semibold" style={{ borderColor: `${c.fg}30` }}>
              {product.ctaSecondary}
            </a>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-3xl space-y-16 px-5 pb-32 pt-4 sm:space-y-20">
        {photos.length > 1 && (
          <section>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] opacity-45">{product.galleryTitle}</p>
            <div className="mt-5 grid grid-cols-12 gap-2.5 sm:gap-3">
              {photos.slice(1, 7).map((src, i) => {
                const span =
                  i === 0 ? "col-span-12 sm:col-span-7 h-60 sm:h-80" :
                  i === 1 ? "col-span-6 sm:col-span-5 h-44 sm:h-80" :
                  "col-span-6 sm:col-span-4 h-44 sm:h-56";
                return (
                  <div key={`${src}-${i}`} className={`overflow-hidden rounded-[1.5rem] shadow-lg ${span}`}>
                    <img src={src} alt="" className="hp-img size-full object-cover" />
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section className="grid gap-10 sm:grid-cols-[1.25fr_.9fr] sm:items-end">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] opacity-45">Por que isso vende</p>
            <h2 className={`mt-3 text-[clamp(1.85rem,4vw,2.6rem)] font-bold tracking-tight ${displayClass}`}>
              Presença que o cliente confia
            </h2>
            <p className="mt-4 max-w-md text-[1.05rem] leading-relaxed opacity-85">
              {view.name} já tem {view.reviewCount} avaliações no mapa (nota {view.rating}).
              Esta página transforma isso em pedido, agenda ou orçamento — com a cara do seu negócio.
            </p>
          </div>
          <dl className="space-y-2.5 text-sm">
            {[
              ["Endereço", view.address],
              ["Horário", view.hours],
              ["WhatsApp", view.phone],
            ].map(([k, v]) => (
              <div key={k} className="rounded-2xl border px-4 py-3.5" style={{ borderColor: `${c.fg}14`, background: c.card }}>
                <dt className="text-[10px] font-bold uppercase tracking-[0.16em] opacity-45">{k}</dt>
                <dd className="mt-1.5 font-semibold leading-snug">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        {services.length > 0 && (
          <section>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] opacity-45">{product.servicesTitle}</p>
            <h2 className={`mt-3 text-[clamp(1.85rem,4vw,2.6rem)] font-bold tracking-tight ${displayClass}`}>
              Oferta clara. Decão fácil.
            </h2>
            <ul className="mt-8 grid gap-3 sm:grid-cols-3">
              {services.map((s) => (
                <li key={s.name} className="hp-card rounded-[1.5rem] border p-5" style={{ borderColor: `${c.fg}14`, background: c.card }}>
                  {"hint" in s && s.hint ? (
                    <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: c.accent }}>{s.hint}</span>
                  ) : null}
                  <div className={`mt-2 text-xl font-bold tracking-tight ${displayClass}`} style={{ color: c.accent }}>{s.name}</div>
                  <p className="mt-2.5 text-sm leading-relaxed opacity-75">{s.description}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] opacity-45">{product.socialProofTitle}</p>
          <h2 className={`mt-3 text-[clamp(1.85rem,4vw,2.6rem)] font-bold tracking-tight ${displayClass}`}>
            Prova social que fecha
          </h2>
          <ul className="mt-8 space-y-3">
            {view.reviews.map((r) => (
              <li key={r.author} className="rounded-[1.5rem] border p-5" style={{ borderColor: `${c.fg}14`, background: c.card }}>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-bold tracking-tight">{r.author}</span>
                  <span className="text-sm font-semibold" style={{ color: c.accent }}>{stars(r.rating)}</span>
                </div>
                <p className="mt-2.5 text-sm leading-relaxed opacity-80">{r.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <CloseSellBlock name={view.name} accent={c.accent} accentFg={c.accentFg} wa={wa} light={light} />

        <p className="text-center text-[10px] uppercase tracking-[0.18em] opacity-35">
          Prévia sob medida · {product.label} · Info Tech
        </p>
      </main>

      <div
        className="fixed inset-x-0 bottom-0 z-20 flex gap-2 border-t px-4 py-3 backdrop-blur-xl"
        style={{ borderColor: `${c.fg}12`, background: `${c.bg}ee`, paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        <a href={wa} className="flex-1 rounded-2xl py-3.5 text-center text-sm font-bold" style={{ background: c.accent, color: c.accentFg }}>
          {product.cta}
        </a>
        <a href={view.mapsUrl} target="_blank" rel="noreferrer" className="rounded-2xl border px-5 py-3.5 text-sm font-semibold" style={{ borderColor: `${c.fg}28` }}>
          Mapa
        </a>
      </div>
    </div>
  );
}
