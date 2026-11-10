import { createFileRoute, redirect } from "@tanstack/react-router";
import {
  Check, ExternalLink, Globe, MessageSquare, Search, Send, ShieldCheck, ThumbsDown, Upload, X,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { PageHeader, StatCard } from "@/components/app/kit";
import { SitePreviewView } from "@/components/dev/SitePreviewView";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { previewUrl, reviewSitePreview, sendApprovedPreviews } from "@/lib/dev/presence";
import { publishSitePreviews, stashPreviewHandoff } from "@/lib/dev/previewPublish";
import { pageHead } from "@/lib/head";
import { helenaUi, sendToHelena } from "@/lib/helena/orchestrator";
import { currentUser, getDB, useDB } from "@/lib/store";
import { isPlatformAdmin } from "@/lib/saas";
import type { SitePreview } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/ia/previews")({
  ssr: false,
  beforeLoad: () => {
    if (!isPlatformAdmin(currentUser(getDB()))) throw redirect({ to: "/visao-geral" });
  },
  head: () =>
    pageHead(
      "Revisão de sites · Admin",
      "Só o admin vê, revisa e aprova sites/cardápios dos clientes antes do envio no WhatsApp.",
    ),
  component: PreviewsPage,
});

async function ensurePublished(preview: SitePreview) {
  stashPreviewHandoff(preview);
  const result = await publishSitePreviews([preview]);
  try {
    await fetch("/api/previews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preview }),
    });
  } catch {
    /* rede */
  }
  return result[preview.slug];
}

const STATUS_LABEL: Record<SitePreview["status"], string> = {
  pronta: "Aguardando revisão",
  aprovada: "Aprovada · pronta p/ envio",
  rejeitada: "Rejeitada · refazer",
  enviada: "Enviada no WhatsApp",
  aprovada_cliente: "Cliente gostou",
};

const DEV_CHAT_SUGGESTIONS = [
  "Sofia, deixa o cardápio mais premium — tipografia e fotos de restaurante fino.",
  "Caio, regenera prévia de 5 barbearias sem site em Bauru.",
  "Time Dev + Designer: quero sites que impressionem o dono na primeira tela.",
  "Diego, prioriza layout de delivery com sacola tipo iFood, mas mais elegante.",
  "Helena, lista as prévias que ainda não aprovei.",
];

function DevStudioChat() {
  const db = useDB();
  const ui = helenaUi.use();
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const busy = ui.state === "pensando" || ui.state === "planejando";
  const messages = db.helenaMessages.slice(-24);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, busy]);

  const submit = (e?: FormEvent, text?: string) => {
    e?.preventDefault();
    const raw = (text ?? draft).trim();
    if (!raw || busy) return;
    setDraft("");
    const prefixed = /^(sofia|caio|diego|time\s*dev|helena|designer)/i.test(raw)
      ? raw
      : `Time Dev + Sofia Designer: ${raw}`;
    void sendToHelena(prefixed);
  };

  return (
    <div className="flex h-full min-h-[28rem] flex-col overflow-hidden rounded-2xl border bg-card">
      <div className="border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="size-4 text-helena" />
          <div>
            <p className="text-sm font-semibold">Studio · Time Dev + Designer</p>
            <p className="text-[11px] text-muted-foreground">
              Prompt direto pra Sofia, Caio e Diego. Peça layout, regeneração ou ajuste visual.
            </p>
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ex.: “Sofia, deixa o hero da clínica mais limpo e confiável.”
          </p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                "max-w-[92%] rounded-2xl px-3 py-2 text-sm leading-relaxed",
                m.role === "user" ? "ml-auto bg-primary text-primary-foreground" : "bg-muted/70",
              )}
            >
              <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wider opacity-60">
                {m.role === "user" ? "Você" : "Helena / Time Dev"}
              </p>
              {m.text}
            </div>
          ))
        )}
        {busy && <p className="text-xs text-muted-foreground">Time pensando…</p>}
        <div ref={endRef} />
      </div>
      <div className="space-y-2 border-t p-3">
        <div className="flex flex-wrap gap-1.5">
          {DEV_CHAT_SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              className="rounded-full border px-2.5 py-1 text-[10px] text-muted-foreground hover:bg-muted"
              onClick={() => void submit(undefined, s)}
            >
              {s.slice(0, 42)}…
            </button>
          ))}
        </div>
        <form className="flex gap-2" onSubmit={(e) => submit(e)}>
          <Textarea
            rows={5}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ex.: Sofia, deixa o cardápio com cara de app premium…"
            className="min-h-[7.5rem] resize-y text-[15px] leading-relaxed"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
          />
          <Button type="submit" size="icon" disabled={busy || !draft.trim()} className="shrink-0 self-end">
            <Send className="size-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}

function PreviewsPage() {
  const db = useDB();
  const user = currentUser(db);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"todas" | "pronta" | "aprovada" | "rejeitada" | "enviada">("todas");
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [inline, setInline] = useState<SitePreview | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  const list = (db.sitePreviews ?? [])
    .filter((p) => `${p.name} ${p.segment} ${p.city}`.toLowerCase().includes(q.toLowerCase()))
    .filter((p) => (filter === "todas" ? true : p.status === filter));

  const pending = (db.sitePreviews ?? []).filter((p) => p.status === "pronta").length;
  const approved = (db.sitePreviews ?? []).filter((p) => p.status === "aprovada").length;
  const withMenu = list.filter((p) => p.menu?.length).length;

  const openPreview = async (p: SitePreview) => {
    setBusySlug(p.slug);
    try {
      await ensurePublished(p);
      window.open(p.vercelUrl || previewUrl(p.slug), "_blank");
    } finally {
      setBusySlug(null);
    }
  };

  const approve = (p: SitePreview) => {
    const ok = reviewSitePreview(p.id, "aprovada", { reviewer: user.name });
    ok ? toast.success(`Aprovado: ${p.name}`) : toast.error("Não deu pra aprovar");
  };

  const reject = () => {
    if (!rejectId) return;
    const ok = reviewSitePreview(rejectId, "rejeitada", {
      reviewer: user.name,
      note: rejectNote.trim() || "Refazer layout — não está no nível de venda.",
    });
    if (ok) {
      toast.success("Rejeitado — peça ajuste no Studio ao lado");
      void sendToHelena(
        `Sofia + Time Dev: o admin rejeitou a prévia ${rejectId}. ${rejectNote || "Deixar altamente profissional pra vender."} Refaçam o layout.`,
      );
    }
    setRejectId(null);
    setRejectNote("");
  };

  const sendApproved = async (ids?: string[]) => {
    setBusySlug(ids?.[0] ?? "*send*");
    try {
      const res = await sendApprovedPreviews(ids);
      res.sent > 0 ? toast.success(res.message) : toast.message(res.message);
    } catch {
      toast.error("Falha no envio WhatsApp");
    } finally {
      setBusySlug(null);
    }
  };

  const publishAll = async () => {
    setBusySlug("*");
    try {
      await publishSitePreviews(list.slice(0, 50));
      await fetch("/api/previews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ previews: list.slice(0, 50) }),
      });
      toast.success(`${Math.min(list.length, 50)} prévias no /v/…`);
    } catch {
      toast.error("Falha ao publicar");
    } finally {
      setBusySlug(null);
    }
  };

  if (inline) {
    return (
      <div className="fixed inset-0 z-50 overflow-auto bg-background">
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b bg-background/95 px-4 py-3 backdrop-blur">
          <div>
            <p className="text-xs text-muted-foreground">Revisão admin · {inline.slug}</p>
            <p className="font-medium">{inline.name}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {inline.status === "pronta" || inline.status === "rejeitada" ? (
              <>
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500" onClick={() => { approve(inline); setInline({ ...inline, status: "aprovada" }); }}>
                  <Check className="size-3.5" /> Aprovar
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setRejectId(inline.id)}>
                  <ThumbsDown className="size-3.5" /> Rejeitar
                </Button>
              </>
            ) : null}
            {inline.status === "aprovada" && (
              <Button size="sm" onClick={() => void sendApproved([inline.id])}>
                <Send className="size-3.5" /> Enviar WhatsApp
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => void openPreview(inline)}>
              Link público <ExternalLink className="size-3.5" />
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setInline(null)}>Fechar</Button>
          </div>
        </div>
        <SitePreviewView preview={inline} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin · revisão"
        title="Sites & cardápios dos clientes"
        description="Só você (admin) vê as prévias sem site. Aprove o que está no nível de venda — só então o WhatsApp dispara. Use o Studio pra pedir ajuste ao Time Dev e à Sofia."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Aguardando você" value={pending} icon={<ShieldCheck />} tone="helena" />
        <StatCard label="Aprovadas" value={approved} icon={<Check />} tone="success" />
        <StatCard label="Na lista" value={list.length} icon={<Globe />} tone="info" />
        <StatCard label="Com cardápio" value={withMenu} icon={<Globe />} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[12rem] flex-1">
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar cliente / nicho…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            {(["todas", "pronta", "aprovada", "rejeitada", "enviada"] as const).map((f) => (
              <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
                {f === "todas" ? "Todas" : STATUS_LABEL[f].split(" · ")[0]}
              </Button>
            ))}
            {list.length > 0 && (
              <Button size="sm" variant="outline" disabled={busySlug === "*"} onClick={() => void publishAll()}>
                <Upload className="size-3.5" /> Publicar /v/
              </Button>
            )}
            {approved > 0 && (
              <Button size="sm" disabled={busySlug === "*send*"} onClick={() => void sendApproved()}>
                <Send className="size-3.5" /> Enviar aprovadas ({approved})
              </Button>
            )}
          </div>

          {list.length === 0 ? (
            <p className="rounded-2xl border border-dashed p-8 text-sm text-muted-foreground">
              Nenhuma prévia aqui. No Studio: peça ao Time Dev montar sites/cardápios — eles entram como “Aguardando revisão”.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {list.map((p) => (
                <div key={p.id} className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold tracking-tight">{p.name}</h3>
                      <p className="text-xs text-muted-foreground">{p.segment} · {p.city}</p>
                    </div>
                    <Badge variant={p.status === "aprovada" ? "default" : "outline"}>
                      {STATUS_LABEL[p.status]}
                    </Badge>
                  </div>
                  <p className="line-clamp-2 text-sm text-muted-foreground">{p.tagline}</p>
                  <p className="break-all font-mono text-[11px] text-muted-foreground">
                    {p.vercelUrl || previewUrl(p.slug)}
                  </p>
                  {p.reviewNote && <p className="text-xs text-amber-700 dark:text-amber-400">Nota: {p.reviewNote}</p>}
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => setInline(p)}>Revisar aqui</Button>
                    <Button size="sm" variant="secondary" disabled={busySlug === p.slug} onClick={() => void openPreview(p)}>
                      {busySlug === p.slug ? "…" : "Abrir"} <ExternalLink className="size-3.5" />
                    </Button>
                    {(p.status === "pronta" || p.status === "rejeitada") && (
                      <>
                        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500" onClick={() => approve(p)}>
                          <Check className="size-3.5" /> Aprovar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => { setRejectId(p.id); setRejectNote(""); }}>
                          <ThumbsDown className="size-3.5" /> Rejeitar
                        </Button>
                      </>
                    )}
                    {p.status === "aprovada" && (
                      <Button size="sm" onClick={() => void sendApproved([p.id])}>
                        <Send className="size-3.5" /> Enviar
                      </Button>
                    )}
                    {p.status === "aprovada" || p.status === "enviada" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          await ensurePublished(p);
                          await navigator.clipboard.writeText(p.vercelUrl || previewUrl(p.slug));
                          toast.success("Link copiado");
                        }}
                      >
                        Copiar link
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <DevStudioChat />
      </div>

      {rejectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setRejectId(null)}>
          <div className="w-full max-w-md space-y-3 rounded-2xl border bg-background p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Rejeitar layout</h3>
              <button type="button" onClick={() => setRejectId(null)}><X className="size-4" /></button>
            </div>
            <p className="text-sm text-muted-foreground">Diz o que Sofia/Dev devem melhorar. Isso já vai pro Studio.</p>
            <Textarea
              rows={4}
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="Ex.: Hero genérico, tipografia fraca, CTA escondido…"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRejectId(null)}>Cancelar</Button>
              <Button variant="destructive" onClick={reject}>Rejeitar e pedir refação</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
