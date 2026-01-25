import { describe, expect, it } from "vitest";
import { block, flow } from "@/test/build";
import { hasErrors, validateFlow, type Problem } from "./validate";

const codes = (problems: Problem[]) => problems.map((problem) => `${problem.level}:${problem.code}:${problem.nodeId ?? "-"}`);

const good = () =>
  flow(
    [
      block("trigger", "start", { payload: '{"city":"Dubai"}' }),
      block("http", "weather", { url: "https://api.example.com/{{ trigger.city }}" }),
      block("condition", "isHot", { left: "{{ steps.weather.body.temp }}", operator: "greaterThan", right: "35" }),
      block("output", "result", { value: "{{ steps.isHot.result }}" }),
    ],
    ["start>weather", "weather>isHot", "isHot:true>result"],
  );

describe("validateFlow", () => {
  it("finds nothing wrong with a sound flow", () => {
    expect(validateFlow(good())).toEqual([]);
  });

  it("asks for a trigger when the flow is empty or has none", () => {
    expect(codes(validateFlow(flow([])))).toEqual(["error:empty:-"]);
    expect(codes(validateFlow(flow([block("output", "result")])))).toContain("error:no-trigger:-");
  });

  it("allows one trigger only", () => {
    const problems = validateFlow(flow([block("trigger", "start"), block("trigger", "again")]));
    expect(codes(problems)).toContain("error:many-triggers:again");
  });

  it("refuses names that would break references", () => {
    const doc = flow([block("trigger", "start"), block("output", "my result"), block("output", "start")], [
      "start>my result",
    ]);
    doc.nodes[2].id = "twin";
    const problems = validateFlow(doc);
    expect(codes(problems)).toContain("error:bad-name:my result");
    expect(codes(problems)).toContain("error:duplicate-name:twin");
  });

  it("flags every block in a loop", () => {
    const doc = flow(
      [block("trigger", "start"), block("delay", "a"), block("delay", "b")],
      ["start>a", "a>b", "b>a"],
    );
    expect(codes(validateFlow(doc)).filter((code) => code.includes("loop"))).toEqual(["error:loop:a", "error:loop:b"]);
  });

  it("asks for the settings a block cannot run without", () => {
    const doc = flow(
      [
        block("trigger", "start", { payload: "{oops" }),
        block("http", "call"),
        block("condition", "check"),
        block("condition", "unary", { left: "{{ trigger.x }}", operator: "isEmpty" }),
        block("set", "fields"),
        block("filter", "keep"),
        block("ai", "ask"),
      ],
      ["start>call", "call>check", "check:true>unary", "unary:true>fields", "fields>keep", "keep>ask"],
    );
    const missing = validateFlow(doc).filter((problem) => problem.code === "missing-setting");
    expect(missing.map((problem) => `${problem.nodeId}: ${problem.message}`)).toEqual([
      "start: The sample data is not valid JSON.",
      "call: Give it an address to call.",
      "check: Choose the value to check.",
      "check: Say what to compare the value with.",
      "fields: Add at least one field.",
      "keep: Choose the list to filter.",
      "keep: Say which items to keep.",
      "ask: Write a prompt.",
    ]);
  });

  it("catches references to blocks that do not exist", () => {
    const doc = good();
    (doc.nodes[3].config as { value: string }).value = "{{ steps.wether.body }}";
    const [problem] = validateFlow(doc);
    expect(problem).toMatchObject({ level: "error", code: "unknown-step", nodeId: "result" });
    expect(problem.message).toBe('Value: there is no block named "wether".');
  });

  it("catches references to a block that does not run first", () => {
    const doc = flow(
      [
        block("trigger", "start"),
        block("set", "left", { fields: [{ key: "a", value: "{{ steps.right.b }}" }] }),
        block("set", "right", { fields: [{ key: "b", value: "1" }] }),
        block("output", "result"),
      ],
      ["start>left", "start>right", "left>result", "right>result"],
    );
    const problems = validateFlow(doc);
    expect(codes(problems)).toEqual(["error:step-not-before:left"]);
    expect(problems[0].message).toContain('"right" does not run before this block');
  });

  it("catches malformed references and wrong starting words", () => {
    const doc = flow(
      [
        block("trigger", "start"),
        block("set", "fields", {
          fields: [
            { key: "a", value: "{{ steps. }}" },
            { key: "b", value: "{{ env.SECRET }}" },
            { key: "c", value: "{{ trigger.x" },
            { key: "d", value: "{{ item.id }}" },
          ],
        }),
        block("output", "result"),
      ],
      ["start>fields", "fields>result"],
    );
    const messages = validateFlow(doc).map((problem) => problem.message);
    expect(messages).toEqual([
      "a: Expected a name at position 7 in \"steps.\".",
      "b: {{ env.SECRET }} must start with steps, input or trigger.",
      "c: a reference is not closed. References look like {{ steps.name.field }}.",
      "d: {{ item }} only works inside a Filter list block.",
    ]);
  });

  it("allows {{ item }} inside a Filter list", () => {
    const doc = flow(
      [
        block("trigger", "start", { payload: '{"list":[1,2]}' }),
        block("filter", "keep", { list: "{{ trigger.list }}", left: "{{ item }}", operator: "greaterThan", right: "1" }),
        block("output", "result"),
      ],
      ["start>keep", "keep>result"],
    );
    expect(validateFlow(doc)).toEqual([]);
  });

  it("ignores the body of a GET request", () => {
    const doc = flow(
      [block("trigger", "start"), block("http", "call", { url: "https://api.example.com", body: "{{ steps.nobody }}" })],
      ["start>call"],
    );
    expect(validateFlow(doc)).toEqual([]);
  });

  it("warns about blocks that will not run or lead nowhere", () => {
    const doc = flow(
      [block("trigger", "start"), block("set", "prepared", { fields: [{ key: "a", value: "1" }] }), block("delay", "island")],
      ["start>prepared"],
    );
    const problems = validateFlow(doc);
    expect(codes(problems)).toEqual(["warning:dead-end:prepared", "warning:not-connected:island"]);
    expect(hasErrors(problems)).toBe(false);
  });

  it("lets a request be the last step", () => {
    const doc = flow(
      [block("trigger", "start"), block("http", "notify", { method: "POST", url: "https://api.example.com/hook" })],
      ["start>notify"],
    );
    expect(validateFlow(doc)).toEqual([]);
  });

  it("hasErrors tells errors from warnings", () => {
    expect(hasErrors(validateFlow(flow([block("output", "result")])))).toBe(true);
    expect(hasErrors([])).toBe(false);
  });
});
