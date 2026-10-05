"use client";

import { memo } from "react";
import { shallowEqual } from "react-redux";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Ban, Check, LoaderCircle, SkipForward, X } from "lucide-react";
import { CATALOG } from "@/flow/catalog";
import { describeNode } from "@/flow/describe";
import { useAppSelector } from "@/store/hooks";
import type { StepState } from "@/store/runSlice";
import { selectProblemBadge, type CanvasNode } from "@/store/selectors";
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
  skipped: "border-dashed border-line-strong",
  cancelled: "border-dashed border-line-strong",
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
  const { errors, warnings, text: problemText } = useAppSelector(
    (state) => selectProblemBadge(state, id),
    shallowEqual,
  );

  const frame = selected ? "border-accent ring-2 ring-accent/25" : FRAME[step?.status ?? "idle"];
  // A block that did not run steps back: flat background, quieter name, faded
  // icon. Its text is not faded, so it stays readable.
  const quiet = step?.status === "skipped" || step?.status === "cancelled";

  return (
    <div
      className={`fb-block relative w-[240px] rounded-xl border transition-[border-color,box-shadow,background-color] ${frame} ${
        quiet ? "bg-bg" : "bg-surface shadow-panel"
      }`}
      style={{ borderLeft: `3px solid ${blockTone(node.type)}` }}
    >
      {spec.hasInput && <Handle type="target" position={Position.Left} title="Connections arrive here" />}

      {step && <StatusChip step={step} />}
      {!step && (errors > 0 || warnings > 0) && (
        <span
          className={`absolute -top-2.5 right-2 flex h-5 min-w-5 items-center justify-center rounded-full border bg-surface px-1.5 text-[10px] font-semibold ${
            errors > 0 ? "border-bad text-bad" : "border-warn text-warn"
          }`}
          title={problemText}
          role="img"
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
        <span className={quiet ? "opacity-50" : undefined}>
          <BlockIcon type={node.type} />
        </span>
        <div className="min-w-0 flex-1">
          <div className={`truncate font-mono text-[13px] font-medium leading-tight ${quiet ? "text-muted" : "text-fg"}`}>
            {node.name}
          </div>
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
                className="relative flex h-6 items-center justify-end pr-4 text-[11px] font-medium"
              >
                <span className={notTaken ? "text-faint line-through" : output.id === "true" ? "text-ok" : "text-bad"}>
                  {output.label}
                  {taken ? " ✓" : ""}
                </span>
                <Handle
                  type="source"
                  id={output.id}
                  position={Position.Right}
                  title={`Drag to connect the ${output.label} side`}
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
            title="Drag to connect"
          />
        ))
      )}
    </div>
  );
}

export const BlockNode = memo(BlockNodeView);
