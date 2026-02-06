import { CATALOG } from "./catalog";
import { wouldCreateCycle } from "./graph";
import type { FlowEdge, FlowNode } from "./schema";

// The rules for joining two blocks. The canvas asks this while you drag a
// connection (to show whether it may land) and the store asks again before it
// adds one, so no other path can create a connection that breaks the rules.

export type ConnectionCheck = { ok: true } | { ok: false; reason: string };

export function canConnect(
  nodes: readonly FlowNode[],
  edges: readonly FlowEdge[],
  source: string,
  sourceHandle: string,
  target: string,
): ConnectionCheck {
  const from = nodes.find((node) => node.id === source);
  const to = nodes.find((node) => node.id === target);
  if (!from || !to) return { ok: false, reason: "One of the blocks is no longer there." };
  if (source === target) return { ok: false, reason: "A block cannot connect to itself." };
  if (!CATALOG[to.type].hasInput) return { ok: false, reason: `Nothing can lead into a ${CATALOG[to.type].title}.` };
  if (!CATALOG[from.type].outputs.some((handle) => handle.id === sourceHandle)) {
    return { ok: false, reason: `The ${CATALOG[from.type].title} block has no such output.` };
  }
  const exists = edges.some(
    (edge) => edge.source === source && edge.sourceHandle === sourceHandle && edge.target === target,
  );
  if (exists) return { ok: false, reason: "These blocks are already connected." };
  if (wouldCreateCycle(edges, source, target)) {
    return { ok: false, reason: "That would make a loop, and the flow would never finish." };
  }
  return { ok: true };
}

const STEP_X = 300;
const STEP_Y = 140;
const GRID = 20;

const snap = (value: number) => Math.round(value / GRID) * GRID;

/** A free spot for a new block: right of `anchor`, or right of everything. */
export function placeNear(
  nodes: readonly FlowNode[],
  anchor: FlowNode | undefined,
): { x: number; y: number } {
  let spot: { x: number; y: number };
  if (anchor) {
    spot = { x: anchor.position.x + STEP_X, y: anchor.position.y };
  } else if (nodes.length > 0) {
    const rightmost = nodes.reduce((best, node) => (node.position.x > best.position.x ? node : best));
    spot = { x: rightmost.position.x + STEP_X, y: rightmost.position.y };
  } else {
    spot = { x: 80, y: 160 };
  }
  // Step down until nothing sits on the spot.
  const taken = (at: { x: number; y: number }) =>
    nodes.some((node) => Math.abs(node.position.x - at.x) < 200 && Math.abs(node.position.y - at.y) < 100);
  while (taken(spot)) spot = { x: spot.x, y: spot.y + STEP_Y };
  return { x: snap(spot.x), y: snap(spot.y) };
}

/** The output of `node` a new block should hang off: the first one not yet used. */
export function freeOutput(node: FlowNode, edges: readonly FlowEdge[]): string | null {
  const outputs = CATALOG[node.type].outputs;
  if (outputs.length === 0) return null;
  const used = new Set(edges.filter((edge) => edge.source === node.id).map((edge) => edge.sourceHandle));
  return (outputs.find((handle) => !used.has(handle.id)) ?? outputs[0]).id;
}
