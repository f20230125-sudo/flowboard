import { describe, expect, it } from "vitest";
import { block, flow } from "@/test/build";
import { BrowserFlowRepository, MemoryFlowRepository, StorageError, type FlowRepository } from "./repository";

/** A stand-in for the browser's localStorage. */
function fakeStorage(limit = Infinity) {
  const data = new Map<string, string>();
  return {
    data,
    get length() {
      return data.size;
    },
    key: (index: number) => [...data.keys()][index] ?? null,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (value.length > limit) throw new DOMException("full", "QuotaExceededError");
      data.set(key, value);
    },
    removeItem: (key: string) => void data.delete(key),
  };
}

const sample = (id: string, updatedAt: string) => ({
  ...flow([block("trigger", "start"), block("output", "result")], ["start>result"]),
  id,
  name: `Flow ${id}`,
  updatedAt,
});

const kinds: [string, () => FlowRepository][] = [
  ["browser storage", () => new BrowserFlowRepository(fakeStorage())],
  ["memory", () => new MemoryFlowRepository()],
];

describe.each(kinds)("a flow repository on %s", (_name, make) => {
  it("saves a flow and reads it back", async () => {
    const repository = make();
    const doc = sample("a", "2026-10-05T10:00:00.000Z");
    await repository.save(doc);
    expect(await repository.get("a")).toEqual(doc);
    expect(await repository.get("missing")).toBeNull();
  });

  it("lists flows newest first, as summaries", async () => {
    const repository = make();
    await repository.save(sample("old", "2026-10-01T00:00:00.000Z"));
    await repository.save(sample("new", "2026-10-05T00:00:00.000Z"));
    expect(await repository.list()).toEqual([
      { id: "new", name: "Flow new", description: "", updatedAt: "2026-10-05T00:00:00.000Z", blockCount: 2 },
      { id: "old", name: "Flow old", description: "", updatedAt: "2026-10-01T00:00:00.000Z", blockCount: 2 },
    ]);
  });

  it("replaces a flow saved again and removes one", async () => {
    const repository = make();
    await repository.save(sample("a", "2026-10-05T10:00:00.000Z"));
    await repository.save({ ...sample("a", "2026-10-05T11:00:00.000Z"), name: "Renamed" });
    expect((await repository.list()).map((entry) => entry.name)).toEqual(["Renamed"]);

    await repository.remove("a");
    expect(await repository.list()).toEqual([]);
    expect(await repository.get("a")).toBeNull();
  });
});

describe("BrowserFlowRepository", () => {
  it("skips damaged entries and keys that belong to something else", async () => {
    const storage = fakeStorage();
    const repository = new BrowserFlowRepository(storage);
    await repository.save(sample("good", "2026-10-05T10:00:00.000Z"));
    storage.data.set("flowboard:flow:torn", "{not json");
    storage.data.set("flowboard:flow:wrong", JSON.stringify({ version: 1, id: "wrong" }));
    storage.data.set("theme", "dark");

    expect((await repository.list()).map((entry) => entry.id)).toEqual(["good"]);
    expect(await repository.get("torn")).toBeNull();
    expect(await repository.get("wrong")).toBeNull();
  });

  it("explains a save that the browser refused", async () => {
    const repository = new BrowserFlowRepository(fakeStorage(10));
    await expect(repository.save(sample("a", "2026-10-05T10:00:00.000Z"))).rejects.toBeInstanceOf(StorageError);
  });

  it("does not hand back the object it was given", async () => {
    const repository = new MemoryFlowRepository();
    const doc = sample("a", "2026-10-05T10:00:00.000Z");
    await repository.save(doc);
    expect(await repository.get("a")).not.toBe(doc);
  });
});
