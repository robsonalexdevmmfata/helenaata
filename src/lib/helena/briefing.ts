// Helena AI - Modo Briefing Executivo / Entrada Diária
import type { DB } from "@/lib/types";
import { brl } from "@/lib/format";

export interface BriefingConfig {
  enabled: boolean;
  userTitle: string; // "Sócio-Fundador" | "Chefe" | "Líder" | "Diretora" | custom
  userName: string;
  triggerPhrase: string; // "Olá Helena, cheguei"
  exitTriggerPhrase: string; // "Helena, encerrando por hoje"
  voiceTone: string; // "Executivo & Foco em Metas" | "Inspirador & Agressivo" | "Direto e Sucinto"
  musicUrl: string; // YouTube URL
  musicVolume: number; // 0 - 100
  autoPlayMusic: boolean;
  customOpening: string;
}

export const MUSIC_PRESETS = [
  { id: "HWjCStB6k4o", title: "Ace of Base - Happy Nation (Original Clássico)", url: "https://www.youtube.com/watch?v=HWjCStB6k4o" },
  { id: "jfKfPfyJRdk", title: "Lo-Fi Instrumental Foco & Trabalho", url: "https://www.youtube.com/watch?v=jfKfPfyJRdk" },
  { id: "1T2Z2-xMsmk", title: "Trilha Sonora Épica & Inspiradora", url: "https://www.youtube.com/watch?v=1T2Z2-xMsmk" },
  { id: "4xDzrJKXOOY", title: "Synthwave / Cyberpunk Deep Flow", url: "https://www.youtube.com/watch?v=4xDzrJKXOOY" },
];

const BRIEFING_KEY = "helena_briefing_config";

export function getBriefingConfig(): BriefingConfig {
  if (typeof window === "undefined") {
    return {
      enabled: true,
      userTitle: "Sócio-Fundador",
      userName: "Letícia",
      triggerPhrase: "Olá Helena, cheguei",
      exitTriggerPhrase: "Helena, encerrando por hoje",
      voiceTone: "Executivo & Foco em Metas",
      musicUrl: "https://www.youtube.com/watch?v=HWjCStB6k4o", // Happy Nation - Ace of Base
      musicVolume: 18,
      autoPlayMusic: true,
      customOpening: "Olá, {titulo} {nome}! Que bom ter você aqui.",
    };
  }

  try {
    const raw = localStorage.getItem(BRIEFING_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}

  const defaults: BriefingConfig = {
    enabled: true,
    userTitle: "Sócio-Fundador",
    userName: "Letícia",
    triggerPhrase: "Olá Helena, cheguei",
    exitTriggerPhrase: "Helena, encerrando por hoje",
    voiceTone: "Executivo & Foco em Metas",
    musicUrl: "https://www.youtube.com/watch?v=HWjCStB6k4o", // Happy Nation - Ace of Base
    musicVolume: 18,
    autoPlayMusic: true,
    customOpening: "Olá, {titulo} {nome}! Que bom ter você aqui.",
  };
  try {
    localStorage.setItem(BRIEFING_KEY, JSON.stringify(defaults));
  } catch {}
  return defaults;
}

export function saveBriefingConfig(cfg: Partial<BriefingConfig>): BriefingConfig {
  const current = getBriefingConfig();
  const updated = { ...current, ...cfg };
  if (typeof window !== "undefined") {
    localStorage.setItem(BRIEFING_KEY, JSON.stringify(updated));
  }
  return updated;
}

export function extractYouTubeId(url: string): string {
  if (!url) return "HWjCStB6k4o";
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
  if (match && match[1]) return match[1];
  if (/^[\w-]{11}$/.test(url.trim())) return url.trim();
  return "HWjCStB6k4o";
}

export function generateBriefingScript(
  db: DB,
  config: BriefingConfig,
  type: "entrada" | "encerramento" = "entrada"
): { title: string; script: string; highlights: Array<{ label: string; value: string }> } {
  const today = new Date().toISOString().slice(0, 10);
  const pendingApprovals = db.approvals.filter((a) => a.status === "pendente").length;
  
  // Deals & Revenue
  const wonDeals = db.deals.filter((d) => d.status === "ganho");
  const monthWonTotal = wonDeals.reduce((sum, d) => sum + d.value, 0);
  const todayWonTotal = wonDeals
    .filter((d) => d.updatedAt && d.updatedAt.slice(0, 10) === today)
    .reduce((sum, d) => sum + d.value, 0);

  // SDRs & Leads
  const semSiteLeads = db.contacts.filter((c) => c.tags.includes("sem-site")).length;
  const activeSDRs = db.agents.filter((a) => a.role === "SDR" && a.status === "trabalhando").length;
  const sdrDispatchedToday = db.agents
    .filter((a) => a.role === "SDR")
    .reduce((s, a) => s + (a.metrics.tasks || 0), 0);

  const goal = 15000;
  const pctGoal = Math.min(100, Math.round((monthWonTotal / goal) * 100));

  if (type === "encerramento") {
    const title = "Resumo Noturno de Encerramento";
    const script = `Excelente trabalho por hoje, ${config.userTitle} ${config.userName}! Expediente de prospecção do dia finalizado. A ${db.organization.name} encerra o dia com ${brl(monthWonTotal)} acumulados no mês, correspondendo a ${pctGoal}% da nossa meta de ${brl(goal)}. Os agentes SDR 01 e SDR 02 foram configurados em modo de cadência automática noturna para evitar bloqueios no WhatsApp. Descanse com tranquilidade, eu continuo monitorando a infraestrutura e o radar de atendimento. Até amanhã!`;
    return {
      title,
      script,
      highlights: [
        { label: "Status Expediente", value: "Encerrado com Sucesso" },
        { label: "Faturado no Mês", value: brl(monthWonTotal) },
        { label: "Meta R$ 15.000", value: `${pctGoal}% atingida` },
        { label: "Modo Noturno", value: "SDRs em Cadência Automática" },
      ],
    };
  }

  // Entrada / Boas-vindas
  const opening = config.customOpening
    .replace("{titulo}", config.userTitle)
    .replace("{nome}", config.userName);

  const script = `${opening} Bom dia! Seja bem-vinda ao comando da ${db.organization.name}. Hoje já temos ${semSiteLeads} empresas identificadas no Google Maps sem site institucional. Nossos ${activeSDRs || 2} agentes de prospecção já realizaram ${sdrDispatchedToday} interações comerciais. No financeiro, acumulamos ${brl(monthWonTotal)} de faturamento, avançando para a meta de ${brl(goal)}. Temos ${pendingApprovals} aprovações aguardando sua autorização. Sua prioridade máxima hoje é liberar as propostas comerciais e acompanhar os fechamentos das reuniões agendadas. O que faremos agora para dominar o mercado digital?`;

  return {
    title: "Briefing Executivo de Entrada",
    script,
    highlights: [
      { label: "Tratamento", value: `${config.userTitle} ${config.userName}` },
      { label: "Leads Google Maps", value: `${semSiteLeads} sem site` },
      { label: "Faturado no Mês", value: `${brl(monthWonTotal)} (${pctGoal}%)` },
      { label: "Aprovações Pendentes", value: `${pendingApprovals} aguardando` },
      { label: "Trilha Sonora", value: "Ace of Base - Happy Nation" },
    ],
  };
}
