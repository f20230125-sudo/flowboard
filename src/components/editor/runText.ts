import type { SkipReason } from "@/engine/types";
import type { StepStatus } from "@/store/runSlice";

// The words the run panel and the canvas use for what happened in a run.

export function formatMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
}

export const STATUS_LABELS: Record<StepStatus, string> = {
  running: "Running",
  succeeded: "Done",
  failed: "Failed",
  skipped: "Skipped",
  cancelled: "Stopped",
};

export const SKIP_REASONS: Record<SkipReason, string> = {
  "not-connected": "Nothing leads here from the trigger, so it did not run.",
  "in-loop": "This block is part of a loop, so it did not run.",
  "no-data": "The path into this block was not taken.",
  "run-ended": "The run ended before it reached this block.",
};
