import { useRouter } from "@tanstack/react-router";
import { Maximize2, RotateCcw, X } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Dot } from "@/components/app/kit";
import { HELENA_STATE_LABEL, helenaUi } from "@/lib/helena/orchestrator";
import { update } from "@/lib/store";
import { HelenaChat } from "./HelenaChat";
import { HelenaOrb } from "./HelenaOrb";

export function HelenaHeader({ onExpand, onClose }: { onExpand?: () => void; onClose?: () => void }) {
  const ui = helenaUi.use();
  const tone = ui.state === "aguardando" ? "warning" : ui.state === "executando" ? "info" : "success";
  return (
    <div className="flex items-center justify-between border-b px-5 py-3.5">
      <div className="flex items-center gap-3">
        <HelenaOrb className="size-8" state={ui.state} />
        <div>
          <div className="text-sm font-semibold tracking-[0.16em]">HELENA</div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Dot tone={tone} pulse={ui.state !== "ocioso"} /> {HELENA_STATE_LABEL[ui.state]}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button size="icon" variant="ghost" className="size-8" aria-label="Limpar conversa" onClick={() => update((d) => { d.helenaMessages = []; })}>
          <RotateCcw />
        </Button>
        {onExpand && (
          <Button size="icon" variant="ghost" className="size-8" aria-label="Abrir em tela cheia" onClick={onExpand}>
            <Maximize2 />
          </Button>
        )}
        {onClose && (
          <Button size="icon" variant="ghost" className="size-8" aria-label="Fechar" onClick={onClose}>
            <X />
          </Button>
        )}
      </div>
    </div>
  );
}

export function HelenaPanel() {
  const ui = helenaUi.use();
  const router = useRouter();
  return (
    <Sheet open={ui.open} onOpenChange={(open) => helenaUi.set({ open })}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[460px] [&>button]:hidden">
        <SheetTitle className="sr-only">Helena</SheetTitle>
        <SheetDescription className="sr-only">Command center da Helena</SheetDescription>
        <HelenaHeader
          onExpand={() => { helenaUi.set({ open: false }); router.history.push("/ia/helena"); }}
          onClose={() => helenaUi.set({ open: false })}
        />
        <div className="min-h-0 flex-1">
          <HelenaChat />
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function HelenaFab() {
  const ui = helenaUi.use();
  if (ui.open) return null;
  return (
    <button
      type="button"
      onClick={() => helenaUi.set({ open: true })}
      className="group fixed bottom-5 right-5 z-40 flex items-center gap-2.5 rounded-full border bg-card py-2 pl-2 pr-4 shadow-lg shadow-foreground/5 transition-all hover:-translate-y-0.5 hover:border-helena/40"
      aria-label="Abrir Helena"
    >
      <HelenaOrb className="size-8" state={ui.state} />
      <span className="text-left">
        <span className="block text-xs font-semibold tracking-[0.14em]">HELENA</span>
        <span className="block text-[10px] text-muted-foreground">{HELENA_STATE_LABEL[ui.state]} · Ctrl K</span>
      </span>
    </button>
  );
}
