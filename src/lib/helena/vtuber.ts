import { createUiStore } from "@/lib/store";
import { getWorkspacePreference, saveWorkspacePreference } from "@/lib/store";

function readPaused() {
  return getWorkspacePreference("vtuberPaused", false);
}

export const helenaVtuberUi = createUiStore<{ paused: boolean }>({ paused: false });

export function hydrateVtuberPause() {
  helenaVtuberUi.set({ paused: readPaused() });
}

export function setVtuberPaused(paused: boolean) {
  helenaVtuberUi.set({ paused });
  saveWorkspacePreference("vtuberPaused", paused);
}
