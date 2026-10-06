import { describe, expect, it } from "vitest";
import { block, flow } from "@/test/build";
import { TEMPLATES } from "@/templates";
import { tidyLayout } from "./layout";
import type { FlowNode } from "./schema";

const at = (node: FlowNode, x: number, y: number): FlowNode => ({ ...node, position: { x, y } });

// With no measured sizes, rows are 120 apart and columns 280.
const ROW = 120;
const COLUMN = 280;

describe("tidying up a flow", () => {
  it("puts a chain on one line, left to right, and leaves the first block where it is", () => {
    const { nodes, edges } = flow(
      [at(block("trigger", "start"), 100, 60), at(block("http", "call"), 900, 400), at(block("output", "result"), 40, -300)],
      ["start>call", "call>result"],
    );
    expect(tidyLayout(nodes, edges)).toEqual({
      start: { x: 100, y: 60 },
      call: { x: 100 + COLUMN, y: 60 },
      result: { x: 100 + 2 * COLUMN, y: 60 },
    });
  });

  it("spreads the two sides of a Condition around it, True above False, and joins them again", () => {
    const { nodes, edges } = flow(
      [
        block("trigger", "start"),
        block("condition", "check"),
        // Listed False first, to show the order comes from the sides and not from the list.
        block("set", "no"),
        block("set", "yes"),
        block("output", "result"),
      ],
      ["start>check", "check:false>no", "check:true>yes", "yes>result", "no>result"],
    );
    const positions = tidyLayout(nodes, edges);
    expect(positions.check).toEqual({ x: COLUMN, y: 0 });
    expect(positions.yes).toEqual({ x: 2 * COLUMN, y: -ROW / 2 });
    expect(positions.no).toEqual({ x: 2 * COLUMN, y: ROW / 2 });
    expect(positions.result).toEqual({ x: 3 * COLUMN, y: 0 });
  });

  it("keeps a longer side level with the block it follows", () => {
    //  start → check ─true→ a → b ─┐
    //                └false→ c ────┴→ result
    const { nodes, edges } = flow(
      [block("trigger", "start"), block("condition", "check"), block("set", "a"), block("set", "b"), block("set", "c"), block("output", "result")],
      ["start>check", "check:true>a", "a>b", "check:false>c", "b>result", "c>result"],
    );
    const positions = tidyLayout(nodes, edges);
    expect(positions.b.y).toBe(positions.a.y);
    // The result waits for the longer side, so no connection points backwards.
    expect(positions.result.x).toBe(4 * COLUMN);
  });

  it("parks blocks with no connections in a row underneath", () => {
    const { nodes, edges } = flow(
      [block("trigger", "start"), block("output", "result"), at(block("delay", "later"), 500, 0), at(block("set", "spare"), 200, 0)],
      ["start>result"],
    );
    const positions = tidyLayout(nodes, edges);
    expect(positions.spare).toEqual({ x: 0, y: 1.5 * ROW });
    expect(positions.later).toEqual({ x: COLUMN, y: 1.5 * ROW });
  });

  it("makes rows taller when a block is tall", () => {
    const { nodes, edges } = flow(
      [block("trigger", "start"), block("set", "a"), block("set", "b")],
      ["start>a", "start>b"],
    );
    const positions = tidyLayout(nodes, edges, { start: { width: 240, height: 150 } });
    expect(positions.b.y - positions.a.y).toBe(200);
  });

  it("handles a lone block and an empty flow", () => {
    expect(tidyLayout([at(block("trigger", "start"), 80, 160)], [])).toEqual({ start: { x: 80, y: 160 } });
    expect(tidyLayout([], [])).toEqual({});
  });

  it("gives every block of every template its own place, with each connection pointing right", () => {
    for (const template of TEMPLATES) {
      const { nodes, edges } = template.flow;
      // Start from a pile: every block on the same spot.
      const positions = tidyLayout(nodes.map((node) => at(node, 0, 0)), edges);

      const places = Object.values(positions).map(({ x, y }) => `${x},${y}`);
      expect(new Set(places).size, template.id).toBe(nodes.length);
      for (const edge of edges) {
        expect(positions[edge.target].x, `${template.id}: ${edge.id}`).toBeGreaterThan(positions[edge.source].x);
      }
      for (const { x, y } of Object.values(positions)) {
        expect(x % 20 === 0 && y % 20 === 0, template.id).toBe(true);
      }
    }
  });
});
