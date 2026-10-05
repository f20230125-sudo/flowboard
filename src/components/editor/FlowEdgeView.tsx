"use client";

import { memo } from "react";
import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";
import { useAppSelector } from "@/store/hooks";
import type { CanvasEdge } from "@/store/selectors";

// A connection between two blocks. The two sides of a Condition are tinted,
// so it is clear which path is "true" and which is "false". During and after
// a run, the connections that carried data light up and the rest fade.

function FlowEdgeView(props: EdgeProps<CanvasEdge>) {
  const { id, source, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, sourceHandleId, selected } = props;
  const [path] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });

  const from = useAppSelector((state) => state.run.steps[source]);
  const running = useAppSelector((state) => state.run.status === "running");

  // Data went down this connection if its source finished and, for a
  // Condition, this is the side it took.
  const carried = from?.status === "succeeded" && (from.branch === undefined || from.branch === sourceHandleId);
  const settledWithout = from !== undefined && from.status !== "running" && !carried;

  const tint = sourceHandleId === "true" ? "var(--ok)" : sourceHandleId === "false" ? "var(--bad)" : undefined;

  let style: React.CSSProperties | undefined;
  if (selected) style = undefined;
  else if (carried) style = { stroke: tint ?? "var(--ok)", strokeWidth: 2.5 };
  else if (settledWithout) style = { stroke: tint, opacity: 0.3 };
  else if (tint) style = { stroke: tint, opacity: 0.75 };

  return <BaseEdge id={id} path={path} style={style} className={carried && running ? "fb-edge-flowing" : undefined} />;
}

export const FlowEdge = memo(FlowEdgeView);
