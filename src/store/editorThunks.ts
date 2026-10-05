import { z } from "zod";
import { CATALOG } from "@/flow/catalog";
import { canConnect, freeOutput, placeNear } from "@/flow/connect";
import { cloneSelection, createEdge, createNode } from "@/flow/document";
import { NODE_NAME_PATTERN, flowDocumentSchema, type NodeType } from "@/flow/schema";
import { api } from "./api";
import { flowActions } from "./flowSlice";
import { toDocument } from "./selectors";
import type { AppThunk } from "./store";

// Actions that need to look at the current state, or talk to storage, before
// they change anything.

export const openFlow =
  (id: string): AppThunk<Promise<void>> =>
  async (dispatch, getState, { repository }) => {
    dispatch(flowActions.flowLoading(id));
    const flow = await repository.get(id).catch(() => null);
    // The visitor may have moved on to another flow while this one loaded.
    if (getState().flow.id !== id) return;
    dispatch(flow ? flowActions.flowOpened(flow) : flowActions.flowMissing());
  };

export const saveNow = (): AppThunk<Promise<void>> => async (dispatch, getState, { repository }) => {
  const { flow } = getState();
  if (flow.status !== "ready" || flow.id === null || flow.revision === flow.savedRevision) return;
  const { id, revision } = flow;
  try {
    await repository.save(toDocument(flow, new Date()));
    dispatch(flowActions.flowSaved({ id, revision }));
    dispatch(api.util.invalidateTags(["Flows"]));
  } catch (error) {
    const message = error instanceof Error ? error.message : "The flow could not be saved.";
    dispatch(flowActions.saveFailed({ id, message }));
  }
};

/**
 * Add a block. Dropped on the canvas it lands where it was dropped. Clicked in
 * the palette it lands to the right of the selected block and is connected to
 * it, so a flow can be built with clicks alone.
 */
export const addBlock =
  (type: NodeType, at?: { x: number; y: number }): AppThunk<string> =>
  (dispatch, getState) => {
    const { present, view } = getState().flow;
    const names = present.nodes.map((node) => node.name);
    const anchor =
      !at && view.selectedNodeIds.length === 1
        ? present.nodes.find((node) => node.id === view.selectedNodeIds[0])
        : undefined;

    const node = createNode(type, at ?? placeNear(present.nodes, anchor), names);

    let edge;
    if (anchor && CATALOG[type].hasInput) {
      const handle = freeOutput(anchor, present.edges);
      if (handle && canConnect([...present.nodes, node], present.edges, anchor.id, handle, node.id).ok) {
        edge = createEdge(anchor.id, handle, node.id);
      }
    }
    dispatch(flowActions.blockAdded({ node, edge }));
    return node.id;
  };

export const connectBlocks =
  (source: string, sourceHandle: string | null, target: string): AppThunk =>
  (dispatch) => {
    dispatch(flowActions.connectionMade(createEdge(source, sourceHandle ?? "out", target)));
  };

/** Returns why the name was refused, or null when the block was renamed. */
export const renameBlock =
  (nodeId: string, name: string): AppThunk<string | null> =>
  (dispatch, getState) => {
    const trimmed = name.trim();
    const { nodes } = getState().flow.present;
    if (!NODE_NAME_PATTERN.test(trimmed)) {
      return "Use letters, digits and _ only, starting with a letter.";
    }
    if (trimmed.length > 40) return "Keep the name under 40 characters.";
    if (nodes.some((node) => node.id !== nodeId && node.name === trimmed)) {
      return `Another block is already named "${trimmed}".`;
    }
    dispatch(flowActions.blockRenamed({ nodeId, name: trimmed }));
    return null;
  };

// --- Copy, paste, duplicate ---------------------------------------------------

const clipboardSchema = z.object({
  flowboard: z.literal("blocks"),
  nodes: flowDocumentSchema.shape.nodes,
  edges: flowDocumentSchema.shape.edges,
});

/** The selected blocks as text for the clipboard, or null when none are selected. */
export const copySelection = (): AppThunk<string | null> => (_dispatch, getState) => {
  const { present, view } = getState().flow;
  const selected = new Set(view.selectedNodeIds);
  if (selected.size === 0) return null;
  return JSON.stringify({
    flowboard: "blocks",
    nodes: present.nodes.filter((node) => selected.has(node.id)),
    edges: present.edges.filter((edge) => selected.has(edge.source) && selected.has(edge.target)),
  });
};

/** Paste blocks copied from this or another flow. Anything else on the clipboard is ignored. */
export const pasteBlocks =
  (text: string): AppThunk<boolean> =>
  (dispatch, getState) => {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return false;
    }
    const parsed = clipboardSchema.safeParse(data);
    if (!parsed.success || parsed.data.nodes.length === 0) return false;

    const { nodes } = getState().flow.present;
    const copy = cloneSelection(parsed.data.nodes, parsed.data.edges, nodes.map((node) => node.name), { x: 40, y: 40 });
    dispatch(flowActions.blocksInserted({ ...copy, label: "Paste" }));
    return true;
  };

export const duplicateSelection = (): AppThunk => (dispatch, getState) => {
  const { present, view } = getState().flow;
  const selected = new Set(view.selectedNodeIds);
  const picked = present.nodes.filter((node) => selected.has(node.id));
  if (picked.length === 0) return;
  const copy = cloneSelection(picked, present.edges, present.nodes.map((node) => node.name), { x: 40, y: 40 });
  dispatch(flowActions.blocksInserted({ ...copy, label: "Duplicate" }));
};
