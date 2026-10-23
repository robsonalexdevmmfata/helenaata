// Global Helena Background Music Player (Happy Nation / YouTube)
import { createUiStore } from "@/lib/store";
import { getBriefingConfig, extractYouTubeId } from "./briefing";

export interface MusicPlayerState {
  playing: boolean;
  volume: number;
  trackTitle: string;
  youtubeId: string;
}

export const helenaMusic = createUiStore<MusicPlayerState>({
  playing: false,
  volume: 18,
  trackTitle: "Ace of Base - Happy Nation",
  youtubeId: "HWjCStB6k4o",
});

let iframeElement: HTMLIFrameElement | null = null;

export function registerMusicIframe(iframe: HTMLIFrameElement | null) {
  iframeElement = iframe;
}

export function playHappyNation(volume?: number) {
  const cfg = getBriefingConfig();
  const vol = volume ?? cfg.musicVolume ?? 18;
  const ytid = extractYouTubeId(cfg.musicUrl);

  helenaMusic.set({
    playing: true,
    volume: vol,
    youtubeId: ytid,
    trackTitle: "Ace of Base - Happy Nation",
  });

  if (iframeElement?.contentWindow) {
    try {
      iframeElement.contentWindow.postMessage(JSON.stringify({ event: "command", func: "playVideo", args: [] }), "*");
      iframeElement.contentWindow.postMessage(JSON.stringify({ event: "command", func: "setVolume", args: [vol] }), "*");
    } catch {}
  }
}

export function pauseHappyNation() {
  helenaMusic.set({ playing: false });
  if (iframeElement?.contentWindow) {
    try {
      iframeElement.contentWindow.postMessage(JSON.stringify({ event: "command", func: "pauseVideo", args: [] }), "*");
    } catch {}
  }
}

export function toggleHappyNation() {
  if (helenaMusic.get().playing) {
    pauseHappyNation();
  } else {
    playHappyNation();
  }
}

export function setMusicVolume(vol: number) {
  helenaMusic.set({ volume: vol });
  if (iframeElement?.contentWindow) {
    try {
      iframeElement.contentWindow.postMessage(JSON.stringify({ event: "command", func: "setVolume", args: [vol] }), "*");
    } catch {}
  }
}
