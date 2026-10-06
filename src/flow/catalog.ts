import { CONFIG_SCHEMAS, HTTP_METHODS, type ConfigOf, type NodeType } from "./schema";

// One entry per kind of block. The palette, the block on the canvas and the
// settings form are all drawn from this, so adding a block means adding an
// entry here and an executor in src/engine/executors.ts.

export type FieldKind =
  | "text" // one line, may hold references
  | "textarea" // several lines, may hold references
  | "json" // JSON text, checked as you type
  | "number"
  | "select"
  | "toggle"
  | "pairs" // a list of name/value rows
  | "operator"; // the comparison of a Condition or Filter list

export type FieldSpec = {
  key: string;
  label: string;
  kind: FieldKind;
  placeholder?: string;
  help?: string;
  options?: readonly string[];
  /** What to show for an option, when its value is not friendly enough. */
  optionLabels?: Record<string, string>;
  min?: number;
  max?: number;
  step?: number;
  /** Labels for the two columns of a "pairs" field. */
  pairLabels?: [string, string];
  /** The text is used exactly as typed: references in it are not filled in. */
  literal?: boolean;
  /** Hide the field unless this returns true for the block's settings. */
  showWhen?: (config: Record<string, unknown>) => boolean;
};

export type SourceHandle = { id: string; label?: string };

export type BlockSpec<T extends NodeType = NodeType> = {
  type: T;
  title: string;
  /** One line for the palette. */
  summary: string;
  group: "Start" | "Actions" | "Logic" | "Data" | "Finish";
  /** Names of new blocks start with this: http1, http2, ... */
  namePrefix: string;
  /** Whether other blocks can connect into it. */
  hasInput: boolean;
  outputs: readonly SourceHandle[];
  fields: readonly FieldSpec[];
};

const isUnaryOperator = (config: Record<string, unknown>) =>
  config.operator === "isEmpty" || config.operator === "isNotEmpty";

const OUT: readonly SourceHandle[] = [{ id: "out" }];

export const CATALOG: { [T in NodeType]: BlockSpec<T> } = {
  trigger: {
    type: "trigger",
    title: "Manual trigger",
    summary: "Starts the flow when you press Run",
    group: "Start",
    namePrefix: "start",
    hasInput: false,
    outputs: OUT,
    fields: [
      {
        key: "payload",
        label: "Sample data",
        kind: "json",
        placeholder: '{ "city": "Dubai" }',
        help: "JSON handed to the flow. Use it anywhere as {{ trigger.city }}.",
      },
    ],
  },
  http: {
    type: "http",
    title: "HTTP request",
    summary: "Call any REST API",
    group: "Actions",
    namePrefix: "http",
    hasInput: true,
    outputs: OUT,
    fields: [
      { key: "method", label: "Method", kind: "select", options: HTTP_METHODS },
      { key: "url", label: "Address", kind: "text", placeholder: "https://api.example.com/items" },
      { key: "query", label: "Query parameters", kind: "pairs", pairLabels: ["Name", "Value"] },
      { key: "headers", label: "Headers", kind: "pairs", pairLabels: ["Header", "Value"] },
      {
        key: "body",
        label: "Body",
        kind: "textarea",
        placeholder: '{ "title": "{{ trigger.title }}" }',
        showWhen: (config) => config.method !== "GET",
      },
      { key: "failOnError", label: "Fail the step on a 4xx or 5xx answer", kind: "toggle" },
      {
        key: "via",
        label: "Send from",
        kind: "select",
        options: ["browser", "server"],
        optionLabels: { browser: "Your browser", server: "Flowboard's server" },
        help: "Some APIs refuse calls from a browser. For those, send the call through Flowboard's server.",
      },
      { key: "timeoutMs", label: "Give up after (ms)", kind: "number", min: 1000, max: 30000, step: 1000 },
      {
        key: "retries",
        label: "Extra tries",
        kind: "number",
        min: 0,
        max: 3,
        step: 1,
        help: "Calls again when the server is busy or cannot be reached (429, 502, 503, 504, or no answer in time), waiting a little longer each time. Leave at 0 for a call that must not happen twice.",
      },
    ],
  },
  condition: {
    type: "condition",
    title: "Condition",
    summary: "Take one of two paths",
    group: "Logic",
    namePrefix: "check",
    hasInput: true,
    outputs: [
      { id: "true", label: "True" },
      { id: "false", label: "False" },
    ],
    fields: [
      { key: "left", label: "Value", kind: "text", placeholder: "{{ steps.http1.body.temperature }}" },
      { key: "operator", label: "Comparison", kind: "operator" },
      { key: "right", label: "Compare with", kind: "text", placeholder: "35", showWhen: (c) => !isUnaryOperator(c) },
    ],
  },
  set: {
    type: "set",
    title: "Set fields",
    summary: "Build a new object from values",
    group: "Data",
    namePrefix: "fields",
    hasInput: true,
    outputs: OUT,
    fields: [
      {
        key: "fields",
        label: "Fields",
        kind: "pairs",
        pairLabels: ["Field", "Value"],
        help: "A dot in the name nests the field: user.name. Numbers, true and false keep their type.",
      },
    ],
  },
  filter: {
    type: "filter",
    title: "Filter list",
    summary: "Keep the items that match",
    group: "Data",
    namePrefix: "filter",
    hasInput: true,
    outputs: OUT,
    fields: [
      { key: "list", label: "List", kind: "text", placeholder: "{{ steps.http1.body }}" },
      {
        key: "left",
        label: "Keep an item when",
        kind: "text",
        placeholder: "{{ item.stars }}",
        help: "{{ item }} is the item being looked at.",
      },
      { key: "operator", label: "Comparison", kind: "operator" },
      { key: "right", label: "Compare with", kind: "text", placeholder: "10", showWhen: (c) => !isUnaryOperator(c) },
    ],
  },
  ai: {
    type: "ai",
    title: "AI step",
    summary: "Ask a language model",
    group: "Actions",
    namePrefix: "ai",
    hasInput: true,
    outputs: OUT,
    fields: [
      { key: "system", label: "Instructions", kind: "textarea", placeholder: "You sort support tickets by urgency." },
      { key: "prompt", label: "Prompt", kind: "textarea", placeholder: "Sort this ticket: {{ trigger.ticket }}" },
      { key: "json", label: "Expect JSON back", kind: "toggle" },
      {
        key: "sample",
        label: "Sample reply",
        kind: "textarea",
        literal: true,
        help: "Used when no key is set in Settings, and shown as a sample.",
      },
      { key: "model", label: "Model", kind: "text", literal: true, placeholder: "Leave empty to use the one in Settings" },
      { key: "temperature", label: "Temperature", kind: "number", min: 0, max: 2, step: 0.1 },
    ],
  },
  delay: {
    type: "delay",
    title: "Delay",
    summary: "Wait before carrying on",
    group: "Logic",
    namePrefix: "wait",
    hasInput: true,
    outputs: OUT,
    fields: [{ key: "ms", label: "Wait (ms)", kind: "number", min: 0, max: 60000, step: 100 }],
  },
  output: {
    type: "output",
    title: "Output",
    summary: "The result of the flow",
    group: "Finish",
    namePrefix: "result",
    hasInput: true,
    outputs: [],
    fields: [
      {
        key: "value",
        label: "Value",
        kind: "textarea",
        placeholder: "Leave empty to show whatever arrives",
      },
    ],
  },
};

export const BLOCK_GROUPS = ["Start", "Actions", "Logic", "Data", "Finish"] as const;

/** A fresh copy of a block's default settings, straight from its schema. */
export function defaultConfig<T extends NodeType>(type: T): ConfigOf<T> {
  return CONFIG_SCHEMAS[type].parse({}) as ConfigOf<T>;
}
