import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Calendar, CheckCircle2, Clock, Edit2, MessageCircle, Plus, Repeat, Trash2, Zap,
} from "lucide-react";
import { PageHeader, StatCard, Status } from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useDB, update, uid, nowISO } from "@/lib/store";
import { pageHead } from "@/lib/head";
import { toast } from "sonner";
import type { Cadence, CadenceStep, Channel } from "@/lib/types";

export const Route = createFileRoute("/_app/prospeccao/cadencias")({
  head: () => pageHead("Cadências", "Configure as sequências de follow-up automáticas dos SDR Agents."),
  component: CadenciasPage,
});

const CHANNELS: Channel[] = ["whatsapp", "instagram", "email"];

function CadenciasPage() {
  const db = useDB();
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [steps, setSteps] = useState<CadenceStep[]>([
    { day: 1, channel: "whatsapp", action: "Primeiro contato personalizado com apresentação de benefícios" },
    { day: 3, channel: "whatsapp", action: "Follow-up com proposta de valor + depoimento de cliente" },
    { day: 7, channel: "instagram", action: "DM de reativação com oferta especial limitada" },
  ]);

  const addStep = () =>
    setSteps((s) => [...s, { day: s.length > 0 ? s[s.length - 1]!.day + 2 : 1, channel: "whatsapp", action: "" }]);
  const removeStep = (i: number) => setSteps((s) => s.filter((_, idx) => idx !== i));

  const handleCreate = () => {
    if (!newName.trim()) { toast.error("Nome da cadência é obrigatório"); return; }
    if (steps.length === 0) { toast.error("Adicione pelo menos 1 passo"); return; }
    update((d) => {
      d.cadences.unshift({ id: uid("cad_"), organizationId: d.organization.id, name: newName, steps, active: true });
    });
    toast.success(`Cadência "${newName}" criada!`);
    setIsNewOpen(false);
    setNewName("");
    setSteps([{ day: 1, channel: "whatsapp", action: "" }]);
  };

  const toggleActive = (id: string, val: boolean) => {
    update((d) => { const c = d.cadences.find((x) => x.id === id); if (c) c.active = val; });
    toast.success(val ? "Cadência ativada" : "Cadência pausada");
  };

  const totalSteps = db.cadences.reduce((s, c) => s + c.steps.length, 0);
  const active = db.cadences.filter((c) => c.active).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Prospecção"
        title="Cadências de Follow-up"
        description="Sequências multicanal que o SDR Agent executa automaticamente — até fechar a reunião."
        actions={
          <Dialog open={isNewOpen} onOpenChange={setIsNewOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="size-4" /> Nova Cadência</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Criar Cadência de Follow-up</DialogTitle>
                <DialogDescription>Defina a sequência de passos que os SDRs vão executar automaticamente após o primeiro contato.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto pr-1">
                <div><label className="text-xs font-medium text-muted-foreground">Nome da Cadência</label>
                  <Input placeholder="Ex: Clínicas — 7 dias multicanal" value={newName} onChange={(e) => setNewName(e.target.value)} />
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-muted-foreground">Passos da Cadência</label>
                    <Button size="sm" variant="outline" onClick={addStep} className="h-7 text-xs gap-1">
                      <Plus className="size-3" /> Passo
                    </Button>
                  </div>
                  {steps.map((step, i) => (
                    <div key={i} className="rounded-lg border p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}</span>
                        <div className="flex gap-2 flex-1">
                          <Input type="number" min={1} max={90} value={step.day} onChange={(e) => { const s = [...steps]; if (s[i]) s[i]!.day = Number(e.target.value); setSteps(s); }}
                            className="w-20" placeholder="Dia" />
                          <select className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm" value={step.channel}
                            onChange={(e) => { const s = [...steps]; if (s[i]) s[i]!.channel = e.target.value as Channel; setSteps(s); }}>
                            {CHANNELS.map((ch) => <option key={ch} value={ch}>{ch}</option>)}
                          </select>
                          <Button size="icon" variant="ghost" className="size-8 hover:text-destructive" onClick={() => removeStep(i)}>
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                      <Input placeholder="Ação / mensagem do passo..." value={step.action}
                        onChange={(e) => { const s = [...steps]; if (s[i]) s[i]!.action = e.target.value; setSteps(s); }} />
                    </div>
                  ))}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsNewOpen(false)}>Cancelar</Button>
                <Button onClick={handleCreate}>Criar Cadência</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Cadências Ativas" value={active} icon={<Repeat />} tone="success" />
        <StatCard label="Total de Passos" value={totalSteps} hint="Somando todas as cadências" icon={<CheckCircle2 />} tone="info" />
        <StatCard label="Canais Cobertos" value="WA + IG + Email" icon={<MessageCircle />} tone="helena" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {db.cadences.map((cad) => (
          <div key={cad.id} className="rounded-xl border bg-card p-5 space-y-4 hover:border-foreground/20 transition-all">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold">{cad.name}</h3>
                <p className="text-xs text-muted-foreground">{cad.steps.length} passos · {cad.steps[cad.steps.length - 1]?.day ?? 0} dias</p>
              </div>
              <Badge variant={cad.active ? "default" : "secondary"} className="shrink-0">
                {cad.active ? "Ativa" : "Pausada"}
              </Badge>
            </div>

            <div className="space-y-2">
              {cad.steps.map((s, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold">{i + 1}</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">{s.channel}</Badge>
                      <span className="text-[10px] text-muted-foreground">Dia {s.day}</span>
                    </div>
                    <p className="text-xs mt-0.5 text-muted-foreground line-clamp-1">{s.action}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1 h-8 gap-1 text-xs" onClick={() => toggleActive(cad.id, !cad.active)}>
                {cad.active ? <><Clock className="size-3.5" /> Pausar</> : <><Zap className="size-3.5" /> Ativar</>}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
