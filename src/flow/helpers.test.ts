import { describe, expect, it } from "vitest";
import { block, flow } from "@/test/build";
import { canConnect, freeOutput, placeNear } from "./connect";
import { describeNode } from "./describe";
import { renameInConfig, renameInText } from "./rename";

describe("canConnect", () => {
  const doc = flow(
    [block("trigger", "start"), block("condition", "check"), block("delay", "wait"), block("output", "result")],
    ["start>check", "check:true>wait"],
  );
  const ask = (source: string, handle: string, target: string) =>
    canConnect(doc.nodes, doc.edges, source, handle, target);

  it("allows a connection that follows the rules", () => {
    expect(ask("check", "false", "result")).toEqual({ ok: true });
    expect(ask("wait", "out", "result")).toEqual({ ok: true });
    // Two blocks may feed the same one, and one block may feed several.
    expect(ask("check", "false", "wait")).toEqual({ ok: true });
  });

  it("says why a connection is refused", () => {
    const reason = (source: string, handle: string, target: string) => {
      const answer = ask(source, handle, target);
      return answer.ok ? null : answer.reason;
    };
    expect(reason("wait", "out", "wait")).toBe("A block cannot connect to itself.");
    expect(reason("wait", "out", "start")).toBe("Nothing can lead into a Manual trigger.");
    expect(reason("check", "out", "result")).toBe("The Condition block has no such output.");
    expect(reason("result", "out", "wait")).toBe("The Output block has no such output.");
    expect(reason("check", "true", "wait")).toBe("These blocks are already connected.");
    expect(reason("wait", "out", "check")).toBe("That would make a loop, and the flow would never finish.");
    expect(reason("ghost", "out", "wait")).toBe("One of the blocks is no longer there.");
  });
});

describe("placing a new block", () => {
  it("starts an empty flow at a fixed spot", () => {
    expect(placeNear([], undefined)).toEqual({ x: 80, y: 160 });
  });

  it("goes right of the anchor, on the grid", () => {
    const anchor = { ...block("trigger", "start"), position: { x: 95, y: 43 } };
    expect(placeNear([anchor], anchor)).toEqual({ x: 380, y: 40 });
  });

  it("goes right of the rightmost block when there is no anchor", () => {
    const a = { ...block("trigger", "start"), position: { x: 0, y: 0 } };
    const b = { ...block("delay", "wait"), position: { x: 500, y: 100 } };
    expect(placeNear([a, b], undefined)).toEqual({ x: 780, y: 100 });
  });

  it("steps down until the spot is free", () => {
    const anchor = { ...block("condition", "check"), position: { x: 0, y: 0 } };
    const first = { ...block("delay", "a"), position: { x: 280, y: 0 } };
    const second = { ...block("delay", "b"), position: { x: 280, y: 140 } };
    expect(placeNear([anchor, first, second], anchor)).toEqual({ x: 280, y: 280 });
  });

  it("offers the first output that is not used yet", () => {
    const doc = flow([block("condition", "check"), block("delay", "a"), block("output", "result")], ["check:true>a"]);
    expect(freeOutput(doc.nodes[0], doc.edges)).toBe("false");
    expect(freeOutput(doc.nodes[0], [])).toBe("true");
    expect(freeOutput(doc.nodes[1], [])).toBe("out");
    expect(freeOutput(doc.nodes[2], [])).toBeNull();
  });
});

describe("renaming references", () => {
  it("renames the block and nothing else", () => {
    expect(renameInText("{{ steps.http1.body }}", "http1", "weather")).toBe("{{ steps.weather.body }}");
    expect(renameInText("a {{steps.http1}} b {{ steps.http1.x[0] }}", "http1", "weather")).toBe(
      "a {{steps.weather}} b {{ steps.weather.x[0] }}",
    );
  });

  it("leaves look-alikes and plain text alone", () => {
    const untouched = [
      "{{ steps.http10.body }}",
      "{{ steps.other.http1 }}",
      "{{ trigger.http1 }}",
      "steps.http1 outside braces",
      "{{ steps. }}",
    ];
    for (const text of untouched) expect(renameInText(text, "http1", "weather")).toBe(text);
  });

  it("renames inside every text of a block's settings", () => {
    const { config } = block("http", "call", {
      url: "https://api.example.com/{{ steps.http1.body.id }}",
      query: [{ key: "q", value: "{{ steps.http1.body.name }}" }],
      method: "POST",
      timeoutMs: 5000,
    });
    expect(renameInConfig(config, "http1", "weather")).toMatchObject({
      url: "https://api.example.com/{{ steps.weather.body.id }}",
      query: [{ key: "q", value: "{{ steps.weather.body.name }}" }],
      method: "POST",
      timeoutMs: 5000,
    });
  });
});

describe("describeNode", () => {
  it("sums up each kind of block in a line", () => {
    const lines = [
      block("trigger", "start"),
      block("http", "call", { method: "POST", url: "https://api.example.com/tickets" }),
      block("http", "empty"),
      block("condition", "check", { left: "{{ trigger.temp }}", operator: "greaterThan", right: "35" }),
      block("condition", "unary", { left: "{{ trigger.name }}", operator: "isEmpty" }),
      block("condition", "blank"),
      block("set", "fields", { fields: [{ key: "city", value: "x" }, { key: "temp", value: "y" }] }),
      block("filter", "keep", { list: "{{ trigger.items }}", left: "{{ item.done }}", operator: "equals", right: "true" }),
      block("ai", "ask", { prompt: "Summarise\n  this   ticket" }),
      block("delay", "short", { ms: 250 }),
      block("delay", "long", { ms: 2500 }),
      block("output", "result"),
    ].map(describeNode);

    expect(lines).toEqual([
      "Starts when you press Run",
      "POST api.example.com/tickets",
      "No address yet",
      "{{ trigger.temp }} is greater than 35",
      "{{ trigger.name }} is empty",
      "Not set up yet",
      "city, temp",
      "Keep where {{ item.done }} equals true",
      "Summarise this ticket",
      "Wait 250 ms",
      "Wait 2.5 s",
      "Shows whatever arrives",
    ]);
  });

  it("cuts long text short", () => {
    const line = describeNode(block("ai", "ask", { prompt: "x".repeat(200) }));
    expect(line.length).toBeLessThanOrEqual(44);
    expect(line.endsWith("…")).toBe(true);
  });
});
