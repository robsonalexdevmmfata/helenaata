import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Pause, Play, ShieldAlert, Sparkles, Target } from "lucide-react";
import { EmptyState, PageHeader, ProgressBar, StatCard, Status } from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDB } from "@/lib/store";
import { userAction } from "@/lib/helena/engine";
import { helenaUi, sendToHelena } from "@/lib/helena/orchestrator";
import { agentCouncil, companyBriefing, crisisState, loadBalanceHint, missionProgress, promiseConflicts } from "@/lib/helena/command";
import { alwaysOnTruth, watchdogScan } from "@/lib/helena/always-on";
import { pageHead } from "@/lib/head";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/comando")({
  head: () => pageHead("Mission Control", "Helena orquestra missões, times e riscos com o cadastro real."),
  component: CommandPage,
});

function CommandPage() {
  const db = useDB();
  const [objective, setObjective] = useState("Analise minha operação e organize o Time Comercial");
  const briefing = companyBriefing(db);
  const council = agentCouncil(db, objective);
  const crisis = crisisState(db);
  const conflicts = promiseConflicts(db);
  const missions = db.missions || [];
  const running = missions.filter((m) => m.status === "running").length;
  const waiting = missions.filter((m) => m.status === "awaiting_approval").length;

  const plan = () => {
    const r = userAction("missions.plan", { title: objective.slice(0, 80), objective, targetValue: 20 });
    r.ok ? toast.success(r.message) : toast.error(r.message);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Helena"
        title="Mission Control"
        description="Helena orquestra os agentes que já existem. Missão vira plano rastreável — sem taxa de conversão inventada e sem times fictícios."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => { helenaUi.set({ open: true }); void sendToHelena("Como está minha empresa hoje?"); }}>Como está minha empresa?</Button>
            <Button onClick={() => { helenaUi.set({ open: true }); void sendToHelena("Helena, analise minha operação, identifique o que está errado, organize as equipes e me apresente um plano."); }} className="gap-2">
              <Sparkles className="size-4" /> Pedir plano à Helena
            </Button>
          </div>
        }
      />

      {(() => {
        const on = alwaysOnTruth();
        const wd = watchdogScan(db);
        return (
          <div className="rounded-2xl border bg-card p-4">
            <div className="text-xs uppercase tracking-[0.16em] text-helena">Always on — o que é verdade</div>
            <p className="mt-1 text-sm text-muted-foreground">{on.note}</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2 text-sm">
              <div>
                <div className="font-medium">Com o navegador fechado</div>
                <ul className="mt-1 space-y-1 text-muted-foreground">{on.withBrowserClosed.map((t) => <li key={t}>• {t}</li>)}</ul>
              </div>
              <div>
                <div className="font-medium">Ainda no painel</div>
                <ul className="mt-1 space-y-1 text-muted-foreground">{on.needsPanel.map((t) => <li key={t}>• {t}</li>)}</ul>
              </div>
            </div>
            {wd.length > 0 && (
              <ul className="mt-3 text-sm text-destructive">{wd.map((a) => <li key={a.code}>{a.detail}</li>)}</ul>
            )}
          </div>
        );
      })()}

      {crisis.active && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold"><ShieldAlert className="size-4" /> Modo crise</div>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {crisis.reasons.map((r) => <li key={r}>• {r}</li>)}
          </ul>
          <p className="mt-2 text-sm">{crisis.plan[0]}</p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Missões em execução" value={running} tone="info" icon={<Target />} />
        <StatCard label="Aguardando aprovação" value={waiting} tone="helena" icon={<Sparkles />} />
        <StatCard label="Quentes / risco" value={`${briefing.highlights.find((h) => h.label === "Quentes")?.value || 0} / ${briefing.highlights.find((h) => h.label.includes("Risco"))?.value || 0}`} />
        <StatCard label="Cota hoje" value={briefing.highlights.find((h) => h.label === "Cota hoje")?.value || "—"} />
      </div>

      <div className="rounded-2xl border bg-card p-4">
        <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Novo objetivo</div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Input value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="Ex.: conquistar 20 clientes sem site em São Paulo" />
          <Button onClick={plan} className="shrink-0">Planejar missão</Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">O plano usa o Time Comercial (Marina, Camila, Rafael, André). Início na fila RPA só depois de aprovação e com nicho + cidade.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border bg-card p-4 space-y-2">
          <h2 className="text-sm font-semibold">Briefing</h2>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{briefing.text}</p>
        </div>
        <div className="rounded-2xl border bg-card p-4 space-y-3">
          <h2 className="text-sm font-semibold">Conselho de agentes</h2>
          <p className="text-sm">{council.recommendation}</p>
          {council.seats.map((s) => (
            <div key={s.team} className="rounded-lg border px-3 py-2">
              <div className="flex justify-between text-sm">
                <span className="font-medium">{s.team} · {s.agent}</span>
                <span className="font-mono text-xs uppercase text-muted-foreground">{s.stance}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{s.evidence}</p>
            </div>
          ))}
          <p className="text-[11px] text-muted-foreground">{council.note}</p>
        </div>
      </div>

      {conflicts.length > 0 && (
        <div className="rounded-2xl border bg-card p-4">
          <h2 className="text-sm font-semibold">Detector de promessas</h2>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {conflicts.map((c) => <li key={c.title}>• {c.title} — {c.detail}</li>)}
          </ul>
        </div>
      )}

      <p className="text-xs text-muted-foreground">{loadBalanceHint(db)}</p>

      {missions.length === 0 ? (
        <EmptyState icon={<Target />} title="Nenhuma missão" description="Peça à Helena um objetivo ou planeje acima. Operações pontuais continuam em Operações e na Central RPA." />
      ) : (
        <div className="space-y-3">
          {missions.map((m) => {
            const snap = missionProgress(db, m);
            const tasks = (db.missionTasks || []).filter((t) => t.missionId === m.id);
            const events = (db.missionEvents || []).filter((e) => e.missionId === m.id).slice(0, 4);
            const pct = m.targetValue ? Math.min(100, Math.round((snap.current / m.targetValue) * 100)) : 0;
            const agents = db.agents.filter((a) => m.agentIds.includes(a.id)).map((a) => a.name);
            return (
              <div key={m.id} className="rounded-xl border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{m.code}</span>
                      <Status value={m.status} />
                    </div>
                    <h3 className="mt-1 font-medium">{m.title}</h3>
                    <p className="text-sm text-muted-foreground">{m.objective}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{m.strategy}</p>
                  </div>
                  <div className="flex gap-2">
                    {m.status === "awaiting_approval" && (
                      <Button size="sm" onClick={() => {
                        const r = userAction("missions.start", { missionId: m.id });
                        r.ok ? toast.success(r.message) : toast.error(r.message);
                      }}><Play /> Iniciar</Button>
                    )}
                    {m.status === "running" && (
                      <Button size="sm" variant="outline" onClick={() => {
                        const r = userAction("missions.pause", { missionId: m.id });
                        r.ok ? toast.success(r.message) : toast.error(r.message);
                      }}><Pause /> Pausar</Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => {
                      const r = userAction("helena.replay", { missionId: m.id });
                      r.ok ? toast.success("Replay no cadastro — abra o chat da Helena para o texto completo.") : toast.error(r.message);
                      helenaUi.set({ open: true });
                      void sendToHelena(`Replay da missão ${m.code}`);
                    }}>Replay</Button>
                  </div>
                </div>
                <div className="mt-4">
                  <ProgressBar value={pct} tone={m.status === "completed" ? "success" : "helena"} />
                  <div className="mt-1 flex justify-between font-mono text-[11px] text-muted-foreground">
                    <span>{snap.current} / {m.targetValue} {m.targetMetric} (cadastro, não simulação)</span>
                    <span>Custo IA dos agentes: {snap.cost.toFixed(2)}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                    <span>Prospects novos: {snap.prospects}</span>
                    <span>Contatados: {snap.contacted}</span>
                    <span>Diagnósticos: {snap.diagnosed}</span>
                    <span>Reuniões: {snap.meetings}</span>
                    <span>Times: {agents.join(", ") || "Comercial"}</span>
                  </div>
                </div>
                <ol className="mt-3 space-y-1 text-xs">
                  {tasks.map((t) => (
                    <li key={t.id} className="flex justify-between gap-2">
                      <span>{t.title}</span>
                      <span className="font-mono text-muted-foreground">{t.status}</span>
                    </li>
                  ))}
                </ol>
                {events.length > 0 && (
                  <ul className="mt-3 border-t pt-2 text-[11px] text-muted-foreground">
                    {events.map((e) => <li key={e.id}>{e.actor}: {e.text}</li>)}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Operações pontuais: <Link to="/operacoes" className="underline">Operações</Link>
        {" · "}
        Fila: <Link to="/rpa" className="underline">Central RPA</Link>
        . Voz, gêmeo digital e auditor de código ficam fora — a Helena não finge o que não orquestra.
      </p>
    </div>
  );
}
