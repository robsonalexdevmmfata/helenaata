import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Activity, Bot, CheckCircle2, Clock, Pause, Play, Plus, RefreshCw, Rocket, ShieldAlert, Sparkles, TrendingUp } from "lucide-react";
import { Dot, EntityAvatar, PageHeader, Panel, ProgressBar, StatCard, Status } from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDB } from "@/lib/store";
import { runTool } from "@/lib/helena/engine";
import { brl } from "@/lib/format";
import { pageHead } from "@/lib/head";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/operacoes")({
  head: () => pageHead("Operações", "Painel de operações ativas, cadência de disparos e execução em tempo real."),
  component: OperacoesPage,
});

function OperacoesPage() {
  const db = useDB();
  const [selectedOpId, setSelectedOpId] = useState<string | null>(db.operations[0]?.id ?? null);
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [objective, setObjective] = useState("");
  const [total, setTotal] = useState(50);
  const [selectedListId, setSelectedListId] = useState(db.lists[0]?.id ?? "");

  const selectedOp = db.operations.find((o) => o.id === selectedOpId) || db.operations[0];
  const runningCount = db.operations.filter((o) => o.status === "running").length;
  const completedCount = db.operations.filter((o) => o.status === "completed").length;
  const totalProcessed = db.operations.reduce((s, o) => s + o.processed, 0);
  const totalMeetings = db.operations.reduce((s, o) => s + o.metrics.meetings, 0);

  const handleTogglePause = (op: typeof selectedOp) => {
    if (!op) return;
    const action = op.status === "running" ? "operations.pause" : "operations.resume";
    const res = runTool(action, { operationId: op.id }, { actor: "Gestor", actorType: "user" });
    if (res.ok) {
      toast.success(res.message);
    } else {
      toast.error(res.message);
    }
  };

  const handleCreateOperation = () => {
    if (!title.trim()) {
      toast.error("Informe um título para a operação");
      return;
    }
    const sdrs = db.agents.filter((a) => a.role === "SDR").map((a) => a.id);
    const res = runTool(
      "operations.start",
      {
        title,
        objective: objective || `Prospecção ativa para ${title}`,
        total: Number(total) || 50,
        listId: selectedListId,
        agentIds: sdrs.length ? sdrs : [db.agents[0].id],
        connectionId: "wa1",
      },
      { actor: "Gestor", actorType: "user" }
    );

    if (res.ok) {
      toast.success(res.message);
      setIsNewOpen(false);
      setTitle("");
      setObjective("");
    } else {
      toast.error(res.message);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Orquestração Operacional"
        title="Operações em Tempo Real"
        description="Acompanhe a cadência de disparos autônomos, resposta de leads e conversão de reuniões."
        actions={
          <Dialog open={isNewOpen} onOpenChange={setIsNewOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="size-4" /> Nova Operação
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar Nova Operação de Prospecção</DialogTitle>
                <DialogDescription>A Helena dividirá os contatos entre os SDRs com cadência anti-ban e deduplicação.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Título da Operação</label>
                  <Input placeholder="Ex: Varredura Clínicas Campinas" value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Objetivo Comercial</label>
                  <Input placeholder="Ex: Gerar 10 reuniões para criação de site" value={objective} onChange={(e) => setObjective(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Volume de Contatos</label>
                    <Input type="number" min={10} max={500} value={total} onChange={(e) => setTotal(Number(e.target.value))} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Lista Base</label>
                    <Select value={selectedListId} onValueChange={setSelectedListId}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {db.lists.map((l) => (
                          <SelectItem key={l.id} value={l.id}>
                            {l.name} ({l.count} leads)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsNewOpen(false)}>Cancelar</Button>
                <Button onClick={handleCreateOperation}>Iniciar Operação</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Operações em Execução" value={runningCount} hint="Disparos adaptativos" icon={<Rocket />} tone="info" />
        <StatCard label="Contatos Processados" value={totalProcessed} hint="Deduplicação e Trava 1 ativas" icon={<Activity />} tone="helena" />
        <StatCard label="Reuniões Geradas" value={totalMeetings} hint="Agendamentos no Calendar" icon={<TrendingUp />} tone="success" />
        <StatCard label="Operações Concluídas" value={completedCount} hint="Auditoria imutável" icon={<CheckCircle2 />} tone="neutral" />
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-5 space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Fila de Operações</h2>
          <div className="space-y-2">
            {db.operations.map((op) => {
              const pctVal = Math.round((op.processed / (op.total || 1)) * 100);
              const isSelected = op.id === selectedOp?.id;
              return (
                <div
                  key={op.id}
                  onClick={() => setSelectedOpId(op.id)}
                  className={`cursor-pointer rounded-xl border p-4 transition-all ${
                    isSelected ? "border-helena bg-card shadow-sm ring-1 ring-helena" : "bg-card/60 hover:bg-card hover:border-foreground/20"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{op.code}</span>
                        <Status value={op.status} />
                      </div>
                      <h3 className="mt-1 font-medium">{op.title}</h3>
                    </div>
                    <span className="font-mono text-xs font-semibold">{pctVal}%</span>
                  </div>

                  <div className="mt-3">
                    <ProgressBar value={pctVal} tone={op.status === "completed" ? "success" : "helena"} />
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{op.processed} de {op.total} leads</span>
                    <span>{op.metrics.meetings} reuniões · {op.metrics.interested} interessados</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-7">
          {selectedOp ? (
            <Panel
              title={
                <div className="flex items-center gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{selectedOp.code}</span>
                      <Status value={selectedOp.status} />
                    </div>
                    <h2 className="text-lg font-semibold">{selectedOp.title}</h2>
                  </div>
                </div>
              }
              actions={
                <Button
                  size="sm"
                  variant={selectedOp.status === "running" ? "outline" : "default"}
                  onClick={() => handleTogglePause(selectedOp)}
                  className="gap-2"
                >
                  {selectedOp.status === "running" ? (
                    <>
                      <Pause className="size-3.5" /> Pausar
                    </>
                  ) : (
                    <>
                      <Play className="size-3.5" /> Retomar
                    </>
                  )}
                </Button>
              }
            >
              <div className="space-y-6">
                <div>
                  <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Objetivo</div>
                  <p className="mt-1 text-sm">{selectedOp.objective}</p>
                </div>

                <div className="grid grid-cols-4 gap-2 rounded-lg border bg-muted/30 p-3 text-center">
                  <div>
                    <div className="text-lg font-semibold">{selectedOp.metrics.responded}</div>
                    <div className="text-[11px] text-muted-foreground">Respostas</div>
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-primary">{selectedOp.metrics.interested}</div>
                    <div className="text-[11px] text-muted-foreground">Interessados</div>
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-success">{selectedOp.metrics.meetings}</div>
                    <div className="text-[11px] text-muted-foreground">Reuniões</div>
                  </div>
                  <div>
                    <div className="text-lg font-semibold">{brl(selectedOp.cost)}</div>
                    <div className="text-[11px] text-muted-foreground">Custo IA</div>
                  </div>
                </div>

                <div>
                  <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Esteira de Execução (Steps)</h3>
                  <div className="space-y-2">
                    {selectedOp.steps.map((st, i) => (
                      <div key={st.id} className="flex items-center justify-between rounded-lg border bg-card px-3 py-2 text-xs">
                        <div className="flex items-center gap-2.5">
                          <span className="font-mono text-muted-foreground">{i + 1}.</span>
                          <span className={st.status === "done" ? "font-medium" : "text-muted-foreground"}>{st.label}</span>
                        </div>
                        <Status value={st.status} />
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Log de Eventos em Tempo Real</h3>
                  <div className="max-h-60 overflow-y-auto space-y-2 rounded-lg border bg-muted/20 p-3 font-mono text-xs">
                    {selectedOp.events.map((ev, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="text-muted-foreground whitespace-nowrap">{new Date(ev.at).toLocaleTimeString("pt-BR")}</span>
                        <Dot tone={ev.kind === "error" ? "danger" : ev.kind === "success" ? "success" : "info"} />
                        <span className="flex-1">{ev.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Panel>
          ) : (
            <Panel title="Nenhuma operação selecionada">
              <p className="text-sm text-muted-foreground">Selecione uma operação à esquerda para acompanhar os detalhes.</p>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
