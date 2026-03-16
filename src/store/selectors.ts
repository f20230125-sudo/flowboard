import { createSelector, lruMemoize } from "@reduxjs/toolkit";
import type { Edge, Node } from "@xyflow/react";
import { FLOW_VERSION, type FlowDocument, type FlowEdge, type FlowNode } from "@/flow/schema";
import { validateFlow, type Problem } from "@/flow/validate";
import { toAiSettings } from "@/settings/ai";
import type { FlowState } from "./flowSlice";
import type { RootState } from "./store";

// Everything components read from the store goes through these. The ones
// built with createSelector only recompute when their inputs change.

export type CanvasNode = Node<{ node: FlowNode }, "block">;
export type CanvasEdge = Edge<Record<string, never>, "flow">;

export const selectFlowStatus = (state: RootState) => state.flow.status;
export const selectFlowId = (state: RootState) => state.flow.id;
export const selectFlowName = (state: RootState) => state.flow.present.name;
export const selectFlowDescription = (state: RootState) => state.flow.present.description;
export const selectNodes = (state: RootState) => state.flow.present.nodes;
export const selectEdges = (state: RootState) => state.flow.present.edges;
const selectMeasured = (state: RootState) => state.flow.view.measured;
export const selectSelectedNodeIds = (state: RootState) => state.flow.view.selectedNodeIds;
export const selectSelectedEdgeIds = (state: RootState) => state.flow.view.selectedEdgeIds;

export const selectCanUndo = (state: RootState) => state.flow.past.length > 0;
export const selectCanRedo = (state: RootState) => state.flow.future.length > 0;
export const selectUndoLabel = (state: RootState) => state.flow.past.at(-1)?.label ?? null;
export const selectRedoLabel = (state: RootState) => state.flow.future.at(-1)?.label ?? null;

export type SaveStatus = "saved" | "saving" | "failed";
export const selectSaveStatus = (state: RootState): SaveStatus =>
  state.flow.saveError ? "failed" : state.flow.revision === state.flow.savedRevision ? "saved" : "saving";
export const selectSaveError = (state: RootState) => state.flow.saveError;

/** The flow as it is saved and exported. `updatedAt` is stamped by the caller. */
export function toDocument(flow: FlowState, updatedAt: Date): FlowDocument {
  return {
    version: FLOW_VERSION,
    id: flow.id ?? "",
    name: flow.present.name,
    description: flow.present.description,
    updatedAt: updatedAt.toISOString(),
    nodes: flow.present.nodes,
    edges: flow.present.edges,
  };
}

// The canvas library compares block objects by identity, so a block that did
// not change must come back as the very same object. This keeps the last
// object made for each block and reuses it while its inputs are the same.
type Cached = { node: FlowNode; measured: unknown; selected: boolean; value: CanvasNode };
const canvasNodeCache = new Map<string, Cached>();

export const selectCanvasNodes = createSelector(
  [selectNodes, selectMeasured, selectSelectedNodeIds],
  (nodes, measured, selectedIds): CanvasNode[] => {
    const selected = new Set(selectedIds);
    const result = nodes.map((node) => {
      const size = measured[node.id];
      const isSelected = selected.has(node.id);
      const hit = canvasNodeCache.get(node.id);
      if (hit && hit.node === node && hit.measured === size && hit.selected === isSelected) return hit.value;

      const value: CanvasNode = {
        id: node.id,
        type: "block",
        position: node.position,
        data: { node },
        selected: isSelected,
        // Without its measured size the library hides a block until it has
        // measured it again, so the size is handed back every time.
        ...(size ? { measured: size } : {}),
      };
      canvasNodeCache.set(node.id, { node, measured: size, selected: isSelected, value });
      return value;
    });

    if (canvasNodeCache.size > nodes.length) {
      const alive = new Set(nodes.map((node) => node.id));
      for (const id of canvasNodeCache.keys()) if (!alive.has(id)) canvasNodeCache.delete(id);
    }
    return result;
  },
);

export const selectCanvasEdges = createSelector(
  [selectEdges, selectSelectedEdgeIds],
  (edges, selectedIds): CanvasEdge[] => {
    const selected = new Set(selectedIds);
    return edges.map((edge: FlowEdge) => ({
      id: edge.id,
      type: "flow",
      source: edge.source,
      sourceHandle: edge.sourceHandle,
      target: edge.target,
      selected: selected.has(edge.id),
    }));
  },
);

export const selectSelectedNodes = createSelector([selectNodes, selectSelectedNodeIds], (nodes, ids) => {
  const selected = new Set(ids);
  return nodes.filter((node) => selected.has(node.id));
});

/** The one selected block, or null when none or several are selected. */
export const selectSelectedNode = createSelector([selectSelectedNodes], (nodes) =>
  nodes.length === 1 ? nodes[0] : null,
);

/**
 * True when two lists of blocks differ only in where the blocks sit. Moving a
 * block cannot create or fix a problem, so the checks need not run again.
 */
function sameApartFromPosition(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((node: FlowNode, index) => {
    const other = b[index] as FlowNode;
    return (
      node === other ||
      ("config" in node &&
        "config" in other &&
        node.id === other.id &&
        node.type === other.type &&
        node.name === other.name &&
        node.config === other.config)
    );
  });
}

// Dragging a block changes the list of blocks sixty times a second. The
// comparison above lets the checks, and everything drawn from them, sit still
// while that happens.
export const selectProblems = createSelector(
  [selectNodes, selectEdges],
  (nodes, edges): Problem[] => validateFlow({ nodes, edges }),
  { memoize: lruMemoize, memoizeOptions: { equalityCheck: sameApartFromPosition } },
);

/** What a block shows about its own problems, as plain values that compare cheaply. */
export type ProblemBadge = { errors: number; warnings: number; text: string };
const NO_BADGE: ProblemBadge = { errors: 0, warnings: 0, text: "" };

export const selectProblemBadges = createSelector([selectProblems], (problems) => {
  const badges = new Map<string, ProblemBadge>();
  for (const problem of problems) {
    if (!problem.nodeId) continue;
    const badge = badges.get(problem.nodeId) ?? { errors: 0, warnings: 0, text: "" };
    if (problem.level === "error") badge.errors += 1;
    else badge.warnings += 1;
    badge.text = [badge.text, problem.message].filter(Boolean).join("\n");
    badges.set(problem.nodeId, badge);
  }
  return badges;
});

/** One block's badge. The same object comes back until that block's problems change. */
export const selectProblemBadge = (state: RootState, nodeId: string): ProblemBadge =>
  selectProblemBadges(state).get(nodeId) ?? NO_BADGE;

export const selectProblemsByNode = createSelector([selectProblems], (problems) => {
  const byNode = new Map<string, Problem[]>();
  for (const problem of problems) {
    if (!problem.nodeId) continue;
    const list = byNode.get(problem.nodeId);
    if (list) list.push(problem);
    else byNode.set(problem.nodeId, [problem]);
  }
  return byNode;
});

// --- The last run ---------------------------------------------------------------

export const selectRunStatus = (state: RootState) => state.run.status;
export const selectIsRunning = (state: RootState) => state.run.status === "running";
export const selectRunSteps = (state: RootState) => state.run.steps;
export const selectRunOrder = (state: RootState) => state.run.order;
export const selectRunResults = (state: RootState) => state.run.results;
export const selectRunMs = (state: RootState) => state.run.ms;
export const selectOpenStepId = (state: RootState) => state.run.openStepId;
export const selectBottomTab = (state: RootState) => state.ui.bottomTab;
export const selectShortcutsOpen = (state: RootState) => state.ui.shortcutsOpen;

export const selectErrorCount = createSelector(
  [selectProblems],
  (problems) => problems.filter((problem) => problem.level === "error").length,
);

// --- Visitor settings -----------------------------------------------------------

export const selectAiConfig = (state: RootState) => state.settings.ai;
export const selectSettingsOpen = (state: RootState) => state.settings.open;
/** True when AI steps will call a real model instead of returning their sample. */
export const selectHasModel = createSelector([selectAiConfig], (config) => toAiSettings(config) !== null);
