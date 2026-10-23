import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Award, Bot, CheckCircle2, ChevronRight, Edit2, Mail, MessageCircle, Phone, Plus, Search, Target, Users,
} from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDB } from "@/lib/store";
import { initials, brl } from "@/lib/format";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/_app/equipe")({
  head: () => pageHead("Equipe", "Gestão da equipe humana e dos agentes IA que compõem a operação."),
  component: EquipePage,
});

const ROLE_LABEL: Record<string, string> = {
  owner: "Proprietário", admin: "Admin", manager: "Gestor", agent: "Agente", viewer: "Visualizador",
};

const COLOR_CLASS: Record<string, string> = {
  "chart-1": "bg-[hsl(var(--chart-1))]",
  "chart-2": "bg-[hsl(var(--chart-2))]",
  "chart-3": "bg-[hsl(var(--chart-3))]",
  "chart-4": "bg-[hsl(var(--chart-4))]",
  "chart-5": "bg-[hsl(var(--chart-5))]",
};

function EquipePage() {
  const db = useDB();
  const [search, setSearch] = useState("");

  const filteredUsers = db.users.filter((u) =>
    `${u.name} ${u.email} ${u.title}`.toLowerCase().includes(search.toLowerCase())
  );
  const filteredAgents = db.agents.filter((a) =>
    `${a.name} ${a.role} ${a.description}`.toLowerCase().includes(search.toLowerCase())
  );

  const activeUsers = db.users.filter((u) => u.status === "ativo").length;
  const workingAgents = db.agents.filter((a) => a.status === "trabalhando").length;
  const totalConversions = db.agents.reduce((s, a) => s + a.metrics.conversions, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operações"
        title="Equipe"
        description="Membros humanos e agentes IA — todos os que executam a operação da agência."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Humanos Ativos" value={activeUsers} icon={<Users />} tone="info" />
        <StatCard label="Agentes IA Ativos" value={workingAgents} icon={<Bot />} tone="helena" />
        <StatCard label="Total de Conversões IA" value={totalConversions} icon={<Award />} tone="success" />
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
        <Input placeholder="Buscar membro ou agente..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <Tabs defaultValue="humanos">
        <TabsList>
          <TabsTrigger value="humanos">Humanos ({db.users.length})</TabsTrigger>
          <TabsTrigger value="agentes">Agentes IA ({db.agents.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="humanos" className="mt-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredUsers.map((user) => {
              const pct = user.goal > 0 ? Math.min(100, Math.round((user.achieved / user.goal) * 100)) : 0;
              const conv = db.deals.filter((d) => d.ownerId === user.id && d.status === "ganho").length;
              return (
                <div key={user.id} className="rounded-xl border bg-card p-5 space-y-4 hover:border-foreground/20 transition-all">
                  <div className="flex items-center gap-3">
                    <div className={`size-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 ${COLOR_CLASS[user.color] ?? "bg-primary"}`}>
                      {initials(user.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm truncate">{user.name}</h3>
                      <p className="text-xs text-muted-foreground">{user.title}</p>
                    </div>
                    <Badge variant={user.status === "ativo" ? "default" : "secondary"} className="shrink-0 text-[10px]">
                      {user.status}
                    </Badge>
                  </div>

                  <div className="space-y-1 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2"><Mail className="size-3.5" /> <span className="truncate">{user.email}</span></div>
                    <div className="flex items-center gap-2"><Target className="size-3.5" /> <span>{ROLE_LABEL[user.role] ?? user.role}</span></div>
                    <div className="flex items-center gap-2"><CheckCircle2 className="size-3.5" /> <span>{conv} deals fechados</span></div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Meta do mês</span>
                      <span className="font-medium">{brl(user.achieved)} / {brl(user.goal)}</span>
                    </div>
                    <Progress value={pct} className="h-1.5" />
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="agentes" className="mt-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredAgents.map((agent) => {
              const team = db.teams.find((t) => t.agentIds.includes(agent.id));
              return (
                <div key={agent.id} className="rounded-xl border bg-card p-5 space-y-4 hover:border-foreground/20 transition-all">
                  <div className="flex items-center gap-3">
                    <div className="size-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                      {agent.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm truncate">{agent.name}</h3>
                      <p className="text-xs text-muted-foreground capitalize">{agent.role}</p>
                    </div>
                    <Badge variant={agent.status === "trabalhando" ? "default" : agent.status === "erro" ? "destructive" : "secondary"} className="text-[10px] shrink-0">
                      {agent.status}
                    </Badge>
                  </div>

                  <p className="text-xs text-muted-foreground line-clamp-2">{agent.description}</p>

                  <div className="grid grid-cols-3 text-center">
                    <div><div className="text-sm font-bold">{agent.metrics.tasks}</div><div className="text-[10px] text-muted-foreground">Tarefas</div></div>
                    <div><div className="text-sm font-bold text-primary">{agent.metrics.conversations}</div><div className="text-[10px] text-muted-foreground">Convs.</div></div>
                    <div><div className="text-sm font-bold text-success">{agent.metrics.conversions}</div><div className="text-[10px] text-muted-foreground">Conv.</div></div>
                  </div>

                  {team && (
                    <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Users className="size-3" /> {team.name}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-1">
                    {agent.channels.map((ch) => <Badge key={ch} variant="outline" className="text-[10px] px-1.5">{ch}</Badge>)}
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
