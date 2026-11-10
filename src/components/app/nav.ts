import {
  Activity, BarChart3, Bot, BookOpen, Brain, Building2, Cable, CalendarClock, CircleDollarSign, Contact, FileText, Target,
  CreditCard, Gauge, Inbox, KeyRound, KanbanSquare, ListChecks, Lock, MessageSquareQuote, Network, Receipt,
  Radar, Repeat, Rocket, Scale, Settings2, ShieldCheck, Sparkles, Users, UsersRound, Webhook, Workflow,
  Wrench, Zap, Cpu, MessageCircle, List, Globe,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
}
export interface NavGroup {
  label: string;
  icon: LucideIcon;
  items: NavItem[];
}

export const NAV_TOP: NavItem[] = [
  { label: "Visão geral", to: "/visao-geral", icon: Gauge },
  { label: "Mission Control", to: "/comando", icon: Target },
  { label: "Operações", to: "/operacoes", icon: Rocket },
  { label: "Central RPA", to: "/rpa", icon: Workflow },
];

export const NAV_GROUPS: NavGroup[] = [
  { label: "Atendimento", icon: Inbox, items: [
    { label: "Inbox", to: "/atendimento/inbox", icon: Inbox },
    { label: "Radar", to: "/atendimento/radar", icon: Radar },
    { label: "Respostas rápidas", to: "/atendimento/respostas", icon: MessageSquareQuote },
  ] },
  { label: "CRM", icon: KanbanSquare, items: [
    { label: "Pipeline", to: "/crm/pipeline", icon: KanbanSquare },
    { label: "Contatos", to: "/crm/contatos", icon: Contact },
    { label: "Empresas", to: "/crm/empresas", icon: Building2 },
    { label: "Dossiê", to: "/crm/dossie", icon: FileText },
    { label: "Tarefas", to: "/crm/tarefas", icon: ListChecks },
  ] },
  { label: "Prospecção", icon: Zap, items: [
    { label: "Caçar Leads", to: "/prospeccao/buscar", icon: Radar },
    { label: "Listas", to: "/prospeccao/listas", icon: List },
    { label: "Campanhas", to: "/prospeccao/campanhas", icon: Zap },
    { label: "Cadências", to: "/prospeccao/cadencias", icon: Repeat },
    { label: "Orçamentos", to: "/prospeccao/orcamentos", icon: Receipt },
  ] },
  { label: "IA", icon: Sparkles, items: [
    { label: "Helena", to: "/ia/helena", icon: Sparkles },
    { label: "Agenda", to: "/ia/agenda", icon: CalendarClock },
    { label: "Times", to: "/ia/times", icon: Network },
    { label: "Prévia de sites", to: "/ia/previews", icon: Globe },
    { label: "Agentes", to: "/ia/agentes", icon: Bot },
    { label: "Conhecimento", to: "/ia/conhecimento", icon: BookOpen },
    { label: "Memória", to: "/ia/memoria", icon: Brain },
    { label: "Skills", to: "/ia/skills", icon: Wrench },
    { label: "Execuções", to: "/ia/execucoes", icon: Activity },
    { label: "Custos", to: "/ia/custos", icon: CircleDollarSign },
  ] },
];

export const NAV_MIDDLE: NavItem[] = [{ label: "Automações", to: "/automacoes", icon: Workflow }];

export const NAV_GROUPS_2: NavGroup[] = [
  { label: "Integrações", icon: Cable, items: [
    { label: "WhatsApp", to: "/integracoes/whatsapp", icon: MessageCircle },
    { label: "Saúde", to: "/integracoes/saude", icon: Activity },
    { label: "Webhooks", to: "/integracoes/webhooks", icon: Webhook },
    { label: "API", to: "/integracoes/api", icon: KeyRound },
    { label: "Provedores", to: "/integracoes/provedores", icon: Cpu },
  ] },
];

export const NAV_BOTTOM: NavItem[] = [
  { label: "Analytics", to: "/analytics", icon: BarChart3 },
  { label: "Equipe", to: "/equipe", icon: UsersRound },
];

export const NAV_SETTINGS: NavGroup = {
  label: "Configurações", icon: Settings2, items: [
    { label: "Organização", to: "/configuracoes/organizacao", icon: Building2 },
    { label: "Usuários", to: "/configuracoes/usuarios", icon: Users },
    { label: "Planos", to: "/planos", icon: CreditCard },
    { label: "Permissões", to: "/configuracoes/permissoes", icon: ShieldCheck },
    { label: "Segurança", to: "/configuracoes/seguranca", icon: Lock },
    { label: "LGPD", to: "/configuracoes/lgpd", icon: Scale },
    { label: "Billing", to: "/configuracoes/billing", icon: CreditCard },
    { label: "Consumo", to: "/configuracoes/consumo", icon: Gauge },
  ],
};

export function settingsNavFor(isAdmin: boolean): NavGroup {
  return {
    ...NAV_SETTINGS,
    items: NAV_SETTINGS.items.filter((i) => isAdmin || i.to !== "/configuracoes/usuarios"),
  };
}

export function navGroupsFor(isAdmin: boolean, _allowDev = isAdmin): NavGroup[] {
  return NAV_GROUPS.map((g) => {
    if (g.label !== "IA") return g;
    // Prévia de sites = só admin da plataforma (revisão + aprovação antes do envio).
    return { ...g, items: isAdmin ? g.items : g.items.filter((i) => i.to !== "/ia/previews") };
  });
}

export function integrationNavFor(isAdmin: boolean): NavGroup[] {
  return NAV_GROUPS_2.map((g) => ({
    ...g,
    items: isAdmin ? g.items : g.items.filter((i) => i.to === "/integracoes/whatsapp" || i.to === "/integracoes/saude"),
  }));
}

export function allNavFor(isAdmin: boolean, _allowDev = isAdmin): NavItem[] {
  return ALL_NAV.filter((n) => {
    if (!isAdmin && n.to === "/configuracoes/usuarios") return false;
    if (!isAdmin && n.to === "/ia/previews") return false;
    if (!isAdmin && (n.to === "/integracoes/webhooks" || n.to === "/integracoes/api" || n.to === "/integracoes/provedores")) return false;
    return true;
  });
}

export const ALL_NAV: NavItem[] = [
  ...NAV_TOP,
  ...NAV_GROUPS.flatMap((g) => g.items.map((i) => ({ ...i, label: `${g.label} · ${i.label}` }))),
  ...NAV_MIDDLE,
  ...NAV_GROUPS_2.flatMap((g) => g.items.map((i) => ({ ...i, label: `${g.label} · ${i.label}` }))),
  ...NAV_BOTTOM,
  ...NAV_SETTINGS.items.map((i) => ({ ...i, label: `Configurações · ${i.label}` })),
];
