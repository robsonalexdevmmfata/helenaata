import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Copy, MessageSquareQuote, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, PageHeader } from "@/components/app/kit";
import { uid, update, useDB } from "@/lib/store";
import { pageHead } from "@/lib/head";
import { toast } from "sonner";
import type { QuickReply } from "@/lib/types";

export const Route = createFileRoute("/_app/atendimento/respostas")({
  head: () => pageHead("Respostas rápidas", "Atalhos de mensagens usados por humanos e agentes no atendimento."),
  component: QuickRepliesPage,
});

function QuickRepliesPage() {
  const db = useDB();
  const [editing, setEditing] = useState<QuickReply | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ shortcut: "", title: "", text: "" });
  const [q, setQ] = useState("");

  const list = db.quickReplies.filter((r) => `${r.shortcut} ${r.title} ${r.text}`.toLowerCase().includes(q.toLowerCase()));

  const openForm = (r?: QuickReply) => {
    setEditing(r ?? null);
    setForm(r ? { shortcut: r.shortcut, title: r.title, text: r.text } : { shortcut: "/", title: "", text: "" });
    setOpen(true);
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    const shortcut = form.shortcut.startsWith("/") ? form.shortcut.trim() : `/${form.shortcut.trim()}`;
    if (shortcut.length < 2 || !form.title.trim() || !form.text.trim()) return toast.error("Preencha atalho, título e mensagem.");
    if (db.quickReplies.some((r) => r.shortcut === shortcut && r.id !== editing?.id)) return toast.error("Esse atalho já existe.");
    update((d) => {
      if (editing) Object.assign(d.quickReplies.find((r) => r.id === editing.id)!, { ...form, shortcut });
      else d.quickReplies.unshift({ id: uid("q_"), organizationId: d.organization.id, ...form, shortcut });
    });
    toast.success(editing ? "Resposta atualizada" : "Resposta criada");
    setOpen(false);
  };

  const remove = (r: QuickReply) => {
    update((d) => { d.quickReplies = d.quickReplies.filter((x) => x.id !== r.id); });
    toast.success(`${r.shortcut} removida`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Atendimento"
        title="Respostas rápidas"
        description="Digite / no Inbox para usar. Os agentes de IA também usam estes textos como referência."
        actions={<Button onClick={() => openForm()}><Plus /> Nova resposta</Button>}
      />
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por atalho, título ou texto..." className="max-w-sm" />
      {list.length === 0 ? (
        <EmptyState icon={<MessageSquareQuote />} title="Nenhuma resposta encontrada" action={<Button size="sm" onClick={() => openForm()}><Plus /> Criar</Button>} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.map((r) => (
            <div key={r.id} className="group rounded-xl border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="rounded bg-helena/10 px-1.5 py-0.5 font-mono text-xs text-helena">{r.shortcut}</span>
                  <div className="mt-1.5 text-sm font-medium">{r.title}</div>
                </div>
                <div className="flex gap-0.5 opacity-70 group-hover:opacity-100">
                  <Button size="icon" variant="ghost" className="size-7" aria-label="Copiar" onClick={() => { void navigator.clipboard?.writeText(r.text); toast.success("Copiado"); }}><Copy /></Button>
                  <Button size="icon" variant="ghost" className="size-7" aria-label="Editar" onClick={() => openForm(r)}><Pencil /></Button>
                  <Button size="icon" variant="ghost" className="size-7 text-destructive" aria-label="Excluir" onClick={() => remove(r)}><Trash2 /></Button>
                </div>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{r.text}</p>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form onSubmit={save} className="space-y-4">
            <DialogHeader><DialogTitle>{editing ? "Editar resposta" : "Nova resposta rápida"}</DialogTitle></DialogHeader>
            <div className="grid grid-cols-[120px_1fr] gap-3">
              <div className="space-y-1.5"><Label>Atalho</Label><Input value={form.shortcut} onChange={(e) => setForm({ ...form, shortcut: e.target.value })} placeholder="/prazo" /></div>
              <div className="space-y-1.5"><Label>Título</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Prazo de entrega" /></div>
            </div>
            <div className="space-y-1.5"><Label>Mensagem</Label><Textarea rows={5} value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit">Salvar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
