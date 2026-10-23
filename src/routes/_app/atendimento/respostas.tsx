import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Copy, MessageSquareQuote, Plus, Search, Trash2, Zap } from "lucide-react";
import { PageHeader, Panel } from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useDB, update, uid } from "@/lib/store";
import { pageHead } from "@/lib/head";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/atendimento/respostas")({
  head: () => pageHead("Respostas Rápidas", "Gerenciamento de snippets e atalhos rápidos para atendimento e vendas."),
  component: RespostasRapidasPage,
});

function RespostasRapidasPage() {
  const db = useDB();
  const [searchTerm, setSearchTerm] = useState("");
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [shortcut, setShortcut] = useState("");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");

  const filteredReplies = db.quickReplies.filter((qr) =>
    `${qr.title} ${qr.shortcut} ${qr.text}`.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCreate = () => {
    if (!title.trim() || !text.trim()) {
      toast.error("Preencha o título e o texto da resposta");
      return;
    }
    const cleanShortcut = shortcut.startsWith("/") ? shortcut : `/${shortcut || title.toLowerCase().slice(0, 6)}`;
    update((d) => {
      d.quickReplies.push({
        id: uid("qr_"),
        organizationId: d.organization.id,
        shortcut: cleanShortcut,
        title,
        text,
      });
    });
    toast.success("Resposta rápida cadastrada com sucesso!");
    setIsNewOpen(false);
    setTitle("");
    setShortcut("");
    setText("");
  };

  const handleDelete = (id: string) => {
    update((d) => {
      d.quickReplies = d.quickReplies.filter((qr) => qr.id !== id);
    });
    toast.success("Resposta rápida excluída");
  };

  const handleCopy = (t: string) => {
    navigator.clipboard.writeText(t);
    toast.success("Texto copiado para a área de transferência!");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Atendimento e Produtividade"
        title="Respostas Rápidas"
        description="Atalhos padronizados que facilitam a resposta dos SDRs e do time de suporte no WhatsApp."
        actions={
          <Dialog open={isNewOpen} onOpenChange={setIsNewOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="size-4" /> Nova Resposta Rápida
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar Resposta Rápida</DialogTitle>
                <DialogDescription>Defina um atalho que poderá ser invocado digitando "/" no chat.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Título de Identificação</label>
                  <Input placeholder="Ex: Tabela de Preços Site" value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Atalho (ex: /precos)</label>
                  <Input placeholder="/precos" value={shortcut} onChange={(e) => setShortcut(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Mensagem Completa</label>
                  <Textarea
                    rows={4}
                    placeholder="Texto completo que será enviado ao lead..."
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsNewOpen(false)}>Cancelar</Button>
                <Button onClick={handleCreate}>Salvar Resposta</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por atalho, título ou conteúdo…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredReplies.map((qr) => (
          <div key={qr.id} className="flex flex-col justify-between rounded-xl border bg-card p-4 transition-all hover:border-foreground/20">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">
                  {qr.shortcut}
                </span>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" className="size-7" onClick={() => handleCopy(qr.text)}>
                    <Copy className="size-3.5 text-muted-foreground" />
                  </Button>
                  <Button size="icon" variant="ghost" className="size-7 hover:text-destructive" onClick={() => handleDelete(qr.id)}>
                    <Trash2 className="size-3.5 text-muted-foreground" />
                  </Button>
                </div>
              </div>
              <h3 className="mt-2 font-medium text-sm">{qr.title}</h3>
              <p className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed line-clamp-4">
                {qr.text}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
