import { z } from "zod";

// The saved shape of a flow. Everything that enters the app from outside
// (browser storage, an imported file, a shared link, a template) is parsed
// with these schemas first, so the rest of the code can trust its input.

export const FLOW_VERSION = 1;

export const NODE_TYPES = ["trigger", "http", "condition", "set", "filter", "ai", "delay", "output"] as const;
export type NodeType = (typeof NODE_TYPES)[number];

export const OPERATORS = [
  "equals",
  "notEquals",
  "greaterThan",
  "greaterOrEqual",
  "lessThan",
  "lessOrEqual",
  "contains",
  "notContains",
  "startsWith",
  "endsWith",
  "isEmpty",
  "isNotEmpty",
] as const;
export type Operator = (typeof OPERATORS)[number];

/** Operators that only look at the left side. */
export const UNARY_OPERATORS: readonly Operator[] = ["isEmpty", "isNotEmpty"];

export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export const MAX_DELAY_MS = 60_000;
export const MAX_TIMEOUT_MS = 30_000;

const keyValue = z.object({ key: z.string(), value: z.string() });
export type KeyValue = z.infer<typeof keyValue>;

const triggerConfig = z.object({
  /** JSON text. Kept as text so a half-typed value can still be saved. */
  payload: z.string().default("{}"),
});

const httpConfig = z.object({
  method: z.enum(HTTP_METHODS).default("GET"),
  url: z.string().default(""),
  query: z.array(keyValue).default([]),
  headers: z.array(keyValue).default([]),
  body: z.string().default(""),
  /** Treat a 4xx or 5xx answer as a failed step. */
  failOnError: z.boolean().default(true),
  timeoutMs: z.number().int().min(1000).max(MAX_TIMEOUT_MS).default(10_000),
  /** "server" sends the call through /api/relay for APIs that refuse browsers. */
  via: z.enum(["browser", "server"]).default("browser"),
});

const conditionConfig = z.object({
  left: z.string().default(""),
  operator: z.enum(OPERATORS).default("equals"),
  right: z.string().default(""),
});

const setConfig = z.object({
  fields: z.array(keyValue).default([]),
});

const filterConfig = z.object({
  /** A reference to the list to filter, such as {{ steps.getRepos.body }}. */
  list: z.string().default(""),
  left: z.string().default(""),
  operator: z.enum(OPERATORS).default("equals"),
  right: z.string().default(""),
});

const aiConfig = z.object({
  system: z.string().default(""),
  prompt: z.string().default(""),
  /** Empty means: use the model chosen in Settings. */
  model: z.string().default(""),
  temperature: z.number().min(0).max(2).default(0.2),
  /** Ask the model for JSON and parse its reply. */
  json: z.boolean().default(false),
  /** Returned, labelled as a sample, when no key is set. */
  sample: z.string().default(""),
});

const delayConfig = z.object({
  ms: z.number().int().min(0).max(MAX_DELAY_MS).default(1000),
});

const outputConfig = z.object({
  /** Empty means: pass the incoming data through unchanged. */
  value: z.string().default(""),
});

export const CONFIG_SCHEMAS = {
  trigger: triggerConfig,
  http: httpConfig,
  condition: conditionConfig,
  set: setConfig,
  filter: filterConfig,
  ai: aiConfig,
  delay: delayConfig,
  output: outputConfig,
} as const;

export type ConfigOf<T extends NodeType> = z.infer<(typeof CONFIG_SCHEMAS)[T]>;

const position = z.object({ x: z.number(), y: z.number() });

/** A name is used in references ({{ steps.name }}), so it must be a plain word. */
export const NODE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

const nodeBase = {
  id: z.string().min(1),
  name: z.string().min(1).max(40),
  position,
};

const flowNode = z.discriminatedUnion("type", [
  z.object({ ...nodeBase, type: z.literal("trigger"), config: triggerConfig }),
  z.object({ ...nodeBase, type: z.literal("http"), config: httpConfig }),
  z.object({ ...nodeBase, type: z.literal("condition"), config: conditionConfig }),
  z.object({ ...nodeBase, type: z.literal("set"), config: setConfig }),
  z.object({ ...nodeBase, type: z.literal("filter"), config: filterConfig }),
  z.object({ ...nodeBase, type: z.literal("ai"), config: aiConfig }),
  z.object({ ...nodeBase, type: z.literal("delay"), config: delayConfig }),
  z.object({ ...nodeBase, type: z.literal("output"), config: outputConfig }),
]);
export type FlowNode = z.infer<typeof flowNode>;
export type NodeOf<T extends NodeType> = Extract<FlowNode, { type: T }>;

const flowEdge = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  /** "out" for most blocks; "true" or "false" on a Condition. */
  sourceHandle: z.string().default("out"),
  target: z.string().min(1),
});
export type FlowEdge = z.infer<typeof flowEdge>;

export const flowDocumentSchema = z.object({
  version: z.literal(FLOW_VERSION),
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  description: z.string().max(400).default(""),
  updatedAt: z.string(),
  nodes: z.array(flowNode).max(500),
  edges: z.array(flowEdge).max(2000),
});
export type FlowDocument = z.infer<typeof flowDocumentSchema>;

export type ParseResult = { ok: true; flow: FlowDocument } | { ok: false; error: string };

/**
 * Turn unknown data into a flow, or say in plain words why it is not one.
 * Beyond the shape, this also refuses connections to blocks that do not exist
 * and repeated ids, which the schema alone cannot see.
 */
export function parseFlow(data: unknown): ParseResult {
  const parsed = flowDocumentSchema.safeParse(data);
  if (!parsed.success) {
    const version = (data as { version?: unknown } | null)?.version;
    if (typeof version === "number" && version > FLOW_VERSION) {
      return { ok: false, error: "This flow was made with a newer version of Flowboard." };
    }
    return { ok: false, error: `This is not a valid flow file. ${z.prettifyError(parsed.error)}` };
  }
  const flow = parsed.data;

  const ids = new Set<string>();
  for (const node of flow.nodes) {
    if (ids.has(node.id)) return { ok: false, error: `Two blocks share the id "${node.id}".` };
    ids.add(node.id);
  }
  const edgeIds = new Set<string>();
  for (const edge of flow.edges) {
    if (edgeIds.has(edge.id)) return { ok: false, error: `Two connections share the id "${edge.id}".` };
    edgeIds.add(edge.id);
    if (!ids.has(edge.source) || !ids.has(edge.target)) {
      return { ok: false, error: "A connection points at a block that is not in the flow." };
    }
  }
  return { ok: true, flow };
}
