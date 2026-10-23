import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Archive, Building2, Clock, Download, Filter, List, MapPin, Plus, Search, Tag, Trash2, Upload, Users,
} from "lucide-react";
import { PageHeader, Panel, StatCard, Status } from "@/components/app/kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useDB, update, uid, nowISO } from "@/lib/store";
import { pageHead } from "@/lib/head";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/prospeccao/listas")({
  head: () => pageHead("Listas de Prospecção", "Gerencie as listas de leads segmentados para campanhas e operações."),
  component: ListasPage,
});

function ListasPage() {
  const db = useDB();
  const [search, setSearch] = useState("");
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSegment, setNewSegment] = useState("");
  const [newIcp, setNewIcp] = useState("");

  const filtered = db.lists.filter((l) =>
    `${l.name} ${l.segment} ${l.icp}`.toLowerCase().includes(search.toLowerCase())
  );

  const totalLeads = db.lists.reduce((s, l) => s + l.count, 0);
  const totalBlacklisted = db.lists.reduce((s, l) => s + l.blacklisted, 0);

  const handleCreate = () => {
    if (!newName.trim()) { toast.error("Nome da lista é obrigatório"); return; }
    update((d) => {
      d.lists.unshift({
        id: uid("l_"), organizationId: d.organization.id,
        name: newName, segment: newSegment || "Geral", icp: newIcp || "Negócios locais sem site",
        count: 0, source: "Manual", blacklisted: 0, createdAt: nowISO(),
      });
    });
    toast.success(`Lista "${newName}" criada!`);
    setIsNewOpen(false);
    setNewName(""); setNewSegment(""); setNewIcp("");
  };

  const handleDelete = (id: string) => {
    update((d) => { d.lists = d.lists.filter((l) => l.id !== id); });
    toast.success("Lista excluída");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Prospecção"
        title="Listas de Leads"
        description="Segmentos de empresas para distribuição entre campanhas e SDRs."
        actions={
          <Dialog open={isNewOpen} onOpenChange={setIsNewOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="size-4" /> Nova Lista</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar Nova Lista</DialogTitle>
                <DialogDescription>Segmente leads por nicho, ICP ou região para disparos precisos.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div><label className="text-xs font-medium text-muted-foreground">Nome da Lista</label>
                  <Input placeholder="Ex: Clínicas Odontológicas SP" value={newName} onChange={(e) => setNewName(e.target.value)} />
                </div>
                <div><label className="text-xs font-medium text-muted-foreground">Segmento</label>
                  <Input placeholder="Ex: Odontologia, Estética, Imobiliário" value={newSegment} onChange={(e) => setNewSegment(e.target.value)} />
                </div>
                <div><label className="text-xs font-medium text-muted-foreground">ICP (Perfil Ideal do Cliente)</label>
                  <Input placeholder="Ex: Clínicas sem Google Meu Negócio otimizado" value={newIcp} onChange={(e) => setNewIcp(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsNewOpen(false)}>Cancelar</Button>
                <Button onClick={handleCreate}>Criar Lista</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Total de Listas" value={db.lists.length} icon={<List />} tone="info" />
        <StatCard label="Total de Leads" value={totalLeads.toLocaleString("pt-BR")} hint="Contatos elegíveis" icon={<Users />} tone="success" />
        <StatCard label="Blocklist / Opt-out" value={totalBlacklisted} hint="Protegidos automaticamente" icon={<Archive />} tone="warning" />
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
        <Input placeholder="Buscar lista..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((list) => (
          <div key={list.id} className="rounded-xl border bg-card p-5 flex flex-col gap-4 hover:border-foreground/20 transition-all">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold">{list.name}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{list.segment}</p>
              </div>
              <Button size="icon" variant="ghost" className="size-7 hover:text-destructive shrink-0" onClick={() => handleDelete(list.id)}>
                <Trash2 className="size-3.5" />
              </Button>
            </div>

            <div className="space-y-1">
              <p className="text-[11px] text-muted-foreground"><span className="font-medium text-foreground">ICP:</span> {list.icp}</p>
              <p className="text-[11px] text-muted-foreground"><span className="font-medium text-foreground">Fonte:</span> {list.source}</p>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-center">
                <div className="text-2xl font-semibold">{list.count.toLocaleString("pt-BR")}</div>
                <div className="text-[10px] text-muted-foreground">leads</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-semibold text-destructive">{list.blacklisted}</div>
                <div className="text-[10px] text-muted-foreground">blocklist</div>
              </div>
              <div className="text-center">
                <div className="text-sm font-semibold text-success">
                  {Math.round(((list.count - list.blacklisted) / (list.count || 1)) * 100)}%
                </div>
                <div className="text-[10px] text-muted-foreground">elegíveis</div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1 text-xs h-8 gap-1">
                <Download className="size-3.5" /> Exportar CSV
              </Button>
              <Button size="sm" className="flex-1 text-xs h-8 gap-1">
                <Upload className="size-3.5" /> Usar na Campanha
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
