import { createUiStore } from "@/lib/store";

const KEY = "helena-vtuber-anim-paused";

function readPaused() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(KEY) === "1";
}

export const helenaVtuberUi = createUiStore<{ paused: boolean }>({ paused: false });

export function hydrateVtuberPause() {
  helenaVtuberUi.set({ paused: readPaused() });
}

export function setVtuberPaused(paused: boolean) {
  helenaVtuberUi.set({ paused });
  if (typeof window !== "undefined") {
    window.localStorage.setItem(KEY, paused ? "1" : "0");
  }
}
