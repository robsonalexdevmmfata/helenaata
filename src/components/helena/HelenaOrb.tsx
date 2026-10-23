import { cn } from "@/lib/utils";
import type { HelenaState } from "@/lib/helena/orchestrator";

export function RobotFace({
  className,
  state = "ocioso",
}: {
  className?: string;
  state?: HelenaState;
}) {
  const isListening = state === "ouvindo";
  const isThinking = state === "pensando" || state === "planejando";
  const isExecuting = state === "executando" || state === "concluindo";
  const isWaiting = state === "aguardando";

  // Dynamic eye color according to Helena's state
  const eyeColor = isExecuting
    ? "#34d399" // emerald
    : isWaiting
    ? "#fbbf24" // amber warning
    : isThinking
    ? "#c084fc" // neon purple
    : "#38bdf8"; // high-tech cyan/sky

  const uid = state;

  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("w-full h-full select-none", className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`helmGrad-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#fef3c7" stopOpacity="0.85" />
        </linearGradient>
        <linearGradient id={`visorGrad-${uid}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#09090b" />
          <stop offset="100%" stopColor="#18181b" />
        </linearGradient>
        <filter id={`eyeGlow-${uid}`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="0.8" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* Top Antenna */}
      <line
        x1="16"
        y1="5.5"
        x2="16"
        y2="9"
        stroke="#ffffff"
        strokeWidth="1.5"
        strokeLinecap="round"
        className={cn(isListening && "animate-pulse")}
      />
      <circle
        cx="16"
        cy="4.5"
        r="2"
        fill={eyeColor}
        filter={`url(#eyeGlow-${uid})`}
        className={cn((isThinking || isListening) && "animate-ping")}
      />
      <circle cx="16" cy="4.5" r="1.7" fill={eyeColor} />

      {/* Side Audio Nodes / Ears */}
      <rect x="4" y="13.5" width="2.2" height="7" rx="1.1" fill="#ffffff" opacity="0.9" />
      <rect x="25.8" y="13.5" width="2.2" height="7" rx="1.1" fill="#ffffff" opacity="0.9" />

      {/* Head Shell */}
      <rect
        x="5.5"
        y="9"
        width="21"
        height="16"
        rx="5.5"
        fill={`url(#helmGrad-${uid})`}
        stroke="rgba(255,255,255,0.4)"
        strokeWidth="0.8"
      />

      {/* Dark Visor Screen */}
      <rect
        x="8"
        y="12"
        width="16"
        height="10.5"
        rx="3.5"
        fill={`url(#visorGrad-${uid})`}
        stroke="rgba(0,0,0,0.35)"
        strokeWidth="0.5"
      />

      {/* Visor shine glass reflection */}
      <path
        d="M9 13.5C9 13 11 12.5 13 12.5h6c-3 1-8 1.5-10 1z"
        fill="#ffffff"
        opacity="0.25"
      />

      {/* Digital Glowing Robot Eyes */}
      <rect
        x="10.8"
        y="14.8"
        width="3.6"
        height="4.5"
        rx="1.8"
        fill={eyeColor}
        filter={`url(#eyeGlow-${uid})`}
        className={cn(isThinking && "animate-pulse")}
      />
      <rect
        x="17.6"
        y="14.8"
        width="3.6"
        height="4.5"
        rx="1.8"
        fill={eyeColor}
        filter={`url(#eyeGlow-${uid})`}
        className={cn(isThinking && "animate-pulse")}
      />

      {/* Pupil Highlights */}
      <circle cx="12.2" cy="16.2" r="0.7" fill="#ffffff" opacity="0.95" />
      <circle cx="19" cy="16.2" r="0.7" fill="#ffffff" opacity="0.95" />

      {/* Voice wave or smile */}
      {isListening ? (
        <path
          d="M12.5 20.5c1 1 2 1 3 0s2-1 3 0"
          stroke={eyeColor}
          strokeWidth="0.9"
          strokeLinecap="round"
          className="animate-pulse"
        />
      ) : (
        <line
          x1="13.5"
          y1="20.5"
          x2="18.5"
          y2="20.5"
          stroke={eyeColor}
          strokeWidth="0.9"
          strokeLinecap="round"
          opacity="0.8"
        />
      )}

      {/* Cybernetic Collar */}
      <path
        d="M11 25.5h10l-1.5 2.5h-7L11 25.5z"
        fill="#ffffff"
        opacity="0.9"
      />
    </svg>
  );
}

export function HelenaOrb({
  state = "ocioso",
  className,
}: {
  state?: HelenaState;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "helena-orb inline-flex items-center justify-center size-6 shrink-0 rounded-full select-none overflow-hidden",
        className
      )}
      data-state={state}
      aria-hidden
    >
      <span className="relative z-10 flex items-center justify-center w-[84%] h-[84%]">
        <RobotFace state={state} />
      </span>
    </span>
  );
}

export { RobotFace as HelenaRobotLogo };
