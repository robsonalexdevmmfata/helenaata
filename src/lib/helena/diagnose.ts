import { normalize } from "@/lib/format";

export type CycleState =
  | "encontrado"
  | "diagnosticado"
  | "preview"
  | "link_enviado"
  | "respondeu"
  | "aguardando_dono"
  | "silencio"
  | "reuniao"
  | "resultado";

export type DiagnosisFinding = { code: string; evidence: string };

export type LeadDiagnosis = {
  score: number;
  opportunity: "baixa" | "media" | "alta";
  findings: DiagnosisFinding[];
  recommend_offer: string;
  recommend_pitch: string;
};

export function setCycleTag(tags: string[] | undefined, state: CycleState) {
  return [...(tags || []).filter((t) => !t.startsWith("#ciclo-")), `#ciclo-${state}`];
}

export function cycleFromTags(tags: string[] | undefined): CycleState | "" {
  const tag = (tags || []).find((t) => t.startsWith("#ciclo-"));
  return (tag ? tag.slice(7) : "") as CycleState | "";
}

export function diagnoseLead(input: {
  name: string;
  segment?: string;
  city?: string;
  website?: string;
  tags?: string[];
  rating?: number;
  photos?: number;
  hasMenu?: boolean;
  hasWhatsApp?: boolean;
}): LeadDiagnosis {
  const findings: DiagnosisFinding[] = [];
  let score = 38;
  const tags = input.tags || [];
  const website = (input.website || "").trim();
  const niche = normalize(`${input.segment || ""} ${input.name}`);
  const food = /pizzaria|restaurante|lanchonete|padaria|hamburguer|churrasc/.test(niche);
  const clinic = /clinic|dentista|estetic|fisioter|odonto|medico|pet\b/.test(niche);
  const barber = /barbear|cabeleir|salao|salão|barbeiro/.test(niche);
  const law = /advog|jurid|escritorio|escritório/.test(niche);
  const city = input.city || "a cidade";

  if (!website || tags.includes("#sem-site")) {
    score += 22;
    findings.push({ code: "sem_site", evidence: `${input.name} não tem site público no mapa/OSM.` });
  } else {
    findings.push({ code: "tem_site", evidence: `Site encontrado: ${website}` });
  }

  if (tags.includes("#sem-ia-whatsapp") || tags.includes("#sem-ia")) {
    score += 10;
    findings.push({ code: "sem_ia", evidence: "Atendimento sem rastros de chatbot/IA no WhatsApp." });
  }

  if (input.hasWhatsApp !== false) {
    score += 10;
    findings.push({ code: "whatsapp", evidence: "WhatsApp válido para abordagem comercial." });
  }

  if (food && !input.hasMenu) {
    score += 12;
    findings.push({
      code: "cardapio",
      evidence: `Nicho de comida em ${city} sem cardápio online atualizado — concorrente com pedido digital captura a busca.`,
    });
  }

  if (clinic && (!website || tags.includes("#sem-site"))) {
    score += 8;
    findings.push({
      code: "agendamento",
      evidence: `Clínica/serviço de saúde em ${city}: não há canal público de serviços + agendamento identificado. Ausência no mapa não prova que não existe WhatsApp interno.`,
    });
  }

  if (barber && (!website || tags.includes("#sem-site"))) {
    score += 8;
    findings.push({
      code: "reserva",
      evidence: `Barbearia/salão em ${city}: apresentação, catálogo e reserva pública não aparecem. Só o que foi observado no cadastro.`,
    });
  }

  if (law && (!website || tags.includes("#sem-site"))) {
    score += 12;
    findings.push({
      code: "advocacia",
      evidence: `Escritório em ${city}: avaliações no mapa sem site próprio — quem busca advogado na região cai no concorrente enquanto o responsável está no fórum.`,
    });
  }

  if ((input.photos ?? 2) < 4) {
    score += 6;
    findings.push({ code: "fotos", evidence: "Poucas fotos públicas; presença visual fraca no Google." });
  }

  if (input.rating != null && input.rating > 0 && input.rating < 4.2) {
    score += 5;
    findings.push({
      code: "reputacao",
      evidence: `Nota pública ${input.rating.toFixed(1)} — dá para ganhar com site + pedido no WhatsApp.`,
    });
  }

  score = Math.max(0, Math.min(100, score));
  const opportunity = score >= 75 ? "alta" : score >= 50 ? "media" : "baixa";
  const recommend_offer = food
    ? "Site + cardápio digital + pedidos"
    : clinic
      ? "Site + serviços + agendamento"
      : barber
        ? "Site + catálogo + reservas"
        : law
          ? "Site do escritório + WhatsApp que agenda enquanto você está no fórum"
          : !website || tags.includes("#sem-site")
            ? "Site institucional + WhatsApp"
            : "Automação de atendimento no WhatsApp";
  const recommend_pitch = law
    ? `${input.name} em ${city}: nota e presença no mapa sem site próprio. Quem busca advogado na região precisa achar você — não o concorrente. Oferta: ${recommend_offer}.`
    : `${input.name} em ${city}: ${findings.map((f) => f.evidence).slice(0, 3).join(" ")} Oferta: ${recommend_offer}.`;
  return { score, opportunity, findings, recommend_offer, recommend_pitch };
}
