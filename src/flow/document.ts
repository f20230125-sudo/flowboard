import { CATALOG, defaultConfig } from "./catalog";
import { FLOW_VERSION, type FlowDocument, type FlowEdge, type FlowNode, type NodeType } from "./schema";

// Making and copying the pieces of a flow.

export function createId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

/** The first of prefix1, prefix2, ... that no block uses yet. */
export function uniqueName(prefix: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  for (let number = 1; ; number += 1) {
    const name = `${prefix}${number}`;
    if (!used.has(name)) return name;
  }
}

export function createNode<T extends NodeType>(
  type: T,
  position: { x: number; y: number },
  takenNames: Iterable<string>,
): FlowNode {
  return {
    id: createId(),
    type,
    name: uniqueName(CATALOG[type].namePrefix, takenNames),
    position,
    config: defaultConfig(type),
  } as FlowNode;
}

export function createEdge(source: string, sourceHandle: string, target: string): FlowEdge {
  return { id: createId(), source, sourceHandle, target };
}

export function createFlow(name: string, now: Date = new Date()): FlowDocument {
  return {
    version: FLOW_VERSION,
    id: createId(),
    name,
    description: "",
    updatedAt: now.toISOString(),
    nodes: [createNode("trigger", { x: 80, y: 160 }, [])],
    edges: [],
  };
}

/**
 * Copies of the given blocks, with new ids and names, moved by `offset`, plus
 * copies of the connections that run between them. Used by paste and duplicate.
 */
export function cloneSelection(
  nodes: readonly FlowNode[],
  edges: readonly FlowEdge[],
  takenNames: Iterable<string>,
  offset: { x: number; y: number },
): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const names = new Set(takenNames);
  const newIdOf = new Map<string, string>();

  const copies = nodes.map((node) => {
    const name = uniqueName(CATALOG[node.type].namePrefix, names);
    names.add(name);
    const id = createId();
    newIdOf.set(node.id, id);
    return {
      ...structuredClone(node),
      id,
      name,
      position: { x: node.position.x + offset.x, y: node.position.y + offset.y },
    } as FlowNode;
  });

  const links = edges
    .filter((edge) => newIdOf.has(edge.source) && newIdOf.has(edge.target))
    .map((edge) => createEdge(newIdOf.get(edge.source)!, edge.sourceHandle, newIdOf.get(edge.target)!));

  return { nodes: copies, edges: links };
}

/** A copy of a whole flow under a new id, for "Duplicate" and for templates. */
export function copyFlow(flow: FlowDocument, name: string, now: Date = new Date()): FlowDocument {
  return { ...structuredClone(flow), id: createId(), name, updatedAt: now.toISOString() };
}
