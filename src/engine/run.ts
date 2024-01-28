import { ancestorsOf, incomingByTarget, nodesInCycles, outgoingBySource, reachableFrom } from "@/flow/graph";
import type { FlowDocument, FlowEdge, FlowNode } from "@/flow/schema";
import { EXECUTORS } from "./executors";
import type { Json, Scope } from "./reference";
import {
  StepError,
  sleep as realSleep,
  type AiSettings,
  type ExecContext,
  type ExecResult,
  type ExecutorMap,
  type RunEvent,
  type RunResult,
  type RunSummary,
  type SkipReason,
  type StepFailure,
} from "./types";

// The scheduler. It knows nothing about React or the screen: it takes a flow,
// runs it, and reports what happens through `onEvent`.
//
// The rule it follows:
//   A block is ready once every connection into it is settled. A connection is
//   settled when its source finished (it then either delivered data or, on the
//   untaken side of a Condition, did not) or was skipped. A ready block runs if
//   at least one connection delivered; otherwise it is skipped too.
//
// Blocks that are ready at the same time run together, up to `concurrency`.

export type RunOptions = {
  onEvent?: (event: RunEvent) => void;
  /** Abort this to stop the run. */
  signal?: AbortSignal;
  /** How many blocks may run at once. */
  concurrency?: number;
  ai?: AiSettings | null;
  relayUrl?: string;
  // The rest exist so tests can swap in stand-ins.
  executors?: ExecutorMap;
  fetch?: typeof fetch;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  now?: () => number;
};

type NodeState = "waiting" | "running" | "done" | "failed" | "skipped" | "cancelled";
type EdgeState = "pending" | "delivered" | "dead";

function toFailure(error: unknown): StepFailure {
  if (error instanceof StepError) return { code: error.code, message: error.message, detail: error.detail };
  // Anything else is a bug in a block or an unexpected answer. Still show it.
  return { code: "unexpected", message: error instanceof Error ? error.message : String(error) };
}

export async function runFlow(flow: FlowDocument, options: RunOptions = {}): Promise<RunSummary> {
  const emit = options.onEvent ?? (() => {});
  const now = options.now ?? (() => Date.now());
  const executors = options.executors ?? EXECUTORS;
  const limit = Math.max(1, options.concurrency ?? 4);

  // One switch for the whole run. Stop from outside flips it, and so does a
  // failed step, so everything still running is told to give up.
  const controller = new AbortController();
  const stopFromOutside = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  else options.signal?.addEventListener("abort", stopFromOutside, { once: true });

  const byId = new Map<string, FlowNode>(flow.nodes.map((node) => [node.id, node]));
  const incoming = incomingByTarget(flow.edges);
  const outgoing = outgoingBySource(flow.edges);
  const nodeState = new Map<string, NodeState>(flow.nodes.map((node) => [node.id, "waiting"]));
  const edgeState = new Map<string, EdgeState>(flow.edges.map((edge) => [edge.id, "pending"]));
  const outputs = new Map<string, Json>();
  const running = new Map<string, Promise<void>>();
  const triggers = flow.nodes.filter((node) => node.type === "trigger");
  let failed = false;

  const startedAt = now();
  emit({ type: "run-started", at: startedAt });

  const settle = (nodeId: string, delivers: (edge: FlowEdge) => boolean) => {
    for (const edge of outgoing.get(nodeId) ?? []) {
      edgeState.set(edge.id, delivers(edge) ? "delivered" : "dead");
    }
  };

  const skip = (nodeId: string, reason: SkipReason) => {
    nodeState.set(nodeId, "skipped");
    settle(nodeId, () => false);
    emit({ type: "node-skipped", nodeId, reason });
  };

  // Blocks that can never run are settled before anything starts.
  const reachable = reachableFrom(triggers.map((node) => node.id), flow.edges);
  const looping = new Set(nodesInCycles(flow.nodes, flow.edges));
  for (const node of flow.nodes) {
    if (looping.has(node.id)) skip(node.id, "in-loop");
    else if (!reachable.has(node.id)) skip(node.id, "not-connected");
  }

  const start = (node: FlowNode, delivering: FlowEdge[]) => {
    // What the block sees as `input`: its parent's output, or with several
    // parents an object keyed by their names.
    let input: Json = null;
    if (delivering.length === 1) {
      input = outputs.get(delivering[0].source) ?? null;
    } else if (delivering.length > 1) {
      input = Object.fromEntries(
        delivering.map((edge) => [byId.get(edge.source)!.name, outputs.get(edge.source) ?? null]),
      );
    }

    // `steps` holds only the blocks that run before this one. Blocks on a
    // parallel branch are left out even if they happen to have finished, so a
    // run gives the same answer every time.
    const steps: Record<string, Json> = {};
    for (const id of ancestorsOf(node.id, flow.edges)) {
      if (outputs.has(id)) steps[byId.get(id)!.name] = outputs.get(id)!;
    }
    const triggerOutput = triggers.length > 0 ? outputs.get(triggers[0].id) : undefined;
    const scope: Scope = { steps, input, trigger: triggerOutput ?? null };

    const context: ExecContext = {
      scope,
      signal: controller.signal,
      fetch: options.fetch ?? ((...args) => fetch(...args)),
      ai: options.ai ?? null,
      relayUrl: options.relayUrl ?? "/api/relay",
      sleep: options.sleep ?? realSleep,
    };

    nodeState.set(node.id, "running");
    const began = now();
    emit({ type: "node-started", nodeId: node.id, input, at: began });

    const execute = executors[node.type] as (config: FlowNode["config"], context: ExecContext) => Promise<ExecResult>;
    const task = (async () => {
      try {
        const result = await execute(node.config, context);
        if (controller.signal.aborted) {
          // The run ended while this block was finishing. Its result is not used.
          nodeState.set(node.id, "cancelled");
          settle(node.id, () => false);
          emit({ type: "node-cancelled", nodeId: node.id, ms: now() - began });
          return;
        }
        outputs.set(node.id, result.output);
        nodeState.set(node.id, "done");
        settle(node.id, (edge) => result.branch === undefined || edge.sourceHandle === result.branch);
        emit({
          type: "node-finished",
          nodeId: node.id,
          output: result.output,
          ...(result.branch ? { branch: result.branch } : {}),
          ...(result.note ? { note: result.note } : {}),
          ms: now() - began,
        });
      } catch (error) {
        settle(node.id, () => false);
        if (controller.signal.aborted) {
          nodeState.set(node.id, "cancelled");
          emit({ type: "node-cancelled", nodeId: node.id, ms: now() - began });
        } else {
          nodeState.set(node.id, "failed");
          failed = true;
          emit({ type: "node-failed", nodeId: node.id, error: toFailure(error), ms: now() - began });
          controller.abort();
        }
      } finally {
        running.delete(node.id);
      }
    })();
    running.set(node.id, task);
  };

  const schedule = () => {
    // Skipping a block can make the next one ready, so go round until nothing changes.
    let changed = true;
    while (changed) {
      changed = false;
      for (const node of flow.nodes) {
        if (nodeState.get(node.id) !== "waiting") continue;
        const inputs = incoming.get(node.id) ?? [];
        if (inputs.some((edge) => edgeState.get(edge.id) === "pending")) continue;
        const delivering = inputs.filter((edge) => edgeState.get(edge.id) === "delivered");
        if (node.type !== "trigger" && delivering.length === 0) {
          skip(node.id, "no-data");
          changed = true;
        } else if (running.size < limit) {
          start(node, delivering);
        }
      }
    }
  };

  if (!controller.signal.aborted) schedule();
  while (running.size > 0) {
    await Promise.race(running.values());
    if (!controller.signal.aborted) schedule();
  }
  options.signal?.removeEventListener("abort", stopFromOutside);

  // Whatever is still waiting never got its turn.
  for (const node of flow.nodes) {
    if (nodeState.get(node.id) === "waiting") skip(node.id, "run-ended");
  }

  const results: RunResult[] = flow.nodes
    .filter((node) => node.type === "output" && nodeState.get(node.id) === "done")
    .map((node) => ({ nodeId: node.id, name: node.name, value: outputs.get(node.id) ?? null }));

  const status = failed ? "failed" : controller.signal.aborted ? "stopped" : "succeeded";
  const ms = now() - startedAt;
  emit({ type: "run-finished", status, ms, results });
  return { status, ms, results };
}
