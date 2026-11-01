import { useEffect, useRef } from "react";
import { useRouter } from "@tanstack/react-router";
import { Disc3, Maximize2, Pause, Play, RotateCcw, X } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Dot } from "@/components/app/kit";
import { HELENA_STATE_LABEL, helenaUi } from "@/lib/helena/orchestrator";
import { update } from "@/lib/store";
import { HelenaChat } from "./HelenaChat";
import { HelenaOrb } from "./HelenaOrb";
import { HelenaAvatarWidget } from "./HelenaAvatarWidget";
import { helenaMusic, MUSIC_START_SEC, registerMusicIframe, toggleHappyNation } from "@/lib/helena/music";
import { extractYouTubeId, getBriefingConfig } from "@/lib/helena/briefing";
import { cn } from "@/lib/utils";

export function HelenaHeader({ onExpand, onClose }: { onExpand?: () => void; onClose?: () => void }) {
  const ui = helenaUi.use();
  const music = helenaMusic.use();
  const tone = ui.state === "aguardando" ? "warning" : ui.state === "executando" ? "info" : "success";

  return (
    <div className="flex items-center justify-between border-b px-4 py-3 sm:px-5">
      <div className="flex items-center gap-2.5">
        <HelenaOrb className="size-9" state={ui.state} talking={music.playing} />
        <div>
          <div className="text-sm font-semibold tracking-[0.16em] flex items-center gap-1.5">
            HELENA
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Dot tone={tone} pulse={ui.state !== "ocioso"} /> {HELENA_STATE_LABEL[ui.state]}
            {ui.screenLabel ? <span className="truncate"> · {ui.screenLabel}</span> : null}
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
          <span className="hidden font-mono text-[10px] sm:inline">Happy Nation</span>
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
  const cfg = getBriefingConfig();
  const ytId = extractYouTubeId(cfg.musicUrl);
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:8081";

  useEffect(() => {
    if (iframeRef.current) registerMusicIframe(iframeRef.current);
    return () => registerMusicIframe(null);
  }, []);

  return (
    <>
      <iframe
        ref={iframeRef}
        width="2"
        height="2"
        src={`https://www.youtube.com/embed/${ytId}?enablejsapi=1&origin=${origin}&start=${MUSIC_START_SEC}&playsinline=1&rel=0&modestbranding=1`}
        title="Helena soundtrack"
        allow="autoplay; encrypted-media"
        tabIndex={-1}
        className="pointer-events-none fixed bottom-0 right-0 h-px w-px opacity-[0.02]"
      />
      <HelenaAvatarWidget />

      <Sheet open={ui.open} onOpenChange={(open) => helenaUi.set({ open })}>
        <SheetContent side="right" className="flex h-[100dvh] w-full max-w-none flex-col gap-0 p-0 sm:max-w-[480px] [&>button]:hidden shadow-2xl">
          <SheetTitle className="sr-only">Helena AI</SheetTitle>
          <SheetDescription className="sr-only">Command center e briefing executivo da Helena</SheetDescription>
          <HelenaHeader
            onExpand={() => { helenaUi.set({ open: false }); router.history.push("/ia/helena"); }}
            onClose={() => helenaUi.set({ open: false })}
          />
          <div className="min-h-0 flex-1">
            <HelenaChat />
          </div>
        </SheetContent>
      </Sheet>
    </>
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
      <HelenaOrb className="size-9" state={ui.state} talking={music.playing} />
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
