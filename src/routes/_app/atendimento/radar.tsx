import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, Clock, Flame, MessageCircle, Radar, Smile } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dot, EntityAvatar, Panel, StatCard, StatusBadge, Status, colorFor } from "@/components/app/kit";
import { ownerName, useDB } from "@/lib/store";
import { openHelena } from "@/lib/helena/orchestrator";
import { timeAgo } from "@/lib/format";
import { pageHead } from "@/lib/head";
import type { Conversation } from "@/lib/types";

export const Route = createFileRoute("/_app/atendimento/radar")({
  head: () => pageHead("Radar de atendimento", "Monitoramento em tempo real de conversas em risco, SLA e agentes."),
  component: RadarPage,
});

function waitingMinutes(c: Conversation) {
  const lastContact = [...c.messages].reverse().find((m) => m.from === "contact");
  const lastReply = [...c.messages].reverse().find((m) => m.from !== "contact" && m.from !== "system");
  if (!lastContact || (lastReply && +new Date(lastReply.at) > +new Date(lastContact.at))) return 0;
  return Math.round((Date.now() - +new Date(lastContact.at)) / 60000);
}

function RadarPage() {
  const db = useDB();
  const active = db.conversations.filter((c) => c.status !== "resolvida");
  const scored = active
    .map((c) => {
      const wait = waitingMinutes(c);
      const risk = (c.sentiment === "negativo" ? 50 : 0) + Math.min(40, wait / 3) + c.unread * 5;
      return { c, wait, risk };
    })
    .sort((a, b) => b.risk - a.risk);
  const waitingCount = scored.filter((s) => s.wait > 0).length;
  const slaBreach = scored.filter((s) => s.wait > 2).length;
  const positive = db.conversations.filter((c) => c.sentiment === "positivo").length;
  const hot = db.contacts.filter((c) => c.score >= 75 && c.status === "lead").slice(0, 6);
  const atAgents = db.agents.filter((a) => ["Atendimento", "Suporte", "Customer Success", "Supervisor"].includes(a.role) && a.teamId === "t_at");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground"><Dot tone="success" pulse /> Ao vivo</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Radar</h1>
          <p className="text-sm text-muted-foreground">Onde a operação precisa de você agora: conversas esperando, sentimento negativo e leads quentes.</p>
        </div>
        <Button variant="outline" onClick={() => openHelena("Helena, quais conversas precisam de atenção agora?")}><Radar /> Pedir análise à Helena</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Conversas ativas" value={active.length} icon={<MessageCircle />} tone="info" />
        <StatCard label="Aguardando resposta" value={waitingCount} icon={<Clock />} tone="warning" />
        <StatCard label="Fora do SLA (2 min)" value={slaBreach} icon={<AlertTriangle />} tone="danger" />
        <StatCard label="Sentimento positivo" value={`${Math.round((positive / Math.max(1, db.conversations.length)) * 100)}%`} icon={<Smile />} tone="success" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Fila de prioridade" description="Ordenada por risco: sentimento, tempo de espera e mensagens não lidas." bodyClassName="p-0">
          <div className="divide-y">
            {scored.map(({ c, wait, risk }) => {
              const ct = db.contacts.find((x) => x.id === c.contactId);
              return (
                <div key={c.id} className="flex items-center gap-3 px-5 py-3">
                  <EntityAvatar name={ct?.name ?? "?"} color={colorFor(c.contactId)} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <span className="truncate">{ct?.name}</span>
                      {risk >= 50 && <StatusBadge tone="danger">Risco alto</StatusBadge>}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{c.messages.at(-1)?.text}</div>
                  </div>
                  <div className="hidden text-right text-xs sm:block">
                    <div className={wait > 2 ? "font-medium text-destructive" : "text-muted-foreground"}>{wait > 0 ? `esperando ${wait} min` : "respondida"}</div>
                    <div className="text-muted-foreground">{c.handlerType === "helena" ? "Helena" : ownerName(db, c.handlerId)}</div>
                  </div>
                  <Status value={c.status} />
                </div>
              );
            })}
            {scored.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">Nenhuma conversa ativa.</p>}
          </div>
          <div className="border-t px-5 py-3">
            <Button asChild size="sm" variant="outline"><Link to="/atendimento/inbox">Abrir Inbox</Link></Button>
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel title="Agentes de atendimento">
            <div className="space-y-3">
              {atAgents.map((a) => (
                <div key={a.id} className="flex items-center gap-3">
                  <EntityAvatar name={a.name} color={a.color} agent size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{a.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{a.currentTask || `${a.metrics.responseRate}% de resposta`}</div>
                  </div>
                  <Status value={a.status} />
                </div>
              ))}
            </div>
          </Panel>
          <Panel title={<span className="inline-flex items-center gap-1.5"><Flame className="size-4 text-warning" /> Leads quentes</span>}>
            <div className="space-y-2">
              {hot.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{c.name}</span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    {timeAgo(c.lastContactAt)}
                    <span className="rounded bg-warning/15 px-1.5 font-mono text-warning">{c.score}</span>
                  </span>
                </div>
              ))}
              {hot.length === 0 && <p className="text-sm text-muted-foreground">Nenhum lead acima de 75 pontos.</p>}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
