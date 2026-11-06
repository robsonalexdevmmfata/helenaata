import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
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
import { currentUser, getDB, useDB, update, uid, nowISO } from "@/lib/store";
import { instanceNameFromLabel, provisionEvolutionInstance, sanitizeInstanceName } from "@/lib/evolution/provision";
import { isPlatformAdmin } from "@/lib/saas";
import { pageHead } from "@/lib/head";
import { toast } from "sonner";
import {
  getEvolutionConfigUI, saveEvolutionConfigUI,
  testEvolutionConnection, evolutionSetWebhook, evolutionGetWebhook,
  evolutionConnectQr, getEvolutionStatus,
  type EvolutionConfig,
} from "@/lib/evolution/evolutionapi";
import { useEvolutionPairing } from "@/hooks/use-evolution-pairing";

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
        setStatus("error" in created && created.error ? created.error : "Não deu para criar a instância.");
        setBusy(false);
        return;
      }
      update((d) => {
        const existing = d.connections.find((c) => c.id === `wa_${instance}`) ?? d.connections[0];
        if (existing) {
          existing.name = agentName.trim() || instance;
          existing.status = "conectando";
          existing.lastSyncAt = nowISO();
        } else {
          d.connections.unshift({
            id: `wa_${instance}`,
            organizationId: d.organization.id,
            name: agentName.trim() || instance,
            phone: "aguardando QR",
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
      const pair = created.qr ? { ok: true, qr: created.qr, connected: false } : await evolutionConnectQr();
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

  useEvolutionPairing(qr, setQr, (number) => {
    setStatus(`Conectado${number ? ` · ${number}` : ""}`);
    toast.success("WhatsApp conectado.");
    update((d) => {
      const conn = d.connections.find((c) => c.id === `wa_${previewInstance}`) ?? d.connections.find((c) => c.status === "conectando");
      if (conn) {
        conn.status = "online";
        if (number) conn.phone = number;
        conn.lastSyncAt = nowISO();
      }
    });
  });

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
  const [newName, setNewName] = useState("");
  const [newInstance, setNewInstance] = useState("");
  const [instanceTouched, setInstanceTouched] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [qrOpen, setQrOpen] = useState(false);
  const [qr, setQr] = useState("");
  const [qrConnId, setQrConnId] = useState<string | null>(null);
  const [qrBusy, setQrBusy] = useState(false);
  const qrConnIdRef = useRef<string | null>(null);
  qrConnIdRef.current = qrConnId;

  const online     = db.connections.filter((c) => c.status === "online").length;
  const totalSent  = db.connections.reduce((s, c) => s + c.sentToday, 0);
  const totalQueue = db.connections.reduce((s, c) => s + c.queue, 0);

  const openQrForConnection = async (id: string) => {
    setQrBusy(true);
    setQrConnId(id);
    setQrOpen(true);
    setQr("");
    update((d) => {
      const c = d.connections.find((x) => x.id === id);
      if (c) c.status = "conectando";
    });
    try {
      const pair = await evolutionConnectQr(undefined, 6);
      if (pair.connected) {
        setQrOpen(false);
        setQr("");
        update((d) => {
          const c = d.connections.find((x) => x.id === id);
          if (c) {
            c.status = "online";
            c.lastSyncAt = nowISO();
          }
        });
        toast.success("WhatsApp já estava conectado.");
        return;
      }
      if (pair.qr) {
        setQr(pair.qr);
        toast.success("QR gerado — escaneie no celular (Aparelhos conectados).");
      } else {
        toast.error(pair.error || "A Evolution não devolveu o QR. Tenta de novo em alguns segundos.");
        update((d) => {
          const c = d.connections.find((x) => x.id === id);
          if (c) c.status = "offline";
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao gerar QR");
      update((d) => {
        const c = d.connections.find((x) => x.id === id);
        if (c) c.status = "offline";
      });
    } finally {
      setQrBusy(false);
    }
  };

  useEvolutionPairing(qr, setQr, (number) => {
    const id = qrConnIdRef.current;
    setQrOpen(false);
    setQr("");
    toast.success(`WhatsApp conectado${number ? ` · ${number}` : ""}`);
    update((d) => {
      const phone = number
        ? (number.startsWith("+") ? number : number.replace(/\D/g, "").replace(/^55/, "+55 ").replace(/(\d{2})(\d{4,5})(\d{4})$/, "$1 $2-$3"))
        : "";
      const mark = (c: (typeof d.connections)[0]) => {
        c.status = "online";
        if (phone) c.phone = phone;
        c.dailyLimit = Math.max(c.dailyLimit || 0, 1000);
        c.lastSyncAt = nowISO();
      };
      const primary = (id && d.connections.find((x) => x.id === id))
        || d.connections.find((x) => /info tech|helena/i.test(x.name))
        || d.connections.find((x) => x.status === "conectando")
        || d.connections[0];
      if (primary) mark(primary);
      // Mantém a linha da agência sincronizada (não some no refresh).
      const agency = d.connections.find((x) => x.id === "wa_agency" || /info tech/i.test(x.name));
      if (agency && agency !== primary) mark(agency);
      if (!agency && primary) {
        d.connections.unshift({
          ...primary,
          id: "wa_agency",
          name: "agência info tech",
          dailyLimit: 1000,
        });
      }
    });
    setQrConnId(null);
    // Grava número + status ONLINE no Supabase na hora (não espera fechar o navegador).
    void import("@/lib/persist/cycle").then(async ({ flushCyclePush }) => {
      const out = await flushCyclePush();
      if (out.ok) toast.success("Número salvo no Supabase.");
      else toast.error(out.error || "Não gravou no banco — tenta Sincronizar de novo.");
    });
  });

  const handleCreate = () => {
    if (!newName.trim() && !newInstance.trim()) {
      toast.error("Informe o nome do agente ou da instância");
      return;
    }
    if (!newPhone.trim()) { toast.error("Número é obrigatório"); return; }
    const instance = instanceNameFromLabel(newInstance || newName, currentUser(db)?.id);
    const id = uid("wa_");
    const me = currentUser(getDB());
    if (me && instance) {
      void provisionEvolutionInstance(me, { instanceName: instance });
    }
    update((d) => {
      d.connections.push({
        id, organizationId: d.organization.id,
        name: newName.trim() || instance,
        phone: newPhone,
        type: "cloud_api",
        status: "conectando",
        queue: 0, sentToday: 0, dailyLimit: 1000,
        lastSyncAt: nowISO(),
      });
    });
    toast.success("Linha Helena criada — o QR aparece em Conectar WhatsApp.");
    setIsNewOpen(false);
    setNewName(""); setNewInstance(""); setInstanceTouched(false); setNewPhone("");
  };

  const handleDisconnect = (id: string) => {
    update((d) => { const c = d.connections.find((x) => x.id === id); if (c) c.status = "offline"; });
    toast.success("Número desconectado");
  };

  const handleSync = async (id: string) => {
    // Sempre abre o QR se não estiver online — nunca só toast “escaneie”.
    update((d) => { const c = d.connections.find((x) => x.id === id); if (c) c.status = "conectando"; });
    const result = await testEvolutionConnection();
    if (result.connected) {
      update((d) => {
        const c = d.connections.find((x) => x.id === id);
        if (c) {
          c.status = "online";
          c.lastSyncAt = nowISO();
          if (result.number) c.phone = result.number;
        }
      });
      toast.success(`Sincronizado! ${result.number} · ${result.latencyMs}ms`);
      void import("@/lib/persist/cycle").then(({ flushCyclePush }) => flushCyclePush());
      return;
    }
    await openQrForConnection(id);
  };

  // Offline ao abrir a página → já joga o modal do QR.
  useEffect(() => {
    if (online > 0 || qrOpen || qrBusy) return;
    const target = db.connections.find((c) => /info tech|helena/i.test(c.name))
      ?? db.connections.find((c) => c.status !== "online")
      ?? db.connections[0];
    if (!target) return;
    const t = window.setTimeout(() => {
      void openQrForConnection(target.id);
    }, 400);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Integrações"
        title="WhatsApp"
        description="Conecte o número da agência via Evolution API. Todos os agentes SDR, Closer e Atendimento usam este número para prospecção e atendimento."
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            {online === 0 && (
              <Button
                className="gap-2 bg-[#25D366] text-white hover:bg-[#1ebe57]"
                disabled={qrBusy}
                onClick={() => {
                  const id = db.connections.find((c) => /info tech/i.test(c.name))?.id
                    ?? db.connections[0]?.id;
                  if (id) void openQrForConnection(id);
                }}
              >
                <QrCode className="size-4" /> {qrBusy ? "Gerando QR…" : "Escanear QR agora"}
              </Button>
            )}
            <Button className="gap-2" variant="outline" onClick={() => setIsNewOpen(true)}>
              <Plus className="size-4" /> Adicionar Número
            </Button>
          </div>
        }
      />

      {online === 0 && (
        <button
          type="button"
          onClick={() => {
            const id = db.connections.find((c) => /info tech/i.test(c.name))?.id
              ?? db.connections[0]?.id;
            if (id) void openQrForConnection(id);
          }}
          className="flex w-full items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 text-left transition hover:bg-warning/15"
        >
          <QrCode className="mt-0.5 size-5 shrink-0 text-warning" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-sm">WhatsApp desconectado — clique aqui para abrir o QR Code</p>
            <p className="mt-1 text-xs text-muted-foreground">
              No celular: WhatsApp → Aparelhos conectados → Conectar aparelho. O QR aparece no modal.
            </p>
          </div>
          <span className="shrink-0 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background">
            Abrir QR
          </span>
        </button>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Números Online" value={online} icon={<CheckCircle2 />} tone="success" />
        <StatCard label="Enviados Hoje" value={totalSent.toLocaleString("pt-BR")} icon={<MessageCircle />} tone="info" />
        <StatCard label="Na Fila" value={totalQueue} hint="Aguardando envio" icon={<Zap />} tone="helena" />
      </div>

      <CustomerWhatsAppConnect />

      <Tabs defaultValue="numeros">
        <TabsList>
          <TabsTrigger value="numeros">Números ({db.connections.length})</TabsTrigger>
          {admin && (
            <TabsTrigger value="config" className="gap-1.5">
              <Settings2 className="size-3.5" /> Configuração Evolution API
            </TabsTrigger>
          )}
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
                  <div className="flex flex-col gap-2 pt-1 sm:flex-row">
                    {conn.status !== "online" && (
                      <Button
                        size="sm"
                        className="h-10 flex-1 gap-1.5 text-xs font-semibold sm:h-9"
                        disabled={qrBusy}
                        onClick={() => void openQrForConnection(conn.id)}
                      >
                        <QrCode className="size-4" /> {qrBusy && qrConnId === conn.id ? "Gerando QR…" : "Escanear QR Code"}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant={conn.status === "online" ? "outline" : "secondary"}
                      className="h-10 flex-1 gap-1.5 text-xs sm:h-9"
                      onClick={() => void handleSync(conn.id)}
                    >
                      <RefreshCw className="size-3.5" /> {conn.status === "online" ? "Sincronizar" : "Sincronizar / QR"}
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

        {admin && (
          <TabsContent value="config" className="mt-4">
            <EvolutionPanel />
          </TabsContent>
        )}
      </Tabs>

      <Dialog open={qrOpen} onOpenChange={(open) => {
        setQrOpen(open);
        if (!open) {
          setQr("");
          if (qrConnId) {
            update((d) => {
              const c = d.connections.find((x) => x.id === qrConnId);
              if (c && c.status === "conectando") c.status = "offline";
            });
          }
        }
      }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Escanear QR Code</DialogTitle>
            <DialogDescription>
              No celular: WhatsApp → Aparelhos conectados → Conectar aparelho. O QR renova sozinho até parear.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3 py-2">
            {qrBusy && !qr && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <RefreshCw className="size-4 animate-spin" /> Gerando QR na Evolution…
              </div>
            )}
            {qr && <img src={qr} alt="QR WhatsApp" className="w-56 h-56 rounded-lg border bg-white p-2" />}
            {!qrBusy && !qr && (
              <p className="text-sm text-muted-foreground text-center">Sem QR ainda. Fecha e clica em Abrir QR de novo.</p>
            )}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={qrBusy || !qrConnId}
              onClick={() => qrConnId && void openQrForConnection(qrConnId)}
            >
              <RefreshCw className={`size-3.5 ${qrBusy ? "animate-spin" : ""}`} /> Atualizar QR
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
    </div>
  );
}
