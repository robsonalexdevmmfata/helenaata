import { redactText, redactValue } from "@/lib/security/secrets";

let installed = false;

function mute(): boolean {
  try {
    return Boolean(import.meta.env?.PROD) && !import.meta.env?.VITEST;
  } catch {
    return false;
  }
}

/** Impede log de token/senha no DevTools. Não impede o dono da máquina de abrir Application. */
export function installConsoleShield() {
  if (installed || typeof console === "undefined") return;
  installed = true;
  const raw = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    debug: console.debug.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };
  const wrap = (fn: (...a: unknown[]) => void, drop: boolean) =>
    (...args: unknown[]) => {
      if (drop) return;
      fn(...args.map((a) => (typeof a === "string" ? redactText(a) : redactValue(a))));
    };
  const quiet = mute();
  console.log = wrap(raw.log, quiet);
  console.info = wrap(raw.info, quiet);
  console.debug = wrap(raw.debug, true);
  console.warn = wrap(raw.warn, quiet);
  console.error = wrap(raw.error, false);
}
