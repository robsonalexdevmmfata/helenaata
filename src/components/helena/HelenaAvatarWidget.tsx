import { useEffect, useState } from "react";
import { Minus } from "lucide-react";
import { HELENA_STATE_LABEL, helenaUi } from "@/lib/helena/orchestrator";
import { HelenaAvatar } from "./HelenaAvatar";
import { cn } from "@/lib/utils";

export function HelenaAvatarWidget() {
  const ui = helenaUi.use();
  const [minimized, setMinimized] = useState(false);

  if (ui.open) return null;

  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        className="helena-widget-restore fixed z-40"
        title="Mostrar Helena"
        aria-label="Mostrar Helena"
      >
        <span className="helena-widget-ring helena-widget-ring--sm">
          <span className="helena-widget-core">
            <HelenaAvatar className="size-11" state={ui.state} />
          </span>
        </span>
      </button>
    );
  }

  return (
    <div className="helena-widget group/hw fixed z-40">
      <button
        type="button"
        className="helena-widget-ctrl absolute -right-1 -top-1 z-20"
        title="Minimizar"
        aria-label="Minimizar Helena"
        onClick={(e) => {
          e.stopPropagation();
          setMinimized(true);
        }}
      >
        <Minus className="size-3" />
      </button>

      <button
        type="button"
        onClick={() => helenaUi.set({ open: true })}
        className="flex w-full flex-col items-center gap-2 text-center"
        aria-label="Abrir Helena"
      >
        <span className="helena-widget-ring helena-widget-ring--lg">
          <span className="helena-widget-core">
            <HelenaAvatar className="size-14 sm:size-[88px]" state={ui.state} />
          </span>
        </span>
        <span className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-foreground">
          <span
            className={cn(
              "helena-widget-dot",
              ui.state === "aguardando" ? "helena-widget-dot--warn" : "helena-widget-dot--online",
            )}
          />
          Helena
          <span className="text-muted-foreground">•</span>
          <span className="text-muted-foreground">{HELENA_STATE_LABEL[ui.state]}</span>
        </span>
      </button>
    </div>
  );
}
