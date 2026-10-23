import { createFileRoute } from "@tanstack/react-router";
import {
  BarChart3, Bot, CircleDollarSign, MessageCircle, Repeat, Target, TrendingUp, Users, Zap,
} from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/kit";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useDB } from "@/lib/store";
import { brl } from "@/lib/format";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/_app/analytics")({
  head: () => pageHead("Analytics", "Painel executivo com KPIs da operação, funil comercial e performance dos agentes."),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const db = useDB();

  const openDeals = db.deals.filter((d) => d.status === "aberto");
  const wonDeals = db.deals.filter((d) => d.status === "ganho");
  const lostDeals = db.deals.filter((d) => d.status === "perdido");
  const totalRevenue = wonDeals.reduce((s, d) => s + d.value, 0);
  const pipelineValue = openDeals.reduce((s, d) => s + d.value, 0);
  const convRate = (db.deals.length > 0) ? Math.round((wonDeals.length / db.deals.length) * 100) : 0;

  const totalConversations = db.conversations.length;
  const resolvedConvs = db.conversations.filter((c) => c.status === "resolvida").length;
  const csat = totalConversations > 0 ? Math.round((resolvedConvs / totalConversations) * 100) : 0;

  const totalCampaignSent = db.campaigns.reduce((s, c) => s + c.sent, 0);
  const totalCampaignMeetings = db.campaigns.reduce((s, c) => s + c.meetings, 0);
  const campaignConv = totalCampaignSent > 0 ? ((totalCampaignMeetings / totalCampaignSent) * 100).toFixed(1) : "0";

  const topAgents = [...db.agents]
    .sort((a, b) => b.metrics.conversions - a.metrics.conversions)
    .slice(0, 5);

  const dealsByStage = (() => {
    const pipeline = db.pipelines[0];
    if (!pipeline) return [];
    return pipeline.stages.map((stage) => {
      const stageDeals = openDeals.filter((d) => d.stageId === stage.id);
      const value = stageDeals.reduce((s, d) => s + d.value, 0);
      return { stage, count: stageDeals.length, value };
    });
  })();

  const maxStageCount = Math.max(...dealsByStage.map((s) => s.count), 1);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Relatórios"
        title="Analytics"
        description="KPIs executivos da operação — receita, funil, conversão e performance dos agentes IA."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Receita Fechada" value={brl(totalRevenue)} hint={`${wonDeals.length} deals ganhos`} icon={<CircleDollarSign />} tone="success" />
        <StatCard label="Pipeline Ativo" value={brl(pipelineValue)} hint={`${openDeals.length} deals em aberto`} icon={<TrendingUp />} tone="info" />
        <StatCard label="Taxa de Conversão" value={`${convRate}%`} hint="Deals ganhos / total" icon={<Target />} tone="helena" />
        <StatCard label="CSAT" value={`${csat}%`} hint="Conversas resolvidas" icon={<MessageCircle />} tone="warning" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <h3 className="font-semibold text-sm flex items-center gap-2"><BarChart3 className="size-4" /> Funil de Vendas</h3>
          {dealsByStage.map(({ stage, count, value }) => (
            <div key={stage.id}>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="font-medium">{stage.name}</span>
                <span className="text-muted-foreground">{count} deals · {brl(value)}</span>
              </div>
              <Progress value={maxStageCount > 0 ? (count / maxStageCount) * 100 : 0} className="h-2" />
            </div>
          ))}
        </div>

        <div className="rounded-xl border bg-card p-5 space-y-4">
          <h3 className="font-semibold text-sm flex items-center gap-2"><Zap className="size-4" /> Performance de Campanhas</h3>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl bg-muted/30 p-3">
              <div className="text-2xl font-bold">{totalCampaignSent.toLocaleString("pt-BR")}</div>
              <div className="text-[11px] text-muted-foreground">Disparos</div>
            </div>
            <div className="rounded-xl bg-muted/30 p-3">
              <div className="text-2xl font-bold text-primary">{totalCampaignMeetings}</div>
              <div className="text-[11px] text-muted-foreground">Reuniões</div>
            </div>
            <div className="rounded-xl bg-muted/30 p-3">
              <div className="text-2xl font-bold text-success">{campaignConv}%</div>
              <div className="text-[11px] text-muted-foreground">Conversão</div>
            </div>
          </div>
          <div className="space-y-2">
            {db.campaigns.slice(0, 4).map((camp) => (
              <div key={camp.id} className="flex items-center gap-2 text-xs">
                <div className="flex-1 truncate">{camp.name}</div>
                <Badge variant="outline">{camp.sent}/{camp.total}</Badge>
                <span className="font-semibold text-success">{camp.meetings} reuniões</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5 space-y-4">
        <h3 className="font-semibold text-sm flex items-center gap-2"><Bot className="size-4" /> Top Agentes por Conversão</h3>
        <div className="space-y-3">
          {topAgents.map((agent, i) => {
            const maxConv = topAgents[0]?.metrics.conversions ?? 1;
            const pct = maxConv > 0 ? Math.round((agent.metrics.conversions / maxConv) * 100) : 0;
            return (
              <div key={agent.id} className="flex items-center gap-3">
                <span className="w-4 text-xs font-bold text-muted-foreground">{i + 1}</span>
                <div className="size-7 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                  {agent.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium truncate">{agent.name}</span>
                    <span className="text-muted-foreground">{agent.metrics.conversions} conv.</span>
                  </div>
                  <Progress value={pct} className="h-1.5" />
                </div>
                <Badge variant="outline" className="text-[10px] capitalize shrink-0">{agent.role}</Badge>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h3 className="font-semibold text-sm">Leads por Fonte</h3>
          {["Facebook Ads", "Google Ads", "Indicação", "Prospecção", "Instagram"].map((source) => {
            const count = db.contacts.filter((c) => c.source === source).length;
            const pct = db.contacts.length > 0 ? Math.round((count / db.contacts.length) * 100) : 0;
            return (
              <div key={source}>
                <div className="flex justify-between text-xs mb-1"><span>{source}</span><span>{pct}%</span></div>
                <Progress value={pct} className="h-1" />
              </div>
            );
          })}
        </div>

        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h3 className="font-semibold text-sm">Deals por Status</h3>
          {[
            { label: "Em aberto", count: openDeals.length, tone: "text-primary" },
            { label: "Ganhos", count: wonDeals.length, tone: "text-success" },
            { label: "Perdidos", count: lostDeals.length, tone: "text-destructive" },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between">
              <span className="text-sm">{row.label}</span>
              <span className={`text-sm font-bold ${row.tone}`}>{row.count}</span>
            </div>
          ))}
        </div>

        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h3 className="font-semibold text-sm">Resumo Geral</h3>
          {[
            { label: "Contatos", value: db.contacts.length },
            { label: "Empresas", value: db.companies.length },
            { label: "Conversas", value: totalConversations },
            { label: "Agentes IA", value: db.agents.length },
            { label: "Campanhas", value: db.campaigns.length },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{row.label}</span>
              <span className="font-semibold">{row.value.toLocaleString("pt-BR")}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
