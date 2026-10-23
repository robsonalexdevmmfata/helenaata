import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Copy, Eye, EyeOff, KeyRound, Plus, Shield, Trash2, Clock,
} from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useDB, update, uid, nowISO } from "@/lib/store";
import { pageHead } from "@/lib/head";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/integracoes/api")({
  head: () => pageHead("API Keys", "Tokens de acesso à API REST do sistema para integrações externas."),
  component: ApiPage,
});

const SCOPES_OPTIONS = [
  "contacts:read", "contacts:write", "deals:read", "deals:write",
  "conversations:read", "conversations:write", "agents:read", "campaigns:read",
  "reports:read", "webhooks:write",
];

function ApiPage() {
  const db = useDB();
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newScopes, setNewScopes] = useState<string[]>(["contacts:read", "deals:read"]);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);

  const toggleScope = (s: string) =>
    setNewScopes((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);

  const handleCreate = () => {
    if (!newName.trim()) { toast.error("Nome é obrigatório"); return; }
    if (newScopes.length === 0) { toast.error("Selecione pelo menos 1 escopo"); return; }
    const id = uid("tok_");
    const prefix = "hln_live_";
    const full = `${prefix}${Math.random().toString(36).slice(2, 34)}`;
    update((d) => {
      d.apiTokens.unshift({
        id, organizationId: d.organization.id,
        name: newName, prefix: `${prefix}****`, scopes: newScopes, createdAt: nowISO(),
      });
    });
    setGeneratedKey(full);
    toast.success("Token gerado! Copie agora — não será exibido novamente.");
    setIsNewOpen(false);
    setNewName(""); setNewScopes(["contacts:read", "deals:read"]);
  };

  const handleDelete = (id: string) => {
    update((d) => { d.apiTokens = d.apiTokens.filter((t) => t.id !== id); });
    toast.success("Token revogado");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Integrações"
        title="API Keys"
        description="Tokens de acesso seguro para conectar o sistema a ferramentas externas via REST API."
        actions={
          <Dialog open={isNewOpen} onOpenChange={setIsNewOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="size-4" /> Gerar Token</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Gerar API Key</DialogTitle>
                <DialogDescription>O token completo será exibido apenas uma vez. Salve em local seguro.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div><label className="text-xs font-medium text-muted-foreground">Nome do Token</label>
                  <Input placeholder="Ex: n8n Produção" value={newName} onChange={(e) => setNewName(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Escopos de Acesso</label>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {SCOPES_OPTIONS.map((sc) => (
                      <button key={sc} onClick={() => toggleScope(sc)}
                        className={`text-[10px] rounded-md px-2 py-1 border font-mono transition-all ${newScopes.includes(sc) ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/40"}`}>
                        {sc}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsNewOpen(false)}>Cancelar</Button>
                <Button onClick={handleCreate}>Gerar Token</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {generatedKey && (
        <div className="rounded-xl border border-success/40 bg-success/5 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Shield className="size-4 text-success" />
            <p className="font-semibold text-sm text-success">Token gerado com sucesso — copie agora!</p>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-muted p-3 font-mono text-sm break-all">
            <span className="flex-1">{revealed === "new" ? generatedKey : generatedKey.slice(0, 16) + "•".repeat(24)}</span>
            <button onClick={() => setRevealed(revealed === "new" ? null : "new")}>
              {revealed === "new" ? <EyeOff className="size-4 text-muted-foreground" /> : <Eye className="size-4 text-muted-foreground" />}
            </button>
            <button onClick={() => { navigator.clipboard.writeText(generatedKey); toast.success("Copiado!"); }}>
              <Copy className="size-4 text-muted-foreground hover:text-foreground" />
            </button>
          </div>
          <Button size="sm" variant="outline" onClick={() => setGeneratedKey(null)} className="w-full">Confirmo que salvei o token</Button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard label="Tokens Ativos" value={db.apiTokens.length} icon={<KeyRound />} tone="info" />
        <StatCard label="Escopos Possíveis" value={SCOPES_OPTIONS.length} icon={<Shield />} tone="helena" />
      </div>

      <div className="rounded-xl border overflow-hidden">
        <div className="px-4 py-2.5 bg-muted/30 text-[11px] font-semibold text-muted-foreground">Tokens de Acesso</div>
        {db.apiTokens.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Nenhum token gerado ainda.</div>
        ) : (
          db.apiTokens.map((token) => (
            <div key={token.id} className="border-t px-4 py-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="font-semibold text-sm">{token.name}</h4>
                  <p className="text-xs font-mono text-muted-foreground">{token.prefix}••••••••••••••••••••</p>
                </div>
                <Button size="sm" variant="ghost" className="h-7 px-2 hover:text-destructive" onClick={() => handleDelete(token.id)}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-1">
                {token.scopes.map((s) => <Badge key={s} variant="secondary" className="text-[10px] font-mono px-1.5">{s}</Badge>)}
              </div>
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                <Clock className="size-3" />
                <span>Criado em {new Date(token.createdAt).toLocaleDateString("pt-BR")}</span>
                {token.lastUsedAt && <span>· Último uso: {new Date(token.lastUsedAt).toLocaleDateString("pt-BR")}</span>}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
