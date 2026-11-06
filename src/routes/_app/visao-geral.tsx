import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Bot, CircleDollarSign, ListChecks, ShieldAlert } from "lucide-react";
import { Dot, EntityAvatar, Panel, ProgressBar, StatCard, Status } from "@/components/app/kit";
import { ApprovalBlock } from "@/components/helena/HelenaCards";
import { HelenaOrb } from "@/components/helena/HelenaOrb";
import { Button } from "@/components/ui/button";
import { currentUser, useDB } from "@/lib/store";
import { canUseDevTeam, dailyLimitFor, isPlatformAdmin, prospectsUsedToday } from "@/lib/saas";
import { ActivateMaquinaButton } from "@/components/saas/ActivateMaquinaButton";
import { computeSummary } from "@/lib/helena/engine";
import { liveBoard, liveAgentStats } from "@/lib/analytics";
import { CycleStrip, FunnelBars, GlowPie, WeekActivityChart } from "@/components/app/CommercialCharts";
import { commandCenter, intelligenceForLead } from "@/lib/helena/intelligence";
import { userAction } from "@/lib/helena/engine";
import { toast } from "sonner";
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
  const board = liveBoard(db);
  const agentsLive = liveAgentStats(db);
  const proposals = db.deals.filter((d) => d.status === "aberto" && ["st_prop", "st_neg"].includes(d.stageId));
  const attention = [
    board.waitingCount > 0 && `${board.waitingCount} conversas no Inbox esperando resposta`,
    s.followupsToday > 0 && `${s.followupsToday} follow-ups vencendo hoje`,
    s.pendingApprovals > 0 && `${s.pendingApprovals} aprovações aguardando você`,
    db.connections.some((c) => c.status === "offline") && "Uma conexão de WhatsApp está offline",
    s.staleDeals > 0 && `${s.staleDeals} oportunidades paradas há mais de 48h`,
  ].filter(Boolean) as string[];
  const ask = (t: string) => { helenaUi.set({ open: true }); void sendToHelena(t); };
  const cycled = db.contacts.filter((c) => (c.tags || []).some((t) => t.startsWith("#ciclo-") && t !== "#ciclo-encontrado"));
  const intelPool = (cycled.length ? cycled : [...db.contacts].sort((a, b) => b.score - a.score)).slice(0, 3);
  const intelLeads = intelPool.map((c) => intelligenceForLead(db, c));
  const cc = commandCenter(db);
  const quotaUsed = prospectsUsedToday(user);
  const quotaLimit = dailyLimitFor(user);
  const funnelRows = board.dealsByStage
    .filter((s) => s.stage.id !== "st_perdido")
    .map((s) => ({ name: s.stage.name, count: s.count, value: s.value }));

  return (
    <div className="space-y-6">
      {!isPlatformAdmin(user) && !canUseDevTeam(user) && (
        <div className="flex flex-col gap-3 rounded-2xl border border-helena/40 bg-helena/8 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold">Time Dev (site + cardápio) está no plano Máquina</p>
            <p className="mt-1 text-xs text-muted-foreground">
              No trial o comercial roda com 150 leads/dia (2 dias). Impulso mantém 150; Máquina sobe para 1000 multi-cidade. Leads e conversas ficam salvos — sem reabordar o mesmo número.
            </p>
          </div>
          <ActivateMaquinaButton user={user} className="shrink-0" />
        </div>
      )}
      <div className="rounded-2xl border bg-card p-6">
        <h1 className="font-serif text-3xl sm:text-4xl">{greeting()}, {user.name.split(" ")[0]}.</h1>
        <div className="mt-4 flex items-start gap-3">
          <HelenaOrb className="mt-0.5 size-6" />
          <div className="space-y-2">
            <p className="text-sm"><span className="font-semibold tracking-wider">HELENA</span> · Encontrei {attention.length} situações que merecem sua atenção.</p>
            <ul className="space-y-1 text-sm text-muted-foreground">{attention.map((a) => <li key={a}>• {a}</li>)}</ul>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={() => ask("Quem precisa de follow-up hoje?")}>Ver follow-ups</Button>
              <Button size="sm" variant="outline" onClick={() => ask("Como está o comercial?")}>Como está o comercial?</Button>
              <Button size="sm" variant="outline" onClick={() => ask("Como está minha empresa hoje?")}>Como está minha empresa?</Button>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-helena/30 bg-gradient-to-br from-helena/10 via-card to-card p-5">
        <div className="text-xs uppercase tracking-[0.18em] text-helena">Command Center</div>
        <p className="mt-1 text-sm text-muted-foreground">Contagens do CRM e dos dossiês — zero se ainda não rodou.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-xl border border-white/5 bg-background/40 p-3"><div className="text-[11px] text-muted-foreground">Leads hoje</div><div className="font-mono text-xl">{quotaUsed}/{quotaLimit}</div></div>
          <div className="rounded-xl border border-white/5 bg-background/40 p-3"><div className="text-[11px] text-muted-foreground">Ações de hoje</div><div className="font-mono text-xl">{cc.today.length}</div></div>
          <div className="rounded-xl border border-white/5 bg-background/40 p-3"><div className="text-[11px] text-muted-foreground">Propostas à espera</div><div className="font-mono text-xl">{cc.waiting}</div></div>
          <div className="rounded-xl border border-white/5 bg-background/40 p-3"><div className="text-[11px] text-muted-foreground">Intenção quente</div><div className="font-mono text-xl">{cc.hot}</div></div>
          <div className="rounded-xl border border-white/5 bg-background/40 p-3"><div className="text-[11px] text-muted-foreground">Esfriando</div><div className="font-mono text-xl">{cc.cooling}</div></div>
        </div>
        {cc.today.length > 0 && (
          <ul className="mt-4 space-y-2">
            {cc.today.map((row) => (
              <li key={row.contactId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-background/30 px-3 py-2 text-sm">
                <span><strong>{row.name}</strong> — {row.action.label}</span>
                {row.action.tool && (
                  <Button size="sm" variant="outline" onClick={() => {
                    const r = userAction(row.action.tool!, row.action.params || {});
                    r.ok ? toast.success(r.message) : toast.error(r.message);
                  }}>Executar</Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {cc.winning.length > 0 && (
          <p className="mt-3 text-[11px] text-muted-foreground">
            Ofertas em deals ganhos: {cc.winning.map((w) => `${w.name} (${w.n})`).join(" · ")}
          </p>
        )}
        <p className="mt-3 text-sm">Saúde: <strong>{cc.health.label}</strong> — {cc.health.detail}</p>
        {cc.recover.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
            {cc.recover.slice(0, 5).map((r) => (
              <li key={r.contactId}>
                <Link className="underline" to="/crm/dossie/$contactId" params={{ contactId: r.contactId }}>{r.name}</Link>
                {" "}— {r.why}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="WhatsApp hoje" value={board.msgsToday} hint={board.qrOnline ? `${board.qrOnline} linha online` : "QR ainda não lido"} icon={<ListChecks />} tone="info" />
        <StatCard label="Responderam" value={board.responderam} hint={`${board.waitingCount} aguardando o time`} icon={<Bot />} tone="success" />
        <StatCard label="Reuniões na Agenda" value={board.meetings.length} hint={`${board.rpaToday} expedientes RPA hoje`} icon={<CircleDollarSign />} tone="helena" />
        <StatCard label="Pipeline aberto" value={brl(board.pipelineValue)} hint={`${proposals.length} em proposta/negociação`} icon={<ShieldAlert />} tone="warning" />
      </div>
      <CycleStrip cycle={board.cycle} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border bg-card p-5">
          <div className="mb-1 text-sm font-semibold">Atividade da semana</div>
          <p className="mb-3 text-[11px] text-muted-foreground">WhatsApp e diagnósticos reais das execuções — se estiver zerado, nada saiu ainda.</p>
          <WeekActivityChart data={board.week} />
        </div>
        <div className="rounded-2xl border bg-card p-5">
          <div className="mb-1 flex items-center justify-between">
            <div className="text-sm font-semibold">Funil em valor</div>
            <span className="font-mono text-[11px] text-muted-foreground">ponderado {brl(board.weightedPipeline)}</span>
          </div>
          <p className="mb-3 text-[11px] text-muted-foreground">Contagem por etapa × valor aberto. Ponderado = valor × probabilidade.</p>
          <FunnelBars rows={funnelRows} />
        </div>
        <div className="rounded-2xl border bg-card p-5">
          <div className="mb-1 text-sm font-semibold">Temperatura dos dossiês</div>
          <p className="mb-3 text-[11px] text-muted-foreground">Pizza com o que está no cadastro. Sem dossiê, fica vazia.</p>
          <GlowPie data={cc.temps} />
        </div>
      </div>

      {intelLeads.length > 0 && (
        <div className="rounded-2xl border bg-card p-5">
          <div className="mb-1 text-sm font-semibold">Helena Intelligence · radar de oportunidade</div>
          <p className="mb-4 text-[11px] text-muted-foreground">
            Hipóteses comerciais a partir de evidência pública do cadastro. Números de “dinheiro perdido” são estimativas, nunca faturamento comprovado.
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            {intelLeads.map((row) => (
              <div key={row.contact.id} className="rounded-xl border border-border/80 bg-muted/20 p-4">
                <div className="text-sm font-medium">{row.company?.name || row.contact.name}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">{row.contact.tags?.filter((t) => t.startsWith("#ciclo-")).join(" · ") || "sem ciclo"}</div>
                <ul className="mt-3 space-y-2">
                  {row.leaks.slice(0, 2).map((l) => (
                    <li key={l.code} className="text-xs">
                      <span className="font-medium">{l.label}</span>
                      <span className="mt-0.5 block text-muted-foreground">{l.estimateHint}</span>
                    </li>
                  ))}
                  {row.leaks.length === 0 && <li className="text-xs text-muted-foreground">Sem lacuna óbvia no cadastro.</li>}
                </ul>
                <p className="mt-3 text-[11px] leading-snug text-muted-foreground">{row.rival.line}</p>
                <p className="mt-2 text-[11px] leading-snug">{row.roi.line}</p>
                <Link to="/crm/dossie/$contactId" params={{ contactId: row.contact.id }} className="mt-3 inline-block text-[11px] underline">Abrir dossiê</Link>
              </div>
            ))}
          </div>
        </div>
      )}
      {board.msgsToday === 0 && board.qrOnline === 0 && (
        <p className="text-sm text-muted-foreground">
          Zero teatro: se o QR não foi lido e nenhuma mensagem saiu, os números ficam zero.{" "}
          <button type="button" className="underline" onClick={() => router.history.push("/comecar")}>Ligar Linha Helena</button>
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Agentes ativos">
          <ul className="divide-y">
            {db.agents.filter((a) => a.teamId === "t_com").map((a) => {
              const st = agentsLive.find((x) => x.id === a.id);
              return (
              <li key={a.id} className="flex items-center gap-3 py-2.5">
                <EntityAvatar name={a.name} color={a.color} agent size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{a.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{a.currentTask || a.objective}</div>
                  <div className="text-[10px] text-muted-foreground">{st?.conversations ?? 0} conv. · {st?.meetings ?? 0} reun. · {st?.outbound ?? 0} disparos</div>
                </div>
                <Dot tone={a.status === "trabalhando" ? "success" : a.status === "pausado" ? "warning" : "neutral"} pulse={a.status === "trabalhando"} />
                <Status value={a.status} />
              </li>
              );
            })}
          </ul>
        </Panel>
        <div className="space-y-6">
          <Panel title="Operações">
            <ul className="space-y-4">
              {(db.operations.filter((o) => o.id === "op_live_maps" || o.status === "running").slice(0, 5)).map((o) => (
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
