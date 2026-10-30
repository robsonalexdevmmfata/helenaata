import type { ReactElement } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  CheckCircle2, ChevronRight, Edit2, Play, Plus, Search, Tag, Trash2, Workflow, Zap,
  ArrowRight, Clock, Users, MessageSquare, GitBranch,
} from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useDB, update, uid } from "@/lib/store";
import { pageHead } from "@/lib/head";
import { toast } from "sonner";
import type { Automation } from "@/lib/types";

export const Route = createFileRoute("/_app/automacoes")({
  head: () => pageHead("Automações", "Fluxos de automação baseados em gatilhos, condições e ações encadeadas."),
  component: AutomacoesPage,
});

const TRIGGERS: Record<string, { label: string; icon: ReactElement; color: string }> = {
  lead_criado:          { label: "Lead do Maps (sem site)", icon: <Play className="size-3" />,      color: "bg-green-500/10 text-green-600 border-green-200" },
  mensagem_recebida:    { label: "Mensagem Recebida",    icon: <MessageSquare className="size-3" />, color: "bg-blue-500/10 text-blue-600 border-blue-200" },
  deal_movido:          { label: "Deal Movido de Etapa", icon: <GitBranch className="size-3" />,    color: "bg-purple-500/10 text-purple-600 border-purple-200" },
  sem_resposta_48h:     { label: "Sem Resposta (48h)",   icon: <Clock className="size-3" />,        color: "bg-orange-500/10 text-orange-600 border-orange-200" },
  reuniao_agendada:     { label: "Reunião Agendada",     icon: <CheckCircle2 className="size-3" />, color: "bg-teal-500/10 text-teal-600 border-teal-200" },
  tag_adicionada:       { label: "Tag Adicionada",       icon: <Tag className="size-3" />,          color: "bg-pink-500/10 text-pink-600 border-pink-200" },
  campanha_finalizada:  { label: "Campanha Finalizada",  icon: <Zap className="size-3" />,          color: "bg-yellow-500/10 text-yellow-700 border-yellow-200" },
  etapa_alterada:       { label: "Etapa Alterada",       icon: <ArrowRight className="size-3" />,   color: "bg-indigo-500/10 text-indigo-600 border-indigo-200" },
};

const ACTION_LABELS: Record<string, string> = {
  notificar_agente:   "Notificar Agente",
  adicionar_tag:      "Adicionar Tag",
  atribuir_sdr:       "Atribuir SDR",
  enviar_mensagem:    "Enviar Mensagem",
  criar_tarefa:       "Criar Tarefa",
  mover_etapa:        "Mover Etapa",
  atribuir_agente:    "Atribuir Agente",
  webhook:            "Disparar Webhook",
};

// Form state para criar/editar automação
interface AutoForm {
  id?: string;
  name: string;
  trigger: string;
  actions: { type: string; value: string }[];
}

const emptyForm = (): AutoForm => ({
  name: "", trigger: "lead_criado",
  actions: [{ type: "notificar_agente", value: "Helena" }],
});

function AutomacoesPage() {
  const db = useDB();
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<AutoForm>(emptyForm());
  const isEditing = Boolean(form.id);

  const filtered = db.automations.filter((a) =>
    `${a.name} ${a.trigger}`.toLowerCase().includes(search.toLowerCase())
  );

  const active = db.automations.filter((a) => a.active).length;
  const totalRuns = db.automations.reduce((s, a) => s + a.runs, 0);

  const openNew = () => { setForm(emptyForm()); setFormOpen(true); };

  const openEdit = (auto: Automation) => {
    setForm({ id: auto.id, name: auto.name, trigger: auto.trigger, actions: auto.actions.map((a) => ({ ...a })) });
    setFormOpen(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) { toast.error("Nome é obrigatório"); return; }
    if (isEditing) {
      update((d) => {
        const a = d.automations.find((x) => x.id === form.id);
        if (a) { a.name = form.name; a.trigger = form.trigger; a.actions = form.actions; }
      });
      toast.success(`Automação "${form.name}" atualizada`);
    } else {
      update((d) => {
        d.automations.unshift({
          id: uid("aut_"), organizationId: d.organization.id,
          name: form.name, trigger: form.trigger,
          conditions: [], actions: form.actions,
          active: false, runs: 0, lastRunAt: undefined,
        });
      });
      toast.success(`Automação "${form.name}" criada em modo rascunho`);
    }
    setFormOpen(false);
  };

  const toggleActive = (id: string, val: boolean) => {
    update((d) => { const a = d.automations.find((x) => x.id === id); if (a) a.active = val; });
    toast.success(val ? "Automação ativada" : "Automação pausada");
  };

  const handleDelete = (id: string) => {
    update((d) => { d.automations = d.automations.filter((a) => a.id !== id); });
    toast.success("Automação excluída");
  };

  const addAction = () =>
    setForm((f) => ({ ...f, actions: [...f.actions, { type: "adicionar_tag", value: "" }] }));

  const updateAction = (i: number, field: "type" | "value", val: string) =>
    setForm((f) => {
      const actions = [...f.actions];
      actions[i] = { ...actions[i]!, [field]: val };
      return { ...f, actions };
    });

  const removeAction = (i: number) =>
    setForm((f) => ({ ...f, actions: f.actions.filter((_, idx) => idx !== i) }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operações"
        title="Automações"
        description="Varredura no mapa: empresa sem site entra no CRM e o time de IA age no WhatsApp."
        actions={
          <Button className="gap-2" onClick={openNew}>
            <Plus className="size-4" /> Nova Automação
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Ativas" value={active} icon={<CheckCircle2 />} tone="success" />
        <StatCard label="Total de Automações" value={db.automations.length} icon={<Workflow />} tone="info" />
        <StatCard label="Execuções Totais" value={totalRuns.toLocaleString("pt-BR")} icon={<Zap />} tone="helena" />
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
        <Input placeholder="Buscar automação..." value={search}
          onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {filtered.length === 0 && (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          Nenhuma automação encontrada. Crie a primeira clicando em "Nova Automação".
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {filtered.map((auto) => {
          const trig = TRIGGERS[auto.trigger];
          return (
            <div key={auto.id}
              className={`rounded-xl border bg-card p-5 space-y-3 transition-all hover:border-foreground/20 ${!auto.active ? "opacity-75" : ""}`}>

              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm">{auto.name}</h3>
                  {trig && (
                    <span className={`mt-1 inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${trig.color}`}>
                      {trig.icon} {trig.label}
                    </span>
                  )}
                </div>
                <Switch checked={auto.active} onCheckedChange={(v) => toggleActive(auto.id, v)} />
              </div>

              {/* Ações */}
              {auto.actions.length > 0 && (
                <div className="rounded-lg bg-muted/30 px-3 py-2.5 space-y-1.5">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Ações</p>
                  {auto.actions.map((action, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <ChevronRight className="size-3 text-primary shrink-0" />
                      <span className="font-medium text-foreground">
                        {ACTION_LABELS[action.type] ?? action.type.replace(/_/g, " ")}
                      </span>
                      {action.value && (
                        <span className="text-muted-foreground truncate">→ {action.value}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-between gap-2 pt-1">
                <span className="text-[11px] text-muted-foreground">
                  {auto.runs.toLocaleString("pt-BR")} execuções
                  {auto.lastRunAt && ` · Última: ${new Date(auto.lastRunAt).toLocaleDateString("pt-BR")}`}
                </span>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs gap-1"
                    onClick={() => openEdit(auto)}>
                    <Edit2 className="size-3" /> Editar
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2 hover:text-destructive"
                    onClick={() => handleDelete(auto.id)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal Criar / Editar */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEditing ? "Editar Automação" : "Nova Automação"}</DialogTitle>
            <DialogDescription>
              Configure o gatilho e as ações. A Helena executará automaticamente quando a condição for atingida.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Nome */}
            <div className="space-y-1.5">
              <Label>Nome da Automação</Label>
              <Input
                placeholder="Ex: Follow-up imediato ao novo lead"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            {/* Gatilho */}
            <div className="space-y-1.5">
              <Label>Gatilho (QUANDO)</Label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={form.trigger}
                onChange={(e) => setForm({ ...form, trigger: e.target.value })}
              >
                {Object.entries(TRIGGERS).map(([v, t]) => (
                  <option key={v} value={v}>{t.label}</option>
                ))}
              </select>
            </div>

            {/* Ações */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Ações (ENTÃO)</Label>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={addAction}>
                  <Plus className="size-3" /> Adicionar ação
                </Button>
              </div>

              {form.actions.map((action, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <select
                    className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-xs focus:outline-none"
                    value={action.type}
                    onChange={(e) => updateAction(i, "type", e.target.value)}
                  >
                    {Object.entries(ACTION_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                  <Input
                    className="flex-1 h-8 text-xs"
                    placeholder="Valor (agente, tag...)"
                    value={action.value}
                    onChange={(e) => updateAction(i, "value", e.target.value)}
                  />
                  {form.actions.length > 1 && (
                    <Button size="icon" variant="ghost" className="size-8 shrink-0 hover:text-destructive"
                      onClick={() => removeAction(i)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave}>
              {isEditing ? "Salvar alterações" : "Criar Rascunho"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
