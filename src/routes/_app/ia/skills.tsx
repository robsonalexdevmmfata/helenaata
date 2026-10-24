import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  AlertTriangle, BarChart2, Bot, CheckCircle2, Code2, DollarSign,
  Lock, MessageSquare, Network, RefreshCw, Search, Shield, Wrench, Zap,
} from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useDB, update } from "@/lib/store";
import { TOOL_REGISTRY } from "@/lib/helena/registry";
import { pageHead } from "@/lib/head";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/ia/skills")({
  head: () => pageHead("Skills IA", "Ferramentas e capacidades disponíveis para os agentes executarem ações no mundo real."),
  component: SkillsPage,
});

import type { ReactElement } from "react";

const RISK_LABEL: Record<string, string> = { baixo: "Baixo", medio: "Médio", alto: "Alto" };
const RISK_VARIANT: Record<string, "secondary" | "outline" | "destructive"> = {
  baixo: "secondary", medio: "outline", alto: "destructive",
};

// Ícone por categoria
const CAT_ICON: Record<string, ReactElement> = {
  CRM:          <Code2 className="size-4 text-blue-500" />,
  Mensagens:    <MessageSquare className="size-4 text-green-500" />,
  Agentes:      <Bot className="size-4 text-primary" />,
  Times:        <Network className="size-4 text-purple-500" />,
  Campanhas:    <Zap className="size-4 text-yellow-500" />,
  Operações:    <RefreshCw className="size-4 text-orange-500" />,
  Conhecimento: <Search className="size-4 text-cyan-500" />,
  Analytics:    <BarChart2 className="size-4 text-chart-1" />,
  Agenda:       <CheckCircle2 className="size-4 text-success" />,
  Automação:    <Wrench className="size-4 text-warning" />,
  Prospecção:   <Zap className="size-4 text-helena" />,
};

function SkillsPage() {
  const db = useDB();
  const [search, setSearch] = useState("");

  // Enriquecer toolSettings com metadados do registry
  const enriched = db.toolSettings.map((ts) => {
    const def = TOOL_REGISTRY.find((r) => r.name === ts.name);
    return { ...ts, label: def?.label ?? ts.name, description: def?.description ?? "", category: def?.category ?? "Outros" };
  });

  const filtered = enriched.filter((t) =>
    `${t.name} ${t.label} ${t.description} ${t.category}`.toLowerCase().includes(search.toLowerCase())
  );

  const enabled = db.toolSettings.filter((t) => t.enabled).length;
  const highRisk = db.toolSettings.filter((t) => t.risk === "alto").length;
  const disabled = db.toolSettings.filter((t) => !t.enabled).length;

  const toggleTool = (name: string, val: boolean) => {
    update((d) => {
      const tool = d.toolSettings.find((t) => t.name === name);
      if (tool) tool.enabled = val;
    });
    toast.success(val ? `Skill ativada` : `Skill desativada`);
  };

  // Agrupa por categoria preservando a ordem do registry
  const grouped = filtered.reduce<Record<string, typeof filtered>>((acc, t) => {
    const cat = t.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat]!.push(t);
    return acc;
  }, {});

  // Ordena categorias
  const CAT_ORDER = ["CRM", "Mensagens", "Agentes", "Times", "Campanhas", "Operações", "Prospecção", "Conhecimento", "Analytics", "Agenda", "Automação", "Outros"];
  const sortedCats = Object.keys(grouped).sort((a, b) => {
    const ia = CAT_ORDER.indexOf(a);
    const ib = CAT_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="IA"
        title="Skills & Ferramentas"
        description="Cada skill é uma capacidade real do agente de agir no sistema. Desative para restringir ações."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Skills Ativas" value={enabled} icon={<CheckCircle2 />} tone="success" />
        <StatCard label="Desativadas" value={disabled} icon={<Wrench />} tone="warning" />
        <StatCard label="Risco Alto" value={highRisk} hint="Requerem aprovação manual" icon={<Shield />} tone="danger" />
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
        <Input
          placeholder="Buscar skill por nome, categoria ou descrição..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="space-y-6">
        {sortedCats.map((category) => {
          const tools = grouped[category]!;
          const catEnabled = tools.filter((t) => t.enabled).length;
          return (
            <div key={category}>
              {/* Header da categoria */}
              <div className="flex items-center gap-2 mb-3">
                <div className="size-6 flex items-center justify-center">
                  {CAT_ICON[category] ?? <Code2 className="size-4 text-muted-foreground" />}
                </div>
                <h3 className="text-sm font-semibold">{category}</h3>
                <span className="text-[11px] text-muted-foreground ml-1">
                  {catEnabled}/{tools.length} ativas
                </span>
                {/* Toggle all na categoria */}
                <button
                  type="button"
                  onClick={() => {
                    const allOn = tools.every((t) => t.enabled);
                    update((d) => {
                      tools.forEach(({ name }) => {
                        const ts = d.toolSettings.find((x) => x.name === name);
                        if (ts) ts.enabled = !allOn;
                      });
                    });
                    toast.success(allOn ? `${category}: todas desativadas` : `${category}: todas ativadas`);
                  }}
                  className="ml-auto text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline transition-colors"
                >
                  {tools.every((t) => t.enabled) ? "Desativar todas" : "Ativar todas"}
                </button>
              </div>

              <div className="rounded-xl border overflow-hidden">
                {tools.map((tool, i) => (
                  <div
                    key={tool.name}
                    className={`flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors ${i > 0 ? "border-t" : ""} ${!tool.enabled ? "opacity-60" : ""}`}
                  >
                    {/* Ícone */}
                    <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      {CAT_ICON[tool.category] ?? <Code2 className="size-4 text-primary" />}
                    </div>

                    {/* Nome + descrição */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{tool.label}</p>
                        <code className="text-[10px] font-mono text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded hidden sm:block">
                          {tool.name}
                        </code>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{tool.description}</p>
                    </div>

                    {/* Risco */}
                    <Badge
                      variant={RISK_VARIANT[tool.risk]}
                      className="shrink-0 text-[10px] gap-1"
                    >
                      {tool.risk === "alto" && <Lock className="size-2.5" />}
                      {RISK_LABEL[tool.risk]}
                    </Badge>

                    {/* Toggle */}
                    <Switch
                      checked={tool.enabled}
                      onCheckedChange={(v) => toggleTool(tool.name, v)}
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Aviso de risco alto */}
      {highRisk > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/5 p-4 text-sm">
          <AlertTriangle className="size-4 text-warning shrink-0 mt-0.5" />
          <p className="text-muted-foreground">
            <strong className="text-foreground">{highRisk} skills de risco alto</strong> estão ativas.
            Toda execução exigirá aprovação manual antes de agir.
            Para automação total, considere reduzir para risco médio nas configurações.
          </p>
        </div>
      )}
    </div>
  );
}
