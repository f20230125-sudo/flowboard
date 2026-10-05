import { describe, expect, it } from "vitest";
import { block, flow } from "@/test/build";
import { EXECUTORS } from "./executors";
import { runFlow, type RunOptions } from "./run";
import { StepError, type ExecContext, type ExecResult, type ExecutorMap, type RunEvent } from "./types";

/** Run a flow and return what happened as short lines: "started a", "finished a", ... */
async function trace(doc: ReturnType<typeof flow>, options: RunOptions = {}) {
  const events: RunEvent[] = [];
  const summary = await runFlow(doc, { sleep: async () => {}, ...options, onEvent: (event) => events.push(event) });
  const lines = events.flatMap((event) => {
    switch (event.type) {
      case "node-started":
        return [`started ${event.nodeId}`];
      case "node-finished":
        return [`finished ${event.nodeId}`];
      case "node-failed":
        return [`failed ${event.nodeId}`];
      case "node-skipped":
        return [`skipped ${event.nodeId} (${event.reason})`];
      case "node-cancelled":
        return [`cancelled ${event.nodeId}`];
      default:
        return [];
    }
  });
  return { summary, events, lines };
}

/** A promise a test settles by hand, to control when a block finishes. */
function gate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => (open = resolve));
  return { open, opened };
}

/** Replace the Delay block with one whose finish the test controls, by block. */
function gatedDelays(gates: Record<string, ReturnType<typeof gate>>): ExecutorMap {
  return {
    ...EXECUTORS,
    delay: async (config, context: ExecContext): Promise<ExecResult> => {
      const mine = gates[String(config.ms)];
      await Promise.race([
        mine.opened,
        new Promise((_resolve, reject) => context.signal.addEventListener("abort", () => reject(new DOMException("stopped", "AbortError")))),
      ]);
      return { output: context.scope.input };
    },
  };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("runFlow", () => {
  it("runs a straight line in order and returns the output", async () => {
    const doc = flow(
      [
        block("trigger", "start", { payload: '{"city":"Dubai"}' }),
        block("set", "greeting", { fields: [{ key: "text", value: "Hello {{ trigger.city }}" }] }),
        block("output", "result", { value: "{{ steps.greeting.text }}" }),
      ],
      ["start>greeting", "greeting>result"],
    );

    const { summary, lines, events } = await trace(doc);

    expect(lines).toEqual([
      "started start",
      "finished start",
      "started greeting",
      "finished greeting",
      "started result",
      "finished result",
    ]);
    expect(summary.status).toBe("succeeded");
    expect(summary.results).toEqual([{ nodeId: "result", name: "result", value: "Hello Dubai" }]);
    expect(events[0].type).toBe("run-started");
    expect(events.at(-1)).toMatchObject({ type: "run-finished", status: "succeeded" });
  });

  it("gives each block its parent's output as input", async () => {
    const doc = flow(
      [block("trigger", "start", { payload: '{"n":1}' }), block("output", "result")],
      ["start>result"],
    );
    const { events } = await trace(doc);
    expect(events.find((event) => event.type === "node-started" && event.nodeId === "result")).toMatchObject({
      input: { n: 1 },
    });
  });

  it("follows only the side of a Condition that was taken", async () => {
    const doc = flow(
      [
        block("trigger", "start", { payload: '{"temp":41}' }),
        block("condition", "isHot", { left: "{{ trigger.temp }}", operator: "greaterThan", right: "35" }),
        block("set", "hot", { fields: [{ key: "advice", value: "Stay inside" }] }),
        block("set", "mild", { fields: [{ key: "advice", value: "Go out" }] }),
        block("output", "hotResult"),
        block("output", "mildResult"),
      ],
      ["start>isHot", "isHot:true>hot", "isHot:false>mild", "hot>hotResult", "mild>mildResult"],
    );

    const { summary, lines } = await trace(doc);

    expect(lines).toContain("finished hot");
    expect(lines).toContain("skipped mild (no-data)");
    expect(lines).toContain("skipped mildResult (no-data)");
    expect(summary.results).toEqual([{ nodeId: "hotResult", name: "hotResult", value: { advice: "Stay inside" } }]);
  });

  it("runs a block where two paths meet when only one of them delivered", async () => {
    const doc = flow(
      [
        block("trigger", "start", { payload: '{"temp":20}' }),
        block("condition", "isHot", { left: "{{ trigger.temp }}", operator: "greaterThan", right: "35" }),
        block("set", "hot", { fields: [{ key: "advice", value: "Stay inside" }] }),
        block("set", "mild", { fields: [{ key: "advice", value: "Go out" }] }),
        block("output", "result"),
      ],
      ["start>isHot", "isHot:true>hot", "isHot:false>mild", "hot>result", "mild>result"],
    );
    const { summary, lines } = await trace(doc);
    expect(lines).toContain("skipped hot (no-data)");
    expect(summary.results[0].value).toEqual({ advice: "Go out" });
  });

  it("gives a block with several parents an input keyed by their names", async () => {
    const doc = flow(
      [
        block("trigger", "start"),
        block("set", "a", { fields: [{ key: "n", value: "1" }] }),
        block("set", "b", { fields: [{ key: "n", value: "2" }] }),
        block("output", "result"),
      ],
      ["start>a", "start>b", "a>result", "b>result"],
    );
    const { summary } = await trace(doc);
    expect(summary.results[0].value).toEqual({ a: { n: 1 }, b: { n: 2 } });
  });

  it("runs parallel branches at the same time", async () => {
    const gates = { 1: gate(), 2: gate() };
    const doc = flow(
      [block("trigger", "start"), block("delay", "slowA", { ms: 1 }), block("delay", "slowB", { ms: 2 }), block("output", "result")],
      ["start>slowA", "start>slowB", "slowA>result", "slowB>result"],
    );
    const events: RunEvent[] = [];
    const run = runFlow(doc, { executors: gatedDelays(gates), onEvent: (event) => events.push(event) });
    await tick();

    // Both are running and neither has finished: they overlap.
    const started = events.filter((event) => event.type === "node-started").map((event) => event.nodeId);
    expect(started).toEqual(["start", "slowA", "slowB"]);
    expect(events.some((event) => event.type === "node-finished" && event.nodeId !== "start")).toBe(false);

    // The one that started second may finish first.
    gates[2].open();
    await tick();
    gates[1].open();
    const summary = await run;

    const finished = events.filter((event) => event.type === "node-finished").map((event) => event.nodeId);
    expect(finished).toEqual(["start", "slowB", "slowA", "result"]);
    expect(summary.status).toBe("succeeded");
  });

  it("respects the limit on how many blocks run at once", async () => {
    const gates = { 1: gate(), 2: gate() };
    const doc = flow(
      [block("trigger", "start"), block("delay", "slowA", { ms: 1 }), block("delay", "slowB", { ms: 2 })],
      ["start>slowA", "start>slowB"],
    );
    const events: RunEvent[] = [];
    const run = runFlow(doc, { concurrency: 1, executors: gatedDelays(gates), onEvent: (event) => events.push(event) });
    await tick();
    const startedSoFar = () => events.filter((event) => event.type === "node-started").map((event) => event.nodeId);
    expect(startedSoFar()).toEqual(["start", "slowA"]);

    gates[1].open();
    await tick();
    expect(startedSoFar()).toEqual(["start", "slowA", "slowB"]);
    gates[2].open();
    await run;
  });

  it("only shows a block the steps that run before it", async () => {
    // `side` finishes before `late` starts, but it is on another branch.
    const doc = flow(
      [
        block("trigger", "start"),
        block("set", "side", { fields: [{ key: "n", value: "1" }] }),
        block("delay", "wait", { ms: 5 }),
        block("output", "late", { value: "{{ steps.side }}" }),
      ],
      ["start>side", "start>wait", "wait>late"],
    );
    const { summary } = await trace(doc);
    expect(summary.results[0].value).toBeNull();
  });

  it("stops at the first failed step and cancels what is still running", async () => {
    const gates = { 1: gate() };
    const doc = flow(
      [
        block("trigger", "start", { payload: '{"name":"Amal"}' }),
        block("delay", "slow", { ms: 1 }),
        block("filter", "broken", { list: "{{ trigger.name }}", left: "{{ item }}" }),
        block("output", "afterSlow"),
        block("output", "afterBroken"),
      ],
      ["start>slow", "start>broken", "slow>afterSlow", "broken>afterBroken"],
    );

    const { summary, lines, events } = await trace(doc, { executors: gatedDelays(gates) });

    expect(summary.status).toBe("failed");
    expect(lines).toEqual([
      "started start",
      "finished start",
      "started slow",
      "started broken",
      "failed broken",
      "cancelled slow",
      "skipped afterSlow (run-ended)",
      "skipped afterBroken (run-ended)",
    ]);
    expect(events.find((event) => event.type === "node-failed")).toMatchObject({
      error: { code: "not_a_list", message: '"{{ trigger.name }}" is not a list. It is text.' },
    });
    expect(summary.results).toEqual([]);
  });

  it("reports an unexpected error from a block instead of crashing", async () => {
    const executors: ExecutorMap = {
      ...EXECUTORS,
      set: async () => {
        throw new Error("boom");
      },
    };
    const doc = flow([block("trigger", "start"), block("set", "bad")], ["start>bad"]);
    const { summary, events } = await trace(doc, { executors });
    expect(summary.status).toBe("failed");
    expect(events.find((event) => event.type === "node-failed")).toMatchObject({
      error: { code: "unexpected", message: "boom" },
    });
  });

  it("keeps a failed step's detail for the run panel", async () => {
    const executors: ExecutorMap = {
      ...EXECUTORS,
      http: async () => {
        throw new StepError("http_status", "api.example.com answered 500.", { status: 500 });
      },
    };
    const doc = flow([block("trigger", "start"), block("http", "call", { url: "https://api.example.com" })], ["start>call"]);
    const { events } = await trace(doc, { executors });
    expect(events.find((event) => event.type === "node-failed")).toMatchObject({ error: { detail: { status: 500 } } });
  });

  it("stops when asked, and says so", async () => {
    const gates = { 1: gate() };
    const stop = new AbortController();
    const doc = flow(
      [block("trigger", "start"), block("delay", "slow", { ms: 1 }), block("output", "result")],
      ["start>slow", "slow>result"],
    );
    const events: RunEvent[] = [];
    const run = runFlow(doc, { signal: stop.signal, executors: gatedDelays(gates), onEvent: (event) => events.push(event) });
    await tick();
    stop.abort();
    const summary = await run;

    expect(summary.status).toBe("stopped");
    expect(events.map((event) => event.type)).toEqual([
      "run-started",
      "node-started",
      "node-finished",
      "node-started",
      "node-cancelled",
      "node-skipped",
      "run-finished",
    ]);
  });

  it("does nothing when it was stopped before it began", async () => {
    const stop = new AbortController();
    stop.abort();
    const doc = flow([block("trigger", "start"), block("output", "result")], ["start>result"]);
    const { summary, lines } = await trace(doc, { signal: stop.signal });
    expect(summary.status).toBe("stopped");
    expect(lines).toEqual(["skipped start (run-ended)", "skipped result (run-ended)"]);
  });

  it("skips blocks that nothing leads to", async () => {
    const doc = flow(
      [block("trigger", "start"), block("output", "result"), block("set", "island"), block("output", "islandResult")],
      ["start>result", "island>islandResult"],
    );
    const { summary, lines } = await trace(doc);
    expect(lines).toContain("skipped island (not-connected)");
    expect(lines).toContain("skipped islandResult (not-connected)");
    expect(summary.status).toBe("succeeded");
  });

  it("does not hang on a loop", async () => {
    const doc = flow(
      [block("trigger", "start"), block("set", "a"), block("set", "b"), block("output", "result")],
      ["start>a", "a>b", "b>a", "b>result"],
    );
    const { summary, lines } = await trace(doc);
    expect(lines).toContain("skipped a (in-loop)");
    expect(lines).toContain("skipped b (in-loop)");
    expect(lines).toContain("skipped result (no-data)");
    expect(summary.status).toBe("succeeded");
  });

  it("passes fetch, the AI settings and the relay address to the blocks", async () => {
    const seen: Partial<ExecContext> = {};
    const executors: ExecutorMap = {
      ...EXECUTORS,
      ai: async (_config, context) => {
        Object.assign(seen, context);
        return { output: null };
      },
    };
    const fetch = (async () => new Response("{}")) as typeof globalThis.fetch;
    const ai = { baseUrl: "https://ai.example.com", apiKey: "k", model: "m" };
    const doc = flow([block("trigger", "start"), block("ai", "ask", { prompt: "Hi" })], ["start>ask"]);

    await runFlow(doc, { executors, fetch, ai, relayUrl: "/relay" });

    expect(seen.fetch).toBe(fetch);
    expect(seen.ai).toEqual(ai);
    expect(seen.relayUrl).toBe("/relay");
  });

  it("measures how long each step and the whole run took", async () => {
    let clock = 1000;
    const now = () => (clock += 5);
    const doc = flow([block("trigger", "start")]);
    const { events, summary } = await trace(doc, { now });
    expect(events.find((event) => event.type === "node-finished")).toMatchObject({ ms: 5 });
    expect(summary.ms).toBeGreaterThan(0);
  });
});
