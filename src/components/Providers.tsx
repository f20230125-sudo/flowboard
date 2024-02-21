"use client";

import { useState } from "react";
import { Provider } from "react-redux";
import { loadAiConfig } from "@/settings/ai";
import { BrowserFlowRepository, MemoryFlowRepository } from "@/storage/repository";
import { makeStore } from "@/store/store";
import { ThemeProvider } from "./theme";
import { ToastProvider } from "./toast";

/** Everything the app shares: the Redux store, the theme and toasts. */
export function Providers({ children }: { children: React.ReactNode }) {
  // One store for the life of the page. On the server there is no browser
  // storage, so the store gets an empty in-memory one for the first render.
  const [store] = useState(() => {
    if (typeof window === "undefined") return makeStore({ repository: new MemoryFlowRepository() });
    const storage = window.localStorage;
    return makeStore(
      { repository: new BrowserFlowRepository(storage), settingsStore: storage },
      { settings: { ai: loadAiConfig(storage), open: false } },
    );
  });

  return (
    <Provider store={store}>
      <ThemeProvider>
        <ToastProvider>{children}</ToastProvider>
      </ThemeProvider>
    </Provider>
  );
}
