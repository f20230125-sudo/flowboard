// References let one block use another block's data:
//
//   {{ steps.getUser.body.name }}    {{ input.items[0] }}    {{ trigger.city }}
//
// A reference is a path lookup and nothing else. There is no eval and no
// expression language, so an imported or shared flow can never run code.

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** What a reference can start with. `item` only exists inside a Filter list block. */
export const ROOTS = ["steps", "input", "trigger", "item"] as const;
export type Root = (typeof ROOTS)[number];

export type Scope = { steps: Record<string, Json>; input: Json; trigger: Json; item?: Json };

export type Segment = string | number;

export class ReferenceSyntaxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReferenceSyntaxError";
  }
}

// Reading these through a path would reach into JavaScript's own machinery.
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*/;

/** Split `steps.a.b[0]["some key"]` into ["steps", "a", "b", 0, "some key"]. */
export function parsePath(expression: string): Segment[] {
  const text = expression.trim();
  if (text === "") throw new ReferenceSyntaxError("The reference is empty.");

  const segments: Segment[] = [];
  let at = 0;

  const readIdentifier = () => {
    const match = IDENTIFIER.exec(text.slice(at));
    if (!match) throw new ReferenceSyntaxError(`Expected a name at position ${at + 1} in "${text}".`);
    segments.push(match[0]);
    at += match[0].length;
  };

  readIdentifier();
  while (at < text.length) {
    const char = text[at];
    if (char === ".") {
      at += 1;
      readIdentifier();
    } else if (char === "[") {
      const close = text.indexOf("]", at);
      if (close === -1) throw new ReferenceSyntaxError(`Missing "]" in "${text}".`);
      const inner = text.slice(at + 1, close).trim();
      if (/^\d+$/.test(inner)) {
        segments.push(Number(inner));
      } else if (/^"[^"]*"$/.test(inner) || /^'[^']*'$/.test(inner)) {
        segments.push(inner.slice(1, -1));
      } else {
        throw new ReferenceSyntaxError(`Inside [ ] use a number or a quoted name, in "${text}".`);
      }
      at = close + 1;
    } else {
      throw new ReferenceSyntaxError(`Unexpected "${char}" in "${text}".`);
    }
  }

  for (const segment of segments) {
    if (typeof segment === "string" && FORBIDDEN_KEYS.has(segment)) {
      throw new ReferenceSyntaxError(`"${segment}" cannot be used in a reference.`);
    }
  }
  return segments;
}

/** Follow a parsed path through the data. Anything missing gives `undefined`. */
export function resolvePath(scope: Scope, segments: readonly Segment[]): Json | undefined {
  let current: unknown = scope;
  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      if (segment === "length") current = current.length;
      else if (typeof segment === "number") current = current[segment];
      else return undefined;
    } else if (typeof current === "string") {
      if (segment === "length") current = current.length;
      else return undefined;
    } else if (typeof current === "object") {
      const key = String(segment);
      if (!Object.hasOwn(current, key)) return undefined;
      current = (current as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  return current as Json | undefined;
}

export type FoundReference = {
  /** The whole `{{ ... }}` as written. */
  raw: string;
  /** The text between the braces, trimmed. */
  expression: string;
  start: number;
  end: number;
  /** The parsed path, or null when it does not parse. */
  path: Segment[] | null;
  error: string | null;
};

const REFERENCE = /\{\{([^{}]*)\}\}/g;

/** Every reference in a piece of text, parsed. Used by rendering and by validation. */
export function findReferences(text: string): FoundReference[] {
  const found: FoundReference[] = [];
  for (const match of text.matchAll(REFERENCE)) {
    const expression = match[1].trim();
    let path: Segment[] | null = null;
    let error: string | null = null;
    try {
      path = parsePath(expression);
    } catch (problem) {
      error = problem instanceof Error ? problem.message : String(problem);
    }
    found.push({ raw: match[0], expression, start: match.index, end: match.index + match[0].length, path, error });
  }
  return found;
}

function asText(value: Json | undefined): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * Fill in the references in `text`.
 *
 * When the text is one reference and nothing else, the value keeps its type,
 * so `{{ steps.getUser.body }}` gives the object, not its text. Otherwise every
 * reference is written into the surrounding text. A reference to something
 * that does not exist gives null (alone) or nothing (inside text).
 */
export function render(text: string, scope: Scope): Json {
  const references = findReferences(text);
  if (references.length === 0) return text;

  for (const reference of references) {
    if (reference.error) throw new ReferenceSyntaxError(reference.error);
  }

  const only = references[0];
  if (references.length === 1 && text.trim() === only.raw) {
    return resolvePath(scope, only.path!) ?? null;
  }

  let result = "";
  let last = 0;
  for (const reference of references) {
    result += text.slice(last, reference.start) + asText(resolvePath(scope, reference.path!));
    last = reference.end;
  }
  return result + text.slice(last);
}

/** Like `render`, but always text. For addresses, header values and prompts. */
export function renderText(text: string, scope: Scope): string {
  return asText(render(text, scope));
}

/**
 * Read a value typed into a settings field.
 *
 * - Plain text that is a number, true, false, null or JSON becomes that, so
 *   typing 42 gives the number 42.
 * - A reference on its own keeps the type of the data it points at. Data is
 *   never re-read: the text "42" from an API stays text.
 * - JSON written around references, such as {"name": "{{ input.name }}"},
 *   is parsed once the references are filled in.
 */
export function renderValue(text: string, scope: Scope): Json {
  const references = findReferences(text);
  if (references.length === 0) return coerce(text);

  const value = render(text, scope);
  const wholeReference = references.length === 1 && text.trim() === references[0].raw;
  if (wholeReference || typeof value !== "string") return value;

  const trimmed = value.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[") ? coerce(value) : value;
}

export function coerce(text: string): Json {
  const trimmed = text.trim();
  if (trimmed === "") return text;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  // No leading zeros: "007" is a code or a phone number, not the number 7.
  if (/^-?(0|[1-9]\d*)(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed) as Json;
    } catch {
      return text;
    }
  }
  return text;
}
