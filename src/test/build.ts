import { defaultConfig } from "@/flow/catalog";
import { FLOW_VERSION, type ConfigOf, type FlowDocument, type FlowNode, type NodeType } from "@/flow/schema";

// Short ways to write a flow in a test. A block's id is its name, so a test
// reads like the flow it describes.

export function block<T extends NodeType>(type: T, name: string, config: Partial<ConfigOf<T>> = {}): FlowNode {
  return {
    id: name,
    type,
    name,
    position: { x: 0, y: 0 },
    config: { ...defaultConfig(type), ...config },
  } as unknown as FlowNode;
}

/** A link is "a>b", or "a:true>b" to leave from a named side of a Condition. */
export function flow(nodes: FlowNode[], links: string[] = []): FlowDocument {
  return {
    version: FLOW_VERSION,
    id: "test-flow",
    name: "Test flow",
    description: "",
    updatedAt: "2026-10-05T00:00:00.000Z",
    nodes,
    edges: links.map((link) => {
      const [from, target] = link.split(">");
      const [source, sourceHandle = "out"] = from.split(":");
      return { id: link, source, sourceHandle, target };
    }),
  };
}
