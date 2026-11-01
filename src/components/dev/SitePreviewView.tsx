import type { SitePreview } from "@/lib/types";
import { brl } from "@/lib/format";

function stars(n: number) {
  const full = Math.round(n);
  return "★".repeat(Math.min(5, full)) + "☆".repeat(Math.max(0, 5 - full));
}

export function SitePreviewView({ preview }: { preview: SitePreview }) {
  const { palette } = preview;
  const wa = preview.phone.replace(/\D/g, "");
  const waLink = `https://wa.me/${wa.startsWith("55") ? wa : `55${wa}`}`;

  return (
    <div className="min-h-screen" style={{ background: palette.bg, color: palette.fg }}>
      <header className="relative isolate overflow-hidden">
        {preview.photos[0] && (
          <img src={preview.photos[0]} alt="" className="absolute inset-0 size-full object-cover opacity-35" />
        )}
        <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, transparent, ${palette.bg})` }} />
        <div className="relative mx-auto max-w-3xl px-5 pb-16 pt-20">
          <p className="text-[11px] uppercase tracking-[0.2em] opacity-80">{preview.segment} · {preview.city}</p>
          <h1 className="mt-3 font-serif text-3xl sm:text-5xl">{preview.name}</h1>
          <p className="mt-3 max-w-xl text-base opacity-90">{preview.tagline}</p>
          {preview.rating > 0 && preview.reviewCount > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
              <span style={{ color: palette.accent }}>{stars(preview.rating)} {preview.rating}</span>
              <span className="opacity-70">{preview.reviewCount} avaliações no mapa</span>
            </div>
          )}
          <div className="mt-8 hidden flex-wrap gap-3 sm:flex">
            <a href={waLink} className="rounded-full px-5 py-2.5 text-sm font-medium" style={{ background: palette.accent, color: palette.bg }}>
              Pedir no WhatsApp
            </a>
            <a href={preview.mapsUrl} target="_blank" rel="noreferrer" className="rounded-full border px-5 py-2.5 text-sm" style={{ borderColor: `${palette.fg}33` }}>
              Ver no mapa
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-14 px-4 pb-28 sm:px-5 sm:pb-24">
        <section>
          <h2 className="text-sm uppercase tracking-[0.16em] opacity-70">Sobre</h2>
          <p className="mt-3 leading-relaxed opacity-90">{preview.about}</p>
          <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="opacity-60">Endereço</dt><dd>{preview.address}</dd></div>
            {preview.hours && <div><dt className="opacity-60">Horário</dt><dd>{preview.hours}</dd></div>}
            {preview.phone && <div><dt className="opacity-60">Telefone</dt><dd>{preview.phone}</dd></div>}
          </dl>
        </section>

        {preview.photos.length > 1 && (
          <section className="grid grid-cols-2 gap-3">
            {preview.photos.slice(1).map((src) => (
              <img key={src} src={src} alt="" className="h-40 w-full rounded-xl object-cover sm:h-52" />
            ))}
          </section>
        )}

        {preview.menu && (
          <section>
            <h2 className="text-sm uppercase tracking-[0.16em] opacity-70">Cardápio online</h2>
            <div className="mt-5 space-y-8">
              {preview.menu.map((cat) => (
                <div key={cat.category}>
                  <h3 className="font-medium" style={{ color: palette.accent }}>{cat.category}</h3>
                  <ul className="mt-3 divide-y" style={{ borderColor: `${palette.fg}22` }}>
                    {cat.items.map((item) => (
                      <li key={item.name} className="flex items-start justify-between gap-4 py-3">
                        <div>
                          <div className="font-medium">{item.name}</div>
                          <div className="text-sm opacity-70">{item.description}</div>
                        </div>
                        <div className="shrink-0 text-sm">{brl(item.price)}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}

        {preview.services && (
          <section>
            <h2 className="text-sm uppercase tracking-[0.16em] opacity-70">Serviços</h2>
            <ul className="mt-5 grid gap-4 sm:grid-cols-3">
              {preview.services.map((s) => (
                <li key={s.name} className="rounded-xl border p-4" style={{ borderColor: `${palette.fg}22` }}>
                  <div className="font-medium">{s.name}</div>
                  <p className="mt-1 text-sm opacity-70">{s.description}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {preview.reviews.length > 0 && (
          <section>
            <h2 className="text-sm uppercase tracking-[0.16em] opacity-70">O que dizem no mapa</h2>
            <ul className="mt-5 space-y-4">
              {preview.reviews.map((r) => (
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
        )}

        <p className="text-center text-[11px] opacity-50">
          Prévia montada pela Info Tech a partir de dados públicos do mapa. Não é o site oficial até o proprietário aprovar.
        </p>
      </main>
      <div className="fixed inset-x-0 bottom-0 z-20 flex gap-2 border-t px-4 py-3 sm:hidden" style={{ background: palette.bg, paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
        <a href={waLink} className="flex-1 rounded-full px-4 py-3 text-center text-sm font-medium" style={{ background: palette.accent, color: palette.bg }}>
          Pedir no WhatsApp
        </a>
        <a href={preview.mapsUrl} target="_blank" rel="noreferrer" className="rounded-full border px-4 py-3 text-sm" style={{ borderColor: `${palette.fg}33` }}>
          Mapa
        </a>
      </div>
    </div>
  );
}
