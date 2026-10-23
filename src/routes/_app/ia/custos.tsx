import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle, BarChart3, Bot, CircleDollarSign, Cpu, TrendingDown, TrendingUp,
} from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/kit";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useDB } from "@/lib/store";
import { brl } from "@/lib/format";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/_app/ia/custos")({
  head: () => pageHead("Custos de IA", "Monitoramento de consumo de tokens e custos por agente, modelo e operação."),
  component: CustosPage,
});

function CustosPage() {
  const db = useDB();
  const s = db.helenaSettings;

  const totalCost = db.aiUsage.reduce((sum, u) => sum + u.cost, 0);
  const totalInput = db.aiUsage.reduce((sum, u) => sum + u.inputTokens, 0);
  const totalOutput = db.aiUsage.reduce((sum, u) => sum + u.outputTokens, 0);
  const budgetPct = s.monthlyBudget > 0 ? Math.round((totalCost / s.monthlyBudget) * 100) : 0;

  // Cost by model
  const byModel = db.aiUsage.reduce<Record<string, number>>((acc, u) => {
    acc[u.model] = (acc[u.model] ?? 0) + u.cost;
    return acc;
  }, {});

  // Cost by agent
  const byAgent = db.aiUsage.reduce<Record<string, number>>((acc, u) => {
    const agent = db.agents.find((a) => a.id === u.agentId);
    const name = agent?.name ?? "Helena";
    acc[name] = (acc[name] ?? 0) + u.cost;
    return acc;
  }, {});

  // Cost by provider
  const byProvider = db.aiUsage.reduce<Record<string, number>>((acc, u) => {
    acc[u.provider] = (acc[u.provider] ?? 0) + u.cost;
    return acc;
  }, {});

  // Recent usage (last 10)
  const recent = [...db.aiUsage].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="IA — Financeiro"
        title="Custos de IA"
        description="Rastreamento de tokens e custos em tempo real — controle total do budget de IA."
      />

      {budgetPct >= (s.alertAt / s.monthlyBudget) * 100 && (
        <div className="flex items-center gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4">
          <AlertTriangle className="size-5 text-warning shrink-0" />
          <div>
            <p className="font-semibold text-sm">Alerta de Budget</p>
            <p className="text-xs text-muted-foreground">Consumo em {budgetPct}% do budget mensal — monitorar de perto.</p>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard label="Custo Total" value={brl(totalCost)} icon={<CircleDollarSign />} tone="helena" />
        <StatCard label="Budget Mensal" value={brl(s.monthlyBudget)} hint={`${budgetPct}% utilizado`} icon={<BarChart3 />} tone="info" />
        <StatCard label="Tokens de Entrada" value={(totalInput / 1000).toFixed(1) + "K"} icon={<TrendingUp />} tone="success" />
        <StatCard label="Tokens de Saída" value={(totalOutput / 1000).toFixed(1) + "K"} icon={<TrendingDown />} tone="warning" />
      </div>

      <div className="rounded-xl border bg-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Budget Mensal</h3>
          <span className="text-sm font-mono">{brl(totalCost)} / {brl(s.monthlyBudget)}</span>
        </div>
        <Progress value={budgetPct} className="h-2.5" />
        <p className="text-xs text-muted-foreground">
          {s.blockAtLimit ? "Bloqueio automático ao atingir 100%." : "Sem bloqueio automático — alerta configurado."}
          {" "}Alerta em {brl(s.alertAt)}.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h3 className="font-semibold text-sm flex items-center gap-2"><Cpu className="size-4" /> Por Provedor</h3>
          {Object.entries(byProvider).sort(([, a], [, b]) => b - a).map(([name, cost]) => {
            const pct = totalCost > 0 ? Math.round((cost / totalCost) * 100) : 0;
            return (
              <div key={name}>
                <div className="flex justify-between text-xs mb-1"><span className="capitalize">{name}</span><span>{brl(cost)} ({pct}%)</span></div>
                <Progress value={pct} className="h-1" />
              </div>
            );
          })}
        </div>

        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h3 className="font-semibold text-sm flex items-center gap-2"><BarChart3 className="size-4" /> Por Modelo</h3>
          {Object.entries(byModel).sort(([, a], [, b]) => b - a).map(([model, cost]) => {
            const pct = totalCost > 0 ? Math.round((cost / totalCost) * 100) : 0;
            return (
              <div key={model}>
                <div className="flex justify-between text-xs mb-1"><span className="font-mono">{model}</span><span>{brl(cost)}</span></div>
                <Progress value={pct} className="h-1" />
              </div>
            );
          })}
        </div>

        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h3 className="font-semibold text-sm flex items-center gap-2"><Bot className="size-4" /> Por Agente</h3>
          {Object.entries(byAgent).sort(([, a], [, b]) => b - a).slice(0, 8).map(([name, cost]) => {
            const pct = totalCost > 0 ? Math.round((cost / totalCost) * 100) : 0;
            return (
              <div key={name}>
                <div className="flex justify-between text-xs mb-1"><span className="truncate">{name}</span><span>{brl(cost)}</span></div>
                <Progress value={pct} className="h-1" />
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border overflow-hidden">
        <div className="px-4 py-2.5 bg-muted/30 text-[11px] font-semibold text-muted-foreground grid grid-cols-[1fr_auto_auto_auto_auto]">
          <span>Data</span><span>Agente</span><span>Modelo</span><span>Tokens</span><span>Custo</span>
        </div>
        {recent.map((u, i) => {
          const agent = db.agents.find((a) => a.id === u.agentId);
          return (
            <div key={u.id} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 items-center px-4 py-2.5 border-t hover:bg-muted/10 transition-colors">
              <span className="text-xs text-muted-foreground">{new Date(u.date).toLocaleDateString("pt-BR")}</span>
              <span className="text-xs font-medium">{agent?.name ?? "Helena"}</span>
              <span className="text-xs font-mono text-muted-foreground">{u.model}</span>
              <span className="text-xs tabular-nums">{(u.inputTokens + u.outputTokens).toLocaleString("pt-BR")}</span>
              <span className="text-xs font-semibold">{brl(u.cost)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
