import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Bot, CheckCheck, Hand, Inbox, Search, Send, Sparkles, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, EntityAvatar, StatusBadge, Status, colorFor } from "@/components/app/kit";
import { currentUser, nowISO, ownerName, update, useDB } from "@/lib/store";
import { userAction } from "@/lib/helena/engine";
import { openHelena } from "@/lib/helena/orchestrator";
import { hydrateConversationFromEvolution } from "@/lib/evolution/inboxPoller";
import { getEvolutionConfigUI } from "@/lib/evolution/evolutionapi";
import { linkifyParts, sanitizeChatText } from "@/lib/helena/whatsapp-formatter";
import { fmtTime, timeAgo } from "@/lib/format";
import { pageHead } from "@/lib/head";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Channel, Conversation } from "@/lib/types";

export const Route = createFileRoute("/_app/atendimento/inbox")({
  head: () => pageHead("Inbox", "Conversas de WhatsApp, Instagram, e-mail e webchat em um só lugar."),
  component: InboxPage,
});

export const CHANNEL_LABEL: Record<Channel, string> = {
  whatsapp: "WhatsApp", instagram: "Instagram", messenger: "Messenger", email: "E-mail", webchat: "Webchat",
};

function InboxPage() {
  const db = useDB();
  const me = currentUser(db);
  const [status, setStatus] = useState<"all" | Conversation["status"]>("all");
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [evoLabel, setEvoLabel] = useState("Evolution");
  const endRef = useRef<HTMLDivElement>(null);

  const list = useMemo(
    () =>
      [...db.conversations]
        .filter((c) => status === "all" || c.status === status)
        .filter((c) => {
          if (!q.trim()) return true;
          const ct = db.contacts.find((x) => x.id === c.contactId);
          return `${ct?.name ?? ""} ${c.messages.at(-1)?.text ?? ""}`.toLowerCase().includes(q.toLowerCase());
        })
        .sort((a, b) => +new Date(b.lastMessageAt) - +new Date(a.lastMessageAt)),
    [db.conversations, db.contacts, status, q],
  );
  const conv = db.conversations.find((c) => c.id === (selectedId ?? list[0]?.id));
  const contact = conv && db.contacts.find((c) => c.id === conv.contactId);
  const company = contact?.companyId ? db.companies.find((c) => c.id === contact.companyId) : undefined;
  const deals = contact ? db.deals.filter((d) => d.contactId === contact.id) : [];

  useEffect(() => {
    const cfg = getEvolutionConfigUI();
    setEvoLabel(`Evolution · ${cfg.instance}`);
    update((d) => {
      for (const c of d.conversations) {
        for (const m of c.messages) m.text = sanitizeChatText(m.text);
      }
    });
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [conv?.id, conv?.messages.length]);

  useEffect(() => {
    if (!conv?.id || !conv.remoteJid) return;
    void hydrateConversationFromEvolution(conv.id);
  }, [conv?.id, conv?.remoteJid]);

  useEffect(() => {
    if (conv && conv.unread > 0) update((d) => { const c = d.conversations.find((x) => x.id === conv.id); if (c) c.unread = 0; });
  }, [conv?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const quickMatches = text.startsWith("/") ? db.quickReplies.filter((r) => r.shortcut.startsWith(text.split(" ")[0])) : [];

  const send = (e?: FormEvent) => {
    e?.preventDefault();
    if (!conv || !text.trim()) return;
    const r = userAction("messages.send", { conversationId: conv.id, text: text.trim() });
    if (r.ok) setText("");
    else toast.error(`Não enviado: ${r.message}`);
  };

  const setConv = (patch: Partial<Conversation>, msg: string) => {
    if (!conv) return;
    update((d) => {
      const c = d.conversations.find((x) => x.id === conv.id)!;
      Object.assign(c, patch);
      c.messages.push({ id: `ev_${Date.now()}`, from: "system", authorName: "Sistema", text: msg, at: nowISO(), kind: "event" });
    });
    toast.success(msg);
  };

  return (
    <div className="flex h-[calc(100dvh-8.5rem)] min-h-[24rem] overflow-hidden rounded-xl border bg-card sm:min-h-[520px]">
      {/* List */}
      <div className={cn("flex w-full flex-col border-r md:w-80", conv && "hidden md:flex")}>
        <div className="space-y-2 border-b p-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar conversas..." className="h-8 pl-8" />
          </div>
          <Tabs value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <TabsList className="h-8 w-full overflow-x-auto">
              <TabsTrigger value="all" className="text-xs">Todas</TabsTrigger>
              <TabsTrigger value="aberta" className="text-xs">Abertas</TabsTrigger>
              <TabsTrigger value="pendente" className="text-xs">Pendentes</TabsTrigger>
              <TabsTrigger value="resolvida" className="text-xs">Resolvidas</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="text-[10px] text-muted-foreground">
            {evoLabel} · {list.length} conversas · {db.contacts.filter((c) => c.tags.includes("evolution") || c.source === "WhatsApp" || c.source === "Prospecção").length} contatos
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {list.map((c) => {
            const ct = db.contacts.find((x) => x.id === c.contactId);
            const last = c.messages.at(-1);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedId(c.id)}
                className={cn("flex w-full gap-3 border-b px-3 py-3 text-left transition-colors hover:bg-muted/50", conv?.id === c.id && "bg-muted")}
              >
                <EntityAvatar name={ct?.name ?? "?"} color={colorFor(c.contactId)} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{ct?.name ?? "Contato"}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{fmtTime(c.lastMessageAt)}</span>
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{sanitizeChatText(last?.text ?? "")}</div>
                  <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span>{CHANNEL_LABEL[c.channel]}</span>·
                    <span className="inline-flex items-center gap-0.5">
                      {c.handlerType === "human" ? <UserRound className="size-3" /> : <Bot className="size-3" />}
                      {c.handlerType === "helena" ? "Helena" : ownerName(db, c.handlerId)}
                    </span>
                    {c.unread > 0 && <span className="ml-auto rounded-full bg-helena px-1.5 font-mono text-[10px] text-helena-foreground">{c.unread}</span>}
                  </div>
                </div>
              </button>
            );
          })}
          {list.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">Nenhuma conversa.</p>}
        </div>
      </div>

      {/* Thread */}
      {conv && contact ? (
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
            <div className="flex items-center gap-3">
              <Button size="sm" variant="ghost" className="md:hidden" onClick={() => setSelectedId(null)}>←</Button>
              <div>
                <div className="text-sm font-semibold">{contact.name}</div>
                <div className="text-xs text-muted-foreground">{CHANNEL_LABEL[conv.channel]} · {contact.phone || contact.email}</div>
              </div>
              <Status value={conv.status} />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {conv.handlerType !== "human" ? (
                <Button size="sm" variant="outline" onClick={() => setConv({ handlerType: "human", handlerId: me.id }, `${me.name} assumiu a conversa`)}>
                  <Hand /> Assumir
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setConv({ handlerType: "agent", handlerId: "a_at" }, "Conversa devolvida ao agente Atendimento Geral")}>
                  <Bot /> Devolver ao agente
                </Button>
              )}
              {conv.status !== "resolvida" && (
                <Button size="sm" variant="outline" onClick={() => setConv({ status: "resolvida" }, "Conversa marcada como resolvida")}>
                  <CheckCheck /> Resolver
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => openHelena(`Helena, resuma a conversa com ${contact.name} e sugira a próxima ação.`)}>
                <Sparkles /> Helena
              </Button>
            </div>
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-muted/20 px-4 py-4">
            {conv.messages.map((m) =>
              m.kind === "event" || m.from === "system" ? (
                <div key={m.id} className="text-center text-[11px] text-muted-foreground">— {m.text} · {fmtTime(m.at)} —</div>
              ) : (
                <div key={m.id} className={cn("flex", m.from === "contact" ? "justify-start" : "justify-end")}>
                  <div
                    className={cn(
                      "max-w-[78%] rounded-2xl px-3.5 py-2 text-sm",
                      m.from === "contact" ? "rounded-bl-md border bg-card" : m.from === "human" ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-br-md border border-helena/25 bg-helena/10",
                    )}
                  >
                    {m.from !== "contact" && <div className="mb-0.5 text-[10px] font-semibold opacity-70">{m.authorName}</div>}
                    {(m.kind === "audio" || m.text.startsWith("[Áudio]")) && (
                      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide opacity-70">Áudio transcrito</div>
                    )}
                    <div className="whitespace-pre-line break-words">
                      {linkifyParts(m.text.replace(/^\[Áudio\]\s*/i, "")).map((p, i) =>
                        p.type === "link" ? (
                          <a
                            key={`${m.id}-l-${i}`}
                            href={p.value}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium text-helena underline underline-offset-2 break-all"
                          >
                            {p.value}
                          </a>
                        ) : (
                          <span key={`${m.id}-t-${i}`}>{p.value}</span>
                        ),
                      )}
                    </div>
                    <div className="mt-0.5 text-right text-[10px] opacity-60">{fmtTime(m.at)}</div>
                  </div>
                </div>
              ),
            )}
            <div ref={endRef} />
          </div>
          <form onSubmit={send} className="relative border-t p-3">
            {quickMatches.length > 0 && (
              <div className="absolute bottom-full left-3 right-3 mb-1 overflow-hidden rounded-lg border bg-popover shadow-md">
                {quickMatches.map((r) => (
                  <button key={r.id} type="button" onClick={() => setText(r.text)} className="block w-full px-3 py-2 text-left text-sm hover:bg-muted">
                    <span className="font-mono text-xs text-helena">{r.shortcut}</span> <span className="font-medium">{r.title}</span>
                    <div className="truncate text-xs text-muted-foreground">{r.text}</div>
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Escreva uma mensagem ou digite / para respostas rápidas" />
              <Button type="submit" disabled={!text.trim()}><Send /> Enviar</Button>
            </div>
          </form>
        </div>
      ) : (
        <div className="hidden flex-1 items-center justify-center md:flex">
          <EmptyState icon={<Inbox />} title="Selecione uma conversa" />
        </div>
      )}

      {/* Contact side */}
      {conv && contact && (
        <aside className="hidden w-72 shrink-0 space-y-5 overflow-y-auto border-l p-4 xl:block">
          <div className="flex flex-col items-center text-center">
            <EntityAvatar name={contact.name} color={colorFor(contact.id)} size="lg" />
            <div className="mt-2 font-semibold">{contact.name}</div>
            <div className="text-xs text-muted-foreground">{contact.title}{company && ` · ${company.name}`}</div>
            <div className="mt-2 flex flex-wrap justify-center gap-1">
              <Status value={contact.status} />
              <StatusBadge tone={conv.sentiment === "positivo" ? "success" : conv.sentiment === "negativo" ? "danger" : "neutral"}>
                Sentimento {conv.sentiment}
              </StatusBadge>
            </div>
          </div>
          <dl className="space-y-2 text-xs">
            {[["E-mail", contact.email], ["Telefone", contact.phone], ["Origem", contact.source], ["Score", String(contact.score)], ["Último contato", timeAgo(contact.lastContactAt)]].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2"><dt className="text-muted-foreground">{k}</dt><dd className="truncate text-right">{v || "—"}</dd></div>
            ))}
          </dl>
          {contact.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">{contact.tags.map((t) => <span key={t} className="rounded bg-muted px-1.5 py-0.5 text-[10px]">#{t}</span>)}</div>
          )}
          <div>
            <div className="mb-2 text-xs font-semibold">Oportunidades</div>
            {deals.length ? deals.map((d) => (
              <div key={d.id} className="mb-1.5 rounded-lg border p-2 text-xs">
                <div className="font-medium">{d.title}</div>
                <div className="mt-0.5 flex justify-between text-muted-foreground"><span>{d.value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span><Status value={d.status} /></div>
              </div>
            )) : <p className="text-xs text-muted-foreground">Nenhuma oportunidade.</p>}
          </div>
          <Button asChild size="sm" variant="outline" className="w-full">
            <Link to="/crm/contatos">Abrir no CRM</Link>
          </Button>
        </aside>
      )}
    </div>
  );
}
