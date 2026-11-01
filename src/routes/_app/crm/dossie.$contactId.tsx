import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { currentUser, useDB } from "@/lib/store";
import { userAction } from "@/lib/helena/engine";
import { detectBuyIntent, leadTemperature, nextBestAction, opportunityRisk } from "@/lib/helena/intelligence";
import { qualityIssues, simulateOpportunities } from "@/lib/helena/decision";
import { canUseDevTeam } from "@/lib/saas";
import { brl, fmtDateTime } from "@/lib/format";
import { pageHead } from "@/lib/head";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/crm/dossie/$contactId")({
  head: () => pageHead("Dossiê", "Apresentação comercial da oportunidade."),
  component: DossierDetailPage,
});

function DossierDetailPage() {
  const { contactId } = Route.useParams();
  const db = useDB();
  const [ticket, setTicket] = useState("");
  const dossier = (db.commercialDossiers || []).find((d) => d.contactId === contactId);
  const contact = db.contacts.find((c) => c.id === contactId);
  const company = db.companies.find((c) => c.id === (dossier?.companyId || contact?.companyId));
  const preview = db.sitePreviews?.find((p) => p.id === dossier?.previewId || p.companyId === company?.id);
  const proposal = db.commercialProposals?.find((p) => p.id === dossier?.proposalId || p.contactId === contactId);
  const follow = (db.rpaJobs || []).filter((j) => j.contactId === contactId && j.kind === "followup");
  const liveIntent = dossier?.intent || detectBuyIntent(db, contactId);
  const liveTemp = dossier?.temperature || (contact ? leadTemperature(contact, proposal, liveIntent) : undefined);
  const liveRisk = dossier?.risk || (contact ? opportunityRisk(contact, proposal) : undefined);
  const liveNext = dossier?.nextAction || (contact
    ? nextBestAction({
        contact,
        intent: liveIntent,
        proposal: proposal ? { id: proposal.id, status: proposal.status } : undefined,
        previewId: preview?.id,
        hasDevTeam: canUseDevTeam(currentUser(db)),
      })
    : undefined);

  if (!contact) {
    return <p className="text-sm text-muted-foreground">Contato não encontrado. <Link to="/crm/dossie" className="underline">Voltar</Link></p>;
  }

  const act = (name: string, params: Record<string, unknown>) => {
    const r = userAction(name, params);
    r.ok ? toast.success(r.message) : toast.error(r.message);
  };
  const runNext = () => {
    if (!liveNext?.tool) return;
    act(liveNext.tool, liveNext.params || {});
    userAction("intelligence.record_decision", {
      contactId,
      actionId: liveNext.id,
      label: liveNext.label,
      reason: liveNext.reason,
      status: "executada",
    });
  };
  const sims = dossier ? simulateOpportunities(db, dossier.nichePlay, dossier.evidence) : [];
  const quality = dossier && contact ? qualityIssues(db, { ...dossier, nextAction: liveNext || dossier.nextAction, contradictions: dossier.contradictions || [], confidence: dossier.confidence || { score: 0, level: "baixa", favors: [], limits: [], note: "" } }, contact) : [];

  return (
    <div className="space-y-6">
      <div>
        <Link to="/crm/dossie" className="text-xs underline">← Dossiês</Link>
        <h1 className="mt-2 font-serif text-3xl">{company?.name || contact.name}</h1>
        <p className="text-sm text-muted-foreground">{company?.city} · {company?.segment} · {dossier?.nichePlay || "sem diagnóstico"}</p>
      </div>

      {!dossier && (
        <Button onClick={() => act("intelligence.build_dossier", { contactId })}>Montar dossiê</Button>
      )}

      {dossier && (
        <>
          <div className="rounded-2xl border border-helena/30 bg-helena/8 p-5">
            <div className="text-[11px] uppercase tracking-[0.16em] text-helena">Próxima melhor ação</div>
            <p className="mt-2 text-lg font-medium">{liveNext?.label}</p>
            <p className="mt-1 text-sm text-muted-foreground">{liveNext?.reason}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-md border px-2 py-1">Temperatura: {liveTemp?.label} — {liveTemp?.reason}</span>
              <span className="rounded-md border px-2 py-1">Risco: {liveRisk?.level} — {liveRisk?.reason}</span>
            </div>
            {liveNext?.tool && (
              <Button className="mt-3" onClick={runNext}>
                {liveNext.needsApproval ? "Preparar (com aprovação)" : "Executar ação"}
              </Button>
            )}
            {dossier.confidence && (
              <p className="mt-3 text-xs text-muted-foreground">
                Confiança da evidência: {dossier.confidence.level} ({dossier.confidence.score}/100). {dossier.confidence.note}
              </p>
            )}
            {(dossier.contradictions || []).length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-amber-200/90">
                {dossier.contradictions.map((c) => <li key={c.code}>Contradição: {c.detail}</li>)}
              </ul>
            )}
            {quality.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {quality.map((q) => <li key={q.code}>Qualidade: {q.detail}</li>)}
              </ul>
            )}
          </div>
          {sims.length > 0 && (
            <div className="rounded-2xl border bg-card p-5">
              <h2 className="text-sm font-semibold">Simulador de oferta</h2>
              <p className="mt-1 text-[11px] text-muted-foreground">Só itens ativos do catálogo. Margem só aparece com custo cadastrado em Orçamentos.</p>
              <ul className="mt-3 space-y-2 text-sm">
                {sims.map((s) => (
                  <li key={s.id} className="rounded-lg border p-3">
                    <div className="font-medium">{s.label} · {brl(s.price)} · fit {s.fitScore}</div>
                    <p className="text-xs text-muted-foreground">{s.premise}</p>
                    <p className="text-[11px] text-muted-foreground">{s.marginNote} · {s.capacityNote}</p>
                  </li>
                ))}
              </ul>
              <Link to="/crm/sala/$contactId" params={{ contactId }} className="mt-3 inline-block text-xs underline">Abrir sala de negociação</Link>
            </div>
          )}
          {(dossier.matchedOffers || []).length > 0 && (
            <div className="rounded-2xl border bg-card p-5">
              <h2 className="text-sm font-semibold">Oferta do catálogo</h2>
              <ul className="mt-2 space-y-2 text-sm">
                {dossier.matchedOffers.map((o) => (
                  <li key={o.offerId}><strong>{o.name}</strong> · {brl(o.price)} — {o.why}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="rounded-2xl border bg-card p-5">
            <h2 className="text-sm font-semibold">Evidências · {fmtDateTime(dossier.collectedAt)}</h2>
            <p className="mt-1 text-[11px] text-muted-foreground">Fonte, data e o que foi observado. Ausência no cadastro não vira certeza de que o serviço não existe.</p>
            <ul className="mt-3 space-y-2 text-sm">
              {dossier.evidence.map((e) => (
                <li key={e.code} className="rounded-lg border p-3">
                  <div className="font-medium">{e.label} <span className="text-[10px] uppercase text-muted-foreground">{e.kind}</span></div>
                  <p className="text-xs text-muted-foreground">{e.observation}</p>
                  <p className="mt-1 text-[10px] font-mono">{e.source}</p>
                </li>
              ))}
            </ul>
            {(dossier.evidenceHistory || []).length > 0 && (
              <div className="mt-4">
                <h3 className="text-xs font-semibold uppercase text-muted-foreground">Histórico (classificação anterior)</h3>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {dossier.evidenceHistory.map((e, i) => (
                    <li key={`${e.code}-${e.collectedAt}-${i}`}>{e.label}: {e.kind} → substituído {e.supersededAt && fmtDateTime(e.supersededAt)}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border bg-card p-5">
              <h2 className="text-sm font-semibold">Reputação</h2>
              <p className="mt-2 text-sm">{dossier.reputation.pattern}</p>
              <p className="mt-1 text-[11px] uppercase text-muted-foreground">{dossier.reputation.kind}</p>
            </div>
            <div className="rounded-2xl border bg-card p-5">
              <h2 className="text-sm font-semibold">Concorrentes (mesmo cidade + segmento no CRM)</h2>
              {dossier.competitors.length === 0 && <p className="mt-2 text-sm text-muted-foreground">Nenhum par comparável no cadastro.</p>}
              <ul className="mt-2 space-y-1 text-sm">
                {dossier.competitors.map((c) => (
                  <li key={c.name}>{c.name} · {c.hasSite ? "site observado" : "site não encontrado"} — {c.note}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="rounded-2xl border bg-card p-5">
            <h2 className="text-sm font-semibold">Helena ROI · três cenários</h2>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Oferta {brl(dossier.roi.offerPrice)} · ticket {dossier.roi.ticketSource === "stated_by_client" ? "informado pelo estabelecimento" : "hipótese de nicho"}. Não é faturamento prometido.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {dossier.roi.scenarios.map((s) => (
                <div key={s.name} className="rounded-xl border p-3">
                  <div className="text-xs capitalize text-muted-foreground">{s.name}</div>
                  <div className="font-mono text-xl">{s.extraOrders}</div>
                  <div className="text-[11px] text-muted-foreground">conversões extras · ticket {brl(s.ticket)}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label>Ticket informado pelo cliente (R$)</Label>
                <Input value={ticket} onChange={(e) => setTicket(e.target.value)} placeholder="ex. 45" className="w-32" />
              </div>
              <Button variant="outline" onClick={() => act("intelligence.build_dossier", { contactId, ticket: Number(ticket.replace(",", ".")) })}>Recalcular ROI</Button>
            </div>
          </div>

          <div className="rounded-2xl border bg-card p-5 space-y-3">
            <h2 className="text-sm font-semibold">Solução e fechamento</h2>
            <p className="text-sm">Oferta: {dossier.offer}</p>
            <p className="text-sm text-muted-foreground">{dossier.approach}</p>
            <p className="text-xs">Intenção (mensagens do contato): <strong>{dossier.intent}</strong></p>
            {preview && (
              <p className="text-sm">Prévia: <Link className="underline" to="/ia/previews">{preview.previewPath || preview.slug}</Link></p>
            )}
            {proposal && (
              <p className="text-sm">Proposta v{proposal.version} · {proposal.status} · {brl(proposal.amount)}</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => act("sales.draft_proposal", { contactId })}>Gerar proposta</Button>
              {proposal && <Button variant="outline" onClick={() => act("sales.send_proposal", { proposalId: proposal.id })}>Pedir aprovação para enviar</Button>}
              <Button variant="outline" onClick={() => act("rpa.followup_schedule", { contactId, kind: "sem_resposta" })}>Agendar follow-up</Button>
              <Button variant="outline" onClick={() => act("leads.detect_intent", { contactId })}>Ler intenção</Button>
            </div>
            {follow.length > 0 && (
              <ul className="text-xs text-muted-foreground">
                {follow.map((j) => <li key={j.id}>{j.status} · {j.runAt && fmtDateTime(j.runAt)}</li>)}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
