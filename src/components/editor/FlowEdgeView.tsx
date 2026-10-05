"use client";

import { memo } from "react";
import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";
import type { CanvasEdge } from "@/store/selectors";

// A connection between two blocks. The two sides of a Condition are tinted,
// so it is clear which path is "true" and which is "false".

function FlowEdgeView(props: EdgeProps<CanvasEdge>) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, sourceHandleId, selected } = props;
  const [path] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });

  const tint = sourceHandleId === "true" ? "var(--ok)" : sourceHandleId === "false" ? "var(--bad)" : undefined;

  return <BaseEdge id={id} path={path} style={selected || !tint ? undefined : { stroke: tint, opacity: 0.75 }} />;
}

export const FlowEdge = memo(FlowEdgeView);
