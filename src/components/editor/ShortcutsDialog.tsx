"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { selectShortcutsOpen } from "@/store/selectors";
import { uiActions } from "@/store/uiSlice";
import { IconButton, Kbd } from "../ui";

const SHORTCUTS: [string[], string][] = [
  [["Ctrl", "Enter"], "Run the flow"],
  [["Ctrl", "Z"], "Undo"],
  [["Ctrl", "Y"], "Redo"],
  [["Ctrl", "C"], "Copy the selected blocks"],
  [["Ctrl", "X"], "Cut the selected blocks"],
  [["Ctrl", "V"], "Paste blocks, also from another flow"],
  [["Ctrl", "D"], "Duplicate the selection"],
  [["Ctrl", "A"], "Select everything"],
  [["Delete"], "Delete the selection"],
  [["Esc"], "Clear the selection"],
  [["Shift", "drag"], "Select several blocks"],
  [["Arrow keys"], "Move the selected blocks"],
  [["?"], "Show this list"],
];

/** The list of keyboard shortcuts, opened with "?" or from the menu. */
export function ShortcutsDialog() {
  const open = useAppSelector(selectShortcutsOpen);
  return open ? <ShortcutsList /> : null;
}

function ShortcutsList() {
  const dispatch = useAppDispatch();
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      onClose={() => dispatch(uiActions.shortcutsToggled(false))}
      onClick={(event) => {
        if (event.target === dialog.current) dialog.current?.close();
      }}
      aria-labelledby="shortcuts-title"
      className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-0 text-fg shadow-panel backdrop:bg-black/50"
    >
      <header className="flex items-center justify-between border-b border-line p-4">
        <h2 id="shortcuts-title" className="text-base font-semibold">
          Keyboard shortcuts
        </h2>
        <IconButton label="Close" onClick={() => dialog.current?.close()}>
          <X size={16} />
        </IconButton>
      </header>
      <dl className="space-y-2.5 p-4">
        {SHORTCUTS.map(([keys, what]) => (
          <div key={what} className="flex items-center justify-between gap-4 text-[13px]">
            <dt className="text-muted">{what}</dt>
            <dd className="flex shrink-0 items-center gap-1">
              {keys.map((key) => (
                <Kbd key={key}>{key}</Kbd>
              ))}
            </dd>
          </div>
        ))}
      </dl>
      <p className="border-t border-line px-4 py-3 text-[11px] text-faint">On a Mac, use Cmd in place of Ctrl.</p>
    </dialog>
  );
}
