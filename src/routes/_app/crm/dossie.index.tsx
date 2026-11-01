import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import { useDB } from "@/lib/store";
import { userAction } from "@/lib/helena/engine";
import { brl } from "@/lib/format";
import { pageHead } from "@/lib/head";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/crm/dossie/")({
  head: () => pageHead("Dossiê comercial", "Diagnóstico, concorrentes, ROI e proposta no mesmo lead."),
  component: DossierListPage,
});

function DossierListPage() {
  const db = useDB();
  const rows = db.commercialDossiers || [];
  const followups = (db.rpaJobs || []).filter((j) => j.kind === "followup" && (j.status === "queued" || j.status === "awaiting_approval"));
  const hot = db.contacts.filter((c) => (c.tags || []).includes("#intencao-quente"));
  const openDeals = db.deals.filter((d) => d.status === "aberto");
  const won = db.deals.filter((d) => d.status === "ganho");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Helena Intelligence"
        description="Um dossiê por oportunidade. Pipeline aberto não é receita. ROI é estimativa. Envio de proposta pede aprovação."
      />
      <div className="grid gap-3 sm:grid-cols-4 text-sm">
        <div className="rounded-xl border bg-card p-4"><div className="text-xs text-muted-foreground">Dossiês</div><div className="font-mono text-2xl">{rows.length}</div></div>
        <div className="rounded-xl border bg-card p-4"><div className="text-xs text-muted-foreground">Intenção quente</div><div className="font-mono text-2xl">{hot.length}</div></div>
        <div className="rounded-xl border bg-card p-4"><div className="text-xs text-muted-foreground">Follow-ups na fila</div><div className="font-mono text-2xl">{followups.length}</div></div>
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground">Aberto vs ganho</div>
          <div className="font-mono text-lg">{openDeals.length} abertas</div>
          <div className="text-[11px] text-muted-foreground">{won.length} fechadas · ponderado ≠ recebido</div>
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Empresa</th>
              <th className="px-4 py-3">Nicho</th>
              <th className="px-4 py-3">Oferta</th>
              <th className="px-4 py-3">Intenção</th>
              <th className="px-4 py-3">ROI cons.</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((d) => {
              const contact = db.contacts.find((c) => c.id === d.contactId);
              const company = db.companies.find((c) => c.id === d.companyId);
              const cons = d.roi.scenarios.find((s) => s.name === "conservador");
              return (
                <tr key={d.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{company?.name || contact?.name}</td>
                  <td className="px-4 py-3 text-xs">{d.nichePlay}</td>
                  <td className="px-4 py-3 text-xs">{d.offer}</td>
                  <td className="px-4 py-3 text-xs">{d.intent}</td>
                  <td className="px-4 py-3 font-mono text-xs">{cons ? `${cons.extraOrders} conv. · ${brl(d.roi.offerPrice)}` : "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <Link to="/crm/dossie/$contactId" params={{ contactId: d.contactId }} className="text-xs underline">Abrir</Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="p-6 text-sm text-muted-foreground">
            Nenhum dossiê ainda. Diagnosticar um lead monta o dossiê automaticamente.{" "}
            <Button
              size="sm"
              variant="outline"
              className="ml-2"
              onClick={() => {
                const c = db.contacts[0];
                if (!c) { toast.error("Cadastre um contato primeiro."); return; }
                const r = userAction("leads.diagnose", { contactId: c.id });
                r.ok ? toast.success(r.message) : toast.error(r.message);
              }}
            >
              Diagnosticar o primeiro contato
            </Button>
          </p>
        )}
      </div>
    </div>
  );
}
