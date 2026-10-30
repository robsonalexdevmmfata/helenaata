import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Building2,
  Calendar,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Filter,
  Plus,
  Search,
  User,
  XCircle,
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
import { currentUser, getDB, ownerName, useDB } from "@/lib/store";
import { liveBoard } from "@/lib/analytics";
import { runTool } from "@/lib/helena/engine";
import { brl, fmtDate } from "@/lib/format";
import { pageHead } from "@/lib/head";
import { toast } from "sonner";
import type { Deal, Stage } from "@/lib/types";

export const Route = createFileRoute("/_app/crm/pipeline")({
  head: () => pageHead("Pipeline de Vendas", "Kanban de oportunidades e estágios do CRM."),
  component: PipelinePage,
});

function PipelinePage() {
  const db = useDB();
  const user = currentUser(db);
  const pipeline = db.pipelines[0];
  const stages = pipeline?.stages ?? [];

  const [search, setSearch] = useState("");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);

  // Form state
  const [dealTitle, setDealTitle] = useState("");
  const [dealContactId, setDealContactId] = useState("");
  const [dealValue, setDealValue] = useState("");
  const [dealStageId, setDealStageId] = useState(stages[0]?.id ?? "");

  const deals = db.deals.filter((d) => {
    if (ownerFilter !== "all" && d.ownerId !== ownerFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const contact = db.contacts.find((c) => c.id === d.contactId);
      const matchTitle = d.title.toLowerCase().includes(q);
      const matchContact = contact?.name.toLowerCase().includes(q);
      if (!matchTitle && !matchContact) return false;
    }
    return true;
  });

  const board = liveBoard(db);
  const openDeals = deals.filter((d) => d.status === "aberto");
  const totalOpenValue = openDeals.reduce((sum, d) => sum + d.value, 0);
  const wonDeals = deals.filter((d) => d.status === "ganho");
  const totalWonValue = wonDeals.reduce((sum, d) => sum + d.value, 0);

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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pipeline de Oportunidades"
        description="Acompanhamento visual em Kanban do funil de vendas, etapas de qualificação e fechamento."
        actions={
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="size-4" /> Nova Oportunidade
          </Button>
        }
      />

      {/* Summary Metrics */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground">Pipeline Aberto</div>
          <div className="mt-1 font-mono text-2xl font-bold">{brl(totalOpenValue)}</div>
          <div className="mt-1 text-xs text-muted-foreground">{openDeals.length} oportunidades ativas</div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground">Vendas Ganhas</div>
          <div className="mt-1 font-mono text-2xl font-bold text-success">{brl(totalWonValue)}</div>
          <div className="mt-1 text-xs text-muted-foreground">{wonDeals.length} negócios fechados</div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground">Taxa de Conversão</div>
          <div className="mt-1 font-mono text-2xl font-bold">
            {deals.length ? Math.round((wonDeals.length / deals.length) * 100) : 0}%
          </div>
          <div className="mt-1 text-xs text-muted-foreground">sobre o total de {deals.length} deals</div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground">Ticket Médio Ganho</div>
          <div className="mt-1 font-mono text-2xl font-bold">
            {wonDeals.length ? brl(totalWonValue / wonDeals.length) : "R$ 0,00"}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">por oportunidade fechada</div>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-4 text-xs">
        <div className="rounded-lg border bg-card px-3 py-2">Abordagens Inbox <span className="font-mono font-semibold">{board.abordados}</span></div>
        <div className="rounded-lg border bg-card px-3 py-2">Responderam <span className="font-mono font-semibold">{board.responderam}</span></div>
        <div className="rounded-lg border bg-card px-3 py-2">Reuniões Agenda <span className="font-mono font-semibold">{board.meetings.length}</span></div>
        <div className="rounded-lg border bg-card px-3 py-2">Disparos Evolution <span className="font-mono font-semibold">{board.campaignSent}</span></div>
      </div>

      {/* Filters Bar */}
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
          <Filter className="size-4 text-muted-foreground" />
          <Select value={ownerFilter} onValueChange={setOwnerFilter}>
            <SelectTrigger className="w-[180px]">
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

      {/* Kanban Board */}
      <div className="flex gap-4 overflow-x-auto pb-4 -mx-3 px-3 sm:mx-0 sm:px-0">
        {stages.map((stage: Stage) => {
          const stageDeals = deals.filter((d) => d.stageId === stage.id);
          const stageValue = stageDeals.reduce((sum, d) => sum + d.value, 0);

          return (
            <div
              key={stage.id}
              className="flex w-80 shrink-0 flex-col rounded-xl border bg-card/50"
            >
              {/* Column Header */}
              <div className="border-b bg-card p-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{stage.name}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-mono font-medium text-muted-foreground">
                      {stageDeals.length}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground font-mono">
                    {stage.probability}%
                  </span>
                </div>
                <div className="mt-1 font-mono text-xs text-muted-foreground">
                  {brl(stageValue)}
                </div>
              </div>

              {/* Cards List */}
              <div className="flex-1 space-y-2.5 p-3 min-h-[350px]">
                {stageDeals.map((deal) => {
                  const contact = db.contacts.find((c) => c.id === deal.contactId);
                  const company = deal.companyId
                    ? db.companies.find((co) => co.id === deal.companyId)
                    : undefined;
                  const owner = ownerName(db, deal.ownerId);

                  return (
                    <div
                      key={deal.id}
                      onClick={() => setSelectedDeal(deal)}
                      className="cursor-pointer rounded-lg border bg-card p-3.5 shadow-sm transition-all hover:border-helena/50 hover:shadow-md"
                    >
                      <div className="text-sm font-medium line-clamp-1">{deal.title}</div>
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
                          <div className="flex items-center gap-1.5 truncate mt-0.5">
                            <Building2 className="size-3 shrink-0" />
                            <span className="truncate">{company.name}</span>
                          </div>
                        ) : null}
                      </div>

                      <div className="mt-3 flex items-center justify-between border-t pt-2 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5 truncate">
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

                      {/* Stage quick changer */}
                      <div className="mt-2.5 flex items-center justify-end gap-1 pt-1">
                        <Select
                          value={deal.stageId}
                          onValueChange={(val) => handleMoveStage(deal.id, val)}
                        >
                          <SelectTrigger
                            onClick={(e) => e.stopPropagation()}
                            className="h-6 text-[10px] w-auto border-dashed px-2"
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
                })}

                {stageDeals.length === 0 && (
                  <div className="flex h-32 items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">
                    Nenhuma oportunidade
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal Nova Oportunidade */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <form onSubmit={handleCreate}>
            <DialogHeader>
              <DialogTitle>Nova Oportunidade de Venda</DialogTitle>
              <DialogDescription>
                Adicione uma nova oportunidade ao pipeline comercial da organização.
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

              <div className="grid grid-cols-2 gap-3">
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

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">Criar Oportunidade</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Detalhes da Oportunidade */}
      {selectedDeal && (
        <Dialog open={Boolean(selectedDeal)} onOpenChange={() => setSelectedDeal(null)}>
          <DialogContent className="sm:max-w-[540px]">
            <DialogHeader>
              <div className="flex items-center justify-between pr-4">
                <DialogTitle>{selectedDeal.title}</DialogTitle>
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

              <div className="space-y-2 text-sm">
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Contato:</span>
                  <span className="font-medium">
                    {db.contacts.find((c) => c.id === selectedDeal.contactId)?.name ?? "—"}
                  </span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Origem:</span>
                  <span className="font-medium">{selectedDeal.source}</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Responsável:</span>
                  <span className="font-medium">{ownerName(db, selectedDeal.ownerId)}</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">Etapa atual:</span>
                  <span className="font-medium">
                    {stages.find((s) => s.id === selectedDeal.stageId)?.name ?? "—"}
                  </span>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <Label>Mover para outra etapa:</Label>
                <div className="flex flex-wrap gap-2">
                  {stages.map((s) => (
                    <Button
                      key={s.id}
                      size="sm"
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
              <Button variant="outline" onClick={() => setSelectedDeal(null)}>
                Fechar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
