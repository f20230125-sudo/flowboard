"use client";

import { createContext, useContext, useId, useState } from "react";
import { Braces } from "lucide-react";
import type { ReferenceSource } from "@/store/selectors";
import { JsonTree } from "./JsonTree";
import { STATUS_LABELS } from "./runText";

// Lets a setting take a value from an earlier step with a click, instead of
// typing its reference. The settings panel says what the open block can read
// (`ReferenceSources`), and every field that accepts references offers it.

const Sources = createContext<readonly ReferenceSource[] | null>(null);
export const ReferenceSources = Sources.Provider;

/** Put `insert` where the cursor was, replacing whatever was selected. */
export function insertAt(text: string, insert: string, start: number, end: number): { text: string; caret: number } {
  const from = Math.max(0, Math.min(start, text.length));
  const to = Math.max(from, Math.min(end, text.length));
  return { text: text.slice(0, from) + insert + text.slice(to), caret: from + insert.length };
}

type TextBox = HTMLInputElement | HTMLTextAreaElement;

/**
 * The pieces a field needs to offer the picker: `remember` goes on the input
 * with the id `fieldId`, `button` sits inside it, and `panel` goes underneath.
 * `button` and `panel` are null where there is nothing to pick from, or when
 * the field is switched off with `enabled`.
 */
export function useReferencePicker(
  fieldId: string,
  value: string,
  onChange: (value: string) => void,
  label: string,
  enabled = true,
) {
  const sources = useContext(Sources);
  // Where the cursor was when the field was left, which is where a value goes.
  const [cursor, setCursor] = useState<[number, number] | null>(null);
  const [open, setOpen] = useState(false);
  const panelId = useId();

  const remember = (event: { currentTarget: TextBox }) => {
    const { selectionStart, selectionEnd } = event.currentTarget;
    setCursor(selectionStart === null || selectionEnd === null ? null : [selectionStart, selectionEnd]);
  };

  if (!enabled || sources === null) return { remember, button: null, panel: null };

  const backToField = (at?: number) => {
    // After the field has been drawn with its new text.
    requestAnimationFrame(() => {
      const box = document.getElementById(fieldId) as TextBox | null;
      box?.focus();
      if (at !== undefined) box?.setSelectionRange(at, at);
    });
  };

  const pick = (reference: string) => {
    const [start, end] = cursor ?? [value.length, value.length];
    const next = insertAt(value, reference, start, end);
    setCursor([next.caret, next.caret]);
    onChange(next.text);
    setOpen(false);
    backToField(next.caret);
  };

  const button = (
    <button
      type="button"
      aria-label={`Insert a value into ${label}`}
      title="Insert a value from an earlier step"
      aria-expanded={open}
      aria-controls={open ? panelId : undefined}
      onClick={() => setOpen(!open)}
      className={`absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-accent-soft hover:text-accent ${
        open ? "bg-accent-soft text-accent" : "text-faint"
      }`}
    >
      <Braces size={13} />
    </button>
  );

  const panel = open && (
    <div
      id={panelId}
      role="group"
      aria-label={`Values to insert into ${label}`}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        setOpen(false);
        backToField();
      }}
      className="mt-1.5 max-h-60 overflow-y-auto rounded-lg border border-line bg-bg p-1.5"
    >
      {sources.length === 0 ? (
        <p className="px-1 py-0.5 text-[11px] leading-relaxed text-muted">
          Nothing runs before this block yet. Connect it after another block to use that block&apos;s data.
        </p>
      ) : (
        <>
          <p className="px-1 pb-1 text-[11px] leading-relaxed text-muted">Press “insert” on the value to use.</p>
          {sources.map((source) =>
            source.value === undefined ? (
              <button
                key={source.path}
                type="button"
                onClick={() => pick(`{{ ${source.path} }}`)}
                title={`Insert {{ ${source.path} }}`}
                className="flex min-h-6 w-full items-center gap-2 rounded px-1 text-left font-mono text-[12px] hover:bg-surface-2"
              >
                <span className="min-w-0 flex-1 truncate text-muted">{source.path}</span>
                <span className="shrink-0 font-sans text-[10px] text-muted">
                  {source.status ? `${STATUS_LABELS[source.status].toLowerCase()} in the last run` : "run the flow to see inside"}
                </span>
              </button>
            ) : (
              <JsonTree
                key={source.path}
                value={source.value}
                path={source.path}
                label={source.path}
                openDepth={1}
                action="insert"
                onPick={pick}
              />
            ),
          )}
        </>
      )}
    </div>
  );

  return { remember, button, panel };
}
