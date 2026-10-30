import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Activity, Bot, ChevronRight, Network, Plus, Search, Sparkles, Users, Zap,
} from "lucide-react";
import { PageHeader, StatCard, Status } from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { currentUser, useDB } from "@/lib/store";
import { canUseDevTeam } from "@/lib/saas";
import { brl } from "@/lib/format";
import { pageHead } from "@/lib/head";
import { TeamForm } from "./components/-TeamForm";

export const Route = createFileRoute("/_app/ia/times")({
  head: () => pageHead("Times de IA", "Equipes autônomas de agentes coordenadas pela Helena para missões e operações."),
  component: TimesPage,
});

const TEAM_STATUS_MAP: Record<string, { label: string; color: string }> = {
  ativo: { label: "Ativo", color: "success" },
  pausado: { label: "Pausado", color: "warning" },
  aguardando: { label: "Aguardando", color: "info" },
  erro: { label: "Erro", color: "destructive" },
  requer_aprovacao: { label: "Revisão", color: "warning" },
};

function TimesPage() {
  const db = useDB();
  const [search, setSearch] = useState("");
  const [showCreateTeamModal, setShowCreateTeamModal] = useState(false);

  const allowDev = canUseDevTeam(currentUser(db));
  const filtered = db.teams.filter((t) => {
    if (!allowDev && t.id === "t_dev") return false;
    return `${t.name} ${t.objective}`.toLowerCase().includes(search.toLowerCase());
  });

  const active = db.teams.filter((t) => t.status === "ativo").length;
  const totalLeads = db.teams.reduce((s, t) => s + t.metrics.leads, 0);
  const totalMeetings = db.teams.reduce((s, t) => s + t.metrics.meetings, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="IA"
        title="Times de Agentes"
        description={allowDev
          ? "Comercial aborda. Desenvolvimento IA monta a prévia de site e cardápio. Atendimento cobre o cliente ativo."
          : "Comercial e Atendimento no seu plano. A Helena orquestra a prospecção no WhatsApp."}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Times Ativos" value={active} icon={<Network />} tone="success" />
        <StatCard label="Leads Trabalhados" value={totalLeads.toLocaleString("pt-BR")} icon={<Zap />} tone="info" />
        <StatCard label="Reuniões Geradas" value={totalMeetings} icon={<Activity />} tone="helena" />
      </div>

      <div className="flex gap-3 flex-wrap">
        <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setShowCreateTeamModal(true)}>
          <Plus className="size-3.5" /> Novo Time
        </Button>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input placeholder="Buscar time..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {filtered.map((team) => {
          const supervisor = db.agents.find((a) => a.id === team.supervisorId);
          const members = db.agents.filter((a) => team.agentIds.includes(a.id));
          const budgetPct = team.budget > 0 ? Math.round((team.spent / team.budget) * 100) : 0;
          const st = TEAM_STATUS_MAP[team.status] ?? { label: team.status, color: "secondary" };
          return (
            <div key={team.id} className="rounded-xl border bg-card p-5 space-y-4 hover:border-foreground/20 transition-all">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold">{team.name}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{team.objective}</p>
                </div>
                <Badge variant="outline" className="shrink-0">{st.label}</Badge>
              </div>

              {supervisor && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Sparkles className="size-3.5 text-primary shrink-0" />
                  <span>Supervisor: <span className="font-medium text-foreground">{supervisor.name}</span></span>
                </div>
              )}

              <div className="flex items-center gap-2">
                {members.slice(0, 5).map((m) => (
                  <div key={m.id} title={m.name}
                    className="size-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
                    {m.name.slice(0, 2).toUpperCase()}
                  </div>
                ))}
                {members.length > 5 && (
                  <div className="size-7 rounded-full bg-muted flex items-center justify-center text-[10px] text-muted-foreground">
                    +{members.length - 5}
                  </div>
                )}
                <span className="ml-auto text-xs text-muted-foreground">{members.length} agentes</span>
              </div>

              <div className="grid grid-cols-3 text-center gap-2 rounded-lg bg-muted/30 p-2">
                <div><div className="text-sm font-bold">{team.metrics.leads}</div><div className="text-[10px] text-muted-foreground">Leads</div></div>
                <div><div className="text-sm font-bold text-primary">{team.metrics.meetings}</div><div className="text-[10px] text-muted-foreground">Reuniões</div></div>
                <div><div className="text-sm font-bold text-success">{team.metrics.conversions}</div><div className="text-[10px] text-muted-foreground">Fechamentos</div></div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Budget</span>
                  <span>{brl(team.spent)} / {brl(team.budget)}</span>
                </div>
                <Progress value={budgetPct} className="h-1.5" />
              </div>

              <div className="flex gap-2">
                <div className="flex flex-wrap gap-1 flex-1">
                  {team.channels.map((ch) => <Badge key={ch} variant="outline" className="text-[10px] px-1.5 py-0">{ch}</Badge>)}
                </div>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1"><ChevronRight className="size-3.5" /></Button>
              </div>
            </div>
          );
        })}
      </div>
      {/* Modal: Criar Novo Time */}
      <TeamForm
        open={showCreateTeamModal}
        onOpenChange={setShowCreateTeamModal}
      />
    </div>
  );
}
