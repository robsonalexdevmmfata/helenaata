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
      497, "unico", { priceNote: "ou 3x de R$ 180", pitch: "Página única que transforma clique em conversa no WhatsApp." }),
    offer(organizationId, "svc_site", "Presença Digital & Web", "Site Institucional Profissional",
      "Até 5 páginas (Home, Sobre, Serviços, Blog/Portfólio, Contato) + SEO local para Google Maps e buscas da região.",
      897, "unico", { priceNote: "ou 3x de R$ 320", pitch: "Site completo para aparecer na região e passar credibilidade." }),
    offer(organizationId, "svc_portal", "Presença Digital & Web", "Portal / Blog de Conteúdo",
      "Plataforma de tráfego orgânico, SEO avançado, painel de artigos e monetização por anúncios.",
      1497, "unico", { priceNote: "ou 4x de R$ 400" }),
    offer(organizationId, "svc_loja", "E-commerce & Vendas Online", "Loja Virtual Essencial",
      "Catálogo + checkout, Pix/cartão/boleto, frete Correios/Melhor Envio e até 30 produtos.",
      1297, "unico", { priceNote: "ou 4x de R$ 350" }),
    offer(organizationId, "svc_ecom_adv", "E-commerce & Vendas Online", "E-commerce Avançado / Marketplace Local",
      "Multiplataforma, multi-vendedores, cupons, recuperação de carrinho e painel financeiro.",
      2497, "a_partir"),
    offer(organizationId, "svc_atendente", "IA, Chatbots & Automação", "Atendente Virtual com IA (WhatsApp 24h)",
      "Chatbot treinado na base do cliente: dúvidas, triagem BANT e agendamento ou link de pagamento.",
      297, "mensal", { setupFee: 200 }),
    offer(organizationId, "svc_maps_camp", "IA, Chatbots & Automação", "Motor de Prospecção Automatizada (Maps + IA)",
      "Extração de leads locais sem site no mapa + abordagem personalizada no WhatsApp.",
      397, "campanha"),
    offer(organizationId, "svc_n8n", "IA, Chatbots & Automação", "Automação de Processos (n8n / Integrações)",
      "Integração de ERPs, planilhas, CRM e disparos de e-mail automatizados.",
      597, "unico", { priceNote: "por fluxo estruturado" }),
    offer(organizationId, "svc_mvp", "Aplicativos & Sistemas", "Aplicativo Web / Painel de Gestão (MVP)",
      "Sistema sob medida: clientes, OS, agendamentos ou estoque.",
      1997, "a_partir"),
    offer(organizationId, "svc_pwa", "Aplicativos & Sistemas", "PWA (Progressive Web App)",
      "Site ou loja instalável na tela inicial do celular, sem App Store.",
      997, "unico"),
    offer(organizationId, "svc_gmb", "Tráfego, SEO & Autoridade Local", "Gestão de Google Meu Negócio Pro",
      "Otimização do perfil na cidade, posts semanais, avaliações e ranking local no Maps.",
      250, "mensal"),
    offer(organizationId, "svc_ads_local", "Tráfego, SEO & Autoridade Local", "Pacote de Tráfego Pago Local",
      "Criação e gestão de campanhas Meta / Google Ads para clientes imediatos na região.",
      497, "mensal", { priceNote: "+ % do budget de mídia" }),
    offer(organizationId, "svc_omni", "Ecossistemas de IA", "Assistente IA de Atendimento e Vendas (Omnichannel)",
      "Robô no WhatsApp, Instagram e site, treinado com catálogo e objeções, vendendo 24h.",
      397, "mensal", { setupFee: 297 }),
    offer(organizationId, "svc_hunter", "Ecossistemas de IA", "Motor de Prospecção B2B/B2C (Lead Hunter)",
      "Varre Maps/LinkedIn por nicho, valida telefone e dispara abordagem de IA no WhatsApp.",
      497, "campanha"),
    offer(organizationId, "svc_secretaria", "Ecossistemas de IA", "Secretária Executiva de IA",
      "Organiza leads, atualiza o funil, prevê fechamento e avisa o dono no WhatsApp.",
      597, "mensal"),
    offer(organizationId, "svc_webhooks", "Hiperautomação", "Central de Integrações e Webhooks",
      "Conecta ERP, Hotmart, WooCommerce ao WhatsApp: NF, entrega e cadastro automático.",
      797, "unico", { priceNote: "por fluxo estruturado" }),
    offer(organizationId, "svc_alerta", "Hiperautomação", "Alerta e Monitoramento em Tempo Real",
      "Vigia site, servidor ou menções da marca e alerta se cair ou se um VIP interagir.",
      99, "mensal", { setupFee: 350 }),
    offer(organizationId, "svc_desk", "Softwares SaaS", "Painel de Gestão e Operações (Deskcom)",
      "CRM/OS interno sob medida para empresas locais.",
      2497, "a_partir"),
    offer(organizationId, "svc_agenda_wl", "Softwares SaaS", "Plataforma de Agendamento Inteligente",
      "White-label para clínicas, barbearias e consultórios, com lembrete no WhatsApp.",
      1497, "unico", { priceNote: "ou R$ 147/mês" }),
    offer(organizationId, "svc_funil_ia", "Funis & Escala", "Funis de Tráfego Pago com IA e Chatbot",
      "Ads mandando tráfego para conversa automatizada no WhatsApp.",
      997, "mensal"),
    offer(organizationId, "svc_reativacao", "Funis & Escala", "Recuperação de Vendas e Leads Perdidos",
      "Campanha na base fria / carrinho abandonado com mensagens segmentadas.",
      497, "campanha"),
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
  return `Tabela oficial Info Tech (use SOMENTE estes valores; se o gestor alterar em Orçamentos, vale o novo número):\n${lines.join("\n")}`;
}

export function buildCatalogOpening(contactName?: string, companyName?: string, offers: ServiceOffer[] = []) {
  const who = contactName ? `Olá ${contactName}!` : "Olá!";
  const biz = companyName ? ` a ${companyName}` : " vocês";
  const landing = offers.find((o) => o.active && /landing/i.test(o.name));
  const site = offers.find((o) => o.active && /institucional/i.test(o.name));
  const hook = landing
    ? `Dá para começar com uma landing de alta conversão (${formatOfferPrice(landing)}) ou um site institucional (${site ? formatOfferPrice(site) : "sob consulta"}).`
    : "Dá para começar com presença digital na região (site ou landing) e WhatsApp profissional.";
  return `${who} Sou o Robson Alex, CEO da Agência Info Tech Ltda. Notei que${biz} ainda não têm site/presença forte no Google — isso faz perder cliente todo dia na região. ${hook} Topa 10 minutos hoje às 16h ou amanhã às 10h para eu te mostrar o caminho mais rápido?`;
}

/** Prompts comerciais. O catálogo vivo é injetado em runtime pelo Groq. */
export const COMMERCIAL_AGENT_PROMPTS: Record<string, string> = {
  a_sdr1: `Você é o SDR 01 da Info Tech Ltda, falando no WhatsApp como extensão do Robson Alex (CEO). Tom: humano, direto, persuasivo, sem gíria e sem emoji.

Missão: abrir conversa com empresas SEM SITE encontradas no mapa e marcar reunião de 10 minutos. Não despeje a tabela inteira na primeira mensagem.

Primeira mensagem: dor (sumir no Google da região) + 1 oferta de entrada (landing ou site institucional com o PREÇO ATUAL do catálogo) + dois horários.

Se perguntarem preço: cite 1 ou 2 itens do catálogo oficial (nunca invente). Parcelamento só se estiver no priceNote. Desconto máximo 10% — acima, chame o Robson.

Objeções:
- "tá caro" → compare com 1 cliente perdido por semana vs. o valor da landing.
- "já tenho Instagram" → Instagram não ranqueia no Maps; quem busca "perto de mim" não te acha.
- "não tenho tempo" → por isso a reunião é 10 min e a IA atende 24h depois.
- "não tenho interesse" → agradeça, marque opt-out, não insista.

Feche sempre com pergunta. Se o horário fechar, chame agendarReuniao(leadId, dataHora, resumo).`,

  a_sdr2: `Você é o SDR 02 da Info Tech Ltda. Mesma autoridade do Robson Alex no WhatsApp: cordial, consultivo e persistente sem ser agressivo. Sem emoji.

Você pega o segundo turno do rodízio (Maps sem site). Abra com a perda de clientes locais + convite de 10 min.

Use o catálogo oficial para âncora de preço. Entrada típica: landing, site institucional, GMB Pro ou atendente IA 24h — o que combinar com o nicho (clínica, loja, escritório, restaurante).

Nunca fale de Facebook Ads como origem do lead. A origem é o mapa: eles não têm site.

Se o lead aquecer (perguntou preço, pediu exemplo, aceitou horário), passe ao Qualificador/Closer e grave a reunião.`,

  a_qual: `Você é o Qualificador da Info Tech. Depois que o SDR abriu a porta, faça BANT curto no WhatsApp:

B — orçamento: cabe no ticket de entrada do catálogo (landing/site) ou precisa do pacote maior?
A — autoridade: quem decide? dono, sócio, gerente?
N — necessidade: sem site, sem WhatsApp profissional, sem aparecer no Maps?
T — tempo: quer esta semana ou só "um dia"?

Não venda o catálogo inteiro. Escolha 1 oferta principal + 1 upsell (ex: site + GMB, ou landing + Ads). Encaminhe ao Closer com o resumo e peça o horário. agendarReuniao quando fechar.`,

  a_closer: `Você é o Closer da Info Tech. Fecha reunião, proposta e Pix. Tom de consultor: empático e firme.

Na reunião (ou no WhatsApp se o lead quiser fechar já):
1. Recapitule a dor (não aparece no Google / perde cliente).
2. Ofereça o SKU do catálogo que o Qualificador indicou, com o preço ATUAL.
3. Âncora: mostre o item mais caro e volte para o de entrada.
4. Quebre preço com parcelamento do priceNote. Desconto >10% só com o Robson.
5. CTA: "Fechamos o site institucional hoje e a landing entra de bônus no setup" — só se fizer sentido; não invente bônus.
6. Horário na Agenda: agendarReuniao. Pix: sales.generate_checkout_pix.

Nunca invente serviço que não está em Orçamentos.`,

  a_fu: `Você é o Follow-up da Info Tech. Retoma quem viu preço e sumiu. Mensagem curta: lembre a dor + o item que eles olharam + "ainda faz sentido 10 min amanhã às 10h?". Sem pressão de lista. Respeite opt-out.`,

  a_supcom: `Você é o Supervisor Comercial da Info Tech. Distribua Maps sem site entre SDR 01 e SDR 02 em rodízio. Cobrar reunião na Agenda, não volume de mensagem. Se o lead pedir preço, o SDR usa o catálogo vivo de Orçamentos.`,
};

export function applyCommercialAgentPrompts(agents: Agent[]) {
  agents.forEach((a) => {
    const prompt = COMMERCIAL_AGENT_PROMPTS[a.id];
    if (prompt) a.prompt = prompt;
  });
}
