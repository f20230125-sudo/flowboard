import { describe, expect, it } from "vitest";
import { ancestorsOf, incomingByTarget, nodesInCycles, outgoingBySource, reachableFrom, topologicalOrder, wouldCreateCycle } from "./graph";

const link = (text: string) => {
  const [source, target] = text.split(">");
  return { source, target };
};
const links = (...texts: string[]) => texts.map(link);
const ids = (...names: string[]) => names.map((id) => ({ id }));

//   a → b → d
//    ↘ c ↗      e (alone)
const diamond = links("a>b", "a>c", "b>d", "c>d");

describe("graph", () => {
  it("groups connections by where they start and where they end", () => {
    expect(outgoingBySource(diamond).get("a")).toHaveLength(2);
    expect(incomingByTarget(diamond).get("d")).toHaveLength(2);
    expect(outgoingBySource(diamond).get("d")).toBeUndefined();
  });

  it("finds everything downstream of a block", () => {
    expect([...reachableFrom(["a"], diamond)].sort()).toEqual(["a", "b", "c", "d"]);
    expect([...reachableFrom(["c"], diamond)].sort()).toEqual(["c", "d"]);
    expect([...reachableFrom([], diamond)]).toEqual([]);
  });

  it("finds everything that runs before a block", () => {
    expect([...ancestorsOf("d", diamond)].sort()).toEqual(["a", "b", "c"]);
    expect([...ancestorsOf("b", diamond)]).toEqual(["a"]);
    expect([...ancestorsOf("a", diamond)]).toEqual([]);
  });

  it("knows which new connection would close a loop", () => {
    expect(wouldCreateCycle(diamond, "d", "a")).toBe(true);
    expect(wouldCreateCycle(diamond, "d", "b")).toBe(true);
    expect(wouldCreateCycle(diamond, "b", "b")).toBe(true);
    expect(wouldCreateCycle(diamond, "b", "c")).toBe(false);
    expect(wouldCreateCycle(diamond, "a", "d")).toBe(false);
    expect(wouldCreateCycle(diamond, "d", "e")).toBe(false);
  });

  it("orders blocks so each comes after what feeds it", () => {
    const order = topologicalOrder(ids("d", "c", "b", "a", "e"), diamond);
    expect(order).toHaveLength(5);
    for (const { source, target } of diamond) {
      expect(order.indexOf(source)).toBeLessThan(order.indexOf(target));
    }
  });

  it("ignores connections to blocks that are not in the list", () => {
    expect(topologicalOrder(ids("a", "b"), links("a>b", "ghost>b", "b>ghost"))).toEqual(["a", "b"]);
  });

  it("reports no loop in a flow without one", () => {
    expect(nodesInCycles(ids("a", "b", "c", "d", "e"), diamond)).toEqual([]);
  });

  it("names the blocks in a loop, but not the ones after it", () => {
    // a → b → c → b, and c → d
    const looped = links("a>b", "b>c", "c>b", "c>d");
    expect(nodesInCycles(ids("a", "b", "c", "d"), looped).sort()).toEqual(["b", "c"]);
  });

  it("sees a block connected to itself as a loop", () => {
    expect(nodesInCycles(ids("a", "b"), links("a>b", "b>b"))).toEqual(["b"]);
  });
});
