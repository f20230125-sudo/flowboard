import { describe, expect, it } from "vitest";
import { coerce, findReferences, parsePath, render, renderText, renderValue, resolvePath, type Scope } from "./reference";

const scope: Scope = {
  steps: {
    getUser: { status: 200, body: { name: "Amal", tags: ["admin", "beta"], "full name": "Amal K" } },
    count: 42,
    label: "42",
  },
  input: { items: [{ id: 1 }, { id: 2 }] },
  trigger: { city: "Dubai" },
};

describe("parsePath", () => {
  it("splits dots and brackets", () => {
    expect(parsePath("steps.getUser.body.tags[1]")).toEqual(["steps", "getUser", "body", "tags", 1]);
    expect(parsePath(`steps.getUser.body["full name"]`)).toEqual(["steps", "getUser", "body", "full name"]);
    expect(parsePath("  input.items[0].id  ")).toEqual(["input", "items", 0, "id"]);
  });

  it("explains what is wrong with a bad path", () => {
    expect(() => parsePath("")).toThrow("empty");
    expect(() => parsePath("steps.")).toThrow("Expected a name");
    expect(() => parsePath("steps.a[")).toThrow('Missing "]"');
    expect(() => parsePath("steps.a[x]")).toThrow("number or a quoted name");
    expect(() => parsePath("steps.a + 1")).toThrow("Unexpected");
  });

  it("refuses names that reach into JavaScript itself", () => {
    expect(() => parsePath("steps.__proto__")).toThrow("cannot be used");
    expect(() => parsePath("steps.a.constructor")).toThrow("cannot be used");
    expect(() => parsePath(`steps["prototype"]`)).toThrow("cannot be used");
  });
});

describe("resolvePath", () => {
  it("follows the path through objects and lists", () => {
    expect(resolvePath(scope, parsePath("steps.getUser.body.name"))).toBe("Amal");
    expect(resolvePath(scope, parsePath("input.items[1].id"))).toBe(2);
    expect(resolvePath(scope, parsePath("trigger.city"))).toBe("Dubai");
  });

  it("gives the length of a list or a text", () => {
    expect(resolvePath(scope, parsePath("input.items.length"))).toBe(2);
    expect(resolvePath(scope, parsePath("trigger.city.length"))).toBe(5);
  });

  it("gives undefined for anything missing, however deep", () => {
    expect(resolvePath(scope, parsePath("steps.nobody.body.name"))).toBeUndefined();
    expect(resolvePath(scope, parsePath("input.items[9].id"))).toBeUndefined();
    expect(resolvePath(scope, parsePath("steps.count.digits"))).toBeUndefined();
  });

  it("never returns something inherited, only the data's own fields", () => {
    expect(resolvePath(scope, parsePath("steps.toString"))).toBeUndefined();
    expect(resolvePath(scope, parsePath("steps.getUser.hasOwnProperty"))).toBeUndefined();
  });
});

describe("findReferences", () => {
  it("finds each reference and where it sits", () => {
    const found = findReferences("Hi {{ trigger.city }}, {{steps.count}}!");
    expect(found.map((reference) => reference.expression)).toEqual(["trigger.city", "steps.count"]);
    expect(found[0]).toMatchObject({ start: 3, end: 21, raw: "{{ trigger.city }}", error: null });
  });

  it("keeps the error of a reference it cannot parse", () => {
    const [found] = findReferences("{{ steps. }}");
    expect(found.path).toBeNull();
    expect(found.error).toContain("Expected a name");
  });
});

describe("render", () => {
  it("leaves text without references alone", () => {
    expect(render("plain text", scope)).toBe("plain text");
  });

  it("keeps the type when the text is one reference", () => {
    expect(render("{{ steps.count }}", scope)).toBe(42);
    expect(render("  {{ steps.getUser.body.tags }}  ", scope)).toEqual(["admin", "beta"]);
    expect(render("{{ input }}", scope)).toEqual({ items: [{ id: 1 }, { id: 2 }] });
  });

  it("writes references into the surrounding text", () => {
    expect(render("{{ steps.getUser.body.name }} lives in {{ trigger.city }}", scope)).toBe("Amal lives in Dubai");
    expect(render("tags: {{ steps.getUser.body.tags }}", scope)).toBe('tags: ["admin","beta"]');
  });

  it("gives null for a missing reference alone, and nothing inside text", () => {
    expect(render("{{ steps.nobody }}", scope)).toBeNull();
    expect(render("Hello {{ steps.nobody }}!", scope)).toBe("Hello !");
  });

  it("throws on a reference that cannot be read", () => {
    expect(() => render("{{ steps. }}", scope)).toThrow("Expected a name");
  });

  it("renderText always gives text", () => {
    expect(renderText("{{ steps.count }}", scope)).toBe("42");
    expect(renderText("{{ steps.nobody }}", scope)).toBe("");
    expect(renderText("{{ trigger }}", scope)).toBe('{"city":"Dubai"}');
  });
});

describe("renderValue", () => {
  it("turns typed numbers, booleans, null and JSON into those types", () => {
    expect(renderValue("42", scope)).toBe(42);
    expect(renderValue("-3.5", scope)).toBe(-3.5);
    expect(renderValue("true", scope)).toBe(true);
    expect(renderValue("null", scope)).toBeNull();
    expect(renderValue('{"a": [1, 2]}', scope)).toEqual({ a: [1, 2] });
  });

  it("leaves other text as text", () => {
    expect(renderValue("007", scope)).toBe("007");
    expect(renderValue("hello", scope)).toBe("hello");
    expect(renderValue("{not json", scope)).toBe("{not json");
    expect(renderValue("", scope)).toBe("");
  });

  it("does not re-read data: text from a reference stays text", () => {
    expect(renderValue("{{ steps.label }}", scope)).toBe("42");
    expect(renderValue("{{ steps.count }}", scope)).toBe(42);
  });

  it("parses JSON written around references", () => {
    expect(renderValue('{"name": "{{ steps.getUser.body.name }}", "n": {{ steps.count }}}', scope)).toEqual({
      name: "Amal",
      n: 42,
    });
    expect(renderValue("{{ steps.count }}{{ steps.count }}", scope)).toBe("4242");
  });

  it("coerce is exact about what counts as a number", () => {
    expect(coerce("1e5")).toBe("1e5");
    expect(coerce(" 12 ")).toBe(12);
    expect(coerce("12px")).toBe("12px");
  });
});
