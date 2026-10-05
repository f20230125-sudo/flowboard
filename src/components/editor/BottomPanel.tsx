"use client";

import { useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { Ban, Check, CircleAlert, LoaderCircle, SkipForward, TriangleAlert, X } from "lucide-react";
import { CATALOG } from "@/flow/catalog";
import type { FlowNode } from "@/flow/schema";
import { flowActions } from "@/store/flowSlice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { runActions, type StepState } from "@/store/runSlice";
import {
  selectBottomTab,
  selectErrorCount,
  selectNodes,
  selectOpenStepId,
  selectProblems,
  selectRunMs,
  selectRunOrder,
  selectRunStatus,
  selectRunSteps,
} from "@/store/selectors";
import { uiActions, type BottomTab } from "@/store/uiSlice";
import { useToast } from "../toast";
import { IconButton } from "../ui";
import { BlockIcon } from "./blockLook";
import { JsonTree } from "./JsonTree";
import { SKIP_REASONS, STATUS_LABELS, formatMs } from "./runText";

/**
 * The panel under the canvas. "Run" shows what each step received and
 * returned; "Problems" lists what has to be fixed before the flow can run.
 */
export function BottomPanel() {
  const dispatch = useAppDispatch();
  const tab = useAppSelector(selectBottomTab);
  const status = useAppSelector(selectRunStatus);
  const ms = useAppSelector(selectRunMs);
  const problems = useAppSelector(selectProblems);
  const errorCount = useAppSelector(selectErrorCount);

  const runSummary =
    status === "idle"
      ? null
      : status === "running"
        ? "running"
        : `${status === "succeeded" ? "succeeded" : status} in ${formatMs(ms)}`;

  return (
    <section className="shrink-0 border-t border-line bg-surface" aria-label="Run and problems">
      <div className="flex h-9 items-center gap-1 px-2" role="tablist" aria-label="Panels">
        <TabButton tab="run" active={tab === "run"}>
          Run
          {runSummary && (
            <span
              className={`font-normal ${
                status === "succeeded" ? "text-ok" : status === "failed" ? "text-bad" : "text-muted"
              }`}
            >
              {runSummary}
            </span>
          )}
        </TabButton>
        <TabButton tab="problems" active={tab === "problems"}>
          Problems
          {problems.length > 0 && (
            <span
              className={`rounded-full px-1.5 text-[11px] font-semibold ${
                errorCount > 0 ? "bg-bad text-surface" : "bg-warn text-surface"
              }`}
            >
              {problems.length}
            </span>
          )}
        </TabButton>
        {tab && (
          <IconButton label="Close the panel" className="ml-auto h-7 w-7" onClick={() => dispatch(uiActions.bottomTabSet(null))}>
            <X size={14} />
          </IconButton>
        )}
      </div>

      {tab && (
        <div className="h-64 border-t border-line" role="tabpanel">
          {tab === "run" ? <RunView /> : <ProblemsView />}
        </div>
      )}
    </section>
  );
}

function TabButton({ tab, active, children }: { tab: BottomTab; active: boolean; children: React.ReactNode }) {
  const dispatch = useAppDispatch();
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={() => dispatch(uiActions.bottomTabToggled(tab))}
      className={`flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors ${
        active ? "bg-surface-2 text-fg" : "text-muted hover:bg-surface-2 hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}

// --- Run -------------------------------------------------------------------------

function StatusMark({ status }: { status: StepState["status"] }) {
  if (status === "running") return <LoaderCircle size={13} className="animate-spin text-accent" />;
  if (status === "succeeded") return <Check size={13} strokeWidth={3} className="text-ok" />;
  if (status === "failed") return <X size={13} strokeWidth={3} className="text-bad" />;
  if (status === "skipped") return <SkipForward size={12} className="text-faint" />;
  return <Ban size={12} className="text-faint" />;
}

function RunView() {
  const dispatch = useAppDispatch();
  const status = useAppSelector(selectRunStatus);
  const order = useAppSelector(selectRunOrder);
  const steps = useAppSelector(selectRunSteps);
  const openStepId = useAppSelector(selectOpenStepId);
  const nodes = useAppSelector(selectNodes);

  if (status === "idle") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
        <p className="text-sm font-medium text-fg">Nothing has run yet</p>
        <p className="max-w-md text-xs leading-relaxed text-muted">
          Press Run to execute the flow. Each step shows up here with the data it received and what it returned.
        </p>
      </div>
    );
  }

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const openStep = openStepId ? steps[openStepId] : undefined;

  return (
    <div className="flex h-full">
      <ol className="w-60 shrink-0 overflow-y-auto border-r border-line p-1.5" aria-label="Steps of the last run">
        {order.map((id) => {
          const step = steps[id];
          const node = byId.get(id);
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => {
                  dispatch(runActions.stepOpened(id));
                  if (node) dispatch(flowActions.selectionSet({ nodeIds: [id] }));
                }}
                aria-current={id === openStepId}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
                  id === openStepId ? "bg-accent-soft" : "hover:bg-surface-2"
                } ${step.status === "skipped" || step.status === "cancelled" ? "opacity-60" : ""}`}
              >
                <StatusMark status={step.status} />
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg">{node?.name ?? "(deleted block)"}</span>
                <span className="shrink-0 text-[11px] text-faint">
                  {step.status === "succeeded" || step.status === "failed" ? formatMs(step.ms) : STATUS_LABELS[step.status]}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="min-w-0 flex-1 overflow-y-auto">
        {openStep ? (
          // Keyed by step, so the Output/Input choice starts fresh for each.
          <StepDetail key={openStep.nodeId} step={openStep} node={byId.get(openStep.nodeId)} />
        ) : (
          <p className="p-4 text-xs text-muted">Choose a step on the left to see its data.</p>
        )}
      </div>
    </div>
  );
}

function StepDetail({ step, node }: { step: StepState; node: FlowNode | undefined }) {
  const { showToast } = useToast();
  const [view, setView] = useState<"output" | "input">("output");

  const copyReference = (reference: string) => {
    navigator.clipboard.writeText(reference).then(
      () => showToast(`Copied ${reference}. Paste it into any field.`),
      () => showToast("The browser did not allow copying.", { tone: "bad" }),
    );
  };

  const hasOutput = step.output !== undefined;
  const hasInput = step.input !== undefined && step.input !== null;

  return (
    <div className="p-3">
      <div className="flex items-center gap-2">
        {node && <BlockIcon type={node.type} size={24} />}
        <h3 className="min-w-0 truncate font-mono text-[13px] font-semibold text-fg">{node?.name ?? "(deleted block)"}</h3>
        {node && <span className="shrink-0 text-xs text-muted">{CATALOG[node.type].title}</span>}
        <span className="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-muted">
          <StatusMark status={step.status} />
          {STATUS_LABELS[step.status]}
          {step.ms !== undefined && ` · ${formatMs(step.ms)}`}
        </span>
      </div>

      {step.error && (
        <div className="mt-3 rounded-lg border border-bad/40 p-2.5" role="alert">
          <p className="flex gap-2 text-xs leading-relaxed text-bad">
            <CircleAlert size={14} className="mt-0.5 shrink-0" />
            <span>{step.error.message}</span>
          </p>
          {step.error.detail !== undefined && (
            <div className="mt-2 border-t border-line pt-2">
              <p className="mb-1 text-[11px] font-medium text-muted">What came back</p>
              <JsonTree value={step.error.detail} />
            </div>
          )}
        </div>
      )}

      {step.status === "skipped" && step.reason && (
        <p className="mt-3 text-xs leading-relaxed text-muted">{SKIP_REASONS[step.reason]}</p>
      )}
      {step.status === "cancelled" && (
        <p className="mt-3 text-xs leading-relaxed text-muted">The run ended while this step was still working.</p>
      )}
      {step.note && <p className="mt-3 text-xs italic leading-relaxed text-muted">{step.note}</p>}

      {(hasOutput || hasInput) && (
        <>
          <div className="mt-3 flex items-center gap-1" role="tablist" aria-label="Data of this step">
            {(["output", "input"] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                role="tab"
                aria-selected={view === kind}
                disabled={kind === "output" ? !hasOutput : !hasInput}
                onClick={() => setView(kind)}
                className={`h-6 rounded-md px-2 text-[11px] font-medium capitalize transition-colors disabled:opacity-40 ${
                  view === kind ? "bg-surface-2 text-fg" : "text-muted hover:text-fg"
                }`}
              >
                {kind === "output" ? "Returned" : "Received"}
              </button>
            ))}
            <span className="ml-2 text-[11px] text-faint">Hover a row and press “ref” to copy its reference.</span>
          </div>
          <div className="mt-1.5 rounded-lg border border-line bg-bg p-1.5">
            {view === "output" && hasOutput ? (
              <JsonTree value={step.output!} path={node ? `steps.${node.name}` : undefined} onPick={copyReference} />
            ) : hasInput ? (
              <JsonTree value={step.input!} path="input" onPick={copyReference} />
            ) : (
              <p className="p-1.5 text-xs text-muted">This step returned nothing.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// --- Problems --------------------------------------------------------------------

function ProblemsView() {
  const dispatch = useAppDispatch();
  const problems = useAppSelector(selectProblems);
  const nodes = useAppSelector(selectNodes);
  const { fitView } = useReactFlow();

  if (problems.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
        <p className="flex items-center gap-1.5 text-sm font-medium text-ok">
          <Check size={15} strokeWidth={3} /> No problems
        </p>
        <p className="text-xs text-muted">The flow is ready to run.</p>
      </div>
    );
  }

  const nameOf = new Map(nodes.map((node) => [node.id, node.name]));
  const show = (nodeId: string) => {
    dispatch(flowActions.selectionSet({ nodeIds: [nodeId] }));
    fitView({ nodes: [{ id: nodeId }], maxZoom: 1, padding: 1.5, duration: 300 });
  };

  return (
    <ul className="h-full overflow-y-auto p-1.5">
      {problems.map((problem, index) => {
        const content = (
          <>
            {problem.level === "error" ? (
              <CircleAlert size={14} className="mt-0.5 shrink-0 text-bad" />
            ) : (
              <TriangleAlert size={14} className="mt-0.5 shrink-0 text-warn" />
            )}
            <span className="min-w-0 flex-1 text-xs leading-relaxed text-fg">{problem.message}</span>
            {problem.nodeId && (
              <span className="shrink-0 font-mono text-[11px] text-muted">{nameOf.get(problem.nodeId)}</span>
            )}
          </>
        );
        return (
          <li key={index}>
            {problem.nodeId ? (
              <button
                type="button"
                onClick={() => show(problem.nodeId!)}
                className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface-2"
              >
                {content}
              </button>
            ) : (
              <div className="flex items-start gap-2 px-2 py-1.5">{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
