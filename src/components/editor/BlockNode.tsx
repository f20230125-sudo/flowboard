"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Ban, Check, LoaderCircle, SkipForward, X } from "lucide-react";
import { CATALOG } from "@/flow/catalog";
import { describeNode } from "@/flow/describe";
import { useAppSelector } from "@/store/hooks";
import type { StepState } from "@/store/runSlice";
import { selectProblemsByNode, type CanvasNode } from "@/store/selectors";
import { BlockIcon, blockTone } from "./blockLook";
import { STATUS_LABELS, formatMs } from "./runText";

// One block on the canvas. Data flows left to right: connections come in on
// the left edge and leave on the right. A Condition has two ways out.
//
// Each block reads its own slice of the run state, so when one step finishes
// only that block is drawn again.

const FRAME: Record<StepState["status"] | "idle", string> = {
  idle: "border-line hover:border-line-strong",
  running: "border-accent fb-running",
  succeeded: "border-ok",
  failed: "border-bad ring-2 ring-bad/30",
  skipped: "border-line opacity-55",
  cancelled: "border-line opacity-55",
};

function StatusChip({ step }: { step: StepState }) {
  const tone =
    step.status === "succeeded"
      ? "text-ok border-ok"
      : step.status === "failed"
        ? "text-bad border-bad"
        : step.status === "running"
          ? "text-accent border-accent"
          : "text-muted border-line-strong";
  return (
    <span
      className={`absolute -top-2.5 right-2 flex h-5 items-center gap-1 rounded-full border bg-surface px-1.5 text-[10px] font-medium ${tone}`}
    >
      {step.status === "running" && <LoaderCircle size={11} className="animate-spin" />}
      {step.status === "succeeded" && <Check size={11} strokeWidth={3} />}
      {step.status === "failed" && <X size={11} strokeWidth={3} />}
      {step.status === "skipped" && <SkipForward size={10} />}
      {step.status === "cancelled" && <Ban size={10} />}
      {step.status === "succeeded" && step.ms !== undefined ? formatMs(step.ms) : STATUS_LABELS[step.status]}
    </span>
  );
}

function BlockNodeView({ id, data, selected }: NodeProps<CanvasNode>) {
  const { node } = data;
  const spec = CATALOG[node.type];
  const branches = spec.outputs.length > 1;

  const step = useAppSelector((state) => state.run.steps[id]);
  const problems = useAppSelector(selectProblemsByNode).get(id);
  const errors = problems?.filter((problem) => problem.level === "error").length ?? 0;
  const warnings = (problems?.length ?? 0) - errors;

  const frame = selected ? "border-accent ring-2 ring-accent/25" : FRAME[step?.status ?? "idle"];
  // A selected block keeps its run colour on the dimming, not on the border.
  const dimmed = selected && (step?.status === "skipped" || step?.status === "cancelled") ? "opacity-55" : "";

  return (
    <div
      className={`fb-block relative w-[240px] rounded-xl border bg-surface shadow-panel transition-[border-color,box-shadow,opacity] ${frame} ${dimmed}`}
      style={{ borderLeft: `3px solid ${blockTone(node.type)}` }}
    >
      {spec.hasInput && <Handle type="target" position={Position.Left} aria-label={`Connect into ${node.name}`} />}

      {step && <StatusChip step={step} />}
      {!step && (errors > 0 || warnings > 0) && (
        <span
          className={`absolute -top-2.5 right-2 flex h-5 min-w-5 items-center justify-center rounded-full border bg-surface px-1.5 text-[10px] font-semibold ${
            errors > 0 ? "border-bad text-bad" : "border-warn text-warn"
          }`}
          title={problems?.map((problem) => problem.message).join("\n")}
          aria-label={
            errors > 0
              ? `${errors} ${errors === 1 ? "problem" : "problems"} to fix`
              : `${warnings} ${warnings === 1 ? "warning" : "warnings"}`
          }
        >
          {errors > 0 ? `${errors} to fix` : "!"}
        </span>
      )}

      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <BlockIcon type={node.type} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-[13px] font-medium leading-tight text-fg">{node.name}</div>
          <div className="mt-0.5 truncate text-[11px] leading-tight text-muted">{describeNode(node)}</div>
        </div>
      </div>

      {branches ? (
        <div className="border-t border-line py-1">
          {spec.outputs.map((output) => {
            const taken = step?.status === "succeeded" && step.branch === output.id;
            const notTaken = step?.status === "succeeded" && step.branch !== undefined && step.branch !== output.id;
            return (
              <div
                key={output.id}
                className={`relative flex h-6 items-center justify-end pr-4 text-[11px] font-medium ${notTaken ? "opacity-40" : ""}`}
              >
                <span className={output.id === "true" ? "text-ok" : "text-bad"}>
                  {output.label}
                  {taken ? " ✓" : ""}
                </span>
                <Handle
                  type="source"
                  id={output.id}
                  position={Position.Right}
                  aria-label={`Connect from the ${output.label} side of ${node.name}`}
                />
              </div>
            );
          })}
        </div>
      ) : (
        spec.outputs.map((output) => (
          <Handle
            key={output.id}
            type="source"
            id={output.id}
            position={Position.Right}
            aria-label={`Connect from ${node.name}`}
          />
        ))
      )}
    </div>
  );
}

export const BlockNode = memo(BlockNodeView);
