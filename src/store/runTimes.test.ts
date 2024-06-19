import { describe, expect, it } from "vitest";
import { MemoryFlowRepository } from "@/storage/repository";
import { block, flow } from "@/test/build";
import { flowActions } from "./flowSlice";
import { runActions } from "./runSlice";
import { makeStore } from "./store";

// The engine says when the run and each block began. The run's state keeps it,
// so the run can be laid out on a timeline afterwards.

function setup() {
  const store = makeStore({ repository: new MemoryFlowRepository() });
  store.dispatch(flowActions.flowOpened(flow([block("trigger", "start"), block("output", "end")], ["start>end"])));
  store.dispatch(runActions.runBegan());
  return { store, runId: store.getState().run.runId };
}

describe("when a run began", () => {
  it("keeps the time the run and each block began", () => {
    const { store, runId } = setup();
    const send = (event: Parameters<typeof runActions.eventReceived>[0]["event"]) => store.dispatch(runActions.eventReceived({ runId, event }));

    send({ type: "run-started", at: 1000 });
    send({ type: "node-started", nodeId: "start", input: null, at: 1010 });
    send({ type: "node-finished", nodeId: "start", output: {}, ms: 4 });
    send({ type: "node-started", nodeId: "end", input: {}, at: 1020 });

    expect(store.getState().run).toMatchObject({ startedAt: 1000, steps: { start: { startedAt: 1010, ms: 4 }, end: { startedAt: 1020 } } });
  });

  it("forgets them when a new run begins, or the flow is closed", () => {
    const { store, runId } = setup();
    store.dispatch(runActions.eventReceived({ runId, event: { type: "run-started", at: 1000 } }));
    store.dispatch(runActions.runBegan());
    expect(store.getState().run.startedAt).toBeNull();

    store.dispatch(runActions.eventReceived({ runId: store.getState().run.runId, event: { type: "run-started", at: 2000 } }));
    expect(store.getState().run.startedAt).toBe(2000);
    store.dispatch(flowActions.flowClosed());
    expect(store.getState().run.startedAt).toBeNull();
  });

  it("ignores a late event from an earlier run", () => {
    const { store, runId } = setup();
    store.dispatch(runActions.runBegan());
    store.dispatch(runActions.eventReceived({ runId, event: { type: "run-started", at: 1000 } }));
    expect(store.getState().run.startedAt).toBeNull();
  });
});
