import { describe, expect, it } from "vitest";
import { OPERATORS, type Operator } from "@/flow/schema";
import { OPERATOR_LABELS, evaluate, isEmpty, isUnary } from "./condition";
import type { Json } from "./reference";

describe("evaluate", () => {
  const cases: [Json, Operator, Json, boolean][] = [
    // Numbers compare as numbers, whether they arrive as numbers or as text.
    [10, "equals", "10", true],
    ["10.0", "equals", 10, true],
    [9, "greaterThan", "10", false],
    ["9", "lessThan", "10", true],
    [10, "greaterOrEqual", 10, true],
    [10, "lessOrEqual", 9, false],
    // Text compares as text, which sorts ISO dates correctly.
    ["high", "equals", "high", true],
    ["high", "notEquals", "low", true],
    ["2026-10-05", "greaterThan", "2026-09-30", true],
    ["apple", "lessThan", "banana", true],
    // Other types.
    [true, "equals", "true", true],
    [null, "equals", "", true],
    [{ a: 1 }, "equals", { a: 1 }, true],
    [{ a: 1 }, "notEquals", { a: 2 }, true],
    // contains looks inside text, lists and objects.
    ["Server is DOWN", "contains", "down", true],
    ["Server is up", "notContains", "down", true],
    [["admin", "beta"], "contains", "beta", true],
    [[1, 2, 3], "contains", "2", true],
    [{ urgent: true }, "contains", "urgent", true],
    [{ urgent: true }, "contains", "calm", false],
    ["Flowboard", "startsWith", "flow", true],
    ["Flowboard", "endsWith", "BOARD", true],
    ["Flowboard", "startsWith", "board", false],
    // Empty.
    ["", "isEmpty", null, true],
    ["  ", "isEmpty", null, true],
    [[], "isEmpty", null, true],
    [{}, "isEmpty", null, true],
    [0, "isEmpty", null, false],
    [false, "isNotEmpty", null, true],
    [[0], "isNotEmpty", null, true],
  ];

  it.each(cases)("%j %s %j → %s", (left, operator, right, expected) => {
    expect(evaluate(left, operator, right)).toBe(expected);
  });
});

describe("helpers", () => {
  it("isEmpty covers nothing, blank text, empty lists and empty objects", () => {
    expect([null, "", [], {}].every(isEmpty)).toBe(true);
    expect([0, false, "a", [null], { a: null }].some(isEmpty)).toBe(false);
  });

  it("knows which comparisons ignore the right side", () => {
    expect(OPERATORS.filter(isUnary)).toEqual(["isEmpty", "isNotEmpty"]);
  });

  it("has a label for every operator", () => {
    for (const operator of OPERATORS) expect(OPERATOR_LABELS[operator]).toBeTruthy();
  });
});
