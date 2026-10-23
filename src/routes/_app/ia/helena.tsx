import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  AlertTriangle, BarChart3, Bot, Calendar, CalendarClock, ChevronRight, CircleDollarSign,
  Clock, Edit2, MessageSquare, Network, Plus, Search, Settings2, Sparkles, Trash2, Zap,
} from "lucide-react";
import { PageHeader, StatCard, Status } from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDB, update } from "@/lib/store";
import { runTool } from "@/lib/helena/engine";
import { brl } from "@/lib/format";
import { pageHead } from "@/lib/head";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/ia/helena")({
  head: () => pageHead("Helena · Tech Lead IA", "O cérebro central da operação — supervisão, aprovações e análises estratégicas."),
  component: HelenaPage,
});

const AUTONOMY_LABELS: Record<number, string> = {
  1: "Manual — tudo requer aprovação",
  2: "Semi-auto — ações de baixo risco automáticas",
  3: "Autônoma — apenas risco alto solicita aprovação",
  4: "Total — Helena age livremente",
};

function HelenaPage() {
  const db = useDB();
  const s = db.helenaSettings;
  const pending = db.approvals.filter((a) => a.status === "pendente").length;
  const execToday = db.executions.filter((e) => e.at.slice(0, 10) === new Date().toISOString().slice(0, 10)).length;
  const totalCost = db.aiUsage.reduce((sum, u) => sum + u.cost, 0);

  const setAutonomy = (level: number) => {
    update((d) => { d.autonomyLevel = level as 1 | 2 | 3 | 4; });
    toast.success(`Autonomia alterada para Nível ${level}`);
  };

  const toggleKill = () => {
    update((d) => { d.killSwitchActive = !d.killSwitchActive; });
    toast.success(db.killSwitchActive ? "Kill Switch desativado — Helena operando" : "Kill Switch ATIVADO — Helena pausada");
  };

  const handleApproval = (id: string, action: "approve" | "deny") => {
    const res = runTool(
      action === "approve" ? "approvals.approve" : "approvals.deny",
      { approvalId: id, reason: "Via painel de controle" },
      { actor: "Gestor", actorType: "user" }
    );
    if (res.ok) toast.success(res.message);
    else toast.error(res.message);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="IA — Tech Lead"
        title="Helena"
        description="Supervisora central do sistema. Gerencia agentes, aprovações e a saúde operacional em tempo real."
      />

      {db.killSwitchActive && (
        <div className="flex items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4">
          <AlertTriangle className="size-5 text-destructive shrink-0" />
          <div>
            <p className="font-semibold text-destructive text-sm">Kill Switch Ativo</p>
            <p className="text-xs text-muted-foreground">Todas as ações autônomas estão pausadas. Reative para retomar operações.</p>
          </div>
          <Button size="sm" variant="destructive" className="ml-auto" onClick={toggleKill}>Reativar</Button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard label="Nível de Autonomia" value={`Nível ${db.autonomyLevel}`} hint={AUTONOMY_LABELS[db.autonomyLevel]} icon={<Sparkles />} tone="helena" />
        <StatCard label="Aprovações Pendentes" value={pending} icon={<AlertTriangle />} tone="warning" />
        <StatCard label="Execuções Hoje" value={execToday} icon={<Zap />} tone="info" />
        <StatCard label="Custo Acumulado" value={brl(totalCost)} hint="Tokens de IA consumidos" icon={<CircleDollarSign />} tone="success" />
      </div>

      <Tabs defaultValue="controle">
        <TabsList>
          <TabsTrigger value="controle">Painel de Controle</TabsTrigger>
          <TabsTrigger value="aprovacoes">Aprovações {pending > 0 && `(${pending})`}</TabsTrigger>
          <TabsTrigger value="config">Configurações</TabsTrigger>
        </TabsList>

        <TabsContent value="controle" className="mt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border bg-card p-5 space-y-3">
              <h3 className="font-semibold text-sm">Nível de Autonomia</h3>
              <div className="space-y-2">
                {([1, 2, 3, 4] as const).map((level) => (
                  <button key={level} onClick={() => setAutonomy(level)}
                    className={`w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-all ${db.autonomyLevel === level ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}>
                    <div className={`size-8 flex items-center justify-center rounded-full font-bold text-sm ${db.autonomyLevel === level ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{level}</div>
                    <span className="text-xs">{AUTONOMY_LABELS[level]}</span>
                    {db.autonomyLevel === level && <Badge className="ml-auto">Atual</Badge>}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border bg-card p-5 space-y-3">
              <h3 className="font-semibold text-sm">Ações de Emergência</h3>
              <div className="space-y-2">
                <div className="rounded-lg border p-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Kill Switch Global</p>
                    <p className="text-xs text-muted-foreground">Pausa imediata de todas as ações autônomas</p>
                  </div>
                  <Button variant={db.killSwitchActive ? "outline" : "destructive"} size="sm" onClick={toggleKill}>
                    {db.killSwitchActive ? "Desativar" : "Ativar"}
                  </Button>
                </div>
                <div className="rounded-lg border p-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Modelo de IA</p>
                    <p className="text-xs text-muted-foreground">{s.model}</p>
                  </div>
                  <Badge variant="outline">{s.agentsDefaultModel}</Badge>
                </div>
                <div className="rounded-lg border p-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Budget Mensal</p>
                    <p className="text-xs text-muted-foreground">{brl(totalCost)} de {brl(s.monthlyBudget)}</p>
                  </div>
                  <Badge variant={totalCost > s.alertAt ? "destructive" : "secondary"}>
                    {Math.round((totalCost / s.monthlyBudget) * 100)}%
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="aprovacoes" className="mt-4 space-y-3">
          {db.approvals.filter((a) => a.status === "pendente").length === 0 ? (
            <div className="rounded-xl border bg-card p-10 text-center">
              <Sparkles className="size-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm font-medium">Nenhuma aprovação pendente</p>
              <p className="text-xs text-muted-foreground">Helena está operando normalmente.</p>
            </div>
          ) : (
            db.approvals.filter((a) => a.status === "pendente").map((ap) => (
              <div key={ap.id} className="rounded-xl border bg-card p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={ap.risk === "alto" ? "destructive" : ap.risk === "medio" ? "outline" : "secondary"}>
                        {ap.risk === "alto" ? "Risco Alto" : ap.risk === "medio" ? "Risco Médio" : "Risco Baixo"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{ap.requestedBy}</span>
                    </div>
                    <h4 className="font-semibold text-sm">{ap.title}</h4>
                    <p className="text-xs text-muted-foreground">{ap.description}</p>
                  </div>
                </div>
                {ap.details.length > 0 && (
                  <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted/30 p-2">
                    {ap.details.map((d, i) => (
                      <div key={i}><span className="text-[10px] text-muted-foreground">{d.label}: </span>
                        <span className="text-[10px] font-medium">{d.value}</span></div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button size="sm" variant="destructive" className="flex-1 h-8" onClick={() => handleApproval(ap.id, "deny")}>Negar</Button>
                  <Button size="sm" className="flex-1 h-8" onClick={() => handleApproval(ap.id, "approve")}>Aprovar</Button>
                </div>
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="config" className="mt-4">
          <div className="rounded-xl border bg-card p-5 space-y-4">
            <h3 className="font-semibold text-sm">Configurações da Helena</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="text-xs text-muted-foreground">Modelo Principal</label>
                <Input defaultValue={s.model} readOnly className="mt-1" /></div>
              <div><label className="text-xs text-muted-foreground">Modelo dos Agentes</label>
                <Input defaultValue={s.agentsDefaultModel} readOnly className="mt-1" /></div>
              <div><label className="text-xs text-muted-foreground">Budget Mensal (R$)</label>
                <Input defaultValue={s.monthlyBudget} readOnly className="mt-1" /></div>
              <div><label className="text-xs text-muted-foreground">Alertar em (R$)</label>
                <Input defaultValue={s.alertAt} readOnly className="mt-1" /></div>
            </div>
            <p className="text-xs text-muted-foreground">Para alterar configurações avançadas, acesse o terminal da Helena no chat.</p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
