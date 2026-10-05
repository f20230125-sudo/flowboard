import { runFlow, type RunOptions } from "@/engine/run";
import type { RunSummary } from "@/engine/types";
import { hasErrors } from "@/flow/validate";
import { toAiSettings } from "@/settings/ai";
import { runActions } from "./runSlice";
import { selectProblems, toDocument } from "./selectors";
import type { AppThunk } from "./store";
import { uiActions } from "./uiSlice";

// Starting and stopping a run. The engine does the work; these connect it to
// the store.

/** The switch that stops the run in progress. Not in the store: it is not data. */
let stopSwitch: AbortController | null = null;

/**
 * Run the open flow. Returns the summary, or null when the flow has errors
 * and was not run (the Problems panel is opened instead).
 */
export const startRun =
  (options: Pick<RunOptions, "fetch" | "sleep" | "executors"> = {}): AppThunk<Promise<RunSummary | null>> =>
  async (dispatch, getState) => {
    const state = getState();
    if (state.flow.status !== "ready" || state.run.status === "running") return null;

    if (hasErrors(selectProblems(state))) {
      dispatch(uiActions.bottomTabSet("problems"));
      return null;
    }

    dispatch(runActions.runBegan());
    const runId = getState().run.runId;
    stopSwitch = new AbortController();

    return runFlow(toDocument(state.flow, new Date()), {
      ...options,
      ai: toAiSettings(state.settings.ai),
      signal: stopSwitch.signal,
      onEvent: (event) => dispatch(runActions.eventReceived({ runId, event })),
    });
  };

export const stopRun = (): AppThunk => () => {
  stopSwitch?.abort();
};
