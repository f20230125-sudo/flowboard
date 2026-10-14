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
      <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-col items-center gap-2" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center gap-3 rounded-block border bg-sheet px-3 py-2 text-[13px] font-medium shadow-overlay ${
              toast.tone === "bad" ? "border-fail text-fail" : "border-rule text-ink"
            }`}
          >
            <span>{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                className="min-h-6 rounded-control px-1.5 font-bold text-ink underline hover:bg-sheet-2"
                onClick={() => {
                  toast.action?.run();
                  dismiss(toast.id);
                }}
              >
                {toast.action.label}
              </button>
            )}
            <button
              type="button"
              aria-label="Dismiss"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-control text-ink-2 hover:bg-sheet-2 hover:text-ink"
              onClick={() => dismiss(toast.id)}
            >
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
