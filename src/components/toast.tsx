"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";

// Short messages that appear in a corner and leave by themselves. A toast can
// carry one action, which is how "Flow deleted" offers "Undo".

type Toast = {
  id: number;
  message: string;
  tone: "neutral" | "bad";
  action?: { label: string; run: () => void };
};

type ToastOptions = { tone?: Toast["tone"]; action?: Toast["action"]; durationMs?: number };

type ToastContextValue = { showToast: (message: string, options?: ToastOptions) => void };

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, options: ToastOptions = {}) => {
      const id = nextId.current++;
      setToasts((current) => [...current.slice(-2), { id, message, tone: options.tone ?? "neutral", action: options.action }]);
      setTimeout(() => dismiss(id), options.durationMs ?? (options.action ? 7000 : 4000));
    },
    [dismiss],
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center gap-3 rounded-lg border bg-surface px-3 py-2 text-sm shadow-panel ${
              toast.tone === "bad" ? "border-bad text-bad" : "border-line text-fg"
            }`}
          >
            <span>{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                className="rounded px-1.5 py-0.5 font-medium text-accent hover:bg-accent-soft"
                onClick={() => {
                  toast.action?.run();
                  dismiss(toast.id);
                }}
              >
                {toast.action.label}
              </button>
            )}
            <button type="button" aria-label="Dismiss" className="text-faint hover:text-fg" onClick={() => dismiss(toast.id)}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be used inside <ToastProvider>.");
  return value;
}
