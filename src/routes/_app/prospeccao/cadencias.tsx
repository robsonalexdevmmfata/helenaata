import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Mail, MessageCircle, Plus, Repeat, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader, StatusBadge } from "@/components/app/kit";
import { uid, update, useDB } from "@/lib/store";
import { pageHead } from "@/lib/head";
import { toast } from "sonner";
import type { CadenceStep, Channel } from "@/lib/types";

export const Route = createFileRoute("/_app/prospeccao/cadencias")({
  head: () => pageHead("Cadências", "Sequências de toques por WhatsApp e e-mail usadas pelos SDRs."),
  component: CadencesPage,
});

const channelIcon = (c: Channel) => (c === "email" ? <Mail className="size-3.5" /> : <MessageCircle className="size-3.5" />);

function CadencesPage() {
  const db = useDB();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [steps, setSteps] = useState<CadenceStep[]>([{ day: 0, channel: "whatsapp", action: "Primeira abordagem" }]);

  const toggle = (id: string, active: boolean) => {
    update((d) => { d.cadences.find((c) => c.id === id)!.active = active; });
    toast.success(active ? "Cadência ativada" : "Cadência desativada");
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || steps.some((s) => !s.action.trim())) return toast.error("Dê um nome e descreva todas as etapas.");
    update((d) => {
      d.cadences.push({ id: uid("cd_"), organizationId: d.organization.id, name: name.trim(), active: true, steps: [...steps].sort((a, b) => a.day - b.day) });
    });
    toast.success("Cadência criada");
    setOpen(false);
    setName("");
    setSteps([{ day: 0, channel: "whatsapp", action: "Primeira abordagem" }]);
  };

  const setStep = (i: number, patch: Partial<CadenceStep>) => setSteps(steps.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Prospecção"
        title="Cadências"
        description="Os SDRs seguem estas sequências e param automaticamente quando o lead responde ou pede para sair."
        actions={<Button onClick={() => setOpen(true)}><Plus /> Nova cadência</Button>}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {db.cadences.map((c) => {
          const used = db.campaigns.filter((x) => x.cadenceId === c.id).length;
          const days = c.steps.at(-1)?.day ?? 0;
          return (
            <div key={c.id} className="rounded-xl border bg-card p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-muted-foreground">{c.steps.length} toques em {days} dias · usada em {used} campanha(s)</div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge tone={c.active ? "success" : "neutral"}>{c.active ? "Ativa" : "Inativa"}</StatusBadge>
                  <Switch checked={c.active} onCheckedChange={(v) => toggle(c.id, v)} aria-label="Ativar cadência" />
                </div>
              </div>
              <ol className="relative mt-5 space-y-4 border-l pl-5">
                {c.steps.map((s, i) => (
                  <li key={i} className="relative">
                    <span className="absolute -left-[27px] top-0.5 flex size-3.5 items-center justify-center rounded-full border-2 border-card bg-helena" />
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-mono">Dia {s.day}</span>·<span className="inline-flex items-center gap-1">{channelIcon(s.channel)} {s.channel === "email" ? "E-mail" : "WhatsApp"}</span>
                    </div>
                    <div className="text-sm">{s.action}</div>
                  </li>
                ))}
              </ol>
            </div>
          );
        })}
      </div>
      {db.cadences.length === 0 && <p className="text-sm text-muted-foreground"><Repeat className="mr-1 inline size-4" />Nenhuma cadência.</p>}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <form onSubmit={save} className="space-y-4">
            <DialogHeader><DialogTitle>Nova cadência</DialogTitle></DialogHeader>
            <div className="space-y-1.5"><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Restaurantes (4 toques)" /></div>
            <div className="space-y-2">
              <Label>Etapas</Label>
              {steps.map((s, i) => (
                <div key={i} className="grid grid-cols-[70px_130px_1fr_auto] gap-2">
                  <Input type="number" min={0} value={s.day} onChange={(e) => setStep(i, { day: Number(e.target.value) })} aria-label="Dia" />
                  <Select value={s.channel} onValueChange={(v) => setStep(i, { channel: v as Channel })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="whatsapp">WhatsApp</SelectItem><SelectItem value="email">E-mail</SelectItem></SelectContent>
                  </Select>
                  <Input value={s.action} onChange={(e) => setStep(i, { action: e.target.value })} placeholder="O que enviar" />
                  <Button type="button" size="icon" variant="ghost" disabled={steps.length === 1} onClick={() => setSteps(steps.filter((_, j) => j !== i))} aria-label="Remover etapa"><Trash2 /></Button>
                </div>
              ))}
              <Button type="button" size="sm" variant="outline" onClick={() => setSteps([...steps, { day: (steps.at(-1)?.day ?? 0) + 2, channel: "whatsapp", action: "" }])}><Plus /> Adicionar etapa</Button>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit">Salvar cadência</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
