"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";
import { THEME_STORAGE_KEY } from "./themeScript";

// Light or dark. The choice lives on <html data-theme="..."> (set before the
// first paint by the script in themeScript.ts) and in localStorage. React reads
// it from the page instead of keeping its own copy, so the two cannot disagree.

export type Theme = "light" | "dark";

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readTheme(): Theme {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

function writeTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage may be switched off. The theme still changes for this visit.
  }
  for (const listener of listeners) listener();
}

type ThemeContextValue = { theme: Theme; toggleTheme: () => void };

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // The server cannot know the visitor's theme; it renders "light" and the
  // client corrects itself right after hydration.
  const theme = useSyncExternalStore<Theme>(subscribe, readTheme, () => "light");
  const toggleTheme = useCallback(() => writeTheme(readTheme() === "dark" ? "light" : "dark"), []);
  const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside <ThemeProvider>.");
  return value;
}
