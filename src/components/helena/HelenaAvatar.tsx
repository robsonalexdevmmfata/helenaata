import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { HelenaState } from "@/lib/helena/orchestrator";

export const HELENA_AVATAR_SRC = "/helena-avatar.jpg";

export function HelenaAvatar({
  className,
  state = "ocioso",
  talking,
}: {
  className?: string;
  state?: HelenaState;
  talking?: boolean;
}) {
  const [tts, setTts] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const tick = () => setTts(Boolean(window.speechSynthesis?.speaking));
    tick();
    const id = window.setInterval(tick, 90);
    return () => window.clearInterval(id);
  }, []);

  const isTalking =
    talking ??
    (tts || state === "executando" || state === "concluindo" || state === "planejando");
  const isListening = state === "ouvindo";
  const isThinking = state === "pensando" || state === "planejando";

  return (
    <span
      className={cn(
        "helena-avatar relative inline-flex shrink-0 overflow-hidden rounded-full select-none",
        isTalking && "helena-avatar--talking",
        isListening && "helena-avatar--listening",
        isThinking && "helena-avatar--thinking",
        className,
      )}
      data-state={state}
      aria-hidden
    >
      <img
        src={HELENA_AVATAR_SRC}
        alt=""
        className="helena-avatar__face h-full w-full object-cover object-[50%_18%]"
        draggable={false}
      />
      <span className="helena-avatar__mouth" />
    </span>
  );
}
