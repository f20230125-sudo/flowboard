import { CATALOG } from "./catalog";
import { incomingByTarget, topologicalOrder } from "./graph";
import type { FlowEdge, FlowNode } from "./schema";

// "Tidy up": line the blocks up in columns, left to right, in the order they
// run. A pure function from blocks and connections to positions.
//
// 1. Column. A block sits one column right of the furthest block feeding it,
//    so every connection points to the right.
// 2. Row. A block sits level with the blocks feeding it. Blocks that want the
//    same place are spread around it, the True side of a Condition above the
//    False side.
// 3. Blocks with no connections, or caught in a loop, are parked in a row
//    underneath.
//
// The first block keeps its place, so the flow does not jump away.

export type Size = { width: number; height: number };
export type Positions = Record<string, { x: number; y: number }>;

const GRID = 20;
const COLUMN_STEP = 280;
const ROW_GAP = 40;
const DEFAULT_HEIGHT = 80;

const snap = (value: number) => Math.round(value / GRID) * GRID;
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

/** Blocks next to each other in a column, placed as one group around where they want to be. */
type Group = { ids: string[]; wishes: number[] };
const top = (group: Group) => mean(group.wishes) - (group.ids.length - 1) / 2;
const bottom = (group: Group) => top(group) + group.ids.length - 1;

export function tidyLayout(
  nodes: readonly FlowNode[],
  edges: readonly FlowEdge[],
  sizes: Record<string, Size> = {},
): Positions {
  if (nodes.length === 0) return {};

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const incoming = incomingByTarget(edges);
  const connected = new Set(edges.flatMap((edge) => [edge.source, edge.target]));
  // Kahn's algorithm leaves out blocks in a loop and everything after them.
  const ordered = topologicalOrder(nodes, edges).filter((id) => connected.has(id));
  const inOrder = new Set(ordered);
  const parked = nodes
    .filter((node) => !inOrder.has(node.id))
    .sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y);

  // 1. Columns.
  const column = new Map<string, number>();
  for (const id of ordered) {
    const feeding = (incoming.get(id) ?? []).filter((edge) => column.has(edge.source));
    column.set(id, feeding.length === 0 ? 0 : Math.max(...feeding.map((edge) => column.get(edge.source)!)) + 1);
  }
  const columns: string[][] = [];
  for (const id of ordered) (columns[column.get(id)!] ??= []).push(id);

  // 2. Rows, a column at a time, so the blocks feeding a block are placed first.
  const row = new Map<string, number>();
  /** Which output of its source a block hangs off: 0 for True, 1 for False. */
  const side = (id: string) => {
    const edge = (incoming.get(id) ?? [])[0];
    const source = edge && byId.get(edge.source);
    return source ? CATALOG[source.type].outputs.findIndex((output) => output.id === edge.sourceHandle) : 0;
  };

  columns.forEach((members, index) => {
    const wish = new Map<string, number>();
    if (index === 0) {
      // Starting blocks have nothing to line up with: keep their order, top to bottom.
      [...members]
        .sort((a, b) => byId.get(a)!.position.y - byId.get(b)!.position.y)
        .forEach((id, at) => wish.set(id, at));
    } else {
      for (const id of members) {
        wish.set(id, mean((incoming.get(id) ?? []).filter((edge) => row.has(edge.source)).map((edge) => row.get(edge.source)!)));
      }
    }

    const sorted = [...members].sort(
      (a, b) =>
        wish.get(a)! - wish.get(b)! || side(a) - side(b) || byId.get(a)!.position.y - byId.get(b)!.position.y,
    );

    // Give each block the row it wants. Where two would overlap, join them
    // into one group centred on what its blocks wanted, and check again.
    const groups: Group[] = [];
    for (const id of sorted) {
      let group: Group = { ids: [id], wishes: [wish.get(id)!] };
      while (groups.length > 0 && bottom(groups[groups.length - 1]) + 1 > top(group)) {
        const above = groups.pop()!;
        group = { ids: [...above.ids, ...group.ids], wishes: [...above.wishes, ...group.wishes] };
      }
      groups.push(group);
    }
    for (const group of groups) group.ids.forEach((id, at) => row.set(id, top(group) + at));
  });

  // 3. The rest goes in a row underneath, with some air above it.
  const lowest = ordered.length === 0 ? null : Math.max(...ordered.map((id) => row.get(id)!));
  parked.forEach((node, at) => {
    column.set(node.id, at);
    row.set(node.id, lowest === null ? 0 : lowest + 1.5);
  });

  // Rows are as far apart as the tallest block needs. A multiple of two grid
  // steps, so half a row is still on the grid.
  const tallest = Math.max(...nodes.map((node) => sizes[node.id]?.height ?? DEFAULT_HEIGHT));
  const rowStep = Math.ceil((tallest + ROW_GAP) / (2 * GRID)) * (2 * GRID);

  const anchor = byId.get(ordered[0] ?? parked[0].id)!;
  const shiftX = anchor.position.x - column.get(anchor.id)! * COLUMN_STEP;
  const shiftY = anchor.position.y - row.get(anchor.id)! * rowStep;

  const positions: Positions = {};
  for (const node of nodes) {
    positions[node.id] = {
      x: snap(shiftX + column.get(node.id)! * COLUMN_STEP),
      y: snap(shiftY + row.get(node.id)! * rowStep),
    };
  }
  return positions;
}
