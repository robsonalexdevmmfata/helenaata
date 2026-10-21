import { useSyncExternalStore } from "react";
import type { DB } from "./types";
import { createSeed } from "./seed";

// Mock data layer. All reads/writes go through this store so it can be swapped
// for HTTP calls to a real PostgreSQL-backed API without touching the screens.
const KEY = "helena-db-v1";

let seedCache: DB | null = null;
const seed = () => (seedCache ??= createSeed());

let state: DB | null = null;
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function load(): DB {
  if (typeof window === "undefined") return seed();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DB;
      if (parsed.version === 1) return parsed;
    }
  } catch {
    /* ignore corrupted storage */
  }
  return seed();
}

export function getDB(): DB {
  if (!state) state = load();
  return state;
}

function persist() {
  if (typeof window === "undefined") return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* storage full: keep in memory */
    }
  }, 250);
}

export function update(fn: (draft: DB) => void) {
  const next = structuredClone(getDB());
  fn(next);
  state = next;
  persist();
  listeners.forEach((l) => l());
}

export function resetDB() {
  state = createSeed();
  persist();
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useDB(): DB {
  return useSyncExternalStore(subscribe, getDB, seed);
}

export function uid(prefix = "") {
  return `${prefix}${Math.random().toString(36).slice(2, 10)}`;
}

export function nowISO() {
  return new Date().toISOString();
}

/** Resolve an owner id (user or agent) to a display name. */
export function ownerName(db: DB, id?: string) {
  if (!id) return "—";
  if (id === "helena") return "Helena";
  return db.users.find((u) => u.id === id)?.name ?? db.agents.find((a) => a.id === id)?.name ?? "—";
}

export function currentUser(db: DB) {
  return db.users.find((u) => u.id === db.currentUserId)!;
}

export function can(db: DB, permission: string) {
  const user = currentUser(db);
  return db.rolePermissions[user.role]?.includes(permission) ?? false;
}

/** Tiny generic store for UI-only state (not persisted). */
export function createUiStore<T>(initial: T) {
  let s = initial;
  const ls = new Set<() => void>();
  return {
    get: () => s,
    set: (patch: Partial<T>) => {
      s = { ...s, ...patch };
      ls.forEach((l) => l());
    },
    use: () =>
      useSyncExternalStore(
        (l) => {
          ls.add(l);
          return () => ls.delete(l);
        },
        () => s,
        () => initial,
      ),
  };
}
