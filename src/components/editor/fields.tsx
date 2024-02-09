"use client";

import { useId, useState } from "react";
import { Plus, X } from "lucide-react";
import { OPERATOR_LABELS } from "@/engine/condition";
import type { FieldSpec } from "@/flow/catalog";
import { OPERATORS, type KeyValue } from "@/flow/schema";

// The inputs a block's settings are made of. Which ones a block gets is
// decided by its entry in the catalogue, not here.

const INPUT =
  "w-full rounded-lg border border-line bg-bg px-2.5 text-[13px] text-fg placeholder:text-faint transition-colors hover:border-line-strong";
const MONO = "font-mono text-[12.5px]";

type FieldProps = {
  spec: FieldSpec;
  value: unknown;
  onChange: (value: unknown) => void;
};

function Label({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-muted">
      {children}
    </label>
  );
}

function Help({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-[11px] leading-relaxed text-faint">{children}</p>;
}

function TextField({ spec, value, onChange }: FieldProps) {
  const id = useId();
  return (
    <div>
      <Label htmlFor={id}>{spec.label}</Label>
      <input
        id={id}
        type="text"
        value={String(value ?? "")}
        onChange={(event) => onChange(event.target.value)}
        placeholder={spec.placeholder}
        spellCheck={false}
        autoComplete="off"
        className={`${INPUT} ${MONO} h-8`}
      />
      {spec.help && <Help>{spec.help}</Help>}
    </div>
  );
}

function TextAreaField({ spec, value, onChange }: FieldProps) {
  const id = useId();
  return (
    <div>
      <Label htmlFor={id}>{spec.label}</Label>
      <textarea
        id={id}
        value={String(value ?? "")}
        onChange={(event) => onChange(event.target.value)}
        placeholder={spec.placeholder}
        spellCheck={false}
        rows={3}
        // Grows with its content where the browser supports it.
        style={{ fieldSizing: "content" } as React.CSSProperties}
        className={`${INPUT} ${MONO} max-h-64 min-h-[4.5rem] resize-y py-1.5 leading-relaxed`}
      />
      {spec.help && <Help>{spec.help}</Help>}
    </div>
  );
}

function jsonProblem(text: string): string | null {
  if (text.trim() === "") return null;
  try {
    JSON.parse(text);
    return null;
  } catch (problem) {
    return (problem as Error).message;
  }
}

function JsonField({ spec, value, onChange }: FieldProps) {
  const id = useId();
  const text = String(value ?? "");
  const problem = jsonProblem(text);
  return (
    <div>
      <Label htmlFor={id}>{spec.label}</Label>
      <textarea
        id={id}
        value={text}
        onChange={(event) => onChange(event.target.value)}
        placeholder={spec.placeholder}
        spellCheck={false}
        rows={4}
        aria-invalid={problem !== null}
        aria-describedby={`${id}-state`}
        style={{ fieldSizing: "content" } as React.CSSProperties}
        className={`${INPUT} ${MONO} max-h-64 min-h-[5.5rem] resize-y py-1.5 leading-relaxed ${problem ? "border-bad" : ""}`}
      />
      <p id={`${id}-state`} className={`mt-1 text-[11px] ${problem ? "text-bad" : "text-faint"}`}>
        {problem ? `Not valid JSON: ${problem}` : spec.help}
      </p>
    </div>
  );
}

/**
 * A number is typed into a local draft and only becomes the setting when the
 * field is left or Enter is pressed. Otherwise typing "5000" into a field with
 * a minimum of 1000 would be corrected after the first digit.
 */
function NumberField({ spec, value, onChange }: FieldProps) {
  const id = useId();
  const [draft, setDraft] = useState(String(value ?? ""));

  const commit = () => {
    const parsed = Number(draft);
    if (draft.trim() === "" || Number.isNaN(parsed)) {
      setDraft(String(value ?? ""));
      return;
    }
    const whole = Number.isInteger(spec.step ?? 1) ? Math.round(parsed) : parsed;
    const clamped = Math.min(spec.max ?? Infinity, Math.max(spec.min ?? -Infinity, whole));
    setDraft(String(clamped));
    if (clamped !== value) onChange(clamped);
  };

  return (
    <div>
      <Label htmlFor={id}>{spec.label}</Label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        value={draft}
        min={spec.min}
        max={spec.max}
        step={spec.step}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
        }}
        className={`${INPUT} ${MONO} h-8`}
      />
      {spec.help && <Help>{spec.help}</Help>}
    </div>
  );
}

function SelectField({ spec, value, onChange, labels }: FieldProps & { labels?: Record<string, string> }) {
  const id = useId();
  return (
    <div>
      <Label htmlFor={id}>{spec.label}</Label>
      <select
        id={id}
        value={String(value ?? "")}
        onChange={(event) => onChange(event.target.value)}
        className={`${INPUT} h-8 cursor-pointer`}
      >
        {(spec.options ?? []).map((option) => (
          <option key={option} value={option}>
            {labels?.[option] ?? spec.optionLabels?.[option] ?? option}
          </option>
        ))}
      </select>
      {spec.help && <Help>{spec.help}</Help>}
    </div>
  );
}

function ToggleField({ spec, value, onChange }: FieldProps) {
  const on = value === true;
  return (
    <div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className="group flex w-full items-center justify-between gap-3 rounded-lg py-0.5 text-left"
      >
        <span className="text-xs font-medium text-muted group-hover:text-fg">{spec.label}</span>
        <span
          aria-hidden
          className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${on ? "bg-accent" : "bg-line-strong"}`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-surface shadow transition-[left] ${on ? "left-[18px]" : "left-0.5"}`}
          />
        </span>
      </button>
      {spec.help && <Help>{spec.help}</Help>}
    </div>
  );
}

function PairsField({ spec, value, onChange }: FieldProps) {
  const pairs = (Array.isArray(value) ? value : []) as KeyValue[];
  const [nameLabel, valueLabel] = spec.pairLabels ?? ["Name", "Value"];

  const change = (index: number, patch: Partial<KeyValue>) =>
    onChange(pairs.map((pair, at) => (at === index ? { ...pair, ...patch } : pair)));

  return (
    <fieldset>
      <legend className="mb-1 block text-xs font-medium text-muted">{spec.label}</legend>
      <div className="space-y-1.5">
        {pairs.map((pair, index) => (
          <div key={index} className="flex items-center gap-1.5">
            <input
              type="text"
              value={pair.key}
              onChange={(event) => change(index, { key: event.target.value })}
              placeholder={nameLabel}
              aria-label={`${spec.label}: ${nameLabel.toLowerCase()} ${index + 1}`}
              spellCheck={false}
              autoComplete="off"
              className={`${INPUT} ${MONO} h-8 w-[38%]`}
            />
            <input
              type="text"
              value={pair.value}
              onChange={(event) => change(index, { value: event.target.value })}
              placeholder={valueLabel}
              aria-label={`${spec.label}: ${valueLabel.toLowerCase()} ${index + 1}`}
              spellCheck={false}
              autoComplete="off"
              className={`${INPUT} ${MONO} h-8 min-w-0 flex-1`}
            />
            <button
              type="button"
              aria-label={`Remove ${nameLabel.toLowerCase()} ${index + 1}`}
              title="Remove"
              onClick={() => onChange(pairs.filter((_pair, at) => at !== index))}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-faint hover:bg-surface-2 hover:text-bad"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...pairs, { key: "", value: "" }])}
        className="mt-1.5 inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-xs font-medium text-accent hover:bg-accent-soft"
      >
        <Plus size={13} /> Add {nameLabel.toLowerCase()}
      </button>
      {spec.help && <Help>{spec.help}</Help>}
    </fieldset>
  );
}

/** Draw the right input for one setting. */
export function Field(props: FieldProps) {
  switch (props.spec.kind) {
    case "text":
      return <TextField {...props} />;
    case "textarea":
      return <TextAreaField {...props} />;
    case "json":
      return <JsonField {...props} />;
    case "number":
      // Remount when the value changes from outside (undo), so the draft follows it.
      return <NumberField key={String(props.value)} {...props} />;
    case "select":
      return <SelectField {...props} />;
    case "toggle":
      return <ToggleField {...props} />;
    case "pairs":
      return <PairsField {...props} />;
    case "operator":
      return <SelectField {...props} spec={{ ...props.spec, options: OPERATORS }} labels={OPERATOR_LABELS} />;
  }
}
