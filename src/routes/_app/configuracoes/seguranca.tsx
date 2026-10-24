import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  AlertTriangle, CheckCircle2, Clock, Globe, KeyRound, Lock, LogOut, Monitor, Plus,
  RefreshCw, Shield, ShieldCheck, Smartphone, Trash2,
} from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useDB, update, uid, nowISO } from "@/lib/store";
import { pageHead } from "@/lib/head";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/configuracoes/seguranca")({
  head: () => pageHead("Segurança", "Controle de sessões, autenticação e proteção da conta."),
  component: SegurancaPage,
});

function SegurancaPage() {
  const db = useDB();
  const [mfaOn, setMfaOn] = useState(db.organizationSettings?.mfaEnabled ?? false);
  const [ipWhitelist, setIpWhitelist] = useState(db.organizationSettings?.ipWhitelist ?? []);
  const [newIp, setNewIp] = useState("");
  const [showAddIp, setShowAddIp] = useState(false);
  const [changePwOpen, setChangePwOpen] = useState(false);
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });

  const sessions = db.sessions ?? [];

  const handleToggleMfa = (val: boolean) => {
    setMfaOn(val);
    update((d) => { if (d.organizationSettings) d.organizationSettings.mfaEnabled = val; });
    toast.success(val ? "MFA ativado — você receberá um código no próximo acesso." : "MFA desativado.");
  };

  const handleAddIp = () => {
    const trimmed = newIp.trim();
    if (!trimmed) return toast.error("Informe um IP ou CIDR válido.");
    const next = [...ipWhitelist, trimmed];
    setIpWhitelist(next);
    update((d) => { if (d.organizationSettings) d.organizationSettings.ipWhitelist = next; });
    setNewIp("");
    setShowAddIp(false);
    toast.success(`IP ${trimmed} adicionado à whitelist.`);
  };

  const handleRemoveIp = (ip: string) => {
    const next = ipWhitelist.filter((x) => x !== ip);
    setIpWhitelist(next);
    update((d) => { if (d.organizationSettings) d.organizationSettings.ipWhitelist = next; });
    toast.success(`IP ${ip} removido.`);
  };

  const handleRevokeSession = (id: string) => {
    update((d) => { d.sessions = (d.sessions ?? []).filter((s) => s.id !== id); });
    toast.success("Sessão encerrada.");
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pw.current) return toast.error("Informe a senha atual.");
    if (pw.next.length < 8) return toast.error("A nova senha deve ter ao menos 8 caracteres.");
    if (pw.next !== pw.confirm) return toast.error("As senhas não conferem.");
    setPw({ current: "", next: "", confirm: "" });
    setChangePwOpen(false);
    toast.success("Senha alterada com sucesso!");
  };

  return (
    <div className="space-y-8 max-w-2xl">
      <PageHeader
        eyebrow="Configurações"
        title="Segurança"
        description="Controle autenticação, sessões ativas e regras de acesso à conta."
      />

      {/* Autenticação */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Lock className="size-4 text-primary" /> Autenticação
        </h2>
        <div className="rounded-xl border divide-y">
          <div className="flex items-center justify-between px-4 py-3 gap-4">
            <div>
              <p className="text-sm font-medium">Autenticação de dois fatores (MFA)</p>
              <p className="text-xs text-muted-foreground">Exige código extra no login — protege a conta mesmo com senha vazada.</p>
            </div>
            <Switch checked={mfaOn} onCheckedChange={handleToggleMfa} />
          </div>
          <div className="flex items-center justify-between px-4 py-3 gap-4">
            <div>
              <p className="text-sm font-medium">Alterar senha</p>
              <p className="text-xs text-muted-foreground">Última alteração: nunca registrada.</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setChangePwOpen(true)}>
              <KeyRound className="size-3.5 mr-1.5" /> Alterar
            </Button>
          </div>
        </div>
      </section>

      {/* Sessões ativas */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Monitor className="size-4 text-primary" /> Sessões Ativas
        </h2>
        {sessions.length === 0 ? (
          <div className="rounded-xl border p-6 text-center text-sm text-muted-foreground">
            Nenhuma sessão ativa registrada no momento.
          </div>
        ) : (
          <div className="rounded-xl border divide-y">
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                <Smartphone className="size-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{s.device}</p>
                  <p className="text-xs text-muted-foreground">{s.ip} · {s.location} · último acesso: {new Date(s.lastActive).toLocaleString("pt-BR")}</p>
                </div>
                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleRevokeSession(s.id)}>
                  <LogOut className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
        <Button
          size="sm"
          variant="outline"
          className="text-destructive border-destructive/30 hover:bg-destructive/5"
          onClick={() => {
            update((d) => { d.sessions = []; });
            toast.success("Todas as sessões encerradas.");
          }}
        >
          <LogOut className="size-3.5 mr-1.5" /> Encerrar todas as sessões
        </Button>
      </section>

      {/* IP Whitelist */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Globe className="size-4 text-primary" /> Whitelist de IPs
          </h2>
          <Button size="sm" variant="outline" onClick={() => setShowAddIp(true)}>
            <Plus className="size-3.5 mr-1.5" /> Adicionar IP
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Restrinja o acesso ao sistema a IPs específicos. Deixe vazio para liberar qualquer IP.
        </p>
        {ipWhitelist.length === 0 ? (
          <div className="rounded-xl border p-4 text-center text-sm text-muted-foreground">
            Nenhum IP restrito — qualquer origem pode acessar.
          </div>
        ) : (
          <div className="rounded-xl border divide-y">
            {ipWhitelist.map((ip) => (
              <div key={ip} className="flex items-center justify-between px-4 py-2.5">
                <code className="text-sm font-mono">{ip}</code>
                <Button size="icon" variant="ghost" className="size-7 hover:text-destructive" onClick={() => handleRemoveIp(ip)}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Alterar senha modal */}
      <Dialog open={changePwOpen} onOpenChange={setChangePwOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Alterar Senha</DialogTitle>
            <DialogDescription>Escolha uma senha forte com ao menos 8 caracteres.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleChangePassword} className="space-y-3 py-1">
            <div className="space-y-1">
              <Label htmlFor="pw-current">Senha atual</Label>
              <Input id="pw-current" type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pw-next">Nova senha</Label>
              <Input id="pw-next" type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pw-confirm">Confirmar nova senha</Label>
              <Input id="pw-confirm" type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setChangePwOpen(false)}>Cancelar</Button>
              <Button type="submit">Salvar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Adicionar IP modal */}
      <Dialog open={showAddIp} onOpenChange={setShowAddIp}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Adicionar IP à Whitelist</DialogTitle>
            <DialogDescription>Informe um endereço IPv4, IPv6 ou bloco CIDR (ex: 192.168.1.0/24).</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <Label htmlFor="new-ip">Endereço IP / CIDR</Label>
            <Input
              id="new-ip"
              placeholder="ex: 189.28.100.0/24"
              value={newIp}
              onChange={(e) => setNewIp(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddIp()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddIp(false)}>Cancelar</Button>
            <Button onClick={handleAddIp}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
