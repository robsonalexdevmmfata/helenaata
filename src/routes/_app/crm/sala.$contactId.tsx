import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useDB } from "@/lib/store";
import { userAction } from "@/lib/helena/engine";
import { commercialScope } from "@/lib/helena/decision";
import { brl } from "@/lib/format";
import { pageHead } from "@/lib/head";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/crm/sala/$contactId")({
  head: () => pageHead("Sala de negociação", "Diagnóstico, catálogo e proposta no mesmo lead."),
  component: DealRoomPage,
});

function DealRoomPage() {
  const { contactId } = Route.useParams();
  const db = useDB();
  const dossier = (db.commercialDossiers || []).find((d) => d.contactId === contactId);
  const contact = db.contacts.find((c) => c.id === contactId);
  const company = db.companies.find((c) => c.id === (dossier?.companyId || contact?.companyId));
  const preview = db.sitePreviews?.find((p) => p.companyId === company?.id);
  const proposal = db.commercialProposals?.find((p) => p.contactId === contactId);
  const offer = db.serviceOffers?.find((o) => o.id === dossier?.matchedOffers?.[0]?.offerId);

  if (!contact) {
    return <p className="text-sm text-muted-foreground">Lead não encontrado. <Link to="/crm/dossie" className="underline">Voltar</Link></p>;
  }

  const act = (name: string, params: Record<string, unknown>) => {
    const r = userAction(name, params);
    r.ok ? toast.success(r.message) : toast.error(r.message);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link to="/crm/dossie/$contactId" params={{ contactId }} className="text-xs underline">← Dossiê</Link>
      <h1 className="font-serif text-3xl">{company?.name || contact.name}</h1>
      <p className="text-sm text-muted-foreground">Sala interna desta conta. Visualização e aceite são do assinante — não é portal público do cliente.</p>

      {!dossier && <Button onClick={() => act("intelligence.build_dossier", { contactId })}>Montar dossiê</Button>}

      {dossier && (
        <>
          <section className="rounded-2xl border bg-card p-5">
            <div className="text-[11px] uppercase tracking-widest text-helena">Diagnóstico</div>
            <p className="mt-2 text-sm">{dossier.approach}</p>
            <ul className="mt-3 space-y-1 text-sm">
              {dossier.evidence.map((e) => (
                <li key={e.code}><strong>{e.label}</strong> ({e.kind}): {e.observation}</li>
              ))}
            </ul>
          </section>
          <section className="rounded-2xl border bg-card p-5">
            <div className="text-[11px] uppercase tracking-widest text-helena">Antes / depois</div>
            <p className="mt-2 text-sm">Antes: {dossier.evidence.find((e) => e.code === "site")?.kind === "observed" ? "site observado no cadastro" : "site não encontrado nesta coleta"}.</p>
            <p className="text-sm">Depois: {preview ? `prévia ${preview.previewPath || preview.slug}` : "ainda não há prévia (Time Dev no Máquina)."}</p>
          </section>
          <section className="rounded-2xl border bg-card p-5">
            <div className="text-[11px] uppercase tracking-widest text-helena">Serviços do catálogo</div>
            <ul className="mt-2 space-y-2 text-sm">
              {(dossier.matchedOffers || []).map((o) => (
                <li key={o.offerId}><strong>{o.name}</strong> · {brl(o.price)} · fit {o.fitScore} — {o.why}</li>
              ))}
            </ul>
            {offer && (
              <div className="mt-3 text-xs text-muted-foreground">
                Incluso: {commercialScope(offer).included.join(" ")}
                <div>Fora: {commercialScope(offer).excluded[0]}</div>
                <div>{commercialScope(offer).revisionsNote}</div>
              </div>
            )}
          </section>
          <section className="rounded-2xl border bg-card p-5 space-y-3">
            <div className="text-[11px] uppercase tracking-widest text-helena">Proposta</div>
            {!proposal && <Button onClick={() => act("sales.draft_proposal", { contactId })}>Gerar proposta</Button>}
            {proposal && (
              <>
                <p className="text-sm">{proposal.title} · v{proposal.version} · {proposal.status} · {brl(proposal.amount)}</p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{proposal.scope}</p>
                {proposal.status !== "aceita" && (
                  <Button onClick={() => act("sales.accept_proposal", { proposalId: proposal.id })}>Registrar aceite no CRM</Button>
                )}
                {proposal.status === "rascunho" || proposal.status === "aguardando" ? (
                  <Button variant="outline" onClick={() => act("sales.send_proposal", { proposalId: proposal.id })}>Pedir aprovação para enviar</Button>
                ) : null}
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
