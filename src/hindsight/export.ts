import type { Json } from "@/engine/reference";
import type { FlowEdge, FlowNode } from "@/flow/schema";
import type { RunState, StepState } from "@/store/runSlice";

// The last run of a flow written out so another program can read it: which
// blocks there were, how they were joined, and for each block that ran when it
// began, how long it took, and the data it was given and gave back. This is
// what Hindsight (an observer for agents) is sent when the "Open in Hindsight"
// button in the Run panel is pressed.
//
// What a block is set up to do (its URL, its headers, its prompt) is NOT
// written out. Headers can hold keys. Only the block's name and kind are, and
// the data that passed through it, which is what the Run panel shows.

export const ENVELOPE_FORMAT = "hindsight/run";
export const ENVELOPE_VERSION = 1;

/** The most one piece of data may weigh once written out. */
const MAX_PIECE = 20_000;

function limited(value: Json | undefined): Json | null {
  if (value === undefined || value === null) return null;
  const text = JSON.stringify(value);
  return text.length > MAX_PIECE ? { truncated: true, characters: text.length } : value;
}

export type FlowboardStep = {
  /** The block's id. */
  id: string;
  status: StepState["status"];
  /** When the block began, in milliseconds since 1970. */
  startedAt: number | null;
  ms: number | null;
  input: Json | null;
  output: Json | null;
  /** Which side a Condition took. */
  branch: string | null;
  note: string | null;
  error: { code: string; message: string } | null;
  /** Why a block did not run. */
  reason: string | null;
};

export type FlowboardRun = {
  flow: {
    name: string;
    blocks: { id: string; name: string; type: string }[];
    connections: { from: string; to: string; side: string }[];
  };
  run: {
    status: RunState["status"];
    startedAt: number | null;
    ms: number | null;
    /** The blocks in the order the run reached them. */
    steps: FlowboardStep[];
  };
};

export type FlowboardEnvelope = {
  format: typeof ENVELOPE_FORMAT;
  version: typeof ENVELOPE_VERSION;
  app: "flowboard";
  data: FlowboardRun;
};

export function exportRun(flow: { name: string; nodes: FlowNode[]; edges: FlowEdge[] }, run: RunState): FlowboardEnvelope {
  return {
    format: ENVELOPE_FORMAT,
    version: ENVELOPE_VERSION,
    app: "flowboard",
    data: {
      flow: {
        name: flow.name,
        // Only what a block is called and what kind it is. Never its settings.
        blocks: flow.nodes.map((node) => ({ id: node.id, name: node.name, type: node.type })),
        connections: flow.edges.map((edge) => ({ from: edge.source, to: edge.target, side: edge.sourceHandle })),
      },
      run: {
        status: run.status,
        startedAt: run.startedAt,
        ms: run.ms,
        steps: run.order.map((id) => {
          const step = run.steps[id];
          return {
            id,
            status: step.status,
            startedAt: step.startedAt ?? null,
            ms: step.ms ?? null,
            input: limited(step.input),
            output: limited(step.output),
            branch: step.branch ?? null,
            note: step.note ?? null,
            // The failure's message, not its detail: a detail can hold a whole reply.
            error: step.error ? { code: step.error.code, message: step.error.message } : null,
            reason: step.reason ?? null,
          };
        }),
      },
    },
  };
}
