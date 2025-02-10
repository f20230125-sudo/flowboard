import { createSlice, current, isDraft, type Draft, type PayloadAction } from "@reduxjs/toolkit";
import type { EdgeChange, NodeChange } from "@xyflow/react";
import { CATALOG } from "@/flow/catalog";
import { canConnect } from "@/flow/connect";
import { renameInConfig } from "@/flow/rename";
import type { FlowDocument, FlowEdge, FlowNode } from "@/flow/schema";

// The flow being edited, with its undo history.
//
// Undo works on snapshots: before a change, the document as it was is pushed
// onto `past`. Redux Toolkit's Immer keeps the unchanged parts shared between
// snapshots, so a hundred steps of history cost little more than one copy.
//
// What is undoable: blocks, connections, settings, names. What is not: which
// blocks are selected and how big they measure on screen. Those live in `view`.

export const HISTORY_LIMIT = 100;
/** Changes of the same kind closer together than this count as one step. */
export const MERGE_WINDOW_MS = 1000;

export type Snapshot = { name: string; description: string; nodes: FlowNode[]; edges: FlowEdge[] };

type HistoryEntry = {
  /** The document before the change. */
  snapshot: Snapshot;
  /** What the change was, for the Undo button's tooltip. */
  label: string;
  /** Changes with the same key merge into one step while they keep coming. */
  mergeKey: string | null;
  at: number;
};

type Size = { width: number; height: number };

export type FlowState = {
  id: string | null;
  status: "idle" | "loading" | "ready" | "missing";
  present: Snapshot;
  past: HistoryEntry[];
  future: HistoryEntry[];
  /** Goes up with every change to the document. Autosave watches it. */
  revision: number;
  savedRevision: number;
  saveError: string | null;
  view: {
    measured: Record<string, Size>;
    selectedNodeIds: string[];
    selectedEdgeIds: string[];
    dragging: boolean;
  };
};

const emptySnapshot = (): Snapshot => ({ name: "", description: "", nodes: [], edges: [] });
const emptyView = (): FlowState["view"] => ({ measured: {}, selectedNodeIds: [], selectedEdgeIds: [], dragging: false });

const initialState: FlowState = {
  id: null,
  status: "idle",
  present: emptySnapshot(),
  past: [],
  future: [],
  revision: 0,
  savedRevision: 0,
  saveError: null,
  view: emptyView(),
};

type Stamped<P = void> = PayloadAction<P, string, { at: number }>;

/** Every undoable action carries the time it happened, so reducers stay pure. */
const stamp = <P>(payload: P) => ({ payload, meta: { at: Date.now() } });
const stampOnly = () => ({ payload: undefined, meta: { at: Date.now() } });

/** A plain copy of something that may be an Immer draft. */
const plain = <T>(value: T): T => (isDraft(value) ? (current(value as Draft<T>) as T) : value);

/** Remember the document as it is now, before the reducer changes it. */
function record(state: FlowState, label: string, at: number, mergeKey: string | null = null): void {
  state.future = [];
  state.revision += 1;
  const last = state.past[state.past.length - 1];
  if (mergeKey && last && last.mergeKey === mergeKey && at - last.at < MERGE_WINDOW_MS) {
    last.at = at;
    return;
  }
  state.past.push({ snapshot: plain(state.present), label, mergeKey, at });
  if (state.past.length > HISTORY_LIMIT) state.past.shift();
}

/** After undo or redo, forget selections and sizes of blocks that are gone. */
function tidyView(state: FlowState): void {
  const nodeIds = new Set(state.present.nodes.map((node) => node.id));
  const edgeIds = new Set(state.present.edges.map((edge) => edge.id));
  state.view.selectedNodeIds = state.view.selectedNodeIds.filter((id) => nodeIds.has(id));
  state.view.selectedEdgeIds = state.view.selectedEdgeIds.filter((id) => edgeIds.has(id));
  for (const id of Object.keys(state.view.measured)) {
    if (!nodeIds.has(id)) delete state.view.measured[id];
  }
  state.view.dragging = false;
}

const flowSlice = createSlice({
  name: "flow",
  initialState,
  reducers: {
    flowLoading(state, action: PayloadAction<string>) {
      Object.assign(state, initialState, { id: action.payload, status: "loading", view: emptyView() });
    },
    flowOpened(state, action: PayloadAction<FlowDocument>) {
      const { id, name, description, nodes, edges } = action.payload;
      Object.assign(state, initialState, {
        id,
        status: "ready",
        present: { name, description, nodes, edges },
        view: emptyView(),
      });
    },
    flowMissing(state) {
      state.status = "missing";
    },
    flowClosed() {
      return initialState;
    },
    // A save that finishes after the visitor has moved to another flow must
    // not mark that other flow as saved, so both carry the flow's id.
    flowSaved(state, action: PayloadAction<{ id: string; revision: number }>) {
      if (state.id !== action.payload.id) return;
      state.savedRevision = Math.max(state.savedRevision, action.payload.revision);
      state.saveError = null;
    },
    saveFailed(state, action: PayloadAction<{ id: string; message: string }>) {
      if (state.id !== action.payload.id) return;
      state.saveError = action.payload.message;
    },

    blockAdded: {
      prepare: (payload: { node: FlowNode; edge?: FlowEdge }) => stamp(payload),
      reducer(state, action: Stamped<{ node: FlowNode; edge?: FlowEdge }>) {
        const { node, edge } = action.payload;
        record(state, `Add ${CATALOG[node.type].title}`, action.meta.at);
        state.present.nodes.push(node);
        if (edge) state.present.edges.push(edge);
        state.view.selectedNodeIds = [node.id];
        state.view.selectedEdgeIds = [];
      },
    },

    blocksInserted: {
      prepare: (payload: { nodes: FlowNode[]; edges: FlowEdge[]; label: string }) => stamp(payload),
      reducer(state, action: Stamped<{ nodes: FlowNode[]; edges: FlowEdge[]; label: string }>) {
        const { nodes, edges, label } = action.payload;
        if (nodes.length === 0) return;
        record(state, label, action.meta.at);
        state.present.nodes.push(...nodes);
        state.present.edges.push(...edges);
        state.view.selectedNodeIds = nodes.map((node) => node.id);
        state.view.selectedEdgeIds = [];
      },
    },

    /** What the canvas reports: blocks measured, selected, moved. */
    canvasNodesChanged: {
      prepare: (payload: NodeChange[]) => stamp(payload),
      reducer(state, action: Stamped<NodeChange[]>) {
        const moves: Extract<NodeChange, { type: "position" }>[] = [];
        for (const change of action.payload) {
          if (change.type === "dimensions" && change.dimensions) {
            state.view.measured[change.id] = change.dimensions;
          } else if (change.type === "select") {
            const selected = new Set(state.view.selectedNodeIds);
            if (change.selected) selected.add(change.id);
            else selected.delete(change.id);
            state.view.selectedNodeIds = [...selected];
          } else if (change.type === "position") {
            moves.push(change);
          }
        }
        if (moves.length === 0) return;

        // A drag reports many moves and ends with one marked "not dragging".
        // The whole drag is one undo step. Arrow-key nudges have no start or
        // end, so they merge by time instead.
        const dragging = moves.some((move) => move.dragging);
        if (dragging && !state.view.dragging) {
          record(state, "Move", action.meta.at);
          state.view.dragging = true;
        } else if (!dragging && state.view.dragging) {
          state.view.dragging = false;
          state.revision += 1;
        } else if (!dragging) {
          record(state, "Move", action.meta.at, "nudge");
        } else {
          state.revision += 1;
        }

        for (const move of moves) {
          const node = state.present.nodes.find((candidate) => candidate.id === move.id);
          if (node && move.position) {
            node.position = { x: Math.round(move.position.x), y: Math.round(move.position.y) };
          }
        }
      },
    },

    canvasEdgesChanged(state, action: PayloadAction<EdgeChange[]>) {
      for (const change of action.payload) {
        if (change.type !== "select") continue;
        const selected = new Set(state.view.selectedEdgeIds);
        if (change.selected) selected.add(change.id);
        else selected.delete(change.id);
        state.view.selectedEdgeIds = [...selected];
      }
    },

    connectionMade: {
      prepare: (payload: FlowEdge) => stamp(payload),
      reducer(state, action: Stamped<FlowEdge>) {
        const { source, sourceHandle, target } = action.payload;
        if (!canConnect(state.present.nodes, state.present.edges, source, sourceHandle, target).ok) return;
        record(state, "Connect", action.meta.at);
        state.present.edges.push(action.payload);
      },
    },

    settingChanged: {
      prepare: (payload: { nodeId: string; key: string; value: unknown }) => stamp(payload),
      reducer(state, action: Stamped<{ nodeId: string; key: string; value: unknown }>) {
        const { nodeId, key, value } = action.payload;
        const node = state.present.nodes.find((candidate) => candidate.id === nodeId);
        if (!node) return;
        // Typing in one field is one step, however many keys it takes.
        record(state, "Edit settings", action.meta.at, `setting:${nodeId}:${key}`);
        (node.config as Record<string, unknown>)[key] = value;
      },
    },

    blockRenamed: {
      prepare: (payload: { nodeId: string; name: string }) => stamp(payload),
      reducer(state, action: Stamped<{ nodeId: string; name: string }>) {
        const { nodeId, name } = action.payload;
        const node = state.present.nodes.find((candidate) => candidate.id === nodeId);
        if (!node || node.name === name) return;
        record(state, "Rename", action.meta.at);
        const oldName = node.name;
        node.name = name;
        // Keep every {{ steps.oldName... }} pointing at this block.
        for (const other of state.present.nodes) {
          const config = plain(other.config);
          if (JSON.stringify(config).includes(oldName)) {
            other.config = renameInConfig(config, oldName, name);
          }
        }
      },
    },

    selectionDeleted: {
      prepare: stampOnly,
      reducer(state, action: Stamped) {
        const nodeIds = new Set(state.view.selectedNodeIds);
        const edgeIds = new Set(state.view.selectedEdgeIds);
        if (nodeIds.size === 0 && edgeIds.size === 0) return;
        record(state, "Delete", action.meta.at);
        state.present.nodes = state.present.nodes.filter((node) => !nodeIds.has(node.id));
        state.present.edges = state.present.edges.filter(
          (edge) => !edgeIds.has(edge.id) && !nodeIds.has(edge.source) && !nodeIds.has(edge.target),
        );
        tidyView(state);
      },
    },

    flowRenamed: {
      prepare: (payload: string) => stamp(payload),
      reducer(state, action: Stamped<string>) {
        if (state.present.name === action.payload) return;
        record(state, "Rename flow", action.meta.at, "flow-name");
        state.present.name = action.payload;
      },
    },

    descriptionChanged: {
      prepare: (payload: string) => stamp(payload),
      reducer(state, action: Stamped<string>) {
        record(state, "Edit description", action.meta.at, "flow-description");
        state.present.description = action.payload;
      },
    },

    layoutApplied: {
      prepare: (payload: Record<string, { x: number; y: number }>) => stamp(payload),
      reducer(state, action: Stamped<Record<string, { x: number; y: number }>>) {
        record(state, "Tidy up", action.meta.at);
        for (const node of state.present.nodes) {
          const position = action.payload[node.id];
          if (position) node.position = position;
        }
      },
    },

    undo(state) {
      const popped = state.past.pop();
      if (!popped) return;
      const entry = plain(popped);
      state.future.push({ ...entry, snapshot: plain(state.present), mergeKey: null });
      state.present = entry.snapshot;
      state.revision += 1;
      // A step that was undone and redone no longer merges with new typing.
      const top = state.past[state.past.length - 1];
      if (top) top.mergeKey = null;
      tidyView(state);
    },

    redo(state) {
      const popped = state.future.pop();
      if (!popped) return;
      const entry = plain(popped);
      state.past.push({ ...entry, snapshot: plain(state.present), mergeKey: null });
      state.present = entry.snapshot;
      state.revision += 1;
      tidyView(state);
    },

    selectionSet(state, action: PayloadAction<{ nodeIds: string[]; edgeIds?: string[] }>) {
      state.view.selectedNodeIds = action.payload.nodeIds;
      state.view.selectedEdgeIds = action.payload.edgeIds ?? [];
    },

    allSelected(state) {
      state.view.selectedNodeIds = state.present.nodes.map((node) => node.id);
      state.view.selectedEdgeIds = state.present.edges.map((edge) => edge.id);
    },
  },
});

export const flowActions = flowSlice.actions;
export const flowReducer = flowSlice.reducer;
