import { describe, expect, it, vi } from "vitest";
import { MemoryFlowRepository } from "@/storage/repository";
import { block, flow } from "@/test/build";
import { flowActions } from "./flowSlice";
import { runActions } from "./runSlice";
import { startRun, stopRun } from "./runThunks";
import { makeStore } from "./store";

function setup(doc: ReturnType<typeof flow>) {
  const store = makeStore({ repository: new MemoryFlowRepository() });
  store.dispatch(flowActions.flowOpened(doc));
  return store;
}

const weather = () =>
  flow(
    [
      block("trigger", "start", { payload: '{"city":"Dubai"}' }),
      block("http", "weather", { url: "https://api.example.com/{{ trigger.city }}" }),
      block("condition", "isHot", { left: "{{ steps.weather.body.temp }}", operator: "greaterThan", right: "35" }),
      block("output", "hot", { value: "Stay inside" }),
      block("output", "mild", { value: "Go out" }),
    ],
    ["start>weather", "weather>isHot", "isHot:true>hot", "isHot:false>mild"],
  );

const answering = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;

describe("running a flow from the store", () => {
  it("records every step and the result", async () => {
    const store = setup(weather());
    const fetch = answering({ temp: 41 });

    const summary = await store.dispatch(startRun({ fetch }));

    expect(fetch).toHaveBeenCalledWith("https://api.example.com/Dubai", expect.anything());
    expect(summary?.status).toBe("succeeded");

    const { run, ui } = store.getState();
    expect(run.status).toBe("succeeded");
    expect(run.order).toEqual(["start", "weather", "isHot", "hot", "mild"]);
    expect(run.steps.weather).toMatchObject({ status: "succeeded", output: { status: 200, body: { temp: 41 } } });
    expect(run.steps.isHot).toMatchObject({ status: "succeeded", branch: "true" });
    expect(run.steps.hot).toMatchObject({ status: "succeeded", output: "Stay inside", input: { result: true } });
    expect(run.steps.mild).toMatchObject({ status: "skipped", reason: "no-data" });
    expect(run.results).toEqual([{ nodeId: "hot", name: "hot", value: "Stay inside" }]);
    expect(run.openStepId).toBe("hot");
    expect(ui.bottomTab).toBe("run");
  });

  it("opens the failed step and keeps what the server said", async () => {
    const store = setup(weather());

    await store.dispatch(startRun({ fetch: answering({ message: "No such city" }, 404) }));

    const { run } = store.getState();
    expect(run.status).toBe("failed");
    expect(run.openStepId).toBe("weather");
    expect(run.steps.weather).toMatchObject({
      status: "failed",
      error: { code: "http_status", detail: { status: 404, body: { message: "No such city" } } },
    });
    expect(run.steps.isHot).toMatchObject({ status: "skipped", reason: "run-ended" });
    expect(run.results).toEqual([]);
  });

  it("does not run a flow with errors, and shows the problems instead", async () => {
    const store = setup(flow([block("trigger", "start"), block("http", "call")], ["start>call"]));
    const fetch = answering({});

    expect(await store.dispatch(startRun({ fetch }))).toBeNull();

    expect(fetch).not.toHaveBeenCalled();
    expect(store.getState().run.status).toBe("idle");
    expect(store.getState().ui.bottomTab).toBe("problems");
  });

  it("stops a run in progress", async () => {
    const store = setup(flow([block("trigger", "start"), block("delay", "wait", { ms: 60000 }), block("output", "result")], ["start>wait", "wait>result"]));

    const running = store.dispatch(startRun());
    await vi.waitFor(() => expect(store.getState().run.steps.wait?.status).toBe("running"));
    store.dispatch(stopRun());
    const summary = await running;

    expect(summary?.status).toBe("stopped");
    expect(store.getState().run.status).toBe("stopped");
    expect(store.getState().run.steps.wait.status).toBe("cancelled");
    expect(store.getState().run.steps.result).toMatchObject({ status: "skipped", reason: "run-ended" });
  });

  it("ignores a second Run while one is in progress", async () => {
    const store = setup(flow([block("trigger", "start"), block("delay", "wait", { ms: 60000 })], ["start>wait"]));
    const first = store.dispatch(startRun());
    await vi.waitFor(() => expect(store.getState().run.status).toBe("running"));

    expect(await store.dispatch(startRun())).toBeNull();
    expect(store.getState().run.runId).toBe(1);

    store.dispatch(stopRun());
    await first;
  });

  it("drops events that arrive from an earlier run", () => {
    const store = setup(weather());
    store.dispatch(runActions.runBegan());
    store.dispatch(runActions.runBegan());
    store.dispatch(runActions.eventReceived({ runId: 1, event: { type: "node-started", nodeId: "start", input: null, at: 0 } }));
    expect(store.getState().run.steps).toEqual({});
  });

  it("starts each run from a clean slate, and forgets the run when another flow opens", async () => {
    const store = setup(weather());
    await store.dispatch(startRun({ fetch: answering({ temp: 41 }) }));
    await store.dispatch(startRun({ fetch: answering({ temp: 20 }) }));
    expect(store.getState().run.results).toEqual([{ nodeId: "mild", name: "mild", value: "Go out" }]);
    expect(store.getState().run.steps.hot.status).toBe("skipped");

    store.dispatch(flowActions.flowOpened(flow([block("trigger", "start")])));
    expect(store.getState().run).toMatchObject({ status: "idle", steps: {}, order: [], runId: 2 });
  });

  it("lets the visitor open any step", () => {
    const store = setup(weather());
    store.dispatch(runActions.stepOpened("weather"));
    expect(store.getState().run.openStepId).toBe("weather");
  });
});
