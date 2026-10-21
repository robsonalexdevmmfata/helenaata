const KEY = "helena-theme";

export type Theme = "light" | "dark";

export function getTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return (window.localStorage.getItem(KEY) as Theme) ?? "light";
}

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  window.localStorage.setItem(KEY, theme);
}

/** Inline script to set the theme class before paint (avoids flash). */
export const themeBootScript = `try{if(localStorage.getItem('${KEY}')==='dark')document.documentElement.classList.add('dark')}catch(e){}`;
