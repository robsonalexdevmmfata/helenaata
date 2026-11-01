import { useEffect, useState, type CSSProperties } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Check, MapPin, MessageCircle, Moon, Sparkles, Sun } from "lucide-react";
import { HelenaAvatar } from "@/components/helena/HelenaAvatar";
import { TestimonialsSlider } from "@/components/marketing/TestimonialsSlider";
import { SAAS_PLANS } from "@/lib/saas";
import { applyTheme, getTheme } from "@/lib/theme";
import { useLandingMotion } from "@/hooks/use-landing-motion";
import { getHealth } from "@/lib/backend";

const STEPS = [
  { n: "01", title: "Ela varre o mapa", text: "Você fala o nicho. A Helena acha quem aparece no Google — e ainda não tem site nem cardápio online." },
  { n: "02", title: "O time de IA constrói", text: "No plano Máquina, front, back e design seniores montam a prévia com fotos, avaliações e WhatsApp." },
  { n: "03", title: "O comercial chega com o link", text: "Não é ‘oi, tudo bem?’. É ‘olha como a sua casa já fica na internet’. O dono vê. A conversa muda." },
];

function toggleTheme() {
  applyTheme(getTheme() === "dark" ? "light" : "dark");
}

function ChipPulse() {
  const [label, setLabel] = useState("Checando o chip…");
  useEffect(() => {
    getHealth()
      .then((h) => {
        const on = h.whatsapp === "connected" || h.whatsapp === "open" || h.evolution === "remote";
        setLabel(on ? "Chip / Evolution no ar (Render grátis)" : `Servidor ok · WhatsApp ${h.whatsapp}`);
      })
      .catch(() => setLabel("Servidor local ou Render ainda acordando"));
  }, []);
  return <p className="mt-4 text-xs text-helena">{label} · <Link to="/status" className="underline">status</Link></p>;
}

export function LandingPage() {
  useLandingMotion();
  useEffect(() => {
    applyTheme(getTheme());
  }, []);

  return (
    <div className="lp min-h-screen bg-background text-foreground">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-border/70 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-3 pt-[env(safe-area-inset-top)] sm:h-16 sm:px-5">
          <a href="#topo" className="flex min-w-0 items-center gap-2 transition-transform hover:scale-[1.04]">
            <HelenaAvatar className="size-8 sm:size-9" />
            <span className="truncate text-[10px] font-semibold tracking-[0.22em] sm:text-[11px]">HELENA AI</span>
          </a>
          <nav className="lp-nav flex shrink-0 items-center gap-1.5 text-sm sm:gap-3">
            <a href="#como" className="hidden text-muted-foreground hover:text-foreground sm:inline">Como funciona</a>
            <a href="#depoimentos" className="hidden text-muted-foreground hover:text-foreground md:inline">Depoimentos</a>
            <a href="#planos" className="hidden text-muted-foreground hover:text-foreground sm:inline">Planos</a>
            <button
              type="button"
              aria-label="Alternar tema claro e escuro"
              onClick={toggleTheme}
              className="lp-btn inline-flex size-9 items-center justify-center rounded-full border border-border text-foreground hover:bg-muted"
            >
              <Sun className="size-4 dark:hidden" />
              <Moon className="hidden size-4 dark:block" />
            </button>
            <Link to="/login" className="lp-btn rounded-full px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground sm:px-4 sm:text-sm">
              Entrar
            </Link>
            <Link to="/status" className="hidden rounded-full px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground sm:inline">
              Status
            </Link>
            <Link to="/cadastro" className="lp-btn lp-btn--helena rounded-full bg-helena px-2.5 py-1.5 text-xs font-medium text-helena-foreground sm:px-4 sm:text-sm">
              Trial
            </Link>
          </nav>
        </div>
      </header>

      <section id="topo" className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-24 sm:px-5 sm:pb-20 sm:pt-28 lg:grid-cols-[1.15fr_0.85fr] lg:pt-32">
        <div className="lp-reveal" style={{ "--i": 1 } as CSSProperties}>
          <p className="text-[11px] uppercase tracking-[0.28em] text-helena">A máquina que vende presença digital</p>
          <h1 className="mt-4 font-serif text-[2rem] leading-[1.08] sm:text-6xl">
            Seu concorrente já está no Google.
            <span className="italic text-helena"> O cliente do lado, não.</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground">
            A Helena encontra restaurantes, clínicas, barbearias — qualquer nicho — sem site e sem cardápio online.
            O time de IA monta a prévia. O comercial manda o link e pergunta se fala com o dono.
            Você para de caçar lead no escuro.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/cadastro" className="lp-btn lp-btn--helena inline-flex items-center gap-2 rounded-full bg-helena px-6 py-3 text-sm font-semibold text-helena-foreground">
              2 dias grátis · 30 leads/dia no freemium · 150 no plano pago <ArrowRight className="size-4" />
            </Link>
            <a href="#demo" className="lp-btn inline-flex items-center rounded-full border border-border px-6 py-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
              Ver em 20s
            </a>
            <a href="#planos" className="lp-btn inline-flex items-center rounded-full border border-border px-6 py-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
              Ver planos
            </a>
          </div>
          <ChipPulse />
          <p className="mt-4 text-xs text-muted-foreground/80">Sem cartão no trial. Depois, Cakto. White-label sob orçamento.</p>
        </div>
        <div className="lp-reveal lp-hero-orb relative mx-auto w-full max-w-md" style={{ "--i": 3 } as CSSProperties}>
          <div className="absolute -inset-6 rounded-[2rem] bg-helena/20 blur-3xl" />
          <div className="lp-card relative overflow-hidden rounded-[2rem] border border-border bg-card p-6">
            <HelenaAvatar className="mx-auto size-40" />
            <p className="mt-6 font-serif text-2xl leading-snug">
              “Achei 50 casas sem cardápio. O time já deixou a prévia. Posso mandar o link?”
            </p>
            <p className="mt-3 text-xs uppercase tracking-[0.18em] text-helena">Helena · orquestradora</p>
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-surface">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-4 px-5 py-10 sm:grid-cols-4 sm:gap-6">
          {[
            ["2 dias", "para sentir a máquina"],
            ["30/dia", "no trial, sem desperdício"],
            ["3 seniores", "front, back e design"],
            ["1 link", "que o dono consegue abrir"],
          ].map(([k, v], i) => (
            <div key={k} className="lp-stat lp-reveal rounded-xl border border-transparent p-3" style={{ "--i": i } as CSSProperties}>
              <div className="lp-stat-k font-serif text-3xl text-helena transition-colors">{k}</div>
              <div className="mt-1 text-sm text-muted-foreground">{v}</div>
            </div>
          ))}
        </div>
      </section>

      <section id="como" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-20">
        <h2 className="lp-reveal font-serif text-3xl sm:text-4xl">Não é mais um CRM. É uma operação que chega no WhatsApp com prova.</h2>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.n} className="lp-card lp-reveal rounded-2xl border border-border bg-card p-6" style={{ "--i": i } as CSSProperties}>
              <div className="text-xs tracking-[0.2em] text-helena">{s.n}</div>
              <h3 className="mt-3 font-serif text-2xl">{s.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap gap-3 text-sm text-muted-foreground">
          <span className="lp-chip inline-flex items-center gap-2"><MapPin className="size-4 text-helena" /> Maps sem site / sem cardápio</span>
          <span className="lp-chip inline-flex items-center gap-2"><Sparkles className="size-4 text-helena" /> Time Dev no plano Máquina</span>
          <span className="lp-chip inline-flex items-center gap-2"><MessageCircle className="size-4 text-helena" /> Abordagem com o dono</span>
        </div>
      </section>

      <section id="demo" className="mx-auto max-w-6xl scroll-mt-24 px-5 pb-8">
        <h2 className="lp-reveal font-serif text-3xl sm:text-4xl">Vinte segundos. Sem vídeo pago.</h2>
        <p className="mt-3 max-w-xl text-sm text-muted-foreground">Cadastro → nome da Linha Helena → QR → primeira mensagem. O expediente RPA (Maps, WhatsApp, agenda, Pix, site) só dispara com o chip no ar.</p>
        <ol className="mt-8 grid gap-4 md:grid-cols-4">
          {[
            "Cria a conta em 1 minuto",
            "Nomeia agente e instância",
            "Lê o QR no celular",
            "Manda o teste no próprio chip",
          ].map((t, i) => (
            <li key={t} className="rounded-2xl border border-border bg-card p-5">
              <div className="text-xs tracking-[0.2em] text-helena">0{i + 1}</div>
              <p className="mt-2 font-medium">{t}</p>
            </li>
          ))}
        </ol>
      </section>

      <TestimonialsSlider />

      <section id="planos" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-20">
        <h2 className="lp-reveal font-serif text-3xl sm:text-4xl">Três portas. A última é a sua marca.</h2>
        <p className="lp-reveal mt-3 max-w-xl text-sm text-muted-foreground">Primeiro o cadastro. Depois o checkout Cakto. O white-label não tem preço na prateleira — a gente senta e desenha a operação com você.</p>
        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {SAAS_PLANS.map((p, i) => (
            <div
              key={p.id}
              className={`lp-plan lp-reveal flex flex-col rounded-2xl border p-6 ${p.highlight ? "lp-plan--hot border-helena bg-helena-soft" : "border-border bg-card"}`}
              style={{ "--i": i } as CSSProperties}
            >
              <div className="relative z-[1] text-xs uppercase tracking-[0.18em] text-helena">{p.name}</div>
              <div className="relative z-[1] mt-2 font-serif text-3xl">{p.priceLabel}</div>
              <p className="relative z-[1] mt-2 text-sm text-muted-foreground">{p.tagline}</p>
              <ul className="relative z-[1] mt-5 flex-1 space-y-2 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2"><Check className="lp-check mt-0.5 size-4 shrink-0 text-helena" /> {f}</li>
                ))}
              </ul>
              {p.quote ? (
                <Link to="/cadastro" className="lp-btn relative z-[1] mt-6 rounded-full border border-helena px-4 py-2.5 text-center text-sm font-medium text-helena">
                  Solicite um orçamento
                </Link>
              ) : (
                <a
                  href={p.id === "maquina" ? "/cadastro?plano=maquina" : "/cadastro?plano=impulso"}
                  className={`lp-btn relative z-[1] mt-6 rounded-full px-4 py-2.5 text-center text-sm font-semibold ${p.highlight ? "lp-btn--helena bg-helena text-helena-foreground" : "bg-muted text-foreground"}`}
                >
                  {p.id === "maquina" ? "Assinar Máquina" : "Impulso · 2 dias grátis"}
                </a>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-border bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-5 py-14 sm:flex-row sm:items-center">
          <div className="lp-reveal">
            <p className="font-serif text-3xl leading-tight">Dois dias. Trinta leads. Sem cartão.</p>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Freemium: 30 prospecções/dia. Impulso e Máquina: até 150/dia. Time Dev não aumenta cota até o pagamento.
            </p>
          </div>
          <Link to="/cadastro" className="lp-btn lp-btn--helena inline-flex items-center gap-2 rounded-full bg-helena px-6 py-3 text-sm font-semibold text-helena-foreground">
            Criar conta agora <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      <footer id="rodape" className="border-t border-border bg-background">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <div className="flex items-center gap-2.5">
              <HelenaAvatar className="size-10" />
              <div>
                <div className="text-[11px] font-semibold tracking-[0.22em]">HELENA AI</div>
                <a
                  href="https://agenciainfotech.com.br/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-muted-foreground transition-colors hover:text-helena"
                >
                  Info Tech Ltda
                </a>
              </div>
            </div>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
              A orquestradora que acha quem ainda não está no Google, monta a prévia e coloca o comercial na conversa com o dono.
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-helena">Produto</p>
            <ul className="lp-nav mt-4 space-y-2.5 text-sm text-muted-foreground">
              <li><a href="#como" className="hover:text-foreground">Como funciona</a></li>
              <li><a href="#depoimentos" className="hover:text-foreground">Depoimentos</a></li>
              <li><a href="#planos" className="hover:text-foreground">Planos</a></li>
              <li><Link to="/cadastro" className="hover:text-foreground">Trial de 2 dias</Link></li>
              <li><Link to="/login" className="hover:text-foreground">Entrar</Link></li>
              <li><Link to="/status" className="hover:text-foreground">O chip está no ar?</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-helena">Planos</p>
            <ul className="lp-nav mt-4 space-y-2.5 text-sm text-muted-foreground">
              <li><a href="#planos" className="hover:text-foreground">Impulso · R$ 70,00/mês</a></li>
              <li><a href="#planos" className="hover:text-foreground">Máquina · R$ 140,00/mês</a></li>
              <li><Link to="/cadastro" className="hover:text-foreground">White-label · orçamento</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-helena">Operação</p>
            <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
              <li>30 leads/dia no freemium · 150 no pago</li>
              <li>Pagamento via Cakto</li>
              <li>WhatsApp, CRM e prévia no Máquina</li>
              <li>São Paulo · Brasil</li>
            </ul>
          </div>
        </div>
        <div className="mx-auto flex max-w-6xl flex-col gap-2 border-t border-border px-5 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()}{" "}
            <a
              href="https://agenciainfotech.com.br/"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-helena"
            >
              Info Tech Ltda
            </a>
            . HELENA AI. Todos os direitos reservados.
          </p>
          <p>Trial sem cartão. Assinatura e white-label sob contrato.</p>
        </div>
      </footer>
    </div>
  );
}
