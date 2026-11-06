import { normalize } from "@/lib/format";
import { resolvePreviewKind, wantsCardapio } from "@/lib/dev/presence";

export type NicheFamily =
  | "delivery"
  | "beauty"
  | "clinic"
  | "trade"
  | "sweet"
  | "pro"
  | "estate"
  | "pet"
  | "fitness"
  | "service";

export type NicheProduct = {
  family: NicheFamily;
  label: string;
  eyebrow: string;
  headlineHook: string;
  cta: string;
  ctaSecondary: string;
  waPrefill: (name: string) => string;
  badge: string;
  servicesTitle: string;
  galleryTitle: string;
  socialProofTitle: string;
  /** Light storefront (delivery/clinic/sweet) vs dark cinematic */
  surface: "light" | "dark";
  colors: {
    bg: string;
    fg: string;
    accent: string;
    accentFg: string;
    muted: string;
    card: string;
    banner: string;
  };
  services: { name: string; description: string; hint?: string }[];
  photos: string[];
};

const PHOTOS = {
  beauty: [
    "https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=1200&q=80",
    "https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?w=1200&q=80",
    "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=1200&q=80",
    "https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=1200&q=80",
    "https://images.unsplash.com/photo-1622286342621-4bd786c244b9?w=1200&q=80",
    "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=1200&q=80",
  ],
  clinic: [
    "https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=1200&q=80",
    "https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?w=1200&q=80",
    "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=1200&q=80",
    "https://images.unsplash.com/photo-1579684385127-1ef15d508118?w=1200&q=80",
    "https://images.unsplash.com/photo-1666214280557-f1b502d759db?w=1200&q=80",
    "https://images.unsplash.com/photo-1631217868264-e5b90bb7e133?w=1200&q=80",
  ],
  trade: [
    "https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=1200&q=80",
    "https://images.unsplash.com/photo-1504148455328-c376907d081c?w=1200&q=80",
    "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=1200&q=80",
    "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=1200&q=80",
    "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1200&q=80",
    "https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?w=1200&q=80",
  ],
  sweet: [
    "https://images.unsplash.com/photo-1497034825429-c343d7c6a68f?w=1200&q=80",
    "https://images.unsplash.com/photo-1501443762994-82bd5dace89a?w=1200&q=80",
    "https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=1200&q=80",
    "https://images.unsplash.com/photo-1570197788417-0e82375c9371?w=1200&q=80",
    "https://images.unsplash.com/photo-1557142046-c704a3adf364?w=1200&q=80",
    "https://images.unsplash.com/photo-1488900123125-4e6f9e9a0b1a?w=1200&q=80",
  ],
  bakery: [
    "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=1200&q=80",
    "https://images.unsplash.com/photo-1517433674937-ae294d2d3e7e?w=1200&q=80",
    "https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=1200&q=80",
    "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=1200&q=80",
    "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=1200&q=80",
    "https://images.unsplash.com/photo-1477764250597-dffe9f601ae8?w=1200&q=80",
  ],
  pro: [
    "https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80",
    "https://images.unsplash.com/photo-1521791136064-7986c2920216?w=1200&q=80",
    "https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=1200&q=80",
    "https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=1200&q=80",
    "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=1200&q=80",
    "https://images.unsplash.com/photo-1568992687947-868a62a9f521?w=1200&q=80",
  ],
  estate: [
    "https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=1200&q=80",
    "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=80",
    "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80",
    "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80",
    "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=1200&q=80",
    "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdbc?w=1200&q=80",
  ],
  pet: [
    "https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=1200&q=80",
    "https://images.unsplash.com/photo-1587300003388-59208cc962f0?w=1200&q=80",
    "https://images.unsplash.com/photo-1516734212186-a967f81ad0d7?w=1200&q=80",
    "https://images.unsplash.com/photo-1601758228041-f3b2795255f1?w=1200&q=80",
    "https://images.unsplash.com/photo-1450778869180-41d0601e046e?w=1200&q=80",
    "https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?w=1200&q=80",
  ],
  fitness: [
    "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1200&q=80",
    "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=1200&q=80",
    "https://images.unsplash.com/photo-1571902943202-507ec2618e8f?w=1200&q=80",
    "https://images.unsplash.com/photo-1540497077202-7c8a3999166f?w=1200&q=80",
    "https://images.unsplash.com/photo-1576678927484-cc907957088c?w=1200&q=80",
    "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=1200&q=80",
  ],
};

function blob(name: string, segment: string) {
  return normalize(`${name} ${segment}`);
}

/** Produto visual + oferta do nicho — cada família parece um negócio diferente. */
export function resolveNicheProduct(placeName: string, segment: string): NicheProduct {
  const kind = resolvePreviewKind(placeName, segment);
  const n = blob(placeName, kind.segment || segment);

  if (kind.food || wantsCardapio(n)) {
    return {
      family: "delivery",
      label: kind.segment || "Restaurantes",
      eyebrow: "Pedidos online",
      headlineHook: "Cardápio digital com sacola e fechamento no WhatsApp",
      cta: "Finalizar no WhatsApp",
      ctaSecondary: "Ver no mapa",
      waPrefill: (name) => `Olá! Quero pedir na ${name}`,
      badge: "Delivery · cardápio",
      servicesTitle: "Cardápio",
      galleryTitle: "Em destaque",
      socialProofTitle: "Avaliações",
      surface: "light",
      colors: {
        bg: "#f3f4f6",
        fg: "#18181b",
        accent: "#dc2626",
        accentFg: "#fff",
        muted: "#71717a",
        card: "#ffffff",
        banner: "#fbbf24",
      },
      services: [],
      photos: [],
    };
  }

  if (/barbear|salao|cabeleir|manicure|beleza/.test(n)) {
    return {
      family: "beauty",
      label: /barbear/.test(n) ? "Barbearia" : "Salão",
      eyebrow: "Agenda pelo WhatsApp",
      headlineHook: "Corte, barba e estilo — reserve seu horário em 1 toque",
      cta: "Agendar no WhatsApp",
      ctaSecondary: "Ver localização",
      waPrefill: (name) => `Olá! Quero agendar na ${name}. Qual o próximo horário?`,
      badge: "Beleza · agenda",
      servicesTitle: "Serviços & combos",
      galleryTitle: "Ambiente & cortes",
      socialProofTitle: "Clientes no mapa",
      surface: "dark",
      colors: {
        bg: "#0a0a0a",
        fg: "#f5ecd8",
        accent: "#d4af37",
        accentFg: "#0a0a0a",
        muted: "#a8a29e",
        card: "#171717",
        banner: "#111111",
      },
      services: [
        { name: "Corte assinatura", description: "Clássico ou degradê com finalização.", hint: "a partir de R$ 45" },
        { name: "Barba premium", description: "Toalha quente, navalha e óleo.", hint: "a partir de R$ 35" },
        { name: "Combo completo", description: "Corte + barba no mesmo horário.", hint: "combo" },
      ],
      photos: PHOTOS.beauty,
    };
  }

  if (/clinic|dentist|odont|estetic|medico|fisioter|psicolog|saude/.test(n)) {
    return {
      family: "clinic",
      label: /odont|dentist/.test(n) ? "Odontologia" : /estetic/.test(n) ? "Estética" : "Clínica",
      eyebrow: "Cuidado com hora marcada",
      headlineHook: "Avaliação e agendamento sem fila no telefone",
      cta: "Agendar avaliação",
      ctaSecondary: "Como chegar",
      waPrefill: (name) => `Olá! Vi o site da ${name} e quero agendar uma avaliação.`,
      badge: "Saúde · agenda",
      servicesTitle: "Tratamentos",
      galleryTitle: "Estrutura",
      socialProofTitle: "Pacientes no mapa",
      surface: "light",
      colors: {
        bg: "#f0fdfa",
        fg: "#134e4a",
        accent: "#0d9488",
        accentFg: "#fff",
        muted: "#5eead4",
        card: "#ffffff",
        banner: "#ccfbf1",
      },
      services: [
        { name: "Avaliação", description: "Primeira consulta para diagnóstico claro.", hint: "sem compromisso" },
        { name: "Tratamentos", description: "Plano alinhado ao que você precisa.", hint: "personalizado" },
        { name: "Retorno", description: "Acompanhamento pelo WhatsApp.", hint: "rápido" },
      ],
      photos: PHOTOS.clinic,
    };
  }

  if (/chaveir|eletricit|encanador|desentupid|oficina|mecanica|auto\s*pe|conserto|guincho|borrachar/.test(n)) {
    const lock = /chaveir/.test(n);
    return {
      family: "trade",
      label: lock ? "Chaveiro" : /oficina|mecanica/.test(n) ? "Oficina" : "Serviço técnico",
      eyebrow: lock ? "Atendimento rápido" : "Diagnóstico sem enrolação",
      headlineHook: lock
        ? "Porta travada? Chave quebrada? Chama agora no WhatsApp"
        : "Problema no carro ou na casa — orçamento direto no WhatsApp",
      cta: lock ? "Chamar chaveiro agora" : "Pedir orçamento",
      ctaSecondary: "Ver no mapa",
      waPrefill: (name) =>
        lock
          ? `Olá! Preciso de chaveiro (${name}). Estou no local agora.`
          : `Olá! Vi o site da ${name} e quero um orçamento.`,
      badge: lock ? "24h · emergência" : "Técnico · orçamento",
      servicesTitle: "O que resolvemos",
      galleryTitle: "No dia a dia",
      socialProofTitle: "Quem chamou no mapa",
      surface: "dark",
      colors: {
        bg: "#0b1016",
        fg: "#f8fafc",
        accent: "#fbbf24",
        accentFg: "#0b1016",
        muted: "#94a3b8",
        card: "#111827",
        banner: "#1e293b",
      },
      services: lock
        ? [
            { name: "Abertura de portas", description: "Residencial e comercial, com cuidado na fechadura.", hint: "urgente" },
            { name: "Cópia de chaves", description: "Comum, tetra e cartão quando disponível.", hint: "rápido" },
            { name: "Troca de segredo", description: "Instalação e orientação no local.", hint: "segurança" },
          ]
        : [
            { name: "Diagnóstico", description: "Avaliamos o problema sem enrolação.", hint: "claro" },
            { name: "Reparos", description: "Peças e mão de obra alinhadas à região.", hint: "local" },
            { name: "Orçamento WhatsApp", description: "Manda foto/áudio e recebe proposta.", hint: "direto" },
          ],
      photos: PHOTOS.trade,
    };
  }

  if (/sorvet|gelat|acai/.test(n)) {
    return {
      family: "sweet",
      label: /acai/.test(n) ? "Açaí" : "Sorveteria",
      eyebrow: "Vitrine & encomendas",
      headlineHook: "Sabores do dia, potes e festa — peça pelo WhatsApp",
      cta: "Pedir no WhatsApp",
      ctaSecondary: "Ver no mapa",
      waPrefill: (name) => `Olá! Quero pedir na ${name}. Quais sabores tem agora?`,
      badge: "Doce · vitrine",
      servicesTitle: "Sabores & formatos",
      galleryTitle: "Vitrine",
      socialProofTitle: "Quem voltou",
      surface: "light",
      colors: {
        bg: "#eff6ff",
        fg: "#0c4a6e",
        accent: "#0ea5e9",
        accentFg: "#fff",
        muted: "#38bdf8",
        card: "#ffffff",
        banner: "#e0f2fe",
      },
      services: [
        { name: "Casquinha & pote", description: "Do unitário ao pack família.", hint: "levar" },
        { name: "Sabores do dia", description: "Pergunte no WhatsApp o que tem agora.", hint: "fresco" },
        { name: "Encomenda festa", description: "Reserve com antecedência.", hint: "evento" },
      ],
      photos: PHOTOS.sweet,
    };
  }

  if (/padaria|cafeteria|cafe|doceria|confeitaria/.test(n)) {
    return {
      family: "sweet",
      label: /padaria/.test(n) ? "Padaria" : /doceria|confeitaria/.test(n) ? "Doceria" : "Café",
      eyebrow: "Frescos do dia",
      headlineHook: "Pães, cafés e encomendas — reserve pelo WhatsApp",
      cta: "Encomendar no WhatsApp",
      ctaSecondary: "Como chegar",
      waPrefill: (name) => `Olá! Quero encomendar na ${name}.`,
      badge: "Padaria · encomenda",
      servicesTitle: "Do forno",
      galleryTitle: "Ambiente",
      socialProofTitle: "Freguesia no mapa",
      surface: "light",
      colors: {
        bg: "#fff7ed",
        fg: "#431407",
        accent: "#c2410c",
        accentFg: "#fff",
        muted: "#fdba74",
        card: "#ffffff",
        banner: "#ffedd5",
      },
      services: [
        { name: "Frescos do dia", description: "Pães e salgados saindo do forno.", hint: "hoje" },
        { name: "Café & lanches", description: "Pra comer aqui ou levar.", hint: "rápido" },
        { name: "Encomendas", description: "Bolos e kits pelo WhatsApp.", hint: "festa" },
      ],
      photos: PHOTOS.bakery,
    };
  }

  if (/advog|jurid|contab|arquitet|despachante/.test(n)) {
    return {
      family: "pro",
      label: /advog/.test(n) ? "Advocacia" : /contab/.test(n) ? "Contabilidade" : "Escritório",
      eyebrow: "Atendimento com hora marcada",
      headlineHook: "Primeira conversa objetiva — resolva pelo WhatsApp",
      cta: "Marcar conversa",
      ctaSecondary: "Endereço no mapa",
      waPrefill: (name) => `Olá! Vi o site da ${name} e gostaria de uma conversa inicial.`,
      badge: "Profissional · confiança",
      servicesTitle: "Como ajudamos",
      galleryTitle: "Escritório",
      socialProofTitle: "Clientes no mapa",
      surface: "dark",
      colors: {
        bg: "#0a1224",
        fg: "#eef3fb",
        accent: "#3b82f6",
        accentFg: "#fff",
        muted: "#94a3b8",
        card: "#111827",
        banner: "#1e3a5f",
      },
      services: [
        { name: "Consultoria inicial", description: "Entendemos o caso com clareza.", hint: "30 min" },
        { name: "Documentos", description: "Revisão e elaboração sob demanda.", hint: "preciso" },
        { name: "Acompanhamento", description: "Atualizações pelo WhatsApp.", hint: "direto" },
      ],
      photos: PHOTOS.pro,
    };
  }

  if (/imobili|corretor/.test(n)) {
    return {
      family: "estate",
      label: "Imobiliária",
      eyebrow: "Imóveis com atendimento humano",
      headlineHook: "Visita e proposta — fale com o corretor no WhatsApp",
      cta: "Falar com corretor",
      ctaSecondary: "Ver no mapa",
      waPrefill: (name) => `Olá! Vi o site da ${name} e quero ver opções de imóvel.`,
      badge: "Imóveis · visita",
      servicesTitle: "Atendimento",
      galleryTitle: "Imóveis & região",
      socialProofTitle: "Clientes no mapa",
      surface: "light",
      colors: {
        bg: "#fafaf9",
        fg: "#1c1917",
        accent: "#b45309",
        accentFg: "#fff",
        muted: "#a8a29e",
        card: "#ffffff",
        banner: "#fef3c7",
      },
      services: [
        { name: "Visita guiada", description: "Agende horário no imóvel.", hint: "agenda" },
        { name: "Avaliação", description: "Leitura rápida de valor de mercado.", hint: "local" },
        { name: "Proposta", description: "Negociação acompanhada.", hint: "fechamento" },
      ],
      photos: PHOTOS.estate,
    };
  }

  if (/pet|veterin/.test(n)) {
    return {
      family: "pet",
      label: /veterin/.test(n) ? "Veterinária" : "Pet shop",
      eyebrow: "Cuidado com seu pet",
      headlineHook: "Banho, tosa ou consulta — marque no WhatsApp",
      cta: "Agendar pelo WhatsApp",
      ctaSecondary: "Como chegar",
      waPrefill: (name) => `Olá! Quero agendar na ${name} para meu pet.`,
      badge: "Pet · carinho",
      servicesTitle: "Serviços",
      galleryTitle: "Espaço",
      socialProofTitle: "Tutores no mapa",
      surface: "light",
      colors: {
        bg: "#fff1f2",
        fg: "#881337",
        accent: "#e11d48",
        accentFg: "#fff",
        muted: "#fb7185",
        card: "#ffffff",
        banner: "#ffe4e6",
      },
      services: [
        { name: "Banho & tosa", description: "Horário marcado, sem fila.", hint: "agenda" },
        { name: "Consulta", description: "Avaliação com carinho.", hint: "saúde" },
        { name: "Dúvidas rápidas", description: "Manda mensagem no WhatsApp.", hint: "ágil" },
      ],
      photos: PHOTOS.pet,
    };
  }

  if (/academia|fitness|personal/.test(n)) {
    return {
      family: "fitness",
      label: "Academia",
      eyebrow: "Treino com propósito",
      headlineHook: "Conheça a estrutura e fale com a equipe no WhatsApp",
      cta: "Quero treinar aqui",
      ctaSecondary: "Ver no mapa",
      waPrefill: (name) => `Olá! Quero conhecer a ${name} e saber dos planos.`,
      badge: "Fitness · planos",
      servicesTitle: "Planos & aulas",
      galleryTitle: "Estrutura",
      socialProofTitle: "Alunos no mapa",
      surface: "dark",
      colors: {
        bg: "#09090b",
        fg: "#fafafa",
        accent: "#a3e635",
        accentFg: "#14532d",
        muted: "#a1a1aa",
        card: "#18181b",
        banner: "#27272a",
      },
      services: [
        { name: "Musculação", description: "Área completa e orientação.", hint: "base" },
        { name: "Aulas coletivas", description: "Grade semanal.", hint: "energia" },
        { name: "Avaliação física", description: "Comece com meta clara.", hint: "meta" },
      ],
      photos: PHOTOS.fitness,
    };
  }

  return {
    family: "service",
    label: kind.segment || "Negócio local",
    eyebrow: "Presença digital própria",
    headlineHook: "Horário, endereço e WhatsApp em um site que vende",
    cta: "Falar no WhatsApp",
    ctaSecondary: "Ver no mapa",
    waPrefill: (name) => `Olá! Vi o site da ${name} e quero mais informações.`,
    badge: "Site · WhatsApp",
    servicesTitle: "Como funciona",
    galleryTitle: "Ambiente",
    socialProofTitle: "No mapa",
    surface: "dark",
    colors: {
      bg: "#0b1220",
      fg: "#f1f5f9",
      accent: "#34d399",
      accentFg: "#064e3b",
      muted: "#94a3b8",
      card: "#111827",
      banner: "#1e293b",
    },
    services: [
      { name: "Atendimento", description: "Fale com o responsável pelo WhatsApp.", hint: "direto" },
      { name: "Horário & endereço", description: "Tudo claro em um link só.", hint: "fácil" },
      { name: "Prova social", description: "Avaliações do mapa em evidência.", hint: "confiança" },
    ],
    photos: PHOTOS.pro,
  };
}
