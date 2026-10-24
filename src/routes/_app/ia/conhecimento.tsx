import type { ReactElement } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  BookOpen, Bot, CheckCircle2, FileText, Globe, Search, Trash2, Upload,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PageHeader, StatCard } from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useDB, update, uid, nowISO } from "@/lib/store";
import { pageHead } from "@/lib/head";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/ia/conhecimento")({
  head: () => pageHead("Base de Conhecimento", "Documentos e URLs indexados que alimentam o RAG dos agentes."),
  component: ConhecimentoPage,
});

const TYPE_ICON: Record<string, ReactElement> = {
  PDF:  <FileText className="size-4 text-red-400" />,
  DOCX: <FileText className="size-4 text-blue-400" />,
  TXT:  <FileText className="size-4 text-muted-foreground" />,
  CSV:  <FileText className="size-4 text-green-400" />,
  URL:  <Globe className="size-4 text-primary" />,
};

function ConhecimentoPage() {
  const db = useDB();
  const [search, setSearch] = useState("");
  const [collection, setCollection] = useState("todas");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    name: "",
    type: "PDF" as "PDF" | "DOCX" | "TXT" | "CSV" | "URL",
    collection: "Vendas",
    agentIds: [] as string[],
  });

  const collections = ["todas", ...Array.from(new Set(db.knowledge.map((k) => k.collection)))];

  const filtered = db.knowledge.filter((k) => {
    const matchSearch = `${k.name} ${k.collection}`.toLowerCase().includes(search.toLowerCase());
    const matchCol = collection === "todas" || k.collection === collection;
    return matchSearch && matchCol;
  });

  const indexed = db.knowledge.filter((k) => k.status === "indexado").length;
  const totalChunks = db.knowledge.reduce((s, k) => s + k.chunks, 0);
  const avgAgents = db.knowledge.reduce((s, k) => s + k.agentIds.length, 0);

  const handleUpload = (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadForm.name.trim()) return toast.error("Informe o nome ou URL do documento.");
    const isUrl = uploadForm.type === "URL";
    const id = uid("kd_");
    update((d) => {
      d.knowledge.unshift({
        id, organizationId: d.organization.id,
        name: uploadForm.name.trim(),
        type: uploadForm.type,
        size: isUrl ? 0 : Math.round(Math.random() * 500_000) + 50_000,
        collection: uploadForm.collection,
        status: "indexando",
        chunks: 0,
        uploadedAt: nowISO(),
        agentIds: uploadForm.agentIds,
      });
    });
    toast.success("Upload iniciado — indexando documento...");
    setUploadOpen(false);
    setUploadForm({ name: "", type: "PDF", collection: "Vendas", agentIds: [] });
    setTimeout(() => {
      update((d) => {
        const doc = d.knowledge.find((k) => k.id === id);
        if (doc) { doc.status = "indexado"; doc.chunks = Math.floor(Math.random() * 200) + 20; }
      });
      toast.success("Documento indexado e disponível para os agentes!");
    }, 2000);
  };

  const handleDelete = (id: string) => {
    update((d) => { d.knowledge = d.knowledge.filter((k) => k.id !== id); });
    toast.success("Documento removido da base de conhecimento");
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "URL";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1_048_576) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / 1_048_576).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="IA — RAG"
        title="Base de Conhecimento"
        description="Documentos e URLs indexados via RAG — cada agente consulta automaticamente durante as conversas."
        actions={
          <Button className="gap-2" onClick={() => setUploadOpen(true)}>
            <Upload className="size-4" /> Upload / Adicionar URL
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Documentos Indexados" value={indexed} icon={<CheckCircle2 />} tone="success" />
        <StatCard label="Total de Chunks" value={totalChunks.toLocaleString("pt-BR")} hint="Fragmentos para RAG" icon={<BookOpen />} tone="info" />
        <StatCard label="Usos por Agentes" value={avgAgents} icon={<Bot />} tone="helena" />
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input placeholder="Buscar documento..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {collections.map((c) => (
            <Button key={c} size="sm" variant={collection === c ? "default" : "outline"} className="h-9 text-xs" onClick={() => setCollection(c)}>
              {c}
            </Button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border overflow-hidden">
        <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-x-4 px-4 py-2.5 bg-muted/30 text-[11px] font-semibold text-muted-foreground">
          <span>Tipo</span><span>Documento</span><span>Coleção</span><span>Tamanho</span><span>Chunks</span><span>Status</span>
        </div>
        {filtered.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            Nenhum documento encontrado. Clique em "Upload / Adicionar URL" para começar.
          </div>
        )}
        {filtered.map((doc) => (
          <div key={doc.id} className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-x-4 items-center px-4 py-3 border-t hover:bg-muted/20 transition-colors">
            <span className="shrink-0">{TYPE_ICON[doc.type] ?? <FileText className="size-4" />}</span>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{doc.name}</p>
              <p className="text-[10px] text-muted-foreground">{new Date(doc.uploadedAt).toLocaleDateString("pt-BR")}</p>
            </div>
            <Badge variant="outline" className="text-[10px] px-1.5">{doc.collection}</Badge>
            <span className="text-xs text-muted-foreground tabular-nums">{formatSize(doc.size)}</span>
            <span className="text-xs font-semibold tabular-nums">{doc.chunks}</span>
            <div className="flex items-center gap-2">
              <Badge
                variant={doc.status === "indexado" ? "default" : doc.status === "indexando" ? "outline" : "destructive"}
                className="text-[10px]"
              >
                {doc.status}
              </Badge>
              <Button size="icon" variant="ghost" className="size-7 hover:text-destructive" onClick={() => handleDelete(doc.id)}>
                <Trash2 className="size-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal: Upload / Adicionar URL */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="size-5 text-primary" /> Adicionar Documento ou URL
            </DialogTitle>
            <DialogDescription>
              Faça upload de um arquivo ou adicione uma URL para indexar via RAG. Os agentes consultarão automaticamente durante as conversas.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpload} className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select
                value={uploadForm.type}
                onValueChange={(v) => setUploadForm({ ...uploadForm, type: v as typeof uploadForm.type })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PDF">PDF</SelectItem>
                  <SelectItem value="DOCX">DOCX (Word)</SelectItem>
                  <SelectItem value="TXT">TXT (texto simples)</SelectItem>
                  <SelectItem value="CSV">CSV (planilha)</SelectItem>
                  <SelectItem value="URL">URL (página web)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{uploadForm.type === "URL" ? "URL do documento" : "Nome do arquivo"}</Label>
              <Input
                placeholder={uploadForm.type === "URL" ? "https://seusite.com.br/sobre" : "Ex: Tabela de Preços 2026.pdf"}
                value={uploadForm.name}
                onChange={(e) => setUploadForm({ ...uploadForm, name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Coleção (tag de agrupamento)</Label>
              <Select
                value={uploadForm.collection}
                onValueChange={(v) => setUploadForm({ ...uploadForm, collection: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Vendas", "Produtos e preços", "ICP", "Objeções", "Políticas", "Suporte", "RH"].map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Atribuir aos agentes (opcional)</Label>
              <div className="flex flex-wrap gap-1.5 rounded-lg border p-2 min-h-[40px]">
                {db.agents.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => {
                      const ids = uploadForm.agentIds.includes(a.id)
                        ? uploadForm.agentIds.filter((x) => x !== a.id)
                        : [...uploadForm.agentIds, a.id];
                      setUploadForm({ ...uploadForm, agentIds: ids });
                    }}
                    className={`px-2 py-1 rounded-md text-xs transition-colors ${
                      uploadForm.agentIds.includes(a.id)
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {a.name}
                  </button>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setUploadOpen(false)}>Cancelar</Button>
              <Button type="submit" className="gap-2">
                <Upload className="size-4" /> Adicionar e Indexar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
