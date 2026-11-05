import type { QuoteRequest, SaasPlanId, User } from "@/lib/types";
import { getDB, listAccounts, nowISO, patchUserEverywhere, provisionCustomerAccount, syncDevTeamForAccount, uid, update } from "@/lib/store";
import { planAllowsDevTeam } from "@/lib/seed";
import { hashPw } from "@/lib/security/secrets";

export const TRIAL_DAYS = 2;
export const TRIAL_DAILY_PROSPECTS = 30;
/** Teto do usuário comum (Impulso e Máquina). Freemium fica em 30. */
export const PAID_DAILY_PROSPECTS = 150;
export const CAKTO_NOTE = "Pix e cartão na Cakto. Impulso (plano 1) ou Máquina (plano 2, Time Dev). Sem plano depois do trial a conta trava.";

export const CAKTO_CHECKOUT = {
  impulso: "https://pay.cakto.com.br/kmb4vg8_1261686",
  maquina: "https://pay.cakto.com.br/36nkrsw_1261705",
} as const;

export interface SaasPlan {
  id: Exclude<SaasPlanId, "trial">;
  name: string;
  price: number | null;
  priceLabel: string;
  tagline: string;
  dailyProspects: number;
  quote: boolean;
  highlight?: boolean;
  checkoutUrl?: string;
  features: string[];
}

export const SAAS_PLANS: SaasPlan[] = [
  {
    id: "impulso",
    name: "Impulso",
    price: 70,
    priceLabel: "R$ 70,00/mês",
    tagline: "Para quem vai validar a máquina nesta semana.",
    dailyProspects: 150,
    quote: false,
    checkoutUrl: CAKTO_CHECKOUT.impulso,
    features: [
      "Trial de 2 dias incluso no cadastro (30 leads/dia no freemium)",
      "Até 150 abordagens de prospecção por dia após assinar",
      "Helena + Time Comercial no WhatsApp",
      "CRM, inbox e agenda",
      "Trilha de entrada e despedida da Helena",
    ],
  },
  {
    id: "maquina",
    name: "Máquina",
    price: 140,
    priceLabel: "R$ 140,00/mês",
    tagline: "Operação completa. Volume que paga o plano com um cliente.",
    dailyProspects: 150,
    quote: false,
    checkoutUrl: CAKTO_CHECKOUT.maquina,
    highlight: true,
    features: [
      "Até 150 abordagens por dia (mesmo teto do Impulso)",
      "Time Dev IA + Comercial + Closer — a cota não sobe só de clicar em Ativar",
      "Prévia de site e cardápio com link no WhatsApp",
      "Objeções, Pix e reunião na Agenda",
      "Automações e analytics",
      "Suporte prioritário",
    ],
  },
  {
    id: "whitelabel",
    name: "White-label",
    price: null,
    priceLabel: "Sob consulta",
    tagline: "A Helena com a sua marca, para agência ou operação própria.",
    dailyProspects: 9999,
    quote: true,
    features: [
      "Marca, domínio e cores da sua operação",
      "Limites e times sob medida",
      "Multi-contas e handoff para o seu comercial",
      "Onboarding com o time Info Tech",
      "Prioridade de roadmap",
    ],
  },
];

export function caktoCheckoutUrl(
  planId: "impulso" | "maquina",
  customer?: { name?: string; email?: string; phone?: string },
) {
  const url = new URL(CAKTO_CHECKOUT[planId]);
  if (customer?.name) url.searchParams.set("name", customer.name);
  if (customer?.email) {
    url.searchParams.set("email", customer.email);
    url.searchParams.set("confirmEmail", customer.email);
  }
  if (customer?.phone) url.searchParams.set("phone", customer.phone.replace(/\D/g, ""));
  url.searchParams.set("src", "helena-app");
  return url.toString();
}

export function workspaceDisplayName(user?: User | null, orgName?: string) {
  const fallback = orgName?.trim() || "HELENA AI";
  if (!user) return fallback;
  if (isPlatformAdmin(user)) return fallback;
  const institution = user.companyName?.trim();
  return institution || fallback;
}

export function isPlatformAdmin(user?: User | null) {
  if (!user) return false;
  if (user.kind === "platform") return true;
  return user.role === "owner" && user.id === "u1";
}

export function canUseDevTeam(user?: User | null) {
  if (!user) return false;
  if (isPlatformAdmin(user)) return true;
  return planAllowsDevTeam(user.planId, user.kind);
}

export function planOf(user?: User | null): SaasPlan | undefined {
  if (!user?.planId || user.planId === "trial") return undefined;
  return SAAS_PLANS.find((p) => p.id === user.planId);
}

export function isFreemium(user?: User | null) {
  if (!user || isPlatformAdmin(user)) return false;
  if (user.lifetimeAccess) return false;
  if (user.planId === "impulso" || user.planId === "maquina" || user.planId === "whitelabel") return false;
  return true;
}

export function dailyLimitFor(user?: User | null) {
  if (!user || isPlatformAdmin(user)) return 10_000;
  if (user.dailyProspectLimit != null && user.dailyProspectLimit > 0) return user.dailyProspectLimit;
  if (user.planId === "whitelabel") return 9999;
  if (user.planId === "impulso" || user.planId === "maquina" || user.lifetimeAccess) return PAID_DAILY_PROSPECTS;
  return TRIAL_DAILY_PROSPECTS;
}

export function trialDeadlineMs(user?: User | null) {
  if (!user) return 0;
  if (user.lifetimeAccess) return Date.now() + 100 * 365 * 86_400_000;
  if (user.trialEndsAt) return new Date(user.trialEndsAt).getTime();
  if (user.createdAt) return new Date(user.createdAt).getTime() + TRIAL_DAYS * 86_400_000;
  return 0;
}

export function trialMsLeft(user?: User | null) {
  const end = trialDeadlineMs(user);
  if (!end) return 0;
  return end - Date.now();
}

export function isTrialActive(user?: User | null) {
  if (!user || isPlatformAdmin(user)) return false;
  if (user.planId && user.planId !== "trial") return false;
  return trialMsLeft(user) > 0;
}

export function mustSubscribe(user?: User | null) {
  if (!user || isPlatformAdmin(user)) return false;
  if (user.status !== "ativo") return true;
  if (user.lifetimeAccess) return false;
  if (user.planId === "impulso" || user.planId === "maquina") return false;
  if (user.planId === "whitelabel") return false;
  return trialMsLeft(user) <= 0;
}

export function wantsDevTeamUpgrade(user?: User | null) {
  if (!user || isPlatformAdmin(user)) return false;
  return !canUseDevTeam(user);
}

export function todayKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function prospectsUsedToday(user?: User | null, now = new Date()) {
  if (!user) return 0;
  if (user.dailyProspectDate !== todayKey(now)) return 0;
  return user.dailyProspectUsed ?? 0;
}

export function reserveProspects(requested: number, now = new Date()): { ok: boolean; allowed: number; message: string } {
  const db = getDB();
  const user = db.users.find((u) => u.id === db.currentUserId);
  if (!user || isPlatformAdmin(user)) {
    return { ok: true, allowed: requested, message: "ok" };
  }
  if (mustSubscribe(user)) {
    return { ok: false, allowed: 0, message: "Seu trial de 2 dias acabou. Escolha um plano para continuar prospectando." };
  }
  if (user.status !== "ativo") {
    return { ok: false, allowed: 0, message: "Esta conta está bloqueada. Fale com o suporte." };
  }
  const limit = dailyLimitFor(user);
  const used = prospectsUsedToday(user, now);
  const remaining = Math.max(0, limit - used);
  if (remaining <= 0) {
    return { ok: false, allowed: 0, message: `Limite diário de ${limit} prospecções atingido. Volte amanhã ou suba de plano.` };
  }
  const allowed = Math.min(requested, remaining);
  update((d) => {
    const u = d.users.find((x) => x.id === user.id);
    if (!u) return;
    const day = todayKey(now);
    if (u.dailyProspectDate !== day) {
      u.dailyProspectDate = day;
      u.dailyProspectUsed = 0;
    }
    u.dailyProspectUsed = (u.dailyProspectUsed ?? 0) + allowed;
  });
  return {
    ok: true,
    allowed,
    message: allowed < requested
      ? `Restavam ${allowed} do limite diário de ${limit}. Prospecção ajustada.`
      : "ok",
  };
}

export function trialEndsAtFrom(start = new Date()) {
  const d = new Date(start.getTime() + TRIAL_DAYS * 86_400_000);
  return d.toISOString();
}

export function registerCustomer(input: {
  name: string;
  email: string;
  password: string;
  company: string;
  phone?: string;
}): { ok: boolean; message: string; userId?: string; evolutionInstance?: string } {
  const email = input.email.trim().toLowerCase();
  const username = email.split("@")[0] || "user";
  if (listAccounts().some((u) => u.email.toLowerCase() === email || u.username.toLowerCase() === username.toLowerCase())) {
    return { ok: false, message: "Já existe uma conta com este e-mail ou usuário." };
  }
  if (input.password.length < 4) return { ok: false, message: "A senha precisa ter pelo menos 4 caracteres." };
  const id = uid("u_");
  const now = nowISO();
  const orgId = uid("org_");
  const evolutionInstance = `h${id.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 24)}`;
  const user = {
    id,
    organizationId: orgId,
    name: input.name.trim(),
    email,
    username,
    passwordHash: hashPw(input.password, id),
    evolutionInstance,
    role: "owner" as const,
    title: "Dona da conta",
    color: "chart-3" as const,
    status: "ativo" as const,
    workHours: "09:00–18:00",
    goal: 15_000,
    achieved: 0,
    lastSeen: now,
    createdAt: now,
    kind: "customer" as const,
    planId: "trial" as const,
    trialEndsAt: trialEndsAtFrom(new Date(now)),
    dailyProspectUsed: 0,
    dailyProspectDate: todayKey(),
    companyName: input.company.trim(),
    phone: input.phone ?? "",
  };
  provisionCustomerAccount(user);
  return { ok: true, message: "Conta criada. Trial de 2 dias, 30 prospecções por dia.", userId: id, evolutionInstance };
}

export async function syncPaidPlanFromCakto(user?: User | null) {
  if (!user?.email || !user.id) return;
  if (typeof window === "undefined") return;
  if (typeof process !== "undefined" && process.env?.VITEST) return;
  try {
    const res = await fetch(`/api/billing/status?email=${encodeURIComponent(user.email)}`);
    if (!res.ok) return;
    const data = (await res.json()) as { planId?: string };
    if (data.planId === "impulso" || data.planId === "maquina" || data.planId === "whitelabel") {
      if (user.planId !== data.planId) assignPlan(user.id, data.planId);
    }
  } catch {
    /* Cakto / servidor fora */
  }
}

export function assignPlan(userId: string, planId: SaasPlanId) {
  patchUserEverywhere(userId, (u) => {
    u.planId = planId;
    if (planId !== "trial") u.trialEndsAt = u.trialEndsAt || nowISO();
  });
  syncDevTeamForAccount(userId);
}

export function extendTrial(userId: string, days = TRIAL_DAYS) {
  grantAccessDays(userId, days);
}

/** 2 ou 7 dias a partir de agora (ou do fim atual, o que for maior). Não duplica se o patch rodar duas vezes. */
export function grantAccessDays(userId: string, days: number) {
  let end = "";
  patchUserEverywhere(userId, (u) => {
    if (u.id === "u1") return;
    u.status = "ativo";
    u.lifetimeAccess = false;
    if (!u.planId || u.planId === "trial") u.planId = "trial";
    if (!end) {
      const start = Math.max(Date.now(), u.trialEndsAt ? new Date(u.trialEndsAt).getTime() : 0);
      end = new Date(start + days * 86_400_000).toISOString();
    }
    u.trialEndsAt = end;
  });
}

export function grantLifetimeAccess(userId: string) {
  patchUserEverywhere(userId, (u) => {
    if (u.id === "u1") return;
    u.status = "ativo";
    u.lifetimeAccess = true;
  });
}

export function setDailyLeadQuota(userId: string, limit: number) {
  const n = Math.max(1, Math.min(9_999, Math.floor(limit)));
  patchUserEverywhere(userId, (u) => {
    if (u.id === "u1") return;
    u.dailyProspectLimit = n;
  });
}

export function setUserActive(userId: string, active: boolean) {
  patchUserEverywhere(userId, (u) => {
    if (u.id === "u1") return;
    u.status = active ? "ativo" : "inativo";
  });
}

export function submitWhiteLabelQuote(input: { name: string; email: string; company: string; message: string }): QuoteRequest {
  const id = uid("qt_");
  const row: QuoteRequest = {
    id,
    userId: getDB().currentUserId,
    name: input.name,
    email: input.email,
    company: input.company,
    message: input.message,
    createdAt: nowISO(),
    status: "aberta",
  };
  update((d) => {
    if (!Array.isArray(d.quoteRequests)) d.quoteRequests = [];
    d.quoteRequests.unshift(row);
  });
  return row;
}

export function formatTrialLabel(user?: User | null) {
  if (!user || isPlatformAdmin(user)) return "";
  if (user.lifetimeAccess) return "Acesso vitalício";
  if (user.planId && user.planId !== "trial") {
    const p = planOf(user);
    return p ? `Plano ${p.name}` : "Plano ativo";
  }
  const ms = trialMsLeft(user);
  if (ms <= 0) return "Trial encerrado";
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (d > 0) return `Trial · ${d}d ${pad(h)}:${pad(m)}:${pad(s)}`;
  return `Trial · ${pad(h)}:${pad(m)}:${pad(s)}`;
}
