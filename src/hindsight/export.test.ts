import { describe, expect, it, vi } from "vitest";
import { flowActions } from "@/store/flowSlice";
import { startRun } from "@/store/runThunks";
import { makeStore } from "@/store/store";
import { MemoryFlowRepository } from "@/storage/repository";
import { block, flow } from "@/test/build";
import { ENVELOPE_FORMAT, ENVELOPE_VERSION, exportRun } from "./export";

// A flow is run through the real store, with a stand-in for the network, and
// the run is exported the way the Run panel's button does it.

const SECRET = "SECRET-KEY-1234";

const weather = () =>
  flow(
    [
      block("trigger", "start", { payload: '{"city":"Dubai"}' }),
      block("http", "weather", { url: `https://api.example.com/{{ trigger.city }}?key=${SECRET}` }),
      block("condition", "isHot", { left: "{{ steps.weather.body.temp }}", operator: "greaterThan", right: "35" }),
      block("output", "hot", { value: "Stay inside" }),
      block("output", "mild", { value: "Go out" }),
    ],
    ["start>weather", "weather>isHot", "isHot:true>hot", "isHot:false>mild"],
  );

const answering = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;

async function runAndExport(doc = weather(), fetch = answering({ temp: 41 })) {
  const store = makeStore({ repository: new MemoryFlowRepository() });
  store.dispatch(flowActions.flowOpened(doc));
  await store.dispatch(startRun({ fetch }));
  const { flow: open, run } = store.getState();
  return { store, envelope: exportRun({ name: open.present.name, nodes: open.present.nodes, edges: open.present.edges }, run) };
}

describe("exporting a run", () => {
  it("writes out the flow, how its blocks were joined, and each block that ran", async () => {
    const { envelope } = await runAndExport();
    const { format, version, app, data } = envelope;
    expect([format, version, app]).toEqual([ENVELOPE_FORMAT, ENVELOPE_VERSION, "flowboard"]);

    expect(data.flow.name).toBe("Test flow");
    expect(data.flow.blocks).toEqual([
      { id: "start", name: "start", type: "trigger" },
      { id: "weather", name: "weather", type: "http" },
      { id: "isHot", name: "isHot", type: "condition" },
      { id: "hot", name: "hot", type: "output" },
      { id: "mild", name: "mild", type: "output" },
    ]);
    expect(data.flow.connections).toContainEqual({ from: "isHot", to: "hot", side: "true" });
    expect(data.flow.connections).toContainEqual({ from: "isHot", to: "mild", side: "false" });

    expect(data.run.status).toBe("succeeded");
    expect(typeof data.run.startedAt).toBe("number");
    expect(typeof data.run.ms).toBe("number");

    const step = (id: string) => data.run.steps.find((entry) => entry.id === id)!;
    expect(data.run.steps.map((entry) => entry.id).slice(0, 4)).toEqual(["start", "weather", "isHot", "hot"]);
    expect(step("weather")).toMatchObject({ status: "succeeded", output: { status: 200, ok: true, body: { temp: 41 } } });
    expect(step("isHot")).toMatchObject({ status: "succeeded", branch: "true", output: { result: true } });
    expect(step("hot")).toMatchObject({ status: "succeeded", output: "Stay inside" });
    // The block on the side that was not taken did not run, and says why.
    expect(step("mild")).toMatchObject({ status: "skipped", reason: "no-data", startedAt: null, ms: null });
  });

  it("says when each block began, in order, from the start of the run", async () => {
    const { envelope } = await runAndExport();
    const { run } = envelope.data;
    const ran = run.steps.filter((step) => step.startedAt !== null);
    expect(ran.length).toBeGreaterThanOrEqual(4);
    for (const step of ran) {
      expect(step.startedAt!).toBeGreaterThanOrEqual(run.startedAt!);
      expect(step.startedAt! + step.ms!).toBeLessThanOrEqual(run.startedAt! + run.ms! + 5);
    }
    const starts = ran.map((step) => step.startedAt!);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });

  it("never writes out what a block is set up to do, only what it is called and the data that passed through", async () => {
    const { envelope } = await runAndExport();
    const text = JSON.stringify(envelope);
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain("api.example.com");
    expect(text).not.toContain("config");
    expect(text).toContain("Dubai");
  });

  it("writes out a failed block with its message", async () => {
    const { envelope } = await runAndExport(weather(), answering({ message: "Not found" }, 404));
    expect(envelope.data.run.status).toBe("failed");
    const failed = envelope.data.run.steps.find((step) => step.status === "failed")!;
    expect(failed.id).toBe("weather");
    expect(failed.error).toMatchObject({ code: expect.any(String), message: expect.stringContaining("404") });
    expect(Object.keys(failed.error!).sort()).toEqual(["code", "message"]);
  });

  it("is plain JSON, and leaves out data too big to carry", async () => {
    const big = { rows: "x".repeat(30_000) };
    const { envelope } = await runAndExport(weather(), answering({ temp: 41, big }));
    expect(JSON.parse(JSON.stringify(envelope))).toEqual(envelope);
    expect(envelope.data.run.steps.find((step) => step.id === "weather")!.output).toEqual({ truncated: true, characters: expect.any(Number) });
  });
});
