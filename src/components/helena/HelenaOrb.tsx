import { cn } from "@/lib/utils";
import type { HelenaState } from "@/lib/helena/orchestrator";

export function HelenaOrb({ state = "ocioso", className }: { state?: HelenaState; className?: string }) {
  return <span className={cn("helena-orb inline-block size-6 shrink-0", className)} data-state={state} aria-hidden />;
}
