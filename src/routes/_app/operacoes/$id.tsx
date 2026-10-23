import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, Circle, Loader2, Pause, Play, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, EntityAvatar, Panel, ProgressBar, StatCard, Status } from "@/components/app/kit";
import { useDB } from "@/lib/store";
import { userAction } from "@/lib/helena/engine";
import { brl, fmtDateTime, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/operacoes/$id")({
  head: () => ({
    meta: [
      { title: "Detalhe da operação · HELENA AI" },
      { name: "description", content: "Etapas, agentes, eventos e resultados de uma operação da Helena." },
      { property: "og:title", content: "Detalhe da operação · HELENA AI" },
      { property: "og:description", content: "Etapas, agentes, eventos e resultados de uma operação da Helena." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OperationDetail,
});

const stepIcon = {
  done: <CheckCircle2 className="size-4 text-success" />,
  running: <Loader2 className="size-4 animate-spin text-info" />,
  pending: <Circle className="size-4 text-muted-foreground/50" />,
  failed: <XCircle className="size-4 text-destructive" />,
};
const eventDot = { info: "bg-info", success: "bg-success", warning: "bg-warning", error: "bg-destructive" };

function OperationDetail() {
  const { id } = Route.useParams();
  const db = useDB();
  const op = db.operations.find((o) => o.id === id);

  if (!op) {
    return (
      <EmptyState
        title="Operação não encontrada"
        description="Ela pode ter sido removida ou o link está incorreto."
        action={<Button asChild variant="outline"><Link to="/operacoes"><ArrowLeft /> Voltar para operações</Link></Button>}
      />
    );
  }

  const progress = op.total ? Math.round((op.processed / op.total) * 100) : 0;
  const agents = db.agents.filter((a) => op.agentIds.includes(a.id));
  const conn = db.connections.find((c) => c.id === op.connectionId);
  const toggle = () => {
    const r = userAction(op.status === "running" ? "operations.pause" : "operations.resume", { operationId: op.id });
    r.ok ? toast.success(r.message) : toast.error(`Falhou: ${r.message}`);
  };

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/operacoes"><ArrowLeft /> Operações</Link>
      </Button>

      <div className="flex flex-col gap-4 rounded-xl border bg-card p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">{op.code}</span>
            <Status value={op.status} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{op.title}</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">{op.objective}</p>
          <p className="text-xs text-muted-foreground">
            Solicitada por {op.requestedBy} · {fmtDateTime(op.createdAt)} {conn && `· ${conn.name}`}
          </p>
        </div>
        {(op.status === "running" || op.status === "paused") && (
          <Button variant="outline" onClick={toggle}>
            {op.status === "running" ? <><Pause /> Pausar operação</> : <><Play /> Retomar operação</>}
          </Button>
        )}
      </div>

      <Panel title="Progresso">
        <ProgressBar value={progress} tone={op.status === "completed" ? "success" : "helena"} />
        <div className="mt-2 flex justify-between font-mono text-xs text-muted-foreground">
          <span>{op.processed} de {op.total} contatos processados</span>
          <span>{progress}%</span>
        </div>
        {op.result && <p className="mt-4 rounded-lg bg-muted/60 px-3 py-2 text-sm">{op.result}</p>}
      </Panel>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Responderam" value={op.metrics.responded} />
        <StatCard label="Interessados" value={op.metrics.interested} tone="info" />
        <StatCard label="Qualificados" value={op.metrics.qualified} tone="helena" />
        <StatCard label="Reuniões" value={op.metrics.meetings} tone="success" />
        <StatCard label="Handoffs" value={op.metrics.handoffs} />
        <StatCard label="Custo IA" value={brl(op.cost, 2)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-6">
          <Panel title="Etapas">
            <ol className="space-y-3">
              {op.steps.map((s) => (
                <li key={s.id} className="flex items-start gap-3">
                  <span className="mt-0.5">{stepIcon[s.status]}</span>
                  <div>
                    <div className={cn("text-sm", s.status === "pending" && "text-muted-foreground")}>{s.label}</div>
                    {s.detail && <div className="text-xs text-destructive">{s.detail}</div>}
                  </div>
                </li>
              ))}
            </ol>
          </Panel>
          <Panel title="Agentes envolvidos">
            <div className="space-y-3">
              {agents.map((a) => (
                <div key={a.id} className="flex items-center gap-3">
                  <EntityAvatar name={a.name} color={a.color} agent />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{a.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{a.currentTask || a.objective}</div>
                  </div>
                  <Status value={a.status} />
                </div>
              ))}
              {agents.length === 0 && <p className="text-sm text-muted-foreground">Nenhum agente vinculado.</p>}
            </div>
          </Panel>
        </div>
        <Panel title="Linha do tempo" description="Eventos registrados pela Helena e pelos agentes.">
          <ol className="space-y-4">
            {op.events.map((e, i) => (
              <li key={i} className="flex gap-3">
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", eventDot[e.kind])} />
                <div>
                  <div className="text-sm">{e.text}</div>
                  <div className="text-xs text-muted-foreground">{timeAgo(e.at)}</div>
                </div>
              </li>
            ))}
          </ol>
        </Panel>
      </div>
    </div>
  );
}
