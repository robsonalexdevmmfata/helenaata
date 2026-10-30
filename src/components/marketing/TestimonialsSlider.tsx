import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import andre from "@/assets/testimonials/andre.jpg";
import beatriz from "@/assets/testimonials/beatriz.jpg";
import camila from "@/assets/testimonials/camila.jpg";
import diego from "@/assets/testimonials/diego.jpg";
import fernanda from "@/assets/testimonials/fernanda.jpg";
import juliana from "@/assets/testimonials/juliana.jpg";
import larissa from "@/assets/testimonials/larissa.jpg";
import lucas from "@/assets/testimonials/lucas.jpg";
import marcos from "@/assets/testimonials/marcos.jpg";
import patricia from "@/assets/testimonials/patricia.jpg";
import rafael from "@/assets/testimonials/rafael.jpg";
import thiago from "@/assets/testimonials/thiago.jpg";

type Gender = "f" | "m";

interface Testimonial {
  name: string;
  role: string;
  gender: Gender;
  photo: string;
  stars: 4 | 5;
  quote: string;
}

const TESTIMONIALS: Testimonial[] = [
  {
    name: "Camila Ribeiro",
    role: "Agência · Curitiba",
    gender: "f",
    photo: camila,
    stars: 5,
    quote: "No segundo dia do trial a Helena já tinha lista, prévia e mensagem pronta. Parecia que eu tinha contratado um time, não um software.",
  },
  {
    name: "Rafael Oliveira",
    role: "Tráfego pago · Recife",
    gender: "m",
    photo: rafael,
    stars: 5,
    quote: "Eu caçava lead no escuro. Agora o comercial chega no WhatsApp com o link do site que o próprio dono ainda não tem.",
  },
  {
    name: "Juliana Costa",
    role: "Clínica odontológica · BH",
    gender: "f",
    photo: juliana,
    stars: 5,
    quote: "A prévia ficou tão redonda que o paciente achou que a gente já estava no Google. Fechamos o site na mesma semana.",
  },
  {
    name: "André Lima",
    role: "Imobiliária · Campinas",
    gender: "m",
    photo: andre,
    stars: 5,
    quote: "Trinta abordagens por dia, sem repetir número. A agenda encheu de reunião. Isso não é CRM, é operação.",
  },
  {
    name: "Fernanda Alves",
    role: "Estética · Florianópolis",
    gender: "f",
    photo: fernanda,
    stars: 5,
    quote: "A Helena pergunta se pode executar. Eu autorizo. O time monta a página e o comercial manda. Eu só assisto o Pix.",
  },
  {
    name: "Lucas Ferreira",
    role: "Oficina · Goiânia",
    gender: "m",
    photo: lucas,
    stars: 4,
    quote: "Achei que ia ser mais um robô chato. O dono da concorrente respondeu em 8 minutos porque viu a loja dele “já no ar”.",
  },
  {
    name: "Beatriz Nunes",
    role: "Pet shop · Porto Alegre",
    gender: "f",
    photo: beatriz,
    stars: 5,
    quote: "Maps, cardápio, WhatsApp. Tudo no mesmo lugar. No trial eu já vendi presença digital para duas clínicas da rua.",
  },
  {
    name: "Marcos Souza",
    role: "Restaurante · Salvador",
    gender: "m",
    photo: marcos,
    stars: 5,
    quote: "O closer não discute preço no escuro. Manda a prévia, marca a reunião e eu fecho. Simples assim.",
  },
  {
    name: "Larissa Mendes",
    role: "Advocacia · Brasília",
    gender: "f",
    photo: larissa,
    stars: 5,
    quote: "Assinei o Impulso no terceiro dia. Setenta reais por uma máquina que trabalha enquanto eu atendo cliente? Fechado.",
  },
  {
    name: "Diego Martins",
    role: "Barbearia em rede · Fortaleza",
    gender: "m",
    photo: diego,
    stars: 5,
    quote: "Cada unidade sem Instagram ganhava uma prévia. O comercial mandava o link. Três donos responderam no mesmo dia.",
  },
  {
    name: "Patrícia Gomes",
    role: "Marketing · São Paulo",
    gender: "f",
    photo: patricia,
    stars: 5,
    quote: "Eu gerencio três contas. A Helena orquestra, o time de IA constrói, eu só escolho o nicho. Voltei a dormir.",
  },
  {
    name: "Thiago Barbosa",
    role: "Construtora · Manaus",
    gender: "m",
    photo: thiago,
    stars: 4,
    quote: "White-label ainda vamos conversar. Enquanto isso o Máquina já pagou o plano com um único contrato.",
  },
];

const PAGE_SIZE = 3;
const PAGES = TESTIMONIALS.length / PAGE_SIZE;

function Stars({ n }: { n: number }) {
  return (
    <div className="flex gap-0.5" aria-label={`${n} de 5 estrelas`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={`size-3.5 ${i < n ? "fill-helena text-helena" : "text-border"}`}
        />
      ))}
    </div>
  );
}

export function TestimonialsSlider() {
  const [page, setPage] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const t = window.setInterval(() => {
      setPage((p) => (p + 1) % PAGES);
    }, 5200);
    return () => window.clearInterval(t);
  }, [paused]);

  const slice = TESTIMONIALS.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  return (
    <section
      id="depoimentos"
      className="border-y border-border bg-surface"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="mx-auto max-w-6xl scroll-mt-24 px-5 py-20">
        <p className="lp-reveal text-[11px] uppercase tracking-[0.28em] text-helena">Quem já ligou a máquina</p>
        <h2 className="lp-reveal mt-3 font-serif text-3xl sm:text-4xl">Não é depoimento de agência. É dono falando de resultado.</h2>
        <div key={page} className="mt-12 grid gap-5 md:grid-cols-3">
          {slice.map((item) => (
            <article key={item.photo} className="lp-card rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center gap-3">
                <img
                  src={item.photo}
                  alt={`Foto de ${item.name}`}
                  width={56}
                  height={56}
                  className="size-14 rounded-full object-cover ring-2 ring-helena/30 transition-transform duration-300 hover:scale-105"
                />
                <div className="min-w-0">
                  <div className="truncate font-medium">{item.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{item.role}</div>
                  <Stars n={item.stars} />
                </div>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">“{item.quote}”</p>
            </article>
          ))}
        </div>
        <div className="mt-8 flex justify-center gap-2">
          {Array.from({ length: PAGES }, (_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Depoimentos ${i + 1} de ${PAGES}`}
              aria-current={i === page ? true : undefined}
              onClick={() => setPage(i)}
              className={`h-1.5 rounded-full transition-all ${i === page ? "w-8 bg-helena" : "w-2.5 bg-border hover:bg-muted-foreground/40"}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
