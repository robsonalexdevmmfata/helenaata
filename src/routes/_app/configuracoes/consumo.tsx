import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/kit";
import { useDB } from "@/lib/store";
import { consumptionSnapshot, territorySnapshot, adaptiveLearning } from "@/lib/helena/decision";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/_app/configuracoes/consumo")({
  head: () => pageHead("Consumo", "Limites e uso real desta conta."),
  component: ConsumoPage,
});

function ConsumoPage() {
  const db = useDB();
  const c = consumptionSnapshot(db);
  const t = territorySnapshot(db);
  const learn = adaptiveLearning(db);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Central de consumo"
        description="Leads, diagnósticos e execuções desta organização. Zero se nada rodou hoje."
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4"><div className="text-xs text-muted-foreground">Leads hoje</div><div className="font-mono text-2xl">{c.used}/{c.limit}</div></div>
        <div className="rounded-xl border bg-card p-4"><div className="text-xs text-muted-foreground">Diagnósticos hoje</div><div className="font-mono text-2xl">{c.dxToday}</div></div>
        <div className="rounded-xl border bg-card p-4"><div className="text-xs text-muted-foreground">Execuções hoje</div><div className="font-mono text-2xl">{c.execToday}</div></div>
        <div className="rounded-xl border bg-card p-4"><div className="text-xs text-muted-foreground">RPA hoje</div><div className="font-mono text-2xl">{c.rpa}</div></div>
        <div className="rounded-xl border bg-card p-4"><div className="text-xs text-muted-foreground">WhatsApp (execuções send)</div><div className="font-mono text-2xl">{c.msgs}</div></div>
        <div className="rounded-xl border bg-card p-4"><div className="text-xs text-muted-foreground">Dossiês</div><div className="font-mono text-2xl">{c.dossiers}</div></div>
      </div>
      <p className="text-xs text-muted-foreground">{c.note} Trial 30/dia · pago 150/dia. Time Dev não sobe cota.</p>
      <div className="rounded-xl border bg-card p-5">
        <h2 className="text-sm font-semibold">Território no cadastro</h2>
        <p className="mt-1 text-[11px] text-muted-foreground">{t.note}</p>
        <ul className="mt-3 space-y-1 text-sm">
          {t.rows.map((r) => <li key={r.label}>{r.label}: {r.n}</li>)}
        </ul>
      </div>
      <div className="rounded-xl border bg-card p-5">
        <h2 className="text-sm font-semibold">Aprendizado desta conta</h2>
        <p className="mt-1 text-sm text-muted-foreground">{learn.note}</p>
        {learn.patterns.map((p) => (
          <p key={p.actionId} className="text-xs">{p.actionId}: {p.won} ganhos / {p.lost} perdas</p>
        ))}
      </div>
      <p className="text-xs"><Link to="/planos" className="underline">Planos</Link> · Impulso R$ 70 · Máquina R$ 140</p>
    </div>
  );
}
