import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

// Cross-browser SpeechRecognition types
interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: {
    [index: number]: {
      [index: number]: {
        transcript: string;
      };
      isFinal: boolean;
      length: number;
    };
    length: number;
  };
}

interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: ((this: SpeechRecognitionLike, ev: Event) => any) | null;
  onresult: ((this: SpeechRecognitionLike, ev: SpeechRecognitionEventLike) => any) | null;
  onerror: ((this: SpeechRecognitionLike, ev: any) => any) | null;
  onend: ((this: SpeechRecognitionLike, ev: Event) => any) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: { new (): SpeechRecognitionLike };
    webkitSpeechRecognition?: { new (): SpeechRecognitionLike };
  }
}

export function cleanTextForSpeech(raw: string): string {
  return raw
    .replace(/\*\*(.*?)\*\*/g, "$1") // bold
    .replace(/\*(.*?)\*/g, "$1") // italic
    .replace(/\[(.*?)\]\(.*?\)/g, "$1") // links
    .replace(/^#+\s+/gm, "") // headers
    .replace(/^[•\-\*]\s+/gm, "") // bullet points
    .replace(/`{1,3}[^`]*`{1,3}/g, "") // inline/block code
    .replace(/https?:\/\/\S+/g, "") // URLs
    .replace(/\n+/g, ". ") // line breaks as pauses
    .trim();
}

const VOICE_PREF_KEY = "helena-voice-enabled";

export function useHelenaVoice(opts?: {
  onTranscript?: (text: string) => void;
  onListeningChange?: (listening: boolean) => void;
}) {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const stored = window.localStorage.getItem(VOICE_PREF_KEY);
    return stored !== null ? stored === "true" : true;
  });

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const hasRecognitionSupport =
    typeof window !== "undefined" &&
    (Boolean(window.SpeechRecognition) || Boolean(window.webkitSpeechRecognition));

  const toggleVoiceEnabled = useCallback(() => {
    setVoiceEnabled((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(VOICE_PREF_KEY, String(next));
        if (!next && window.speechSynthesis) {
          window.speechSynthesis.cancel();
        }
      }
      return next;
    });
  }, []);

  // Text-To-Speech: Female Brazilian Portuguese
  const speak = useCallback(
    (text: string) => {
      if (typeof window === "undefined" || !window.speechSynthesis || !voiceEnabled) {
        return;
      }

      window.speechSynthesis.cancel();
      const clean = cleanTextForSpeech(text);
      if (!clean) return;

      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.lang = "pt-BR";
      utterance.rate = 1.02; // natural pace
      utterance.pitch = 1.08; // slightly higher feminine pitch

      const selectFemaleVoice = () => {
        const voices = window.speechSynthesis.getVoices();
        const ptVoices = voices.filter(
          (v) => v.lang === "pt-BR" || v.lang === "pt_BR" || v.lang.startsWith("pt"),
        );

        // Find female Brazilian voices by known names or keywords
        const femaleVoice =
          ptVoices.find((v) =>
            /maria|francisca|luciana|leticia|female|feminina|google português do brasil/i.test(
              v.name,
            ),
          ) ||
          ptVoices.find((v) => !/felipe|ricardo|male|masculino/i.test(v.name)) ||
          ptVoices[0];

        if (femaleVoice) {
          utterance.voice = femaleVoice;
        }
      };

      if (window.speechSynthesis.getVoices().length > 0) {
        selectFemaleVoice();
      } else {
        window.speechSynthesis.onvoiceschanged = selectFemaleVoice;
      }

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);

      window.speechSynthesis.speak(utterance);
    },
    [voiceEnabled],
  );

  const stopSpeaking = useCallback(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  }, []);

  // Speech-To-Text (Microphone)
  const startListening = useCallback(() => {
    if (!hasRecognitionSupport) {
      toast.error("Reconhecimento de voz não suportado neste navegador. Use o Chrome ou Edge.");
      return;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
    }

    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) return;

    const recognition = new SpeechRec();
    recognition.lang = "pt-BR";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
      setIsListening(true);
      opts?.onListeningChange?.(true);
    };

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      const results = event.results;
      if (results && results.length > 0) {
        const transcript = results[0][0]?.transcript?.trim();
        if (transcript) {
          opts?.onTranscript?.(transcript);
        }
      }
    };

    recognition.onerror = (event: any) => {
      setIsListening(false);
      opts?.onListeningChange?.(false);
      if (event.error !== "no-speech" && event.error !== "aborted") {
        toast.error(`Erro no microfone: ${event.error || "não reconhecido"}`);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      opts?.onListeningChange?.(false);
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      setIsListening(false);
      opts?.onListeningChange?.(false);
    }
  }, [hasRecognitionSupport, opts]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
    }
    setIsListening(false);
    opts?.onListeningChange?.(false);
  }, [opts]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
      }
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  return {
    isListening,
    isSpeaking,
    voiceEnabled,
    toggleVoiceEnabled,
    speak,
    stopSpeaking,
    startListening,
    stopListening,
    hasRecognitionSupport,
  };
}
