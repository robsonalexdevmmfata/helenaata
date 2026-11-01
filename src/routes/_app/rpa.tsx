import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AlertTriangle, Clock, RefreshCw, Rocket, Workflow } from "lucide-react";
import { PageHeader, StatCard, Status } from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDB } from "@/lib/store";
import { userAction } from "@/lib/helena/engine";
import { rpaMonitor } from "@/lib/rpa/center";
import { pageHead } from "@/lib/head";
import { toast } from "sonner";
import { timeAgo } from "@/lib/format";

export const Route = createFileRoute("/_app/rpa")({
  head: () => pageHead("Central RPA", "Fila persistente: pendente, execução, falha e reprocessamento."),
  component: RpaCenterPage,
});

function RpaCenterPage() {
  const db = useDB();
  const mon = rpaMonitor(db);
  const [segment, setSegment] = useState(db.radarSchedules[0]?.segment || "pizzaria");
  const [city, setCity] = useState(db.radarSchedules[0]?.city || "Campinas");
  const jobs = [...(db.rpaJobs || [])].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 40);
  const reports = db.dailyReports || [];
  const proposals = db.commercialProposals || [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operação"
        title="Central RPA"
        description="Tarefas sobrevivem ao fechar o navegador. Falha fica registrada e pode ser reprocessada. Sem disparo em massa."
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Na fila" value={mon.queued} tone="info" icon={<Clock />} />
        <StatCard label="Em execução" value={mon.running} tone="helena" icon={<Rocket />} />
        <StatCard label="Falhas" value={mon.failed} tone="danger" icon={<AlertTriangle />} />
        <StatCard label="Tempo médio" value={`${mon.avgMs}ms`} hint={mon.alert} icon={<Workflow />} />
      </div>
      <p className="text-xs text-muted-foreground">
        Última: {mon.lastAt ? timeAgo(mon.lastAt) : "—"} · Próxima: {mon.nextAt ? new Date(mon.nextAt).toLocaleString("pt-BR") : "—"}
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
          <h2 className="font-serif text-xl">Radar programado</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Nicho</Label><Input value={segment} onChange={(e) => setSegment(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Cidade</Label><Input value={city} onChange={(e) => setCity(e.target.value)} /></div>
          </div>
          <Button
            className="gap-2"
            onClick={() => {
              const r = userAction("rpa.radar_schedule", { segment, city, simulate: true });
              r.ok ? toast.success(r.message) : toast.error(r.message);
            }}
          >
            Agendar varredura
          </Button>
          {db.radarSchedules[0] && (
            <p className="text-xs text-muted-foreground">
              Ativo: {db.radarSchedules[0].segment} · {db.radarSchedules[0].city} · {db.radarSchedules[0].hour}h
            </p>
          )}
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
          <h2 className="font-serif text-xl">Relatório do dia</h2>
          <Button
            variant="outline"
            onClick={() => {
              const r = userAction("rpa.daily_report", {});
              r.ok ? toast.success(r.message) : toast.error(r.message);
            }}
          >
            Gerar agora
          </Button>
          {reports[0] && <pre className="whitespace-pre-wrap text-xs text-muted-foreground">{reports[0].body}</pre>}
        </div>
      </div>

      {proposals.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-serif text-xl">Propostas</h2>
          <ul className="mt-3 divide-y">
            {proposals.slice(0, 8).map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span>{p.title} · v{p.version} · {p.offer}</span>
                <span className="flex items-center gap-2">
                  <Status value={p.status} />
                  {p.status !== "enviada" && (
                    <Button size="sm" variant="outline" onClick={() => {
                      const r = userAction("sales.send_proposal", { proposalId: p.id });
                      r.ok ? toast.success(r.message) : toast.error(r.message);
                    }}>Pedir envio</Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="p-3">Tarefa</th>
              <th className="p-3">Lead</th>
              <th className="p-3">Quando</th>
              <th className="p-3">Tentativas</th>
              <th className="p-3">Status</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 && (
              <tr><td className="p-4 text-muted-foreground" colSpan={6}>Nenhuma tarefa ainda. Agende o radar ou rode o expediente.</td></tr>
            )}
            {jobs.map((j) => {
              const lead = db.contacts.find((c) => c.id === j.contactId);
              return (
                <tr key={j.id} className="border-t border-border">
                  <td className="p-3 font-medium">{j.kind}</td>
                  <td className="p-3 text-muted-foreground">{lead?.name || "—"}</td>
                  <td className="p-3 text-muted-foreground">{new Date(j.runAt).toLocaleString("pt-BR")}</td>
                  <td className="p-3">{j.attempts}/{j.maxAttempts}</td>
                  <td className="p-3"><Status value={j.status} /></td>
                  <td className="p-3 text-right">
                    {(j.status === "failed" || j.status === "skipped") && (
                      <Button size="sm" variant="ghost" className="gap-1" onClick={() => {
                        const r = userAction("rpa.retry_job", { jobId: j.id });
                        r.ok ? toast.success(r.message) : toast.error(r.message);
                      }}>
                        <RefreshCw className="size-3" /> Reprocessar
                      </Button>
                    )}
                    {j.error && <div className="text-[10px] text-destructive">{j.error}</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
