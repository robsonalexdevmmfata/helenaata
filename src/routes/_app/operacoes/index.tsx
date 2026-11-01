import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronRight, Pause, Play, Rocket, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, PageHeader, ProgressBar, StatCard, Status } from "@/components/app/kit";
import { useDB } from "@/lib/store";
import { userAction } from "@/lib/helena/engine";
import { openHelena } from "@/lib/helena/orchestrator";
import { brl, timeAgo } from "@/lib/format";
import { pageHead } from "@/lib/head";
import { toast } from "sonner";
import type { OperationStatus } from "@/lib/types";

export const Route = createFileRoute("/_app/operacoes/")({
  head: () => pageHead("Operações", "Operações comerciais executadas pela Helena e pelos agentes de IA."),
  component: OperationsPage,
});

const FILTERS: { value: "all" | OperationStatus; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "running", label: "Em execução" },
  { value: "awaiting_approval", label: "Aguardando" },
  { value: "paused", label: "Pausadas" },
  { value: "completed", label: "Concluídas" },
  { value: "failed", label: "Com erro" },
];

function OperationsPage() {
  const db = useDB();
  const [filter, setFilter] = useState<"all" | OperationStatus>("all");
  const ops = db.operations.filter((o) => filter === "all" || o.status === filter);
  const count = (s: OperationStatus) => db.operations.filter((o) => o.status === s).length;

  const toggle = (id: string, running: boolean) => {
    const r = userAction(running ? "operations.pause" : "operations.resume", { operationId: id });
    r.ok ? toast.success(r.message) : toast.error(`Falhou: ${r.message}`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operação"
        title="Operações"
        description="Cada missão que a Helena coordena vira uma operação: agentes, contatos, etapas e resultados em tempo real."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => {
                const r = userAction("rpa.run_shift", { nicho: "barbearia", cidade: "São Paulo", maxLeads: 3, site: false, checkout: false });
                r.ok ? toast.success(r.message) : toast.error(r.message);
              }}
            >
              <Rocket className="size-4" /> Rodar expediente RPA
            </Button>
            <Button onClick={() => openHelena("Helena, precisamos faturar R$ 15.000 esta semana.")} className="gap-2">
              <Sparkles className="size-4" /> Nova operação com a Helena
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Em execução" value={count("running")} tone="info" icon={<Rocket />} />
        <StatCard label="Aguardando aprovação" value={db.approvals.filter((a) => a.status === "pendente").length} tone="helena" icon={<Sparkles />} />
        <StatCard label="Reuniões geradas" value={db.operations.reduce((s, o) => s + o.metrics.meetings, 0)} tone="success" icon={<Play />} />
        <StatCard label="Custo de IA" value={brl(db.operations.reduce((s, o) => s + o.cost, 0), 2)} icon={<Pause />} />
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
        <TabsList className="flex-wrap">
          {FILTERS.map((f) => (
            <TabsTrigger key={f.value} value={f.value}>{f.label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {ops.length === 0 ? (
        <EmptyState icon={<Rocket />} title="Nenhuma operação neste filtro" description="Peça à Helena para iniciar uma prospecção ou meta de faturamento." />
      ) : (
        <div className="space-y-3">
          {ops.map((op) => {
            const progress = op.total ? Math.round((op.processed / op.total) * 100) : 0;
            const agents = db.agents.filter((a) => op.agentIds.includes(a.id)).map((a) => a.name);
            return (
              <div key={op.id} className="rounded-xl border bg-card p-4 transition-colors hover:border-foreground/20">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{op.code}</span>
                      <Status value={op.status} />
                    </div>
                    <Link to="/operacoes/$id" params={{ id: op.id }} className="block font-medium hover:underline">
                      {op.title}
                    </Link>
                    <p className="text-sm text-muted-foreground">{op.objective}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {(op.status === "running" || op.status === "paused") && (
                      <Button size="sm" variant="outline" onClick={() => toggle(op.id, op.status === "running")}>
                        {op.status === "running" ? <><Pause /> Pausar</> : <><Play /> Retomar</>}
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" asChild>
                      <Link to="/operacoes/$id" params={{ id: op.id }}>Detalhes <ChevronRight /></Link>
                    </Button>
                  </div>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto]">
                  <div>
                    <ProgressBar value={progress} tone={op.status === "completed" ? "success" : op.status === "failed" ? "warning" : "helena"} />
                    <div className="mt-1.5 flex justify-between font-mono text-[11px] text-muted-foreground">
                      <span>{op.processed} / {op.total} contatos</span>
                      <span>{progress}%</span>
                    </div>
                  </div>
                  <div className="flex gap-4 text-xs">
                    {[["Responderam", op.metrics.responded], ["Interessados", op.metrics.interested], ["Reuniões", op.metrics.meetings]].map(([l, v]) => (
                      <div key={l as string}>
                        <div className="font-mono text-sm font-medium">{v}</div>
                        <div className="text-muted-foreground">{l}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap justify-between gap-2 border-t pt-3 text-[11px] text-muted-foreground">
                  <span>Agentes: {agents.join(", ") || "—"}</span>
                  <span>Solicitada por {op.requestedBy} · {timeAgo(op.createdAt)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
