import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowRightLeft,
  Bot,
  CheckCheck,
  CreditCard,
  MessageCircle,
  MessageSquareQuote,
  Paperclip,
  Phone,
  QrCode,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
  User,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EntityAvatar, PageHeader, Status } from "@/components/app/kit";
import { useDB, currentUser } from "@/lib/store";
import { runTool } from "@/lib/helena/engine";
import { OBJECTION_MATRIX, evaluateBant } from "@/lib/helena/sales-brain";
import { pageHead } from "@/lib/head";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/atendimento/inbox")({
  head: () => pageHead("Inbox", "Caixa de entrada omnichannel unificada com inteligência de vendas e fechamento."),
  component: InboxPage,
});

function InboxPage() {
  const db = useDB();
  const user = currentUser(db);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(db.conversations[0]?.id ?? null);
  const [searchTerm, setSearchTerm] = useState("");
  const [messageDraft, setMessageDraft] = useState("");
  const [channelFilter, setChannelFilter] = useState<string>("todos");

  const conversations = db.conversations.filter((c) => {
    if (channelFilter !== "todos" && c.channel !== channelFilter) return false;
    if (!searchTerm.trim()) return true;
    const contact = db.contacts.find((ct) => ct.id === c.contactId);
    const searchTarget = `${contact?.name || ""} ${contact?.phone || ""} ${c.messages.map((m) => m.text).join(" ")}`.toLowerCase();
    return searchTarget.includes(searchTerm.toLowerCase());
  });

  const activeConv = db.conversations.find((c) => c.id === selectedConvId) || db.conversations[0];
  const activeContact = activeConv ? db.contacts.find((ct) => ct.id === activeConv.contactId) : undefined;
  const activeDeal = activeContact ? db.deals.find((d) => d.contactId === activeContact.id) : undefined;
  const bant = activeContact ? evaluateBant(activeContact, activeDeal) : null;

  const handleSendMessage = () => {
    if (!messageDraft.trim() || !activeConv) return;
    const res = runTool(
      "messages.send",
      {
        conversationId: activeConv.id,
        text: messageDraft,
        from: "human",
        authorName: user.name,
      },
      { actor: user.name, actorType: "user" }
    );

    if (res.ok) {
      setMessageDraft("");
    } else {
      toast.error(res.message);
    }
  };

  const handleApplyObjection = (objId: string) => {
    if (!activeContact) return;
    const res = runTool(
      "sales.handle_objection",
      { contactId: activeContact.id, objectionId: objId },
      { actor: "Helena AI", actorType: "helena" }
    );
    if (res.ok) {
      toast.success(res.message);
    } else {
      toast.error(res.message);
    }
  };

  const handleGeneratePix = () => {
    if (!activeContact) return;
    const res = runTool(
      "sales.generate_checkout_pix",
      { contactId: activeContact.id, dealId: activeDeal?.id, amount: activeDeal?.value || 4900 },
      { actor: "Helena Closer", actorType: "helena" }
    );
    if (res.ok) {
      toast.success(res.message);
    } else {
      toast.error(res.message);
    }
  };

  const handleHandoff = () => {
    if (!activeContact) return;
    const res = runTool(
      "sales.trigger_handoff",
      { contactId: activeContact.id, reason: "Transbordo solicitado pelo atendente humano" },
      { actor: user.name, actorType: "user" }
    );
    if (res.ok) {
      toast.success(res.message);
    } else {
      toast.error(res.message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inbox Omnichannel</h1>
          <p className="text-sm text-muted-foreground">Conversas ao vivo com WhatsApp, Instagram e motor autônomo de vendas.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1.5 py-1 text-xs">
            <span className="size-2 rounded-full bg-success animate-pulse" />
            Worker WhatsApp Socket Ativo (~68MB RAM)
          </Badge>
        </div>
      </div>

      <div className="grid h-[calc(100vh-210px)] min-h-[580px] grid-cols-12 overflow-hidden rounded-xl border bg-card">
        {/* Sidebar de conversas */}
        <div className="col-span-12 flex flex-col border-r md:col-span-4 lg:col-span-4">
          <div className="border-b p-3 space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                placeholder="Buscar conversa ou mensagem…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 text-xs h-9"
              />
            </div>
            <div className="flex gap-1 overflow-x-auto pb-1 text-xs">
              {["todos", "whatsapp", "instagram", "webchat"].map((ch) => (
                <button
                  key={ch}
                  onClick={() => setChannelFilter(ch)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-all ${
                    channelFilter === ch ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {ch}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y">
            {conversations.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">Nenhuma conversa encontrada.</div>
            ) : (
              conversations.map((c) => {
                const ct = db.contacts.find((x) => x.id === c.contactId);
                const lastMsg = c.messages[c.messages.length - 1];
                const isSelected = c.id === activeConv?.id;
                const isSemSite = ct?.tags.includes("#sem-site");

                return (
                  <div
                    key={c.id}
                    onClick={() => setSelectedConvId(c.id)}
                    className={`flex cursor-pointer items-start gap-3 p-3 transition-colors ${
                      isSelected ? "bg-muted/70 border-l-2 border-primary" : "hover:bg-muted/30"
                    }`}
                  >
                    <EntityAvatar name={ct?.name || "Contato"} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="truncate text-xs font-medium">{ct?.name || "Contato"}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {lastMsg ? new Date(lastMsg.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : ""}
                        </span>
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground mt-0.5">
                        {lastMsg ? lastMsg.text : "Nenhuma mensagem"}
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        {isSemSite && (
                          <Badge variant="destructive" className="h-4 px-1 text-[9px]">
                            #sem-site
                          </Badge>
                        )}
                        <Badge variant="outline" className="h-4 px-1 text-[9px] capitalize">
                          {c.channel}
                        </Badge>
                        {c.handlerType === "agent" ? (
                          <Badge variant="secondary" className="h-4 px-1 text-[9px] gap-1">
                            <Bot className="size-2.5" /> IA
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="h-4 px-1 text-[9px] gap-1">
                            <User className="size-2.5" /> Humano
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Área de Chat */}
        <div className="col-span-12 flex flex-col md:col-span-8 lg:col-span-8">
          {activeConv && activeContact ? (
            <>
              {/* Header do chat */}
              <div className="flex items-center justify-between border-b px-4 py-3 bg-muted/20">
                <div className="flex items-center gap-3">
                  <EntityAvatar name={activeContact.name} size="sm" />
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-semibold">{activeContact.name}</h2>
                      <span className="text-xs text-muted-foreground">{activeContact.phone}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span>{activeContact.title}</span>
                      <span>·</span>
                      <span>BANT Score: <strong className={bant?.isQualified ? "text-success" : ""}>{bant?.totalScore}/100</strong></span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8">
                        <Sparkles className="size-3.5 text-helena" /> Contornar Objeção
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-72">
                      <DropdownMenuLabel>Matriz de Objeções (Sales Brain)</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {OBJECTION_MATRIX.map((obj) => (
                        <DropdownMenuItem
                          key={obj.id}
                          onClick={() => handleApplyObjection(obj.id)}
                          className="flex flex-col items-start gap-0.5 py-2 cursor-pointer"
                        >
                          <span className="font-medium text-xs">{obj.title}</span>
                          <span className="text-[10px] text-muted-foreground">{obj.actionDescription}</span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <Button size="sm" variant="default" onClick={handleGeneratePix} className="gap-1.5 text-xs h-8 bg-success hover:bg-success/90">
                    <QrCode className="size-3.5" /> Gerar Pix
                  </Button>

                  <Button size="sm" variant="outline" onClick={handleHandoff} className="gap-1.5 text-xs h-8">
                    <ArrowRightLeft className="size-3.5" /> Handoff
                  </Button>
                </div>
              </div>

              {/* Thread de mensagens */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-muted/5">
                {activeConv.messages.map((m) => {
                  const isContact = m.from === "contact";
                  const isEvent = m.kind === "event";

                  if (isEvent) {
                    return (
                      <div key={m.id} className="text-center my-2">
                        <span className="rounded-full bg-muted px-3 py-1 text-[11px] font-mono text-muted-foreground">
                          {m.text}
                        </span>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col ${isContact ? "items-start" : "items-end"}`}
                    >
                      <div className="flex items-center gap-1.5 mb-1 px-1">
                        <span className="text-[10px] text-muted-foreground font-medium">{m.authorName}</span>
                        <span className="font-mono text-[9px] text-muted-foreground">
                          {new Date(m.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <div
                        className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap shadow-sm ${
                          isContact
                            ? "bg-card border text-card-foreground rounded-tl-sm"
                            : "bg-primary text-primary-foreground rounded-tr-sm"
                        }`}
                      >
                        {m.text}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Caixa de envio com atalhos */}
              <div className="border-t p-3 bg-card space-y-2">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground border rounded px-2 py-0.5">
                        <MessageSquareQuote className="size-3" /> Respostas Rápidas
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-80">
                      <DropdownMenuLabel>Respostas Rápidas Salvas</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {db.quickReplies.map((qr) => (
                        <DropdownMenuItem
                          key={qr.id}
                          onClick={() => setMessageDraft(qr.text)}
                          className="flex flex-col items-start gap-0.5 cursor-pointer"
                        >
                          <span className="font-medium text-xs">{qr.title} ({qr.shortcut})</span>
                          <span className="text-[10px] text-muted-foreground truncate w-full">{qr.text}</span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {OBJECTION_MATRIX.slice(0, 3).map((obj) => (
                    <button
                      key={obj.id}
                      onClick={() => handleApplyObjection(obj.id)}
                      className="text-[10px] text-muted-foreground hover:text-primary bg-muted/60 hover:bg-muted rounded px-2 py-0.5 whitespace-nowrap"
                    >
                      ⚡ {obj.title}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Digite uma mensagem ou selecione uma resposta..."
                    value={messageDraft}
                    onChange={(e) => setMessageDraft(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSendMessage())}
                    className="text-xs h-10"
                  />
                  <Button onClick={handleSendMessage} className="gap-1.5 px-4 h-10">
                    <Send className="size-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              Selecione uma conversa para começar o atendimento.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
