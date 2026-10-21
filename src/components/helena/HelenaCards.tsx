import { useRouter } from "@tanstack/react-router";
import { Check, CheckCircle2, ChevronRight, Circle, Loader2, Pause, Play, ShieldAlert, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProgressBar, Status, StatusBadge } from "@/components/app/kit";
import { useDB, ownerName } from "@/lib/store";
import { decideApproval, userAction } from "@/lib/helena/engine";
import { createAgentFromProposal, helenaUi } from "@/lib/helena/orchestrator";
import { getToolDef } from "@/lib/helena/registry";
import type { HelenaCard } from "@/lib/types";
import { brl } from "@/lib/format";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function CardShell({ label, children, tone = "default" }: { label: string; children: React.ReactNode; tone?: "default" | "helena" | "danger" | "success" }) {
  return (
    <div className={cn(
      "mt-2 overflow-hidden rounded-lg border bg-card",
      tone === "helena" && "border-helena/30",
      tone === "danger" && "border-destructive/30",
      tone === "success" && "border-success/30",
    )}>
      <div className={cn(
        "border-b px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground",
        tone === "helena" && "bg-helena/8 text-helena",
      )}>
        {label}
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

export function ApprovalBlock({ approvalId, compact }: { approvalId: string; compact?: boolean }) {
  const db = useDB();
  const ap = db.approvals.find((a) => a.id === approvalId);
  if (!ap) return null;
  const decide = (approve: boolean) => {
    const r = decideApproval(ap.id, approve);
    if (!approve) toast("Ação negada. Nada foi executado.");
    else if (r.ok) toast.success(r.message);
    else toast.error(`Falhou: ${r.message}`);
  };
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[11px] text-muted-foreground">{ap.requestedBy} deseja executar:</div>
          <div className="text-sm font-medium">{ap.title}</div>
        </div>
        <Status value={ap.risk} />
      </div>
      {!compact && ap.details.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
          {ap.details.map((d) => (
            <div key={d.label} className="contents">
              <dt className="text-muted-foreground">{d.label}</dt>
              <dd className="truncate font-medium">{d.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="text-[11px] text-muted-foreground">Ferramenta: <span className="font-mono">{ap.tool}</span> · {getToolDef(ap.tool)?.label}</div>
      {ap.status === "pendente" ? (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => decide(true)}><Check /> Aprovar</Button>
          <Button size="sm" variant="outline" onClick={() => decide(false)}>Negar</Button>
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">
          <Status value={ap.status} /> <span className="ml-1">por {ap.decidedBy}</span>
        </div>
      )}
    </div>
  );
}

export function OperationBlock({ operationId }: { operationId: string }) {
  const db = useDB();
  const router = useRouter();
  const op = db.operations.find((o) => o.id === operationId);
  if (!op) return null;
  const pctv = Math.round((op.processed / op.total) * 100);
  const toggle = () => {
    const r = userAction(op.status === "running" ? "operations.pause" : "operations.resume", { operationId: op.id });
    r.ok ? toast.success(r.message) : toast.error(`Falhou: ${r.message}`);
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium">{op.title}</div>
        <Status value={op.status} />
      </div>
      <div>
        <ProgressBar value={pctv} tone={op.status === "completed" ? "success" : "helena"} />
        <div className="mt-1.5 flex justify-between font-mono text-[11px] text-muted-foreground">
          <span>{op.processed} / {op.total} contatos</span>
          <span>{pctv}%</span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[["Interessados", op.metrics.interested], ["Qualificados", op.metrics.qualified], ["Reuniões", op.metrics.meetings]].map(([l, v]) => (
          <div key={l as string} className="rounded-md bg-muted/60 py-1.5">
            <div className="font-mono text-sm font-medium">{v}</div>
            <div className="text-[10px] text-muted-foreground">{l}</div>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => { helenaUi.set({ open: false }); router.history.push(`/operacoes/${op.id}`); }}>
          Ver operação <ChevronRight />
        </Button>
        {(op.status === "running" || op.status === "paused") && (
          <Button size="sm" variant="ghost" onClick={toggle}>
            {op.status === "running" ? <><Pause /> Pausar</> : <><Play /> Retomar</>}
          </Button>
        )}
      </div>
    </div>
  );
}

export function HelenaCardView({ card, messageId }: { card: HelenaCard; messageId: string }) {
  const db = useDB();
  const router = useRouter();

  switch (card.type) {
    case "plan": {
      const ap = db.approvals.find((a) => a.id === card.approvalId);
      const decided = ap && ap.status !== "pendente";
      return (
        <CardShell label="Plano de execução" tone="helena">
          <ul className="space-y-1.5 text-sm">
            {card.steps.map((s) => {
              const done = s.done || ap?.status === "aprovada";
              return (
                <li key={s.label} className="flex items-center gap-2">
                  {done ? <CheckCircle2 className="size-4 text-success" /> : <Circle className="size-4 text-muted-foreground/50" />}
                  <span className={cn(!done && "text-muted-foreground")}>{s.label}</span>
                </li>
              );
            })}
          </ul>
          {ap && (
            <div className="mt-3 border-t pt-3">
              {!decided ? (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => decideApproval(ap.id, true)}><ShieldAlert /> Autorizar execução</Button>
                  <Button size="sm" variant="outline" onClick={() => helenaUi.set({ draft: "Altere o plano: " })}>Alterar plano</Button>
                  <Button size="sm" variant="ghost" onClick={() => decideApproval(ap.id, false)}>Cancelar</Button>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground"><Status value={ap.status} /> <span className="ml-1">por {ap.decidedBy}</span></div>
              )}
            </div>
          )}
        </CardShell>
      );
    }
    case "approval":
      return <CardShell label="Aprovação necessária" tone="helena"><ApprovalBlock approvalId={card.approvalId} /></CardShell>;
    case "operation": {
      const op = db.operations.find((o) => o.id === card.operationId);
      return <CardShell label={op?.status === "completed" ? "Operação concluída" : "Operação em andamento"} tone={op?.status === "completed" ? "success" : "default"}><OperationBlock operationId={card.operationId} /></CardShell>;
    }
    case "agent_proposal": {
      const p = card.proposal;
      return (
        <CardShell label="Novo agente" tone="helena">
          <dl className="space-y-2 text-sm">
            <div><dt className="text-[11px] text-muted-foreground">Nome</dt><dd className="font-medium">{p.name}</dd></div>
            <div><dt className="text-[11px] text-muted-foreground">Objetivo</dt><dd>{p.objective}</dd></div>
            <div>
              <dt className="text-[11px] text-muted-foreground">Ferramentas</dt>
              <dd className="mt-1 flex flex-wrap gap-1">
                {p.tools.map((t) => <StatusBadge key={t} tone="neutral" dot={false}><Check className="size-3" />{getToolDef(t)?.label ?? t}</StatusBadge>)}
              </dd>
            </div>
            <div className="flex gap-6">
              <div><dt className="text-[11px] text-muted-foreground">Supervisor</dt><dd>{ownerName(db, p.supervisorId)}</dd></div>
              <div><dt className="text-[11px] text-muted-foreground">Modelo</dt><dd className="font-mono text-xs">{p.model}</dd></div>
            </div>
          </dl>
          <div className="mt-3 border-t pt-3">
            {card.createdAgentId ? (
              <Button size="sm" variant="outline" onClick={() => { helenaUi.set({ open: false }); router.history.push(`/ia/agentes/${card.createdAgentId}`); }}>
                <CheckCircle2 className="text-success" /> Agente criado · abrir
              </Button>
            ) : (
              <Button size="sm" onClick={() => createAgentFromProposal(messageId, card)}>Criar agente</Button>
            )}
          </div>
        </CardShell>
      );
    }
    case "list":
      return (
        <CardShell label={card.title}>
          {card.items.length === 0 ? (
            <div className="text-xs text-muted-foreground">Nenhum item encontrado.</div>
          ) : (
            <ul className="-mx-1 space-y-0.5">
              {card.items.map((it, i) => (
                <li key={i}>
                  <button
                    type="button"
                    disabled={!it.href && card.title !== "Exemplos"}
                    onClick={() => {
                      if (it.href) { helenaUi.set({ open: false }); router.history.push(it.href); }
                      else helenaUi.set({ draft: it.label });
                    }}
                    className="flex w-full items-center justify-between gap-2 rounded-md px-1 py-1.5 text-left text-sm hover:bg-muted disabled:hover:bg-transparent"
                  >
                    <span className="min-w-0">
                      <span className="block truncate">{it.label}</span>
                      {it.sub && <span className="block truncate text-[11px] text-muted-foreground">{it.sub}</span>}
                    </span>
                    {(it.href || card.title === "Exemplos") && <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardShell>
      );
    case "stats":
      return (
        <CardShell label={card.title}>
          <div className="grid grid-cols-2 gap-2">
            {card.items.map((it) => (
              <div key={it.label} className="rounded-md bg-muted/60 px-2.5 py-2">
                <div className="text-[10px] text-muted-foreground">{it.label}</div>
                <div className="font-mono text-sm font-medium">{it.value}</div>
              </div>
            ))}
          </div>
        </CardShell>
      );
    case "result":
      return (
        <CardShell label={card.ok ? "Executado" : "Não executado"} tone={card.ok ? "success" : "danger"}>
          <div className="flex items-start gap-2 text-sm">
            {card.ok ? <CheckCircle2 className="mt-0.5 size-4 text-success" /> : <XCircle className="mt-0.5 size-4 text-destructive" />}
            <div>
              <div className="font-medium">{card.title}</div>
              <div className="text-xs text-muted-foreground">{card.detail}</div>
            </div>
          </div>
        </CardShell>
      );
    default:
      return null;
  }
}

export function ThinkingIndicator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Loader2 className="size-3.5 animate-spin text-helena" /> {label}…
    </div>
  );
}

export { brl };
