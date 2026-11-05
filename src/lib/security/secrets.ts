import type { DB, User } from "@/lib/types";

/** Não é bcrypt. Impede leitura casual da senha no localStorage. */
export function hashPw(plain: string, userId: string) {
  const s = `helena.pw.v1:${userId}:${plain}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `fnv1a:${(h >>> 0).toString(16)}`;
}

export function passwordMatches(user: User, plain: string) {
  if (!plain) return false;
  if (user.passwordHash) return user.passwordHash === hashPw(plain, user.id);
  if (user.password) return user.password === plain;
  return false;
}

const SECRET_KEY = /password|passwd|api[_-]?key|apikey|authorization|bearer|token|secret|session|private[_-]?key|database_url/i;

export function redactValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[…]";
  if (typeof value === "string") {
    if (value.length > 8 && SECRET_KEY.test(value)) return "[redacted]";
    return value.length > 240 ? `${value.slice(0, 80)}…` : value;
  }
  if (!value || typeof value !== "object") return value;
  if (value instanceof Error) return { name: value.name, message: redactText(value.message) };
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redactValue(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SECRET_KEY.test(k) ? "[redacted]" : redactValue(v, depth + 1);
  }
  return out;
}

export function redactText(text: string) {
  return text
    .replace(/(api[_-]?key|apikey|authorization|bearer|token|password|secret)\s*[:=]\s*["']?[\w./+=-]{6,}/gi, "$1=[redacted]")
    .replace(/sk-[a-zA-Z0-9]{10,}/g, "[redacted]");
}

export function sanitizeUser(u: User): User {
  const { password: _p, ...rest } = u;
  return {
    ...rest,
    passwordHash: u.passwordHash || (u.password ? hashPw(u.password, u.id) : undefined),
  };
}

export function sanitizeDb(db: DB): DB {
  const copy = structuredClone(db);
  copy.users = copy.users.map(sanitizeUser);
  copy.apiTokens = (copy.apiTokens || []).map((t) => ({ ...t, prefix: t.prefix?.slice(0, 8) || "tok" }));
  copy.providers = (copy.providers || []).map((p) => ({ ...p, keyMasked: p.keyMasked ? "••••" : "" }));
  copy.helenaMessages = (copy.helenaMessages || []).slice(0, 80);
  return copy;
}
