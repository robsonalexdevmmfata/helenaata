// Helena AI - Modo Briefing Executivo / Entrada Diária
import type { DB } from "@/lib/types";
import { brl, greeting, isToday } from "@/lib/format";
import { autonomyBrief, nextCoachStep } from "./coach";

export interface BriefingConfig {
  enabled: boolean;
  userTitle: string; // "Sócio-Fundador" | "Chefe" | "Líder" | "Diretora" | custom
  userName: string;
  triggerPhrase: string; // "Olá Helena, cheguei"
  exitTriggerPhrase: string; // "Helena, encerrando por hoje"
  voiceTone: string; // "Executivo & Foco em Metas" | "Inspirador & Agressivo" | "Direto e Sucinto"
  musicUrl: string; // YouTube URL — entrada
  exitMusicUrl: string; // YouTube URL — despedida
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
      userTitle: "CEO",
      userName: "Robson Alex",
      triggerPhrase: "Olá Helena, cheguei",
      exitTriggerPhrase: "Helena, encerrando por hoje",
      voiceTone: "Executivo & Foco em Metas",
      musicUrl: "https://www.youtube.com/watch?v=HWjCStB6k4o",
      exitMusicUrl: "https://www.youtube.com/watch?v=jfKfPfyJRdk",
      musicVolume: 36,
      autoPlayMusic: true,
      customOpening: "Olá, {titulo} {nome}! Que bom ter você aqui.",
    };
  }

  const defaults: BriefingConfig = {
    enabled: true,
    userTitle: "CEO",
    userName: "Robson Alex",
    triggerPhrase: "Olá Helena, cheguei",
    exitTriggerPhrase: "Helena, encerrando por hoje",
    voiceTone: "Executivo & Foco em Metas",
    musicUrl: "https://www.youtube.com/watch?v=HWjCStB6k4o",
    exitMusicUrl: "https://www.youtube.com/watch?v=jfKfPfyJRdk",
    musicVolume: 36,
    autoPlayMusic: true,
    customOpening: "Olá, {titulo} {nome}! Que bom ter você aqui.",
  };
  try {
    const raw = localStorage.getItem(BRIEFING_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as BriefingConfig;
      const migrated = migrateBriefingOwner({ ...defaults, ...saved });
      if (JSON.stringify(migrated) !== JSON.stringify(saved)) {
        localStorage.setItem(BRIEFING_KEY, JSON.stringify(migrated));
      }
      return migrated;
    }
    localStorage.setItem(BRIEFING_KEY, JSON.stringify(defaults));
  } catch {}
  return defaults;
}

function migrateBriefingOwner(cfg: BriefingConfig): BriefingConfig {
  if (/leticia/i.test(cfg.userName) || cfg.userTitle === "Letícia") {
    cfg.userName = "Robson Alex";
    cfg.userTitle = "CEO";
  }
  if (cfg.musicVolume < 24) cfg.musicVolume = 36;
  if (!cfg.exitMusicUrl) cfg.exitMusicUrl = "https://www.youtube.com/watch?v=jfKfPfyJRdk";
  return cfg;
}

export function saveBriefingConfig(cfg: Partial<BriefingConfig>): BriefingConfig {
  const current = getBriefingConfig();
  const updated = { ...current, ...cfg };
  if (typeof window !== "undefined") {
    localStorage.setItem(BRIEFING_KEY, JSON.stringify(updated));
  }
  return updated;
}

/** Saudação de entrada (cheguei / bom dia) sem pedido de operação. */
export function isHelenaArrivalGreeting(text: string, triggerPhrase = "olá helena, cheguei") {
  const n = text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!.,]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const trigger = triggerPhrase
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!.,]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!n) return false;
  if (n === trigger || n === "helena cheguei" || n === "ola helena" || n === "ola helena cheguei") return true;
  if (n.includes("cheguei") || n.includes("iniciar expediente") || n.includes("abertura")) return true;
  if (/(prospect|ativar|varra|agend|fatur|maps|cliente)/.test(n)) return false;
  if (/^(ola\s+)?(helena\s+)?(bom dia|boa tarde|boa noite)(\s+helena)?$/.test(n)) return true;
  return false;
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
  const pendingApprovals = db.approvals.filter((a) => a.status === "pendente").length;
  const wonDeals = db.deals.filter((d) => d.status === "ganho");
  const monthWonTotal = wonDeals.reduce((sum, d) => sum + d.value, 0);
  const semSiteLeads = db.contacts.filter((c) => c.tags.some((t) => /sem-site/i.test(t))).length;
  const sendsToday = db.executions.filter(
    (e) => /sendText|evolution/i.test(e.action) && e.result === "sucesso" && isToday(e.at),
  ).length;
  const meetingsToday = (db.calendarEvents ?? []).filter((e) => isToday(e.dataHora) && e.status !== "cancelada").length;
  const goal = 15000;
  const pctGoal = Math.min(100, Math.round((monthWonTotal / goal) * 100));
  const greet = greeting();

  if (type === "encerramento") {
    const title = "Resumo Noturno de Encerramento";
    const script = `Excelente trabalho por hoje, ${config.userTitle} ${config.userName}! A ${db.organization.name} fecha com ${brl(monthWonTotal)} no mês (${pctGoal}% de ${brl(goal)}). Eu continuo administrando: follow-up com Lucas/Valentina e cadência leve no WhatsApp. Descanse — amanhã eu te ensino o próximo passo se ainda faltar algo no sistema.`;
    return {
      title,
      script,
      highlights: [
        { label: "Status Expediente", value: "Encerrado com Sucesso" },
        { label: "Helena", value: "Follow-up e radar ativos" },
        { label: "Faturado no Mês", value: brl(monthWonTotal) },
        { label: "Meta R$ 15.000", value: `${pctGoal}% atingida` },
      ],
    };
  }

  // Entrada / Boas-vindas
  const opening = config.customOpening
    .replace("{titulo}", config.userTitle)
    .replace("{nome}", config.userName);

  const next = nextCoachStep(db);
  const coachLine = next
    ? `Eu ensino e administro o sistema inteiro (prospecção, CRM, Inbox, Dev, follow-up). Próximo passo: ${next.title} — diga “${next.sayToHelena}”.`
    : `Eu ensino e administro o sistema inteiro. ${autonomyBrief(db)}`;

  const script = `${opening} ${greet}! Comando da ${db.organization.name}: ${semSiteLeads} leads sem site, ${sendsToday} disparos WhatsApp, ${meetingsToday} reuniões, ${brl(monthWonTotal)}/${brl(goal)} (${pctGoal}%), ${pendingApprovals} aprovações. ${coachLine}`;

  return {
    title: "Briefing Executivo de Entrada",
    script,
    highlights: [
      { label: "Tratamento", value: `${config.userTitle} ${config.userName}` },
      { label: "Papel da Helena", value: "Ensina · opera · follow-up" },
      { label: "Próximo ensino", value: next?.title ?? "Conta no ponto" },
      { label: "Leads sem site", value: String(semSiteLeads) },
      { label: "Disparos hoje", value: String(sendsToday) },
      { label: "Faturado no Mês", value: `${brl(monthWonTotal)} (${pctGoal}%)` },
      { label: "Aprovações Pendentes", value: `${pendingApprovals} aguardando` },
    ],
  };
}
