"use client";

import { useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { Ban, Check, CircleAlert, ExternalLink, LoaderCircle, SkipForward, TriangleAlert, X } from "lucide-react";
import { CATALOG } from "@/flow/catalog";
import type { FlowNode } from "@/flow/schema";
import { exportRun } from "@/hindsight/export";
import { describeSend, sendToHindsight } from "@/hindsight/send";
import { flowActions } from "@/store/flowSlice";
import { useAppDispatch, useAppSelector, useAppStore } from "@/store/hooks";
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
import { IconButton, Scroll } from "../ui";
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
  const store = useAppStore();
  const { showToast } = useToast();

  /** Hands the last run to Hindsight, an observer for agents. Called from the click, so the new tab is not blocked. */
  const openInHindsight = () => {
    const { flow, run } = store.getState();
    const envelope = exportRun({ name: flow.present.name, nodes: flow.present.nodes, edges: flow.present.edges }, run);
    void sendToHindsight(envelope, `hindsight-flowboard-run-${run.runId}.json`).then((result) => {
      const { message, tone } = describeSend(result);
      showToast(message, { tone });
    });
  };
  const hasFinishedRun = status === "succeeded" || status === "failed" || status === "stopped";

  const runSummary =
    status === "idle"
      ? null
      : status === "running"
        ? "running"
        : `${status === "succeeded" ? "succeeded" : status} in ${formatMs(ms)}`;

  return (
    <section className="shrink-0 border-t border-rule bg-sheet" aria-label="Run and problems">
      <div className="flex h-10 items-end bg-ground px-2 shadow-[inset_0_-1px_0_var(--rule)]">
        <div className="flex items-end gap-1" role="tablist" aria-label="Panels">
          <TabButton tab="run" active={tab === "run"}>
            Run
            {runSummary && (
              <span className={`font-normal ${status === "failed" ? "text-fail" : "text-ink-2"}`}>{runSummary}</span>
            )}
          </TabButton>
          <TabButton tab="problems" active={tab === "problems"}>
            Problems
            {problems.length > 0 && (
              <span className={`font-mono ${errorCount > 0 ? "text-fail" : "text-ink"}`}>{problems.length}</span>
            )}
          </TabButton>
        </div>
        <div className="ml-auto flex items-center gap-1 self-center">
          {hasFinishedRun && (
            <button
              type="button"
              onClick={openInHindsight}
              title="Open in Hindsight"
              className="flex h-7 items-center gap-1.5 whitespace-nowrap rounded-control px-2 text-[12.5px] font-medium text-ink-2 transition-colors hover:bg-sheet-2 hover:text-ink max-sm:w-8 max-sm:justify-center max-sm:px-0"
            >
              <ExternalLink size={12} aria-hidden="true" />
              <span className="max-sm:sr-only">Open in Hindsight</span>
            </button>
          )}
          {tab && (
            <IconButton label="Close the panel" className="h-7 w-7" onClick={() => dispatch(uiActions.bottomTabSet(null))}>
              <X size={14} />
            </IconButton>
          )}
        </div>
      </div>

      {tab && (
        <div className="h-64" role="tabpanel">
          {tab === "run" ? <RunView /> : <ProblemsView />}
        </div>
      )}
    </section>
  );
}

/** A selected tab is the colour of its panel, with a 2 px rule of ink on its top edge, joined to the panel below. */
function TabButton({ tab, active, children }: { tab: BottomTab; active: boolean; children: React.ReactNode }) {
  const dispatch = useAppDispatch();
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={() => dispatch(uiActions.bottomTabToggled(tab))}
      className={`flex items-center gap-2 whitespace-nowrap rounded-t-tab px-3 text-[13px] font-bold transition-colors ${
        active ? "h-9 border-t-2 border-ink bg-sheet text-ink" : "mb-px h-8 text-ink-2 hover:bg-sheet-2 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

// --- Run -------------------------------------------------------------------------

function StatusMark({ status }: { status: StepState["status"] }) {
  if (status === "running") return <LoaderCircle size={13} className="animate-spin text-ink-2" />;
  if (status === "succeeded") return <Check size={13} strokeWidth={3} className="text-ink" />;
  if (status === "failed") return <X size={13} strokeWidth={3} className="text-fail" />;
  if (status === "skipped") return <SkipForward size={12} className="text-ink-3" />;
  return <Ban size={12} className="text-ink-3" />;
}

/**
 * The trace of the last run: the steps in the order they ran, and the data of
 * the one that is open. In the editor it fills the panel under the canvas; on
 * the home page (`page`) it sits under the stage and takes the height it needs.
 */
export function RunView({ variant = "panel" }: { variant?: "panel" | "page" }) {
  const dispatch = useAppDispatch();
  const status = useAppSelector(selectRunStatus);
  const order = useAppSelector(selectRunOrder);
  const steps = useAppSelector(selectRunSteps);
  const openStepId = useAppSelector(selectOpenStepId);
  const nodes = useAppSelector(selectNodes);
  const page = variant === "page";

  if (status === "idle") {
    return (
      <div className={`flex flex-col items-start gap-1 ${page ? "py-1" : "p-4"}`}>
        <p className="text-sm font-bold text-ink">Nothing has run yet</p>
        <p className="max-w-[62ch] text-[13px] leading-relaxed text-ink-2">
          Press Run. Each step shows up here with the data it received and what it returned.
        </p>
      </div>
    );
  }

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const openStep = openStepId ? steps[openStepId] : undefined;

  return (
    <div className={page ? "grid min-w-0 gap-6 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]" : "flex h-full"}>
      <Scroll
        label="Steps of the run"
        className={page ? "min-w-0" : "w-32 shrink-0 overflow-y-auto border-r border-rule sm:w-60"}
      >
        <ol aria-label="Steps of the last run" className={page ? "border-t border-rule" : ""}>
          {order.map((id) => {
            const step = steps[id];
            const node = byId.get(id);
            return (
              <li key={id} className="border-b border-rule">
                <button
                  type="button"
                  onClick={() => {
                    dispatch(runActions.stepOpened(id));
                    if (node) dispatch(flowActions.selectionSet({ nodeIds: [id] }));
                  }}
                  aria-current={id === openStepId}
                  className={`flex w-full items-center gap-2 px-2.5 text-left transition-colors ${
                    page ? "min-h-11" : "min-h-9"
                  } ${id === openStepId ? "bg-sheet-2" : "hover:bg-sheet-2"}`}
                >
                  <StatusMark status={step.status} />
                  <span
                    className={`min-w-0 flex-1 truncate font-mono text-[13px] ${
                      id === openStepId ? "font-bold" : "font-semibold"
                    } ${step.status === "skipped" || step.status === "cancelled" ? "text-ink-3" : "text-ink"}`}
                  >
                    {node?.name ?? "(deleted block)"}
                  </span>
                  <span className="shrink-0 font-mono text-[12.5px] text-ink-2">
                    {step.status === "succeeded" || step.status === "failed" ? formatMs(step.ms) : STATUS_LABELS[step.status]}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </Scroll>

      <Scroll label="Data of the open step" className={page ? "min-w-0" : "min-w-0 flex-1 overflow-y-auto"}>
        {openStep ? (
          // Keyed by step, so the Output/Input choice starts fresh for each.
          <StepDetail key={openStep.nodeId} step={openStep} node={byId.get(openStep.nodeId)} flush={page} />
        ) : (
          <p className="p-4 text-[13px] text-ink-2">Choose a step on the left to see its data.</p>
        )}
      </Scroll>
    </div>
  );
}

function StepDetail({ step, node, flush = false }: { step: StepState; node: FlowNode | undefined; flush?: boolean }) {
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
    <div className={flush ? "" : "p-3"}>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        {node && <BlockIcon type={node.type} />}
        <h3 className="min-w-0 truncate font-mono text-[14px] font-semibold text-ink">{node?.name ?? "(deleted block)"}</h3>
        {node && <span className="shrink-0 text-[12.5px] text-ink-2">{CATALOG[node.type].title}</span>}
        <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[12.5px] text-ink-2">
          <StatusMark status={step.status} />
          <span>
            {STATUS_LABELS[step.status]}
            {step.ms !== undefined && (
              <>
                {" in "}
                <span className="font-mono">{formatMs(step.ms)}</span>
              </>
            )}
          </span>
        </span>
      </div>

      {step.error && (
        <div className="mt-3" role="alert">
          <p className="flex gap-2 text-[13px] font-medium leading-relaxed text-fail">
            <CircleAlert size={15} className="mt-0.5 shrink-0" />
            <span>{step.error.message}</span>
          </p>
          {step.error.detail !== undefined && (
            <div className="mt-2 border-t border-rule pt-2">
              <p className="mb-1 text-[12.5px] font-semibold text-ink-2">What came back</p>
              <JsonTree value={step.error.detail} />
            </div>
          )}
        </div>
      )}

      {step.status === "skipped" && step.reason && (
        <p className="mt-3 text-[13px] leading-relaxed text-ink-2">{SKIP_REASONS[step.reason]}</p>
      )}
      {step.status === "cancelled" && (
        <p className="mt-3 text-[13px] leading-relaxed text-ink-2">The run ended while this step was still working.</p>
      )}
      {step.note && <p className="mt-3 text-[13px] leading-relaxed text-ink-2">{step.note}</p>}

      {(hasOutput || hasInput) && (
        <>
          <div className="mt-3 flex items-end gap-3">
            <div className="flex items-end gap-1" role="tablist" aria-label="Data of this step">
              {(["output", "input"] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  role="tab"
                  aria-selected={view === kind}
                  aria-disabled={(kind === "output" ? !hasOutput : !hasInput) || undefined}
                  onClick={() => {
                    if (kind === "output" ? hasOutput : hasInput) setView(kind);
                  }}
                  className={`rounded-t-tab px-3 text-[12.5px] font-bold transition-colors aria-disabled:opacity-45 ${
                    view === kind ? "h-8 border-t-2 border-ink bg-sheet-2 text-ink" : "mb-px h-7 text-ink-2 hover:text-ink"
                  }`}
                >
                  {kind === "output" ? "Returned" : "Received"}
                </button>
              ))}
            </div>
            <span className="hidden pb-1.5 text-[12px] text-ink-3 lg:block">Hover a row and press “ref” to copy its reference.</span>
          </div>
          <div className="rounded-b-control rounded-tr-control bg-sheet-2 p-2">
            {view === "output" && hasOutput ? (
              <JsonTree value={step.output!} path={node ? `steps.${node.name}` : undefined} onPick={copyReference} />
            ) : hasInput ? (
              <JsonTree value={step.input!} path="input" onPick={copyReference} />
            ) : (
              <p className="p-1.5 text-[13px] text-ink-2">This step returned nothing.</p>
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
      <div className="flex flex-col items-start gap-1 p-4">
        <p className="flex items-center gap-1.5 text-sm font-bold text-ink">
          <Check size={15} strokeWidth={3} /> No problems
        </p>
        <p className="text-[13px] text-ink-2">The flow is ready to run.</p>
      </div>
    );
  }

  const nameOf = new Map(nodes.map((node) => [node.id, node.name]));
  const show = (nodeId: string) => {
    dispatch(flowActions.selectionSet({ nodeIds: [nodeId] }));
    fitView({ nodes: [{ id: nodeId }], maxZoom: 1, padding: 1.5, duration: 300 });
  };

  return (
    <Scroll label="Problems with the flow" className="h-full overflow-y-auto">
      <ul>
        {problems.map((problem, index) => {
          const content = (
            <>
              {problem.level === "error" ? (
                <CircleAlert size={14} className="mt-0.5 shrink-0 text-fail" />
              ) : (
                <TriangleAlert size={14} className="mt-0.5 shrink-0 text-ink" />
              )}
              <span className="min-w-0 flex-1 text-[13px] leading-relaxed text-ink">{problem.message}</span>
              {problem.nodeId && (
                <span className="shrink-0 font-mono text-[12.5px] text-ink-2">{nameOf.get(problem.nodeId)}</span>
              )}
            </>
          );
          return (
            <li key={index} className="border-b border-rule">
              {problem.nodeId ? (
                <button
                  type="button"
                  onClick={() => show(problem.nodeId!)}
                  className="flex min-h-9 w-full items-start gap-2 px-3 py-2 text-left hover:bg-sheet-2"
                >
                  {content}
                </button>
              ) : (
                <div className="flex items-start gap-2 px-3 py-2">{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    </Scroll>
  );
}
