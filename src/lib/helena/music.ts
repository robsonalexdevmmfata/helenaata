// Global Helena Background Music Player (Happy Nation / YouTube)
// Iframe MUST stay inside the viewport — Chrome silences off-screen media.
import { createUiStore } from "@/lib/store";
import { getBriefingConfig, extractYouTubeId } from "./briefing";

/** Happy Nation: pula a intro e começa no refrão (~0:12). Sem loop. */
export const MUSIC_START_SEC = 12;

export interface MusicPlayerState {
  playing: boolean;
  volume: number;
  trackTitle: string;
  youtubeId: string;
  linger: boolean;
}

export const helenaMusic = createUiStore<MusicPlayerState>({
  playing: false,
  volume: 36,
  trackTitle: "Ace of Base - Happy Nation",
  youtubeId: "HWjCStB6k4o",
  linger: false,
});

let iframeElement: HTMLIFrameElement | null = null;
let iframeReady = false;
let pendingVolume: number | null = null;
let playRetries = 0;

if (typeof window !== "undefined") {
  window.addEventListener("message", (event) => {
    try {
      const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      if (data?.event === "onReady") {
        iframeReady = true;
        if (pendingVolume !== null) {
          const vol = pendingVolume;
          pendingVolume = null;
          issuePlay(vol);
        }
      }
      if (data?.event === "onStateChange") {
        const state = typeof data.info === "number" ? data.info : data.info?.playerState;
        if (state === 1) {
          helenaMusic.set({ playing: true });
          playRetries = 0;
        } else if (state === 2 || state === 0) {
          helenaMusic.set({ playing: false });
        }
      }
    } catch {
      /* ignore */
    }
  });
}

function _postCmd(func: string, args: unknown[]) {
  if (!iframeElement?.contentWindow) return;
  try {
    iframeElement.contentWindow.postMessage(
      JSON.stringify({ event: "command", func, args }),
      "*",
    );
  } catch {}
}

function issuePlay(vol: number) {
  _postCmd("seekTo", [MUSIC_START_SEC, true]);
  _postCmd("playVideo", []);
  _postCmd("unMute", []);
  _postCmd("setVolume", [Math.max(28, Math.min(100, vol))]);
  helenaMusic.set({ playing: true, volume: vol });
}

export function registerMusicIframe(iframe: HTMLIFrameElement | null) {
  iframeElement = iframe;
  if (iframe !== null) {
    iframeReady = false;
    pendingVolume = null;
    const handshake = () => {
      try {
        iframe.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: 1 }), "*");
      } catch {}
    };
    iframe.addEventListener("load", handshake);
    handshake();
  }
}

export function playHelenaTrack(kind: "entrada" | "despedida" = "entrada", volume?: number, opts?: { linger?: boolean }) {
  const cfg = getBriefingConfig();
  const vol = volume ?? cfg.musicVolume ?? 36;
  const url = kind === "despedida" ? (cfg.exitMusicUrl || cfg.musicUrl) : cfg.musicUrl;
  const ytid = extractYouTubeId(url);

  helenaMusic.set({
    youtubeId: ytid,
    trackTitle: kind === "despedida" ? "Trilha de despedida" : "Trilha de entrada",
    volume: vol,
    linger: opts?.linger === true,
  });

  pendingVolume = vol;
  issuePlay(vol);

  playRetries = 0;
  const retry = () => {
    playRetries += 1;
    if (playRetries > 4) return;
    if (!helenaMusic.get().playing || !iframeReady) {
      issuePlay(vol);
      window.setTimeout(retry, 700);
    }
  };
  if (typeof window !== "undefined") window.setTimeout(retry, 600);
}

export function playHappyNation(volume?: number, opts?: { linger?: boolean }) {
  playHelenaTrack("entrada", volume, opts);
}

export function playFarewellMusic(volume?: number) {
  playHelenaTrack("despedida", volume, { linger: true });
}

export function pauseHappyNation() {
  pendingVolume = null;
  helenaMusic.set({ playing: false, linger: false });
  _postCmd("pauseVideo", []);
}

/** Para a trilha no fim da saudação, a menos que o usuário tenha pedido para continuar. */
export function pauseHappyNationIfGreeting() {
  if (helenaMusic.get().linger) return;
  pauseHappyNation();
}

export function toggleHappyNation() {
  if (helenaMusic.get().playing) pauseHappyNation();
  else playHappyNation(undefined, { linger: true });
}

export function setMusicVolume(vol: number) {
  helenaMusic.set({ volume: vol });
  _postCmd("unMute", []);
  _postCmd("setVolume", [vol]);
}
