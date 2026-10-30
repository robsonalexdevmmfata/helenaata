import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowDown, ArrowUp, CheckCircle2, Copy, Edit2, Plus, Search, Shield, Trash2, Webhook,
} from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useDB, update, uid } from "@/lib/store";
import { pageHead } from "@/lib/head";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/integracoes/webhooks")({
  head: () => pageHead("Webhooks", "Webhooks de entrada e saída para integrar o sistema com qualquer plataforma."),
  component: WebhooksPage,
});

const EVENTS_OPTIONS = [
  "lead.created", "lead.contacted", "deal.moved", "deal.won", "deal.lost",
  "conversation.opened", "conversation.resolved", "meeting.scheduled", "campaign.started",
];

function WebhooksPage() {
  const db = useDB();
  const [search, setSearch] = useState("");
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newDir, setNewDir] = useState<"entrada" | "saida">("saida");
  const [newEvents, setNewEvents] = useState<string[]>(["lead.created"]);

  const filtered = db.webhooks.filter((w) =>
    `${w.name} ${w.url}`.toLowerCase().includes(search.toLowerCase())
  );

  const active = db.webhooks.filter((w) => w.active).length;
  const incoming = db.webhooks.filter((w) => w.direction === "entrada").length;
  const outgoing = db.webhooks.filter((w) => w.direction === "saida").length;

  const toggleEvent = (ev: string) =>
    setNewEvents((prev) => prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev]);

  const handleCreate = () => {
    if (!newName.trim()) { toast.error("Nome é obrigatório"); return; }
    if (!newUrl.trim()) { toast.error("URL é obrigatória"); return; }
    if (newEvents.length === 0) { toast.error("Selecione pelo menos 1 evento"); return; }
    update((d) => {
      d.webhooks.unshift({
        id: uid("wh_"), organizationId: d.organization.id,
        direction: newDir, name: newName, url: newUrl,
        events: newEvents, active: true,
        secret: `whsec_${Math.random().toString(36).slice(2, 18)}`,
      });
    });
    toast.success(`Webhook "${newName}" criado!`);
    setIsNewOpen(false);
    setNewName(""); setNewUrl(""); setNewEvents(["lead.created"]);
  };

  const toggleActive = (id: string, val: boolean) => {
    update((d) => { const w = d.webhooks.find((x) => x.id === id); if (w) w.active = val; });
    toast.success(val ? "Webhook ativado" : "Webhook desativado");
  };

  const handleDelete = (id: string) => {
    update((d) => { d.webhooks = d.webhooks.filter((w) => w.id !== id); });
    toast.success("Webhook removido");
  };

  const recentLogs = db.webhookLogs.slice(-10).reverse();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Integrações"
        title="Webhooks"
        description="Notificações em tempo real para CRMs, ERPs, n8n, Make e qualquer endpoint HTTP."
        actions={
          <Dialog open={isNewOpen} onOpenChange={setIsNewOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="size-4" /> Novo Webhook</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Criar Webhook</DialogTitle>
                <DialogDescription>Configure um endpoint para receber ou enviar eventos em tempo real.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto pr-1">
                <div className="grid grid-cols-2 gap-2">
                  {(["saida", "entrada"] as const).map((d) => (
                    <button key={d} onClick={() => setNewDir(d)}
                      className={`rounded-lg border p-3 text-center text-sm transition-all ${newDir === d ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}>
                      {d === "saida" ? <><ArrowUp className="size-4 mx-auto mb-1" />Saída (outbound)</> : <><ArrowDown className="size-4 mx-auto mb-1" />Entrada (inbound)</>}
                    </button>
                  ))}
                </div>
                <div><label className="text-xs font-medium text-muted-foreground">Nome</label>
                  <Input placeholder="Ex: Notificar CRM externo" value={newName} onChange={(e) => setNewName(e.target.value)} />
                </div>
                <div><label className="text-xs font-medium text-muted-foreground">URL do Endpoint</label>
                  <Input placeholder="https://hooks.exemplo.com.br/..." value={newUrl} onChange={(e) => setNewUrl(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Eventos</label>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {EVENTS_OPTIONS.map((ev) => (
                      <button key={ev} onClick={() => toggleEvent(ev)}
                        className={`text-[10px] rounded-md px-2 py-1 border transition-all ${newEvents.includes(ev) ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/40"}`}>
                        {ev}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsNewOpen(false)}>Cancelar</Button>
                <Button onClick={handleCreate}>Criar Webhook</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Webhooks Ativos" value={active} icon={<CheckCircle2 />} tone="success" />
        <StatCard label="Saída (Outbound)" value={outgoing} icon={<ArrowUp />} tone="info" />
        <StatCard label="Entrada (Inbound)" value={incoming} icon={<ArrowDown />} tone="helena" />
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
        <Input placeholder="Buscar webhook..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <div className="space-y-3">
        {filtered.map((wh) => (
          <div key={wh.id} className="rounded-xl border bg-card p-4 space-y-3 hover:border-foreground/20 transition-all">
            <div className="flex items-center gap-3">
              <div className={`size-8 rounded-lg flex items-center justify-center ${wh.direction === "saida" ? "bg-primary/10" : "bg-success/10"}`}>
                {wh.direction === "saida" ? <ArrowUp className="size-4 text-primary" /> : <ArrowDown className="size-4 text-success" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-sm">{wh.name}</h3>
                  <Badge variant="outline" className="text-[10px] capitalize">{wh.direction}</Badge>
                </div>
                <p className="text-xs text-muted-foreground font-mono truncate">{wh.url}</p>
              </div>
              <Switch checked={wh.active} onCheckedChange={(v) => toggleActive(wh.id, v)} />
            </div>

            <div className="flex flex-wrap gap-1">
              {wh.events.map((ev) => (
                <Badge key={ev} variant="secondary" className="text-[10px] px-1.5">{ev}</Badge>
              ))}
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Shield className="size-3" />
                <span className="font-mono">{wh.secret.slice(0, 18)}...</span>
                <button onClick={() => { navigator.clipboard.writeText(wh.secret); toast.success("Secret copiado!"); }}>
                  <Copy className="size-3 hover:text-foreground cursor-pointer" />
                </button>
              </div>
              <Button size="sm" variant="ghost" className="h-7 px-2 hover:text-destructive" onClick={() => handleDelete(wh.id)}>
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {recentLogs.length > 0 && (
        <div className="rounded-xl border overflow-hidden">
          <div className="px-4 py-2.5 bg-muted/30 text-[11px] font-semibold text-muted-foreground">Logs Recentes</div>
          {recentLogs.map((log) => {
            const wh = db.webhooks.find((w) => w.id === log.webhookId);
            return (
              <div key={log.id} className="flex items-center gap-4 px-4 py-2.5 border-t">
                <Badge variant={log.status >= 200 && log.status < 300 ? "default" : "destructive"} className="text-[10px]">{log.status}</Badge>
                <span className="text-xs text-muted-foreground flex-1">{wh?.name} · {log.event}</span>
                <span className="text-[10px] text-muted-foreground">{new Date(log.at).toLocaleString("pt-BR")}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
