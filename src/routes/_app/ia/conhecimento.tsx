import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  BookOpen, Bot, CheckCircle2, Clock, FileText, Globe, Plus, Search, Tag, Trash2, Upload,
} from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useDB, update, uid, nowISO } from "@/lib/store";
import { pageHead } from "@/lib/head";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/ia/conhecimento")({
  head: () => pageHead("Base de Conhecimento", "Documentos e URLs indexados que alimentam o RAG dos agentes."),
  component: ConhecimentoPage,
});

const TYPE_ICON: Record<string, JSX.Element> = {
  PDF: <FileText className="size-4 text-red-400" />,
  DOCX: <FileText className="size-4 text-blue-400" />,
  TXT: <FileText className="size-4 text-muted-foreground" />,
  CSV: <FileText className="size-4 text-green-400" />,
  URL: <Globe className="size-4 text-primary" />,
};

function ConhecimentoPage() {
  const db = useDB();
  const [search, setSearch] = useState("");
  const [collection, setCollection] = useState("todas");

  const collections = ["todas", ...Array.from(new Set(db.knowledge.map((k) => k.collection)))];

  const filtered = db.knowledge.filter((k) => {
    const matchSearch = `${k.name} ${k.collection}`.toLowerCase().includes(search.toLowerCase());
    const matchCol = collection === "todas" || k.collection === collection;
    return matchSearch && matchCol;
  });

  const indexed = db.knowledge.filter((k) => k.status === "indexado").length;
  const totalChunks = db.knowledge.reduce((s, k) => s + k.chunks, 0);
  const avgAgents = db.knowledge.reduce((s, k) => s + k.agentIds.length, 0);

  const handleDelete = (id: string) => {
    update((d) => { d.knowledge = d.knowledge.filter((k) => k.id !== id); });
    toast.success("Documento removido da base de conhecimento");
  };

  const handleUploadSim = () => {
    const types = ["PDF", "DOCX", "TXT", "URL"] as const;
    const names = ["Playbook de Vendas 2026.pdf", "Objeções e Respostas.docx", "FAQ Clientes.txt", "https://site.exemplo.com.br/sobre"];
    const idx = Math.floor(Math.random() * names.length);
    const name = names[idx]!;
    const type = types[idx]!;
    update((d) => {
      d.knowledge.unshift({
        id: uid("kd_"), organizationId: d.organization.id,
        name, type, size: Math.round(Math.random() * 500000),
        collection: "Vendas", status: "indexando", chunks: 0,
        uploadedAt: nowISO(), agentIds: [],
      });
    });
    toast.success("Upload iniciado — indexando...");
    setTimeout(() => {
      update((d) => {
        const doc = d.knowledge.find((k) => k.status === "indexando");
        if (doc) { doc.status = "indexado"; doc.chunks = Math.floor(Math.random() * 200) + 20; }
      });
      toast.success("Documento indexado e disponível para agentes!");
    }, 2000);
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "URL";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="IA — RAG"
        title="Base de Conhecimento"
        description="Documentos e URLs indexados via RAG — cada agente consulta automaticamente durante as conversas."
        actions={
          <Button className="gap-2" onClick={handleUploadSim}>
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
              <Badge variant={doc.status === "indexado" ? "default" : doc.status === "indexando" ? "outline" : "destructive"} className="text-[10px]">
                {doc.status}
              </Badge>
              <Button size="icon" variant="ghost" className="size-7 hover:text-destructive" onClick={() => handleDelete(doc.id)}>
                <Trash2 className="size-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
