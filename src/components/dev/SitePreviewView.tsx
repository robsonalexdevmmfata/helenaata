import { useMemo, useState } from "react";
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

type CartLine = { key: string; name: string; price: number; qty: number };

function mergeProduct(view: SitePreview, product: NicheProduct): SitePreview {
  const photos = product.photos.length
    ? [...product.photos]
    : view.photos;
  const services =
    product.family === "delivery"
      ? undefined
      : (product.services.length
        ? product.services.map(({ name, description }) => ({ name, description }))
        : view.services);
  return {
    ...view,
    segment: product.label || view.segment,
    photos,
    services,
    menu: product.family === "delivery" ? view.menu : undefined,
    tagline: product.headlineHook,
    palette: {
      bg: product.colors.bg,
      fg: product.colors.fg,
      accent: product.colors.accent,
    },
  };
}

export function SitePreviewView({ preview }: { preview: SitePreview }) {
  const enriched = enrichPreviewMedia(preview);
  const product = resolveNicheProduct(enriched.name, enriched.segment);
  const view = mergeProduct(enriched, product);
  const kind = resolvePreviewKind(view.name, view.segment);

  if ((product.family === "delivery" || kind.food) && view.menu?.length) {
    return <DeliveryStorefront view={view} product={product} />;
  }
  return <NicheStorefront view={view} product={product} />;
}

/** Delivery vendável com sacola. */
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
    <div className="min-h-screen" style={{ background: c.bg, color: c.fg }}>
      <header className="relative overflow-hidden" style={{ background: c.banner }}>
        <div className="relative mx-auto flex max-w-lg flex-col items-center px-4 pb-14 pt-10">
          {view.logoUrl ? (
            <img src={view.logoUrl} alt="" className="size-24 rounded-full border-4 border-white object-cover shadow-lg" />
          ) : (
            <div className="flex size-24 items-center justify-center rounded-full border-4 border-white bg-white text-2xl font-black shadow-lg" style={{ color: c.accent }}>
              {view.name.slice(0, 2).toUpperCase()}
            </div>
          )}
        </div>
      </header>

      <div className="relative z-10 mx-auto -mt-8 max-w-lg px-3 pb-28">
        <div className="rounded-2xl p-4 shadow-sm" style={{ background: c.card }}>
          <span className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ background: `${c.accent}22`, color: c.accent }}>
            {product.badge}
          </span>
          <h1 className="mt-2 text-xl font-bold tracking-tight">{view.name}</h1>
          <p className="mt-1 text-sm opacity-70">{product.label} · {view.city}</p>
          <p className="mt-2 text-sm opacity-80">{product.headlineHook}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">Aberto para pedidos</span>
            <span style={{ color: c.accent }}>{stars(view.rating)}</span>
            <span className="opacity-60">{view.rating} · {view.reviewCount}</span>
          </div>
          <a href={view.mapsUrl} target="_blank" rel="noreferrer" className="mt-3 flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium" style={{ background: `${c.fg}0d` }}>
            Calcular tempo de entrega <span>→</span>
          </a>
        </div>

        <div className="mt-3 flex gap-2">
          <select className="flex-1 rounded-xl border-0 px-3 py-2.5 text-sm shadow-sm" style={{ background: c.card }} value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="Em destaque">Em destaque</option>
            {categories.map((x) => <option key={x.category} value={x.category}>{x.category}</option>)}
          </select>
          <input className="flex-[1.2] rounded-xl border-0 px-3 py-2.5 text-sm shadow-sm outline-none" style={{ background: c.card }} placeholder="Buscar produto" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        {cat === "Em destaque" && !q && (
          <section className="mt-4">
            <h2 className="mb-2 text-sm font-semibold opacity-80">{product.galleryTitle}</h2>
            <div className="grid grid-cols-2 gap-2.5">
              {featured.map((item) => <ProductCard key={`f-${item.name}`} item={item} accent={c.accent} onAdd={() => add(item)} />)}
            </div>
          </section>
        )}

        <section className="mt-5">
          <h2 className="mb-2 text-sm font-semibold opacity-80">{cat === "Em destaque" ? product.servicesTitle : cat}</h2>
          <div className="space-y-2">
            {items.map((item) => <ProductRow key={`${item.category}-${item.name}`} item={item} accent={c.accent} onAdd={() => add(item)} />)}
          </div>
        </section>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-white/95 backdrop-blur" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="mx-auto flex max-w-lg items-center justify-around px-2 py-2 text-[11px] font-medium text-zinc-600">
          <button type="button" className="flex flex-col items-center gap-0.5" style={{ color: c.accent }} onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
            <span className="text-lg">⌂</span> Início
          </button>
          <button type="button" className="flex flex-col items-center gap-0.5" onClick={() => setCat("Em destaque")}>
            <span className="text-lg">%</span> Promoções
          </button>
          <button type="button" className="relative flex flex-col items-center gap-0.5" onClick={() => setCartOpen(true)}>
            <span className="text-lg">🛒</span> Sacola
            {totalQty > 0 && <span className="absolute -right-2 -top-1 flex size-5 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: c.accent }}>{totalQty}</span>}
          </button>
        </div>
      </nav>

      {cartOpen && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setCartOpen(false)}>
          <div className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-zinc-900">Sua sacola</h3>
              <button type="button" className="text-sm text-zinc-500" onClick={() => setCartOpen(false)}>Fechar</button>
            </div>
            {cart.length === 0 ? (
              <p className="py-10 text-center text-sm text-zinc-500">Sacola vazia — toque no +.</p>
            ) : (
              <ul className="mt-4 space-y-3 text-zinc-900">
                {cart.map((l) => (
                  <li key={l.key} className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium">{l.name}</div>
                      <div className="text-sm text-zinc-500">{brl(l.price)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" className="size-8 rounded-full bg-zinc-100 text-lg" onClick={() => bump(l.key, -1)}>−</button>
                      <span className="w-6 text-center font-semibold">{l.qty}</span>
                      <button type="button" className="size-8 rounded-full bg-zinc-100 text-lg" onClick={() => bump(l.key, 1)}>+</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 border-t pt-4">
              <div className="mb-3 flex justify-between text-sm font-semibold text-zinc-900">
                <span>Total</span><span>{brl(total)}</span>
              </div>
              <a href={cart.length ? waHref(view.phone, orderText) : undefined} className={`block rounded-xl py-3.5 text-center text-sm font-bold text-white ${cart.length ? "" : "pointer-events-none bg-zinc-300"}`} style={cart.length ? { background: "#059669" } : undefined}>
                {product.cta}
              </a>
            </div>
          </div>
        </div>
      )}

      {totalQty > 0 && !cartOpen && (
        <button type="button" className="fixed bottom-16 left-1/2 z-30 flex w-[min(100%-1.5rem,28rem)] -translate-x-1/2 items-center justify-between rounded-xl px-4 py-3 text-sm font-bold text-white shadow-lg" style={{ background: "#059669" }} onClick={() => setCartOpen(true)}>
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
    <article className="overflow-hidden rounded-2xl bg-white shadow-sm text-zinc-900">
      <div className="relative aspect-square bg-zinc-100">
        {item.image && <img src={item.image} alt="" className="size-full object-cover" />}
        <button type="button" aria-label={`Adicionar ${item.name}`} className="absolute bottom-2 right-2 flex size-9 items-center justify-center rounded-full text-xl font-bold text-white shadow" style={{ background: accent }} onClick={onAdd}>+</button>
      </div>
      <div className="p-2.5">
        <div className="line-clamp-2 text-sm font-semibold leading-snug">{item.name}</div>
        <div className="mt-1 flex flex-wrap items-baseline gap-1.5">
          {from != null && <span className="text-xs text-zinc-400 line-through">{brl(from)}</span>}
          {from != null && <span className="rounded bg-emerald-100 px-1 text-[10px] font-bold text-emerald-700">Promo</span>}
          <span className="text-sm font-bold">{brl(item.price)}</span>
        </div>
      </div>
    </article>
  );
}

function ProductRow({ item, accent, onAdd }: { item: SitePreviewItem; accent: string; onAdd: () => void }) {
  return (
    <article className="flex gap-3 rounded-2xl bg-white p-2.5 shadow-sm text-zinc-900">
      <div className="min-w-0 flex-1">
        <div className="font-semibold leading-snug">{item.name}</div>
        <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{item.description}</p>
        <div className="mt-2 text-sm font-bold">{brl(item.price)}</div>
      </div>
      <div className="relative size-24 shrink-0 overflow-hidden rounded-xl bg-zinc-100">
        {item.image && <img src={item.image} alt="" className="size-full object-cover" />}
        <button type="button" aria-label={`Adicionar ${item.name}`} className="absolute bottom-1.5 right-1.5 flex size-8 items-center justify-center rounded-full text-lg font-bold text-white shadow" style={{ background: accent }} onClick={onAdd}>+</button>
      </div>
    </article>
  );
}

/** Site espetacular por nicho (beleza, clínica, chaveiro, doce, pro…). */
function NicheStorefront({ view, product }: { view: SitePreview; product: NicheProduct }) {
  const c = product.colors;
  const light = product.surface === "light";
  const wa = waHref(view.phone, product.waPrefill(view.name));
  const photos = view.photos.length ? view.photos : product.photos;
  const services = view.services?.length
    ? view.services.map((s, i) => ({ ...s, hint: product.services[i]?.hint }))
    : product.services;

  return (
    <div className="min-h-screen" style={{ background: c.bg, color: c.fg }}>
      <header className="relative isolate min-h-[min(72vh,620px)] overflow-hidden">
        {photos[0] && (
          <img
            src={photos[0]}
            alt=""
            className="absolute inset-0 size-full object-cover"
            style={{ opacity: light ? 0.35 : 0.5, filter: light ? "saturate(1.05)" : "saturate(1.1) contrast(1.05)" }}
          />
        )}
        <div
          className="absolute inset-0"
          style={{
            background: light
              ? `linear-gradient(180deg, ${c.banner}cc 0%, ${c.bg}f2 55%, ${c.bg} 100%)`
              : `linear-gradient(180deg, ${c.bg}40 0%, ${c.bg}c8 48%, ${c.bg} 100%)`,
          }}
        />
        <div className="relative mx-auto flex min-h-[min(72vh,620px)] max-w-3xl flex-col justify-end px-5 pb-12 pt-20">
          <span
            className="mb-4 w-fit rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em]"
            style={{ background: `${c.accent}33`, color: light ? c.fg : c.accent }}
          >
            {product.badge}
          </span>
          {view.logoUrl && (
            <img src={view.logoUrl} alt="" className="mb-4 size-16 rounded-2xl border object-cover shadow-xl" style={{ borderColor: `${c.fg}33` }} />
          )}
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] opacity-80">
            {product.eyebrow} · {view.city}
          </p>
          <h1 className="mt-3 font-serif text-4xl leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
            {view.name}
          </h1>
          <p className="mt-3 max-w-xl text-base opacity-90 sm:text-lg">{product.headlineHook}</p>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm opacity-85">
            <span style={{ color: c.accent }}>{stars(view.rating)} {view.rating}</span>
            <span>{view.reviewCount} avaliações no mapa</span>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href={wa}
              className="rounded-xl px-5 py-3 text-sm font-bold shadow-lg transition hover:-translate-y-0.5"
              style={{ background: c.accent, color: c.accentFg }}
            >
              {product.cta}
            </a>
            <a
              href={view.mapsUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border px-5 py-3 text-sm font-semibold"
              style={{ borderColor: `${c.fg}33` }}
            >
              {product.ctaSecondary}
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-12 px-5 pb-28 pt-10">
        {photos.length > 1 && (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] opacity-60">{product.galleryTitle}</h2>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {photos.slice(1, 7).map((src, i) => (
                <img
                  key={`${src}-${i}`}
                  src={src}
                  alt=""
                  className={`w-full rounded-2xl object-cover shadow-sm ${i === 0 ? "col-span-2 h-48 sm:col-span-1 sm:h-44" : "h-36 sm:h-44"}`}
                />
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] opacity-60">Sobre</h2>
          <p className="mt-3 leading-relaxed opacity-90">
            {view.name} em {view.city} — {view.reviewCount} avaliações (nota {view.rating}). {product.headlineHook}.
          </p>
          <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-3">
            {[
              ["Endereço", view.address],
              ["Horário", view.hours],
              ["WhatsApp", view.phone],
            ].map(([k, v]) => (
              <div key={k} className="rounded-2xl border p-3" style={{ borderColor: `${c.fg}18`, background: light ? c.card : c.card }}>
                <dt className="text-xs uppercase tracking-wide opacity-55">{k}</dt>
                <dd className="mt-1 font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        {services.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] opacity-60">{product.servicesTitle}</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-3">
              {services.map((s) => (
                <li
                  key={s.name}
                  className="group rounded-2xl border p-4 transition hover:-translate-y-0.5"
                  style={{ borderColor: `${c.fg}18`, background: c.card }}
                >
                  {"hint" in s && s.hint && (
                    <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: c.accent }}>{s.hint}</span>
                  )}
                  <div className="mt-1 font-semibold" style={{ color: c.accent }}>{s.name}</div>
                  <p className="mt-2 text-sm opacity-75">{s.description}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] opacity-60">{product.socialProofTitle}</h2>
          <ul className="mt-4 space-y-3">
            {view.reviews.map((r) => (
              <li key={r.author} className="rounded-2xl border p-4 text-sm" style={{ borderColor: `${c.fg}18`, background: c.card }}>
                <div className="flex justify-between gap-2">
                  <span className="font-medium">{r.author}</span>
                  <span style={{ color: c.accent }}>{stars(r.rating)}</span>
                </div>
                <p className="mt-2 opacity-80">{r.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <div className="rounded-2xl border p-5 text-center" style={{ borderColor: `${c.accent}55`, background: `${c.accent}14` }}>
          <p className="text-sm font-medium opacity-90">Pronto para o próximo cliente?</p>
          <a href={wa} className="mt-3 inline-flex rounded-xl px-5 py-3 text-sm font-bold" style={{ background: c.accent, color: c.accentFg }}>
            {product.cta}
          </a>
        </div>

        <p className="text-center text-[11px] opacity-45">Produto · {product.label} · Time Dev Info Tech</p>
      </main>

      <div
        className="fixed inset-x-0 bottom-0 z-20 flex gap-2 border-t px-4 py-3 backdrop-blur"
        style={{
          borderColor: `${c.fg}14`,
          background: `${c.bg}f2`,
          paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))",
        }}
      >
        <a href={wa} className="flex-1 rounded-xl py-3 text-center text-sm font-bold" style={{ background: c.accent, color: c.accentFg }}>
          {product.cta}
        </a>
        <a href={view.mapsUrl} target="_blank" rel="noreferrer" className="rounded-xl border px-4 py-3 text-sm font-semibold" style={{ borderColor: `${c.fg}33` }}>
          Mapa
        </a>
      </div>
    </div>
  );
}
