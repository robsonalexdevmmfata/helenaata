import { useEffect, useRef, type FormEvent } from "react";
import { ArrowUp, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDB } from "@/lib/store";
import { HELENA_STATE_LABEL, helenaUi, sendToHelena } from "@/lib/helena/orchestrator";
import { fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { HelenaCardView, ThinkingIndicator } from "./HelenaCards";
import { HelenaOrb } from "./HelenaOrb";

export const HELENA_SUGGESTIONS = [
  "Boa noite Helena. Ative o time comercial e comece a prospectar clientes para a agência.",
  "Como está o comercial?",
  "Quem precisa de follow-up hoje?",
  "Mostre os leads quentes.",
  "Crie um SDR especializado em vender criação de sites para clínicas.",
  "Pause o SDR 02.",
];

export function HelenaChat({ variant = "panel" }: { variant?: "panel" | "page" }) {
  const db = useDB();
  const ui = helenaUi.use();
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messages = db.helenaMessages;
  const busy = ui.state === "pensando" || ui.state === "planejando";

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, busy]);

  useEffect(() => {
    if (ui.draft) inputRef.current?.focus();
  }, [ui.draft]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    void sendToHelena(ui.draft);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={cn("min-h-0 flex-1 overflow-y-auto", variant === "panel" ? "px-5 py-4" : "px-1 py-2")}>
        {messages.length === 0 ? (
          <div className="flex h-full flex-col justify-center py-8">
            <HelenaOrb className="mb-5 size-10" state={ui.state} />
            <p className="font-serif text-3xl leading-tight">Como posso ajudar na operação?</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Eu consulto o CRM, coordeno os agentes e peço sua autorização antes de qualquer ação de risco.
            </p>
            <div className="mt-6 space-y-1.5">
              {HELENA_SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => void sendToHelena(s)} className="block w-full rounded-lg border bg-card px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:border-helena/40 hover:text-foreground">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-sm text-primary-foreground">{m.text}</div>
                </div>
              ) : (
                <div key={m.id} className="flex gap-2.5">
                  <HelenaOrb className="mt-0.5 size-5" state="ocioso" />
                  <div className="min-w-0 flex-1">
                    <div className="mb-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="font-semibold tracking-wider text-foreground">HELENA</span>
                      <span>{fmtTime(m.at)}</span>
                    </div>
                    <div className="whitespace-pre-line text-sm leading-relaxed">{m.text}</div>
                    {m.card && <HelenaCardView card={m.card} messageId={m.id} />}
                  </div>
                </div>
              ),
            )}
            {busy && (
              <div className="flex gap-2.5">
                <HelenaOrb className="mt-0.5 size-5" state={ui.state} />
                <ThinkingIndicator label={HELENA_STATE_LABEL[ui.state]} />
              </div>
            )}
            <div ref={endRef} />
          </div>
        )}
      </div>

      <form onSubmit={submit} className={cn("border-t bg-card", variant === "panel" ? "p-3" : "rounded-xl border p-2")}>
        <div className="flex items-end gap-2 rounded-lg border bg-background px-3 py-2 focus-within:border-helena/50">
          <textarea
            ref={inputRef}
            rows={1}
            value={ui.draft}
            onChange={(e) => helenaUi.set({ draft: e.target.value, state: ui.state === "ocioso" ? "ouvindo" : ui.state })}
            onBlur={() => ui.state === "ouvindo" && helenaUi.set({ state: "ocioso" })}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Fale com Helena..."
            className="max-h-32 min-h-6 flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" size="icon" variant="ghost" className="size-7 text-muted-foreground" aria-label="Voz (em breve)">
                <Mic />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Comando de voz em breve</TooltipContent>
          </Tooltip>
          <Button type="submit" size="icon" className="size-7 rounded-md" disabled={!ui.draft.trim() || busy} aria-label="Enviar">
            <ArrowUp />
          </Button>
        </div>
        <div className="mt-1.5 flex justify-between px-1 text-[10px] text-muted-foreground">
          <span>Ações de risco alto sempre pedem sua aprovação.</span>
          <span className="font-mono">Enter ↵</span>
        </div>
      </form>
    </div>
  );
}
