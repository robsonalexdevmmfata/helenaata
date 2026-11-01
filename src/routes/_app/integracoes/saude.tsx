import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, ShieldAlert } from "lucide-react";
import { PageHeader, StatCard, Status } from "@/components/app/kit";
import { useDB } from "@/lib/store";
import { integrationHealth } from "@/lib/helena/reliability";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/_app/integracoes/saude")({
  head: () => pageHead("Saúde das integrações", "WhatsApp, fila RPA e circuit breaker desta organização."),
  component: HealthPage,
});

function HealthPage() {
  const db = useDB();
  const h = integrationHealth(db);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Integrações"
        title="Saúde das integrações"
        description="O que o cadastro e a fila mostram agora. Credenciais não aparecem. Sem inventar uptime."
      />

      {h.circuitOpen && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
          <ShieldAlert className="mt-0.5 size-4" />
          Circuito aberto: a Helena não dispara lote novo até o WhatsApp voltar, o kill switch sair ou as falhas RPA serem reprocessadas uma a uma.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Kill switch" value={h.killSwitch ? "ligado" : "desligado"} tone={h.killSwitch ? "warning" : "success"} />
        <StatCard label="Circuito" value={h.circuitOpen ? "aberto" : "fechado"} tone={h.circuitOpen ? "warning" : "info"} />
        <StatCard label="RPA na fila" value={h.rpa.queued} />
        <StatCard label="RPA com falha" value={h.rpa.failed} tone={h.rpa.failed ? "warning" : "neutral"} />
      </div>

      <div className="rounded-xl border bg-card p-4">
        <h2 className="text-sm font-semibold">WhatsApp (conexões desta conta)</h2>
        {h.whatsapp.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Nenhuma conexão no cadastro.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {h.whatsapp.map((c) => (
              <li key={c.name} className="flex flex-wrap items-center justify-between gap-2 border-b py-2 last:border-0">
                <span>{c.name}</span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Status value={c.status} /> fila {c.queue} · hoje {c.sentToday}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Status público do servidor: <Link to="/status" className="underline">/status</Link>
          {" · "}
          Fila: <Link to="/rpa" className="underline">Central RPA</Link>
        </p>
      </div>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Activity className="size-3.5" /> {h.note} Aprovações pendentes: {h.pendingApprovals}.
      </p>
    </div>
  );
}
