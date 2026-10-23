// Global Helena Background Music Player (Happy Nation / YouTube)
// Uses YouTube IFrame API postMessage protocol.
// Iframe MUST be mounted outside display:none for browser autoplay to work.
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
let iframeReady = false;
let pendingVolume: number | null = null;

// Listen for YouTube IFrame API ready event
if (typeof window !== "undefined") {
  window.addEventListener("message", (event) => {
    try {
      const data =
        typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      if (data?.event === "onReady") {
        iframeReady = true;
        // If there's a pending play queued before iframe was ready, execute now
        if (pendingVolume !== null) {
          const vol = pendingVolume;
          pendingVolume = null;
          _postCmd("setVolume", [vol]);
          _postCmd("playVideo", []);
          helenaMusic.set({ playing: true });
        }
      }
      // Sync playing state from YouTube player state changes
      if (data?.event === "onStateChange") {
        // 1 = playing, 2 = paused, 0 = ended
        if (data?.info === 1) helenaMusic.set({ playing: true });
        else if (data?.info === 2 || data?.info === 0) helenaMusic.set({ playing: false });
      }
    } catch {
      // ignore non-JSON messages
    }
  });
}

function _postCmd(func: string, args: unknown[]) {
  if (!iframeElement?.contentWindow) return;
  try {
    iframeElement.contentWindow.postMessage(
      JSON.stringify({ event: "command", func, args }),
      "*"
    );
  } catch {}
}

export function registerMusicIframe(iframe: HTMLIFrameElement | null) {
  iframeElement = iframe;
  // Reset ready state so we wait for the new iframe's onReady event
  if (iframe !== null) {
    iframeReady = false;
    pendingVolume = null;
  }
}

export function playHappyNation(volume?: number) {
  const cfg = getBriefingConfig();
  const vol = volume ?? cfg.musicVolume ?? 18;
  const ytid = extractYouTubeId(cfg.musicUrl);

  helenaMusic.set({
    youtubeId: ytid,
    trackTitle: "Ace of Base - Happy Nation",
    volume: vol,
  });

  if (iframeReady) {
    _postCmd("setVolume", [vol]);
    _postCmd("playVideo", []);
    helenaMusic.set({ playing: true });
  } else {
    // Queue play — will execute when iframe fires onReady
    pendingVolume = vol;
    // Try sending optimistically too (works if API already loaded)
    _postCmd("setVolume", [vol]);
    _postCmd("playVideo", []);
    helenaMusic.set({ playing: true });
  }
}

export function pauseHappyNation() {
  pendingVolume = null;
  helenaMusic.set({ playing: false });
  _postCmd("pauseVideo", []);
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
  _postCmd("setVolume", [vol]);
}
