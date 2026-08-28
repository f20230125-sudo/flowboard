"use client";

import { useCallback, type DragEvent } from "react";
import {
  Background,
  BackgroundVariant,
  ControlButton,
  Controls,
  MiniMap,
  ReactFlow,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AlignStartVertical } from "lucide-react";
import { canConnect } from "@/flow/connect";
import { NODE_TYPES, type NodeType } from "@/flow/schema";
import { addBlock, connectBlocks, tidyUp } from "@/store/editorThunks";
import { flowActions } from "@/store/flowSlice";
import { useAppDispatch, useAppSelector, useAppStore } from "@/store/hooks";
import { runActions } from "@/store/runSlice";
import { selectCanvasEdges, selectCanvasNodes, type CanvasEdge, type CanvasNode } from "@/store/selectors";
import { useTheme } from "../theme";
import { useToast } from "../toast";
import { BlockNode } from "./BlockNode";
import { FlowEdge } from "./FlowEdgeView";
import { BLOCK_DRAG_TYPE, ReadOnlyContext } from "./constants";

// Defined once, outside the component: the library re-creates every block if
// it is handed a new object here on each render.
const nodeTypes = { block: BlockNode };
const edgeTypes = { flow: FlowEdge };
const fitViewOptions = { maxZoom: 1, padding: 0.12 };
/** The home page's stage: never smaller than half size, never larger than life. */
export const stageFitOptions = { minZoom: 0.5, maxZoom: 1, padding: 0.03 };
const miniMapNodeColor = () => "var(--ink-3)";
const miniMapStyle = { width: 132, height: 84 };
const snapGrid: [number, number] = [20, 20];

/**
 * The canvas. It holds no state of its own: blocks and connections come from
 * the Redux store, and everything the visitor does here is reported back to
 * the store as an action.
 *
 * With `readOnly` the same canvas, blocks and wires are drawn for the home
 * page's stage: nothing can be moved, connected or selected, and there are no
 * controls, so all that is left to do with it is to run it.
 */
export function Canvas({ readOnly = false }: { readOnly?: boolean }) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const nodes = useAppSelector(selectCanvasNodes);
  const edges = useAppSelector(selectCanvasEdges);
  const { theme } = useTheme();
  const { showToast } = useToast();
  const { screenToFlowPosition, fitView } = useReactFlow();

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

  const onTidyUp = useCallback(() => {
    if (!dispatch(tidyUp())) {
      showToast("The blocks are already lined up.");
      return;
    }
    // Bring the whole flow into view, once the canvas has drawn the new places.
    requestAnimationFrame(() => void fitView({ ...fitViewOptions, duration: 300 }));
  }, [dispatch, fitView, showToast]);

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
    <ReadOnlyContext.Provider value={readOnly}>
      <ReactFlow
        className={readOnly ? "fb-readonly" : undefined}
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
        fitViewOptions={readOnly ? stageFitOptions : fitViewOptions}
        minZoom={readOnly ? 0.5 : 0.2}
        maxZoom={readOnly ? 1 : 1.75}
        snapToGrid
        snapGrid={snapGrid}
        // Deleting goes through the store instead, so it is one undo step.
        deleteKeyCode={null}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        elementsSelectable={!readOnly}
        nodesFocusable={!readOnly}
        edgesFocusable={!readOnly}
        panOnDrag={!readOnly}
        zoomOnScroll={!readOnly}
        zoomOnPinch={!readOnly}
        zoomOnDoubleClick={!readOnly}
        // The page keeps scrolling when the wheel is over the stage.
        preventScrolling={!readOnly}
        aria-label={readOnly ? "Heat check, drawn as blocks and wires" : "Flow canvas"}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} />
        {!readOnly && (
          <Controls showInteractive={false} position="bottom-left">
            {/* Moving blocks is editing, which a narrow screen does not offer. */}
            <ControlButton
              onClick={onTidyUp}
              title="Tidy up: line the blocks up in the order they run"
              aria-label="Tidy up the layout"
              className="max-lg:hidden!"
            >
              <AlignStartVertical />
            </ControlButton>
          </Controls>
        )}
        {!readOnly && (
          <MiniMap
            pannable
            zoomable
            position="bottom-right"
            nodeColor={miniMapNodeColor}
            nodeStrokeWidth={0}
            nodeBorderRadius={6}
            style={miniMapStyle}
            // On a narrow screen there is no room for it beside the flow.
            className="max-lg:hidden!"
            ariaLabel="Overview of the flow"
          />
        )}
      </ReactFlow>
    </ReadOnlyContext.Provider>
  );
}
