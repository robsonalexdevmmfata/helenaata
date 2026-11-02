import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  AlertTriangle, CheckCircle2, Copy, ExternalLink, Globe, KeyRound,
  MessageCircle, Plus, QrCode, RefreshCw, Settings2, Smartphone, Trash2,
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
import { currentUser, getDB, useDB, update, uid, nowISO } from "@/lib/store";
import {
  evolutionCreateInstance,
  instanceNameFromLabel,
  provisionEvolutionInstance,
  sanitizeInstanceName,
} from "@/lib/evolution/provision";
import { isPlatformAdmin } from "@/lib/saas";
import { pageHead } from "@/lib/head";
import { toast } from "sonner";
import {
  getEvolutionConfigUI, saveEvolutionConfigUI,
  testEvolutionConnection, evolutionSetWebhook, evolutionGetWebhook,
  evolutionConnectQr, evolutionLogoutInstance, getEvolutionStatus,
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
    const user = currentUser(getDB());
    if (user) {
      void provisionEvolutionInstance(user)
        .then(() => setCfg(getEvolutionConfigUI()))
        .catch(() => setCfg(getEvolutionConfigUI()));
    }
    evolutionGetWebhook().then((res) => {
      if (res.ok && res.url) setWebhookUrl(res.url);
    }).catch(() => { /* webhook só para admin */ });
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
      const instanceName = cfg.instance;
      // Sincroniza o número no store se encontrado
      if (result.number) {
        update((d) => {
          const conn = d.connections.find((c) => !c.deletedAt && (/info tech/i.test(c.name) || c.id === "wa_agency"))
            ?? d.connections.find((c) => !c.deletedAt);
          if (conn) {
            conn.status = "online";
            conn.name = "agência info tech";
            conn.instanceName = instanceName;
            delete conn.deletedAt;
            conn.phone = result.number!.replace(/\D/g, "").replace(/^55/, "+55 ");
            conn.lastSyncAt = nowISO();
          } else {
            d.connections.unshift({
              id: uid("wa_agency_"),
              organizationId: d.organization.id,
              name: "agência info tech",
              phone: result.number!,
              instanceName,
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
            <p className="text-xs text-muted-foreground">
              A chave fica só no Render (`EVOLUTION_KEY`). O navegador não guarda e não envia apikey. Quem abre o DevTools não lê o token.
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
            disabled={testing}
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
              disabled={webhookSaving || !webhookUrl}
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
                `curl -X POST "/api/evolution/message/sendText/${cfg.instance}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"number":"5518981011186","text":"Olá! Teste da Helena AI."}'`,
                "Comando curl"
              )}
            >
              <Copy className="size-3" /> Copiar curl
            </Button>
          </div>
          <pre className="rounded-lg bg-muted/50 border p-3 text-[11px] font-mono text-muted-foreground overflow-x-auto whitespace-pre leading-relaxed">
{`curl -X POST "/api/evolution/message/sendText/${cfg.instance}" \\
  -H "Content-Type: application/json" \\
  -d '{"number":"...","text":"..."}'`}
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
const CONNECTION_KIND_LABEL = "Linha Helena";

function CustomerWhatsAppConnect() {
  const db = useDB();
  const user = currentUser(db);
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState("");
  const [status, setStatus] = useState("");
  const [agentName, setAgentName] = useState(user?.companyName || user?.name || "");
  const [instanceLabel, setInstanceLabel] = useState(user?.evolutionInstance || "");
  const [instanceTouched, setInstanceTouched] = useState(Boolean(user?.evolutionInstance));

  const previewInstance = instanceNameFromLabel(instanceLabel || agentName, user?.id);

  const connect = async () => {
    if (!user) return;
    const label = agentName.trim() || instanceLabel.trim();
    if (!label) {
      toast.error("Diz o nome do agente ou o nome da instância.");
      return;
    }
    const instance = instanceNameFromLabel(instanceLabel || agentName, user.id);
    if (!instance) {
      toast.error("O nome da instância precisa ter letras ou números.");
      return;
    }
    setBusy(true);
    setStatus(`Criando a instância “${instance}” na Evolution…`);
    try {
      const created = await provisionEvolutionInstance(user, { instanceName: instance });
      if (!created.ok) {
        setStatus(
          ("error" in created && created.error) || "Não deu para criar a instância.",
        );
        setBusy(false);
        return;
      }
      update((d) => {
        const existing = d.connections.find((c) => c.id === `wa_${instance}`) ?? d.connections[0];
        if (existing) {
          existing.name = agentName.trim() || instance;
          existing.instanceName = created.instance;
          delete existing.deletedAt;
          existing.status = "conectando";
          existing.lastSyncAt = nowISO();
        } else {
          d.connections.unshift({
            id: `wa_${instance}`,
            organizationId: d.organization.id,
            name: agentName.trim() || instance,
            phone: "aguardando QR",
            instanceName: created.instance,
            type: "cloud_api",
            status: "conectando",
            queue: 0,
            sentToday: 0,
            dailyLimit: 1000,
            lastSyncAt: nowISO(),
          });
        }
      });
      setStatus("Gerando QR do WhatsApp…");
      const pair = await evolutionConnectQr({
        ...getEvolutionConfigUI(),
        instance: created.instance,
      });
      if (pair.connected) {
        setQr("");
        setStatus("WhatsApp já está conectado nesta instância.");
        toast.success("WhatsApp conectado.");
        setBusy(false);
        return;
      }
      if (pair.qr) {
        setQr(pair.qr);
        setStatus("Leia o QR no WhatsApp do chip (Aparelhos conectados).");
        toast.success("Instância pronta. Escaneie o QR.");
      } else {
        setStatus(pair.error || "Instância criada. Abra de novo se o QR não aparecer.");
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Falha ao conectar.");
    }
    setBusy(false);
  };

  useEffect(() => {
    void getEvolutionStatus().then((s) => {
      if (s.connected) setStatus(`Conectado${s.number ? ` · ${s.number}` : ""}`);
    }).catch(() => { /* ignore */ });
  }, []);

  return (
    <div className="rounded-xl border bg-card p-6 space-y-4 max-w-lg">
      <h2 className="font-semibold">Conectar WhatsApp</h2>
      <p className="text-sm text-muted-foreground">
        Dê um nome ao agente ou à instância. A Helena cria na Evolution e o QR aparece sozinho — sem API Key nem URL.
      </p>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label>Nome do agente</Label>
          <Input
            placeholder="Ex: Helena SDR, Chip da loja"
            value={agentName}
            onChange={(e) => {
              const value = e.target.value;
              setAgentName(value);
              if (!instanceTouched) setInstanceLabel(sanitizeInstanceName(value));
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Nome da instância</Label>
          <Input
            placeholder="Ex: hudemo"
            value={instanceLabel}
            onChange={(e) => {
              setInstanceTouched(true);
              setInstanceLabel(e.target.value);
            }}
            className="font-mono"
          />
          <p className="text-xs text-muted-foreground">
            Na Evolution fica <span className="font-mono">{previewInstance || "—"}</span> · tipo {CONNECTION_KIND_LABEL}
          </p>
        </div>
      </div>
      <Button onClick={() => void connect()} disabled={busy} className="gap-2">
        {busy ? <RefreshCw className="size-4 animate-spin" /> : <QrCode className="size-4" />}
        {busy ? "Preparando…" : "Conectar WhatsApp"}
      </Button>
      {status && <p className="text-sm text-muted-foreground">{status}</p>}
      {qr && <img src={qr} alt="QR WhatsApp" className="w-56 h-56 rounded-lg border bg-white p-2" />}
    </div>
  );
}

function WhatsAppPage() {
  const db = useDB();
  const admin = isPlatformAdmin(currentUser(db));
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [qrSession, setQrSession] = useState<{
    connectionId: string;
    name: string;
    instance: string;
    qr: string;
    status: string;
    busy: boolean;
  } | null>(null);
  const [newName, setNewName] = useState("");
  const [newInstance, setNewInstance] = useState("");
  const [instanceTouched, setInstanceTouched] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [deleteConnectionId, setDeleteConnectionId] = useState("");
  const [deletingConnectionId, setDeletingConnectionId] = useState("");

  const connections = db.connections.filter((connection) => !connection.deletedAt);
  const connectionToDelete = connections.find((connection) => connection.id === deleteConnectionId);
  const online     = connections.filter((c) => c.status === "online").length;
  const totalSent  = connections.reduce((s, c) => s + c.sentToday, 0);
  const totalQueue = connections.reduce((s, c) => s + c.queue, 0);

  const loadConnectionQr = async (connection: {
    id: string;
    name: string;
    instanceName?: string;
  }) => {
    const instance = connection.instanceName || getEvolutionConfigUI().instance;
    setQrSession({
      connectionId: connection.id,
      name: connection.name,
      instance,
      qr: "",
      status: "Gerando QR Code…",
      busy: true,
    });
    const result = await evolutionConnectQr({ ...getEvolutionConfigUI(), instance });
    if (result.connected) {
      update((d) => {
        const current = d.connections.find((entry) => entry.id === connection.id);
        if (current) {
          current.status = "online";
          current.lastSyncAt = nowISO();
        }
      });
      setQrSession((current) =>
        current?.connectionId === connection.id
          ? { ...current, qr: "", status: "WhatsApp já conectado.", busy: false }
          : current,
      );
      toast.success(`${connection.name} já está conectado.`);
      return;
    }
    if (!result.ok || !result.qr) {
      const message = result.error || "A Evolution não retornou o QR Code. Tente sincronizar novamente.";
      setQrSession((current) =>
        current?.connectionId === connection.id
          ? { ...current, status: message, busy: false }
          : current,
      );
      toast.error(message);
      return;
    }
    setQrSession((current) =>
      current?.connectionId === connection.id
        ? { ...current, qr: result.qr || "", status: "Escaneie pelo WhatsApp em Aparelhos conectados.", busy: false }
        : current,
    );
  };

  useEffect(() => {
    if (
      !qrSession ||
      !qrSession.qr ||
      qrSession.status === "WhatsApp já conectado." ||
      qrSession.status === "WhatsApp conectado."
    )
      return;
    let active = true;
    const checkConnection = async () => {
      const status = await getEvolutionStatus({
        ...getEvolutionConfigUI(),
        instance: qrSession.instance,
      });
      if (!active || !status.connected) return;
      update((d) => {
        const current = d.connections.find((entry) => entry.id === qrSession.connectionId);
        if (current) {
          current.status = "online";
          current.phone = status.number || current.phone;
          current.lastSyncAt = nowISO();
        }
      });
      setQrSession((current) =>
        current?.connectionId === qrSession.connectionId
          ? { ...current, qr: "", status: "WhatsApp conectado.", busy: false }
          : current,
      );
      toast.success(`${qrSession.name} conectado ao WhatsApp.`);
    };
    const timer = window.setInterval(() => void checkConnection(), 3000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [qrSession?.connectionId, qrSession?.instance, qrSession?.status]);

  const handleCreate = async () => {
    if (!newName.trim() && !newInstance.trim()) {
      toast.error("Informe o nome do agente ou da instância");
      return;
    }
    if (!newPhone.trim()) { toast.error("Número é obrigatório"); return; }
    const me = currentUser(db);
    const instance = instanceNameFromLabel(newInstance || newName, me?.id);
    if (!instance) {
      toast.error("Informe um nome válido para a instância.");
      return;
    }
    const config = { ...getEvolutionConfigUI(), instance };
    const created = await evolutionCreateInstance(instance, config);
    if (!created.ok) {
      toast.error(`Não foi possível criar a instância: ${created.error || "erro desconhecido"}`);
      return;
    }

    const id = uid("wa_");
    update((d) => {
      d.connections.push({
        id, organizationId: d.organization.id,
        name: newName.trim() || instance,
        phone: newPhone.trim(),
        instanceName: instance,
        type: "cloud_api",
        status: "conectando",
        queue: 0, sentToday: 0, dailyLimit: 1000,
        lastSyncAt: nowISO(),
      });
    });
    toast.success("Instância criada. Conecte pelo QR Code.");
    setIsNewOpen(false);
    void loadConnectionQr({ id, name: newName.trim() || instance, instanceName: instance });
    setNewName(""); setNewInstance(""); setInstanceTouched(false); setNewPhone("");
  };

  const handleDisconnect = (id: string) => {
    update((d) => { const c = d.connections.find((x) => x.id === id); if (c) c.status = "offline"; });
    toast.success("Número desconectado");
  };

  const handleDeleteConnection = async () => {
    const connection = connectionToDelete;
    if (!connection) return;
    setDeletingConnectionId(connection.id);
    const result = await evolutionLogoutInstance(connection.instanceName);
    if (!result.ok) {
      toast.error(`Não foi possível desconectar o número: ${result.error || "erro desconhecido"}`);
      setDeletingConnectionId("");
      return;
    }
    update((d) => {
      const current = d.connections.find((entry) => entry.id === connection.id);
      if (!current) return;
      current.status = "offline";
      current.deletedAt = nowISO();
    });
    setDeleteConnectionId("");
    setDeletingConnectionId("");
    toast.success("Número removido do painel e desconectado do WhatsApp.");
  };

  const handleSync = async (id: string) => {
    const connection = db.connections.find((entry) => entry.id === id && !entry.deletedAt);
    if (!connection) return;
    update((d) => { const c = d.connections.find((x) => x.id === id); if (c) c.status = "conectando"; });
    const config = getEvolutionConfigUI();
    const result = await testEvolutionConnection({ ...config, instance: connection.instanceName || config.instance });
    update((d) => {
      const c = d.connections.find((x) => x.id === id);
      if (c) {
        c.status = result.connected ? "online" : result.ok ? "conectando" : "offline";
        c.lastSyncAt = nowISO();
        if (result.number) c.phone = result.number;
      }
    });
    if (result.connected) toast.success(`Sincronizado! ${result.number} · ${result.latencyMs}ms`);
    else if (result.ok) {
      await loadConnectionQr({
        id: connection.id,
        name: connection.name,
        instanceName: connection.instanceName || config.instance,
      });
    } else toast.error(result.message);
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

      {!admin && <CustomerWhatsAppConnect />}

      <Tabs defaultValue="numeros">
        <TabsList>
          <TabsTrigger value="numeros">Números ({connections.length})</TabsTrigger>
          {admin && (
            <TabsTrigger value="config" className="gap-1.5">
              <Settings2 className="size-3.5" /> Configuração Evolution API
            </TabsTrigger>
          )}
        </TabsList>

        {/* ── ABA NÚMEROS ────────────────────────────────────────────────── */}
        <TabsContent value="numeros" className="mt-4 space-y-4">
          {connections.length === 0 && (
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
            {connections.map((conn) => {
              const sc = STATUS_CONFIG[conn.status] ?? STATUS_CONFIG.offline;
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
                      {CONNECTION_KIND_LABEL}
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
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-3 text-xs text-destructive hover:text-destructive"
                      aria-label={`Excluir ${conn.name}`}
                      onClick={() => setDeleteConnectionId(conn.id)}
                    >
                      <Trash2 className="mr-1 size-3.5" /> Excluir
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        {admin && (
          <TabsContent value="config" className="mt-4">
            <EvolutionPanel />
          </TabsContent>
        )}
      </Tabs>

      {/* Modal adicionar número manual */}
      <Dialog open={isNewOpen} onOpenChange={setIsNewOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Adicionar Número WhatsApp</DialogTitle>
            <DialogDescription>
              Nomeia o agente ou a instância. O QR é gerado sozinho na hora de conectar — não precisa escolher tipo QR.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Nome do agente</Label>
              <Input
                placeholder="Ex: Helena SDR, Chip da loja"
                value={newName}
                onChange={(e) => {
                  const value = e.target.value;
                  setNewName(value);
                  if (!instanceTouched) setNewInstance(sanitizeInstanceName(value));
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Nome da instância</Label>
              <Input
                placeholder="Ex: hudemo"
                value={newInstance}
                onChange={(e) => {
                  setInstanceTouched(true);
                  setNewInstance(e.target.value);
                }}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Na Evolution: <span className="font-mono">{instanceNameFromLabel(newInstance || newName) || "—"}</span>
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Número (com DDI + DDD)</Label>
              <Input placeholder="5518981011186" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} className="font-mono" />
              <p className="text-xs text-muted-foreground">Formato: 55 + DDD + número (ex: 5518981011186)</p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="text-sm font-medium">{CONNECTION_KIND_LABEL}</div>
              <p className="text-[11px] text-muted-foreground">Chip da IA · o QR nasce sozinho depois de conectar</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(qrSession)}
        onOpenChange={(open) => {
          if (!open) setQrSession(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Conectar {qrSession?.name || "WhatsApp"}</DialogTitle>
            <DialogDescription>
              Instância <span className="font-mono">{qrSession?.instance}</span>. No celular, abra WhatsApp → Aparelhos conectados → Conectar aparelho.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3 py-2">
            {qrSession?.qr && (
              <img src={qrSession.qr} alt="QR Code para conectar WhatsApp" className="size-64 rounded-lg border bg-white p-2" />
            )}
            <p className="text-center text-sm text-muted-foreground">{qrSession?.status}</p>
            {qrSession?.status !== "WhatsApp conectado." && qrSession?.status !== "WhatsApp já conectado." && (
              <Button
                variant="outline"
                onClick={() =>
                  qrSession &&
                  void loadConnectionQr({
                    id: qrSession.connectionId,
                    name: qrSession.name,
                    instanceName: qrSession.instance,
                  })
                }
                disabled={qrSession?.busy}
              >
                {qrSession?.busy ? "Gerando QR…" : qrSession?.qr ? "Gerar novo QR" : "Gerar QR novamente"}
              </Button>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQrSession(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(connectionToDelete)}
        onOpenChange={(open) => {
          if (!open && !deletingConnectionId) setDeleteConnectionId("");
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir número do WhatsApp?</DialogTitle>
            <DialogDescription>
              {connectionToDelete
                ? `${connectionToDelete.name} (${connectionToDelete.phone}) será desconectado da Evolution e removido do painel. Para usá-lo novamente, será necessário conectar e ler um novo QR Code.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteConnectionId("")}
              disabled={Boolean(deletingConnectionId)}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleDeleteConnection()}
              disabled={!connectionToDelete || Boolean(deletingConnectionId)}
            >
              {deletingConnectionId ? "Desconectando..." : "Excluir e desconectar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
