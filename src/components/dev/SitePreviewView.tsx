import { useMemo, useState } from "react";
import type { SitePreview, SitePreviewItem } from "@/lib/types";
import { enrichPreviewMedia, resolvePreviewKind } from "@/lib/dev/presence";
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

export function SitePreviewView({ preview }: { preview: SitePreview }) {
  const view = enrichPreviewMedia(preview);
  const kind = resolvePreviewKind(view.name, view.segment);
  if (kind.food && view.menu?.length) {
    return <DeliveryStorefront view={view} />;
  }
  return <ServiceStorefront view={{ ...view, menu: undefined }} />;
}

/** Cardápio vendável estilo delivery: + carrinho, categorias, fechar no WhatsApp. */
function DeliveryStorefront({ view }: { view: SitePreview }) {
  const categories = view.menu ?? [];
  const [cat, setCat] = useState(categories[0]?.category ?? "Em destaque");
  const [q, setQ] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);

  const items = useMemo(() => {
    const pool = categories.flatMap((c) =>
      c.items.map((it) => ({ ...it, category: c.category })),
    );
    return pool.filter((it) => {
      const hitCat = cat === "Em destaque" || it.category === cat;
      const hitQ = !q.trim() || `${it.name} ${it.description}`.toLowerCase().includes(q.toLowerCase());
      return hitCat && hitQ;
    });
  }, [categories, cat, q]);

  const featured = categories.flatMap((c) => c.items).slice(0, 6);
  const totalQty = cart.reduce((s, l) => s + l.qty, 0);
  const total = cart.reduce((s, l) => s + l.price * l.qty, 0);

  const add = (item: SitePreviewItem) => {
    const key = item.name;
    setCart((prev) => {
      const hit = prev.find((l) => l.key === key);
      if (hit) return prev.map((l) => (l.key === key ? { ...l, qty: l.qty + 1 } : l));
      return [...prev, { key, name: item.name, price: item.price, qty: 1 }];
    });
  };

  const bump = (key: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((l) => (l.key === key ? { ...l, qty: l.qty + delta } : l))
        .filter((l) => l.qty > 0),
    );
  };

  const orderText =
    `Olá! Quero pedir na ${view.name}:\n` +
    cart.map((l) => `• ${l.qty}x ${l.name} — ${brl(l.price * l.qty)}`).join("\n") +
    `\n\nTotal: ${brl(total)}\nEndereço: ${view.address}`;

  const open = /fechado|closed/i.test(view.hours) ? false : true;

  return (
    <div className="min-h-screen bg-[#f3f4f6] text-zinc-900">
      <header className="relative overflow-hidden bg-amber-400">
        <div
          className="absolute inset-0 opacity-25"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg width='60' height='60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M20 30c0-6 4-10 10-10s10 4 10 10-4 10-10 10-10-4-10-10zm-8 0c0 2 1 4 3 5M48 30c0 2-1 4-3 5' fill='none' stroke='%23000' stroke-width='2'/%3E%3C/svg%3E\")",
          }}
        />
        <div className="relative mx-auto flex max-w-lg flex-col items-center px-4 pb-14 pt-10">
          {view.logoUrl ? (
            <img src={view.logoUrl} alt="" className="size-24 rounded-full border-4 border-white object-cover shadow-lg" />
          ) : (
            <div className="flex size-24 items-center justify-center rounded-full border-4 border-white bg-white text-2xl font-black text-amber-600 shadow-lg">
              {view.name.slice(0, 2).toUpperCase()}
            </div>
          )}
        </div>
      </header>

      <div className="relative z-10 mx-auto -mt-8 max-w-lg px-3 pb-28">
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <h1 className="text-xl font-bold tracking-tight">{view.name}</h1>
          <p className="mt-1 text-sm text-zinc-500">{view.segment} · {view.city}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${open ? "bg-emerald-100 text-emerald-800" : "bg-zinc-200 text-zinc-600"}`}>
              {open ? "Aberto para pedidos" : "Fechado para pedidos"}
            </span>
            <span className="text-amber-600">{stars(view.rating)}</span>
            <span className="text-zinc-500">{view.rating} · {view.reviewCount} no mapa</span>
          </div>
          <p className="mt-2 text-sm text-zinc-600">{view.tagline}</p>
          <a href={view.mapsUrl} target="_blank" rel="noreferrer" className="mt-3 flex items-center justify-between rounded-xl bg-zinc-100 px-3 py-2.5 text-sm font-medium text-zinc-800">
            Calcular tempo de entrega
            <span aria-hidden>→</span>
          </a>
        </div>

        <div className="mt-3 flex gap-2">
          <select
            className="flex-1 rounded-xl border-0 bg-white px-3 py-2.5 text-sm shadow-sm"
            value={cat}
            onChange={(e) => setCat(e.target.value)}
          >
            <option value="Em destaque">Em destaque</option>
            {categories.map((c) => (
              <option key={c.category} value={c.category}>{c.category}</option>
            ))}
          </select>
          <input
            className="flex-[1.2] rounded-xl border-0 bg-white px-3 py-2.5 text-sm shadow-sm outline-none ring-amber-400 focus:ring-2"
            placeholder="Buscar produto"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {cat === "Em destaque" && !q && (
          <section className="mt-4">
            <h2 className="mb-2 text-sm font-semibold text-zinc-700">Em destaque</h2>
            <div className="grid grid-cols-2 gap-2.5">
              {featured.map((item) => (
                <ProductCard key={`f-${item.name}`} item={item} promo={item.price > 40} onAdd={() => add(item)} />
              ))}
            </div>
          </section>
        )}

        <section className="mt-5">
          <h2 className="mb-2 text-sm font-semibold text-zinc-700">{cat === "Em destaque" ? "Cardápio" : cat}</h2>
          <div className="space-y-2">
            {items.map((item) => (
              <ProductRow key={`${item.category}-${item.name}`} item={item} promo={/promo|especial|tudo/i.test(item.name)} onAdd={() => add(item)} />
            ))}
            {items.length === 0 && <p className="py-8 text-center text-sm text-zinc-500">Nenhum item nessa busca.</p>}
          </div>
        </section>

        <p className="mt-8 text-center text-[10px] text-zinc-400">
          Prévia · Time Dev Info Tech · simulação de pedidos no WhatsApp
        </p>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200 bg-white/95 backdrop-blur" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="mx-auto flex max-w-lg items-center justify-around px-2 py-2 text-[11px] font-medium text-zinc-600">
          <button type="button" className="flex flex-col items-center gap-0.5 text-amber-600" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
            <span className="text-lg">⌂</span> Início
          </button>
          <button type="button" className="flex flex-col items-center gap-0.5" onClick={() => setCat("Em destaque")}>
            <span className="text-lg">%</span> Promoções
          </button>
          <button type="button" className="relative flex flex-col items-center gap-0.5" onClick={() => setCartOpen(true)}>
            <span className="text-lg">🛒</span> Sacola
            {totalQty > 0 && (
              <span className="absolute -right-2 -top-1 flex size-5 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white">{totalQty}</span>
            )}
          </button>
        </div>
      </nav>

      {cartOpen && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setCartOpen(false)}>
          <div className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">Sua sacola</h3>
              <button type="button" className="text-sm text-zinc-500" onClick={() => setCartOpen(false)}>Fechar</button>
            </div>
            {cart.length === 0 ? (
              <p className="py-10 text-center text-sm text-zinc-500">Sacola vazia — toque no + para adicionar.</p>
            ) : (
              <ul className="mt-4 space-y-3">
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
              <div className="mb-3 flex justify-between text-sm font-semibold">
                <span>Total</span>
                <span>{brl(total)}</span>
              </div>
              <a
                href={cart.length ? waHref(view.phone, orderText) : undefined}
                className={`block rounded-xl py-3.5 text-center text-sm font-bold text-white ${cart.length ? "bg-emerald-600" : "pointer-events-none bg-zinc-300"}`}
              >
                Finalizar no WhatsApp
              </a>
            </div>
          </div>
        </div>
      )}

      {totalQty > 0 && !cartOpen && (
        <button
          type="button"
          className="fixed bottom-16 left-1/2 z-30 flex w-[min(100%-1.5rem,28rem)] -translate-x-1/2 items-center justify-between rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-lg"
          onClick={() => setCartOpen(true)}
        >
          <span>{totalQty} {totalQty === 1 ? "item" : "itens"}</span>
          <span>Ver sacola · {brl(total)}</span>
        </button>
      )}
    </div>
  );
}

function ProductCard({ item, promo, onAdd }: { item: SitePreviewItem; promo?: boolean; onAdd: () => void }) {
  const from = promo ? Math.round(item.price * 1.12) : null;
  return (
    <article className="overflow-hidden rounded-2xl bg-white shadow-sm">
      <div className="relative aspect-square bg-zinc-100">
        {item.image && <img src={item.image} alt="" className="size-full object-cover" />}
        <button
          type="button"
          aria-label={`Adicionar ${item.name}`}
          className="absolute bottom-2 right-2 flex size-9 items-center justify-center rounded-full bg-red-600 text-xl font-bold text-white shadow"
          onClick={onAdd}
        >
          +
        </button>
      </div>
      <div className="p-2.5">
        <div className="line-clamp-2 text-sm font-semibold leading-snug">{item.name}</div>
        <div className="mt-1 flex flex-wrap items-baseline gap-1.5">
          {from != null && <span className="text-xs text-zinc-400 line-through">{brl(from)}</span>}
          {promo && <span className="rounded bg-emerald-100 px-1 text-[10px] font-bold text-emerald-700">Promo</span>}
          <span className="text-sm font-bold text-zinc-900">{brl(item.price)}</span>
        </div>
      </div>
    </article>
  );
}

function ProductRow({ item, promo, onAdd }: { item: SitePreviewItem; promo?: boolean; onAdd: () => void }) {
  const from = promo ? Math.round(item.price * 1.1) : null;
  return (
    <article className="flex gap-3 rounded-2xl bg-white p-2.5 shadow-sm">
      <div className="min-w-0 flex-1">
        <div className="font-semibold leading-snug">{item.name}</div>
        <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{item.description}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {from != null && <span className="text-xs text-zinc-400 line-through">{brl(from)}</span>}
          {promo && <span className="rounded bg-emerald-100 px-1 text-[10px] font-bold text-emerald-700">Promo</span>}
          <span className="text-sm font-bold">{brl(item.price)}</span>
        </div>
      </div>
      <div className="relative size-24 shrink-0 overflow-hidden rounded-xl bg-zinc-100">
        {item.image && <img src={item.image} alt="" className="size-full object-cover" />}
        <button
          type="button"
          aria-label={`Adicionar ${item.name}`}
          className="absolute bottom-1.5 right-1.5 flex size-8 items-center justify-center rounded-full bg-red-600 text-lg font-bold text-white shadow"
          onClick={onAdd}
        >
          +
        </button>
      </div>
    </article>
  );
}

/** Site profissional de serviço (chaveiro, clínica, etc.) — sem cardápio. */
function ServiceStorefront({ view }: { view: SitePreview }) {
  const wa = waHref(view.phone, `Olá! Vi o site da ${view.name} e quero um orçamento.`);
  const photos = view.photos.length ? view.photos : [];

  return (
    <div className="min-h-screen bg-[#0b1220] text-slate-100">
      <header className="relative isolate min-h-[70vh] overflow-hidden">
        {photos[0] && (
          <img src={photos[0]} alt="" className="absolute inset-0 size-full object-cover opacity-45" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0b1220]/30 via-[#0b1220]/75 to-[#0b1220]" />
        <div className="relative mx-auto flex min-h-[70vh] max-w-3xl flex-col justify-end px-5 pb-12 pt-20">
          {view.logoUrl && (
            <img src={view.logoUrl} alt="" className="mb-5 size-16 rounded-2xl border border-white/20 object-cover shadow-xl" />
          )}
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-300/90">
            {view.segment} · {view.city}
          </p>
          <h1 className="mt-3 font-serif text-4xl leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
            {view.name}
          </h1>
          <p className="mt-3 max-w-xl text-base text-slate-200/90 sm:text-lg">
            {view.tagline.includes("cardápio")
              ? `${view.name} em ${view.city}: atendimento, horário e WhatsApp em um site próprio.`
              : view.tagline}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-300">
            <span className="text-amber-300">{stars(view.rating)} {view.rating}</span>
            <span>{view.reviewCount} avaliações no mapa</span>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href={wa} className="rounded-xl bg-amber-400 px-5 py-3 text-sm font-bold text-zinc-900 shadow-lg transition hover:-translate-y-0.5">
              Pedir orçamento no WhatsApp
            </a>
            <a href={view.mapsUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-white/25 px-5 py-3 text-sm font-semibold">
              Ver no mapa
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-12 px-5 pb-28 pt-10">
        {photos.length > 1 && (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Galeria</h2>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {photos.slice(1, 7).map((src, i) => (
                <img key={`${src}-${i}`} src={src} alt="" className="h-36 w-full rounded-xl object-cover sm:h-44" />
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Sobre</h2>
          <p className="mt-3 leading-relaxed text-slate-200">
            {/cardápio|pedido no WhatsApp/i.test(view.about)
              ? `${view.name} em ${view.city} aparece no mapa com ${view.reviewCount} avaliações. Esta página organiza horário, endereço e WhatsApp para quem precisa do serviço agora.`
              : view.about}
          </p>
          <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <dt className="text-xs uppercase tracking-wide text-slate-400">Endereço</dt>
              <dd className="mt-1">{view.address}</dd>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <dt className="text-xs uppercase tracking-wide text-slate-400">Horário</dt>
              <dd className="mt-1">{view.hours}</dd>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <dt className="text-xs uppercase tracking-wide text-slate-400">WhatsApp</dt>
              <dd className="mt-1">{view.phone}</dd>
            </div>
          </dl>
        </section>

        {view.services && view.services.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Serviços</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-3">
              {view.services.map((s) => (
                <li key={s.name} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="font-semibold text-amber-200">{s.name}</div>
                  <p className="mt-2 text-sm text-slate-300">{s.description}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">O que dizem no mapa</h2>
          <ul className="mt-4 space-y-3">
            {view.reviews.map((r) => (
              <li key={r.author} className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="font-medium">{r.author}</span>
                  <span className="text-amber-300">{stars(r.rating)}</span>
                </div>
                <p className="mt-2 text-slate-300">{r.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <p className="text-center text-[11px] text-slate-500">Arte · Sofia · Time Dev Info Tech</p>
      </main>

      <div
        className="fixed inset-x-0 bottom-0 z-20 flex gap-2 border-t border-white/10 bg-[#0b1220]/95 px-4 py-3 backdrop-blur"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        <a href={wa} className="flex-1 rounded-xl bg-amber-400 py-3 text-center text-sm font-bold text-zinc-900">
          WhatsApp
        </a>
        <a href={view.mapsUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-white/20 px-4 py-3 text-sm font-semibold">
          Mapa
        </a>
      </div>
    </div>
  );
}
