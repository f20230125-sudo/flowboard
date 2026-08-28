"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ReactFlowProvider } from "@xyflow/react";
import { openFlow, saveNow } from "@/store/editorThunks";
import { flowActions } from "@/store/flowSlice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { selectFlowId, selectFlowStatus } from "@/store/selectors";
import { SettingsDialog } from "../SettingsDialog";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { BottomPanel } from "./BottomPanel";
import { Canvas } from "./Canvas";
import { Inspector } from "./Inspector";
import { Palette } from "./Palette";
import { TopBar } from "./TopBar";
import { useEditorShortcuts } from "./useEditorShortcuts";

/** The editor for one flow: top bar, blocks on the left, canvas, settings on the right. */
export function Editor({ flowId }: { flowId: string }) {
  const dispatch = useAppDispatch();
  const status = useAppSelector(selectFlowStatus);
  const openId = useAppSelector(selectFlowId);

  useEffect(() => {
    dispatch(openFlow(flowId));

    // Autosave waits a moment after each change. When the tab is hidden or
    // the editor is left, save at once instead of losing that last moment.
    const saveWhenHidden = () => {
      if (document.visibilityState === "hidden") dispatch(saveNow());
    };
    document.addEventListener("visibilitychange", saveWhenHidden);
    return () => {
      document.removeEventListener("visibilitychange", saveWhenHidden);
      dispatch(saveNow());
      dispatch(flowActions.flowClosed());
    };
  }, [dispatch, flowId]);

  if (status === "missing") {
    return (
      <main id="main" tabIndex={-1} className="flex flex-1 flex-col justify-center gap-3 px-[var(--page-x)] py-16">
        <h1 className="max-w-xl text-3xl font-extrabold leading-tight tracking-tight">This flow is not in this browser</h1>
        <p className="max-w-[62ch] text-base leading-normal text-ink-2">
          Flows are saved in the browser they were made in. It may have been deleted, or made on another device.
        </p>
        <Link
          href="/"
          className="mt-2 inline-flex h-11 items-center self-start rounded-control bg-ink px-4 text-sm font-bold text-sheet hover:bg-ink-2"
        >
          See all flows
        </Link>
      </main>
    );
  }

  if (status !== "ready" || openId !== flowId) {
    return (
      <main id="main" tabIndex={-1} className="flex flex-1 items-center justify-center text-sm text-ink-2" aria-busy="true">
        Opening the flow…
      </main>
    );
  }

  return (
    <ReactFlowProvider>
      <Workspace />
    </ReactFlowProvider>
  );
}

function Workspace() {
  useEditorShortcuts();
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <TopBar />
      <p className="border-b border-rule bg-ground px-[var(--page-x)] py-2 text-[13px] leading-snug text-ink-2 lg:hidden">
        You can run this flow here. To edit it, open Flowboard on a wider screen.
      </p>
      <div className="flex min-h-0 flex-1">
        <Palette />
        <main id="main" tabIndex={-1} className="flex min-w-0 flex-1 flex-col">
          <h1 className="sr-only">Flow editor</h1>
          <div className="relative min-h-0 flex-1">
            <Canvas />
          </div>
          <BottomPanel />
        </main>
        <Inspector />
      </div>
      <SettingsDialog />
      <ShortcutsDialog />
    </div>
  );
}
