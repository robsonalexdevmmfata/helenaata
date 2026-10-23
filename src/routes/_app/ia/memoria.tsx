import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Brain, Clock, MessageCircle, Plus, Search, Tag, Trash2, TrendingUp,
} from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useDB, update, uid, nowISO } from "@/lib/store";
import { pageHead } from "@/lib/head";
import { toast } from "sonner";
import type { MemoryType } from "@/lib/types";

export const Route = createFileRoute("/_app/ia/memoria")({
  head: () => pageHead("Memória IA", "Memórias de curto e longo prazo dos agentes — contexto persistente entre sessões."),
  component: MemoriaPage,
});

const MEMORY_TYPES: { value: MemoryType; label: string; color: string }[] = [
  { value: "permanente", label: "Permanente", color: "default" },
  { value: "operacional", label: "Operacional", color: "outline" },
  { value: "conversa", label: "Conversa", color: "secondary" },
  { value: "documental", label: "Documental", color: "outline" },
];

function MemoriaPage() {
  const db = useDB();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<string>("permanente");
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newType, setNewType] = useState<MemoryType>("permanente");
  const [newSource, setNewSource] = useState("");

  const filtered = db.memories.filter((m) => {
    const matchSearch = `${m.title} ${m.content} ${m.source}`.toLowerCase().includes(search.toLowerCase());
    const matchTab = m.type === tab;
    return matchSearch && matchTab;
  });

  const byType = (type: MemoryType) => db.memories.filter((m) => m.type === type).length;

  const handleCreate = () => {
    if (!newTitle.trim()) { toast.error("Título é obrigatório"); return; }
    if (!newContent.trim()) { toast.error("Conteúdo é obrigatório"); return; }
    update((d) => {
      d.memories.unshift({
        id: uid("mem_"), organizationId: d.organization.id,
        type: newType, title: newTitle, content: newContent,
        source: newSource || "Manual", createdAt: nowISO(), updatedAt: nowISO(),
      });
    });
    toast.success("Memória criada!");
    setIsNewOpen(false);
    setNewTitle(""); setNewContent(""); setNewSource("");
  };

  const handleDelete = (id: string) => {
    update((d) => { d.memories = d.memories.filter((m) => m.id !== id); });
    toast.success("Memória apagada");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="IA"
        title="Memória"
        description="Contexto persistente entre sessões — a Helena e os agentes lembram do que importa."
        actions={
          <Dialog open={isNewOpen} onOpenChange={setIsNewOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="size-4" /> Nova Memória</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar Memória Manualmente</DialogTitle>
                <DialogDescription>Adicione contexto que os agentes devem lembrar permanentemente.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div><label className="text-xs font-medium text-muted-foreground">Tipo</label>
                  <Select value={newType} onValueChange={(v) => setNewType(v as MemoryType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{MEMORY_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><label className="text-xs font-medium text-muted-foreground">Título</label>
                  <Input placeholder="Ex: Política de desconto máximo" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
                </div>
                <div><label className="text-xs font-medium text-muted-foreground">Conteúdo</label>
                  <Textarea placeholder="Descreva o conteúdo da memória..." value={newContent} onChange={(e) => setNewContent(e.target.value)} rows={4} />
                </div>
                <div><label className="text-xs font-medium text-muted-foreground">Fonte</label>
                  <Input placeholder="Ex: Gestor, Playbook 2026, Auto-aprendizado" value={newSource} onChange={(e) => setNewSource(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsNewOpen(false)}>Cancelar</Button>
                <Button onClick={handleCreate}>Criar Memória</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="grid gap-3 sm:grid-cols-4">
        {MEMORY_TYPES.map((t) => (
          <StatCard key={t.value} label={t.label} value={byType(t.value)} icon={<Brain />} tone={t.value === "permanente" ? "helena" : "info"} />
        ))}
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input placeholder="Buscar memória..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          {MEMORY_TYPES.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>{t.label} ({byType(t.value)})</TabsTrigger>
          ))}
        </TabsList>

        {MEMORY_TYPES.map((t) => (
          <TabsContent key={t.value} value={t.value} className="mt-4 space-y-3">
            {filtered.length === 0 ? (
              <div className="rounded-xl border bg-card p-10 text-center">
                <Brain className="size-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm font-medium">Sem memórias do tipo "{t.label}"</p>
              </div>
            ) : (
              filtered.map((mem) => (
                <div key={mem.id} className="rounded-xl border bg-card p-4 flex gap-3 hover:border-foreground/20 transition-all">
                  <Brain className="size-4 text-primary mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-semibold text-sm">{mem.title}</h4>
                      <Button size="icon" variant="ghost" className="size-7 hover:text-destructive shrink-0" onClick={() => handleDelete(mem.id)}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{mem.content}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <Tag className="size-3 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground">{mem.source}</span>
                      <Clock className="size-3 text-muted-foreground ml-auto" />
                      <span className="text-[10px] text-muted-foreground">{new Date(mem.updatedAt).toLocaleDateString("pt-BR")}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
