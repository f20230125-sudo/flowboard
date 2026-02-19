"use client";

import { useEffect } from "react";
import { copySelection, duplicateSelection, pasteBlocks } from "@/store/editorThunks";
import { flowActions } from "@/store/flowSlice";
import { useAppDispatch } from "@/store/hooks";
import { startRun } from "@/store/runThunks";

/** True while the visitor is typing in a field, where keys mean text. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * Keyboard shortcuts for the editor: run, undo, redo, delete, duplicate,
 * select all, and copy/cut/paste of blocks.
 *
 * Copy and paste use the browser's own clipboard events, so blocks can be
 * pasted into another flow or another tab, and no permission prompt appears.
 */
export function useEditorShortcuts(): void {
  const dispatch = useAppDispatch();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      // Run works from anywhere, including while typing in a field.
      if (mod && key === "enter") {
        event.preventDefault();
        dispatch(startRun());
        return;
      }
      if (isTyping(event.target)) return;

      if (mod && key === "z" && !event.shiftKey) {
        event.preventDefault();
        dispatch(flowActions.undo());
      } else if (mod && (key === "y" || (key === "z" && event.shiftKey))) {
        event.preventDefault();
        dispatch(flowActions.redo());
      } else if (mod && key === "d") {
        event.preventDefault();
        dispatch(duplicateSelection());
      } else if (mod && key === "a") {
        event.preventDefault();
        dispatch(flowActions.allSelected());
      } else if (key === "delete" || key === "backspace") {
        event.preventDefault();
        dispatch(flowActions.selectionDeleted());
      } else if (key === "escape") {
        dispatch(flowActions.selectionSet({ nodeIds: [] }));
      }
    };

    const onCopy = (event: ClipboardEvent) => {
      // Leave the browser alone when text is selected or a field has focus.
      if (isTyping(event.target) || window.getSelection()?.toString()) return;
      const text = dispatch(copySelection());
      if (!text) return;
      event.clipboardData?.setData("text/plain", text);
      event.preventDefault();
    };

    const onCut = (event: ClipboardEvent) => {
      if (isTyping(event.target) || window.getSelection()?.toString()) return;
      const text = dispatch(copySelection());
      if (!text) return;
      event.clipboardData?.setData("text/plain", text);
      event.preventDefault();
      dispatch(flowActions.selectionDeleted());
    };

    const onPaste = (event: ClipboardEvent) => {
      if (isTyping(event.target)) return;
      const text = event.clipboardData?.getData("text/plain") ?? "";
      if (dispatch(pasteBlocks(text))) event.preventDefault();
    };

    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCut);
    document.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCut);
      document.removeEventListener("paste", onPaste);
    };
  }, [dispatch]);
}
