import type { QuoteRequest, SaasPlanId, User } from "@/lib/types";
import { getDB, nowISO, uid, update } from "@/lib/store";

export const TRIAL_DAYS = 2;
export const TRIAL_DAILY_PROSPECTS = 30;
export const CAKTO_NOTE = "Pix e cartão na Cakto. Impulso já inclui 2 dias de freemium; depois a assinatura entra sozinha.";

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
    dailyProspects: 30,
    quote: false,
    checkoutUrl: CAKTO_CHECKOUT.impulso,
    features: [
      "Trial de 2 dias incluso no cadastro",
      "30 abordagens de prospecção por dia",
      "Helena + Time Comercial no WhatsApp",
      "Prévia de site e cardápio pelo Time Dev IA",
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
      "150 abordagens de prospecção por dia",
      "Time Dev IA + Comercial + Closer",
      "Prévia com link para o dono no WhatsApp",
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

export function planOf(user?: User | null): SaasPlan | undefined {
  if (!user?.planId || user.planId === "trial") return undefined;
  return SAAS_PLANS.find((p) => p.id === user.planId);
}

export function dailyLimitFor(user?: User | null) {
  if (!user || isPlatformAdmin(user)) return 10_000;
  if (user.planId === "maquina") return 150;
  if (user.planId === "whitelabel") return 9999;
  return TRIAL_DAILY_PROSPECTS;
}

export function trialMsLeft(user?: User | null) {
  if (!user?.trialEndsAt) return 0;
  return new Date(user.trialEndsAt).getTime() - Date.now();
}

export function isTrialActive(user?: User | null) {
  if (!user || isPlatformAdmin(user)) return false;
  if (user.planId && user.planId !== "trial") return false;
  return trialMsLeft(user) > 0;
}

export function mustSubscribe(user?: User | null) {
  if (!user || isPlatformAdmin(user)) return false;
  if (user.status !== "ativo") return true;
  if (user.planId === "impulso" || user.planId === "maquina" || user.planId === "whitelabel") return false;
  return trialMsLeft(user) <= 0;
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
}): { ok: boolean; message: string; userId?: string } {
  const email = input.email.trim().toLowerCase();
  const username = email.split("@")[0] || "user";
  const db = getDB();
  if (db.users.some((u) => u.email.toLowerCase() === email || u.username.toLowerCase() === username.toLowerCase())) {
    return { ok: false, message: "Já existe uma conta com este e-mail ou usuário." };
  }
  if (input.password.length < 4) return { ok: false, message: "A senha precisa ter pelo menos 4 caracteres." };
  const id = uid("u_");
  const now = nowISO();
  update((d) => {
    d.users.push({
      id,
      organizationId: d.organization.id,
      name: input.name.trim(),
      email,
      username,
      password: input.password,
      role: "manager",
      title: "Dona da conta",
      color: "chart-3",
      status: "ativo",
      workHours: "09:00–18:00",
      goal: 15_000,
      achieved: 0,
      lastSeen: now,
      kind: "customer",
      planId: "trial",
      trialEndsAt: trialEndsAtFrom(),
      dailyProspectUsed: 0,
      dailyProspectDate: todayKey(),
      companyName: input.company.trim(),
      phone: input.phone ?? "",
    });
  });
  return { ok: true, message: "Conta criada. Trial de 2 dias, 30 prospecções por dia.", userId: id };
}

export function assignPlan(userId: string, planId: SaasPlanId) {
  update((d) => {
    const u = d.users.find((x) => x.id === userId);
    if (!u) return;
    u.planId = planId;
    if (planId !== "trial") u.trialEndsAt = u.trialEndsAt || nowISO();
  });
}

export function extendTrial(userId: string, days = TRIAL_DAYS) {
  update((d) => {
    const u = d.users.find((x) => x.id === userId);
    if (!u) return;
    u.planId = "trial";
    u.trialEndsAt = trialEndsAtFrom();
    u.status = "ativo";
  });
}

export function setUserActive(userId: string, active: boolean) {
  update((d) => {
    const u = d.users.find((x) => x.id === userId);
    if (!u || u.id === "u1") return;
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
  if (user.planId && user.planId !== "trial") {
    const p = planOf(user);
    return p ? `Plano ${p.name}` : "Plano ativo";
  }
  const ms = trialMsLeft(user);
  if (ms <= 0) return "Trial encerrado";
  const h = Math.ceil(ms / 3_600_000);
  if (h >= 24) return `Trial · ${Math.ceil(h / 24)} dia(s)`;
  return `Trial · ${h}h restantes`;
}
