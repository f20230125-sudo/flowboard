import { findReferences } from "@/engine/reference";
import type { FlowNode } from "./schema";

// When a block is renamed, every reference to it is rewritten, so
// {{ steps.http1.body }} keeps working as {{ steps.getWeather.body }}.

/** Rewrite `steps.oldName` to `steps.newName` in one piece of text. */
export function renameInText(text: string, oldName: string, newName: string): string {
  let result = "";
  let last = 0;
  for (const reference of findReferences(text)) {
    const path = reference.path;
    if (!path || path[0] !== "steps" || path[1] !== oldName) continue;
    // Replace only the name, which is the first "oldName" after "steps".
    const renamed = reference.raw.replace(
      new RegExp(`(steps\\s*\\.\\s*)${oldName}(?![A-Za-z0-9_$])`),
      `$1${newName}`,
    );
    result += text.slice(last, reference.start) + renamed;
    last = reference.end;
  }
  return result + text.slice(last);
}

function mapTexts(value: unknown, change: (text: string) => string): unknown {
  if (typeof value === "string") return change(value);
  if (Array.isArray(value)) return value.map((entry) => mapTexts(entry, change));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, mapTexts(entry, change)]));
  }
  return value;
}

/** A copy of the block's settings with every reference to `oldName` renamed. */
export function renameInConfig<T extends FlowNode["config"]>(config: T, oldName: string, newName: string): T {
  return mapTexts(config, (text) => (text.includes("{{") ? renameInText(text, oldName, newName) : text)) as T;
}
