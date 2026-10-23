import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  CheckCircle2, ChevronRight, Clock, Edit2, Plus, Play, Pause, RefreshCw, Search, Trash2, Workflow, Zap,
} from "lucide-react";
import { PageHeader, StatCard, Status } from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useDB, update, uid, nowISO } from "@/lib/store";
import { pageHead } from "@/lib/head";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/automacoes")({
  head: () => pageHead("Automações", "Fluxos de automação baseados em gatilhos, condições e ações encadeadas."),
  component: AutomacoesPage,
});

function AutomacoesPage() {
  const db = useDB();
  const [search, setSearch] = useState("");
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTrigger, setNewTrigger] = useState("lead_criado");

  const filtered = db.automations.filter((a) =>
    `${a.name} ${a.trigger}`.toLowerCase().includes(search.toLowerCase())
  );

  const active = db.automations.filter((a) => a.active).length;
  const totalRuns = db.automations.reduce((s, a) => s + a.runs, 0);

  const toggleActive = (id: string, val: boolean) => {
    update((d) => { const au = d.automations.find((a) => a.id === id); if (au) au.active = val; });
    toast.success(val ? "Automação ativada" : "Automação pausada");
  };

  const handleCreate = () => {
    if (!newName.trim()) { toast.error("Nome é obrigatório"); return; }
    update((d) => {
      d.automations.unshift({
        id: uid("aut_"), organizationId: d.organization.id,
        name: newName, trigger: newTrigger,
        conditions: [], actions: [{ type: "notificar_agente", value: "Helena" }],
        active: false, runs: 0, lastRunAt: undefined,
      });
    });
    toast.success(`Automação "${newName}" criada em modo rascunho`);
    setIsNewOpen(false);
    setNewName("");
  };

  const handleDelete = (id: string) => {
    update((d) => { d.automations = d.automations.filter((a) => a.id !== id); });
    toast.success("Automação excluída");
  };

  const TRIGGERS: Record<string, string> = {
    lead_criado: "Lead Criado",
    mensagem_recebida: "Mensagem Recebida",
    deal_movido: "Deal Movido de Etapa",
    sem_resposta_48h: "Sem Resposta (48h)",
    reuniao_agendada: "Reunião Agendada",
    tag_adicionada: "Tag Adicionada",
    campanha_finalizada: "Campanha Finalizada",
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operações"
        title="Automações"
        description="Fluxos de trabalho automáticos — gatilho → condições → ações encadeadas sem código."
        actions={
          <Dialog open={isNewOpen} onOpenChange={setIsNewOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="size-4" /> Nova Automação</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar Automação</DialogTitle>
                <DialogDescription>Configure o gatilho e a Helena vai sugerir as ações automaticamente.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div><label className="text-xs font-medium text-muted-foreground">Nome da Automação</label>
                  <Input placeholder="Ex: Follow-up imediato ao novo lead" value={newName} onChange={(e) => setNewName(e.target.value)} />
                </div>
                <div><label className="text-xs font-medium text-muted-foreground">Gatilho</label>
                  <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={newTrigger} onChange={(e) => setNewTrigger(e.target.value)}>
                    {Object.entries(TRIGGERS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsNewOpen(false)}>Cancelar</Button>
                <Button onClick={handleCreate}>Criar Rascunho</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Ativas" value={active} icon={<CheckCircle2 />} tone="success" />
        <StatCard label="Total de Automações" value={db.automations.length} icon={<Workflow />} tone="info" />
        <StatCard label="Execuções Totais" value={totalRuns.toLocaleString("pt-BR")} icon={<Zap />} tone="helena" />
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
        <Input placeholder="Buscar automação..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {filtered.map((auto) => (
          <div key={auto.id} className="rounded-xl border bg-card p-5 space-y-4 hover:border-foreground/20 transition-all">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold">{auto.name}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-[10px] px-1.5">
                    🎯 {TRIGGERS[auto.trigger] ?? auto.trigger}
                  </Badge>
                </div>
              </div>
              <Switch checked={auto.active} onCheckedChange={(v) => toggleActive(auto.id, v)} />
            </div>

            {auto.actions.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Ações</p>
                {auto.actions.map((action, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <ChevronRight className="size-3 text-primary shrink-0" />
                    <span className="text-muted-foreground capitalize">{action.type.replace(/_/g, " ")}</span>
                    {action.value && <span className="font-medium">{action.value}</span>}
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{auto.runs.toLocaleString("pt-BR")} execuções</span>
              {auto.lastRunAt && <span>Última: {new Date(auto.lastRunAt).toLocaleDateString("pt-BR")}</span>}
            </div>

            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1 h-8 text-xs gap-1">
                <Edit2 className="size-3.5" /> Editar
              </Button>
              <Button size="sm" variant="ghost" className="h-8 px-3 hover:text-destructive" onClick={() => handleDelete(auto.id)}>
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
