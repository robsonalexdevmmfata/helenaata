/**
 * Modal de Criação de Time
 * Permite criar times de agentes com supervisor
 */

import { useState } from "react";
import type { Team } from "@/lib/types";
import { Users, Sparkles, Zap, Globe, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useDB, update } from "@/lib/store";
import { toast } from "sonner";

interface TeamFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TeamForm({ open, onOpenChange }: TeamFormProps) {
  const db = useDB();
  
  const [formData, setFormData] = useState({
    name: "",
    objective: "",
    supervisorId: "",
    budget: 200,
    channels: ["whatsapp"],
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.objective) {
      toast.error("Nome e objetivo são obrigatórios");
      return;
    }

    // Cria time no database
    const teamId = `t_${Math.random().toString(36).substring(2, 9)}`;
    
    update((d) => {
      d.teams.push({
        id: teamId,
        organizationId: d.organization.id,
        name: formData.name,
        objective: formData.objective,
        supervisorId: formData.supervisorId || "",
        agentIds: [],
        goals: "",
        schedule: "Seg–Sex, 08:00–18:00",
        channels: formData.channels as Team["channels"],
        budget: Number(formData.budget),
        spent: 0,
        status: "ativo",
        metrics: { leads: 0, meetings: 0, conversions: 0 },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });

    toast.success(`${formData.name} criado com sucesso!`, {
      description: `Supervisor: ${db.agents.find(a => a.id === formData.supervisorId)?.name || "A definir"}`,
    });

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="size-5 text-primary" /> Criar Novo Time
          </DialogTitle>
          <DialogDescription>
            Crie um time de agentes coordenados por um supervisor (Helena ou humano).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Nome do Time</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ex: Comercial SP, Atendimento 24h"
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="objective">Objetivo do Time</Label>
            <Textarea
              id="objective"
              value={formData.objective}
              onChange={(e) => setFormData({ ...formData, objective: e.target.value })}
              placeholder="Ex: Gerar 50 reuniões qualificadas por mês"
              className="min-h-[80px]"
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="supervisorId">Supervisor</Label>
            <Select
              value={formData.supervisorId}
              onValueChange={(value) => setFormData({ ...formData, supervisorId: value })}
            >
              <SelectTrigger id="supervisorId">
                <SelectValue placeholder="Selecionar supervisor" />
              </SelectTrigger>
              <SelectContent>
                {/* Helena como supervisor */}
                <SelectItem value="helena">
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-3.5 text-helena" />
                    Helena (IA Orquestradora)
                  </div>
                  <div className="text-xs text-muted-foreground">IA principal coordenando todos os agentes</div>
                </SelectItem>
                
                <div className="my-2 border-t border-border" />
                
                {/* Agentes como supervisores */}
                {db.agents.filter(a => a.role === "SDR" || a.role === "Closer" || a.role === "Atendimento").map(a => (
                  <SelectItem key={a.id} value={a.id}>
                    <div className="flex items-center gap-2">
                      <Users className="size-3.5 text-primary" />
                      {a.name}
                    </div>
                    <div className="text-xs text-muted-foreground">{a.role}</div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>Canais do Time</Label>
            <div className="flex flex-wrap gap-2">
              {[
                { id: "whatsapp", label: "WhatsApp", icon: Zap },
                { id: "instagram", label: "Instagram", icon: Globe },
                { id: "email", label: "E-mail", icon: Zap },
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

          <div className="grid gap-2">
            <Label htmlFor="budget">Orçamento Mensal (R$)</Label>
            <Input
              id="budget"
              type="number"
              value={formData.budget}
              onChange={(e) => setFormData({ ...formData, budget: Number(e.target.value) })}
              min={0}
              max={500}
              step={10}
              className="w-32"
            />
            <p className="text-xs text-muted-foreground">Limite total de gasto do time por mês</p>
          </div>

          <div className="rounded-lg bg-muted/30 p-3 text-xs">
            <div className="flex items-center gap-2 font-semibold text-foreground mb-2">
              <Clock className="size-4" />
              <span>Padrões Automáticos</span>
            </div>
            <div className="space-y-1 text-muted-foreground">
              <div>• Schedule: Seg–Sex, 08:00–18:00</div>
              <div>• Status: Ativo (começa trabalhando imediatamente)</div>
              <div>• Métricas: leads, reuniões, conversões</div>
            </div>
          </div>

          <DialogFooter className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Users className="size-4" />
              Criar Time
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
