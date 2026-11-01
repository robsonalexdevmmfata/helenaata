import { getWorkspacePreference, saveWorkspacePreference } from "@/lib/store";

export type Theme = "light" | "dark";
let themeOverride: Theme = "light";

export function getTheme(): Theme {
  return getWorkspacePreference<Theme>("theme", themeOverride);
}

export function applyTheme(theme: Theme) {
  themeOverride = theme;
  document.documentElement.classList.toggle("dark", theme === "dark");
  saveWorkspacePreference("theme", theme);
}
