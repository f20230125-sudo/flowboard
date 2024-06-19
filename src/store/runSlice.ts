import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { Json } from "@/engine/reference";
import type { Branch, RunEvent, RunResult, RunStatus, SkipReason, StepFailure } from "@/engine/types";
import { flowActions } from "./flowSlice";

// What happened in the last run. The engine reports events; this slice turns
// them into the state the canvas and the run panel draw from. Nothing here is
// part of the saved flow, and none of it can be undone.

export type StepStatus = "running" | "succeeded" | "failed" | "skipped" | "cancelled";

export type StepState = {
  nodeId: string;
  status: StepStatus;
  input?: Json;
  output?: Json;
  /** Which side a Condition took. */
  branch?: Branch;
  note?: string;
  error?: StepFailure;
  reason?: SkipReason;
  ms?: number;
  /** When the block began, in milliseconds since 1970. Kept so the run can be laid out on a timeline. */
  startedAt?: number;
};

export type RunState = {
  status: "idle" | "running" | RunStatus;
  /** Goes up with each run, so late events from an earlier run can be told apart. */
  runId: number;
  /** When the run began, in milliseconds since 1970. */
  startedAt: number | null;
  ms: number | null;
  steps: Record<string, StepState>;
  /** Block ids in the order the engine reached them. */
  order: string[];
  results: RunResult[];
  /** The step whose data the run panel shows. */
  openStepId: string | null;
};

const initialState: RunState = {
  status: "idle",
  runId: 0,
  startedAt: null,
  ms: null,
  steps: {},
  order: [],
  results: [],
  openStepId: null,
};

const runSlice = createSlice({
  name: "run",
  initialState,
  reducers: {
    runBegan(state) {
      Object.assign(state, initialState, { status: "running", runId: state.runId + 1 });
    },

    eventReceived(state, action: PayloadAction<{ runId: number; event: RunEvent }>) {
      const { runId, event } = action.payload;
      if (runId !== state.runId) return;

      const touch = (nodeId: string): StepState => {
        if (!state.steps[nodeId]) {
          state.steps[nodeId] = { nodeId, status: "running" };
          state.order.push(nodeId);
        }
        return state.steps[nodeId];
      };

      switch (event.type) {
        case "run-started":
          state.startedAt = event.at;
          break;
        case "node-started": {
          const step = touch(event.nodeId);
          step.status = "running";
          step.input = event.input;
          step.startedAt = event.at;
          break;
        }
        case "node-finished": {
          const step = touch(event.nodeId);
          step.status = "succeeded";
          step.output = event.output;
          step.branch = event.branch;
          step.note = event.note;
          step.ms = event.ms;
          break;
        }
        case "node-failed": {
          const step = touch(event.nodeId);
          step.status = "failed";
          step.error = event.error;
          step.ms = event.ms;
          // Show the failure without making the visitor look for it.
          state.openStepId = event.nodeId;
          break;
        }
        case "node-skipped": {
          const step = touch(event.nodeId);
          step.status = "skipped";
          step.reason = event.reason;
          break;
        }
        case "node-cancelled": {
          const step = touch(event.nodeId);
          step.status = "cancelled";
          step.ms = event.ms;
          break;
        }
        case "run-finished":
          state.status = event.status;
          state.ms = event.ms;
          state.results = event.results;
          // After a clean run, open the result; otherwise keep what is open.
          if (event.status === "succeeded" && state.openStepId === null) {
            state.openStepId = event.results.at(-1)?.nodeId ?? state.order.findLast((id) => state.steps[id].status === "succeeded") ?? null;
          }
          break;
      }
    },

    stepOpened(state, action: PayloadAction<string | null>) {
      state.openStepId = action.payload;
    },

    runCleared() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    // Another flow was opened or this one was closed: its run goes with it.
    builder
      .addCase(flowActions.flowOpened, (state) => ({ ...initialState, runId: state.runId }))
      .addCase(flowActions.flowClosed, (state) => ({ ...initialState, runId: state.runId }));
  },
});

export const runActions = runSlice.actions;
export const runReducer = runSlice.reducer;
