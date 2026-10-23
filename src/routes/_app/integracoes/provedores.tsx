import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle, CheckCircle2, Cpu, ExternalLink, RefreshCw, XCircle,
} from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { useDB, update } from "@/lib/store";
import { brl } from "@/lib/format";
import { pageHead } from "@/lib/head";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/integracoes/provedores")({
  head: () => pageHead("Provedores IA", "Gerencie as chaves de API dos provedores de modelos de linguagem."),
  component: ProvedoresPage,
});

const PROVIDER_INFO: Record<string, { color: string; url: string; description: string }> = {
  openai: { color: "bg-green-500/10 text-green-400", url: "https://platform.openai.com", description: "GPT-4o, GPT-4o-mini, GPT-4 Turbo" },
  anthropic: { color: "bg-orange-500/10 text-orange-400", url: "https://console.anthropic.com", description: "Claude 3.5 Sonnet, Claude 3 Haiku" },
  google: { color: "bg-blue-500/10 text-blue-400", url: "https://aistudio.google.com", description: "Gemini 1.5 Pro, Gemini 1.5 Flash" },
  openrouter: { color: "bg-purple-500/10 text-purple-400", url: "https://openrouter.ai", description: "Multi-modelo — Groq, Llama, Mistral" },
};

function ProvedoresPage() {
  const db = useDB();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");

  const connected = db.providers.filter((p) => p.connected).length;
  const totalSpent = db.providers.reduce((s, p) => s + p.spent, 0);
  const totalLimit = db.providers.reduce((s, p) => s + p.monthlyLimit, 0);

  const handleSaveKey = (id: string) => {
    if (!keyInput.trim()) { toast.error("Chave inválida"); return; }
    update((d) => {
      const p = d.providers.find((x) => x.id === id as any);
      if (p) { p.connected = true; p.keyMasked = keyInput.slice(0, 8) + "•".repeat(24); }
    });
    toast.success("Chave salva e provedor conectado!");
    setEditingKey(null);
    setKeyInput("");
  };

  const handleDisconnect = (id: string) => {
    update((d) => {
      const p = d.providers.find((x) => x.id === id as any);
      if (p) { p.connected = false; p.keyMasked = ""; }
    });
    toast.success("Provedor desconectado");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Integrações — IA"
        title="Provedores de Modelos"
        description="Configure as chaves de API de cada provedor de LLM usado pelos agentes."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Conectados" value={connected} icon={<CheckCircle2 />} tone="success" />
        <StatCard label="Gasto Total" value={brl(totalSpent)} hint="Todos os provedores" icon={<Cpu />} tone="info" />
        <StatCard label="Limite Mensal" value={brl(totalLimit)} icon={<AlertTriangle />} tone="warning" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {db.providers.map((prov) => {
          const info = PROVIDER_INFO[prov.id] ?? { color: "bg-muted/30 text-muted-foreground", url: "#", description: "" };
          const pct = prov.monthlyLimit > 0 ? Math.round((prov.spent / prov.monthlyLimit) * 100) : 0;
          return (
            <div key={prov.id} className="rounded-xl border bg-card p-5 space-y-4 hover:border-foreground/20 transition-all">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className={`size-10 rounded-xl ${info.color} flex items-center justify-center font-bold text-sm`}>
                    {prov.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-semibold">{prov.name}</h3>
                    <p className="text-xs text-muted-foreground">{info.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {prov.connected ? (
                    <CheckCircle2 className="size-4 text-success" />
                  ) : (
                    <XCircle className="size-4 text-muted-foreground" />
                  )}
                  <Badge variant={prov.connected ? "default" : "secondary"}>
                    {prov.connected ? "Conectado" : "Desconectado"}
                  </Badge>
                </div>
              </div>

              {prov.connected && (
                <>
                  <div className="font-mono text-xs bg-muted/30 rounded-lg px-3 py-2 text-muted-foreground">
                    {prov.keyMasked || "sk-•••••••••••••••••••••••••••••••"}
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-muted-foreground">Consumo mensal</span>
                      <span>{brl(prov.spent)} / {brl(prov.monthlyLimit)}</span>
                    </div>
                    <Progress value={pct} className="h-1.5" />
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {prov.models.map((m) => <Badge key={m} variant="outline" className="text-[10px] font-mono px-1.5">{m}</Badge>)}
                  </div>
                </>
              )}

              {editingKey === prov.id ? (
                <div className="space-y-2">
                  <Input
                    placeholder="sk-... ou chave do provedor"
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    type="password"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="flex-1 h-8" onClick={() => { setEditingKey(null); setKeyInput(""); }}>Cancelar</Button>
                    <Button size="sm" className="flex-1 h-8" onClick={() => handleSaveKey(prov.id)}>Salvar Chave</Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button size="sm" variant={prov.connected ? "outline" : "default"} className="flex-1 h-8 text-xs gap-1"
                    onClick={() => { setEditingKey(prov.id); setKeyInput(""); }}>
                    {prov.connected ? "Trocar Chave" : "Conectar"}
                  </Button>
                  {prov.connected && (
                    <Button size="sm" variant="ghost" className="h-8 px-3 hover:text-destructive" onClick={() => handleDisconnect(prov.id)}>
                      <XCircle className="size-3.5" />
                    </Button>
                  )}
                  <a href={info.url} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="ghost" className="h-8 px-3">
                      <ExternalLink className="size-3.5" />
                    </Button>
                  </a>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
