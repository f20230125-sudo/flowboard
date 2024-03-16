"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, CloudOff, LoaderCircle, Play, Redo2, Square, Undo2 } from "lucide-react";
import { flowActions } from "@/store/flowSlice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { startRun, stopRun } from "@/store/runThunks";
import {
  selectCanRedo,
  selectCanUndo,
  selectErrorCount,
  selectFlowName,
  selectIsRunning,
  selectRedoLabel,
  selectSaveError,
  selectSaveStatus,
  selectUndoLabel,
} from "@/store/selectors";
import { ThemeToggle } from "../ThemeToggle";
import { Button, IconButton } from "../ui";
import { FlowMenu } from "./FlowMenu";

export function TopBar({ children }: { children?: React.ReactNode }) {
  const dispatch = useAppDispatch();
  const name = useAppSelector(selectFlowName);
  const canUndo = useAppSelector(selectCanUndo);
  const canRedo = useAppSelector(selectCanRedo);
  const undoLabel = useAppSelector(selectUndoLabel);
  const redoLabel = useAppSelector(selectRedoLabel);

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-surface px-2">
      <Link
        href="/"
        aria-label="Back to all flows"
        title="All flows"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg"
      >
        <ArrowLeft size={16} />
      </Link>

      {/* Keyed by name, so the draft follows an undo of a rename. */}
      <FlowName key={name} name={name} />
      <SaveStatus />

      <div className="ml-auto flex items-center gap-1">
        <IconButton
          className="hidden lg:inline-flex"
          label={canUndo ? `Undo: ${undoLabel} (Ctrl+Z)` : "Nothing to undo"}
          disabled={!canUndo}
          onClick={() => dispatch(flowActions.undo())}
        >
          <Undo2 size={16} />
        </IconButton>
        <IconButton
          className="hidden lg:inline-flex"
          label={canRedo ? `Redo: ${redoLabel} (Ctrl+Y)` : "Nothing to redo"}
          disabled={!canRedo}
          onClick={() => dispatch(flowActions.redo())}
        >
          <Redo2 size={16} />
        </IconButton>
        <span className="mx-1 hidden h-5 w-px bg-line lg:block" aria-hidden />
        <ThemeToggle />
        <FlowMenu />
        {children}
        <RunButton />
      </div>
    </header>
  );
}

function RunButton() {
  const dispatch = useAppDispatch();
  const running = useAppSelector(selectIsRunning);
  const errorCount = useAppSelector(selectErrorCount);

  if (running) {
    return (
      <Button variant="outline" className="ml-1 w-[84px]" onClick={() => dispatch(stopRun())}>
        <Square size={12} fill="currentColor" /> Stop
      </Button>
    );
  }
  return (
    <Button
      variant="primary"
      className="ml-1 w-[84px]"
      // With errors the button still answers: it opens the list of what to fix.
      title={errorCount > 0 ? "Fix the problems first. Click to see them." : "Run the flow (Ctrl+Enter)"}
      onClick={() => dispatch(startRun())}
    >
      <Play size={13} fill="currentColor" /> Run
    </Button>
  );
}

function FlowName({ name }: { name: string }) {
  const dispatch = useAppDispatch();
  const [draft, setDraft] = useState(name);

  const commit = () => {
    const trimmed = draft.trim().slice(0, 80);
    if (trimmed === "") setDraft(name);
    else if (trimmed !== name) dispatch(flowActions.flowRenamed(trimmed));
    else setDraft(name);
  };

  return (
    <input
      type="text"
      value={draft}
      aria-label="Flow name"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          setDraft(name);
          event.currentTarget.blur();
        }
      }}
      maxLength={80}
      className="h-8 w-28 min-w-0 rounded-lg sm:w-56 border border-transparent bg-transparent px-2 text-sm font-semibold text-fg transition-colors hover:border-line focus:border-line focus:bg-bg"
    />
  );
}

function SaveStatus() {
  const status = useAppSelector(selectSaveStatus);
  const error = useAppSelector(selectSaveError);

  if (status === "failed") {
    return (
      <span className="hidden items-center gap-1.5 text-xs text-bad sm:flex" role="alert" title={error ?? undefined}>
        <CloudOff size={14} /> Not saved
      </span>
    );
  }
  return (
    <span className="hidden items-center gap-1.5 text-xs text-faint sm:flex" aria-live="polite">
      {status === "saving" ? (
        <>
          <LoaderCircle size={13} className="animate-spin" /> Saving
        </>
      ) : (
        <>
          <Check size={13} /> Saved in this browser
        </>
      )}
    </span>
  );
}
