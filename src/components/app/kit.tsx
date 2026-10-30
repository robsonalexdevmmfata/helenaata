import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";
import type { ColorToken } from "@/lib/types";

export type Tone = "success" | "warning" | "danger" | "info" | "neutral" | "helena";

const toneClass: Record<Tone, string> = {
  success: "bg-success/12 text-success border-success/25",
  warning: "bg-warning/15 text-warning border-warning/30",
  danger: "bg-destructive/10 text-destructive border-destructive/25",
  info: "bg-info/10 text-info border-info/25",
  neutral: "bg-muted text-muted-foreground border-border",
  helena: "bg-helena/12 text-helena border-helena/25",
};
const dotClass: Record<Tone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
  info: "bg-info",
  neutral: "bg-muted-foreground/60",
  helena: "bg-helena",
};

export function StatusBadge({ tone, children, dot = true, className }: { tone: Tone; children: ReactNode; dot?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium", toneClass[tone], className)}>
      {dot && <span className={cn("size-1.5 rounded-full", dotClass[tone])} />}
      {children}
    </span>
  );
}

export function Dot({ tone, pulse }: { tone: Tone; pulse?: boolean }) {
  return (
    <span className="relative inline-flex size-2">
      {pulse && <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-60", dotClass[tone])} />}
      <span className={cn("relative inline-flex size-2 rounded-full", dotClass[tone])} />
    </span>
  );
}

export const STATUS_TONE: Record<string, Tone> = {
  trabalhando: "success", aguardando: "neutral", pausado: "warning", erro: "danger",
  ativo: "success", requer_aprovacao: "helena",
  running: "info", awaiting_approval: "helena", completed: "success", failed: "danger", paused: "warning",
  ativa: "success", pausada: "warning", concluida: "neutral", rascunho: "neutral", aguardando_aprovacao: "helena",
  online: "success", offline: "danger", conectando: "warning",
  aprovado: "success", pendente: "warning", rejeitado: "danger",
  aberta: "info", resolvida: "neutral",
  aprovada: "success", negada: "danger",
  sucesso: "success", falha: "danger",
  indexado: "success", indexando: "warning",
  baixo: "success", medio: "warning", alto: "danger",
  lead: "info", cliente: "success", inativo: "neutral", convidado: "warning",
  aberto: "info", ganho: "success", perdido: "danger",
  paga: "success",
  agendada: "info", confirmada: "helena", realizada: "success", cancelada: "danger", no_show: "warning",
};

export const STATUS_LABEL: Record<string, string> = {
  trabalhando: "Trabalhando", aguardando: "Aguardando", pausado: "Pausado", erro: "Erro",
  ativo: "Ativo", requer_aprovacao: "Requer aprovação",
  running: "Em execução", awaiting_approval: "Aguardando aprovação", completed: "Concluída", failed: "Com erro", paused: "Pausada",
  ativa: "Ativa", pausada: "Pausada", concluida: "Concluída", rascunho: "Rascunho", aguardando_aprovacao: "Aguardando aprovação",
  online: "Online", offline: "Offline", conectando: "Conectando",
  aprovado: "Aprovado", pendente: "Pendente", rejeitado: "Rejeitado",
  aberta: "Aberta", resolvida: "Resolvida", aprovada: "Aprovada", negada: "Negada",
  sucesso: "Sucesso", falha: "Falha", indexado: "Indexado", indexando: "Indexando",
  baixo: "Risco baixo", medio: "Risco médio", alto: "Risco alto",
  lead: "Lead", cliente: "Cliente", inativo: "Inativo", convidado: "Convidado",
  aberto: "Aberto", ganho: "Ganho", perdido: "Perdido", paga: "Paga",
  agendada: "Agendada", confirmada: "Confirmada", realizada: "Realizada", cancelada: "Cancelada", no_show: "No-show",
};

export function Status({ value, className }: { value: string; className?: string }) {
  return (
    <StatusBadge tone={STATUS_TONE[value] ?? "neutral"} className={className}>
      {STATUS_LABEL[value] ?? value}
    </StatusBadge>
  );
}

export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: string; actions?: ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-1">
        {eyebrow && <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, description, actions, children, className, bodyClassName }: { title?: ReactNode; description?: string; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={cn("rounded-xl border bg-card text-card-foreground", className)}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-4 border-b px-5 py-3.5">
          <div>
            {title && <h2 className="text-sm font-semibold">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

export function StatCard({ label, value, hint, icon, tone = "neutral", onClick }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: Tone; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={cn("rounded-xl border bg-card p-4 transition-colors", onClick && "cursor-pointer hover:border-foreground/20")}
    >
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        {icon && <span className={cn("rounded-md border p-1 [&_svg]:size-3.5", toneClass[tone])}>{icon}</span>}
      </div>
      <div className="mt-2 font-mono text-2xl font-medium tracking-tight tabular">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-12 text-center">
      {icon && <div className="mb-3 rounded-full bg-muted p-3 text-muted-foreground [&_svg]:size-5">{icon}</div>}
      <div className="text-sm font-medium">{title}</div>
      {description && <p className="mt-1 max-w-sm text-xs text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

const avatarTone: Record<ColorToken, string> = {
  "chart-1": "bg-chart-1/15 text-chart-1",
  "chart-2": "bg-chart-2/15 text-chart-2",
  "chart-3": "bg-chart-3/15 text-chart-3",
  "chart-4": "bg-chart-4/20 text-chart-4",
  "chart-5": "bg-chart-5/15 text-chart-5",
};

export function EntityAvatar({ name, color = "chart-3", size = "md", agent, className }: { name: string; color?: ColorToken; size?: "sm" | "md" | "lg"; agent?: boolean; className?: string }) {
  const s = size === "sm" ? "size-6 text-[10px]" : size === "lg" ? "size-11 text-sm" : "size-8 text-xs";
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center font-semibold", agent ? "rounded-lg" : "rounded-full", s, avatarTone[color], className)}>
      {initials(name)}
    </span>
  );
}

export function colorFor(id: string): ColorToken {
  const sum = [...id].reduce((s, c) => s + c.charCodeAt(0), 0);
  return (["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"] as const)[sum % 5];
}

export function ProgressBar({ value, tone = "helena", className }: { value: number; tone?: "helena" | "success" | "info" | "warning"; className?: string }) {
  const bar = { helena: "bg-helena", success: "bg-success", info: "bg-info", warning: "bg-warning" }[tone];
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div className={cn("h-full rounded-full transition-all duration-700", bar)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}
