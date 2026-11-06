import type { SitePreview } from "@/lib/types";
import { enrichPreviewMedia } from "@/lib/dev/presence";
import { brl } from "@/lib/format";

function stars(n: number) {
  const full = Math.round(n);
  return "★".repeat(Math.min(5, full)) + "☆".repeat(Math.max(0, 5 - full));
}

export function SitePreviewView({ preview }: { preview: SitePreview }) {
  const view = enrichPreviewMedia(preview);
  const { palette } = view;
  const wa = view.phone.replace(/\D/g, "");
  const waLink = `https://wa.me/${wa.startsWith("55") ? wa : `55${wa}`}`;
  const gallery = view.photos.slice(1);
  const featured = view.menu?.flatMap((c) => c.items).filter((i) => i.image).slice(0, 4) ?? [];
  const hasMenu = Boolean(view.menu?.length);

  return (
    <div
      className="relative min-h-screen overflow-x-hidden"
      style={{
        background: palette.bg,
        color: palette.fg,
        backgroundImage: `radial-gradient(ellipse 80% 50% at 10% -10%, ${palette.accent}44, transparent 55%), radial-gradient(ellipse 60% 40% at 100% 0%, ${palette.fg}14, transparent 50%)`,
      }}
    >
      <header className="relative isolate flex min-h-[min(78vh,640px)] items-end overflow-hidden">
        {view.photos[0] && (
          <img
            src={view.photos[0]}
            alt=""
            className="absolute inset-0 size-full scale-105 object-cover saturate-[1.05] contrast-[1.05]"
          />
        )}
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(180deg, ${palette.bg}40 0%, ${palette.bg}b8 45%, ${palette.bg} 100%)`,
          }}
        />
        <div className="relative mx-auto w-full max-w-3xl px-5 pb-14 pt-16 sm:pb-20 sm:pt-24">
          {view.logoUrl && (
            <img
              src={view.logoUrl}
              alt=""
              className="mb-4 size-20 rounded-[1.15rem] border-2 object-cover shadow-xl sm:size-20"
              style={{ borderColor: `${palette.fg}38` }}
            />
          )}
          <p className="text-[11px] uppercase tracking-[0.22em] opacity-80">
            {view.segment} · {view.city}
          </p>
          <h1 className="mt-3 font-serif text-4xl leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
            {view.name}
          </h1>
          <p className="mt-3 max-w-xl text-base opacity-90 sm:text-lg">{view.tagline}</p>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
            <span style={{ color: palette.accent }}>
              {stars(view.rating)} {view.rating}
            </span>
            <span className="opacity-70">{view.reviewCount} avaliações no mapa</span>
          </div>
          <div className="mt-8 hidden flex-wrap gap-3 sm:flex">
            <a
              href={waLink}
              className="rounded-xl px-5 py-2.5 text-sm font-bold shadow-lg transition hover:-translate-y-0.5"
              style={{ background: palette.accent, color: palette.bg }}
            >
              {hasMenu ? "Pedir no WhatsApp" : "Falar no WhatsApp"}
            </a>
            <a
              href={view.mapsUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border px-5 py-2.5 text-sm font-semibold"
              style={{ borderColor: `${palette.fg}33` }}
            >
              Ver no mapa
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-14 px-4 pb-28 sm:px-5 sm:pb-24">
        {gallery.length > 0 && (
          <section>
            <h2 className="text-sm uppercase tracking-[0.16em] opacity-70">
              {hasMenu ? "Ambiente & pratos" : "Ambiente & serviços"}
            </h2>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
              {gallery.map((src, i) => (
                <img
                  key={`${src}-${i}`}
                  src={src}
                  alt=""
                  className={`w-full rounded-xl object-cover ${i === 0 || i === 3 ? "col-span-2 h-48 sm:col-span-1 sm:h-56" : "h-36 sm:h-56"} ${i === 0 ? "sm:row-span-2 sm:h-full min-h-[14rem]" : ""}`}
                />
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="text-sm uppercase tracking-[0.16em] opacity-70">Sobre</h2>
          <p className="mt-3 leading-relaxed opacity-90">{view.about}</p>
          <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="opacity-60">Endereço</dt>
              <dd>{view.address}</dd>
            </div>
            <div>
              <dt className="opacity-60">Horário</dt>
              <dd>{view.hours}</dd>
            </div>
            <div>
              <dt className="opacity-60">Telefone</dt>
              <dd>{view.phone}</dd>
            </div>
          </dl>
        </section>

        {featured.length > 0 && (
          <section>
            <h2 className="text-sm uppercase tracking-[0.16em] opacity-70">Destaques do cardápio</h2>
            <div className="mt-4 flex gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {featured.map((item) => (
                <article
                  key={`feat-${item.name}`}
                  className="w-44 shrink-0 overflow-hidden rounded-2xl border sm:w-52"
                  style={{ borderColor: `${palette.fg}18`, background: `${palette.fg}08` }}
                >
                  <img src={item.image} alt="" className="h-32 w-full object-cover sm:h-36" />
                  <div className="p-3">
                    <div className="truncate text-sm font-medium">{item.name}</div>
                    <div className="mt-1 text-sm" style={{ color: palette.accent }}>
                      {brl(item.price)}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {view.menu && (
          <section>
            <h2 className="text-sm uppercase tracking-[0.16em] opacity-70">Cardápio online</h2>
            <div className="mt-5 space-y-10">
              {view.menu.map((cat) => (
                <div key={cat.category}>
                  <h3 className="font-serif text-xl" style={{ color: palette.accent }}>
                    {cat.category}
                  </h3>
                  <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                    {cat.items.map((item) => (
                      <li
                        key={item.name}
                        className="flex gap-3 overflow-hidden rounded-2xl border p-2.5"
                        style={{ borderColor: `${palette.fg}18`, background: `${palette.fg}06` }}
                      >
                        {item.image && (
                          <img
                            src={item.image}
                            alt=""
                            className="size-24 shrink-0 rounded-xl object-cover sm:size-28"
                          />
                        )}
                        <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
                          <div>
                            <div className="font-medium leading-snug">{item.name}</div>
                            <div className="mt-1 text-sm leading-snug opacity-70">{item.description}</div>
                          </div>
                          <div className="mt-2 text-sm font-medium" style={{ color: palette.accent }}>
                            {brl(item.price)}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}

        {view.services && (
          <section>
            <h2 className="text-sm uppercase tracking-[0.16em] opacity-70">Serviços</h2>
            <ul className="mt-5 grid gap-4 sm:grid-cols-3">
              {view.services.map((s) => (
                <li key={s.name} className="rounded-xl border p-4" style={{ borderColor: `${palette.fg}22` }}>
                  <div className="font-medium">{s.name}</div>
                  <p className="mt-1 text-sm opacity-70">{s.description}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h2 className="text-sm uppercase tracking-[0.16em] opacity-70">O que dizem no mapa</h2>
          <ul className="mt-5 space-y-4">
            {view.reviews.map((r) => (
              <li key={r.author} className="rounded-xl border p-4 text-sm" style={{ borderColor: `${palette.fg}22` }}>
                <div className="flex justify-between gap-2">
                  <span className="font-medium">{r.author}</span>
                  <span style={{ color: palette.accent }}>{stars(r.rating)}</span>
                </div>
                <p className="mt-2 opacity-80">{r.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <p className="text-center text-[11px] opacity-60">
          Arte · Sofia Almeida · Designer Gráfico · Time Dev Info Tech
        </p>
        <p className="text-center text-[10px] opacity-40">
          Prévia hospedada na Vercel a partir de dados públicos do mapa. Não é o site oficial até o proprietário aprovar.
        </p>
      </main>
      <div
        className="fixed inset-x-0 bottom-0 z-20 flex gap-2 border-t px-4 py-3 sm:hidden"
        style={{ background: palette.bg, paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        <a
          href={waLink}
          className="flex-1 rounded-full px-4 py-3 text-center text-sm font-medium"
          style={{ background: palette.accent, color: palette.bg }}
        >
          {hasMenu ? "Pedir no WhatsApp" : "Falar no WhatsApp"}
        </a>
        <a
          href={view.mapsUrl}
          target="_blank"
          rel="noreferrer"
          className="rounded-full border px-4 py-3 text-sm"
          style={{ borderColor: `${palette.fg}33` }}
        >
          Mapa
        </a>
      </div>
    </div>
  );
}
