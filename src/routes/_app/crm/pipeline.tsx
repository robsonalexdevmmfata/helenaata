import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Filter,
  Plus,
  Search,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EntityAvatar, PageHeader, StatusBadge } from "@/components/app/kit";
import { CycleStrip, FunnelBars } from "@/components/app/CommercialCharts";
import { currentUser, getDB, ownerName, update, useDB } from "@/lib/store";
import { liveBoard } from "@/lib/analytics";
import { intelligenceForLead } from "@/lib/helena/intelligence";
import { runTool } from "@/lib/helena/engine";
import { ensureCommercialStageOrder, promoteNoSiteDealsToQualified } from "@/lib/crm/pipelineStages";
import { brl, fmtDate } from "@/lib/format";
import { pageHead } from "@/lib/head";
import { toast } from "sonner";
import type { Deal, Stage } from "@/lib/types";

export const Route = createFileRoute("/_app/crm/pipeline")({
  head: () => pageHead("Pipeline de Vendas", "Kanban de oportunidades e estágios do CRM."),
  component: PipelinePage,
});

const PAGE_SIZE = 8;
const stageAccent = ["#e07a3d", "#c9a227", "#2dd4bf", "#3b82f6", "#8b5cf6", "#22c55e", "#64748b"];

function PipelinePage() {
  const db = useDB();
  const user = currentUser(db);
  const pipeline = db.pipelines[0];
  const stages = pipeline?.stages ?? [];

  const [search, setSearch] = useState("");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [mobileStageId, setMobileStageId] = useState(stages[0]?.id ?? "st_qual");
  const [pageByStage, setPageByStage] = useState<Record<string, number>>({});

  const [dealTitle, setDealTitle] = useState("");
  const [dealContactId, setDealContactId] = useState("");
  const [dealValue, setDealValue] = useState("");
  const [dealStageId, setDealStageId] = useState(stages.find((s) => s.id === "st_qual")?.id ?? stages[0]?.id ?? "");

  // Uma vez: ordem Proposta → Reunião + sem site → Qualificado.
  useEffect(() => {
    update((d) => {
      for (const pl of d.pipelines || []) {
        if (pl.id === "pl_com" || /comercial/i.test(pl.name)) ensureCommercialStageOrder(pl);
      }
      promoteNoSiteDealsToQualified(d.deals || [], d.pipelines?.[0]);
    });
  }, []);

  useEffect(() => {
    if (!stages.some((s) => s.id === mobileStageId) && stages[0]) {
      setMobileStageId(stages.find((s) => s.id === "st_qual")?.id ?? stages[0].id);
    }
  }, [stages, mobileStageId]);

  const deals = useMemo(() => db.deals.filter((d) => {
    if (ownerFilter !== "all" && d.ownerId !== ownerFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const contact = db.contacts.find((c) => c.id === d.contactId);
      const matchTitle = d.title.toLowerCase().includes(q);
      const matchContact = contact?.name.toLowerCase().includes(q);
      if (!matchTitle && !matchContact) return false;
    }
    return true;
  }), [db.deals, db.contacts, ownerFilter, search]);

  const board = liveBoard(db);
  const openDeals = deals.filter((d) => d.status === "aberto");
  const totalOpenValue = openDeals.reduce((sum, d) => sum + d.value, 0);
  const wonDeals = deals.filter((d) => d.status === "ganho");
  const totalWonValue = wonDeals.reduce((sum, d) => sum + d.value, 0);
  const weighted = openDeals.reduce((s, d) => s + d.value * ((d.probability || 0) / 100), 0);
  const funnelRows = stages.map((stage) => {
    const stageDeals = deals.filter((d) => d.stageId === stage.id);
    return { name: stage.name, count: stageDeals.length, value: stageDeals.reduce((sum, d) => sum + d.value, 0) };
  });

  const pageOf = (stageId: string) => pageByStage[stageId] ?? 0;
  const setPage = (stageId: string, page: number) => {
    setPageByStage((prev) => ({ ...prev, [stageId]: Math.max(0, page) }));
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dealContactId) {
      toast.error("Selecione um contato para a oportunidade.");
      return;
    }
    const val = parseFloat(dealValue.replace(/[^\d.,]/g, "").replace(",", ".")) || 0;

    const res = runTool(
      "crm.create_lead",
      {
        title: dealTitle.trim() || undefined,
        contactId: dealContactId,
        stageId: dealStageId,
        value: val,
        pipelineId: pipeline.id,
        ownerId: user.id,
        ownerType: "user",
      },
      { actor: user.name, actorType: "user", requestedBy: user.name },
    );

    if (res.ok) {
      toast.success(res.message);
      setCreateOpen(false);
      setDealTitle("");
      setDealContactId("");
      setDealValue("");
    } else {
      toast.error(res.message);
    }
  };

  const handleMoveStage = (dealId: string, newStageId: string) => {
    const res = runTool(
      "crm.move_lead",
      { dealId, stageId: newStageId },
      { actor: user.name, actorType: "user", requestedBy: user.name },
    );
    if (res.ok) {
      toast.success(res.message);
      if (selectedDeal && selectedDeal.id === dealId) {
        const updated = getDB().deals.find((d) => d.id === dealId);
        if (updated) setSelectedDeal(updated);
      }
    } else {
      toast.error(res.message);
    }
  };

  const renderDealCard = (deal: Deal) => {
    const contact = db.contacts.find((c) => c.id === deal.contactId);
    const company = deal.companyId
      ? db.companies.find((co) => co.id === deal.companyId)
      : undefined;
    const owner = ownerName(db, deal.ownerId);

    return (
      <div
        key={deal.id}
        onClick={() => setSelectedDeal(deal)}
        className="cursor-pointer rounded-xl border bg-card p-3 shadow-sm transition-all active:scale-[0.99] hover:-translate-y-0.5 hover:border-helena/50 hover:shadow-md sm:p-3.5"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="text-sm font-medium line-clamp-2 sm:line-clamp-1">{deal.title}</div>
          {contact?.score ? (
            <span className="shrink-0 rounded-md bg-helena/10 px-1.5 py-0.5 font-mono text-[10px] text-helena">{contact.score}</span>
          ) : null}
        </div>
        <div className="mt-1.5 flex items-center justify-between font-mono text-sm font-semibold text-foreground">
          <span>{brl(deal.value)}</span>
          {deal.status === "ganho" ? (
            <StatusBadge tone="success">Ganho</StatusBadge>
          ) : deal.status === "perdido" ? (
            <StatusBadge tone="danger">Perdido</StatusBadge>
          ) : (
            <span className="text-xs text-muted-foreground font-normal">
              {deal.probability}% prob.
            </span>
          )}
        </div>

        <div className="mt-2 text-xs text-muted-foreground">
          {contact ? (
            <div className="flex items-center gap-1.5 truncate">
              <User className="size-3 shrink-0" />
              <span className="truncate">{contact.name}</span>
            </div>
          ) : null}
          {company ? (
            <div className="mt-0.5 flex items-center gap-1.5 truncate">
              <Building2 className="size-3 shrink-0" />
              <span className="truncate">{company.name}</span>
            </div>
          ) : null}
        </div>

        <div className="mt-3 flex items-center justify-between border-t pt-2 text-xs text-muted-foreground">
          <div className="flex min-w-0 items-center gap-1.5 truncate">
            <EntityAvatar
              name={owner}
              agent={deal.ownerType === "agent"}
              size="sm"
              className="size-4 text-[9px]"
            />
            <span className="truncate">{owner}</span>
          </div>
          <div className="flex items-center gap-1 font-mono text-[10px]">
            <Calendar className="size-3" />
            <span>{fmtDate(deal.expectedClose).slice(0, 5)}</span>
          </div>
        </div>

        <div className="mt-2.5 flex items-center justify-end gap-1 pt-1">
          <Select
            value={deal.stageId}
            onValueChange={(val) => handleMoveStage(deal.id, val)}
          >
            <SelectTrigger
              onClick={(e) => e.stopPropagation()}
              className="h-8 w-auto border-dashed px-2 text-[11px] sm:h-6 sm:text-[10px]"
            >
              <span>Mover etapa</span>
            </SelectTrigger>
            <SelectContent onClick={(e) => e.stopPropagation()}>
              {stages.map((s) => (
                <SelectItem key={s.id} value={s.id} className="text-xs">
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  };

  const renderStageColumn = (stage: Stage, idx: number, opts?: { fullWidth?: boolean }) => {
    const stageDeals = deals.filter((d) => d.stageId === stage.id);
    const stageValue = stageDeals.reduce((sum, d) => sum + d.value, 0);
    const accent = stageAccent[idx % stageAccent.length];
    const colMax = Math.max(...stages.map((s) => deals.filter((d) => d.stageId === s.id).reduce((sum, d) => sum + d.value, 0)), 1);
    const page = pageOf(stage.id);
    const totalPages = Math.max(1, Math.ceil(stageDeals.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages - 1);
    const slice = stageDeals.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

    return (
      <div
        key={stage.id}
        className={`flex shrink-0 flex-col overflow-hidden rounded-xl border bg-muted/20 ${opts?.fullWidth ? "w-full" : "w-[min(100%,20rem)] sm:w-80"}`}
      >
        <div className="h-1" style={{ background: accent }} />
        <div className="border-b bg-card p-3 sm:p-3.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-semibold">{stage.name}</span>
              <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-xs font-medium text-muted-foreground">
                {stageDeals.length}
              </span>
            </div>
            <span className="shrink-0 font-mono text-xs text-muted-foreground">
              {stage.probability}%
            </span>
          </div>
          <div className="mt-1 font-mono text-xs text-muted-foreground">
            {brl(stageValue)}
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full" style={{ width: `${Math.round((stageValue / colMax) * 100)}%`, background: accent }} />
          </div>
        </div>

        <div className="flex-1 space-y-2.5 p-3 min-h-[280px] sm:min-h-[350px]">
          {slice.map(renderDealCard)}

          {stageDeals.length === 0 && (
            <div className="flex h-32 items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">
              Nenhuma oportunidade
            </div>
          )}
        </div>

        {stageDeals.length > PAGE_SIZE && (
          <div className="flex items-center justify-between gap-2 border-t bg-card px-3 py-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 px-2"
              disabled={safePage <= 0}
              onClick={() => setPage(stage.id, safePage - 1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="font-mono text-[11px] text-muted-foreground">
              {safePage + 1}/{totalPages} · {PAGE_SIZE}/página
            </span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 px-2"
              disabled={safePage >= totalPages - 1}
              onClick={() => setPage(stage.id, safePage + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        )}
      </div>
    );
  };

  const mobileStage = stages.find((s) => s.id === mobileStageId) ?? stages[0];
  const mobileIdx = Math.max(0, stages.findIndex((s) => s.id === mobileStage?.id));

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Pipeline de Oportunidades"
        description="Sem site → Qualificado. Time move etapa (reunião / proposta). Paginação pra volume alto."
        actions={
          <Button onClick={() => setCreateOpen(true)} className="gap-2 w-full sm:w-auto">
            <Plus className="size-4" /> Nova Oportunidade
          </Button>
        }
      />

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border bg-card p-3 sm:p-4">
          <div className="text-[10px] text-muted-foreground sm:text-xs">Pipeline Aberto</div>
          <div className="mt-1 font-mono text-lg font-bold sm:text-2xl">{brl(totalOpenValue)}</div>
          <div className="mt-1 text-[10px] text-muted-foreground sm:text-xs">{openDeals.length} ativas · pond. {brl(weighted)}</div>
        </div>
        <div className="rounded-xl border bg-card p-3 sm:p-4">
          <div className="text-[10px] text-muted-foreground sm:text-xs">Vendas Ganhas</div>
          <div className="mt-1 font-mono text-lg font-bold text-success sm:text-2xl">{brl(totalWonValue)}</div>
          <div className="mt-1 text-[10px] text-muted-foreground sm:text-xs">{wonDeals.length} fechados</div>
        </div>
        <div className="rounded-xl border bg-card p-3 sm:p-4">
          <div className="text-[10px] text-muted-foreground sm:text-xs">Conversão</div>
          <div className="mt-1 font-mono text-lg font-bold sm:text-2xl">
            {deals.length ? Math.round((wonDeals.length / deals.length) * 100) : 0}%
          </div>
          <div className="mt-1 text-[10px] text-muted-foreground sm:text-xs">{deals.length} deals</div>
        </div>
        <div className="rounded-xl border bg-card p-3 sm:p-4">
          <div className="text-[10px] text-muted-foreground sm:text-xs">Ticket Médio</div>
          <div className="mt-1 font-mono text-lg font-bold sm:text-2xl">
            {wonDeals.length ? brl(totalWonValue / wonDeals.length) : "R$ 0,00"}
          </div>
          <div className="mt-1 text-[10px] text-muted-foreground sm:text-xs">por fechamento</div>
        </div>
      </div>
      <CycleStrip cycle={board.cycle} />
      <div className="hidden rounded-2xl border bg-card p-5 sm:block">
        <div className="mb-1 text-sm font-semibold">Funil por etapa</div>
        <p className="mb-3 text-[11px] text-muted-foreground">Barras = quantidade. Tooltip mostra valor em R$.</p>
        <FunnelBars rows={funnelRows} />
      </div>

      <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por título ou contato..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="size-4 shrink-0 text-muted-foreground" />
          <Select value={ownerFilter} onValueChange={setOwnerFilter}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Responsável" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os responsáveis</SelectItem>
              {db.users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name} (Humano)
                </SelectItem>
              ))}
              {db.agents.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name} (IA)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Mobile: uma etapa por vez (tabs) */}
      <div className="space-y-3 lg:hidden">
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
          {stages.map((stage, idx) => {
            const count = deals.filter((d) => d.stageId === stage.id).length;
            const active = stage.id === mobileStageId;
            return (
              <button
                key={stage.id}
                type="button"
                onClick={() => setMobileStageId(stage.id)}
                className={`shrink-0 rounded-full border px-3 py-2 text-xs font-medium transition-colors ${
                  active ? "border-foreground bg-foreground text-background" : "bg-card text-muted-foreground"
                }`}
              >
                <span className="mr-1.5 inline-block size-1.5 rounded-full" style={{ background: stageAccent[idx % stageAccent.length] }} />
                {stage.name}
                <span className="ml-1.5 font-mono opacity-70">{count}</span>
              </button>
            );
          })}
        </div>
        {mobileStage && renderStageColumn(mobileStage, mobileIdx, { fullWidth: true })}
      </div>

      {/* Desktop: kanban horizontal */}
      <div className="hidden gap-4 overflow-x-auto pb-4 lg:flex">
        {stages.map((stage, idx) => renderStageColumn(stage, idx))}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Fluxo: <strong>Qualificado</strong> (sem site) → <strong>Proposta enviada</strong> (time contata) → <strong>Reunião agendada</strong> → Negociação → Ganho.
      </p>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[480px]">
          <form onSubmit={handleCreate}>
            <DialogHeader>
              <DialogTitle>Nova Oportunidade de Venda</DialogTitle>
              <DialogDescription>
                Time Comercial e humanos usam a mesma pipeline. Sem site? Prefira Qualificado.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="title">Título da oportunidade</Label>
                <Input
                  id="title"
                  placeholder="Ex: Site Institucional + SEO"
                  value={dealTitle}
                  onChange={(e) => setDealTitle(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="contact">Contato / Lead principal *</Label>
                <Select value={dealContactId} onValueChange={setDealContactId}>
                  <SelectTrigger id="contact">
                    <SelectValue placeholder="Selecione um contato" />
                  </SelectTrigger>
                  <SelectContent>
                    {db.contacts.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} {c.title ? `(${c.title})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="value">Valor estimado (R$)</Label>
                  <Input
                    id="value"
                    placeholder="R$ 5.000,00"
                    value={dealValue}
                    onChange={(e) => setDealValue(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="stage">Etapa inicial</Label>
                  <Select value={dealStageId} onValueChange={setDealStageId}>
                    <SelectTrigger id="stage">
                      <SelectValue placeholder="Selecione a etapa" />
                    </SelectTrigger>
                    <SelectContent>
                      {stages.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name} ({s.probability}%)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => setCreateOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="w-full sm:w-auto">Criar Oportunidade</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {selectedDeal && (
        <Dialog open={Boolean(selectedDeal)} onOpenChange={() => setSelectedDeal(null)}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[540px]">
            <DialogHeader>
              <div className="flex items-center justify-between gap-2 pr-4">
                <DialogTitle className="text-base sm:text-lg">{selectedDeal.title}</DialogTitle>
                <StatusBadge
                  tone={
                    selectedDeal.status === "ganho"
                      ? "success"
                      : selectedDeal.status === "perdido"
                        ? "danger"
                        : "info"
                  }
                >
                  {selectedDeal.status.toUpperCase()}
                </StatusBadge>
              </div>
              <DialogDescription>
                Criado em {fmtDate(selectedDeal.createdAt)} · Atualizado em {fmtDate(selectedDeal.updatedAt)}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-3">
              <div className="grid grid-cols-2 gap-4 rounded-lg border bg-card p-4">
                <div>
                  <div className="text-xs text-muted-foreground">Valor</div>
                  <div className="font-mono text-xl font-bold">{brl(selectedDeal.value)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Probabilidade</div>
                  <div className="font-mono text-xl font-bold">{selectedDeal.probability}%</div>
                </div>
              </div>
              {(() => {
                const c = db.contacts.find((x) => x.id === selectedDeal.contactId);
                if (!c) return null;
                const intel = intelligenceForLead(db, c);
                return (
                  <div className="rounded-xl border bg-muted/30 p-3 text-xs">
                    <div className="font-medium">Radar (estimativa)</div>
                    <p className="mt-1 text-muted-foreground">{intel.leaks[0]?.estimateHint || intel.rival.line}</p>
                    <p className="mt-2">{intel.roi.line}</p>
                    <Link to="/crm/dossie/$contactId" params={{ contactId: c.id }} className="mt-2 inline-block underline">Abrir dossiê</Link>
                  </div>
                );
              })()}

              <div className="space-y-2 text-sm">
                <div className="flex justify-between gap-2 border-b pb-2">
                  <span className="text-muted-foreground">Contato:</span>
                  <span className="font-medium text-right">
                    {db.contacts.find((c) => c.id === selectedDeal.contactId)?.name ?? "—"}
                  </span>
                </div>
                <div className="flex justify-between gap-2 border-b pb-2">
                  <span className="text-muted-foreground">Origem:</span>
                  <span className="font-medium">{selectedDeal.source}</span>
                </div>
                <div className="flex justify-between gap-2 border-b pb-2">
                  <span className="text-muted-foreground">Responsável:</span>
                  <span className="font-medium text-right">{ownerName(db, selectedDeal.ownerId)}</span>
                </div>
                <div className="flex justify-between gap-2 border-b pb-2">
                  <span className="text-muted-foreground">Etapa atual:</span>
                  <span className="font-medium">
                    {stages.find((s) => s.id === selectedDeal.stageId)?.name ?? "—"}
                  </span>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <Label>Mover etapa (time / você):</Label>
                <div className="flex flex-wrap gap-2">
                  {stages.map((s) => (
                    <Button
                      key={s.id}
                      size="sm"
                      className="min-h-9"
                      variant={s.id === selectedDeal.stageId ? "default" : "outline"}
                      onClick={() => handleMoveStage(selectedDeal.id, s.id)}
                    >
                      {s.name}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" className="w-full sm:w-auto" onClick={() => setSelectedDeal(null)}>
                Fechar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
