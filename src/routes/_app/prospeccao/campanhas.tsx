import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  BarChart3, MessageCircle, Pause, Play, Plus, RefreshCw, Search, Zap,
} from "lucide-react";
import { PageHeader, Panel, StatCard, Status } from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useDB } from "@/lib/store";
import { runTool } from "@/lib/helena/engine";
import { brl } from "@/lib/format";
import { pageHead } from "@/lib/head";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/prospeccao/campanhas")({
  head: () => pageHead("Campanhas", "Gerencie campanhas de prospecção ativa via WhatsApp com controle de cadência e SDRs."),
  component: CampanhasPage,
});

function CampanhasPage() {
  const db = useDB();
  const [search, setSearch] = useState("");
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [selectedList, setSelectedList] = useState(db.lists[0]?.id ?? "");
  const [selectedCadence, setSelectedCadence] = useState(db.cadences[0]?.id ?? "");
  const [selectedConn, setSelectedConn] = useState("wa1");
  const [selectedTotal, setSelectedTotal] = useState(50);

  const filtered = db.campaigns.filter((c) =>
    `${c.name}`.toLowerCase().includes(search.toLowerCase())
  );

  const active = db.campaigns.filter((c) => c.status === "ativa").length;
  const totalSent = db.campaigns.reduce((s, c) => s + c.sent, 0);
  const totalMeetings = db.campaigns.reduce((s, c) => s + c.meetings, 0);

  const handleCreate = () => {
    if (!newName.trim()) { toast.error("Nome da campanha é obrigatório"); return; }
    const res = runTool(
      "campaigns.create",
      { name: newName, listId: selectedList, cadenceId: selectedCadence, connectionId: selectedConn, total: selectedTotal, agentIds: db.agents.filter((a) => a.role === "SDR").map((a) => a.id) },
      { actor: "Gestor", actorType: "user" }
    );
    if (res.ok) { toast.success(res.message); setIsNewOpen(false); setNewName(""); }
    else toast.error(res.message);
  };

  const handleStart = (id: string) => {
    const res = runTool("campaigns.start", { campaignId: id }, { actor: "Gestor", actorType: "user" });
    if (res.ok) toast.success(res.message);
    else toast.error(res.message);
  };

  const handlePause = (id: string) => {
    const res = runTool("campaigns.pause", { campaignId: id }, { actor: "Gestor", actorType: "user" });
    if (res.ok) toast.success(res.message);
    else toast.error(res.message);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Prospecção Automatizada"
        title="Campanhas"
        description="Disparo em massa com cadência anti-ban, deduplicação e Trava 1 automática."
        actions={
          <Dialog open={isNewOpen} onOpenChange={setIsNewOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="size-4" /> Nova Campanha</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar Campanha de Prospecção</DialogTitle>
                <DialogDescription>A Trava 1 da Helena evita duplicidade automática de disparos.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div><label className="text-xs font-medium text-muted-foreground">Nome da Campanha</label>
                  <Input placeholder="Ex: Clínicas SP — Outubro 2026" value={newName} onChange={(e) => setNewName(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs font-medium text-muted-foreground">Lista</label>
                    <Select value={selectedList} onValueChange={setSelectedList}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{db.lists.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><label className="text-xs font-medium text-muted-foreground">Cadência</label>
                    <Select value={selectedCadence} onValueChange={setSelectedCadence}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{db.cadences.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs font-medium text-muted-foreground">Conexão WhatsApp</label>
                    <Select value={selectedConn} onValueChange={setSelectedConn}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{db.connections.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><label className="text-xs font-medium text-muted-foreground">Volume de Disparos</label>
                    <Input type="number" min={10} max={500} value={selectedTotal} onChange={(e) => setSelectedTotal(Number(e.target.value))} />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsNewOpen(false)}>Cancelar</Button>
                <Button onClick={handleCreate}>Criar em Rascunho</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Campanhas Ativas" value={active} icon={<Zap />} tone="success" />
        <StatCard label="Total Enviado" value={totalSent.toLocaleString("pt-BR")} hint="Disparos acumulados" icon={<MessageCircle />} tone="info" />
        <StatCard label="Reuniões Geradas" value={totalMeetings} hint="Conversões via campanha" icon={<BarChart3 />} tone="helena" />
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
        <Input placeholder="Buscar campanha..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {filtered.map((camp) => {
          const list = db.lists.find((l) => l.id === camp.listId);
          const pct = camp.total > 0 ? Math.round((camp.sent / camp.total) * 100) : 0;
          const replyRate = camp.sent > 0 ? Math.round((camp.replies / camp.sent) * 100) : 0;
          return (
            <div key={camp.id} className="rounded-xl border bg-card p-5 space-y-4 hover:border-foreground/20 transition-all">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold">{camp.name}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{list?.name} · {camp.channel}</p>
                </div>
                <Status value={camp.status} />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-muted-foreground">Progresso</span>
                  <span className="font-semibold">{camp.sent}/{camp.total} — {pct}%</span>
                </div>
                <Progress value={pct} className="h-1.5" />
              </div>

              <div className="grid grid-cols-4 text-center gap-2 rounded-lg bg-muted/30 p-2">
                <div><div className="text-sm font-bold">{camp.sent}</div><div className="text-[10px] text-muted-foreground">Enviados</div></div>
                <div><div className="text-sm font-bold text-primary">{camp.replies}</div><div className="text-[10px] text-muted-foreground">Respostas</div></div>
                <div><div className="text-sm font-bold text-success">{camp.meetings}</div><div className="text-[10px] text-muted-foreground">Reuniões</div></div>
                <div><div className="text-sm font-bold text-warning">{camp.optOuts}</div><div className="text-[10px] text-muted-foreground">Opt-outs</div></div>
              </div>

              <div className="flex gap-2">
                {camp.status === "ativa" ? (
                  <Button size="sm" variant="outline" className="flex-1 gap-1.5 h-8" onClick={() => handlePause(camp.id)}>
                    <Pause className="size-3.5" /> Pausar
                  </Button>
                ) : (
                  <Button size="sm" className="flex-1 gap-1.5 h-8" onClick={() => handleStart(camp.id)}>
                    <Play className="size-3.5" /> Iniciar
                  </Button>
                )}
                <Button size="sm" variant="outline" className="h-8 px-3">
                  <BarChart3 className="size-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
