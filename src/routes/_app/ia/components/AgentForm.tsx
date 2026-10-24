/**
 * Modal de Criação de Agente
 * Permite criar novos agentes com seleção de LLM (FreeLLMAPI ou outro)
 */

import { useState } from "react";
import {
  Bot, Zap, MessageCircle, Cpu, Clock, Users, TrendingUp, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useDB, update } from "@/lib/store";
import { runTool } from "@/lib/helena/engine";
import { toast } from "sonner";
import type { FreeLLMModel } from "@/lib/helena/freellmapi";
import {
  FREE_LLM_MODELS, getFreeLLMConfig, FREE_LLM_PROVIDERS_LIST,
} from "@/lib/helena/freellmapi";

interface AgentFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTeamId?: string;
}

export function AgentForm({ open, onOpenChange, initialTeamId }: AgentFormProps) {
  const db = useDB();
  const freeConfig = getFreeLLMConfig();
  
  const [formData, setFormData] = useState({
    name: "",
    role: "SDR",
    description: "",
    objective: "",
    personality: "Profissional, cordial e objetiva.",
    model: freeConfig.defaultModel,
    channels: ["whatsapp"],
    budget: 150,
    teamId: initialTeamId || "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.objective) {
      toast.error("Nome e objetivo são obrigatórios");
      return;
    }

    // Executa runTool para criar o agente
    const res = runTool("agents.create", {
      name: formData.name,
      role: formData.role,
      description: formData.description,
      objective: formData.objective,
      personality: formData.personality,
      model: formData.model,
      channels: formData.channels,
      budget: Number(formData.budget),
      teamId: formData.teamId || undefined,
    }, { actor: "Gestor", actorType: "user" });

    if (res.ok) {
      toast.success(`${formData.name} criado com sucesso!`, { description: res.message });
      onOpenChange(false);
      
      // Se FreeLLMAPI estiver configurado, sugere ativar
      if (formData.model.startsWith("freellm/")) {
        toast.success("FreeLLMAPI ativado! O agente está pronto para trabalhar.", {
          description: "Acesse IA → Agentes para ativar o agente.",
        });
      }
    } else {
      toast.error("Erro ao criar agente", { description: res.message });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="size-5 text-primary" /> Criar Novo Agente
          </DialogTitle>
          <DialogDescription>
            Crie um agente especialista (SDR, Closer, Atendimento, etc.) com IA gratuita via FreeLLMAPI.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nome e Função */}
          <div className="grid gap-2">
            <Label htmlFor="name">Nome do Agente</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ex: SDR Clínicas, Closer Premium"
              required
            />
            <p className="text-xs text-muted-foreground">Nome interno para identificação (ex: SDR 03)</p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="role">Função / Papel</Label>
            <Select
              value={formData.role}
              onValueChange={(value) => setFormData({ ...formData, role: value })}
            >
              <SelectTrigger id="role">
                <SelectValue placeholder="Selecione a função" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SDR">SDR (Prospecção)</SelectItem>
                <SelectItem value="Qualificador">Qualificador (BANT)</SelectItem>
                <SelectItem value="Closer">Closer (Fechamento)</SelectItem>
                <SelectItem value="Atendimento">Atendimento</SelectItem>
                <SelectItem value="Follow-up">Follow-up</SelectItem>
                <SelectItem value="Suporte">Suporte Técnico</SelectItem>
                <SelectItem value="Supervisor">Supervisor de Time</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Objetivo e Descrição */}
          <div className="grid gap-2">
            <Label htmlFor="objective">Objetivo Principal</Label>
            <Textarea
              id="objective"
              value={formData.objective}
              onChange={(e) => setFormData({ ...formData, objective: e.target.value })}
              placeholder="Ex: Prospectar clínicas odontológicas sem site no Google Maps"
              className="min-h-[80px]"
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="description">Descrição Detalhada (Opcional)</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Ex: O SDR deve focar em clínicas pequenas com menos de 10 funcionários"
              className="min-h-[60px]"
            />
          </div>

          {/* Model Selection */}
          <div className="grid gap-2">
            <Label htmlFor="model">Modelo de IA</Label>
            <div className="space-y-2">
              <Select
                value={formData.model}
                onValueChange={(value) => setFormData({ ...formData, model: value })}
              >
                <SelectTrigger id="model">
                  <SelectValue placeholder="Selecionar modelo" />
                </SelectTrigger>
                <SelectContent>
                  {/* FreeLLMAPI Models */}
                  <div className="py-2">
                    <div className="px-2 text-xs font-semibold text-muted-foreground uppercase">Grátis via FreeLLMAPI</div>
                    {FREE_LLM_MODELS.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        <div className="flex items-center gap-2">
                          <Zap className="size-3 text-helena" />
                          <span>{m.name}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">{m.provider} · {m.tag}</div>
                      </SelectItem>
                    ))}
                  </div>

                  <div className="my-2 border-t border-border" />

                  {/* Default Models */}
                  <div className="py-2">
                    <div className="px-2 text-xs font-semibold text-muted-foreground uppercase">Modelos Padrão</div>
                    {[
                      { id: "openai/gpt-4o-mini", name: "OpenAI GPT-4o-mini", tag: "Veloz e econômico" },
                      { id: "anthropic/claude-sonnet", name: "Anthropic Claude 3.5 Sonnet", tag: "Muito inteligente" },
                      { id: "google/gemini-flash", name: "Google Gemini 1.5 Flash", tag: "Rápido e barato" },
                    ].map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </div>
                </SelectContent>
              </Select>

              <p className="text-xs text-muted-foreground">
                <strong>FreeLLMAPI (Recomendado):</strong> 7.4 bilhões de tokens/mês grátis com failover automático entre 34 provedores.
              </p>
            </div>
          </div>

          {/* Canais */}
          <div className="grid gap-2">
            <Label>Canais Permitidos</Label>
            <div className="flex flex-wrap gap-2">
              {[
                { id: "whatsapp", label: "WhatsApp", icon: MessageCircle },
                { id: "instagram", label: "Instagram", icon: Users },
                { id: "email", label: "E-mail", icon: AlertCircle },
              ].map((ch) => (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => {
                    const channels = formData.channels.includes(ch.id)
                      ? formData.channels.filter((c) => c !== ch.id)
                      : [...formData.channels, ch.id];
                    setFormData({ ...formData, channels });
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-all ${
                    formData.channels.includes(ch.id)
                      ? "bg-primary/10 border-primary text-primary"
                      : "bg-background border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <ch.icon className="size-3.5" />
                  {ch.label}
                </button>
              ))}
            </div>
          </div>

          {/* Budget */}
          <div className="grid gap-2">
            <Label htmlFor="budget">Orçamento Mensal (R$)</Label>
            <div className="flex items-center gap-2">
              <Input
                id="budget"
                type="number"
                value={formData.budget}
                onChange={(e) => setFormData({ ...formData, budget: Number(e.target.value) })}
                min={0}
                max={1000}
                step={10}
                className="w-32"
              />
              <span className="text-sm text-muted-foreground">limite de gasto mensal</span>
            </div>
          </div>

          {/* Team Selection */}
          {db.teams.length > 0 && (
            <div className="grid gap-2">
              <Label htmlFor="teamId">Time (Opcional)</Label>
              <Select
                value={formData.teamId}
                onValueChange={(value) => setFormData({ ...formData, teamId: value })}
              >
                <SelectTrigger id="teamId">
                  <SelectValue placeholder="Atribuir a um time" />
                </SelectTrigger>
                <SelectContent>
                  {db.teams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      <div className="flex items-center gap-2">
                        <Users className="size-3.5 text-primary" />
                        {t.name}
                      </div>
                      <div className="text-xs text-muted-foreground">{t.agentIds.length} agentes</div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Summary */}
          <div className="rounded-lg bg-muted/30 p-3 text-xs space-y-2">
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <TrendingUp className="size-4" />
              <span>Resumo da Criação</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-muted-foreground block">Agente:</span>
                <span className="font-medium">{formData.name}</span>
              </div>
              <div>
                <span className="text-muted-foreground block">Função:</span>
                <span className="font-medium capitalize">{formData.role}</span>
              </div>
              <div>
                <span className="text-muted-foreground block">Modelo:</span>
                <span className="font-medium flex items-center gap-1.5">
                  {formData.model.startsWith("freellm/") ? <Zap className="size-3 text-helena" /> : <Cpu className="size-3" />}
                  {formData.model.replace("freellm/", "")}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block">Orçamento:</span>
                <span className="font-medium">R$ {formData.budget}/mês</span>
              </div>
            </div>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Bot className="size-4" />
              Criar Agente
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
