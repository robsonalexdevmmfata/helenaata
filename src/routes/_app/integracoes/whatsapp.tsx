import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  AlertTriangle, CheckCircle2, Copy, ExternalLink, Globe, KeyRound,
  MessageCircle, Plus, QrCode, RefreshCw, Settings2, Smartphone,
  Webhook, Wifi, WifiOff, Zap, ClipboardList, Info,
} from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { currentUser, useDB, update, uid, nowISO } from "@/lib/store";
import { provisionEvolutionInstance } from "@/lib/evolution/provision";
import { pageHead } from "@/lib/head";
import { toast } from "sonner";
import {
  getEvolutionConfigUI, saveEvolutionConfigUI,
  testEvolutionConnection, evolutionSetWebhook, evolutionGetWebhook,
  type EvolutionConfig,
} from "@/lib/evolution/evolutionapi";

export const Route = createFileRoute("/_app/integracoes/whatsapp")({
  head: () => pageHead("WhatsApp · Evolution API", "Conecte o número da agência via Evolution API para prospecção e atendimento real."),
  component: WhatsAppPage,
});

const STATUS_CONFIG = {
  online:     { label: "Online",       icon: <Wifi className="size-4 text-success" />,                   badge: "default"    as const },
  offline:    { label: "Offline",      icon: <WifiOff className="size-4 text-muted-foreground" />,        badge: "secondary"  as const },
  conectando: { label: "Conectando...",icon: <RefreshCw className="size-4 text-warning animate-spin" />,  badge: "outline"    as const },
};

// ── Copia para clipboard ──────────────────────────────────────────────────────
function copyText(text: string, label: string) {
  navigator.clipboard.writeText(text).then(() => toast.success(`${label} copiado!`));
}

// ── Painel de configuração da Evolution API ───────────────────────────────────
function EvolutionPanel() {
  const [cfg, setCfg] = useState<EvolutionConfig>(getEvolutionConfigUI);
  const [testing, setTesting]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSaving, setWebhookSaving] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{
    ok: boolean; connected: boolean; message: string; number?: string; latencyMs?: number;
  } | null>(null);

  useEffect(() => {
    const user = currentUser();
    if (user) {
      void provisionEvolutionInstance(user).then(() => {
        setCfg(getEvolutionConfigUI());
      });
    }
    evolutionGetWebhook().then((res) => {
      if (res.ok && res.url) setWebhookUrl(res.url);
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    saveEvolutionConfigUI(cfg);
    toast.success("Configuração salva!");
    setSaving(false);
  };

  const handleTest = async () => {
    setTesting(true);
    setConnectionStatus(null);
    const result = await testEvolutionConnection(cfg);
    setConnectionStatus(result);
    setTesting(false);
    if (result.connected) {
      // Sincroniza o número no store se encontrado
      if (result.number) {
        update((d) => {
          const conn = d.connections.find((c) => /info tech/i.test(c.name) || c.id === "wa_agency") ?? d.connections[0];
          if (conn) {
            conn.status = "online";
            conn.name = "agência info tech";
            conn.phone = result.number!.replace(/\D/g, "").replace(/^55/, "+55 ");
            conn.lastSyncAt = nowISO();
          } else {
            d.connections.unshift({
              id: uid("wa_agency_"),
              organizationId: d.organization.id,
              name: "agência info tech",
              phone: result.number!,
              type: "cloud_api",
              status: "online",
              queue: 0,
              sentToday: 0,
              dailyLimit: 1000,
              lastSyncAt: nowISO(),
            });
          }
        });
      }
      toast.success("Evolution API conectada! Número sincronizado.");
    } else {
      toast.error(result.message);
    }
  };

  const handleSetWebhook = async () => {
    if (!webhookUrl.trim()) return toast.error("Informe a URL do webhook n8n.");
    if (!webhookUrl.startsWith("http")) return toast.error("URL deve começar com http:// ou https://");
    setWebhookSaving(true);
    const res = await evolutionSetWebhook(webhookUrl, cfg);
    setWebhookSaving(false);
    if (res.ok) {
      saveEvolutionConfigUI(cfg);
      toast.success("Webhook configurado na Evolution API!");
    } else {
      toast.error(`Falha ao configurar webhook: ${res.error}`);
    }
  };

  return (
    <div className="space-y-6">

      {/* Banner status */}
      {connectionStatus && (
        <div className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${
          connectionStatus.connected
            ? "bg-success/5 border-success/30 text-success"
            : connectionStatus.ok
            ? "bg-warning/5 border-warning/30 text-warning"
            : "bg-destructive/5 border-destructive/30 text-destructive"
        }`}>
          {connectionStatus.connected
            ? <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
            : <AlertTriangle className="size-4 shrink-0 mt-0.5" />}
          <div className="flex-1">
            <p className="font-medium">{connectionStatus.message}</p>
            {connectionStatus.number && (
              <p className="text-xs mt-0.5 opacity-80">Número: {connectionStatus.number} · {connectionStatus.latencyMs}ms</p>
            )}
          </div>
        </div>
      )}

      {/* Credenciais */}
      <section className="rounded-xl border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound className="size-4 text-primary" />
          <h3 className="font-semibold text-sm">Credenciais da Evolution API</h3>
        </div>

        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label>URL da Evolution API</Label>
            <div className="flex gap-2">
              <Input
                value={cfg.baseUrl}
                onChange={(e) => setCfg({ ...cfg, baseUrl: e.target.value })}
                placeholder="vazio = WhatsApp do Render (sem VPS)"
                className="font-mono text-sm"
              />
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                onClick={() => window.open(cfg.baseUrl, "_blank")}
                title="Abrir painel Evolution"
              >
                <ExternalLink className="size-3.5" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Sem VPS: deixe vazio — o Render fala com o WhatsApp nativo (QR nesta página). Com Evolution na VPS, cole a URL (ex. <code className="font-mono bg-muted px-1 rounded">https://evo.seudominio.com.br</code>).
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Global API Key</Label>
            <div className="flex gap-2">
              <Input
                type="password"
                value={cfg.apiKey}
                onChange={(e) => setCfg({ ...cfg, apiKey: e.target.value })}
                placeholder="Cole a Global API Key do painel Evolution"
                className="font-mono text-sm"
              />
              {cfg.apiKey && (
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => copyText(cfg.apiKey, "API Key")}
                >
                  <Copy className="size-3.5" />
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Encontre em: <strong>Evolution Painel → Settings → API Key</strong> (a mesma que você usa no Postman)
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Nome da Instância</Label>
            <Input
              value={cfg.instance}
              onChange={(e) => setCfg({ ...cfg, instance: e.target.value })}
              placeholder="helena"
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              O nome da instância que você criou no painel. Conforme print: <code className="font-mono bg-muted px-1 rounded">helena</code>
            </p>
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <Button
            className="gap-2"
            onClick={handleTest}
            disabled={testing || !cfg.apiKey}
          >
            {testing
              ? <><RefreshCw className="size-3.5 animate-spin" /> Testando...</>
              : <><Zap className="size-3.5" /> Testar Conexão</>}
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={handleSave}
            disabled={saving}
          >
            Salvar Configuração
          </Button>
        </div>
      </section>

      {/* Webhook / n8n */}
      <section className="rounded-xl border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Webhook className="size-4 text-primary" />
          <h3 className="font-semibold text-sm">Webhook — Receber Mensagens</h3>
        </div>

        <div className="rounded-lg bg-muted/40 p-3.5 text-xs space-y-2 border">
          <div className="flex items-center gap-1.5 font-semibold text-foreground">
            <Info className="size-3.5 text-primary" /> Como funciona
          </div>
          <p className="text-muted-foreground leading-relaxed">
            Configure o webhook da Evolution API para apontar para o seu <strong>n8n</strong>. Quando um cliente responder no WhatsApp, a Evolution enviará um POST para o n8n, que repassa para a Helena processar e responder automaticamente.
          </p>
          <div className="font-mono bg-background/80 p-2 rounded border text-[11px] leading-relaxed">
            WhatsApp (cliente)
            → Evolution API
            → n8n Webhook Trigger
            → Helena AI (processa + gera resposta)
            → Evolution API /message/sendText
            → WhatsApp (cliente)
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>URL do Webhook n8n</Label>
          <div className="flex gap-2">
            <Input
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="http://localhost:5678/webhook/evolution"
              className="font-mono text-sm"
            />
            <Button
              className="shrink-0 gap-2"
              onClick={handleSetWebhook}
              disabled={webhookSaving || !webhookUrl || !cfg.apiKey}
            >
              {webhookSaving
                ? <RefreshCw className="size-3.5 animate-spin" />
                : <Webhook className="size-3.5" />}
              {webhookSaving ? "Salvando..." : "Configurar"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            No n8n: crie um nó <strong>Webhook Trigger</strong> (POST) e cole a URL gerada aqui.
          </p>
        </div>

        {/* Fluxo n8n copyable */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-foreground">Fluxo n8n — 4 nós necessários:</p>
          {[
            { n: "1", label: "Webhook Trigger", detail: "Method: POST • Path: /evolution-webhook" },
            { n: "2", label: "Code (Filtro)",   detail: "Ignora fromMe=true e eventos não-mensagem" },
            { n: "3", label: "HTTP Request",    detail: "POST → Helena AI Backend (repassa mensagem)" },
            { n: "4", label: "HTTP Request",    detail: "POST → Evolution API /message/sendText (envia resposta)" },
          ].map((step) => (
            <div key={step.n} className="flex items-center gap-3 text-xs">
              <div className="size-5 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold shrink-0 text-[10px]">
                {step.n}
              </div>
              <span className="font-medium">{step.label}</span>
              <span className="text-muted-foreground">—</span>
              <span className="text-muted-foreground">{step.detail}</span>
            </div>
          ))}
        </div>

        {/* Curl de teste rápido */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-foreground">Testar envio manual (curl)</p>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-xs gap-1"
              onClick={() => copyText(
                `curl -X POST "${cfg.baseUrl}/message/sendText/${cfg.instance}" \\\n  -H "apikey: ${cfg.apiKey || "SUA_API_KEY"}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"number":"5518981011186","text":"Olá! Teste da Helena AI."}'`,
                "Comando curl"
              )}
            >
              <Copy className="size-3" /> Copiar curl
            </Button>
          </div>
          <pre className="rounded-lg bg-muted/50 border p-3 text-[11px] font-mono text-muted-foreground overflow-x-auto whitespace-pre leading-relaxed">
{`curl -X POST "${cfg.baseUrl}/message/sendText/${cfg.instance}" \\
  -H "apikey: ${cfg.apiKey ? "••••••••" : "SUA_API_KEY"}" \\
  -H "Content-Type: application/json" \\
  -d '{"number":"5518981011186","text":"Olá! Teste da Helena AI."}'`}
          </pre>
        </div>
      </section>

      {/* Log de eventos recentes */}
      <section className="rounded-xl border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <ClipboardList className="size-4 text-primary" />
          <h3 className="font-semibold text-sm">Endpoints úteis da Evolution API</h3>
        </div>
        <div className="divide-y rounded-lg border overflow-hidden">
          {[
            { method: "GET",  path: `/instance/connectionState/${cfg.instance}`, desc: "Status da conexão" },
            { method: "POST", path: `/message/sendText/${cfg.instance}`,          desc: "Enviar mensagem de texto" },
            { method: "POST", path: `/message/sendMedia/${cfg.instance}`,         desc: "Enviar imagem/arquivo" },
            { method: "POST", path: `/webhook/set/${cfg.instance}`,               desc: "Configurar webhook" },
            { method: "GET",  path: `/webhook/find/${cfg.instance}`,              desc: "Ver webhook configurado" },
            { method: "GET",  path: `/chat/findMessages/${cfg.instance}`,         desc: "Buscar mensagens" },
          ].map(({ method, path, desc }) => (
            <div key={path} className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/20 transition-colors">
              <Badge
                variant={method === "GET" ? "secondary" : "default"}
                className="text-[10px] font-mono w-12 justify-center shrink-0"
              >
                {method}
              </Badge>
              <code className="text-[11px] font-mono flex-1 truncate text-muted-foreground">
                {cfg.baseUrl}{path}
              </code>
              <span className="text-[11px] text-muted-foreground shrink-0 hidden sm:block">{desc}</span>
              <Button
                size="icon"
                variant="ghost"
                className="size-6 shrink-0"
                onClick={() => copyText(`${cfg.baseUrl}${path}`, "URL")}
              >
                <Copy className="size-3" />
              </Button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
function WhatsAppPage() {
  const db = useDB();
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newType, setNewType] = useState<"qrcode" | "cloud_api">("cloud_api");

  const online     = db.connections.filter((c) => c.status === "online").length;
  const totalSent  = db.connections.reduce((s, c) => s + c.sentToday, 0);
  const totalQueue = db.connections.reduce((s, c) => s + c.queue, 0);

  const handleCreate = () => {
    if (!newName.trim()) { toast.error("Nome é obrigatório"); return; }
    if (!newPhone.trim()) { toast.error("Número é obrigatório"); return; }
    const id = uid("wa_");
    update((d) => {
      d.connections.push({
        id, organizationId: d.organization.id,
        name: newName,
        phone: newPhone,
        type: newType,
        status: "conectando",
        queue: 0, sentToday: 0, dailyLimit: 1000,
        lastSyncAt: nowISO(),
      });
    });
    toast.success("Conexão registrada — teste a conexão na aba Configuração.");
    setIsNewOpen(false);
    setNewName(""); setNewPhone("");
  };

  const handleDisconnect = (id: string) => {
    update((d) => { const c = d.connections.find((x) => x.id === id); if (c) c.status = "offline"; });
    toast.success("Número desconectado");
  };

  const handleSync = async (id: string) => {
    update((d) => { const c = d.connections.find((x) => x.id === id); if (c) c.status = "conectando"; });
    const result = await testEvolutionConnection();
    update((d) => {
      const c = d.connections.find((x) => x.id === id);
      if (c) {
        c.status = result.connected ? "online" : "offline";
        c.lastSyncAt = nowISO();
        if (result.number) c.phone = result.number;
      }
    });
    if (result.connected) toast.success(`Sincronizado! ${result.number} · ${result.latencyMs}ms`);
    else toast.error(result.message);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Integrações"
        title="WhatsApp"
        description="Conecte o número da agência via Evolution API. Todos os agentes SDR, Closer e Atendimento usam este número para prospecção e atendimento."
        actions={
          <Button className="gap-2" onClick={() => setIsNewOpen(true)}>
            <Plus className="size-4" /> Adicionar Número
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Números Online" value={online} icon={<CheckCircle2 />} tone="success" />
        <StatCard label="Enviados Hoje" value={totalSent.toLocaleString("pt-BR")} icon={<MessageCircle />} tone="info" />
        <StatCard label="Na Fila" value={totalQueue} hint="Aguardando envio" icon={<Zap />} tone="helena" />
      </div>

      <Tabs defaultValue="numeros">
        <TabsList>
          <TabsTrigger value="numeros">Números ({db.connections.length})</TabsTrigger>
          <TabsTrigger value="config" className="gap-1.5">
            <Settings2 className="size-3.5" /> Configuração Evolution API
          </TabsTrigger>
        </TabsList>

        {/* ── ABA NÚMEROS ────────────────────────────────────────────────── */}
        <TabsContent value="numeros" className="mt-4 space-y-4">
          {db.connections.length === 0 && (
            <div className="rounded-xl border border-dashed p-10 text-center space-y-3">
              <Smartphone className="size-10 text-muted-foreground mx-auto" />
              <div>
                <p className="font-semibold">Nenhum número configurado</p>
                <p className="text-sm text-muted-foreground">
                  Configure a Evolution API na aba ao lado e clique em "Testar Conexão" para sincronizar automaticamente.
                </p>
              </div>
              <Button variant="outline" className="gap-2" onClick={() => setIsNewOpen(true)}>
                <Plus className="size-4" /> Adicionar Número Manualmente
              </Button>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {db.connections.map((conn) => {
              const sc = STATUS_CONFIG[conn.status];
              const dailyPct = conn.dailyLimit > 0
                ? Math.min(100, Math.round((conn.sentToday / conn.dailyLimit) * 100))
                : 0;

              return (
                <div key={conn.id} className="rounded-xl border bg-card p-5 space-y-4 hover:border-foreground/20 transition-all">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className={`size-10 rounded-full flex items-center justify-center ${conn.status === "online" ? "bg-success/10" : "bg-muted"}`}>
                        <Smartphone className={`size-5 ${conn.status === "online" ? "text-success" : "text-muted-foreground"}`} />
                      </div>
                      <div>
                        <h3 className="font-semibold text-sm">{conn.name}</h3>
                        <p className="text-xs text-muted-foreground font-mono">{conn.phone}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {sc.icon}
                      <Badge variant={sc.badge} className="text-[10px]">{sc.label}</Badge>
                    </div>
                  </div>

                  {/* Métricas */}
                  <div className="grid grid-cols-3 text-center gap-2 rounded-lg bg-muted/30 p-2">
                    <div>
                      <div className="text-sm font-bold">{conn.sentToday.toLocaleString("pt-BR")}</div>
                      <div className="text-[10px] text-muted-foreground">Enviados</div>
                    </div>
                    <div>
                      <div className="text-sm font-bold text-warning">{conn.queue}</div>
                      <div className="text-[10px] text-muted-foreground">Na Fila</div>
                    </div>
                    <div>
                      <div className="text-sm font-bold">{conn.dailyLimit.toLocaleString("pt-BR")}</div>
                      <div className="text-[10px] text-muted-foreground">Limite/Dia</div>
                    </div>
                  </div>

                  {/* Barra de uso */}
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Uso diário</span>
                      <span className={dailyPct > 80 ? "text-destructive font-medium" : ""}>{dailyPct}%</span>
                    </div>
                    <Progress
                      value={dailyPct}
                      className={`h-1.5 ${dailyPct > 80 ? "[&>div]:bg-destructive" : ""}`}
                    />
                  </div>

                  {/* Tipo + última sync */}
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <Badge variant="outline" className="text-[10px]">
                      {conn.type === "cloud_api" ? "Evolution API" : "QR Code · Baileys"}
                    </Badge>
                    <span>Sync: {new Date(conn.lastSyncAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>

                  {/* Ações */}
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 h-8 text-xs gap-1.5"
                      onClick={() => handleSync(conn.id)}
                    >
                      <RefreshCw className="size-3.5" /> Sincronizar
                    </Button>
                    {conn.status === "online" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 px-3 text-xs text-muted-foreground"
                        onClick={() => handleDisconnect(conn.id)}
                      >
                        Desconectar
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        {/* ── ABA CONFIGURAÇÃO ──────────────────────────────────────────── */}
        <TabsContent value="config" className="mt-4">
          <EvolutionPanel />
        </TabsContent>
      </Tabs>

      {/* Modal adicionar número manual */}
      <Dialog open={isNewOpen} onOpenChange={setIsNewOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Adicionar Número WhatsApp</DialogTitle>
            <DialogDescription>
              Registre um número para aparecer na lista. Para conectar de verdade, configure a Evolution API na aba "Configuração".
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Nome / Apelido</Label>
              <Input placeholder="Ex: Chip Agência Info Tech" value={newName} onChange={(e) => setNewName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Número (com DDI + DDD)</Label>
              <Input placeholder="5518981011186" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} className="font-mono" />
              <p className="text-xs text-muted-foreground">Formato: 55 + DDD + número (ex: 5518981011186)</p>
            </div>
            <div className="space-y-1.5">
              <Label>Tipo de Conexão</Label>
              <div className="grid grid-cols-2 gap-2">
                {(["cloud_api", "qrcode"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setNewType(t)}
                    className={`rounded-lg border p-3 text-left text-sm transition-all ${newType === t ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}
                  >
                    <div className="font-medium">{t === "cloud_api" ? "Evolution API" : "QR Code"}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {t === "cloud_api" ? "Recomendado · já conectado" : "Baileys · <80MB RAM"}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
