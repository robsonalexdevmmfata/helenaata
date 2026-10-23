import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Pause, Play, Plus, Send, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, PageHeader, ProgressBar, StatCard, Status } from "@/components/app/kit";
import { ApprovalBlock } from "@/components/helena/HelenaCards";
import { useDB } from "@/lib/store";
import { requestApproval, userAction } from "@/lib/helena/engine";
import { openHelena } from "@/lib/helena/orchestrator";
import { pct } from "@/lib/format";
import { pageHead } from "@/lib/head";
import { toast } from "sonner";
import type { Campaign } from "@/lib/types";

export const Route = createFileRoute("/_app/prospeccao/campanhas")({
  head: () => pageHead("Campanhas", "Campanhas de prospecção executadas pelos SDRs de IA com aprovação humana."),
  component: CampaignsPage,
});

function CampaignsPage() {
  const db = useDB();
  const [filter, setFilter] = useState<"all" | Campaign["status"]>("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", listId: db.lists[0]?.id ?? "", cadenceId: db.cadences[0]?.id ?? "", total: "100", agent: "both" });

  const list = db.campaigns.filter((c) => filter === "all" || c.status === filter);
  const sent = db.campaigns.reduce((s, c) => s + c.sent, 0);
  const replies = db.campaigns.reduce((s, c) => s + c.replies, 0);
  const meetings = db.campaigns.reduce((s, c) => s + c.meetings, 0);

  const create = (e: FormEvent) => {
    e.preventDefault();
    const agentIds = form.agent === "both" ? ["a_sdr1", "a_sdr2"] : [form.agent];
    const r = userAction("campaigns.create", { name: form.name.trim(), listId: form.listId, cadenceId: form.cadenceId, total: Number(form.total), agentIds });
    if (!r.ok) return toast.error(r.message);
    toast.success(r.message);
    setOpen(false);
    setForm({ ...form, name: "" });
  };

  // Mass sending is high risk: always ask for an approval instead of sending right away.
  const askStart = (c: Campaign) => {
    const listName = db.lists.find((l) => l.id === c.listId)?.name ?? "—";
    requestApproval({
      title: `Iniciar campanha ${c.name}`,
      description: "Disparo de abordagens pelo WhatsApp com envio espaçado para evitar bloqueios.",
      details: [
        { label: "Contatos", value: String(c.total) }, { label: "Lista", value: listName },
        { label: "Agentes", value: db.agents.filter((a) => c.agentIds.includes(a.id)).map((a) => a.name).join(", ") },
      ],
      tool: "campaigns.start", params: { campaignId: c.id }, risk: "alto", requestedBy: "Helena",
    });
    toast.message("Pedido de aprovação criado", { description: "Aprove no card abaixo da campanha." });
  };

  const pause = (c: Campaign) => {
    const r = userAction("campaigns.pause", { campaignId: c.id });
    r.ok ? toast.success(r.message) : toast.error(r.message);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Prospecção"
        title="Campanhas"
        description="Cada campanha usa uma lista, uma cadência e um ou mais SDRs de IA. Disparos em massa sempre pedem sua aprovação."
        actions={
          <>
            <Button variant="outline" onClick={() => openHelena("Helena, precisamos faturar R$ 15.000 esta semana.")}><Sparkles /> Planejar meta com a Helena</Button>
            <Button onClick={() => setOpen(true)}><Plus /> Nova campanha</Button>
          </>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Ativas" value={db.campaigns.filter((c) => c.status === "ativa").length} icon={<Zap />} tone="success" />
        <StatCard label="Mensagens enviadas" value={sent} icon={<Send />} />
        <StatCard label="Taxa de resposta" value={pct(sent ? (replies / sent) * 100 : 0)} tone="info" />
        <StatCard label="Reuniões" value={meetings} tone="helena" />
      </div>
      <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="all">Todas</TabsTrigger>
          <TabsTrigger value="ativa">Ativas</TabsTrigger>
          <TabsTrigger value="aguardando_aprovacao">Aguardando</TabsTrigger>
          <TabsTrigger value="rascunho">Rascunhos</TabsTrigger>
          <TabsTrigger value="pausada">Pausadas</TabsTrigger>
          <TabsTrigger value="concluida">Concluídas</TabsTrigger>
        </TabsList>
      </Tabs>

      {list.length === 0 ? (
        <EmptyState icon={<Zap />} title="Nenhuma campanha neste filtro" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {list.map((c) => {
            const l = db.lists.find((x) => x.id === c.listId);
            const cad = db.cadences.find((x) => x.id === c.cadenceId);
            const pending = db.approvals.find((a) => a.status === "pendente" && a.params.campaignId === c.id);
            const progress = c.total ? (c.sent / c.total) * 100 : 0;
            return (
              <div key={c.id} className="space-y-4 rounded-xl border bg-card p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground">{l?.name} · {cad?.name} · {db.agents.filter((a) => c.agentIds.includes(a.id)).map((a) => a.name).join(", ")}</div>
                  </div>
                  <Status value={c.status} />
                </div>
                <div>
                  <ProgressBar value={progress} tone={c.status === "concluida" ? "success" : "helena"} />
                  <div className="mt-1 flex justify-between font-mono text-[11px] text-muted-foreground"><span>{c.sent} / {c.total} enviadas</span><span>{Math.round(progress)}%</span></div>
                </div>
                <div className="grid grid-cols-4 gap-2 text-center">
                  {[["Respostas", c.replies], ["Interessados", c.interested], ["Reuniões", c.meetings], ["Opt-out", c.optOuts]].map(([k, v]) => (
                    <div key={k as string} className="rounded-md bg-muted/60 py-1.5">
                      <div className="font-mono text-sm font-medium">{v}</div>
                      <div className="text-[10px] text-muted-foreground">{k}</div>
                    </div>
                  ))}
                </div>
                {pending ? (
                  <ApprovalBlock approvalId={pending.id} compact />
                ) : (
                  <div className="flex gap-2">
                    {(c.status === "rascunho" || c.status === "pausada" || c.status === "aguardando_aprovacao") && (
                      <Button size="sm" onClick={() => askStart(c)}><ShieldCheck /> {c.status === "pausada" ? "Retomar (pedir aprovação)" : "Iniciar (pedir aprovação)"}</Button>
                    )}
                    {c.status === "ativa" && <Button size="sm" variant="outline" onClick={() => pause(c)}><Pause /> Pausar</Button>}
                    {c.status === "concluida" && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Play className="size-3" /> Finalizada</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form onSubmit={create} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Nova campanha</DialogTitle>
              <DialogDescription>A campanha é criada como rascunho. O envio só começa depois da sua aprovação.</DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5"><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Clínicas sem site · Novembro" required /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Lista</Label>
                <Select value={form.listId} onValueChange={(v) => setForm({ ...form, listId: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{db.lists.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Cadência</Label>
                <Select value={form.cadenceId} onValueChange={(v) => setForm({ ...form, cadenceId: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{db.cadences.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>SDRs</Label>
                <Select value={form.agent} onValueChange={(v) => setForm({ ...form, agent: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">SDR 01 e SDR 02</SelectItem>
                    {db.agents.filter((a) => a.role === "SDR").map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Limite de contatos</Label><Input type="number" min={1} value={form.total} onChange={(e) => setForm({ ...form, total: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit">Criar rascunho</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
