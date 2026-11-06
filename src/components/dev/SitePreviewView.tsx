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
@keyframes helena-rise{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
@keyframes helena-ken{from{transform:scale(1.04)}to{transform:scale(1.12)}}
@keyframes helena-fade{from{opacity:0}to{opacity:1}}
.hp-rise{animation:helena-rise .75s cubic-bezier(.22,1,.36,1) both}
.hp-rise-2{animation:helena-rise .85s .08s cubic-bezier(.22,1,.36,1) both}
.hp-rise-3{animation:helena-rise .9s .14s cubic-bezier(.22,1,.36,1) both}
.hp-rise-4{animation:helena-rise .95s .2s cubic-bezier(.22,1,.36,1) both}
.hp-ken{animation:helena-ken 22s ease-in-out infinite alternate}
.hp-fade{animation:helena-fade .5s ease both}
.hp-display{font-family:Fraunces,Instrument Serif,Georgia,serif}
.hp-syne{font-family:Syne,Manrope,system-ui,sans-serif}
.hp-body{font-family:Manrope,Geist,system-ui,sans-serif}
.hp-card{transition:transform .25s ease,box-shadow .25s ease,border-color .25s ease}
.hp-card:hover{transform:translateY(-3px)}
.hp-img{transition:transform .6s cubic-bezier(.22,1,.36,1)}
.hp-card:hover .hp-img{transform:scale(1.04)}
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
    <div className="min-h-screen bg-[#f6f5f2] text-zinc-900">
      <header className="relative h-44 overflow-hidden sm:h-52">
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(135deg, ${c.banner} 0%, #f59e0b 45%, #fb923c 100%)`,
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, #000 1.5px, transparent 1.6px), radial-gradient(circle at 80% 40%, #000 1px, transparent 1.1px)",
            backgroundSize: "28px 28px",
          }}
        />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#f6f5f2] to-transparent" />
      </header>

      <div className="relative z-10 mx-auto -mt-16 max-w-lg px-4 pb-32">
        <div className="hp-rise flex flex-col items-center">
          {view.logoUrl ? (
            <img src={view.logoUrl} alt="" className="size-[5.5rem] rounded-[1.75rem] border-[3px] border-white object-cover shadow-[0_12px_40px_rgba(0,0,0,.18)]" />
          ) : (
            <div className="flex size-[5.5rem] items-center justify-center rounded-[1.75rem] border-[3px] border-white bg-white text-2xl font-extrabold shadow-[0_12px_40px_rgba(0,0,0,.18)]" style={{ color: c.accent }}>
              {view.name.slice(0, 2).toUpperCase()}
            </div>
          )}
        </div>

        <div className="hp-rise-2 mt-4 rounded-[1.35rem] bg-white p-5 shadow-[0_8px_30px_rgba(0,0,0,.06)]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-zinc-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white">
              {product.badge}
            </span>
            <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
              Aberto para pedidos
            </span>
          </div>
          <h1 className="hp-syne mt-3 text-[1.65rem] font-extrabold leading-[1.1] tracking-tight">{view.name}</h1>
          <p className="mt-1.5 text-sm text-zinc-500">{product.label} · {view.city}</p>
          <p className="mt-3 text-[15px] leading-relaxed text-zinc-600">{product.headlineHook}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold text-amber-600">{stars(view.rating)}</span>
            <span className="font-semibold text-zinc-800">{view.rating}</span>
            <span className="text-zinc-400">· {view.reviewCount} avaliações</span>
          </div>
          <a
            href={view.mapsUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-4 flex items-center justify-between rounded-2xl bg-zinc-50 px-4 py-3.5 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-100"
          >
            <span>Calcular tempo de entrega</span>
            <span className="text-zinc-400">→</span>
          </a>
        </div>

        <div className="hp-rise-3 mt-3 flex gap-2">
          <select
            className="flex-1 appearance-none rounded-2xl border-0 bg-white px-4 py-3.5 text-sm font-medium shadow-[0_4px_16px_rgba(0,0,0,.04)] outline-none"
            value={cat}
            onChange={(e) => setCat(e.target.value)}
          >
            <option value="Em destaque">Em destaque</option>
            {categories.map((x) => (
              <option key={x.category} value={x.category}>{x.category}</option>
            ))}
          </select>
          <input
            className="min-w-0 flex-[1.15] rounded-2xl border-0 bg-white px-4 py-3.5 text-sm shadow-[0_4px_16px_rgba(0,0,0,.04)] outline-none ring-amber-400/0 transition focus:ring-2"
            placeholder="Buscar produto"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {cat === "Em destaque" && !q && (
          <section className="hp-rise-4 mt-6">
            <h2 className="hp-syne mb-3 text-sm font-bold tracking-tight text-zinc-800">{product.galleryTitle}</h2>
            <div className="grid grid-cols-2 gap-3">
              {featured.map((item) => (
                <ProductCard key={`f-${item.name}`} item={item} accent={c.accent} onAdd={() => add(item)} />
              ))}
            </div>
          </section>
        )}

        <section className="mt-7">
          <h2 className="hp-syne mb-3 text-sm font-bold tracking-tight text-zinc-800">
            {cat === "Em destaque" ? product.servicesTitle : cat}
          </h2>
          <div className="space-y-2.5">
            {items.map((item) => (
              <ProductRow key={`${item.category}-${item.name}`} item={item} accent={c.accent} onAdd={() => add(item)} />
            ))}
            {items.length === 0 && (
              <p className="py-12 text-center text-sm text-zinc-400">Nenhum item nessa busca.</p>
            )}
          </div>
        </section>

        <p className="mt-10 text-center text-[10px] tracking-wide text-zinc-400">
          Prévia profissional · Time Dev Info Tech
        </p>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200/80 bg-white/90 backdrop-blur-xl"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto flex max-w-lg items-center justify-around px-2 py-2.5 text-[11px] font-semibold text-zinc-500">
          <button type="button" className="flex flex-col items-center gap-1" style={{ color: c.accent }} onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
            <IconHome /> Início
          </button>
          <button type="button" className="flex flex-col items-center gap-1" onClick={() => setCat("Em destaque")}>
            <IconPercent /> Promoções
          </button>
          <button type="button" className="relative flex flex-col items-center gap-1" onClick={() => setCartOpen(true)}>
            <IconBag />
            Sacola
            {totalQty > 0 && (
              <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: c.accent }}>
                {totalQty}
              </span>
            )}
          </button>
        </div>
      </nav>

      {cartOpen && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 backdrop-blur-[2px] sm:items-center" onClick={() => setCartOpen(false)}>
          <div className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-t-[1.75rem] bg-white p-5 shadow-2xl sm:rounded-[1.75rem]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="hp-syne text-lg font-bold">Sua sacola</h3>
              <button type="button" className="text-sm font-medium text-zinc-400" onClick={() => setCartOpen(false)}>Fechar</button>
            </div>
            {cart.length === 0 ? (
              <p className="py-12 text-center text-sm text-zinc-400">Sacola vazia — toque no + para adicionar.</p>
            ) : (
              <ul className="mt-5 space-y-4">
                {cart.map((l) => (
                  <li key={l.key} className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold">{l.name}</div>
                      <div className="text-sm text-zinc-500">{brl(l.price)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" className="flex size-9 items-center justify-center rounded-full bg-zinc-100 text-lg font-medium" onClick={() => bump(l.key, -1)}>−</button>
                      <span className="w-6 text-center font-bold">{l.qty}</span>
                      <button type="button" className="flex size-9 items-center justify-center rounded-full bg-zinc-100 text-lg font-medium" onClick={() => bump(l.key, 1)}>+</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-5 border-t border-zinc-100 pt-4">
              <div className="mb-4 flex justify-between text-sm font-bold">
                <span>Total</span>
                <span>{brl(total)}</span>
              </div>
              <a
                href={cart.length ? waHref(view.phone, orderText) : undefined}
                className={`block rounded-2xl py-4 text-center text-sm font-bold text-white transition ${cart.length ? "bg-emerald-600 hover:bg-emerald-500" : "pointer-events-none bg-zinc-300"}`}
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
          className="fixed bottom-[4.5rem] left-1/2 z-30 flex w-[min(100%-1.75rem,28rem)] -translate-x-1/2 items-center justify-between rounded-2xl bg-emerald-600 px-5 py-3.5 text-sm font-bold text-white shadow-[0_12px_40px_rgba(5,150,105,.35)] transition hover:bg-emerald-500"
          onClick={() => setCartOpen(true)}
        >
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
    <article className="hp-card overflow-hidden rounded-[1.25rem] bg-white shadow-[0_4px_20px_rgba(0,0,0,.05)]">
      <div className="relative aspect-square overflow-hidden bg-zinc-100">
        {item.image && <img src={item.image} alt="" className="hp-img size-full object-cover" />}
        <button
          type="button"
          aria-label={`Adicionar ${item.name}`}
          className="absolute bottom-2.5 right-2.5 flex size-10 items-center justify-center rounded-full text-xl font-bold text-white shadow-lg transition hover:scale-105"
          style={{ background: accent }}
          onClick={onAdd}
        >
          +
        </button>
      </div>
      <div className="p-3">
        <div className="line-clamp-2 text-[13px] font-bold leading-snug">{item.name}</div>
        <div className="mt-1.5 flex flex-wrap items-baseline gap-1.5">
          {from != null && <span className="text-[11px] text-zinc-400 line-through">{brl(from)}</span>}
          {from != null && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-700">Promo</span>}
          <span className="text-sm font-extrabold tracking-tight">{brl(item.price)}</span>
        </div>
      </div>
    </article>
  );
}

function ProductRow({ item, accent, onAdd }: { item: SitePreviewItem; accent: string; onAdd: () => void }) {
  return (
    <article className="hp-card flex gap-3.5 rounded-[1.25rem] bg-white p-2.5 shadow-[0_4px_20px_rgba(0,0,0,.04)]">
      <div className="min-w-0 flex-1 py-1 pl-1.5">
        <div className="font-bold leading-snug tracking-tight">{item.name}</div>
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-500">{item.description}</p>
        <div className="mt-2.5 text-sm font-extrabold tracking-tight">{brl(item.price)}</div>
      </div>
      <div className="relative size-[6.5rem] shrink-0 overflow-hidden rounded-[1rem] bg-zinc-100">
        {item.image && <img src={item.image} alt="" className="hp-img size-full object-cover" />}
        <button
          type="button"
          aria-label={`Adicionar ${item.name}`}
          className="absolute bottom-2 right-2 flex size-9 items-center justify-center rounded-full text-lg font-bold text-white shadow-lg transition hover:scale-105"
          style={{ background: accent }}
          onClick={onAdd}
        >
          +
        </button>
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
  const displayClass = product.family === "beauty" || product.family === "pro" || product.family === "trade" ? "hp-display" : "hp-syne";

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: c.bg, color: c.fg }}>
      <header className="relative isolate flex min-h-[100svh] max-h-[900px] items-end overflow-hidden">
        {photos[0] && (
          <img
            src={photos[0]}
            alt=""
            className="hp-ken absolute inset-0 size-full object-cover"
            style={{ opacity: light ? 0.42 : 0.55 }}
          />
        )}
        <div
          className="absolute inset-0"
          style={{
            background: light
              ? `linear-gradient(180deg, ${c.bg}30 0%, ${c.bg}88 42%, ${c.bg} 78%)`
              : `linear-gradient(180deg, ${c.bg}22 0%, ${c.bg}99 52%, ${c.bg} 100%),
                 radial-gradient(ellipse 70% 45% at 15% 0%, ${c.accent}33, transparent 55%)`,
          }}
        />

        <div className="relative mx-auto w-full max-w-3xl px-5 pb-14 pt-24 sm:pb-20">
          <p className="hp-rise text-[11px] font-bold uppercase tracking-[0.28em] opacity-75">
            {product.eyebrow}
          </p>
          <h1 className={`hp-rise-2 mt-4 text-[clamp(2.75rem,8vw,4.25rem)] font-bold leading-[0.98] tracking-[-0.03em] ${displayClass}`}>
            {view.name}
          </h1>
          <p className="hp-rise-3 mt-5 max-w-md text-[1.05rem] leading-relaxed opacity-90 sm:text-lg">
            {product.headlineHook}
          </p>
          <div className="hp-rise-3 mt-4 flex flex-wrap items-center gap-3 text-sm opacity-80">
            <span style={{ color: c.accent }} className="font-semibold">{stars(view.rating)} {view.rating}</span>
            <span className="opacity-50">·</span>
            <span>{view.reviewCount} no mapa · {view.city}</span>
          </div>
          <div className="hp-rise-4 mt-9 flex flex-wrap gap-3">
            <a
              href={wa}
              className="rounded-2xl px-6 py-3.5 text-sm font-bold tracking-tight shadow-[0_16px_40px_rgba(0,0,0,.2)] transition hover:-translate-y-0.5"
              style={{ background: c.accent, color: c.accentFg }}
            >
              {product.cta}
            </a>
            <a
              href={view.mapsUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-2xl border px-6 py-3.5 text-sm font-semibold transition hover:bg-white/5"
              style={{ borderColor: `${c.fg}28` }}
            >
              {product.ctaSecondary}
            </a>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-3xl space-y-16 px-5 pb-32 pt-6 sm:space-y-20">
        {photos.length > 1 && (
          <section>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] opacity-50">{product.galleryTitle}</p>
            <div className="mt-5 grid grid-cols-12 gap-2.5 sm:gap-3">
              {photos.slice(1, 7).map((src, i) => {
                const span =
                  i === 0 ? "col-span-12 sm:col-span-7 h-56 sm:h-72" :
                  i === 1 ? "col-span-6 sm:col-span-5 h-40 sm:h-72" :
                  i === 2 ? "col-span-6 sm:col-span-4 h-40 sm:h-52" :
                  "col-span-6 sm:col-span-4 h-40 sm:h-52";
                return (
                  <div key={`${src}-${i}`} className={`overflow-hidden rounded-[1.35rem] ${span}`}>
                    <img src={src} alt="" className="hp-img size-full object-cover" />
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section className="grid gap-8 sm:grid-cols-[1.2fr_1fr] sm:items-start">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] opacity-50">Sobre</p>
            <h2 className={`mt-3 text-3xl font-bold tracking-tight ${displayClass}`}>
              {product.label} em {view.city}
            </h2>
            <p className="mt-4 max-w-md text-[1.02rem] leading-relaxed opacity-85">
              {view.name} já aparece no mapa com {view.reviewCount} avaliações (nota {view.rating}).
              Esta página fecha o ciclo: presença própria, prova social e WhatsApp em um clique.
            </p>
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
                style={{ borderColor: `${c.fg}14`, background: light ? `${c.card}` : `${c.card}` }}
              >
                <dt className="text-[10px] font-bold uppercase tracking-[0.16em] opacity-45">{k}</dt>
                <dd className="mt-1.5 font-medium leading-snug">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        {services.length > 0 && (
          <section>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] opacity-50">{product.servicesTitle}</p>
            <h2 className={`mt-3 text-3xl font-bold tracking-tight ${displayClass}`}>Feito para converter</h2>
            <ul className="mt-7 grid gap-3 sm:grid-cols-3">
              {services.map((s) => (
                <li
                  key={s.name}
                  className="hp-card rounded-[1.35rem] border p-5"
                  style={{ borderColor: `${c.fg}14`, background: c.card }}
                >
                  {"hint" in s && s.hint ? (
                    <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: c.accent }}>
                      {s.hint}
                    </span>
                  ) : null}
                  <div className={`mt-2 text-lg font-bold tracking-tight ${displayClass}`} style={{ color: c.accent }}>
                    {s.name}
                  </div>
                  <p className="mt-2.5 text-sm leading-relaxed opacity-75">{s.description}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] opacity-50">{product.socialProofTitle}</p>
          <h2 className={`mt-3 text-3xl font-bold tracking-tight ${displayClass}`}>Prova no mapa</h2>
          <ul className="mt-7 space-y-3">
            {view.reviews.map((r) => (
              <li
                key={r.author}
                className="rounded-[1.35rem] border p-5"
                style={{ borderColor: `${c.fg}14`, background: c.card }}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-bold tracking-tight">{r.author}</span>
                  <span className="text-sm font-semibold" style={{ color: c.accent }}>{stars(r.rating)}</span>
                </div>
                <p className="mt-2.5 text-sm leading-relaxed opacity-80">{r.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section
          className="relative overflow-hidden rounded-[1.75rem] px-6 py-10 text-center sm:px-10"
          style={{ background: `linear-gradient(135deg, ${c.accent}22, ${c.card})`, border: `1px solid ${c.accent}40` }}
        >
          <p className={`text-2xl font-bold tracking-tight sm:text-3xl ${displayClass}`}>
            Pronto para o próximo cliente
          </p>
          <p className="mx-auto mt-3 max-w-md text-sm opacity-75">
            Link clicável no WhatsApp · visual de produto final · feito pelo Time Dev
          </p>
          <a
            href={wa}
            className="mt-6 inline-flex rounded-2xl px-7 py-3.5 text-sm font-bold transition hover:-translate-y-0.5"
            style={{ background: c.accent, color: c.accentFg }}
          >
            {product.cta}
          </a>
        </section>

        <p className="text-center text-[10px] tracking-[0.16em] uppercase opacity-40">
          {product.label} · Time Dev Info Tech
        </p>
      </main>

      <div
        className="fixed inset-x-0 bottom-0 z-20 flex gap-2 border-t px-4 py-3 backdrop-blur-xl"
        style={{
          borderColor: `${c.fg}12`,
          background: `${c.bg}e8`,
          paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))",
        }}
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
