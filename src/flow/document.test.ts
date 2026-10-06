import { describe, expect, it } from "vitest";
import { block, flow } from "@/test/build";
import { CATALOG, defaultConfig } from "./catalog";
import { cloneSelection, copyFlow, createEdge, createFlow, createNode, uniqueName } from "./document";
import { CONFIG_SCHEMAS, FLOW_VERSION, NODE_TYPES, parseFlow } from "./schema";

describe("parseFlow", () => {
  it("accepts a flow and fills in settings that were left out", () => {
    const result = parseFlow({
      version: FLOW_VERSION,
      id: "f1",
      name: "Weather",
      updatedAt: "2026-10-05T00:00:00.000Z",
      nodes: [
        { id: "a", type: "trigger", name: "start", position: { x: 0, y: 0 }, config: {} },
        { id: "b", type: "http", name: "call", position: { x: 200, y: 0 }, config: { url: "https://api.example.com" } },
      ],
      edges: [{ id: "e1", source: "a", target: "b" }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.flow.description).toBe("");
    expect(result.flow.edges[0].sourceHandle).toBe("out");
    expect(result.flow.nodes[1].config).toMatchObject({ method: "GET", failOnError: true, via: "browser", timeoutMs: 10000 });
  });

  it("opens a flow saved before a setting existed, with that setting switched off", () => {
    const saved = {
      version: 1,
      id: "old",
      name: "Saved last week",
      updatedAt: "2026-09-28T00:00:00.000Z",
      nodes: [
        { id: "a", type: "trigger", name: "start", position: { x: 0, y: 0 }, config: {} },
        // No "retries": the HTTP block had no extra tries then.
        { id: "b", type: "http", name: "call", position: { x: 280, y: 0 }, config: { url: "https://api.example.com", timeoutMs: 5000 } },
      ],
      edges: [{ id: "e", source: "a", target: "b" }],
    };
    const parsed = parseFlow(saved);
    expect(parsed.ok && parsed.flow.nodes[1].config).toMatchObject({ url: "https://api.example.com", timeoutMs: 5000, retries: 0 });
  });

  it("keeps a temperature a flow already set, and sets none on a new AI step", () => {
    const withAi = (config: object) => ({
      version: 1,
      id: "ai",
      name: "AI",
      updatedAt: "2026-10-05T00:00:00.000Z",
      nodes: [{ id: "a", type: "ai", name: "ask", position: { x: 0, y: 0 }, config }],
      edges: [],
    });
    const old = parseFlow(withAi({ prompt: "Hi", temperature: 0.2 }));
    expect(old.ok && old.flow.nodes[0].config).toMatchObject({ temperature: 0.2 });
    const fresh = parseFlow(withAi({ prompt: "Hi" }));
    expect(fresh.ok && fresh.flow.nodes[0].config).toMatchObject({ temperature: null });
  });

  it("accepts what the app itself writes", () => {
    const doc = flow([block("trigger", "start"), block("output", "result")], ["start>result"]);
    expect(parseFlow(JSON.parse(JSON.stringify(doc)))).toEqual({ ok: true, flow: doc });
  });

  it("refuses things that are not a flow, in plain words", () => {
    for (const bad of [null, "text", 42, [], {}, { version: FLOW_VERSION, nodes: "none" }]) {
      const result = parseFlow(bad);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain("not a valid flow file");
    }
  });

  it("refuses a block of an unknown kind or with broken settings", () => {
    const doc = flow([block("trigger", "start")]);
    const unknown = { ...doc, nodes: [{ ...doc.nodes[0], type: "teleport" }] };
    const broken = { ...doc, nodes: [{ ...block("delay", "wait"), config: { ms: -5 } }] };
    expect(parseFlow(unknown).ok).toBe(false);
    expect(parseFlow(broken).ok).toBe(false);
  });

  it("says when a flow comes from a newer version", () => {
    const result = parseFlow({ ...flow([]), version: FLOW_VERSION + 1 });
    expect(result).toEqual({ ok: false, error: "This flow was made with a newer version of Flowboard." });
  });

  it("refuses a connection to a block that is not there", () => {
    const doc = flow([block("trigger", "start")], ["start>ghost"]);
    expect(parseFlow(doc)).toEqual({ ok: false, error: "A connection points at a block that is not in the flow." });
  });

  it("refuses repeated ids", () => {
    const twins = flow([block("trigger", "start"), block("output", "start")]);
    expect(parseFlow(twins)).toEqual({ ok: false, error: 'Two blocks share the id "start".' });

    const doubled = flow([block("trigger", "start"), block("output", "result")], ["start>result", "start>result"]);
    expect(parseFlow(doubled)).toEqual({ ok: false, error: 'Two connections share the id "start>result".' });
  });
});

describe("catalog", () => {
  it("describes every kind of block", () => {
    for (const type of NODE_TYPES) {
      expect(CATALOG[type].type).toBe(type);
      expect(CATALOG[type].title).toBeTruthy();
    }
  });

  it("only lists settings that the block really has", () => {
    for (const type of NODE_TYPES) {
      const known = Object.keys(defaultConfig(type));
      for (const field of CATALOG[type].fields) expect(known).toContain(field.key);
    }
  });

  it("gives default settings that pass the block's own schema", () => {
    for (const type of NODE_TYPES) {
      expect(CONFIG_SCHEMAS[type].safeParse(defaultConfig(type)).success).toBe(true);
    }
  });

  it("gives a Condition two sides and an Output none", () => {
    expect(CATALOG.condition.outputs.map((handle) => handle.id)).toEqual(["true", "false"]);
    expect(CATALOG.output.outputs).toEqual([]);
    expect(CATALOG.trigger.hasInput).toBe(false);
  });
});

describe("making blocks and flows", () => {
  it("picks the first free name", () => {
    expect(uniqueName("http", [])).toBe("http1");
    expect(uniqueName("http", ["http1", "http2", "http4"])).toBe("http3");
  });

  it("creates a block with default settings and a free name", () => {
    const node = createNode("http", { x: 10, y: 20 }, ["http1"]);
    expect(node).toMatchObject({ type: "http", name: "http2", position: { x: 10, y: 20 }, config: { method: "GET" } });
    expect(node.id).toMatch(/^[0-9a-f]{12}$/);
  });

  it("starts a new flow with a trigger", () => {
    const doc = createFlow("My flow", new Date("2026-10-05T10:00:00Z"));
    expect(doc).toMatchObject({ version: FLOW_VERSION, name: "My flow", updatedAt: "2026-10-05T10:00:00.000Z" });
    expect(doc.nodes.map((node) => node.type)).toEqual(["trigger"]);
    expect(parseFlow(doc).ok).toBe(true);
  });

  it("copies a selection with new ids and names, keeping only the connections inside it", () => {
    const doc = flow(
      [block("trigger", "start"), block("http", "http1", { url: "https://api.example.com" }), block("output", "result1")],
      ["start>http1", "http1>result1"],
    );
    const picked = doc.nodes.slice(1);

    const copy = cloneSelection(picked, doc.edges, doc.nodes.map((node) => node.name), { x: 40, y: 40 });

    expect(copy.nodes.map((node) => node.name)).toEqual(["http2", "result2"]);
    expect(copy.nodes[0].position).toEqual({ x: 40, y: 40 });
    expect(copy.nodes[0].config).toEqual(picked[0].config);
    expect(copy.nodes[0].config).not.toBe(picked[0].config);
    expect(copy.edges).toHaveLength(1);
    expect(copy.edges[0]).toMatchObject({ source: copy.nodes[0].id, target: copy.nodes[1].id, sourceHandle: "out" });
    expect(copy.nodes.map((node) => node.id)).not.toContain("http1");
  });

  it("copies a whole flow under a new id", () => {
    const doc = flow([block("trigger", "start")]);
    const copy = copyFlow(doc, "Copy of test", new Date("2026-10-06T00:00:00Z"));
    expect(copy.id).not.toBe(doc.id);
    expect(copy).toMatchObject({ name: "Copy of test", updatedAt: "2026-10-06T00:00:00.000Z" });
    expect(copy.nodes).toEqual(doc.nodes);
    expect(copy.nodes).not.toBe(doc.nodes);
  });

  it("creates a connection with its own id", () => {
    expect(createEdge("a", "true", "b")).toMatchObject({ source: "a", sourceHandle: "true", target: "b" });
  });
});
