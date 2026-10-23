import { useRouter } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { Disc3, Maximize2, Music, Pause, Play, RotateCcw, Volume2, X } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Dot } from "@/components/app/kit";
import { HELENA_STATE_LABEL, helenaUi } from "@/lib/helena/orchestrator";
import { update, useDB } from "@/lib/store";
import { HelenaChat } from "./HelenaChat";
import { HelenaOrb } from "./HelenaOrb";
import {
  helenaMusic, playHappyNation, pauseHappyNation, toggleHappyNation,
  registerMusicIframe, setMusicVolume,
} from "@/lib/helena/music";
import { getBriefingConfig, extractYouTubeId } from "@/lib/helena/briefing";
import { cn } from "@/lib/utils";

export function HelenaHeader({ onExpand, onClose }: { onExpand?: () => void; onClose?: () => void }) {
  const ui = helenaUi.use();
  const music = helenaMusic.use();
  const tone = ui.state === "aguardando" ? "warning" : ui.state === "executando" ? "info" : "success";

  return (
    <div className="flex items-center justify-between border-b px-4 py-3 sm:px-5">
      <div className="flex items-center gap-2.5">
        <HelenaOrb className="size-8" state={ui.state} />
        <div>
          <div className="text-sm font-semibold tracking-[0.16em] flex items-center gap-1.5">
            HELENA
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Dot tone={tone} pulse={ui.state !== "ocioso"} /> {HELENA_STATE_LABEL[ui.state]}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        {/* Happy Nation soundtrack pill */}
        <button
          type="button"
          onClick={toggleHappyNation}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] border transition-all",
            music.playing
              ? "border-helena/50 bg-helena/15 text-helena font-medium shadow-sm"
              : "border-border text-muted-foreground hover:bg-muted"
          )}
          title="Tocar/Pausar Ace of Base - Happy Nation"
        >
          <Disc3 className={cn("size-3.5", music.playing && "animate-spin text-helena")} />
          <span className="font-mono text-[10px]">Happy Nation</span>
          {music.playing ? <Pause className="size-2.5 fill-current" /> : <Play className="size-2.5 fill-current" />}
        </button>

        <Button
          size="icon"
          variant="ghost"
          className="size-8"
          aria-label="Limpar conversa"
          onClick={() => update((d) => { d.helenaMessages = []; })}
          title="Limpar histórico"
        >
          <RotateCcw className="size-3.5" />
        </Button>
        {onExpand && (
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            aria-label="Abrir em tela cheia"
            onClick={onExpand}
            title="Tela Cheia"
          >
            <Maximize2 className="size-3.5" />
          </Button>
        )}
        {onClose && (
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            aria-label="Fechar"
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

export function HelenaPanel() {
  const ui = helenaUi.use();
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Register iframe for Happy Nation playback
  useEffect(() => {
    registerMusicIframe(iframeRef.current);
    return () => registerMusicIframe(null);
  }, []);

  // When balloon opens, automatically start Happy Nation if configured
  useEffect(() => {
    if (ui.open) {
      const cfg = getBriefingConfig();
      if (cfg.autoPlayMusic) {
        setTimeout(() => {
          playHappyNation(cfg.musicVolume);
        }, 200);
      }
    } else {
      pauseHappyNation();
    }
  }, [ui.open]);

  const cfg = getBriefingConfig();
  const ytId = extractYouTubeId(cfg.musicUrl);

  return (
    <Sheet open={ui.open} onOpenChange={(open) => helenaUi.set({ open })}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[480px] [&>button]:hidden shadow-2xl">
        <SheetTitle className="sr-only">Helena AI</SheetTitle>
        <SheetDescription className="sr-only">Command center e briefing executivo da Helena</SheetDescription>
        <HelenaHeader
          onExpand={() => { helenaUi.set({ open: false }); router.history.push("/ia/helena"); }}
          onClose={() => helenaUi.set({ open: false })}
        />
        <div className="min-h-0 flex-1">
          <HelenaChat />
        </div>

        {/* Hidden YouTube Iframe Player for Happy Nation */}
        <div className="hidden" aria-hidden="true">
          <iframe
            ref={iframeRef}
            width="200"
            height="200"
            src={`https://www.youtube-nocookie.com/embed/${ytId}?enablejsapi=1&origin=${typeof window !== "undefined" ? window.location.origin : ""}&loop=1&playlist=${ytId}`}
            title="Happy Nation Player"
            allow="autoplay; encrypted-media"
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function HelenaFab() {
  const ui = helenaUi.use();
  const music = helenaMusic.use();

  if (ui.open) return null;

  return (
    <button
      type="button"
      onClick={() => helenaUi.set({ open: true })}
      className="group fixed bottom-5 right-5 z-40 flex items-center gap-2.5 rounded-full border bg-card py-2 pl-2 pr-4 shadow-lg shadow-foreground/10 transition-all hover:-translate-y-0.5 hover:border-helena/50 hover:shadow-helena/10"
      aria-label="Abrir Helena"
    >
      <HelenaOrb className="size-8" state={ui.state} />
      <span className="text-left">
        <span className="block text-xs font-semibold tracking-[0.14em] flex items-center gap-1.5">
          HELENA
          {music.playing && <Disc3 className="size-3 text-helena animate-spin" />}
        </span>
        <span className="block text-[10px] text-muted-foreground">
          {music.playing ? "🎵 Happy Nation" : `${HELENA_STATE_LABEL[ui.state]} · Ctrl K`}
        </span>
      </span>
    </button>
  );
}
