import type { ReactElement } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Activity, AlertTriangle, Bot, CheckCircle2, ChevronRight, Clock, Cpu, Edit2, ExternalLink,
  Flame, Globe, MessageCircle, MoreHorizontal, Network, Play, Plus, RefreshCw, Search,
  Settings2, ShieldCheck, Sparkles, Terminal, Zap,
} from "lucide-react";
import { PageHeader, StatCard, Status } from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { currentUser, useDB, update } from "@/lib/store";
import { canUseDevTeam } from "@/lib/saas";
import { agentStats } from "@/lib/analytics";
import { agentBenchmark } from "@/lib/helena/reliability";
import { runTool } from "@/lib/helena/engine";
import { pageHead } from "@/lib/head";
import { toast } from "sonner";
import type { AgentStatus } from "@/lib/types";
import {
  FREE_LLM_MODELS, FREE_LLM_PROVIDERS_LIST, getFreeLLMConfig, saveFreeLLMConfig,
  testFreeLLMConnection,
} from "@/lib/helena/freellmapi";
import { AgentForm } from "./components/-AgentForm";

export const Route = createFileRoute("/_app/ia/agentes")({
  head: () => pageHead("Agentes IA · FreeLLMAPI", "Gerencie os agentes autônomos com suporte gratuito ao repositório tashfeenahmed/freellmapi."),
  component: AgentesPage,
});

const STATUS_ICON: Record<AgentStatus, ReactElement> = {
  trabalhando: <CheckCircle2 className="size-3.5 text-success" />,
  aguardando: <Clock className="size-3.5 text-muted-foreground" />,
  pausado: <AlertTriangle className="size-3.5 text-warning" />,
  erro: <AlertTriangle className="size-3.5 text-destructive" />,
};

function AgentesPage() {
  const db = useDB();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("todos");

  // FreeLLMAPI state
  const [freeConfig, setFreeConfig] = useState(getFreeLLMConfig());
  const [showHubModal, setShowHubModal] = useState(false);
  const [selectedAgentForModel, setSelectedAgentForModel] = useState<string | null>(null);
  const [promptAgentId, setPromptAgentId] = useState<string | null>(null);
  const [promptDraft, setPromptDraft] = useState("");
  const [showCreateAgentModal, setShowCreateAgentModal] = useState(false);
  const [testingPing, setTestingPing] = useState(false);
  const [pingResult, setPingResult] = useState<{ ok: boolean; message: string; latencyMs: number } | null>(null);

  const roster = canUseDevTeam(currentUser(db)) ? db.agents : db.agents.filter((a) => a.teamId !== "t_dev");
  const bench = agentBenchmark(db);
  const roles = ["todos", ...Array.from(new Set(roster.map((a) => a.role)))];

  const filtered = roster.filter((a) => {
    const matchSearch = `${a.name} ${a.role} ${a.description}`.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "todos" || a.role === filter;
    return matchSearch && matchFilter;
  });

  const working = roster.filter((a) => a.status === "trabalhando").length;
  const errors = roster.filter((a) => a.status === "erro").length;
  const totalTasks = roster.reduce((s, a) => s + agentStats(db, a).outbound, 0);
  const freeAgentsCount = roster.filter((a) => a.model.startsWith("freellm/")).length;

  const handlePause = (id: string) => {
    const res = runTool("agents.pause", { agentId: id }, { actor: "Gestor", actorType: "user" });
    if (res.ok) toast.success(res.message);
    else toast.error(res.message);
  };

  const handleResume = (id: string) => {
    const res = runTool("agents.resume", { agentId: id }, { actor: "Gestor", actorType: "user" });
    if (res.ok) toast.success(res.message);
    else toast.error(res.message);
  };

  const applyFreeLLMAPIToAll = (modelId: string = "freellm/llama-3.3-70b") => {
    update((d) => {
      d.agents.forEach((ag) => {
        ag.model = modelId;
      });
    });
    toast.success(`Todos os ${db.agents.length} agentes foram migrados para ${modelId} (100% Grátis via FreeLLMAPI)!`);
  };

  const setAgentModel = (agentId: string, modelId: string) => {
    update((d) => {
      const ag = d.agents.find((x) => x.id === agentId);
      if (ag) ag.model = modelId;
    });
    setSelectedAgentForModel(null);
    toast.success("Modelo do agente atualizado!");
  };

  const handleSaveConfig = () => {
    saveFreeLLMConfig(freeConfig);
    toast.success("Configuração do FreeLLMAPI salva com sucesso!");
    setShowHubModal(false);
  };

  const runPingTest = async () => {
    setTestingPing(true);
    setPingResult(null);
    const res = await testFreeLLMConnection(freeConfig.endpoint);
    setPingResult(res);
    setTestingPing(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="IA · Força de Trabalho"
        title="Agentes Autônomos"
        description="Time comercial e de atendimento com nome, cargo e tom profissional — coordenado pela Helena."
      />

      {/* FreeLLMAPI Showcase & Hub Banner */}
      {bench.length > 0 && (
        <div className="rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold">Benchmark (execuções reais)</h2>
          <p className="mt-1 text-xs text-muted-foreground">Sucesso e falha no log desta organização. Sem nota de marketing.</p>
          <ul className="mt-3 space-y-1 font-mono text-xs text-muted-foreground">
            {bench.slice(0, 8).map((r) => (
              <li key={r.actor}>{r.actor}: {r.ok} ok / {r.fail} falha · erro {r.errorRate}% · {r.avgMs}ms · n={r.n}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="relative overflow-hidden rounded-2xl border border-helena/30 bg-gradient-to-r from-card via-card to-helena/10 p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="flex items-center gap-1.5 rounded-full bg-helena/15 px-2.5 py-0.5 text-xs font-semibold text-helena">
                <Flame className="size-3.5 fill-helena" /> FreeLLMAPI Integrado
              </span>
              <Badge variant="outline" className="border-success/30 text-success text-[11px] font-mono">
                7.4 Bilhões de Tokens/mês Grátis
              </Badge>
              <Badge variant="outline" className="border-border text-muted-foreground text-[11px]">
                34 Provedores · 635 Modelos
              </Badge>
            </div>
            <h2 className="text-base font-semibold tracking-tight text-foreground">
              Diretório Gratuito para Agentes (<a href="https://github.com/tashfeenahmed/freellmapi" target="_blank" rel="noreferrer" className="underline hover:text-helena">tashfeenahmed/freellmapi</a>)
            </h2>
            <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
              Roteamento inteligente e failover automático de 34 provedores gratuitos (Groq, Cloudflare, Mistral, Google, Together, Cerebras). Se uma cota estourar no WhatsApp, ele pula automaticamente para o próximo endpoint sem interromper seus SDRs.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button
              size="sm"
              className="bg-helena text-helena-foreground hover:bg-helena/90 text-xs font-medium gap-1.5"
              onClick={() => applyFreeLLMAPIToAll("freellm/llama-3.3-70b")}
            >
              <Zap className="size-3.5" /> Ativar FreeLLMAPI em Todos ({db.agents.length})
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-xs gap-1.5"
              onClick={() => setShowHubModal(true)}
            >
              <Settings2 className="size-3.5" /> Configurar Endpoint
            </Button>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-border/50 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-success animate-pulse" />
            <span>Endpoint: <code className="font-mono bg-muted/60 px-1 py-0.5 rounded">{freeConfig.endpoint}</code></span>
            <span>· Status: <strong className="text-foreground">{freeAgentsCount} de {db.agents.length} agentes usando FreeLLMAPI</strong></span>
          </div>
          <a
            href="https://github.com/tashfeenahmed/freellmapi"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 hover:text-foreground text-[11px]"
          >
            Ver repositório no GitHub <ExternalLink className="size-3" />
          </a>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard label="Trabalhando" value={working} icon={<CheckCircle2 />} tone="success" />
        <StatCard label="Total de Agentes" value={db.agents.length} icon={<Bot />} tone="info" />
        <StatCard label="Tarefas Executadas" value={totalTasks.toLocaleString("pt-BR")} icon={<Activity />} tone="helena" />
        <StatCard label="100% Gratuitos (FreeLLMAPI)" value={freeAgentsCount} icon={<Zap />} tone="success" />
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input placeholder="Buscar agente..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setShowCreateAgentModal(true)}>
            <Plus className="size-3.5" /> Novo Agente
          </Button>
          {roles.map((r) => (
            <Button key={r} size="sm" variant={filter === r ? "default" : "outline"} className="h-9 text-xs capitalize" onClick={() => setFilter(r)}>
              {r}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((agent) => {
          const team = db.teams.find((t) => t.agentIds.includes(agent.id));
          const isFree = agent.model.startsWith("freellm/");
          return (
            <div key={agent.id} className="flex min-h-[280px] min-w-0 flex-col overflow-hidden rounded-xl border bg-card p-4 hover:border-foreground/20 transition-all">
              <div className="min-w-0 flex-1 space-y-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="size-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                    {agent.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <h3 className="font-semibold text-sm truncate">{agent.name}</h3>
                      {STATUS_ICON[agent.status]}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{agent.description || agent.role}</p>
                    {team && <p className="text-[10px] text-primary mt-0.5 truncate">{team.name}</p>}
                  </div>
                </div>

                {agent.currentTask && (
                  <div className="rounded-lg bg-muted/40 px-3 py-2 min-w-0">
                    <p className="text-[10px] text-muted-foreground">Executando:</p>
                    <p className="text-xs line-clamp-2 break-words">{agent.currentTask}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-lg bg-muted/30 p-2 min-w-0">
                    <div className="text-sm font-bold">{agentStats(db, agent).outbound}</div>
                    <div className="text-[10px] text-muted-foreground">Disparos</div>
                  </div>
                  <div className="rounded-lg bg-muted/30 p-2 min-w-0">
                    <div className="text-sm font-bold text-success">{agentStats(db, agent).conversions}</div>
                    <div className="text-[10px] text-muted-foreground">Conversões</div>
                  </div>
                </div>

                <div className="space-y-1.5 pt-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 text-[11px] min-w-0">
                    <span className="text-muted-foreground shrink-0">Modelo Atual:</span>
                    {isFree ? (
                      <span className="font-mono text-[10px] text-success font-semibold flex items-center gap-1 min-w-0 truncate">
                        <Zap className="size-3 shrink-0" /> <span className="truncate">{agent.model.replace("freellm/", "")} (Free)</span>
                      </span>
                    ) : (
                      <span className="font-mono text-[10px] text-muted-foreground truncate">{agent.model}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-wrap">
                    {agent.channels.map((ch) => <Badge key={ch} variant="outline" className="text-[10px] px-1.5 py-0">{ch}</Badge>)}
                    {isFree && (
                      <Badge className="bg-success/15 text-success border-success/30 text-[9px] px-1.5 py-0">
                        Custo R$ 0,00
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-auto grid grid-cols-3 gap-1.5 pt-3 border-t min-w-0">
                {agent.status === "pausado" ? (
                  <Button size="sm" className="h-8 min-w-0 px-1 text-[11px] gap-1" onClick={() => handleResume(agent.id)}>
                    <Zap className="size-3 shrink-0" /> <span className="truncate">Retomar</span>
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" className="h-8 min-w-0 px-1 text-[11px] gap-1" onClick={() => handlePause(agent.id)}>
                    <Clock className="size-3 shrink-0" /> <span className="truncate">Pausar</span>
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 min-w-0 px-1 text-[11px] gap-1"
                  onClick={() => setSelectedAgentForModel(agent.id)}
                  title="Alterar modelo do agente"
                >
                  <Cpu className="size-3 shrink-0" /> <span className="truncate">Modelo</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 min-w-0 px-1 text-[11px] gap-1"
                  onClick={() => { setPromptAgentId(agent.id); setPromptDraft(agent.prompt || ""); }}
                  title="Editar prompt de abordagem"
                >
                  <Edit2 className="size-3 shrink-0" /> <span className="truncate">Prompt</span>
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal: Select Model for specific Agent */}
      <Dialog open={!!selectedAgentForModel} onOpenChange={(open) => !open && setSelectedAgentForModel(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Selecionar Modelo do Agente</DialogTitle>
            <DialogDescription>
              Escolha um modelo gratuito do FreeLLMAPI (34 provedores com failover) ou os modelos legados.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Modelos Gratuitos · FreeLLMAPI (7.4B tokens/mês)
            </div>
            <div className="grid gap-2">
              {FREE_LLM_MODELS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => selectedAgentForModel && setAgentModel(selectedAgentForModel, m.id)}
                  className="w-full text-left p-3 rounded-xl border border-border bg-card hover:border-helena/60 hover:bg-muted/40 transition-all flex items-center justify-between"
                >
                  <div>
                    <div className="text-sm font-semibold flex items-center gap-1.5">
                      <Zap className="size-3.5 text-helena" /> {m.name}
                    </div>
                    <div className="text-[11px] text-muted-foreground">{m.provider} · {m.tag}</div>
                  </div>
                  <Badge variant="outline" className="text-success border-success/30 text-[10px]">Grátis</Badge>
                </button>
              ))}
            </div>

            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-2">
              Modelos Padrão (Chave Própria)
            </div>
            <div className="grid gap-1.5">
              {[
                { id: "openai/gpt-4o-mini", label: "OpenAI GPT-4o-mini" },
                { id: "anthropic/claude-sonnet", label: "Anthropic Claude 3.5 Sonnet" },
                { id: "google/gemini-flash", label: "Google Gemini 1.5 Flash" },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => selectedAgentForModel && setAgentModel(selectedAgentForModel, m.id)}
                  className="w-full text-left px-3 py-2 rounded-lg border text-xs hover:bg-muted transition-colors flex items-center justify-between"
                >
                  <span>{m.label}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">{m.id}</span>
                </button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal: Criar Novo Agente */}
      <AgentForm
        open={showCreateAgentModal}
        onOpenChange={setShowCreateAgentModal}
        initialTeamId={db.teams.length > 0 ? db.teams[0].id : undefined}
      />

      {/* Modal: FreeLLMAPI Hub Configuration & Directory */}
      <Dialog open={showHubModal} onOpenChange={setShowHubModal}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Flame className="size-5 text-helena fill-helena" /> Configurar Hub FreeLLMAPI
            </DialogTitle>
            <DialogDescription>
              Conecte seu diretório do repositório <a href="https://github.com/tashfeenahmed/freellmapi" target="_blank" rel="noreferrer" className="underline font-semibold text-foreground">tashfeenahmed/freellmapi</a> para alimentar a Helena e todos os agentes sem custos.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div className="rounded-xl bg-muted/40 p-3.5 border space-y-2">
              <div className="font-semibold text-foreground flex items-center gap-1.5">
                <Terminal className="size-4 text-helena" /> Como rodar o FreeLLMAPI localmente (1 comando):
              </div>
              <div className="font-mono text-[11px] bg-background/80 p-2.5 rounded-lg border select-all">
                git clone https://github.com/tashfeenahmed/freellmapi.git<br />
                cd freellmapi &amp;&amp; python -m pip install -r requirements.txt<br />
                python main.py
              </div>
              <p className="text-[11px] text-muted-foreground">
                O servidor subirá em <code className="font-mono text-foreground">http://localhost:8000/v1</code> expondo a rota OpenAI-compatible.
              </p>
            </div>

            <div className="space-y-2">
              <label className="font-semibold text-foreground">Endpoint /v1 do FreeLLMAPI:</label>
              <div className="flex gap-2">
                <Input
                  value={freeConfig.endpoint}
                  onChange={(e) => setFreeConfig({ ...freeConfig, endpoint: e.target.value })}
                  placeholder="http://localhost:8000/v1"
                  className="font-mono text-xs"
                />
                <Button size="sm" variant="outline" onClick={runPingTest} disabled={testingPing}>
                  {testingPing ? <RefreshCw className="size-3.5 animate-spin" /> : "Testar Conexão"}
                </Button>
              </div>
              {pingResult && (
                <div className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${pingResult.ok ? "bg-success/10 text-success border border-success/30" : "bg-muted/60 text-muted-foreground border border-border"}`}>
                  {pingResult.ok ? <CheckCircle2 className="size-4 shrink-0" /> : <AlertTriangle className="size-4 shrink-0" />}
                  <span>{pingResult.message}</span>
                  {!pingResult.ok && (
                    <span className="ml-auto shrink-0 text-[10px]">
                      O FreeLLMAPI roda localmente — inicie com <code className="font-mono bg-muted px-1 rounded">python main.py</code>
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="font-semibold text-foreground">Modelo Padrão da Rota Gratuita:</label>
              <select
                value={freeConfig.defaultModel}
                onChange={(e) => setFreeConfig({ ...freeConfig, defaultModel: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs"
              >
                {FREE_LLM_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} — {m.provider}
                  </option>
                ))}
              </select>
            </div>

            {/* API Key (opcional para instâncias públicas) */}
            <div className="space-y-2">
              <label className="font-semibold text-foreground">API Key (opcional)</label>
              <Input
                type="password"
                value={freeConfig.apiKey ?? ""}
                onChange={(e) => setFreeConfig({ ...freeConfig, apiKey: e.target.value })}
                placeholder="Deixe em branco se rodando localmente"
                className="font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                Para instâncias locais não é necessário. Para endpoints públicos ou hospedados, informe o token de acesso.
              </p>
            </div>

            {/* Orçamento */}
            <div className="space-y-2">
              <label className="font-semibold text-foreground">Orçamento mensal de IA (R$)</label>
              <Input
                type="number"
                min={0}
                value={freeConfig.monthlyBudget ?? 0}
                onChange={(e) => setFreeConfig({ ...freeConfig, monthlyBudget: Number(e.target.value) })}
                placeholder="0 = sem limite"
                className="text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                Com FreeLLMAPI o custo é sempre R$ 0,00. Este campo serve para registrar eventual custo de instância hospedada.
              </p>
            </div>

            <div className="space-y-1.5 pt-2">
              <div className="font-semibold text-foreground">34 Provedores Gratuitos Integrados no Router:</div>
              <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto p-2 bg-muted/20 border rounded-lg">
                {FREE_LLM_PROVIDERS_LIST.map((p) => (
                  <span key={p} className="bg-background border rounded px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {p}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setShowHubModal(false)}>Cancelar</Button>
            <Button size="sm" className="bg-helena text-helena-foreground hover:bg-helena/90" onClick={handleSaveConfig}>
              Salvar Configuração
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(promptAgentId)} onOpenChange={(v) => !v && setPromptAgentId(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Prompt · {db.agents.find((a) => a.id === promptAgentId)?.name}</DialogTitle>
            <DialogDescription>
              Texto de abordagem. Preços oficiais ficam em Prospecção → Orçamentos; este prompt não deve inventar valor.
            </DialogDescription>
          </DialogHeader>
          <Textarea rows={14} value={promptDraft} onChange={(e) => setPromptDraft(e.target.value)} className="font-mono text-xs" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPromptAgentId(null)}>Cancelar</Button>
            <Button onClick={() => {
              if (!promptAgentId) return;
              update((d) => {
                const a = d.agents.find((x) => x.id === promptAgentId);
                if (a) a.prompt = promptDraft;
              });
              toast.success("Prompt atualizado");
              setPromptAgentId(null);
            }}>Salvar prompt</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
