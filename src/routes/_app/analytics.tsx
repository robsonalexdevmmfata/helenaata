import { createFileRoute } from "@tanstack/react-router";
import {
  BarChart3, Bot, CircleDollarSign, MessageCircle, Target, TrendingUp, Zap,
} from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/kit";
import { FunnelBars, GlowPie, WeekActivityChart } from "@/components/app/CommercialCharts";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useDB } from "@/lib/store";
import { computeAnalytics } from "@/lib/analytics";
import { brl } from "@/lib/format";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/_app/analytics")({
  head: () => pageHead("Analytics", "Painel executivo com KPIs da operação, funil comercial e performance dos agentes."),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const db = useDB();
  const {
    openDeals, wonDeals, lostDeals, totalRevenue, pipelineValue, convRate, totalLeads,
    totalConversations, csat, campaignSent, meetings, campaignConv, dealsByStage, topAgents, week, weightedPipeline,
  } = computeAnalytics(db);

  const maxStageCount = Math.max(...dealsByStage.map((s) => s.count), 1);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Relatórios"
        title="Analytics"
        description="KPIs calculados ao vivo do CRM, da Agenda e dos disparos Evolution — sem números de demonstração."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Receita Fechada" value={brl(totalRevenue)} hint={`${wonDeals.length} deals ganhos`} icon={<CircleDollarSign />} tone="success" />
        <StatCard label="Pipeline Ativo" value={brl(pipelineValue)} hint={`${openDeals.length} abertos · ponderado ${brl(weightedPipeline)}`} icon={<TrendingUp />} tone="info" />
        <StatCard label="Taxa de Conversão" value={`${convRate}%`} hint={`${wonDeals.length} ganhos / ${totalLeads} leads`} icon={<Target />} tone="helena" />
        <StatCard label="CSAT" value={`${csat}%`} hint="Conversas resolvidas" icon={<MessageCircle />} tone="warning" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <h3 className="font-semibold text-sm flex items-center gap-2"><BarChart3 className="size-4" /> Funil de Vendas</h3>
          <FunnelBars rows={dealsByStage.map((s) => ({ name: s.stage.name, count: s.count, value: s.value }))} />
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
        <div className="rounded-xl border bg-card p-5">
          <h3 className="mb-3 font-semibold text-sm">Atividade 7 dias</h3>
          <WeekActivityChart data={week} />
        </div>
        <div className="rounded-xl border bg-card p-5 md:col-span-2">
          <h3 className="mb-3 font-semibold text-sm">Deals por status</h3>
          <GlowPie
            data={[
              { name: "Aberto", value: openDeals.length },
              { name: "Ganho", value: wonDeals.length },
              { name: "Perdido", value: lostDeals.length },
            ]}
          />
        </div>

        <div className="rounded-xl border bg-card p-5 space-y-4">
          <h3 className="font-semibold text-sm flex items-center gap-2"><Zap className="size-4" /> Performance de Campanhas</h3>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl bg-muted/30 p-3">
              <div className="text-2xl font-bold">{campaignSent.toLocaleString("pt-BR")}</div>
              <div className="text-[11px] text-muted-foreground">Disparos Evolution</div>
            </div>
            <div className="rounded-xl bg-muted/30 p-3">
              <div className="text-2xl font-bold text-primary">{meetings}</div>
              <div className="text-[11px] text-muted-foreground">Reuniões (Agenda)</div>
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
            const maxConv = Math.max(topAgents[0]?.conversions ?? 0, topAgents[0]?.meetings ?? 0, 1);
            const pct = Math.round(((agent.conversions || agent.meetings) / maxConv) * 100);
            return (
              <div key={agent.id} className="flex items-center gap-3">
                <span className="w-4 text-xs font-bold text-muted-foreground">{i + 1}</span>
                <div className="size-7 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                  {agent.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium truncate">{agent.name}</span>
                    <span className="text-muted-foreground">{agent.conversions} conv. · {agent.meetings} reun.</span>
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
