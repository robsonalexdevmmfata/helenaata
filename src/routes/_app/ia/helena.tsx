import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import {
  Activity, AlertTriangle, BarChart3, Bot, Calendar, CalendarClock, CheckCircle2,
  ChevronRight, CircleDollarSign, Clock, Disc3, Edit2, ExternalLink, Flame, MessageSquare,
  Mic, MicOff, Music, Network, Pause, Play, Plus, Radio, RefreshCw, Search, Settings2,
  Sliders, Sparkles, StopCircle, Trash2, Volume2, VolumeX, Zap,
} from "lucide-react";
import { PageHeader, StatCard, Status } from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { useDB, update } from "@/lib/store";
import { runTool } from "@/lib/helena/engine";
import { brl } from "@/lib/format";
import { pageHead } from "@/lib/head";
import { toast } from "sonner";
import { useHelenaVoice } from "@/hooks/useHelenaVoice";
import {
  getBriefingConfig, saveBriefingConfig, generateBriefingScript,
  extractYouTubeId, MUSIC_PRESETS, type BriefingConfig,
} from "@/lib/helena/briefing";

export const Route = createFileRoute("/_app/ia/helena")({
  head: () => pageHead("Helena · Tech Lead IA", "O cérebro central da operação — supervisão, aprovações, briefing executivo e análises estratégicas."),
  component: HelenaPage,
});

const AUTONOMY_LABELS: Record<number, string> = {
  1: "Manual — tudo requer aprovação",
  2: "Semi-auto — ações de baixo risco automáticas",
  3: "Autônoma — apenas risco alto solicita aprovação",
  4: "Total — Helena age livremente",
};

function HelenaPage() {
  const db = useDB();
  const s = db.helenaSettings;
  const autonomy = db.autonomyLevel || 3;
  const pending = db.approvals.filter((a) => a.status === "pendente").length;
  const execToday = db.executions.filter((e) => e.at.slice(0, 10) === new Date().toISOString().slice(0, 10)).length;
  const totalCost = db.aiUsage.reduce((sum, u) => sum + u.cost, 0);

  // Briefing state
  const [briefingCfg, setBriefingCfg] = useState<BriefingConfig>(getBriefingConfig());
  const [isPlayingBriefing, setIsPlayingBriefing] = useState(false);
  const [activeScript, setActiveScript] = useState<{ title: string; script: string; highlights: Array<{ label: string; value: string }> } | null>(null);
  const [ytPlaying, setYtPlaying] = useState(false);

  const ytIframeRef = useRef<HTMLIFrameElement>(null);

  const { speak, stopSpeaking, isSpeaking, startListening, stopListening, isListening } = useHelenaVoice({
    onTranscript: (transcript) => {
      const text = transcript.toLowerCase();
      if (text.includes("cheguei") || text.includes("iniciar expediente") || text.includes("olá helena") || text.includes("ola helena")) {
        triggerBriefingSimulation("entrada");
      } else if (text.includes("encerrando") || text.includes("fim do expediente") || text.includes("tchau helena")) {
        triggerBriefingSimulation("encerramento");
      }
    },
  });

  const setAutonomy = (level: number) => {
    update((d) => { d.autonomyLevel = level as 1 | 2 | 3 | 4; });
    toast.success(`Autonomia alterada para Nível ${level}`);
  };

  const toggleKill = () => {
    update((d) => { d.killSwitchActive = !d.killSwitchActive; });
    toast.success(db.killSwitchActive ? "Kill Switch desativado — Helena operando" : "Kill Switch ATIVADO — Helena pausada");
  };

  const handleApproval = (id: string, action: "approve" | "deny") => {
    const res = runTool(
      action === "approve" ? "approvals.approve" : "approvals.deny",
      { approvalId: id, reason: "Via painel de controle" },
      { actor: "Gestor", actorType: "user" }
    );
    if (res.ok) toast.success(res.message);
    else toast.error(res.message);
  };

  const saveConfig = (partial: Partial<BriefingConfig>) => {
    const updated = saveBriefingConfig(partial);
    setBriefingCfg(updated);
    toast.success("Configuração salva com sucesso!");
  };

  // Music control via YouTube iframe
  const controlYouTube = (action: "play" | "pause" | "volume", volume?: number) => {
    if (!ytIframeRef.current?.contentWindow) return;
    try {
      if (action === "play") {
        ytIframeRef.current.contentWindow.postMessage(JSON.stringify({ event: "command", func: "playVideo", args: [] }), "*");
        setYtPlaying(true);
      } else if (action === "pause") {
        ytIframeRef.current.contentWindow.postMessage(JSON.stringify({ event: "command", func: "pauseVideo", args: [] }), "*");
        setYtPlaying(false);
      }
      if (volume !== undefined) {
        ytIframeRef.current.contentWindow.postMessage(JSON.stringify({ event: "command", func: "setVolume", args: [volume] }), "*");
      }
    } catch {}
  };

  // Trigger briefing simulation (entrada ou encerramento)
  const triggerBriefingSimulation = (type: "entrada" | "encerramento" = "entrada") => {
    const briefing = generateBriefingScript(db, briefingCfg, type);
    setActiveScript(briefing);
    setIsPlayingBriefing(true);

    // 1. Iniciar música de fundo suave (volume configurado, ex: 18%)
    if (briefingCfg.autoPlayMusic) {
      setYtPlaying(true);
      setTimeout(() => {
        controlYouTube("play");
        controlYouTube("volume", briefingCfg.musicVolume);
      }, 300);
    }

    // 2. Falar briefing com voz feminina Helena em primeiro plano
    speak(briefing.script);
    toast.success(type === "entrada" ? "Briefing de Entrada iniciado com Happy Nation!" : "Resumo de Encerramento iniciado!");
  };

  const stopAllAudio = () => {
    stopSpeaking();
    controlYouTube("pause");
    setIsPlayingBriefing(false);
    toast.info("Áudio e trilha pausados.");
  };

  const currentYtId = extractYouTubeId(briefingCfg.musicUrl);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="IA — Tech Lead"
        title="Helena"
        description="Supervisora central do sistema. Gerencia agentes, aprovações, briefing executivo e saúde operacional em tempo real."
      />

      {db.killSwitchActive && (
        <div className="flex items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4">
          <AlertTriangle className="size-5 text-destructive shrink-0" />
          <div>
            <p className="font-semibold text-destructive text-sm">Kill Switch Ativo</p>
            <p className="text-xs text-muted-foreground">Todas as ações autônomas estão pausadas. Reative para retomar operações.</p>
          </div>
          <Button size="sm" variant="destructive" className="ml-auto" onClick={toggleKill}>Reativar</Button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard label="Nível de Autonomia" value={`Nível ${autonomy}`} hint={AUTONOMY_LABELS[autonomy]} icon={<Sparkles />} tone="helena" />
        <StatCard label="Aprovações Pendentes" value={pending} icon={<AlertTriangle />} tone="warning" />
        <StatCard label="Execuções Hoje" value={execToday} icon={<Zap />} tone="info" />
        <StatCard label="Custo Acumulado" value={brl(totalCost)} hint="Tokens de IA consumidos" icon={<CircleDollarSign />} tone="success" />
      </div>

      <Tabs defaultValue="briefing">
        <TabsList className="flex flex-wrap gap-1">
          <TabsTrigger value="briefing" className="gap-1.5 font-medium">
            <Radio className="size-3.5 text-helena" /> Modo Briefing Executivo
          </TabsTrigger>
          <TabsTrigger value="controle">Painel de Controle</TabsTrigger>
          <TabsTrigger value="aprovacoes">Aprovações {pending > 0 && `(${pending})`}</TabsTrigger>
          <TabsTrigger value="config">Configurações</TabsTrigger>
        </TabsList>

        {/* TAB: MODO BRIEFING EXECUTIVO */}
        <TabsContent value="briefing" className="mt-4 space-y-6">
          {/* Hero Banner */}
          <div className="relative overflow-hidden rounded-2xl border border-helena/40 bg-gradient-to-r from-card via-card to-helena/15 p-6 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="flex items-center gap-1.5 rounded-full bg-helena/20 px-3 py-1 text-xs font-semibold text-helena">
                    <Sparkles className="size-3.5 fill-helena" /> Executive Audio Briefing
                  </span>
                  <Badge variant="outline" className="border-helena/40 text-helena text-[11px] font-mono">
                    🎵 Trilha: Ace of Base - Happy Nation
                  </Badge>
                  <Badge variant="outline" className="text-success border-success/30 text-[11px]">
                    Voz Sintetizada Ativa
                  </Badge>
                </div>
                <h2 className="text-lg font-bold tracking-tight text-foreground">
                  Modo Briefing Diário &amp; Perfil do Gestor
                </h2>
                <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
                  Ao chegar no escritório ou dizer <strong className="text-foreground">"{briefingCfg.triggerPhrase}"</strong>, a Helena toca sua trilha sonora favorita de fundo (Happy Nation) e resume em áudio o faturamento do dia, prospecções dos SDRs e prioridades do dia!
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <Button
                  size="sm"
                  className="bg-helena text-helena-foreground hover:bg-helena/90 text-xs font-semibold gap-2 shadow-md hover:scale-[1.02] transition-transform"
                  onClick={() => triggerBriefingSimulation("entrada")}
                >
                  <Play className="size-4 fill-current" /> Simular Entrada ("Olá Helena, cheguei")
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs gap-1.5"
                  onClick={() => triggerBriefingSimulation("encerramento")}
                >
                  <Clock className="size-3.5" /> Simular Encerramento
                </Button>
                {(isPlayingBriefing || isSpeaking || ytPlaying) && (
                  <Button
                    size="sm"
                    variant="destructive"
                    className="text-xs gap-1.5"
                    onClick={stopAllAudio}
                  >
                    <StopCircle className="size-4" /> Pausar Tudo
                  </Button>
                )}
              </div>
            </div>

            {/* Microfone de ativação por voz em tempo real */}
            <div className="mt-5 pt-4 border-t border-border/50 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-3">
                <Button
                  size="sm"
                  variant={isListening ? "default" : "outline"}
                  className={`h-8 gap-1.5 text-xs ${isListening ? "bg-red-500 hover:bg-red-600 text-white animate-pulse" : ""}`}
                  onClick={isListening ? stopListening : startListening}
                >
                  {isListening ? <Mic className="size-3.5 animate-bounce" /> : <MicOff className="size-3.5 text-muted-foreground" />}
                  {isListening ? "Escutando gatilho de voz..." : "Ativar Microfone Contínuo"}
                </Button>
                <span className="text-muted-foreground">
                  Gatilho configurado: <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-foreground font-semibold">"{briefingCfg.triggerPhrase}"</code>
                </span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Volume2 className="size-3.5 text-helena" />
                <span>Volume da Trilha: <strong className="text-foreground">{briefingCfg.musicVolume}%</strong></span>
              </div>
            </div>
          </div>

          {/* Active Live Script Display when playing */}
          {activeScript && (
            <div className="rounded-2xl border border-helena/50 bg-card p-5 space-y-4 shadow-md animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2">
                  <div className="size-3 rounded-full bg-helena animate-ping" />
                  <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">
                    <Disc3 className="size-4 text-helena animate-spin" /> {activeScript.title} — Áudio ao Vivo
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  {ytPlaying && (
                    <Badge variant="outline" className="border-helena/40 text-helena text-[11px] flex items-center gap-1 font-mono">
                      <Music className="size-3 animate-pulse" /> Happy Nation tocando a {briefingCfg.musicVolume}%
                    </Badge>
                  )}
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={stopAllAudio}>
                    Fechar
                  </Button>
                </div>
              </div>

              {/* Highlights cards */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                {activeScript.highlights.map((h, i) => (
                  <div key={i} className="rounded-lg bg-muted/40 p-2.5 border">
                    <div className="text-[10px] text-muted-foreground">{h.label}</div>
                    <div className="font-semibold text-foreground truncate mt-0.5">{h.value}</div>
                  </div>
                ))}
              </div>

              {/* Transcript Text */}
              <div className="rounded-xl bg-muted/20 p-4 border border-dashed border-helena/30">
                <p className="text-xs sm:text-sm text-foreground leading-relaxed italic">
                  "{activeScript.script}"
                </p>
              </div>
            </div>
          )}

          {/* Configuration Panels Grid */}
          <div className="grid gap-6 md:grid-cols-2">
            {/* Panel A: Tratamento e Tom de Voz */}
            <div className="rounded-2xl border bg-card p-5 space-y-4">
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4 text-helena" />
                  <h3 className="font-semibold text-sm">Estilo de Tratamento &amp; Tom de Voz</h3>
                </div>
                <Badge variant="secondary" className="text-[10px]">Personalização</Badge>
              </div>

              <div className="space-y-3.5 text-xs">
                <div>
                  <label className="font-medium text-foreground">Como a Helena te chama (Título):</label>
                  <p className="text-[11px] text-muted-foreground mb-1.5">Pronome de autoridade ou apelido executivo.</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {["Sócio-Fundador", "Chefe", "Líder", "Diretora", "CEO", "Letícia"].map((title) => (
                      <Button
                        key={title}
                        size="sm"
                        variant={briefingCfg.userTitle === title ? "default" : "outline"}
                        className={`h-7 text-xs ${briefingCfg.userTitle === title ? "bg-helena text-helena-foreground hover:bg-helena/90 font-semibold" : ""}`}
                        onClick={() => saveConfig({ userTitle: title })}
                      >
                        {title}
                      </Button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="font-medium text-foreground">Seu Nome de Gestor:</label>
                  <Input
                    value={briefingCfg.userName}
                    onChange={(e) => saveConfig({ userName: e.target.value })}
                    className="mt-1 h-8 text-xs"
                    placeholder="Letícia Andrade"
                  />
                </div>

                <div>
                  <label className="font-medium text-foreground">Frase de Ativação (Gatilho de Voz Entrada):</label>
                  <p className="text-[11px] text-muted-foreground mb-1">Dita no microfone para disparar o briefing e a música.</p>
                  <Input
                    value={briefingCfg.triggerPhrase}
                    onChange={(e) => saveConfig({ triggerPhrase: e.target.value })}
                    className="mt-1 h-8 text-xs font-mono"
                    placeholder="Olá Helena, cheguei"
                  />
                </div>

                <div>
                  <label className="font-medium text-foreground">Frase de Saída (Encerramento de Expediente):</label>
                  <p className="text-[11px] text-muted-foreground mb-1">Para modo noturno e cadência automática dos SDRs.</p>
                  <Input
                    value={briefingCfg.exitTriggerPhrase}
                    onChange={(e) => saveConfig({ exitTriggerPhrase: e.target.value })}
                    className="mt-1 h-8 text-xs font-mono"
                    placeholder="Helena, encerrando por hoje"
                  />
                </div>

                <div>
                  <label className="font-medium text-foreground">Tom de Negócio / Visão de Futuro:</label>
                  <select
                    value={briefingCfg.voiceTone}
                    onChange={(e) => saveConfig({ voiceTone: e.target.value })}
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs"
                  >
                    <option value="Executivo & Foco em Metas">Executivo & Foco em Metas (R$ 15k)</option>
                    <option value="Inspirador & Agressivo comercialmente">Inspirador & Agressivo Comercial</option>
                    <option value="Direto e Sucinto">Direto e Sucinto (Sem rodeios)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Panel B: Player de Trilha Sonora de Fundo (YouTube / Áudio) */}
            <div className="rounded-2xl border bg-card p-5 space-y-4">
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2">
                  <Music className="size-4 text-helena" />
                  <h3 className="font-semibold text-sm">Trilha Sonora de Fundo (YouTube Player)</h3>
                </div>
                <Badge className="bg-helena/15 text-helena border-helena/30 text-[10px]">Ace of Base</Badge>
              </div>

              <div className="space-y-4 text-xs">
                <div>
                  <label className="font-medium text-foreground">Presets de Trilha Sonora:</label>
                  <div className="grid gap-1.5 mt-1.5">
                    {MUSIC_PRESETS.map((p) => {
                      const isSelected = briefingCfg.musicUrl.includes(p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => saveConfig({ musicUrl: p.url })}
                          className={`w-full text-left p-2.5 rounded-lg border text-xs flex items-center justify-between transition-colors ${isSelected ? "border-helena bg-helena/10 font-semibold" : "hover:bg-muted/40"}`}
                        >
                          <span className="flex items-center gap-2">
                            <Disc3 className={`size-3.5 ${isSelected ? "text-helena animate-spin" : "text-muted-foreground"}`} />
                            {p.title}
                          </span>
                          {isSelected && <Badge variant="outline" className="border-helena/50 text-helena text-[9px]">Ativa</Badge>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="font-medium text-foreground">Link / ID de Vídeo do YouTube:</label>
                  <Input
                    value={briefingCfg.musicUrl}
                    onChange={(e) => saveConfig({ musicUrl: e.target.value })}
                    className="mt-1 h-8 text-xs font-mono"
                    placeholder="https://www.youtube.com/watch?v=HWjCStB6k4o"
                  />
                </div>

                {/* Slider de Volume */}
                <div className="rounded-xl border bg-muted/20 p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium flex items-center gap-1.5 text-foreground">
                      <Sliders className="size-3.5 text-helena" /> Volume da Trilha em Segundo Plano:
                    </span>
                    <span className="font-mono font-bold text-helena text-sm">{briefingCfg.musicVolume}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="2"
                    value={briefingCfg.musicVolume}
                    onChange={(e) => {
                      const vol = Number(e.target.value);
                      saveConfig({ musicVolume: vol });
                      controlYouTube("volume", vol);
                    }}
                    className="w-full accent-amber-500 cursor-pointer h-2 bg-muted rounded-lg"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Recomendado entre <strong>15% e 20%</strong> para que a música toque suavemente enquanto a fala da Helena permanece nítida em primeiro plano.
                  </p>
                </div>

                {/* Autoplay toggle */}
                <div className="flex items-center justify-between p-3 rounded-xl border bg-muted/20">
                  <div>
                    <div className="font-medium text-foreground">Autoplay ao Detectar Voz / Simular</div>
                    <div className="text-[10px] text-muted-foreground">Dispara a música e o briefing simultaneamente.</div>
                  </div>
                  <Switch
                    checked={briefingCfg.autoPlayMusic}
                    onCheckedChange={(checked) => saveConfig({ autoPlayMusic: checked })}
                  />
                </div>

                {/* Manual audio test buttons */}
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 h-8 text-xs gap-1.5"
                    onClick={() => controlYouTube(ytPlaying ? "pause" : "play", briefingCfg.musicVolume)}
                  >
                    {ytPlaying ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                    {ytPlaying ? "Pausar Trilha" : "Testar Apenas Música"}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Hidden YouTube Iframe Player */}
          <div className="hidden" aria-hidden="true">
            <iframe
              ref={ytIframeRef}
              width="200"
              height="200"
              src={`https://www.youtube-nocookie.com/embed/${currentYtId}?enablejsapi=1&origin=${typeof window !== "undefined" ? window.location.origin : ""}&loop=1&playlist=${currentYtId}`}
              title="YouTube background music"
              allow="autoplay; encrypted-media"
            />
          </div>
        </TabsContent>

        {/* TAB: CONTROLE */}
        <TabsContent value="controle" className="mt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border bg-card p-5 space-y-3">
              <h3 className="font-semibold text-sm">Nível de Autonomia</h3>
              <div className="space-y-2">
                {([1, 2, 3, 4] as const).map((level) => (
                  <button key={level} onClick={() => setAutonomy(level)}
                    className={`w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-all ${autonomy === level ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}>
                    <div className={`size-8 flex items-center justify-center rounded-full font-bold text-sm ${autonomy === level ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{level}</div>
                    <span className="text-xs">{AUTONOMY_LABELS[level]}</span>
                    {autonomy === level && <Badge className="ml-auto">Atual</Badge>}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border bg-card p-5 space-y-3">
              <h3 className="font-semibold text-sm">Ações de Emergência</h3>
              <div className="space-y-2">
                <div className="rounded-lg border p-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Kill Switch Global</p>
                    <p className="text-xs text-muted-foreground">Pausa imediata de todas as ações autônomas</p>
                  </div>
                  <Button variant={db.killSwitchActive ? "outline" : "destructive"} size="sm" onClick={toggleKill}>
                    {db.killSwitchActive ? "Desativar" : "Ativar"}
                  </Button>
                </div>
                <div className="rounded-lg border p-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Modelo de IA</p>
                    <p className="text-xs text-muted-foreground">{s.model}</p>
                  </div>
                  <Badge variant="outline">{s.agentsDefaultModel}</Badge>
                </div>
                <div className="rounded-lg border p-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Budget Mensal</p>
                    <p className="text-xs text-muted-foreground">{brl(totalCost)} de {brl(s.monthlyBudget)}</p>
                  </div>
                  <Badge variant={totalCost > s.alertAt ? "destructive" : "secondary"}>
                    {Math.round((totalCost / s.monthlyBudget) * 100)}%
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* TAB: APROVACOES */}
        <TabsContent value="aprovacoes" className="mt-4 space-y-3">
          {db.approvals.filter((a) => a.status === "pendente").length === 0 ? (
            <div className="rounded-xl border bg-card p-10 text-center">
              <Sparkles className="size-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm font-medium">Nenhuma aprovação pendente</p>
              <p className="text-xs text-muted-foreground">Helena está operando normalmente.</p>
            </div>
          ) : (
            db.approvals.filter((a) => a.status === "pendente").map((ap) => (
              <div key={ap.id} className="rounded-xl border bg-card p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={ap.risk === "alto" ? "destructive" : ap.risk === "medio" ? "outline" : "secondary"}>
                        {ap.risk === "alto" ? "Risco Alto" : ap.risk === "medio" ? "Risco Médio" : "Risco Baixo"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{ap.requestedBy}</span>
                    </div>
                    <h4 className="font-semibold text-sm">{ap.title}</h4>
                    <p className="text-xs text-muted-foreground">{ap.description}</p>
                  </div>
                </div>
                {ap.details.length > 0 && (
                  <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted/30 p-2">
                    {ap.details.map((d, i) => (
                      <div key={i}><span className="text-[10px] text-muted-foreground">{d.label}: </span>
                        <span className="text-[10px] font-medium">{d.value}</span></div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button size="sm" variant="destructive" className="flex-1 h-8" onClick={() => handleApproval(ap.id, "deny")}>Negar</Button>
                  <Button size="sm" className="flex-1 h-8" onClick={() => handleApproval(ap.id, "approve")}>Aprovar</Button>
                </div>
              </div>
            ))
          )}
        </TabsContent>

        {/* TAB: CONFIGURACOES */}
        <TabsContent value="config" className="mt-4">
          <div className="rounded-xl border bg-card p-5 space-y-4">
            <h3 className="font-semibold text-sm">Configurações da Helena</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="text-xs text-muted-foreground">Modelo Principal</label>
                <Input defaultValue={s.model} readOnly className="mt-1" /></div>
              <div><label className="text-xs text-muted-foreground">Modelo dos Agentes</label>
                <Input defaultValue={s.agentsDefaultModel} readOnly className="mt-1" /></div>
              <div><label className="text-xs text-muted-foreground">Budget Mensal (R$)</label>
                <Input defaultValue={s.monthlyBudget} readOnly className="mt-1" /></div>
              <div><label className="text-xs text-muted-foreground">Alertar em (R$)</label>
                <Input defaultValue={s.alertAt} readOnly className="mt-1" /></div>
            </div>
            <p className="text-xs text-muted-foreground">Para alterar configurações avançadas, acesse o terminal da Helena no chat ou configure o FreeLLMAPI em Agentes.</p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
