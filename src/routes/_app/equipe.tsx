import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Award, Bot, CheckCircle2, Cpu, Edit2, Mail, Plus, Search, Target, Users, Zap,
} from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useDB, update, uid, nowISO } from "@/lib/store";
import { runTool } from "@/lib/helena/engine";
import { initials, brl } from "@/lib/format";
import { pageHead } from "@/lib/head";
import { toast } from "sonner";
import { FREE_LLM_MODELS, getFreeLLMConfig } from "@/lib/helena/freellmapi";
import type { Role, Agent } from "@/lib/types";

export const Route = createFileRoute("/_app/equipe")({
  head: () => pageHead("Equipe", "Gestão da equipe humana e dos agentes IA que compõem a operação."),
  component: EquipePage,
});

const ROLE_LABEL: Record<string, string> = {
  owner: "Proprietário", admin: "Admin", manager: "Gestor", agent: "Agente", viewer: "Visualizador",
};
const COLOR_CLASS: Record<string, string> = {
  "chart-1": "bg-[hsl(var(--chart-1))]",
  "chart-2": "bg-[hsl(var(--chart-2))]",
  "chart-3": "bg-[hsl(var(--chart-3))]",
  "chart-4": "bg-[hsl(var(--chart-4))]",
  "chart-5": "bg-[hsl(var(--chart-5))]",
};

// ── Formulário de convite de membro humano ──────────────────────────────────
function InviteModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("agent");
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !name.trim()) return toast.error("Nome e e-mail são obrigatórios.");
    update((d) => {
      d.invites.unshift({ id: uid("iv_"), organizationId: d.organization.id, email: email.trim(), role, sentAt: nowISO() });
    });
    toast.success(`Convite enviado para ${email}`);
    setEmail(""); setName(""); setTitle(""); setRole("agent");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Adicionar Membro</DialogTitle>
          <DialogDescription>Envie um convite por e-mail. O membro receberá acesso com o papel selecionado.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 py-1">
          <div className="space-y-1.5"><Label>Nome completo</Label>
            <Input placeholder="Ex: Ana Lima" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-1.5"><Label>E-mail</Label>
            <Input type="email" placeholder="ana@empresa.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-1.5"><Label>Cargo / Título (opcional)</Label>
            <Input placeholder="Ex: Executiva de Vendas" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5"><Label>Papel</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(ROLE_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" className="gap-1.5"><Plus className="size-3.5" /> Enviar Convite</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Formulário de edição de agente IA ───────────────────────────────────────
interface AgentEditForm {
  id: string;
  name: string;
  role: string;
  objective: string;
  personality: string;
  model: string;
  budget: number;
  channels: string[];
  schedule: string;
}

function AgentEditModal({ agent, onClose }: { agent: Agent | null; onClose: () => void }) {
  const db = useDB();
  const freeConfig = getFreeLLMConfig();

  const [form, setForm] = useState<AgentEditForm>(() =>
    agent
      ? {
          id: agent.id, name: agent.name, role: agent.role,
          objective: agent.objective, personality: agent.personality,
          model: agent.model, budget: agent.budget,
          channels: [...agent.channels], schedule: agent.schedule,
        }
      : {
          id: "", name: "", role: "SDR", objective: "", personality: "Profissional, cordial e objetiva.",
          model: freeConfig.defaultModel, budget: 150, channels: ["whatsapp"], schedule: "Seg–Sex, 08:00–18:00",
        }
  );

  if (!agent) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    update((d) => {
      const a = d.agents.find((x) => x.id === form.id);
      if (!a) return;
      a.name = form.name;
      a.role = form.role;
      a.objective = form.objective;
      a.personality = form.personality;
      a.model = form.model;
      a.budget = Number(form.budget);
      a.channels = form.channels as Agent["channels"];
      a.schedule = form.schedule;
    });
    toast.success(`${form.name} atualizado com sucesso`);
    onClose();
  };

  const ALL_CHANNELS = ["whatsapp", "instagram", "messenger", "email", "webchat"] as const;

  return (
    <Dialog open={!!agent} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="size-5 text-primary" /> Editar Agente IA
          </DialogTitle>
          <DialogDescription>Ajuste o comportamento, modelo e orçamento do agente.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-4 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Nome</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="space-y-1.5"><Label>Função</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["SDR","Qualificador","Closer","Atendimento","Follow-up","Suporte","Supervisor"].map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5"><Label>Objetivo</Label>
            <Textarea value={form.objective} onChange={(e) => setForm({ ...form, objective: e.target.value })}
              className="min-h-[70px]" placeholder="Ex: Prospectar clínicas sem site no Google Maps" />
          </div>

          <div className="space-y-1.5"><Label>Personalidade / Tom de Voz</Label>
            <Textarea value={form.personality} onChange={(e) => setForm({ ...form, personality: e.target.value })}
              className="min-h-[60px]" />
          </div>

          {/* Modelo IA */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Cpu className="size-3.5" /> Modelo de IA
            </Label>
            <Select value={form.model} onValueChange={(v) => setForm({ ...form, model: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <div className="px-2 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Grátis — FreeLLMAPI
                </div>
                {FREE_LLM_MODELS.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    <div className="flex items-center gap-2">
                      <Zap className="size-3 text-success" />
                      <span>{m.name}</span>
                      <span className="text-[10px] text-muted-foreground">{m.provider}</span>
                    </div>
                  </SelectItem>
                ))}
                <div className="px-2 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mt-1 border-t">
                  Chave própria
                </div>
                {[
                  { id: "openai/gpt-4o-mini", label: "OpenAI GPT-4o-mini" },
                  { id: "anthropic/claude-sonnet", label: "Anthropic Claude 3.5 Sonnet" },
                  { id: "google/gemini-flash", label: "Google Gemini 1.5 Flash" },
                ].map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {form.model.startsWith("freellm/") && (
              <p className="text-[11px] text-success flex items-center gap-1">
                <Zap className="size-3" /> Custo R$ 0,00 — roteamento automático com failover entre 34 provedores
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Orçamento mensal (R$)</Label>
              <Input type="number" min={0} value={form.budget}
                onChange={(e) => setForm({ ...form, budget: Number(e.target.value) })} />
            </div>
            <div className="space-y-1.5"><Label>Horário</Label>
              <Input value={form.schedule} onChange={(e) => setForm({ ...form, schedule: e.target.value })}
                placeholder="Seg–Sex, 08:00–18:00" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Canais</Label>
            <div className="flex flex-wrap gap-2">
              {ALL_CHANNELS.map((ch) => (
                <button key={ch} type="button"
                  onClick={() => {
                    const chs = form.channels.includes(ch)
                      ? form.channels.filter((x) => x !== ch)
                      : [...form.channels, ch];
                    setForm({ ...form, channels: chs });
                  }}
                  className={`px-3 py-1 rounded-lg border text-xs transition-all ${
                    form.channels.includes(ch)
                      ? "bg-primary/10 border-primary text-primary"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {ch}
                </button>
              ))}
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit">Salvar alterações</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Página principal ────────────────────────────────────────────────────────
function EquipePage() {
  const db = useDB();
  const [search, setSearch] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);

  const filteredUsers = db.users.filter((u) =>
    `${u.name} ${u.email} ${u.title}`.toLowerCase().includes(search.toLowerCase())
  );
  const filteredAgents = db.agents.filter((a) =>
    `${a.name} ${a.role} ${a.description}`.toLowerCase().includes(search.toLowerCase())
  );

  const activeUsers = db.users.filter((u) => u.status === "ativo").length;
  const workingAgents = db.agents.filter((a) => a.status === "trabalhando").length;
  const totalConversions = db.agents.reduce((s, a) => s + a.metrics.conversions, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operações"
        title="Equipe"
        description="Membros humanos e agentes IA — todos os que executam a operação da agência."
        actions={
          <Button className="gap-2" onClick={() => setInviteOpen(true)}>
            <Plus className="size-4" /> Adicionar Membro
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Humanos Ativos" value={activeUsers} icon={<Users />} tone="info" />
        <StatCard label="Agentes IA Ativos" value={workingAgents} icon={<Bot />} tone="helena" />
        <StatCard label="Total de Conversões IA" value={totalConversions} icon={<Award />} tone="success" />
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
        <Input placeholder="Buscar membro ou agente..." value={search}
          onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <Tabs defaultValue="humanos">
        <TabsList>
          <TabsTrigger value="humanos">Humanos ({db.users.length})</TabsTrigger>
          <TabsTrigger value="agentes">Agentes IA ({db.agents.length})</TabsTrigger>
        </TabsList>

        {/* ABA HUMANOS */}
        <TabsContent value="humanos" className="mt-4 space-y-4">
          {/* Convites pendentes */}
          {db.invites.length > 0 && (
            <div className="rounded-xl border border-dashed p-4 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Convites pendentes ({db.invites.length})
              </p>
              {db.invites.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between gap-4 text-sm">
                  <span className="text-muted-foreground truncate">{inv.email}</span>
                  <Badge variant="outline" className="text-[10px] shrink-0">{ROLE_LABEL[inv.role] ?? inv.role}</Badge>
                  <Button size="sm" variant="ghost" className="h-6 text-xs text-muted-foreground"
                    onClick={() => {
                      update((d) => { d.invites = d.invites.filter((x) => x.id !== inv.id); });
                      toast.success("Convite cancelado");
                    }}>
                    Cancelar
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredUsers.map((user) => {
              const pct = user.goal > 0 ? Math.min(100, Math.round((user.achieved / user.goal) * 100)) : 0;
              const conv = db.deals.filter((d) => d.ownerId === user.id && d.status === "ganho").length;
              return (
                <div key={user.id} className="rounded-xl border bg-card p-5 space-y-4 hover:border-foreground/20 transition-all">
                  <div className="flex items-center gap-3">
                    <div className={`size-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 ${COLOR_CLASS[user.color] ?? "bg-primary"}`}>
                      {initials(user.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm truncate">{user.name}</h3>
                      <p className="text-xs text-muted-foreground">{user.title}</p>
                    </div>
                    <Badge variant={user.status === "ativo" ? "default" : "secondary"} className="shrink-0 text-[10px]">
                      {user.status}
                    </Badge>
                  </div>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2"><Mail className="size-3.5" /><span className="truncate">{user.email}</span></div>
                    <div className="flex items-center gap-2"><Target className="size-3.5" /><span>{ROLE_LABEL[user.role] ?? user.role}</span></div>
                    <div className="flex items-center gap-2"><CheckCircle2 className="size-3.5" /><span>{conv} deals fechados</span></div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Meta do mês</span>
                      <span className="font-medium">{brl(user.achieved)} / {brl(user.goal)}</span>
                    </div>
                    <Progress value={pct} className="h-1.5" />
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        {/* ABA AGENTES IA */}
        <TabsContent value="agentes" className="mt-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredAgents.map((agent) => {
              const team = db.teams.find((t) => t.agentIds.includes(agent.id));
              const isFree = agent.model.startsWith("freellm/");
              const budgetPct = agent.budget > 0 ? Math.min(100, Math.round((agent.spent / agent.budget) * 100)) : 0;
              return (
                <div key={agent.id} className="rounded-xl border bg-card p-5 space-y-4 hover:border-foreground/20 transition-all">
                  <div className="flex items-center gap-3">
                    <div className="size-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                      {agent.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm truncate">{agent.name}</h3>
                      <p className="text-xs text-muted-foreground capitalize">{agent.role}
                        {team && <span className="text-primary"> · {team.name}</span>}
                      </p>
                    </div>
                    <Badge
                      variant={agent.status === "trabalhando" ? "default" : agent.status === "erro" ? "destructive" : "secondary"}
                      className="text-[10px] shrink-0"
                    >
                      {agent.status}
                    </Badge>
                  </div>

                  {agent.objective && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{agent.objective}</p>
                  )}

                  <div className="grid grid-cols-3 text-center gap-1">
                    <div className="rounded-lg bg-muted/30 py-1.5">
                      <div className="text-sm font-bold">{agent.metrics.tasks}</div>
                      <div className="text-[10px] text-muted-foreground">Tarefas</div>
                    </div>
                    <div className="rounded-lg bg-muted/30 py-1.5">
                      <div className="text-sm font-bold text-primary">{agent.metrics.conversations}</div>
                      <div className="text-[10px] text-muted-foreground">Convs.</div>
                    </div>
                    <div className="rounded-lg bg-muted/30 py-1.5">
                      <div className="text-sm font-bold text-success">{agent.metrics.conversions}</div>
                      <div className="text-[10px] text-muted-foreground">Conv.</div>
                    </div>
                  </div>

                  {/* Modelo + orçamento */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground">Modelo:</span>
                      <span className={`font-mono flex items-center gap-1 ${isFree ? "text-success" : "text-muted-foreground"}`}>
                        {isFree && <Zap className="size-2.5" />}
                        {agent.model.replace("freellm/", "")}
                      </span>
                    </div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-muted-foreground">Budget mensal</span>
                      <span>{brl(agent.spent)} / {brl(agent.budget)}</span>
                    </div>
                    <Progress value={budgetPct} className={`h-1 ${budgetPct > 80 ? "[&>div]:bg-destructive" : ""}`} />
                  </div>

                  {/* Canais */}
                  <div className="flex flex-wrap gap-1">
                    {agent.channels.map((ch) => (
                      <Badge key={ch} variant="outline" className="text-[10px] px-1.5">{ch}</Badge>
                    ))}
                  </div>

                  {/* Botão editar */}
                  <Button size="sm" variant="outline" className="w-full h-8 text-xs gap-1.5"
                    onClick={() => setEditingAgent(agent)}>
                    <Edit2 className="size-3.5" /> Editar Agente
                  </Button>
                </div>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      {/* Modais */}
      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
      <AgentEditModal agent={editingAgent} onClose={() => setEditingAgent(null)} />
    </div>
  );
}
