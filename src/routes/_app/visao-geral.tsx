import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Bot, CircleDollarSign, ListChecks, ShieldAlert } from "lucide-react";
import { Dot, EntityAvatar, Panel, ProgressBar, StatCard, Status } from "@/components/app/kit";
import { ApprovalBlock } from "@/components/helena/HelenaCards";
import { HelenaOrb } from "@/components/helena/HelenaOrb";
import { Button } from "@/components/ui/button";
import { currentUser, useDB } from "@/lib/store";
import { computeSummary } from "@/lib/helena/engine";
import { helenaUi, sendToHelena } from "@/lib/helena/orchestrator";
import { brl, greeting } from "@/lib/format";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/_app/visao-geral")({
  head: () => pageHead("Visão geral", "Panorama da operação comercial, agentes de IA e aprovações."),
  component: Home,
});

function Home() {
  const db = useDB();
  const router = useRouter();
  const user = currentUser(db);
  const s = computeSummary(db);
  const proposals = db.deals.filter((d) => d.status === "aberto" && ["st_prop", "st_neg"].includes(d.stageId));
  const attention = [
    s.followupsToday > 0 && `${s.followupsToday} follow-ups vencendo hoje`,
    s.pendingApprovals > 0 && `${s.pendingApprovals} aprovações aguardando você`,
    db.connections.some((c) => c.status === "offline") && "Uma conexão de WhatsApp está offline",
    s.staleDeals > 0 && `${s.staleDeals} oportunidades paradas há mais de 48h`,
  ].filter(Boolean) as string[];
  const ask = (t: string) => { helenaUi.set({ open: true }); void sendToHelena(t); };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-card p-6">
        <h1 className="font-serif text-4xl">{greeting()}, {user.name.split(" ")[0]}.</h1>
        <div className="mt-4 flex items-start gap-3">
          <HelenaOrb className="mt-0.5 size-6" />
          <div className="space-y-2">
            <p className="text-sm"><span className="font-semibold tracking-wider">HELENA</span> · Encontrei {attention.length} situações que merecem sua atenção.</p>
            <ul className="space-y-1 text-sm text-muted-foreground">{attention.map((a) => <li key={a}>• {a}</li>)}</ul>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={() => ask("Quem precisa de follow-up hoje?")}>Ver follow-ups</Button>
              <Button size="sm" variant="outline" onClick={() => ask("Como está o comercial?")}>Como está o comercial?</Button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Leads aguardando follow-up" value={s.followupsToday + s.staleDeals} icon={<ListChecks />} tone="warning" />
        <StatCard label="Propostas abertas" value={brl(proposals.reduce((a, d) => a + d.value, 0))} hint={`${proposals.length} oportunidades`} icon={<CircleDollarSign />} tone="info" />
        <StatCard label="Agentes trabalhando" value={s.workingAgents} hint={`de ${db.agents.length} agentes`} icon={<Bot />} tone="success" />
        <StatCard label="Aprovações aguardando" value={s.pendingApprovals} icon={<ShieldAlert />} tone="helena" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Agentes ativos">
          <ul className="divide-y">
            {db.agents.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-2.5">
                <EntityAvatar name={a.name} color={a.color} agent size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{a.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{a.currentTask || a.objective}</div>
                </div>
                <Dot tone={a.status === "trabalhando" ? "success" : a.status === "pausado" ? "warning" : "neutral"} pulse={a.status === "trabalhando"} />
                <Status value={a.status} />
              </li>
            ))}
          </ul>
        </Panel>
        <div className="space-y-6">
          <Panel title="Operações">
            <ul className="space-y-4">
              {db.operations.filter((o) => o.status !== "failed").slice(0, 5).map((o) => (
                <li key={o.id}>
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="font-medium">{o.title}</span>
                    <span className="flex items-center gap-2"><Status value={o.status} /><span className="font-mono text-xs">{Math.round((o.processed / o.total) * 100)}%</span></span>
                  </div>
                  <ProgressBar value={(o.processed / o.total) * 100} tone={o.status === "completed" ? "success" : "helena"} />
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Aprovações">
            <div className="space-y-3">
              {db.approvals.filter((a) => a.status === "pendente").map((a) => <div key={a.id} className="rounded-lg border p-3"><ApprovalBlock approvalId={a.id} /></div>)}
              {s.pendingApprovals === 0 && <p className="text-sm text-muted-foreground">Nenhuma aprovação pendente.</p>}
            </div>
          </Panel>
        </div>
      </div>
      <div className="hidden">{router.state.location.pathname}</div>
    </div>
  );
}
