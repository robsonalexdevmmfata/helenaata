import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Pencil, Plus, Receipt, Trash2 } from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDB, update, uid, nowISO } from "@/lib/store";
import { formatOfferPrice } from "@/lib/catalog";
import { brl } from "@/lib/format";
import { pageHead } from "@/lib/head";
import { toast } from "sonner";
import type { ServiceBilling, ServiceOffer } from "@/lib/types";

export const Route = createFileRoute("/_app/prospeccao/orcamentos")({
  head: () => pageHead("Orçamentos", "Tabela de serviços da Info Tech. SDRs cotam só o que estiver ativo aqui."),
  component: OrcamentosPage,
});

const BILLING: { id: ServiceBilling; label: string }[] = [
  { id: "unico", label: "Pagamento único" },
  { id: "mensal", label: "Mensal" },
  { id: "campanha", label: "Por campanha" },
  { id: "a_partir", label: "A partir de" },
];

const emptyForm = (): Omit<ServiceOffer, "id" | "organizationId" | "updatedAt"> => ({
  category: "Presença Digital & Web",
  name: "",
  description: "",
  price: 0,
  priceNote: "",
  setupFee: 0,
  billing: "unico",
  active: true,
  pitch: "",
});

function OrcamentosPage() {
  const db = useDB();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [promptAgent, setPromptAgent] = useState<string | null>(null);
  const [promptText, setPromptText] = useState("");

  const offers = db.serviceOffers ?? [];
  const filtered = offers.filter((o) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return `${o.name} ${o.category} ${o.description}`.toLowerCase().includes(q);
  });
  const grouped = useMemo(() => {
    const map = new Map<string, ServiceOffer[]>();
    filtered.forEach((o) => {
      const list = map.get(o.category) ?? [];
      list.push(o);
      map.set(o.category, list);
    });
    return [...map.entries()];
  }, [filtered]);

  const commercialIds = new Set(["a_sdr1", "a_sdr2", "a_qual", "a_closer", "a_fu", "a_supcom"]);
  const commercial = db.agents.filter(
    (a) => commercialIds.has(a.id) || (a.teamId === "t_com" && ["SDR", "Qualificador", "Closer", "Follow-up", "Supervisor"].includes(a.role)),
  );

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm());
    setOpen(true);
  };
  const openEdit = (o: ServiceOffer) => {
    setEditingId(o.id);
    setForm({
      category: o.category, name: o.name, description: o.description, price: o.price,
      priceNote: o.priceNote, setupFee: o.setupFee, billing: o.billing, active: o.active, pitch: o.pitch,
      costAmount: o.costAmount, hoursEstimate: o.hoursEstimate, desiredMarginPct: o.desiredMarginPct, monthlyCapacity: o.monthlyCapacity,
    });
    setOpen(true);
  };

  const save = () => {
    if (!form.name.trim()) return toast.error("Informe o nome do serviço.");
    if (form.price < 0) return toast.error("Preço inválido.");
    update((d) => {
      if (!d.serviceOffers) d.serviceOffers = [];
      if (editingId) {
        const cur = d.serviceOffers.find((x) => x.id === editingId);
        if (cur) Object.assign(cur, form, { updatedAt: nowISO() });
      } else {
        d.serviceOffers.unshift({
          ...form,
          id: uid("svc_"),
          organizationId: d.organization.id,
          name: form.name.trim(),
          updatedAt: nowISO(),
        });
      }
    });
    toast.success(editingId ? "Orçamento atualizado. Os agentes passam a usar o novo valor." : "Serviço adicionado ao catálogo.");
    setOpen(false);
  };

  const remove = (id: string) => {
    update((d) => { d.serviceOffers = d.serviceOffers.filter((x) => x.id !== id); });
    toast.success("Serviço removido do catálogo.");
  };

  const toggle = (id: string, active: boolean) => {
    update((d) => {
      const o = d.serviceOffers.find((x) => x.id === id);
      if (o) { o.active = active; o.updatedAt = nowISO(); }
    });
  };

  const savePrompt = () => {
    if (!promptAgent) return;
    update((d) => {
      const a = d.agents.find((x) => x.id === promptAgent);
      if (a) a.prompt = promptText;
    });
    toast.success("Prompt do agente atualizado.");
    setPromptAgent(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Prospecção"
        title="Orçamentos"
        description="Tabela de serviços da Info Tech. Clique em Editar para mudar preço. Os SDRs cotam só o que estiver ativo."
        actions={<Button onClick={openNew}><Plus /> Novo serviço</Button>}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Serviços" value={offers.length} icon={<Receipt />} />
        <StatCard label="Ativos para cotação" value={offers.filter((o) => o.active).length} icon={<Receipt />} tone="success" />
        <StatCard label="Ticket médio (ativos)" value={brl(avgPrice(offers))} icon={<Receipt />} tone="info" />
      </div>

      <Input placeholder="Buscar serviço, categoria..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />

      {grouped.length === 0 && (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          Nenhum serviço. Clique em Novo serviço para montar o catálogo.
        </div>
      )}

      {grouped.map(([category, items]) => (
        <section key={category} className="space-y-3">
          <h2 className="text-sm font-semibold tracking-tight">{category}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {items.map((o) => (
              <div key={o.id} className={`rounded-xl border bg-card p-4 space-y-3 ${o.active ? "" : "opacity-60"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-sm">{o.name}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">{o.description}</p>
                  </div>
                  <Switch checked={o.active} onCheckedChange={(v) => toggle(o.id, v)} />
                </div>
                <div className="font-mono text-sm font-semibold text-primary">{formatOfferPrice(o)}</div>
                {o.pitch && <p className="text-xs text-muted-foreground">Pitch SDR: {o.pitch}</p>}
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => openEdit(o)}>
                    <Pencil className="size-3" /> Editar
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 px-2 hover:text-destructive" onClick={() => remove(o.id)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      <section className="space-y-3 pt-2">
        <h2 className="text-sm font-semibold tracking-tight">Prompts dos agentes (SDR e time comercial)</h2>
        <p className="text-xs text-muted-foreground">O preço que eles falam vem desta tela. O texto abaixo é o jeito de abordar.</p>
        <div className="grid gap-3 md:grid-cols-2">
          {commercial.map((a) => (
            <div key={a.id} className="rounded-xl border bg-card p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="font-semibold text-sm">{a.name}</div>
                  <div className="text-[11px] text-muted-foreground">{a.role}</div>
                </div>
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => { setPromptAgent(a.id); setPromptText(a.prompt || ""); }}>
                  Editar prompt
                </Button>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-4 whitespace-pre-wrap">{a.prompt || "Sem prompt."}</p>
            </div>
          ))}
        </div>
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar orçamento" : "Novo serviço"}</DialogTitle>
            <DialogDescription>Altere o valor quando o mercado não responder. O SDR passa a cotar o novo número na hora.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Landing Page de Alta Conversão" />
            </div>
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Preço (R$)</Label>
                <Input type="number" min={0} step={1} value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label>Setup (R$)</Label>
                <Input type="number" min={0} step={1} value={form.setupFee} onChange={(e) => setForm({ ...form, setupFee: Number(e.target.value) })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Cobrança</Label>
              <Select value={form.billing} onValueChange={(v) => setForm({ ...form, billing: v as ServiceBilling })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BILLING.map((b) => <SelectItem key={b.id} value={b.id}>{b.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Observação de preço</Label>
              <Input value={form.priceNote} onChange={(e) => setForm({ ...form, priceNote: e.target.value })} placeholder="ou 3x de R$ 180" />
            </div>
            <div className="space-y-1.5">
              <Label>Pitch curto (WhatsApp)</Label>
              <Input value={form.pitch} onChange={(e) => setForm({ ...form, pitch: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Custo informado (R$)</Label>
                <Input type="number" min={0} step={1} value={form.costAmount ?? ""} onChange={(e) => setForm({ ...form, costAmount: e.target.value === "" ? undefined : Number(e.target.value) })} placeholder="vazio = sem mínimo" />
              </div>
              <div className="space-y-1.5">
                <Label>Margem desejada (%)</Label>
                <Input type="number" min={0} max={90} step={1} value={form.desiredMarginPct ?? ""} onChange={(e) => setForm({ ...form, desiredMarginPct: e.target.value === "" ? undefined : Number(e.target.value) })} placeholder="ex. 30" />
              </div>
              <div className="space-y-1.5">
                <Label>Horas estimadas</Label>
                <Input type="number" min={0} step={1} value={form.hoursEstimate ?? ""} onChange={(e) => setForm({ ...form, hoursEstimate: e.target.value === "" ? undefined : Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label>Capacidade / mês</Label>
                <Input type="number" min={0} step={1} value={form.monthlyCapacity ?? ""} onChange={(e) => setForm({ ...form, monthlyCapacity: e.target.value === "" ? undefined : Number(e.target.value) })} placeholder="projetos" />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">Sem custo cadastrado a Helena não inventa margem nem desconto máximo.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(promptAgent)} onOpenChange={(v) => !v && setPromptAgent(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Prompt · {db.agents.find((a) => a.id === promptAgent)?.name}</DialogTitle>
            <DialogDescription>Texto que o agente segue na abordagem. Preços continuam vindo do catálogo acima.</DialogDescription>
          </DialogHeader>
          <Textarea rows={14} value={promptText} onChange={(e) => setPromptText(e.target.value)} className="font-mono text-xs" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPromptAgent(null)}>Cancelar</Button>
            <Button onClick={savePrompt}>Salvar prompt</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function avgPrice(offers: ServiceOffer[]) {
  const active = offers.filter((o) => o.active);
  if (!active.length) return 0;
  return Math.round(active.reduce((s, o) => s + o.price, 0) / active.length);
}
