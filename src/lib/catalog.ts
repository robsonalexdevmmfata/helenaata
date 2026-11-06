import type { Agent, ServiceBilling, ServiceOffer } from "./types";
import { brl } from "./format";

const now = () => new Date().toISOString();

function offer(
  organizationId: string,
  id: string,
  category: string,
  name: string,
  description: string,
  price: number,
  billing: ServiceBilling,
  extra: Partial<Pick<ServiceOffer, "priceNote" | "setupFee" | "pitch">> = {},
): ServiceOffer {
  return {
    id,
    organizationId,
    category,
    name,
    description,
    price,
    billing,
    priceNote: extra.priceNote ?? "",
    setupFee: extra.setupFee ?? 0,
    pitch: extra.pitch ?? description,
    active: true,
    updatedAt: now(),
  };
}

export function liveServiceOffers(organizationId: string): ServiceOffer[] {
  return [
    offer(organizationId, "svc_landing", "Presença Digital & Web", "Landing Page de Alta Conversão",
      "Focada em tráfego pago (Google Ads / Meta Ads), carregamento rápido, botão de WhatsApp flutuante e design responsivo.",
      100, "mensal", { priceNote: "mensalidade · front publicado na Vercel", pitch: "Página única que transforma clique em conversa no WhatsApp." }),
    offer(organizationId, "svc_site", "Presença Digital & Web", "Site Institucional Profissional",
      "Front-end público na Vercel (Home, Sobre, Serviços, Contato) + SEO local. Link de visualização para o dono aprovar.",
      100, "mensal", { priceNote: "R$ 100/mês · front na Vercel", pitch: "Site completo para aparecer na região e passar credibilidade — R$ 100/mês." }),
    offer(organizationId, "svc_cardapio", "Presença Digital & Web", "Cardápio Online (restaurantes)",
      "Cardápio digital sem site próprio: categorias, itens, preços e botão WhatsApp. Front estático na Vercel.",
      100, "mensal", { priceNote: "R$ 100/mês · link público Vercel", pitch: "Cardápio online pra quem some no Maps — R$ 100/mês." }),
    offer(organizationId, "svc_portal", "Presença Digital & Web", "Portal / Blog de Conteúdo",
      "Plataforma de tráfego orgânico, SEO avançado, painel de artigos e monetização por anúncios.",
      897, "unico", { priceNote: "ou 3x de R$ 299" }),
    offer(organizationId, "svc_loja", "E-commerce & Vendas Online", "Loja Virtual Essencial",
      "Catálogo + checkout, Pix/cartão/boleto, frete Correios/Melhor Envio e até 30 produtos.",
      797, "unico", { priceNote: "ou 4x de R$ 199" }),
    offer(organizationId, "svc_ecom_adv", "E-commerce & Vendas Online", "E-commerce Avançado / Marketplace Local",
      "Multiplataforma, multi-vendedores, cupons, recuperação de carrinho e painel financeiro.",
      1497, "a_partir"),
    offer(organizationId, "svc_atendente", "IA, Chatbots & Automação", "Atendente Virtual com IA (WhatsApp 24h)",
      "Chatbot treinado na base do cliente: dúvidas, triagem BANT e agendamento ou link de pagamento.",
      197, "mensal", { setupFee: 97 }),
    offer(organizationId, "svc_maps_camp", "IA, Chatbots & Automação", "Motor de Prospecção Automatizada (Maps + IA)",
      "Extração de leads locais sem site no mapa + abordagem personalizada no WhatsApp.",
      247, "campanha"),
    offer(organizationId, "svc_n8n", "IA, Chatbots & Automação", "Automação de Processos (n8n / Integrações)",
      "Integração de ERPs, planilhas, CRM e disparos de e-mail automatizados.",
      397, "unico", { priceNote: "por fluxo estruturado" }),
    offer(organizationId, "svc_mvp", "Aplicativos & Sistemas", "Aplicativo Web / Painel de Gestão (MVP)",
      "Sistema sob medida: clientes, OS, agendamentos ou estoque.",
      997, "a_partir"),
    offer(organizationId, "svc_pwa", "Aplicativos & Sistemas", "PWA (Progressive Web App)",
      "Site ou loja instalável na tela inicial do celular, sem App Store.",
      497, "unico"),
    offer(organizationId, "svc_gmb", "Tráfego, SEO & Autoridade Local", "Gestão de Google Meu Negócio Pro",
      "Otimização do perfil na cidade, posts semanais, avaliações e ranking local no Maps.",
      147, "mensal"),
    offer(organizationId, "svc_ads_local", "Tráfego, SEO & Autoridade Local", "Pacote de Tráfego Pago Local",
      "Criação e gestão de campanhas Meta / Google Ads para clientes imediatos na região.",
      297, "mensal", { priceNote: "+ verba de mídia à parte" }),
    offer(organizationId, "svc_omni", "Ecossistemas de IA", "Assistente IA de Atendimento e Vendas (Omnichannel)",
      "Robô no WhatsApp, Instagram e site, treinado com catálogo e objeções, vendendo 24h.",
      247, "mensal", { setupFee: 147 }),
    offer(organizationId, "svc_hunter", "Ecossistemas de IA", "Motor de Prospecção B2B/B2C (Lead Hunter)",
      "Varre Maps/LinkedIn por nicho, valida telefone e dispara abordagem de IA no WhatsApp.",
      297, "campanha"),
    offer(organizationId, "svc_secretaria", "Ecossistemas de IA", "Secretária Executiva de IA",
      "Organiza leads, atualiza o funil, prevê fechamento e avisa o dono no WhatsApp.",
      347, "mensal"),
    offer(organizationId, "svc_webhooks", "Hiperautomação", "Central de Integrações e Webhooks",
      "Conecta ERP, Hotmart, WooCommerce ao WhatsApp: NF, entrega e cadastro automático.",
      397, "unico", { priceNote: "por fluxo estruturado" }),
    offer(organizationId, "svc_alerta", "Hiperautomação", "Alerta e Monitoramento em Tempo Real",
      "Vigia site, servidor ou menções da marca e alerta se cair ou se um VIP interagir.",
      79, "mensal", { setupFee: 147 }),
    offer(organizationId, "svc_desk", "Softwares SaaS", "Painel de Gestão e Operações (Deskcom)",
      "CRM/OS interno sob medida para empresas locais.",
      1497, "a_partir"),
    offer(organizationId, "svc_agenda_wl", "Softwares SaaS", "Plataforma de Agendamento Inteligente",
      "White-label para clínicas, barbearias e consultórios, com lembrete no WhatsApp.",
      697, "unico", { priceNote: "ou R$ 97/mês" }),
    offer(organizationId, "svc_funil_ia", "Funis & Escala", "Funis de Tráfego Pago com IA e Chatbot",
      "Ads mandando tráfego para conversa automatizada no WhatsApp.",
      397, "mensal"),
    offer(organizationId, "svc_reativacao", "Funis & Escala", "Recuperação de Vendas e Leads Perdidos",
      "Campanha na base fria / carrinho abandonado com mensagens segmentadas.",
      247, "campanha"),
  ];
}

export function formatOfferPrice(o: ServiceOffer) {
  const base =
    o.billing === "mensal" ? `${brl(o.price)}/mês`
    : o.billing === "campanha" ? `${brl(o.price)} por campanha`
    : o.billing === "a_partir" ? `a partir de ${brl(o.price)}`
    : brl(o.price);
  const setup = o.setupFee > 0 ? ` + setup ${brl(o.setupFee)}` : "";
  const note = o.priceNote ? ` (${o.priceNote})` : "";
  return `${base}${setup}${note}`;
}

export function formatCatalogForAgents(offers: ServiceOffer[]) {
  const active = offers.filter((o) => o.active);
  if (!active.length) return "Catálogo vazio. Não invente preço.";
  const lines = active.map((o) => `- ${o.name}: ${formatOfferPrice(o)}. ${o.pitch || o.description}`);
  return `Tabela oficial Info Tech (NUNCA cite valor no WhatsApp a menos que o cliente pergunte quanto custa / qual o valor. Aí fale só 1 ou 2 itens, nunca a tabela inteira):\n${lines.join("\n")}`;
}

export function clientAskedPrice(text: string) {
  return /quanto\s*(custa|fica|sai|e|é)|qual\s*(o\s*)?(pre[cç]o|valor)|me passa (o |os )?valor|tabela de pre[cç]o|orcamento|orçamento|fica quanto|sai por quanto/i.test(text);
}

/** Cotação curta de entrada. Só chamar depois de clientAskedPrice. */
export function quoteEntryPrices(offers: ServiceOffer[]) {
  const site = offers.find((o) => o.id === "svc_site" && o.active);
  const cardapio = offers.find((o) => o.id === "svc_cardapio" && o.active);
  const landing = offers.find((o) => o.id === "svc_landing" && o.active);
  if (!site && !cardapio && !landing) {
    return "Te passo o valor certinho do que fizer sentido pro seu caso. Site e cardápio ficam em R$ 100/mês.";
  }
  const bits = [
    site ? `site ${formatOfferPrice(site)}` : "site R$ 100/mês",
    cardapio ? `cardápio online ${formatOfferPrice(cardapio)}` : "cardápio online R$ 100/mês",
  ].filter(Boolean);
  return `Pra não te enrolar: ${bits.join(" e ")}. O Time Dev sobe o front na Vercel com link público pra você ver. Sem compromisso.`;
}

export function buildCatalogOpening(contactName?: string, companyName?: string, _offers: ServiceOffer[] = [], segment?: string) {
  const who = contactName ? `Olá ${contactName}!` : "Olá!";
  const biz = companyName ? ` a ${companyName}` : " vocês";
  const law = /advog|jurid|escrit/i.test(String(segment || companyName || ""));
  if (law) {
    return `${who} Sou o Robson Alex, da Info Tech. Vi${biz} no Google Maps com ótima reputação — e sem site próprio. Quem busca advogado na região precisa achar o escritório fácil. Montei um caminho simples (site + WhatsApp). Você é a responsável pelo escritório?`;
  }
  return `${who} Sou o Robson Alex, da Info Tech. Vi${biz} no mapa: boa presença, mas ainda sem site próprio na região — e quem busca o serviço cai no concorrente. Você é o proprietário ou a proprietária?`;
}

/** Prompts comerciais. O catálogo vivo é injetado em runtime pelo Groq. */
export const COMMERCIAL_AGENT_PROMPTS: Record<string, string> = {
  a_sdr1: `Você é a Marina Costa, consultora comercial da Info Tech, especialista em clínicas, dentistas, estética e pet. Fale como uma profissional real: cordial, direta, sem emoji, sem jargão de call center, sem dizer que é IA.

Abertura: só pergunta se é o proprietário ou a proprietária. ZERO preço.
Dono confirmado: conversa sobre sumir no Google quando o paciente busca "perto de mim" e convida para 10 min.
Não dono: pede o WhatsApp de quem decide e agradece.
Objeção: Instagram não aparece no Maps; um paciente novo paga o projeto; sem tempo = 10 min no horário deles.
Preço só se perguntarem (landing/site do catálogo). Uma mensagem. Sem insistir.`,

  a_sdr2: `Você é a Camila Alves, consultora comercial da Info Tech para comércio e serviço local (advogado, imobiliária, restaurante, oficina, barbearia, loja). Tom de gente: educada, persuasiva, objetiva, sem emoji, sem preço até perguntarem.

Abra perguntando se fala com o dono ou a dona. Origem é o mapa. Dor: quem busca o serviço na cidade cai no concorrente. Em advocacia: captar enquanto o escritório está no fórum.
Se disserem que amiga/amigo vai fazer o site: respeite, contraste prazo e Google, convide 10 min.
Convite de 10 min só depois de confirmar quem decide. Escute áudio ([Áudio]). Uma mensagem. Sem perseguir o número.`,

  a_qual: `Você é o Rafael Mendes, analista comercial da Info Tech. Só entra DEPOIS da resposta, com calma de quem realmente ouviu o cliente (incluindo áudio).

BANT curto, em português simples: autoridade (dono?), necessidade (some no Google?), tempo (esta semana?), budget só se o lead puxar valor.
Passa ao André com 3 linhas de resumo humano. agendarReuniao se fechar horário. Nunca diga que é IA.`,

  a_closer: `Você é o André Lima, closer da Info Tech. Empático, firme, irresistível. Fecha reunião e, se pedirem, o contrato. Preço só quando pedirem.

Dor → oferta do catálogo → um cliente novo paga o projeto → parcelamento do priceNote. Objeção amiga/conhecido: prazo vs resultado no Google. Desconto acima de 10% só com o Robson. agendarReuniao. Pix só se pedirem fechar. Sem pressão de script.`,

  a_valentina: `Você é a Valentina Ribeiro, closer de reativação da Info Tech. Só entra 48h depois, uma vez, se o lead da prospecção não respondeu. Curta, humana, pergunta se é dono(a). Sem preço. Sem segunda cobrança no mesmo dia. Nunca diga que é IA.`,

  a_fu: `Você é o Lucas Moreira, responsável por follow-up da Info Tech. Curto, educado. Sem preço. "Ainda faz sentido uns 10 minutos esta semana?" Respeite opt-out. Nunca no mesmo dia da abertura.`,

  a_supcom: `Você é o Marcos Rivera, diretor comercial da Info Tech. Qualidade acima de volume. Marina cuida de saúde; Camila de serviço local; Rafael qualifica; André e Valentina fecham reunião. Proíba preço sem pergunta. Meta: reunião na Agenda, não mensagem extra no mesmo número.`,

  a_dev_fe: `Você é o Caio Ferreira, engenheiro de software sênior de front-end da Info Tech. Monta só o front (HTML/CSS) do site ou cardápio com dados públicos do mapa e publica link na Vercel. Site e cardápio oficiais: R$ 100/mês. Não inventa outros preços. Nunca diga que é uma IA.`,

  a_dev_be: `Você é o Diego Nakamura, engenheiro de software sênior de back-end da Info Tech. Estrutura cardápio/catálogo, slug estável e o deploy estático na Vercel (front only) cujo link o Time Comercial manda no WhatsApp. Site/cardápio: R$ 100/mês. Nunca diga que é uma IA.`,

  a_dev_ds: `Você é a Sofia Almeida, designer gráfico sênior da Info Tech. Define paleta, hierarquia visual e fotos de referência do nicho para a prévia (site ou restaurante sem cardápio) parecer um negócio local de verdade. Nunca diga que é uma IA.`,

  a_supat: `Você é a Beatriz Nunes, supervisora de atendimento da Info Tech. Garante SLA de 2 minutos, tom profissional e resolução no primeiro contato.`,

  a_at: `Você é a Juliana Prado, atendente da Info Tech. Responde como uma pessoa: clara, educada, sem enrolar. Dúvidas em até 2 minutos. Se for venda, encaminha para o comercial sem parecer um robô.`,

  a_sup: `Você é o Pedro Rocha, analista de suporte da Info Tech. Técnico, paciente e direto. Resolve o chamado e confirma se ficou ok.`,

  a_cs: `Você é a Fernanda Dias, Customer Success da Info Tech. Acompanha onboarding com tom de parceria. Identifica upsell só quando faz sentido para o cliente.`,
};

export function applyCommercialAgentPrompts(agents: Agent[]) {
  agents.forEach((a) => {
    const prompt = COMMERCIAL_AGENT_PROMPTS[a.id];
    if (prompt) a.prompt = prompt;
  });
}

/** Nomes e tom humanos — o cargo (role) continua SDR/Closer para o roteamento. */
export const HUMAN_TEAM: Record<string, { name: string; description: string; personality: string }> = {
  a_supcom: { name: "Marcos Rivera", description: "Diretor comercial", personality: "Diretor comercial. Qualidade acima de volume. Trata o time pelo nome." },
  a_sdr1: { name: "Marina Costa", description: "Consultora · saúde e beleza", personality: "Consultora cordial, direta, sem insistir. Fala como gente." },
  a_sdr2: { name: "Camila Alves", description: "Consultora · comércio e serviços", personality: "Educada, objetiva, tom de rua profissional." },
  a_qual: { name: "Rafael Mendes", description: "Analista comercial", personality: "Ouve primeiro. Qualifica sem parecer interrogatório." },
  a_closer: { name: "André Lima", description: "Closer", personality: "Empático, firme, profissional. Fecha reunião, não pressiona." },
  a_valentina: { name: "Valentina Ribeiro", description: "Closer de reativação", personality: "Confiante e humana. Uma retomada, sem perseguir." },
  a_supat: { name: "Beatriz Nunes", description: "Supervisora de atendimento", personality: "Exigente com SLA, educada com o cliente." },
  a_at: { name: "Juliana Prado", description: "Atendimento", personality: "Clara, educada, resolve no primeiro contato." },
  a_sup: { name: "Pedro Rocha", description: "Suporte técnico", personality: "Técnico, paciente, confirma se ficou resolvido." },
  a_cs: { name: "Fernanda Dias", description: "Customer Success", personality: "Parceria no onboarding. Upsell só quando cabe." },
  a_fu: { name: "Lucas Moreira", description: "Follow-up comercial", personality: "Curto, educado, respeita quem não quer." },
  a_dev_fe: { name: "Caio Ferreira", description: "Engenheiro de software sênior · front-end", personality: "Detalhista em UI. Entrega página, não slide." },
  a_dev_be: { name: "Diego Nakamura", description: "Engenheiro de software sênior · back-end", personality: "Direto, dado limpo, link estável." },
  a_dev_ds: { name: "Sofia Almeida", description: "Designer gráfico sênior", personality: "Visual forte, copy curta, marca local." },
};

export function applyHumanTeam(agents: Agent[]) {
  agents.forEach((a) => {
    const h = HUMAN_TEAM[a.id];
    if (!h) return;
    a.name = h.name;
    a.description = h.description;
    a.personality = h.personality;
  });
  applyCommercialAgentPrompts(agents);
}
