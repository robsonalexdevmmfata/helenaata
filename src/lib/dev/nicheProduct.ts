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
      eyebrow: "Fome resolve em 1 toque",
      headlineHook: "Olhou o prato, montou a sacola e pediu no WhatsApp — do jeito que o cliente quer pedir hoje",
      cta: "Enviar pedido no WhatsApp",
      ctaSecondary: "Ver no mapa",
      waPrefill: (name) => `Olá! Quero pedir na ${name}`,
      badge: "Cardápio digital · pedidos",
      servicesTitle: "Cardápio",
      galleryTitle: "Mais pedidos",
      socialProofTitle: "Quem já pediu",
      surface: "light",
      colors: {
        bg: "#f4efe8",
        fg: "#1c1917",
        accent: "#e11d48",
        accentFg: "#fff",
        muted: "#78716c",
        card: "#ffffff",
        banner: "#f59e0b",
      },
      services: [],
      photos: [],
    };
  }

  if (/barbear|salao|cabeleir|manicure|beleza/.test(n)) {
    return {
      family: "beauty",
      label: /barbear/.test(n) ? "Barbearia" : "Salão",
      eyebrow: "Saiu transformado · voltou marcado",
      headlineHook: "O cliente vê o ambiente, confia no corte e marca a cadeira no WhatsApp — sem ligar, sem esperar",
      cta: "Quero agendar minha cadeira",
      ctaSecondary: "Como chegar",
      waPrefill: (name) => `Olá! Quero agendar na ${name}. Qual o próximo horário?`,
      badge: "Barbearia · agenda digital",
      servicesTitle: "O que o cliente já quer",
      galleryTitle: "Ambiente & resultado",
      socialProofTitle: "Quem já saiu transformado",
      surface: "dark",
      colors: {
        bg: "#050505",
        fg: "#f7efe0",
        accent: "#e0b84c",
        accentFg: "#0a0a0a",
        muted: "#a8a29e",
        card: "#111111",
        banner: "#0a0a0a",
      },
      services: [
        { name: "Corte assinatura", description: "Clássico ou degradê com finalização que marca estilo.", hint: "a partir de R$ 45" },
        { name: "Barba premium", description: "Toalha quente, navalha e óleo — ritual completo.", hint: "a partir de R$ 35" },
        { name: "Combo completo", description: "Corte + barba no mesmo horário. Sai pronto.", hint: "mais pedido" },
      ],
      photos: PHOTOS.beauty,
    };
  }

  if (/clinic|dentist|odont|estetic|medico|fisioter|psicolog|saude/.test(n)) {
    return {
      family: "clinic",
      label: /odont|dentist/.test(n) ? "Odontologia" : /estetic/.test(n) ? "Estética" : "Clínica",
      eyebrow: "Cuidado que o paciente sente",
      headlineHook: "Estrutura limpa, prova social e avaliação marcada no WhatsApp — o paciente escolhe quem transmite confiança",
      cta: "Agendar minha avaliação",
      ctaSecondary: "Como chegar",
      waPrefill: (name) => `Olá! Vi o site da ${name} e quero agendar uma avaliação.`,
      badge: "Clínica · agenda digital",
      servicesTitle: "Jornada do paciente",
      galleryTitle: "Estrutura que acalma",
      socialProofTitle: "Pacientes que recomendam",
      surface: "light",
      colors: {
        bg: "#f0fdfa",
        fg: "#115e59",
        accent: "#0f766e",
        accentFg: "#fff",
        muted: "#5eead4",
        card: "#ffffff",
        banner: "#ccfbf1",
      },
      services: [
        { name: "Avaliação", description: "Primeira conversa clara — sem pressão, com diagnóstico.", hint: "sem compromisso" },
        { name: "Tratamentos", description: "Plano alinhado ao que você realmente precisa.", hint: "personalizado" },
        { name: "Retorno", description: "Acompanhamento rápido pelo WhatsApp.", hint: "cuidado contínuo" },
      ],
      photos: PHOTOS.clinic,
    };
  }

  if (/chaveir|eletricit|encanador|desentupid|oficina|mecanica|auto\s*pe|conserto|guincho|borrachar/.test(n)) {
    const lock = /chaveir/.test(n);
    return {
      family: "trade",
      label: lock ? "Chaveiro" : /oficina|mecanica/.test(n) ? "Oficina" : "Serviço técnico",
      eyebrow: lock ? "Porta travou? Resolve agora" : "Problema na mão · solução no zap",
      headlineHook: lock
        ? "Quando trava, o cliente procura no Google, vê presença profissional e te chama no WhatsApp em 1 toque"
        : "O cliente manda foto do problema e recebe orçamento — site que gera serviço, não só visita",
      cta: lock ? "Chamar chaveiro agora" : "Pedir orçamento agora",
      ctaSecondary: "Ver no mapa",
      waPrefill: (name) =>
        lock
          ? `Olá! Preciso de chaveiro (${name}). Estou no local agora.`
          : `Olá! Vi o site da ${name} e quero um orçamento.`,
      badge: lock ? "Chaveiro · resposta rápida" : "Serviço técnico · WhatsApp",
      servicesTitle: "O que a gente resolve",
      galleryTitle: "Prova de quem resolve",
      socialProofTitle: "Quem já chamou e resolveu",
      surface: "dark",
      colors: {
        bg: "#06090f",
        fg: "#f8fafc",
        accent: "#f5c518",
        accentFg: "#0b1016",
        muted: "#94a3b8",
        card: "#0e1520",
        banner: "#121925",
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
            { name: "Orçamento WhatsApp", description: "Manda foto ou áudio e recebe proposta.", hint: "direto" },
          ],
      photos: PHOTOS.trade,
    };
  }

  if (/sorvet|gelat|acai/.test(n)) {
    return {
      family: "sweet",
      label: /acai/.test(n) ? "Açaí" : "Sorveteria",
      eyebrow: "Olhou · quis · pediu",
      headlineHook: "Vitrine que dá água na boca — sabores, potes e festa resolvidos no WhatsApp",
      cta: "Pedir meu sabor agora",
      ctaSecondary: "Ver no mapa",
      waPrefill: (name) => `Olá! Quero pedir na ${name}. Quais sabores tem agora?`,
      badge: "Sorveteria · pedidos",
      servicesTitle: "O que dá pra pedir",
      galleryTitle: "Vitrine irresistível",
      socialProofTitle: "Quem voltou por mais",
      surface: "light",
      colors: {
        bg: "#f0f9ff",
        fg: "#0c4a6e",
        accent: "#0284c7",
        accentFg: "#fff",
        muted: "#38bdf8",
        card: "#ffffff",
        banner: "#e0f2fe",
      },
      services: [
        { name: "Casquinha & pote", description: "Do unitário ao pack família — pra levar agora.", hint: "levar" },
        { name: "Sabores do dia", description: "Pergunte no WhatsApp o que acabou de sair.", hint: "fresco" },
        { name: "Encomenda festa", description: "Reserve com antecedência e surpreenda.", hint: "evento" },
      ],
      photos: PHOTOS.sweet,
    };
  }

  if (/padaria|cafeteria|cafe|doceria|confeitaria/.test(n)) {
    return {
      family: "sweet",
      label: /padaria/.test(n) ? "Padaria" : /doceria|confeitaria/.test(n) ? "Doceria" : "Café",
      eyebrow: "Saindo do forno · ainda quente",
      headlineHook: "Cheiro de pão, café e encomenda fácil — o cliente reserva no WhatsApp antes de passar",
      cta: "Encomendar agora",
      ctaSecondary: "Como chegar",
      waPrefill: (name) => `Olá! Quero encomendar na ${name}.`,
      badge: "Padaria · encomenda",
      servicesTitle: "Do forno pra mesa",
      galleryTitle: "Ambiente aconchegante",
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
        { name: "Frescos do dia", description: "Pães e salgados saindo do forno agora.", hint: "hoje" },
        { name: "Café & lanches", description: "Pra comer aqui ou levar no caminho.", hint: "rápido" },
        { name: "Encomendas", description: "Bolos e kits pelo WhatsApp.", hint: "festa" },
      ],
      photos: PHOTOS.bakery,
    };
  }

  if (/advog|jurid|contab|arquitet|despachante/.test(n)) {
    return {
      family: "pro",
      label: /advog/.test(n) ? "Advocacia" : /contab/.test(n) ? "Contabilidade" : "Escritório",
      eyebrow: "Sério. Claro. Converte.",
      headlineHook: "Quem busca serviço profissional julga em 3 segundos — este site abre a conversa certa no WhatsApp",
      cta: "Marcar conversa inicial",
      ctaSecondary: "Endereço no mapa",
      waPrefill: (name) => `Olá! Vi o site da ${name} e gostaria de uma conversa inicial.`,
      badge: "Escritório · autoridade",
      servicesTitle: "Como o cliente entra",
      galleryTitle: "Ambiente que transmite seriedade",
      socialProofTitle: "Clientes no mapa",
      surface: "dark",
      colors: {
        bg: "#050a14",
        fg: "#eef3fb",
        accent: "#3b82f6",
        accentFg: "#fff",
        muted: "#94a3b8",
        card: "#0c1322",
        banner: "#101c33",
      },
      services: [
        { name: "Consultoria inicial", description: "Entendemos o caso com clareza, sem juridiquês.", hint: "30 min" },
        { name: "Documentos", description: "Revisão e elaboração sob demanda.", hint: "preciso" },
        { name: "Acompanhamento", description: "Atualizações diretas pelo WhatsApp.", hint: "direto" },
      ],
      photos: PHOTOS.pro,
    };
  }

  if (/imobili|corretor/.test(n)) {
    return {
      family: "estate",
      label: "Imobiliária",
      eyebrow: "Casa certa · corretor no zap",
      headlineHook: "O cliente imagina a casa, marca a visita e fala com o corretor no WhatsApp — sem burocracia no primeiro contato",
      cta: "Falar com corretor agora",
      ctaSecondary: "Ver no mapa",
      waPrefill: (name) => `Olá! Vi o site da ${name} e quero ver opções de imóvel.`,
      badge: "Imóveis · visita",
      servicesTitle: "Do interesse ao fechamento",
      galleryTitle: "Imóveis & região",
      socialProofTitle: "Quem já visitou",
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
        { name: "Visita guiada", description: "Agende horário no imóvel que te interessou.", hint: "agenda" },
        { name: "Avaliação", description: "Leitura rápida de valor de mercado na região.", hint: "local" },
        { name: "Proposta", description: "Negociação acompanhada até o fechamento.", hint: "fechamento" },
      ],
      photos: PHOTOS.estate,
    };
  }

  if (/pet|veterin/.test(n)) {
    return {
      family: "pet",
      label: /veterin/.test(n) ? "Veterinária" : "Pet shop",
      eyebrow: "Seu pet merece hora marcada",
      headlineHook: "Banho, tosa ou consulta sem fila — o tutor marca no WhatsApp e leva o pet no horário certo",
      cta: "Agendar pro meu pet",
      ctaSecondary: "Como chegar",
      waPrefill: (name) => `Olá! Quero agendar na ${name} para meu pet.`,
      badge: "Pet · carinho",
      servicesTitle: "Carinho com hora marcada",
      galleryTitle: "Espaço acolhedor",
      socialProofTitle: "Tutores felizes",
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
        { name: "Banho & tosa", description: "Horário marcado, sem fila, com carinho.", hint: "agenda" },
        { name: "Consulta", description: "Avaliação atenta à saúde do seu pet.", hint: "saúde" },
        { name: "Dúvidas rápidas", description: "Manda mensagem no WhatsApp quando precisar.", hint: "ágil" },
      ],
      photos: PHOTOS.pet,
    };
  }

  if (/academia|fitness|personal/.test(n)) {
    return {
      family: "fitness",
      label: "Academia",
      eyebrow: "Vê a estrutura · sente a energia",
      headlineHook: "O aluno quer ver o espaço, sentir a vibe e falar com a equipe — planos claros no WhatsApp",
      cta: "Quero treinar aqui",
      ctaSecondary: "Ver no mapa",
      waPrefill: (name) => `Olá! Quero conhecer a ${name} e saber dos planos.`,
      badge: "Fitness · planos",
      servicesTitle: "Planos & energia",
      galleryTitle: "Estrutura que motiva",
      socialProofTitle: "Alunos no mapa",
      surface: "dark",
      colors: {
        bg: "#070708",
        fg: "#fafafa",
        accent: "#a3e635",
        accentFg: "#14532d",
        muted: "#a1a1aa",
        card: "#141416",
        banner: "#1f1f22",
      },
      services: [
        { name: "Musculação", description: "Área completa com orientação pra evoluir.", hint: "base" },
        { name: "Aulas coletivas", description: "Grade semanal com energia de verdade.", hint: "energia" },
        { name: "Avaliação física", description: "Comece com meta clara e acompanhamento.", hint: "meta" },
      ],
      photos: PHOTOS.fitness,
    };
  }

  return {
    family: "service",
    label: kind.segment || "Negócio local",
      eyebrow: "Seu cliente te encontra · e te chama",
      headlineHook: "Horário, endereço e WhatsApp num site que parece negócio grande — o cliente confia e manda mensagem",
      cta: "Falar no WhatsApp",
      ctaSecondary: "Ver no mapa",
      waPrefill: (name) => `Olá! Vi o site da ${name} e quero mais informações.`,
      badge: "Site · WhatsApp",
      servicesTitle: "Como te encontrar",
      galleryTitle: "Ambiente",
      socialProofTitle: "Prova social do mapa",
      surface: "dark",
      colors: {
        bg: "#080e18",
        fg: "#f1f5f9",
        accent: "#34d399",
        accentFg: "#064e3b",
        muted: "#94a3b8",
        card: "#0f1623",
        banner: "#172033",
      },
      services: [
        { name: "Atendimento", description: "Fale com o responsável pelo WhatsApp.", hint: "direto" },
        { name: "Horário & endereço", description: "Tudo claro em um link só.", hint: "fácil" },
        { name: "Prova social", description: "Avaliações do mapa em evidência.", hint: "confiança" },
      ],
    photos: PHOTOS.pro,
  };
}
