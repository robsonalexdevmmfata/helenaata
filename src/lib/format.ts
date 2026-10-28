import { format, formatDistanceToNowStrict } from "date-fns";
import { ptBR } from "date-fns/locale";

export const brl = (n: number, digits = 0) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: digits, minimumFractionDigits: digits });

export const num = (n: number) => n.toLocaleString("pt-BR");

export const pct = (n: number, digits = 1) =>
  `${n.toLocaleString("pt-BR", { maximumFractionDigits: digits, minimumFractionDigits: digits })}%`;

export const timeAgo = (iso: string) =>
  formatDistanceToNowStrict(new Date(iso), { locale: ptBR, addSuffix: true });

export const fmtDate = (iso: string) => format(new Date(iso), "dd/MM/yyyy", { locale: ptBR });
export const fmtLocalDate = (d: Date) => format(d, "dd/MM/yyyy", { locale: ptBR });
export const fmtLocalDateLong = (d: Date) => format(d, "EEEE, dd/MM/yyyy", { locale: ptBR });

/** Valor de <input type="datetime-local"> no fuso do navegador (não UTC). */
export function toDatetimeLocalValue(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export const fmtDateShort = (iso: string) => format(new Date(iso), "dd/MM", { locale: ptBR });
export const fmtTime = (iso: string) => format(new Date(iso), "HH:mm");
export const fmtDateTime = (iso: string) => format(new Date(iso), "dd/MM HH:mm", { locale: ptBR });

export function greeting(d = new Date()) {
  const h = d.getHours();
  if (h < 5) return "Boa noite";
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

export const initials = (name: string) =>
  name
    .replace(/^(Dra?\.)\s/, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

export const normalize = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

export const bytes = (n: number) =>
  n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.round(n / 1000)} KB`;
