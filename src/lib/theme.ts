import { getWorkspacePreference, saveWorkspacePreference } from "@/lib/store";

export type Theme = "light" | "dark";
const systemTheme: Theme =
  typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
let themeOverride: Theme = systemTheme;

export const themeBootScript =
  'if(window.matchMedia("(prefers-color-scheme: dark)").matches)document.documentElement.classList.add("dark");';

export function getTheme(): Theme {
  return getWorkspacePreference<Theme>("theme", themeOverride);
}

export function applyTheme(theme: Theme) {
  themeOverride = theme;
  document.documentElement.classList.toggle("dark", theme === "dark");
  saveWorkspacePreference("theme", theme);
}
