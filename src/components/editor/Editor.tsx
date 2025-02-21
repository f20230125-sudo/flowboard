"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ReactFlowProvider } from "@xyflow/react";
import { openFlow, saveNow } from "@/store/editorThunks";
import { flowActions } from "@/store/flowSlice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { selectFlowId, selectFlowStatus } from "@/store/selectors";
import { SettingsDialog } from "../SettingsDialog";
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
      <main className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <h1 className="text-xl font-semibold">This flow is not in this browser</h1>
        <p className="max-w-sm text-sm text-muted">
          Flows are saved in the browser they were made in. It may have been deleted, or made on another device.
        </p>
        <Link href="/" className="mt-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-fg">
          See all flows
        </Link>
      </main>
    );
  }

  if (status !== "ready" || openId !== flowId) {
    return (
      <main className="flex flex-1 items-center justify-center text-sm text-muted" aria-busy="true">
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
      <div className="flex min-h-0 flex-1">
        <Palette />
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1">
            <Canvas />
          </div>
          <BottomPanel />
        </main>
        <Inspector />
      </div>
      <SettingsDialog />
    </div>
  );
}
