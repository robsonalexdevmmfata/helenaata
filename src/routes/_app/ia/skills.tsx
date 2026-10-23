import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  CheckCircle2, Code2, Lock, Plus, Search, Settings2, Shield, Trash2, Wrench, Zap,
} from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useDB, update } from "@/lib/store";
import { pageHead } from "@/lib/head";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/ia/skills")({
  head: () => pageHead("Skills IA", "Ferramentas e capacidades disponíveis para os agentes executarem ações no mundo real."),
  component: SkillsPage,
});

const RISK_COLOR: Record<string, string> = {
  baixo: "secondary",
  medio: "outline",
  alto: "destructive",
};

const CATEGORY_MAP: Record<string, string[]> = {
  "Comunicação": ["conversations.send", "conversations.assign", "conversations.close", "conversations.open", "quickReplies.send"],
  "CRM": ["deals.create", "deals.move", "deals.close", "contacts.create", "contacts.update", "contacts.tag", "tasks.create", "tasks.complete", "companies.create"],
  "Prospecção": ["campaigns.create", "campaigns.start", "campaigns.pause", "leads.export"],
  "Aprovações": ["approvals.approve", "approvals.deny", "agents.pause", "agents.resume"],
  "Missões": ["missions.create", "missions.start", "missions.pause", "missions.complete", "missionTasks.complete"],
};

function SkillsPage() {
  const db = useDB();
  const [search, setSearch] = useState("");

  const filtered = db.toolSettings.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  const enabled = db.toolSettings.filter((t) => t.enabled).length;
  const highRisk = db.toolSettings.filter((t) => t.risk === "alto").length;
  const disabled = db.toolSettings.filter((t) => !t.enabled).length;

  const toggleTool = (name: string, val: boolean) => {
    update((d) => {
      const tool = d.toolSettings.find((t) => t.name === name);
      if (tool) tool.enabled = val;
    });
    toast.success(val ? `Skill "${name}" ativada` : `Skill "${name}" desativada`);
  };

  const getCategory = (name: string) => {
    for (const [cat, tools] of Object.entries(CATEGORY_MAP)) {
      if (tools.includes(name)) return cat;
    }
    return "Outros";
  };

  const grouped = filtered.reduce<Record<string, typeof filtered>>((acc, t) => {
    const cat = getCategory(t.name);
    if (!acc[cat]) acc[cat] = [];
    acc[cat]!.push(t);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="IA"
        title="Skills & Ferramentas"
        description="Cada skill é uma capacidade do agente de agir no mundo real. Desative para restringir ações."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Skills Ativas" value={enabled} icon={<CheckCircle2 />} tone="success" />
        <StatCard label="Desativadas" value={disabled} icon={<Wrench />} tone="warning" />
        <StatCard label="Risco Alto" value={highRisk} hint="Requerem aprovação manual" icon={<Shield />} tone="destructive" />
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
        <Input placeholder="Buscar skill..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <div className="space-y-6">
        {Object.entries(grouped).map(([category, tools]) => (
          <div key={category}>
            <h3 className="text-sm font-semibold text-muted-foreground mb-3">{category}</h3>
            <div className="rounded-xl border overflow-hidden">
              {tools.map((tool, i) => (
                <div key={tool.name} className={`flex items-center gap-4 px-4 py-3 hover:bg-muted/20 transition-colors ${i > 0 ? "border-t" : ""}`}>
                  <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Code2 className="size-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-mono font-medium">{tool.name}</p>
                  </div>
                  <Badge variant={RISK_COLOR[tool.risk] as "default" | "secondary" | "outline" | "destructive"} className="shrink-0">
                    {tool.risk === "alto" ? <><Lock className="size-2.5 mr-1" />Alto</> : tool.risk === "medio" ? "Médio" : "Baixo"}
                  </Badge>
                  <Switch checked={tool.enabled} onCheckedChange={(v) => toggleTool(tool.name, v)} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
