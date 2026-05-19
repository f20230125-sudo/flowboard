"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Copy, CornerDownLeft } from "lucide-react";
import type { Json } from "@/engine/reference";

// Shows a piece of data as a tree that opens and closes. When it is given a
// `path` (such as "steps.weather"), every row offers its own reference, so
// {{ steps.weather.body.temp }} can be copied or inserted instead of typed.

const PAGE = 50;
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** The reference path of a child: a.b, a[0] or a["some key"]. */
export function childPath(parent: string, key: string | number): string {
  if (typeof key === "number") return `${parent}[${key}]`;
  return IDENTIFIER.test(key) ? `${parent}.${key}` : `${parent}[${JSON.stringify(key)}]`;
}

function Scalar({ value }: { value: Exclude<Json, Json[] | { [key: string]: Json }> }) {
  if (value === null) return <span className="text-faint">null</span>;
  if (typeof value === "string") {
    return <span className="break-all text-ok">&quot;{value.length > 600 ? `${value.slice(0, 600)}…` : value}&quot;</span>;
  }
  if (typeof value === "boolean") return <span className="text-warn">{String(value)}</span>;
  return <span className="text-accent">{String(value)}</span>;
}

/** What the button on a row does with the row's reference. */
type PickAction = "copy" | "insert";

type RowProps = {
  label: string | null;
  value: Json;
  path: string | null;
  depth: number;
  openDepth: number;
  action: PickAction;
  onPick?: (reference: string) => void;
};

function Row({ label, value, path, depth, openDepth, action, onPick }: RowProps) {
  const isBranch = value !== null && typeof value === "object";
  const entries: [string | number, Json][] = !isBranch
    ? []
    : Array.isArray(value)
      ? value.map((entry, index) => [index, entry])
      : Object.entries(value);

  const [open, setOpen] = useState(depth < openDepth);
  const [shown, setShown] = useState(PAGE);

  const summary = !isBranch
    ? null
    : Array.isArray(value)
      ? `${value.length} ${value.length === 1 ? "item" : "items"}`
      : `${entries.length} ${entries.length === 1 ? "field" : "fields"}`;

  return (
    <li>
      <div className="group flex min-h-6 items-start gap-1 rounded px-1 hover:bg-surface-2">
        {isBranch ? (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-label={`${open ? "Close" : "Open"} ${label ?? "the data"}`}
            className="mt-0.5 flex h-5 w-4 shrink-0 items-center justify-center text-faint hover:text-fg"
          >
            {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}

        <span className="min-w-0 flex-1 py-0.5 leading-5">
          {label !== null && <span className="text-muted">{label}: </span>}
          {isBranch ? <span className="text-faint">{summary}</span> : <Scalar value={value} />}
        </span>

        {path && onPick && action === "copy" && (
          <button
            type="button"
            onClick={() => onPick(`{{ ${path} }}`)}
            title={`Copy {{ ${path} }}`}
            aria-label={`Copy the reference to ${path}`}
            className="mt-0.5 flex h-5 shrink-0 items-center gap-1 rounded px-1 text-[10px] font-medium text-accent opacity-0 hover:bg-accent-soft focus-visible:opacity-100 group-hover:opacity-100"
          >
            <Copy size={11} /> ref
          </button>
        )}
        {/* Inserting is what the list is for, so the button does not hide. */}
        {path && onPick && action === "insert" && (
          <button
            type="button"
            onClick={() => onPick(`{{ ${path} }}`)}
            title={`Insert {{ ${path} }}`}
            aria-label={`Insert the reference to ${path}`}
            className="mt-0.5 flex h-5 shrink-0 items-center gap-1 rounded px-1 text-[10px] font-medium text-accent hover:bg-accent-soft"
          >
            <CornerDownLeft size={11} /> insert
          </button>
        )}
      </div>

      {isBranch && open && (
        <ul className="ml-[11px] border-l border-line pl-1.5">
          {entries.slice(0, shown).map(([key, entry]) => (
            <Row
              key={key}
              label={String(key)}
              value={entry}
              path={path === null ? null : childPath(path, key)}
              depth={depth + 1}
              openDepth={openDepth}
              action={action}
              onPick={onPick}
            />
          ))}
          {entries.length > shown && (
            <li>
              <button
                type="button"
                onClick={() => setShown(shown + PAGE)}
                className="ml-5 rounded px-1 py-0.5 text-[11px] font-medium text-accent hover:bg-accent-soft"
              >
                Show {Math.min(PAGE, entries.length - shown)} more of {entries.length - shown}
              </button>
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

type JsonTreeProps = {
  value: Json;
  /** Where this data sits, as a reference: "steps.weather". Omit to hide the buttons. */
  path?: string;
  /** A name for the top row, for when several trees are listed together. */
  label?: string;
  /** How many levels start open. */
  openDepth?: number;
  action?: PickAction;
  onPick?: (reference: string) => void;
};

export function JsonTree({ value, path, label, openDepth = 2, action = "copy", onPick }: JsonTreeProps) {
  return (
    <ul className="font-mono text-[12px]">
      <Row label={label ?? null} value={value} path={path ?? null} depth={0} openDepth={openDepth} action={action} onPick={onPick} />
    </ul>
  );
}
