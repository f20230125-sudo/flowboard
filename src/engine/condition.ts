import { UNARY_OPERATORS, type Operator } from "@/flow/schema";
import type { Json } from "./reference";

// The comparisons a Condition or Filter list block can make. A fixed list of
// operators, not an expression language: nothing here can run code.

export const OPERATOR_LABELS: Record<Operator, string> = {
  equals: "equals",
  notEquals: "does not equal",
  greaterThan: "is greater than",
  greaterOrEqual: "is at least",
  lessThan: "is less than",
  lessOrEqual: "is at most",
  contains: "contains",
  notContains: "does not contain",
  startsWith: "starts with",
  endsWith: "ends with",
  isEmpty: "is empty",
  isNotEmpty: "is not empty",
};

export function isUnary(operator: Operator): boolean {
  return UNARY_OPERATORS.includes(operator);
}

function asNumber(value: Json): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && /^\s*-?\d+(\.\d+)?\s*$/.test(value)) return Number(value);
  return null;
}

function asText(value: Json): string {
  if (value === null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** Empty means: nothing, blank text, an empty list or an empty object. */
export function isEmpty(value: Json): boolean {
  if (value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

/** Numbers compare as numbers ("10" equals 10); everything else as text. */
function looselyEqual(left: Json, right: Json): boolean {
  const a = asNumber(left);
  const b = asNumber(right);
  if (a !== null && b !== null) return a === b;
  return asText(left) === asText(right);
}

/** Below zero when left sorts first, above zero when right does. */
function order(left: Json, right: Json): number {
  const a = asNumber(left);
  const b = asNumber(right);
  if (a !== null && b !== null) return a - b;
  // Text order makes ISO dates such as 2026-10-05 compare correctly.
  const x = asText(left);
  const y = asText(right);
  return x < y ? -1 : x > y ? 1 : 0;
}

function contains(left: Json, right: Json): boolean {
  if (Array.isArray(left)) return left.some((entry) => looselyEqual(entry, right));
  if (left !== null && typeof left === "object") return Object.hasOwn(left, asText(right));
  return asText(left).toLowerCase().includes(asText(right).toLowerCase());
}

export function evaluate(left: Json, operator: Operator, right: Json): boolean {
  switch (operator) {
    case "equals":
      return looselyEqual(left, right);
    case "notEquals":
      return !looselyEqual(left, right);
    case "greaterThan":
      return order(left, right) > 0;
    case "greaterOrEqual":
      return order(left, right) >= 0;
    case "lessThan":
      return order(left, right) < 0;
    case "lessOrEqual":
      return order(left, right) <= 0;
    case "contains":
      return contains(left, right);
    case "notContains":
      return !contains(left, right);
    case "startsWith":
      return asText(left).toLowerCase().startsWith(asText(right).toLowerCase());
    case "endsWith":
      return asText(left).toLowerCase().endsWith(asText(right).toLowerCase());
    case "isEmpty":
      return isEmpty(left);
    case "isNotEmpty":
      return !isEmpty(left);
  }
}
