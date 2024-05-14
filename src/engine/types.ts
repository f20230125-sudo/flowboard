import type { ConfigOf, NodeType } from "@/flow/schema";
import type { Json, Scope } from "./reference";

/** A step failed for a reason worth showing to the person who built the flow. */
export class StepError extends Error {
  readonly code: string;
  readonly detail?: Json;

  constructor(code: string, message: string, detail?: Json) {
    super(message);
    this.name = "StepError";
    this.code = code;
    this.detail = detail;
  }
}

/**
 * What an AI provider said went wrong, or null when it said nothing readable.
 * Most send { error: { message } }. Gemini wraps that in a list for some
 * failures, and a few services send { error: "text" }.
 */
export function errorMessage(data: unknown): string | null {
  const body: unknown = Array.isArray(data) ? data[0] : data;
  if (body === null || typeof body !== "object") return null;
  const error = (body as { error?: unknown }).error;
  if (typeof error === "string") return error;
  const message = (error as { message?: unknown } | null | undefined)?.message;
  return typeof message === "string" ? message : null;
}

/** Where the AI step sends its request. Null means no model is available. */
export type AiSettings = { baseUrl: string; apiKey: string; model: string };

/** Everything a block may use while it runs. Tests pass stand-ins for all of it. */
export type ExecContext = {
  scope: Scope;
  signal: AbortSignal;
  fetch: typeof fetch;
  ai: AiSettings | null;
  relayUrl: string;
  sleep: (ms: number, signal: AbortSignal) => Promise<void>;
};

export type Branch = "true" | "false";

export type ExecResult = {
  output: Json;
  /** Set by a Condition: only connections from this side carry on. */
  branch?: Branch;
  /** A short remark for the run panel, such as "Kept 3 of 10". */
  note?: string;
};

export type Executor<T extends NodeType> = (config: ConfigOf<T>, context: ExecContext) => Promise<ExecResult>;
export type ExecutorMap = { [T in NodeType]: Executor<T> };

export type RunStatus = "succeeded" | "failed" | "stopped";

export type StepFailure = { code: string; message: string; detail?: Json };

/**
 * Why a block did not run.
 * - not-connected: nothing leads to it from the trigger
 * - in-loop: it is part of a loop
 * - no-data: every path into it was skipped (the other side of a Condition)
 * - run-ended: the run failed or was stopped before reaching it
 */
export type SkipReason = "not-connected" | "in-loop" | "no-data" | "run-ended";

export type RunResult = { nodeId: string; name: string; value: Json };

/** What the engine reports while it works. The UI builds everything it shows from these. */
export type RunEvent =
  | { type: "run-started"; at: number }
  | { type: "node-started"; nodeId: string; input: Json; at: number }
  | { type: "node-finished"; nodeId: string; output: Json; branch?: Branch; note?: string; ms: number }
  | { type: "node-failed"; nodeId: string; error: StepFailure; ms: number }
  | { type: "node-skipped"; nodeId: string; reason: SkipReason }
  | { type: "node-cancelled"; nodeId: string; ms: number }
  | { type: "run-finished"; status: RunStatus; ms: number; results: RunResult[] };

export type RunSummary = { status: RunStatus; ms: number; results: RunResult[] };

export function abortError(): DOMException {
  return new DOMException("The run was stopped.", "AbortError");
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/** Wait, but give up at once when the run is stopped. */
export function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
