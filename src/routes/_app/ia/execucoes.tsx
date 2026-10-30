import type { ReactElement } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Activity, AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Clock, Filter, Search, XCircle,
} from "lucide-react";
import { PageHeader, StatCard } from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useDB } from "@/lib/store";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/_app/ia/execucoes")({
  head: () => pageHead("Execuções IA", "Histórico completo de todas as ações executadas pelos agentes e Helena."),
  component: ExecucoesPage,
});

const RESULT_ICON: Record<string, ReactElement> = {
  sucesso: <CheckCircle2 className="size-4 text-success shrink-0" />,
  falha: <XCircle className="size-4 text-destructive shrink-0" />,
  pendente: <Clock className="size-4 text-warning shrink-0" />,
};

function ExecucoesPage() {
  const db = useDB();
  const [search, setSearch] = useState("");
  const [filterResult, setFilterResult] = useState("todos");
  const [filterActor, setFilterActor] = useState("todos");
  const [expanded, setExpanded] = useState<string | null>(null);

  const actorTypes = ["todos", ...Array.from(new Set(db.executions.map((e) => e.actorType)))];

  const filtered = db.executions.filter((e) => {
    const matchSearch = `${e.action} ${e.actor} ${e.description}`.toLowerCase().includes(search.toLowerCase());
    const matchResult = filterResult === "todos" || e.result === filterResult;
    const matchActor = filterActor === "todos" || e.actorType === filterActor;
    return matchSearch && matchResult && matchActor;
  }).slice(0, 100);

  const success = db.executions.filter((e) => e.result === "sucesso").length;
  const failed = db.executions.filter((e) => e.result === "falha").length;
  const pending = db.executions.filter((e) => e.result === "pendente").length;
  const avgDuration = db.executions.length > 0
    ? Math.round(db.executions.reduce((s, e) => s + e.durationMs, 0) / db.executions.length)
    : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="IA — Auditoria"
        title="Execuções"
        description="Histórico imutável de toda ação executada — Trava 3 do sistema anti-duplicidade."
      />

      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard label="Com Sucesso" value={success} icon={<CheckCircle2 />} tone="success" />
        <StatCard label="Total" value={db.executions.length} icon={<Activity />} tone="info" />
        <StatCard label="Com Falha" value={failed} icon={<XCircle />} tone="danger" />
        <StatCard label="Duração Média" value={`${avgDuration}ms`} hint="Por execução" icon={<Clock />} tone="helena" />
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input placeholder="Buscar ação, ator..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filterResult} onValueChange={setFilterResult}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Resultado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="sucesso">Sucesso</SelectItem>
            <SelectItem value="falha">Falha</SelectItem>
            <SelectItem value="pendente">Pendente</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterActor} onValueChange={setFilterActor}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Tipo de Ator" /></SelectTrigger>
          <SelectContent>
            {actorTypes.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-xl border overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Nenhuma execução encontrada.</div>
        ) : (
          filtered.map((exec, i) => (
            <div key={exec.id} className={`border-t first:border-0 ${expanded === exec.id ? "bg-muted/30" : "hover:bg-muted/10"} transition-colors`}>
              <button
                className="w-full flex items-center gap-3 px-4 py-3 text-left"
                onClick={() => setExpanded(expanded === exec.id ? null : exec.id)}
              >
                {RESULT_ICON[exec.result] ?? <Activity className="size-4 text-muted-foreground shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-mono font-medium">{exec.action}</span>
                    <Badge variant="outline" className="text-[10px] capitalize">{exec.actorType}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{exec.description}</p>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <p className="text-xs text-muted-foreground">{new Date(exec.at).toLocaleString("pt-BR")}</p>
                  <p className="text-[10px] text-muted-foreground">{exec.durationMs}ms</p>
                </div>
                {expanded === exec.id ? <ChevronDown className="size-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />}
              </button>
              {expanded === exec.id && (
                <div className="px-4 pb-4 space-y-2">
                  <div className="rounded-lg bg-background border p-3 space-y-1.5">
                    <p className="text-xs"><span className="text-muted-foreground">Ator:</span> <span className="font-medium">{exec.actor}</span></p>
                    <p className="text-xs"><span className="text-muted-foreground">Solicitado por:</span> <span className="font-medium">{exec.requestedBy}</span></p>
                    {exec.approvedBy && <p className="text-xs"><span className="text-muted-foreground">Aprovado por:</span> <span className="font-medium">{exec.approvedBy}</span></p>}
                    {exec.error && <p className="text-xs text-destructive"><span className="font-medium">Erro:</span> {exec.error}</p>}
                    {exec.params && Object.keys(exec.params).length > 0 && (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-muted-foreground">Parâmetros</summary>
                        <pre className="mt-1 text-[10px] text-muted-foreground overflow-auto">{JSON.stringify(exec.params, null, 2)}</pre>
                      </details>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
