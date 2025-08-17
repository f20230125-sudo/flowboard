"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Provider } from "react-redux";
import { ReactFlowProvider, useReactFlow } from "@xyflow/react";
import { Pencil, Play, Square } from "lucide-react";
import { parseFlow } from "@/flow/schema";
import { MemoryFlowRepository } from "@/storage/repository";
import { useGetTemplateQuery } from "@/store/api";
import type { Template } from "@/templates";
import { flowActions } from "@/store/flowSlice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { startRun, stopRun } from "@/store/runThunks";
import { selectFlowStatus, selectIsRunning, selectRunMs, selectRunStatus } from "@/store/selectors";
import { makeStore } from "@/store/store";
import { Canvas, stageFitOptions } from "../editor/Canvas";
import { RunView } from "../editor/BottomPanel";
import { formatMs } from "../editor/runText";
import { Button, Scroll } from "../ui";

// The first screen shows the real thing: Heat check, drawn by the same canvas,
// blocks and wires as the editor, read-only, with a Run button. Nothing runs on
// load. Pressing Run calls api.open-meteo.com from the visitor's browser, and
// the page says so.
//
// The stage has a store of its own (the same reducers as the editor's), so the
// flow shown here is never a flow of the visitor's and never an unsaved edit.

const STAGE_HEIGHT = 440;
const TEMPLATE_ID = "heat-check";

export function Stage({ onEdit, busy }: { onEdit: () => void; busy: boolean }) {
  const [store] = useState(() => makeStore({ repository: new MemoryFlowRepository() }));
  const { data: template, isError, refetch } = useGetTemplateQuery(TEMPLATE_ID);

  // The flow is read from this app's own REST API and checked like any other flow from outside.
  const parsed = useMemo(() => (template ? parseFlow(template.flow) : null), [template]);
  useEffect(() => {
    if (parsed?.ok) store.dispatch(flowActions.flowOpened(parsed.flow));
  }, [parsed, store]);

  const failed = isError || (parsed !== null && !parsed.ok);

  return (
    <Provider store={store}>
      <StageBody template={template} failed={failed} retry={() => void refetch()} onEdit={onEdit} busy={busy} />
    </Provider>
  );
}

type BodyProps = { template: Template | undefined; failed: boolean; retry: () => void; onEdit: () => void; busy: boolean };

function StageBody({ template, failed, retry, onEdit, busy }: BodyProps) {
  const ready = useAppSelector(selectFlowStatus) === "ready";
  return (
    <>
      <section aria-label="Heat check, a flow you can run here" className="mt-10 border-y border-rule">
        <div className="flex flex-col gap-4 px-[var(--page-x)] py-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="font-mono text-[15px] font-semibold text-ink">{template?.name ?? "Heat check"}</h2>
            <p className="mt-1 max-w-[62ch] text-[13px] leading-snug text-ink-2">
              {failed
                ? "The flow could not be loaded."
                : (template?.description ?? "Loading the flow…")}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {failed ? (
              <Button onClick={retry}>Try again</Button>
            ) : (
              <>
                <RunButton ready={ready} />
                <Button size="lg" className="max-lg:hidden lg:h-9" onClick={onEdit} disabled={!ready || busy}>
                  <Pencil size={14} aria-hidden /> Edit this flow
                </Button>
              </>
            )}
          </div>
        </div>

        {ready && !failed && <StageCanvas />}
        {!ready && (
          <div style={{ height: STAGE_HEIGHT }} className="border-t border-rule" aria-busy={!failed}>
            <p className="px-[var(--page-x)] pt-4 text-[13px] text-ink-2">{failed ? "" : "Loading the flow…"}</p>
          </div>
        )}

        <p className="border-t border-rule px-[var(--page-x)] py-2.5 text-[13px] leading-snug text-ink-2">
          Run calls api.open-meteo.com from your browser. The result is not stored.
          <span className="lg:hidden"> To edit a flow, open Flowboard on a wider screen.</span>
        </p>
      </section>

      <Trace />
    </>
  );
}

/** Run, and Stop while it runs: one button, so the keyboard stays on it. */
function RunButton({ ready }: { ready: boolean }) {
  const dispatch = useAppDispatch();
  const running = useAppSelector(selectIsRunning);
  return (
    <Button
      variant={running ? "outline" : "primary"}
      size="lg"
      className="max-sm:h-12 max-sm:flex-1 sm:w-[96px] lg:h-9"
      disabled={!ready}
      onClick={() => dispatch(running ? stopRun() : startRun())}
    >
      {running ? <Square size={12} fill="currentColor" aria-hidden /> : <Play size={13} fill="currentColor" aria-hidden />}
      {running ? "Stop" : "Run"}
    </Button>
  );
}

/** The flow, fitted to the window (never below half size). On a phone it is shown whole at full size and scrolls sideways. */
function StageCanvas() {
  const measure = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState(0);

  useEffect(() => {
    const element = measure.current;
    if (!element) return;
    // The observer reports once as soon as it starts, so the first width is read there.
    const read = () => setViewport(element.clientWidth);
    const resized = new ResizeObserver(read);
    resized.observe(element);
    return () => resized.disconnect();
  }, []);

  const width = viewport === 0 ? undefined : viewport < 640 ? 1480 : Math.max(viewport, 700);

  return (
    <div ref={measure} className="w-full border-t border-rule">
      <Scroll label="Heat check, scrolls sideways" className="overflow-x-auto overflow-y-hidden">
        <div style={{ width: width ?? "100%", height: STAGE_HEIGHT }}>
          <ReactFlowProvider>
            <Canvas readOnly />
            <Refit width={width} />
          </ReactFlowProvider>
        </div>
      </Scroll>
    </div>
  );
}

/** The library fits the flow once, on load. When the window changes, fit it again. */
function Refit({ width }: { width: number | undefined }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    if (width === undefined) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => void fitView(stageFitOptions));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [width, fitView]);
  return null;
}

/** What the run did, under the stage: the same steps and data as the editor's Run panel. */
function Trace() {
  const status = useAppSelector(selectRunStatus);
  const ms = useAppSelector(selectRunMs);
  const line = status === "idle" ? null : status === "running" ? "Running" : `Run ${status} in ${formatMs(ms)}`;
  return (
    <section aria-label="What the run did" className="max-w-[1440px] px-[var(--page-x)] pt-6">
      {/* Not role="status": the page has one status region already, for its messages. */}
      <p aria-live="polite" className={`text-sm font-bold ${line ? "mb-3" : ""} ${status === "failed" ? "text-fail" : "text-ink"}`}>
        {line}
      </p>
      <RunView variant="page" />
    </section>
  );
}
