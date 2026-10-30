/** Logs no formato que o Render mostra na aba Logs. Nunca imprime chave/senha. */
export function log(level, msg, extra = {}) {
  const line = {
    t: new Date().toISOString(),
    level,
    msg,
    ...extra,
  };
  const text = `[Helena] ${msg}${Object.keys(extra).length ? ` ${JSON.stringify(extra)}` : ""}`;
  if (level === "error") console.error(text);
  else if (level === "warn") console.warn(text);
  else console.log(text);
  return line;
}

export function mask(value) {
  const s = String(value || "");
  if (s.length < 8) return s ? "***" : "";
  return `${s.slice(0, 4)}…${s.slice(-3)}`;
}
