"use client";

import { useCallback, type DragEvent } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { canConnect } from "@/flow/connect";
import { NODE_TYPES, type NodeType } from "@/flow/schema";
import { addBlock, connectBlocks } from "@/store/editorThunks";
import { flowActions } from "@/store/flowSlice";
import { useAppDispatch, useAppSelector, useAppStore } from "@/store/hooks";
import { runActions } from "@/store/runSlice";
import { selectCanvasEdges, selectCanvasNodes, type CanvasEdge, type CanvasNode } from "@/store/selectors";
import { useTheme } from "../theme";
import { BlockNode } from "./BlockNode";
import { FlowEdge } from "./FlowEdgeView";
import { blockTone } from "./blockLook";
import { BLOCK_DRAG_TYPE } from "./constants";

// Defined once, outside the component: the library re-creates every block if
// it is handed a new object here on each render.
const nodeTypes = { block: BlockNode };
const edgeTypes = { flow: FlowEdge };
const fitViewOptions = { maxZoom: 1, padding: 0.12 };
const miniMapStyle = { width: 132, height: 84 };
const snapGrid: [number, number] = [20, 20];

/**
 * The canvas. It holds no state of its own: blocks and connections come from
 * the Redux store, and everything the visitor does here is reported back to
 * the store as an action.
 */
export function Canvas() {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const nodes = useAppSelector(selectCanvasNodes);
  const edges = useAppSelector(selectCanvasEdges);
  const { theme } = useTheme();
  const { screenToFlowPosition } = useReactFlow();

  const onNodesChange = useCallback(
    (changes: NodeChange<CanvasNode>[]) => dispatch(flowActions.canvasNodesChanged(changes as NodeChange[])),
    [dispatch],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<CanvasEdge>[]) => dispatch(flowActions.canvasEdgesChanged(changes as EdgeChange[])),
    [dispatch],
  );

  const onConnect = useCallback(
    (connection: Connection) => dispatch(connectBlocks(connection.source, connection.sourceHandle, connection.target)),
    [dispatch],
  );

  // Asked while a connection is being dragged, to show whether it may land.
  const isValidConnection = useCallback(
    (connection: Connection | CanvasEdge) => {
      const { nodes: current, edges: links } = store.getState().flow.present;
      return canConnect(current, links, connection.source, connection.sourceHandle ?? "out", connection.target).ok;
    },
    [store],
  );

  // Clicking a block that took part in the last run shows its data.
  const onNodeClick = useCallback(
    (_event: unknown, node: CanvasNode) => {
      if (store.getState().run.steps[node.id]) dispatch(runActions.stepOpened(node.id));
    },
    [dispatch, store],
  );

  const onDragOver = useCallback((event: DragEvent) => {
    if (!event.dataTransfer.types.includes(BLOCK_DRAG_TYPE)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  const onDrop = useCallback(
    (event: DragEvent) => {
      const type = event.dataTransfer.getData(BLOCK_DRAG_TYPE) as NodeType;
      if (!NODE_TYPES.includes(type)) return;
      event.preventDefault();
      const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      // Centre the block under the pointer, on the grid.
      dispatch(addBlock(type, { x: Math.round((point.x - 120) / 20) * 20, y: Math.round((point.y - 30) / 20) * 20 }));
    },
    [dispatch, screenToFlowPosition],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeClick={onNodeClick}
      isValidConnection={isValidConnection}
      onDragOver={onDragOver}
      onDrop={onDrop}
      colorMode={theme}
      fitView
      fitViewOptions={fitViewOptions}
      minZoom={0.2}
      maxZoom={1.75}
      snapToGrid
      snapGrid={snapGrid}
      // Deleting goes through the store instead, so it is one undo step.
      deleteKeyCode={null}
      aria-label="Flow canvas"
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} />
      <Controls showInteractive={false} position="bottom-left" />
      <MiniMap
        pannable
        zoomable
        position="bottom-right"
        nodeColor={(node) => blockTone((node as CanvasNode).data.node.type)}
        nodeStrokeWidth={0}
        nodeBorderRadius={6}
        style={miniMapStyle}
        // On a narrow screen there is no room for it beside the flow.
        className="max-lg:hidden!"
        ariaLabel="Overview of the flow"
      />
    </ReactFlow>
  );
}
