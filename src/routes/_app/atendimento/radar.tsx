import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { AlertCircle, ArrowUpRight, Clock, Flame, MessageCircle, Radar as RadarIcon, ShieldAlert, Sparkles, TrendingUp, Users } from "lucide-react";
import { Dot, EntityAvatar, PageHeader, Panel, StatCard, Status } from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useDB } from "@/lib/store";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/_app/atendimento/radar")({
  head: () => pageHead("Radar de Atendimento", "Monitoramento preditivo de conversas críticas, tempo de espera e SLA."),
  component: RadarAtendimentoPage,
});

function RadarAtendimentoPage() {
  const db = useDB();
  const router = useRouter();

  const openConversations = db.conversations.filter((c) => c.status === "aberta");
  const urgentCount = openConversations.filter((c) => c.sentiment === "negativo" || c.unread > 0).length;
  const botManaged = openConversations.filter((c) => c.handlerType === "agent").length;
  const humanManaged = openConversations.filter((c) => c.handlerType === "human").length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Monitoramento em Tempo Real"
        title="Radar de Atendimento"
        description="Identificação preditiva de conversas com alta intenção de compra, risco de abandono ou violação de SLA."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Conversas no Radar" value={openConversations.length} hint="Monitoradas ativamente" icon={<RadarIcon />} tone="info" />
        <StatCard label="Atenção Imediata" value={urgentCount} hint="Risco ou não lidas" icon={<AlertCircle />} tone="warning" />
        <StatCard label="Atendidas por IA" value={botManaged} hint="SDRs & Atendimento" icon={<Sparkles />} tone="helena" />
        <StatCard label="Atendidas por Humanos" value={humanManaged} hint="Especialistas e Closer" icon={<Users />} tone="success" />
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <Panel title="Feed do Radar · Conversas em Alerta">
            <div className="space-y-3">
              {openConversations.map((c) => {
                const ct = db.contacts.find((x) => x.id === c.contactId);
                const lastMsg = c.messages[c.messages.length - 1];
                const isUrgent = c.sentiment === "negativo" || c.unread > 0;

                return (
                  <div
                    key={c.id}
                    className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-lg border bg-card p-4 transition-all hover:border-foreground/20"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <EntityAvatar name={ct?.name || "Contato"} size="sm" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{ct?.name}</span>
                          <span className="text-xs text-muted-foreground">{ct?.phone}</span>
                          {isUrgent && (
                            <Badge variant="destructive" className="h-4 px-1.5 text-[9px]">
                              Urgente
                            </Badge>
                          )}
                        </div>
                        <p className="truncate text-xs text-muted-foreground mt-0.5 max-w-md">
                          "{lastMsg?.text || "Sem mensagens"}"
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right text-xs">
                        <div className="font-medium capitalize">{c.channel}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">
                          {new Date(c.lastMessageAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => router.history.push("/atendimento/inbox")}
                        className="gap-1.5 text-xs h-8"
                      >
                        Ver no Inbox <ArrowUpRight className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>

        <div className="lg:col-span-4 space-y-6">
          <Panel title="Indicadores de Qualidade">
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Tempo Médio de 1ª Resposta</span>
                  <span className="font-semibold text-success">18 segundos</span>
                </div>
                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-success w-[92%]" />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Índice de Resolução no 1º Contato</span>
                  <span className="font-semibold text-primary">84%</span>
                </div>
                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary w-[84%]" />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Satisfação dos Leads (CSAT)</span>
                  <span className="font-semibold text-helena">4.8 / 5.0</span>
                </div>
                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-helena w-[96%]" />
                </div>
              </div>
            </div>
          </Panel>

          <Panel title="Travas de Atendimento Ativas">
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2 p-2 rounded border bg-muted/20">
                <Dot tone="success" />
                <span>Trava 1: Anti-duplicidade de telefones ativa</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded border bg-muted/20">
                <Dot tone="success" />
                <span>Trava 2: Deduplicação de fila imutável</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded border bg-muted/20">
                <Dot tone="success" />
                <span>Trava 3: Handoff lock entre SDRs ativo</span>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
