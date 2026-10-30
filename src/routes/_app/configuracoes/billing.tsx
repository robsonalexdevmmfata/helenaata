import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  CheckCircle2, CreditCard, Download, ExternalLink, Receipt, Sparkles, TrendingUp, Zap,
} from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useDB } from "@/lib/store";
import { brl } from "@/lib/format";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/_app/configuracoes/billing")({
  head: () => pageHead("Billing", "Plano, faturas e consumo da conta."),
  component: BillingPage,
});

const PLAN_FEATURES: Record<string, string[]> = {
  Scale: [
    "Agentes ilimitados",
    "Até 10 usuários",
    "WhatsApp + Instagram + E-mail",
    "Helena IA (orquestradora completa)",
    "CRM, Pipeline e Kanban completos",
    "Automações ilimitadas",
    "Base de conhecimento (RAG)",
    "API + Webhooks",
    "Analytics executivo",
    "Suporte prioritário",
  ],
  Pro: [
    "Até 5 agentes",
    "Até 5 usuários",
    "WhatsApp",
    "Helena IA (básico)",
    "CRM e Pipeline",
    "Suporte padrão",
  ],
  Starter: [
    "Até 2 agentes",
    "Até 2 usuários",
    "WhatsApp",
    "Suporte e-mail",
  ],
};

function BillingPage() {
  const db = useDB();
  const plan = db.organization.plan ?? "Scale";
  const aiLimit = db.helenaSettings?.monthlyBudget ?? 800;
  const aiSpent = db.agents.reduce((s, a) => s + a.spent, 0);
  const aiPct = aiLimit > 0 ? Math.min(100, Math.round((aiSpent / aiLimit) * 100)) : 0;

  const invoices = db.invoices ?? [];

  return (
    <div className="space-y-8 max-w-3xl">
      <PageHeader
        eyebrow="Configurações"
        title="Billing"
        description="Seu plano, consumo de IA e histórico de faturas."
      />

      {/* Plano atual */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Sparkles className="size-4 text-primary" /> Plano Atual
        </h2>
        <div className="rounded-xl border bg-gradient-to-br from-card to-primary/5 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xl font-bold">{plan}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Sua conta está em dia.</p>
            </div>
            <Badge className="bg-primary/10 text-primary border-primary/20 px-3 py-1">
              Ativo
            </Badge>
          </div>
          <ul className="grid sm:grid-cols-2 gap-1.5">
            {(PLAN_FEATURES[plan] ?? PLAN_FEATURES["Scale"]!).map((f) => (
              <li key={f} className="flex items-center gap-2 text-xs">
                <CheckCircle2 className="size-3.5 text-success shrink-0" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <div className="flex gap-2 pt-1">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { window.location.href = "/planos"; }}>
              <TrendingUp className="size-3.5" /> Ver todos os planos
            </Button>
            <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground" onClick={() => window.open("https://helena.ai/cancelar", "_blank")}>
              <ExternalLink className="size-3.5" /> Cancelar plano
            </Button>
          </div>
        </div>
      </section>

      {/* Consumo de IA */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Zap className="size-4 text-primary" /> Consumo de IA este mês
        </h2>
        <div className="rounded-xl border p-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Budget mensal de IA</span>
            <span className="font-semibold">{brl(aiSpent)} / {brl(aiLimit)}</span>
          </div>
          <Progress value={aiPct} className={`h-2 ${aiPct > 80 ? "[&>div]:bg-destructive" : aiPct > 60 ? "[&>div]:bg-warning" : ""}`} />
          <p className="text-xs text-muted-foreground">
            {aiPct < 60
              ? `Consumo saudável. Você tem ${brl(aiLimit - aiSpent)} de saldo disponível.`
              : aiPct < 80
              ? `Atenção: ${aiPct}% do orçamento consumido. Monitore os agentes mais ativos.`
              : `Alerta: ${aiPct}% do orçamento. Considere aumentar o limite em IA → Custos.`}
          </p>
        </div>
      </section>

      {/* Faturas */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Receipt className="size-4 text-primary" /> Histórico de Faturas
        </h2>
        {invoices.length === 0 ? (
          <div className="rounded-xl border p-6 text-center text-sm text-muted-foreground">
            Nenhuma fatura gerada ainda.
          </div>
        ) : (
          <div className="rounded-xl border divide-y">
            {invoices.map((inv) => (
              <div key={inv.id} className="flex items-center gap-4 px-4 py-3">
                <CreditCard className="size-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Fatura #{inv.number}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(inv.date).toLocaleDateString("pt-BR")} · {brl(inv.amount)}
                  </p>
                </div>
                <Badge
                  variant={inv.status === "paga" ? "default" : inv.status === "vencida" ? "destructive" : "outline"}
                  className="text-[10px] shrink-0"
                >
                  {inv.status}
                </Badge>
                <Button size="icon" variant="ghost" className="size-7" title="Baixar PDF">
                  <Download className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Método de pagamento */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <CreditCard className="size-4 text-primary" /> Método de Pagamento
        </h2>
        <div className="rounded-xl border p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-lg bg-muted flex items-center justify-center">
              <CreditCard className="size-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">Cartão de crédito</p>
              <p className="text-xs text-muted-foreground">•••• •••• •••• 4242 · Vence 12/27</p>
            </div>
          </div>
          <Button size="sm" variant="outline">Alterar</Button>
        </div>
      </section>
    </div>
  );
}
