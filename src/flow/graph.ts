import type { FlowEdge, FlowNode } from "./schema";

// Questions about the shape of a flow: what leads where, what runs before
// what, and whether there is a loop. Pure functions over nodes and edges.

type Link = Pick<FlowEdge, "source" | "target">;

export function outgoingBySource<E extends Link>(edges: readonly E[]): Map<string, E[]> {
  const map = new Map<string, E[]>();
  for (const edge of edges) {
    const list = map.get(edge.source);
    if (list) list.push(edge);
    else map.set(edge.source, [edge]);
  }
  return map;
}

export function incomingByTarget<E extends Link>(edges: readonly E[]): Map<string, E[]> {
  const map = new Map<string, E[]>();
  for (const edge of edges) {
    const list = map.get(edge.target);
    if (list) list.push(edge);
    else map.set(edge.target, [edge]);
  }
  return map;
}

/** Every block that can be reached by following connections forward from `starts`. */
export function reachableFrom(starts: Iterable<string>, edges: readonly Link[]): Set<string> {
  const outgoing = outgoingBySource(edges);
  const seen = new Set<string>(starts);
  const queue = [...seen];
  while (queue.length > 0) {
    const id = queue.pop()!;
    for (const edge of outgoing.get(id) ?? []) {
      if (!seen.has(edge.target)) {
        seen.add(edge.target);
        queue.push(edge.target);
      }
    }
  }
  return seen;
}

/** Every block that runs before `nodeId`: its parents, their parents, and so on. */
export function ancestorsOf(nodeId: string, edges: readonly Link[]): Set<string> {
  const incoming = incomingByTarget(edges);
  const seen = new Set<string>();
  const queue = [nodeId];
  while (queue.length > 0) {
    const id = queue.pop()!;
    for (const edge of incoming.get(id) ?? []) {
      if (!seen.has(edge.source)) {
        seen.add(edge.source);
        queue.push(edge.source);
      }
    }
  }
  return seen;
}

/**
 * Would connecting source → target close a loop? It would if the source can
 * already be reached from the target. A block connected to itself counts.
 */
export function wouldCreateCycle(edges: readonly Link[], source: string, target: string): boolean {
  if (source === target) return true;
  return reachableFrom([target], edges).has(source);
}

/**
 * An order in which every block comes after the blocks that feed it
 * (Kahn's algorithm). Blocks caught in a loop are left out, so a result
 * shorter than the node list means the flow has a loop.
 */
export function topologicalOrder(nodes: readonly Pick<FlowNode, "id">[], edges: readonly Link[]): string[] {
  const waitingOn = new Map<string, number>(nodes.map((node) => [node.id, 0]));
  for (const edge of edges) {
    if (waitingOn.has(edge.target) && waitingOn.has(edge.source)) {
      waitingOn.set(edge.target, waitingOn.get(edge.target)! + 1);
    }
  }
  const outgoing = outgoingBySource(edges);
  const ready = nodes.filter((node) => waitingOn.get(node.id) === 0).map((node) => node.id);
  const order: string[] = [];
  while (ready.length > 0) {
    const id = ready.shift()!;
    order.push(id);
    for (const edge of outgoing.get(id) ?? []) {
      const left = waitingOn.get(edge.target);
      if (left === undefined) continue;
      waitingOn.set(edge.target, left - 1);
      if (left - 1 === 0) ready.push(edge.target);
    }
  }
  return order;
}

/** The ids of the blocks that sit in a loop, or an empty list when there is none. */
export function nodesInCycles(nodes: readonly Pick<FlowNode, "id">[], edges: readonly Link[]): string[] {
  const ordered = new Set(topologicalOrder(nodes, edges));
  if (ordered.size === nodes.length) return [];
  // What Kahn's algorithm could not order is either in a loop or downstream of
  // one. Keep only the blocks that can reach themselves.
  const outgoing = outgoingBySource(edges);
  return nodes
    .map((node) => node.id)
    .filter((id) => !ordered.has(id))
    .filter((id) => {
      const next = (outgoing.get(id) ?? []).map((edge) => edge.target);
      return reachableFrom(next, edges).has(id);
    });
}
