import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Activity, AlertTriangle, Bot, CheckCircle2, ChevronRight, Clock, Edit2, MessageCircle,
  MoreHorizontal, Plus, Search, Settings2, Sparkles, Zap,
} from "lucide-react";
import { PageHeader, StatCard, Status } from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useDB, update } from "@/lib/store";
import { runTool } from "@/lib/helena/engine";
import { pageHead } from "@/lib/head";
import { toast } from "sonner";
import type { AgentStatus } from "@/lib/types";

export const Route = createFileRoute("/_app/ia/agentes")({
  head: () => pageHead("Agentes IA", "Gerencie todos os agentes autônomos da plataforma — SDRs, Closers, Analistas e mais."),
  component: AgentesPage,
});

const HEALTH_COLOR: Record<string, string> = {
  healthy: "text-success", idle: "text-muted-foreground", busy: "text-primary",
  degraded: "text-warning", blocked: "text-destructive", offline: "text-muted-foreground",
};

const STATUS_ICON: Record<AgentStatus, JSX.Element> = {
  trabalhando: <CheckCircle2 className="size-3.5 text-success" />,
  aguardando: <Clock className="size-3.5 text-muted-foreground" />,
  pausado: <AlertTriangle className="size-3.5 text-warning" />,
  erro: <AlertTriangle className="size-3.5 text-destructive" />,
};

function AgentesPage() {
  const db = useDB();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("todos");

  const roles = ["todos", ...Array.from(new Set(db.agents.map((a) => a.role)))];

  const filtered = db.agents.filter((a) => {
    const matchSearch = `${a.name} ${a.role} ${a.description}`.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "todos" || a.role === filter;
    return matchSearch && matchFilter;
  });

  const working = db.agents.filter((a) => a.status === "trabalhando").length;
  const errors = db.agents.filter((a) => a.status === "erro").length;
  const totalTasks = db.agents.reduce((s, a) => s + a.metrics.tasks, 0);
  const totalConversions = db.agents.reduce((s, a) => s + a.metrics.conversions, 0);

  const handlePause = (id: string) => {
    const res = runTool("agents.pause", { agentId: id }, { actor: "Gestor", actorType: "user" });
    if (res.ok) toast.success(res.message);
    else toast.error(res.message);
  };

  const handleResume = (id: string) => {
    const res = runTool("agents.resume", { agentId: id }, { actor: "Gestor", actorType: "user" });
    if (res.ok) toast.success(res.message);
    else toast.error(res.message);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="IA"
        title="Agentes"
        description="Força de trabalho digital — cada agente tem papel, ferramentas e canais específicos."
      />

      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard label="Trabalhando" value={working} icon={<CheckCircle2 />} tone="success" />
        <StatCard label="Total de Agentes" value={db.agents.length} icon={<Bot />} tone="info" />
        <StatCard label="Tarefas Executadas" value={totalTasks.toLocaleString("pt-BR")} icon={<Activity />} tone="helena" />
        <StatCard label="Em Erro" value={errors} icon={<AlertTriangle />} tone="warning" />
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input placeholder="Buscar agente..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {roles.map((r) => (
            <Button key={r} size="sm" variant={filter === r ? "default" : "outline"} className="h-9 text-xs capitalize" onClick={() => setFilter(r)}>
              {r}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((agent) => {
          const team = db.teams.find((t) => t.agentIds.includes(agent.id));
          return (
            <div key={agent.id} className="rounded-xl border bg-card p-5 space-y-4 hover:border-foreground/20 transition-all">
              <div className="flex items-start gap-3">
                <div className="size-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                  {agent.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-sm truncate">{agent.name}</h3>
                    {STATUS_ICON[agent.status]}
                  </div>
                  <p className="text-xs text-muted-foreground capitalize">{agent.role}</p>
                  {team && <p className="text-[10px] text-primary mt-0.5">{team.name}</p>}
                </div>
              </div>

              {agent.currentTask && (
                <div className="rounded-lg bg-muted/40 px-3 py-2">
                  <p className="text-[10px] text-muted-foreground">Executando:</p>
                  <p className="text-xs line-clamp-2">{agent.currentTask}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="rounded-lg bg-muted/30 p-2">
                  <div className="text-sm font-bold">{agent.metrics.tasks}</div>
                  <div className="text-[10px] text-muted-foreground">Tarefas</div>
                </div>
                <div className="rounded-lg bg-muted/30 p-2">
                  <div className="text-sm font-bold text-success">{agent.metrics.conversions}</div>
                  <div className="text-[10px] text-muted-foreground">Conversões</div>
                </div>
              </div>

              <div className="flex items-center gap-1 flex-wrap">
                {agent.channels.map((ch) => <Badge key={ch} variant="outline" className="text-[10px] px-1.5 py-0">{ch}</Badge>)}
                <span className="ml-auto text-[10px] text-muted-foreground">{agent.model}</span>
              </div>

              <div className="flex gap-2">
                {agent.status === "pausado" ? (
                  <Button size="sm" className="flex-1 h-8 text-xs gap-1" onClick={() => handleResume(agent.id)}>
                    <Zap className="size-3.5" /> Retomar
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" className="flex-1 h-8 text-xs gap-1" onClick={() => handlePause(agent.id)}>
                    <Clock className="size-3.5" /> Pausar
                  </Button>
                )}
                <Button size="sm" variant="outline" className="h-8 px-3">
                  <Settings2 className="size-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
