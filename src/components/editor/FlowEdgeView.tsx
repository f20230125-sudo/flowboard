"use client";

import { memo } from "react";
import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";
import { useAppSelector } from "@/store/hooks";
import type { CanvasEdge } from "@/store/selectors";

// A connection between two blocks. Idle it is a thin grey wire. During a run
// the wire leaving a block that is still working marches; when the block
// finishes, the wire that carried its data fills with the current, from the
// source dot to the target dot. A wire that was not taken fades to 30%. The
// two sides of a Condition are told apart by their words, not by colour.

function FlowEdgeView(props: EdgeProps<CanvasEdge>) {
  const { id, source, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, sourceHandleId, selected } = props;
  const [path] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });

  const from = useAppSelector((state) => state.run.steps[source]);

  // Data went down this connection if its source finished and, for a
  // Condition, this is the side it took.
  const carried = from?.status === "succeeded" && (from.branch === undefined || from.branch === sourceHandleId);
  const settledWithout = from !== undefined && from.status !== "running" && !carried;
  const marching = from?.status === "running";

  return (
    <>
      <BaseEdge id={id} path={path} style={!selected && settledWithout ? { opacity: 0.3 } : undefined} />
      {/* Drawn as paths of their own: the fill needs pathLength="1" to run
          from end to end, and that is not left to BaseEdge to pass on. */}
      {!selected && marching && <path d={path} className="fb-march" />}
      {!selected && carried && <path d={path} pathLength={1} className="fb-fill" />}
    </>
  );
}

export const FlowEdge = memo(FlowEdgeView);
