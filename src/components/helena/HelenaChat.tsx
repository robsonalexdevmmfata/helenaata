import { useEffect, useRef, type FormEvent } from "react";
import { ArrowUp, Mic, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDB } from "@/lib/store";
import { HELENA_STATE_LABEL, helenaUi, sendToHelena } from "@/lib/helena/orchestrator";
import { useHelenaVoice } from "@/hooks/useHelenaVoice";
import { fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { HelenaCardView, ThinkingIndicator } from "./HelenaCards";
import { HelenaOrb } from "./HelenaOrb";

export const HELENA_SUGGESTIONS = [
  "Boa noite Helena. Preciso que você ative o time comercial e comece a prospectar clientes para a agência Info Tech Ltda.",
  "Helena, varra o Google Maps e busque 10 clínicas sem site em São Paulo.",
  "Agende uma reunião no Google Calendar com o cliente.",
  "Como está o comercial?",
  "Quem precisa de follow-up hoje?",
  "Mostre os leads quentes.",
];

export function HelenaChat({ variant = "panel" }: { variant?: "panel" | "page" }) {
  const db = useDB();
  const ui = helenaUi.use();
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastSpokenRef = useRef<string | null>(null);
  const messages = db.helenaMessages;
  const busy = ui.state === "pensando" || ui.state === "planejando";

  const voice = useHelenaVoice({
    onTranscript: (transcript) => {
      helenaUi.set({ draft: transcript });
      void sendToHelena(transcript);
    },
    onListeningChange: (listening) => {
      if (listening) {
        helenaUi.set({ state: "ouvindo" });
      } else if (ui.state === "ouvindo") {
        helenaUi.set({ state: "ocioso" });
      }
    },
  });

  // Automatically speak Helena's responses in female Brazilian voice
  useEffect(() => {
    if (!voice.voiceEnabled) return;
    const last = messages[messages.length - 1];
    if (last && last.role === "helena" && last.id !== lastSpokenRef.current) {
      lastSpokenRef.current = last.id;
      voice.speak(last.text);
    }
  }, [messages, voice]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, busy]);

  useEffect(() => {
    if (ui.draft) inputRef.current?.focus();
  }, [ui.draft]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    voice.stopSpeaking();
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
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    voice.stopSpeaking();
                    void sendToHelena(s);
                  }}
                  className="block w-full rounded-lg border bg-card px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:border-helena/40 hover:text-foreground"
                >
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
                  <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-sm text-primary-foreground">
                    {m.text}
                  </div>
                </div>
              ) : (
                <div key={m.id} className="flex gap-2.5">
                  <HelenaOrb className="mt-0.5 size-5" state="ocioso" />
                  <div className="min-w-0 flex-1">
                    <div className="mb-0.5 flex items-center justify-between text-[11px] text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold tracking-wider text-foreground">HELENA</span>
                        <span>{fmtTime(m.at)}</span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-5 text-muted-foreground hover:text-foreground"
                        title="Ouvir resposta novamente"
                        onClick={() => voice.speak(m.text)}
                      >
                        <Volume2 className="size-3" />
                      </Button>
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
            onChange={(e) =>
              helenaUi.set({
                draft: e.target.value,
                state: ui.state === "ocioso" ? "ouvindo" : ui.state,
              })
            }
            onBlur={() => ui.state === "ouvindo" && helenaUi.set({ state: "ocioso" })}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={voice.isListening ? "Ouvindo você... fale agora" : "Fale com Helena..."}
            className="max-h-32 min-h-6 flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />

          {/* Voice audio output toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={voice.toggleVoiceEnabled}
                className={cn(
                  "size-7 transition-colors",
                  voice.voiceEnabled ? "text-primary" : "text-muted-foreground/50",
                )}
                aria-label={voice.voiceEnabled ? "Voz feminina da Helena ativada" : "Voz desativada"}
              >
                {voice.voiceEnabled ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {voice.voiceEnabled ? "Voz feminina da Helena: ATIVADA" : "Voz da Helena: DESATIVADA"}
            </TooltipContent>
          </Tooltip>

          {/* Microphone button (Speech-To-Text) */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant={voice.isListening ? "default" : "ghost"}
                onClick={voice.isListening ? voice.stopListening : voice.startListening}
                className={cn(
                  "size-7 transition-all",
                  voice.isListening
                    ? "bg-destructive text-destructive-foreground animate-pulse"
                    : "text-muted-foreground hover:text-foreground",
                )}
                aria-label={voice.isListening ? "Ouvindo... clique para pausar" : "Falar com Helena por voz"}
              >
                <Mic className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {voice.isListening ? "Ouvindo você... Clique para enviar" : "Comando de voz (Jarvis)"}
            </TooltipContent>
          </Tooltip>

          <Button
            type="submit"
            size="icon"
            className="size-7 rounded-md"
            disabled={!ui.draft.trim() || busy}
            aria-label="Enviar"
          >
            <ArrowUp className="size-4" />
          </Button>
        </div>
        <div className="mt-1.5 flex justify-between px-1 text-[10px] text-muted-foreground">
          <span>
            {voice.isListening ? (
              <span className="font-semibold text-destructive animate-pulse">● Capturando sua voz em português...</span>
            ) : (
              "Ações de risco alto sempre pedem sua aprovação."
            )}
          </span>
          <span className="font-mono">Enter ↵</span>
        </div>
      </form>
    </div>
  );
}
