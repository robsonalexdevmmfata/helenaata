import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { HelenaAvatar } from "@/components/helena/HelenaAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { restoreSession } from "@/lib/auth";
import { currentUser, getDB, patchUserEverywhere, update, nowISO } from "@/lib/store";
import { instanceNameFromLabel, provisionEvolutionInstance, sanitizeInstanceName } from "@/lib/evolution/provision";
import { evolutionConnectQr, evolutionSendText, getEvolutionStatus } from "@/lib/evolution/evolutionapi";
import { pageHead } from "@/lib/head";
import { toast } from "sonner";
import { userAction } from "@/lib/helena/engine";
import { QrCode, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/comecar")({
  ssr: false,
  head: () => pageHead("Começar", "Nomeie a Linha Helena, leia o QR e mande a primeira mensagem."),
  beforeLoad: async () => {
    if (!(await restoreSession())) throw redirect({ to: "/login" });
  },
  component: OnboardingPage,
});

function OnboardingPage() {
  const navigate = useNavigate();
  const user = currentUser(getDB());
  const [step, setStep] = useState(1);
  const [agentName, setAgentName] = useState(user?.companyName || user?.name || "");
  const [instanceLabel, setInstanceLabel] = useState(user?.evolutionInstance || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState("");
  const [status, setStatus] = useState("");
  const [nicho, setNicho] = useState(user?.prospectSegment || "pizzaria");
  const [cidade, setCidade] = useState(user?.prospectCity || "");

  const instance = instanceNameFromLabel(instanceLabel || agentName, user?.id);
  const finish = () => {
    if (user) patchUserEverywhere(user.id, (u) => { u.onboardingDone = true; });
    navigate({ to: "/visao-geral" });
  };

  const connect = async () => {
    if (!user) return;
    if (!agentName.trim() && !instanceLabel.trim()) {
      toast.error("Nome do agente ou da instância.");
      return;
    }
    setBusy(true);
    setStatus("Criando a Linha Helena…");
    try {
      const created = await provisionEvolutionInstance(user, { instanceName: instance });
      if (!created.ok) {
        setStatus(created.error || "Não criou a instância.");
        setBusy(false);
        return;
      }
      const pair = await evolutionConnectQr();
      if (pair.connected) {
        setQr("");
        setStatus("Chip já conectado.");
        setStep(3);
      } else if (pair.qr) {
        setQr(pair.qr);
        setStatus("Leia o QR no WhatsApp (Aparelhos conectados).");
        setStep(2);
      } else {
        setStatus(pair.error || "Instância ok. Tente de novo se o QR não aparecer.");
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Falha");
    }
    setBusy(false);
  };

  const sendTest = async () => {
    const to = phone.replace(/\D/g, "");
    if (to.length < 10) {
      toast.error("Coloca o seu número com DDI para o teste.");
      return;
    }
    setBusy(true);
    const res = await evolutionSendText(to, "Helena no ar. Esta é a mensagem de teste da Linha Helena. Se chegou, o expediente pode começar.");
    setBusy(false);
    if (res.ok) {
      toast.success("Teste enviado.");
      update((d) => {
        const c = d.connections[0];
        if (c) {
          c.status = "online";
          c.lastSyncAt = nowISO();
          c.phone = `+${to}`;
        }
      });
      setStep(4);
    } else {
      toast.error(res.error || "Não enviou. Confirma o QR primeiro.");
      const s = await getEvolutionStatus().catch(() => null);
      if (s?.connected) finish();
    }
  };

  return (
    <div className="grid min-h-[100dvh] place-items-center bg-[#0b0a09] px-4 text-[#f4efe6]">
      <div className="w-full max-w-md space-y-5 rounded-2xl border border-white/10 bg-[#141210] p-8">
        <HelenaAvatar className="size-12" />
        <p className="text-[11px] tracking-[0.22em] text-[#f4efe6]/50">ONBOARDING · {step}/4</p>
        {step === 1 && (
          <>
            <h1 className="font-serif text-3xl">Nomeie a Linha Helena</h1>
            <p className="text-sm text-[#f4efe6]/65">Sem API Key. O QR nasce no passo 2. Configuração Evolution é só da Info Tech.</p>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Nome do agente</Label>
                <Input value={agentName} onChange={(e) => { setAgentName(e.target.value); if (!instanceLabel) setInstanceLabel(sanitizeInstanceName(e.target.value)); }} placeholder="Helena SDR" />
              </div>
              <div className="space-y-1.5">
                <Label>Nome da instância</Label>
                <Input className="font-mono" value={instanceLabel} onChange={(e) => setInstanceLabel(e.target.value)} placeholder="hudemo" />
                <p className="text-xs text-muted-foreground">Na Evolution: {instance || "—"}</p>
              </div>
            </div>
            <Button className="w-full bg-[#e07a3d] text-[#1c1410]" disabled={busy} onClick={() => void connect()}>
              {busy ? <RefreshCw className="size-4 animate-spin" /> : <QrCode className="size-4" />}
              <span className="ml-2">Gerar QR</span>
            </Button>
          </>
        )}
        {step === 2 && (
          <>
            <h1 className="font-serif text-3xl">Leia o QR</h1>
            <p className="text-sm text-[#f4efe6]/65">{status}</p>
            {qr && <img src={qr} alt="QR" className="mx-auto w-56 h-56 rounded-lg bg-white p-2" />}
            <Button className="w-full bg-[#e07a3d] text-[#1c1410]" onClick={() => setStep(3)}>Já li o QR</Button>
            <Button variant="ghost" className="w-full" disabled={busy} onClick={() => void connect()}>Gerar de novo</Button>
          </>
        )}
        {step === 3 && (
          <>
            <h1 className="font-serif text-3xl">Primeira mensagem</h1>
            <p className="text-sm text-[#f4efe6]/65">Manda um teste no seu próprio chip. Se chegar, a máquina está no ar.</p>
            <div className="space-y-1.5">
              <Label>Seu WhatsApp (DDI+DDD)</Label>
              <Input className="font-mono" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="5511999999999" />
            </div>
            <Button className="w-full bg-[#e07a3d] text-[#1c1410]" disabled={busy} onClick={() => void sendTest()}>Enviar teste</Button>
            <Button variant="ghost" className="w-full" onClick={() => setStep(4)}>Pular teste</Button>
          </>
        )}
        {step === 4 && (
          <>
            <h1 className="font-serif text-3xl">Primeira missão</h1>
            <p className="text-sm text-[#f4efe6]/65">Nicho e cidade. A Helena agenda o radar. Trial de 2 dias não muda.</p>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Nicho</Label>
                <Input value={nicho} onChange={(e) => setNicho(e.target.value)} placeholder="pizzaria" />
              </div>
              <div className="space-y-1.5">
                <Label>Cidade</Label>
                <Input value={cidade} onChange={(e) => setCidade(e.target.value)} placeholder="Campinas" />
              </div>
            </div>
            <Button
              className="w-full bg-[#e07a3d] text-[#1c1410]"
              onClick={() => {
                if (!nicho.trim() || !cidade.trim()) {
                  toast.error("Nicho e cidade.");
                  return;
                }
                const r = userAction("rpa.first_mission", { nicho, cidade, simulate: true });
                r.ok ? toast.success(r.message) : toast.error(r.message);
                finish();
              }}
            >
              Disparar missão
            </Button>
            <Button variant="ghost" className="w-full" onClick={finish}>Ir ao painel sem missão</Button>
          </>
        )}
        {status && step === 1 && <p className="text-xs text-[#f4efe6]/50">{status}</p>}
      </div>
    </div>
  );
}
