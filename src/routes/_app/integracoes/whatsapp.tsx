import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  AlertTriangle, CheckCircle2, MessageCircle, Plus, QrCode, RefreshCw, Settings2, Smartphone, Wifi, WifiOff,
} from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useDB, update, uid, nowISO } from "@/lib/store";
import { pageHead } from "@/lib/head";
import { toast } from "sonner";
import type { WhatsAppConnection } from "@/lib/types";

export const Route = createFileRoute("/_app/integracoes/whatsapp")({
  head: () => pageHead("WhatsApp", "Gerencie conexões WhatsApp via QR Code (Baileys) ou Cloud API."),
  component: WhatsAppPage,
});

const STATUS_CONFIG = {
  online: { label: "Online", icon: <Wifi className="size-4 text-success" />, badge: "default" as const },
  offline: { label: "Offline", icon: <WifiOff className="size-4 text-muted-foreground" />, badge: "secondary" as const },
  conectando: { label: "Conectando...", icon: <RefreshCw className="size-4 text-warning animate-spin" />, badge: "outline" as const },
};

function WhatsAppPage() {
  const db = useDB();
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newType, setNewType] = useState<"qrcode" | "cloud_api">("qrcode");
  const [qrShowing, setQrShowing] = useState<string | null>(null);

  const online = db.connections.filter((c) => c.status === "online").length;
  const totalSent = db.connections.reduce((s, c) => s + c.sentToday, 0);
  const totalQueue = db.connections.reduce((s, c) => s + c.queue, 0);

  const handleCreate = () => {
    if (!newName.trim()) { toast.error("Nome é obrigatório"); return; }
    if (!newPhone.trim()) { toast.error("Número é obrigatório"); return; }
    const id = uid("wa_");
    update((d) => {
      d.connections.push({
        id, organizationId: d.organization.id,
        name: newName, phone: newPhone, type: newType,
        status: "conectando", queue: 0, sentToday: 0,
        dailyLimit: 500, lastSyncAt: nowISO(),
      });
    });
    toast.success("Conexão criada — aguardando QR Code...");
    setIsNewOpen(false);
    setNewName(""); setNewPhone("");
    if (newType === "qrcode") {
      setQrShowing(id);
      setTimeout(() => {
        update((d) => { const c = d.connections.find((x) => x.id === id); if (c) c.status = "online"; });
        setQrShowing(null);
        toast.success("WhatsApp conectado com sucesso!");
      }, 5000);
    }
  };

  const handleDisconnect = (id: string) => {
    update((d) => { const c = d.connections.find((x) => x.id === id); if (c) c.status = "offline"; });
    toast.success("Número desconectado");
  };

  const handleReconnect = (id: string) => {
    update((d) => { const c = d.connections.find((x) => x.id === id); if (c) c.status = "conectando"; });
    toast.success("Reconectando...");
    setTimeout(() => {
      update((d) => { const c = d.connections.find((x) => x.id === id); if (c) c.status = "online"; });
      toast.success("Reconectado!");
    }, 2000);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Integrações"
        title="WhatsApp"
        description="Conexões via Baileys (QR Code, sem aba de navegador, <80MB RAM) ou Cloud API oficial."
        actions={
          <Dialog open={isNewOpen} onOpenChange={setIsNewOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="size-4" /> Nova Conexão</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Adicionar Número WhatsApp</DialogTitle>
                <DialogDescription>QR Code: escaneie uma vez e o chip fica ativo 24/7. Celular pode ficar no carregador.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div><label className="text-xs font-medium text-muted-foreground">Nome / Apelido</label>
                  <Input placeholder="Ex: Chip Agência Principal" value={newName} onChange={(e) => setNewName(e.target.value)} />
                </div>
                <div><label className="text-xs font-medium text-muted-foreground">Número (com DDD)</label>
                  <Input placeholder="11999887766" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Tipo de Conexão</label>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    {(["qrcode", "cloud_api"] as const).map((t) => (
                      <button key={t} onClick={() => setNewType(t)}
                        className={`rounded-lg border p-3 text-left text-sm transition-all ${newType === t ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}>
                        <div className="font-medium">{t === "qrcode" ? "QR Code" : "Cloud API"}</div>
                        <div className="text-[10px] text-muted-foreground">{t === "qrcode" ? "Baileys · &lt;80MB RAM" : "Meta API oficial"}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsNewOpen(false)}>Cancelar</Button>
                <Button onClick={handleCreate}>Conectar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {qrShowing && (
        <div className="rounded-xl border bg-card p-6 text-center space-y-4">
          <QrCode className="size-12 text-primary mx-auto" />
          <div>
            <p className="font-semibold">Aguardando leitura do QR Code</p>
            <p className="text-xs text-muted-foreground">Abra o WhatsApp no celular → Menu → Aparelhos Conectados → Conectar aparelho</p>
          </div>
          <div className="mx-auto w-48 h-48 bg-muted rounded-xl flex items-center justify-center">
            <p className="text-xs text-muted-foreground">[QR Code gerado pelo Baileys]</p>
          </div>
          <p className="text-xs text-muted-foreground animate-pulse">Simulando conexão... (5 segundos)</p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Números Online" value={online} icon={<CheckCircle2 />} tone="success" />
        <StatCard label="Enviados Hoje" value={totalSent.toLocaleString("pt-BR")} icon={<MessageCircle />} tone="info" />
        <StatCard label="Na Fila" value={totalQueue} hint="Aguardando envio" icon={<AlertTriangle />} tone="warning" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {db.connections.map((conn) => {
          const sc = STATUS_CONFIG[conn.status];
          const dailyPct = conn.dailyLimit > 0 ? Math.round((conn.sentToday / conn.dailyLimit) * 100) : 0;
          return (
            <div key={conn.id} className="rounded-xl border bg-card p-5 space-y-4 hover:border-foreground/20 transition-all">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-full bg-success/10 flex items-center justify-center">
                    <Smartphone className="size-5 text-success" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{conn.name}</h3>
                    <p className="text-xs text-muted-foreground font-mono">{conn.phone}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {sc.icon}
                  <Badge variant={sc.badge}>{sc.label}</Badge>
                </div>
              </div>

              <div className="grid grid-cols-3 text-center gap-2 rounded-lg bg-muted/30 p-2">
                <div><div className="text-sm font-bold">{conn.sentToday}</div><div className="text-[10px] text-muted-foreground">Enviados</div></div>
                <div><div className="text-sm font-bold text-warning">{conn.queue}</div><div className="text-[10px] text-muted-foreground">Na Fila</div></div>
                <div><div className="text-sm font-bold">{conn.dailyLimit}</div><div className="text-[10px] text-muted-foreground">Limite/Dia</div></div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Uso diário</span>
                  <span>{dailyPct}%</span>
                </div>
                <Progress value={dailyPct} className="h-1.5" />
              </div>

              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-[10px] capitalize">{conn.type === "qrcode" ? "QR Code · Baileys" : "Cloud API"}</Badge>
                <div className="flex gap-2">
                  {conn.status === "online" ? (
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleDisconnect(conn.id)}>Desconectar</Button>
                  ) : (
                    <Button size="sm" className="h-7 text-xs gap-1" onClick={() => handleReconnect(conn.id)}>
                      <RefreshCw className="size-3" /> Reconectar
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-7 px-2"><Settings2 className="size-3.5" /></Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
