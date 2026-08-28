"use client";

import { memo, useContext } from "react";
import { shallowEqual } from "react-redux";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Ban, Check, LoaderCircle, SkipForward, TriangleAlert, X } from "lucide-react";
import { CATALOG } from "@/flow/catalog";
import { describeNode } from "@/flow/describe";
import { useAppSelector } from "@/store/hooks";
import type { StepState } from "@/store/runSlice";
import { selectProblemBadge, type CanvasNode } from "@/store/selectors";
import { BlockIcon } from "./blockLook";
import { ReadOnlyContext } from "./constants";
import { STATUS_LABELS, formatMs } from "./runText";

// One block on the canvas. Data flows left to right: connections come in on
// the left edge and leave on the right.
//
// Shape tells the kind: Start and Output are terminators (round ends), every
// step is a rectangle, a Condition is a rectangle with a fork under it and two
// exits. State is told by a readout tab hung from the top edge, which stays
// legible as a dark shape even when the canvas is fitted small.
//
// Each block reads its own slice of the run state, so when one step finishes
// only that block is drawn again.

const TAB = "absolute bottom-full flex h-5 items-center gap-1 rounded-t-tab px-1.5 font-mono text-[11.5px] font-bold leading-none";
const HOLLOW = "border border-b-0 border-dashed border-edge bg-ground text-ink-3";

function ReadoutTab({ step, terminator }: { step: StepState; terminator: boolean }) {
  const place = terminator ? "right-7" : "right-2";
  const { status } = step;
  const tone =
    status === "succeeded" ? "bg-ink text-sheet" : status === "failed" ? "bg-fail text-on-fail" : HOLLOW;
  return (
    <span className={`${TAB} ${place} ${tone}`}>
      {status === "running" && <LoaderCircle size={11} className="animate-spin" aria-hidden />}
      {status === "succeeded" && <Check size={11} strokeWidth={3} aria-hidden />}
      {status === "failed" && <X size={11} strokeWidth={3} aria-hidden />}
      {status === "skipped" && <SkipForward size={10} aria-hidden />}
      {status === "cancelled" && <Ban size={10} aria-hidden />}
      {status === "succeeded" && step.ms !== undefined ? formatMs(step.ms) : STATUS_LABELS[status]}
    </span>
  );
}

function ProblemTab({ errors, warnings, text, terminator }: { errors: number; warnings: number; text: string; terminator: boolean }) {
  const place = terminator ? "right-7" : "right-2";
  const failing = errors > 0;
  const words = failing
    ? `${errors} to fix`
    : `${warnings} ${warnings === 1 ? "warning" : "warnings"}`;
  return (
    <span
      className={`${TAB} ${place} border border-b-0 bg-sheet ${failing ? "border-fail text-fail" : "border-ink text-ink"}`}
      title={text}
      role="img"
      aria-label={failing ? `${errors} ${errors === 1 ? "problem" : "problems"} to fix` : `${warnings} ${warnings === 1 ? "warning" : "warnings"}`}
    >
      {!failing && <TriangleAlert size={11} aria-hidden />}
      {words}
    </span>
  );
}

function BlockNodeView({ id, data, selected }: NodeProps<CanvasNode>) {
  const { node } = data;
  const spec = CATALOG[node.type];
  const branches = spec.outputs.length > 1;
  const terminator = node.type === "trigger" || node.type === "output";
  const readOnly = useContext(ReadOnlyContext);

  const step = useAppSelector((state) => state.run.steps[id]);
  const { errors, warnings, text: problemText } = useAppSelector((state) => selectProblemBadge(state, id), shallowEqual);

  // A block that did not run steps back: dashed, on the ground, its words quieter.
  const quiet = step?.status === "skipped" || step?.status === "cancelled";
  const frame = selected
    ? "border-2 border-ink bg-sheet"
    : step?.status === "failed"
      ? "border-2 border-fail bg-sheet"
      : quiet
        ? "border-[1.5px] border-dashed border-edge bg-ground"
        : `border-[1.5px] border-edge bg-sheet ${readOnly ? "" : "hover:border-ink-2"}`;
  const ink = quiet ? "text-ink-3" : "text-ink";
  const summaryInk = quiet ? "text-ink-3" : "text-ink-2";

  const heading = (
    <div className={`flex items-center gap-2.5 ${terminator ? "px-7" : "px-4"} ${branches ? "h-[68px]" : "h-full"}`}>
      <span className={quiet ? "opacity-70" : undefined}>
        <BlockIcon type={node.type} />
      </span>
      <div className="min-w-0 flex-1">
        <div className={`truncate font-mono text-[15px] font-semibold leading-tight ${ink}`}>{node.name}</div>
        <div className={`mt-1 truncate font-mono text-[11.5px] leading-tight ${summaryInk}`}>{describeNode(node)}</div>
      </div>
    </div>
  );

  return (
    <div
      className={`fb-block relative w-[240px] transition-[border-color,background-color] duration-150 ${
        terminator ? "rounded-full" : "rounded-block"
      } ${branches ? "h-[120px]" : "h-20"} ${frame}`}
    >
      {spec.hasInput && <Handle type="target" position={Position.Left} title={readOnly ? undefined : "Connections arrive here"} />}

      {step ? (
        <ReadoutTab step={step} terminator={terminator} />
      ) : (
        (errors > 0 || warnings > 0) && !readOnly && (
          <ProblemTab errors={errors} warnings={warnings} text={problemText} terminator={terminator} />
        )
      )}

      {heading}

      {branches ? (
        <div className="border-t border-rule">
          {spec.outputs.map((output) => {
            const taken = step?.status === "succeeded" && step.branch === output.id;
            const notTaken = step?.status === "succeeded" && step.branch !== undefined && step.branch !== output.id;
            return (
              <div key={output.id} className="relative flex h-5 items-center justify-end pr-4 font-mono text-[11px] font-bold">
                <span className={notTaken ? "text-ink-3 line-through" : "text-ink"}>
                  {output.label}
                  {taken && (
                    <>
                      <span className="fb-glyph" aria-hidden>
                        {" ✓"}
                      </span>
                      <span className="sr-only">, taken</span>
                    </>
                  )}
                </span>
                <Handle
                  type="source"
                  id={output.id}
                  position={Position.Right}
                  title={readOnly ? undefined : `Drag to connect the ${output.label} side`}
                />
              </div>
            );
          })}
        </div>
      ) : (
        spec.outputs.map((output) => (
          <Handle key={output.id} type="source" id={output.id} position={Position.Right} title={readOnly ? undefined : "Drag to connect"} />
        ))
      )}
    </div>
  );
}

export const BlockNode = memo(BlockNodeView);
