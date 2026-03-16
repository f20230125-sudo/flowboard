import type { NodeChange } from "@xyflow/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryFlowRepository } from "@/storage/repository";
import { block, flow } from "@/test/build";
import { AUTOSAVE_DELAY_MS } from "./autosave";
import { addBlock, connectBlocks, copySelection, duplicateSelection, openFlow, pasteBlocks, renameBlock, saveNow } from "./editorThunks";
import { HISTORY_LIMIT, flowActions } from "./flowSlice";
import {
  selectCanvasNodes,
  selectProblemBadge,
  selectProblems,
  selectSaveStatus,
  selectSelectedNode,
  selectUndoLabel,
} from "./selectors";
import { makeStore } from "./store";

const START = new Date("2026-10-05T10:00:00Z");

function setup(doc = flow([block("trigger", "start")])) {
  const repository = new MemoryFlowRepository();
  const store = makeStore({ repository });
  store.dispatch(flowActions.flowOpened(doc));
  const present = () => store.getState().flow.present;
  const names = () => present().nodes.map((node) => node.name);
  const links = () => present().edges.map((edge) => `${edge.source}:${edge.sourceHandle}>${edge.target}`);
  return { store, repository, present, names, links };
}

const move = (id: string, x: number, y: number, dragging: boolean): NodeChange => ({
  id,
  type: "position",
  position: { x, y },
  dragging,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
});
afterEach(() => vi.useRealTimers());

describe("adding blocks", () => {
  it("puts a clicked block after the selected one and connects them", () => {
    const { store, present, links } = setup();
    store.dispatch(flowActions.selectionSet({ nodeIds: ["start"] }));

    const id = store.dispatch(addBlock("http"));

    const added = present().nodes[1];
    expect(added).toMatchObject({ id, type: "http", name: "http1", position: { x: 280, y: 0 } });
    expect(links()).toEqual([`start:out>${id}`]);
    expect(store.getState().flow.view.selectedNodeIds).toEqual([id]);
  });

  it("hangs new blocks off the free side of a Condition, true first", () => {
    const { store, links } = setup(flow([block("trigger", "start"), block("condition", "check")], ["start>check"]));
    const select = () => store.dispatch(flowActions.selectionSet({ nodeIds: ["check"] }));

    select();
    const first = store.dispatch(addBlock("set"));
    select();
    const second = store.dispatch(addBlock("set"));

    expect(links()).toEqual(["start:out>check", `check:true>${first}`, `check:false>${second}`]);
    // The second one is stepped down so it does not sit on the first.
    const [a, b] = store.getState().flow.present.nodes.slice(2);
    expect(b.position.x).toBe(a.position.x);
    expect(b.position.y).toBeGreaterThan(a.position.y);
  });

  it("drops a dragged block where it was dropped, unconnected", () => {
    const { store, present, links } = setup();
    store.dispatch(flowActions.selectionSet({ nodeIds: ["start"] }));
    store.dispatch(addBlock("delay", { x: 420, y: 260 }));
    expect(present().nodes[1].position).toEqual({ x: 420, y: 260 });
    expect(links()).toEqual([]);
  });

  it("does not connect anything into a second trigger", () => {
    const { store, links } = setup();
    store.dispatch(flowActions.selectionSet({ nodeIds: ["start"] }));
    store.dispatch(addBlock("trigger"));
    expect(links()).toEqual([]);
  });
});

describe("undo and redo", () => {
  it("undoes and redoes a change", () => {
    const { store, names } = setup();
    store.dispatch(addBlock("http"));
    expect(selectUndoLabel(store.getState())).toBe("Add HTTP request");

    store.dispatch(flowActions.undo());
    expect(names()).toEqual(["start"]);
    expect(store.getState().flow.view.selectedNodeIds).toEqual([]);

    store.dispatch(flowActions.redo());
    expect(names()).toEqual(["start", "http1"]);
  });

  it("does nothing when there is nothing to undo or redo", () => {
    const { store, names } = setup();
    store.dispatch(flowActions.undo());
    store.dispatch(flowActions.redo());
    expect(names()).toEqual(["start"]);
    expect(store.getState().flow.revision).toBe(0);
  });

  it("drops the redo steps once something new is done", () => {
    const { store, names } = setup();
    store.dispatch(addBlock("http"));
    store.dispatch(flowActions.undo());
    store.dispatch(addBlock("delay"));
    store.dispatch(flowActions.redo());
    expect(names()).toEqual(["start", "wait1"]);
  });

  it("treats a whole drag as one step", () => {
    const { store, present } = setup();
    store.dispatch(flowActions.canvasNodesChanged([move("start", 10, 10, true)]));
    store.dispatch(flowActions.canvasNodesChanged([move("start", 60, 40, true)]));
    store.dispatch(flowActions.canvasNodesChanged([move("start", 100, 80, false)]));

    expect(present().nodes[0].position).toEqual({ x: 100, y: 80 });
    expect(store.getState().flow.past).toHaveLength(1);

    store.dispatch(flowActions.undo());
    expect(present().nodes[0].position).toEqual({ x: 0, y: 0 });
  });

  it("merges arrow-key nudges that follow each other, and splits them after a pause", () => {
    const { store } = setup();
    store.dispatch(flowActions.canvasNodesChanged([move("start", 5, 0, false)]));
    vi.advanceTimersByTime(200);
    store.dispatch(flowActions.canvasNodesChanged([move("start", 10, 0, false)]));
    expect(store.getState().flow.past).toHaveLength(1);

    vi.advanceTimersByTime(2000);
    store.dispatch(flowActions.canvasNodesChanged([move("start", 15, 0, false)]));
    expect(store.getState().flow.past).toHaveLength(2);
  });

  it("treats typing in one field as one step", () => {
    const { store, present } = setup(flow([block("trigger", "start"), block("http", "call")]));
    for (const url of ["h", "ht", "http", "https://api.example.com"]) {
      vi.advanceTimersByTime(150);
      store.dispatch(flowActions.settingChanged({ nodeId: "call", key: "url", value: url }));
    }
    store.dispatch(flowActions.settingChanged({ nodeId: "call", key: "method", value: "POST" }));
    expect(store.getState().flow.past.map((entry) => entry.label)).toEqual(["Edit settings", "Edit settings"]);

    store.dispatch(flowActions.undo());
    store.dispatch(flowActions.undo());
    expect(present().nodes[1].config).toMatchObject({ url: "", method: "GET" });
  });

  it("does not merge new typing into a step that was undone and redone", () => {
    const { store } = setup(flow([block("trigger", "start"), block("http", "call")]));
    store.dispatch(flowActions.settingChanged({ nodeId: "call", key: "url", value: "a" }));
    store.dispatch(flowActions.undo());
    store.dispatch(flowActions.redo());
    store.dispatch(flowActions.settingChanged({ nodeId: "call", key: "url", value: "ab" }));
    expect(store.getState().flow.past).toHaveLength(2);
  });

  it("keeps at most a hundred steps", () => {
    const { store } = setup();
    for (let count = 0; count < HISTORY_LIMIT + 20; count += 1) store.dispatch(addBlock("delay"));
    expect(store.getState().flow.past).toHaveLength(HISTORY_LIMIT);
  });

  it("does not count selecting or measuring as a change", () => {
    const { store } = setup();
    store.dispatch(
      flowActions.canvasNodesChanged([
        { id: "start", type: "select", selected: true },
        { id: "start", type: "dimensions", dimensions: { width: 220, height: 64 } },
      ]),
    );
    expect(store.getState().flow.past).toHaveLength(0);
    expect(store.getState().flow.revision).toBe(0);
    expect(selectSelectedNode(store.getState())?.id).toBe("start");
  });
});

describe("connecting", () => {
  const doc = () =>
    flow([block("trigger", "start"), block("delay", "a"), block("delay", "b")], ["start>a", "a>b"]);

  it("adds a connection", () => {
    const { store, links } = setup(flow([block("trigger", "start"), block("output", "result")]));
    store.dispatch(connectBlocks("start", null, "result"));
    expect(links()).toEqual(["start:out>result"]);
  });

  it("refuses loops, repeats, and anything leading into a trigger", () => {
    const { store, links } = setup(doc());
    store.dispatch(connectBlocks("b", "out", "a"));
    store.dispatch(connectBlocks("a", "out", "a"));
    store.dispatch(connectBlocks("start", "out", "a"));
    store.dispatch(connectBlocks("a", "out", "start"));
    store.dispatch(connectBlocks("a", "nope", "b"));
    expect(links()).toEqual(["start:out>a", "a:out>b"]);
    expect(store.getState().flow.past).toHaveLength(0);
  });
});

describe("renaming", () => {
  it("rewrites every reference to the renamed block", () => {
    const { store, present } = setup(
      flow(
        [
          block("trigger", "start"),
          block("http", "http1", { url: "https://api.example.com" }),
          block("set", "fields", {
            fields: [
              { key: "temp", value: "{{ steps.http1.body.temp }} and {{steps.http1.status}}" },
              { key: "other", value: "{{ steps.http10.body }} http1 stays as text" },
            ],
          }),
        ],
        ["start>http1", "http1>fields"],
      ),
    );

    expect(store.dispatch(renameBlock("http1", " getWeather "))).toBeNull();

    expect(present().nodes[1].name).toBe("getWeather");
    expect(present().nodes[2].config).toEqual({
      fields: [
        { key: "temp", value: "{{ steps.getWeather.body.temp }} and {{steps.getWeather.status}}" },
        { key: "other", value: "{{ steps.http10.body }} http1 stays as text" },
      ],
    });
    // The only error left is about http10, which never existed.
    const errors = selectProblems(store.getState()).filter((problem) => problem.level === "error");
    expect(errors.map((problem) => problem.message)).toEqual(['other: there is no block named "http10".']);

    store.dispatch(flowActions.undo());
    expect(present().nodes[1].name).toBe("http1");
    expect(present().nodes[2].config).toMatchObject({ fields: [{ value: expect.stringContaining("steps.http1.body") }, {}] });
  });

  it("refuses names that are taken or would break references", () => {
    const { store, names } = setup(flow([block("trigger", "start"), block("delay", "wait")]));
    expect(store.dispatch(renameBlock("wait", "start"))).toContain("already named");
    expect(store.dispatch(renameBlock("wait", "my block"))).toContain("letters, digits");
    expect(store.dispatch(renameBlock("wait", ""))).toContain("letters, digits");
    expect(store.dispatch(renameBlock("wait", "x".repeat(41)))).toContain("under 40");
    expect(names()).toEqual(["start", "wait"]);
  });
});

describe("deleting, copying and pasting", () => {
  const doc = () =>
    flow(
      [block("trigger", "start"), block("http", "call", { url: "https://api.example.com" }), block("output", "result")],
      ["start>call", "call>result"],
    );

  it("deletes the selected blocks with their connections, and brings them back on undo", () => {
    const { store, names, links } = setup(doc());
    store.dispatch(flowActions.selectionSet({ nodeIds: ["call"] }));
    store.dispatch(flowActions.selectionDeleted());
    expect(names()).toEqual(["start", "result"]);
    expect(links()).toEqual([]);

    store.dispatch(flowActions.undo());
    expect(names()).toEqual(["start", "call", "result"]);
    expect(links()).toEqual(["start:out>call", "call:out>result"]);
  });

  it("deletes a selected connection on its own", () => {
    const { store, names, links } = setup(doc());
    store.dispatch(flowActions.canvasEdgesChanged([{ id: "call>result", type: "select", selected: true }]));
    store.dispatch(flowActions.selectionDeleted());
    expect(names()).toHaveLength(3);
    expect(links()).toEqual(["start:out>call"]);
  });

  it("does nothing when nothing is selected", () => {
    const { store } = setup(doc());
    store.dispatch(flowActions.selectionDeleted());
    store.dispatch(duplicateSelection());
    expect(store.dispatch(copySelection())).toBeNull();
    expect(store.getState().flow.past).toHaveLength(0);
  });

  it("copies blocks as text and pastes them with new names, keeping the connections between them", () => {
    const { store, names, links, present } = setup(doc());
    store.dispatch(flowActions.selectionSet({ nodeIds: ["call", "result"] }));
    const text = store.dispatch(copySelection())!;

    expect(store.dispatch(pasteBlocks(text))).toBe(true);

    expect(names()).toEqual(["start", "call", "result", "http1", "result1"]);
    const [pastedCall, pastedResult] = present().nodes.slice(3);
    expect(pastedCall.config).toMatchObject({ url: "https://api.example.com" });
    expect(links()).toContain(`${pastedCall.id}:out>${pastedResult.id}`);
    expect(links()).toHaveLength(3);
    expect(store.getState().flow.view.selectedNodeIds).toEqual([pastedCall.id, pastedResult.id]);
    expect(selectUndoLabel(store.getState())).toBe("Paste");
  });

  it("ignores clipboard text that is not copied blocks", () => {
    const { store, names } = setup(doc());
    for (const text of ["hello", "{}", '{"flowboard":"blocks","nodes":[{"id":1}],"edges":[]}', '{"flowboard":"blocks","nodes":[],"edges":[]}']) {
      expect(store.dispatch(pasteBlocks(text))).toBe(false);
    }
    expect(names()).toHaveLength(3);
  });

  it("duplicates the selection in one step", () => {
    const { store, names } = setup(doc());
    store.dispatch(flowActions.selectionSet({ nodeIds: ["call"] }));
    store.dispatch(duplicateSelection());
    expect(names()).toEqual(["start", "call", "result", "http1"]);
    store.dispatch(flowActions.undo());
    expect(names()).toHaveLength(3);
  });

  it("selects everything", () => {
    const { store } = setup(doc());
    store.dispatch(flowActions.allSelected());
    expect(store.getState().flow.view.selectedNodeIds).toEqual(["start", "call", "result"]);
    expect(store.getState().flow.view.selectedEdgeIds).toHaveLength(2);
  });
});

describe("what the canvas is given", () => {
  it("hands back the measured size and the selection", () => {
    const { store } = setup();
    store.dispatch(
      flowActions.canvasNodesChanged([
        { id: "start", type: "dimensions", dimensions: { width: 220, height: 64 } },
        { id: "start", type: "select", selected: true },
      ]),
    );
    expect(selectCanvasNodes(store.getState())[0]).toMatchObject({
      id: "start",
      type: "block",
      selected: true,
      measured: { width: 220, height: 64 },
    });
  });

  it("returns the same object for a block that did not change", () => {
    const { store } = setup(flow([block("trigger", "start"), block("http", "call")]));
    const before = selectCanvasNodes(store.getState());
    store.dispatch(flowActions.settingChanged({ nodeId: "call", key: "url", value: "https://api.example.com" }));
    const after = selectCanvasNodes(store.getState());
    expect(after[0]).toBe(before[0]);
    expect(after[1]).not.toBe(before[1]);
  });

  it("keeps a block's measured size through undo, so it stays visible", () => {
    const { store } = setup(flow([block("trigger", "start")]));
    store.dispatch(flowActions.canvasNodesChanged([{ id: "start", type: "dimensions", dimensions: { width: 220, height: 64 } }]));
    store.dispatch(flowActions.canvasNodesChanged([move("start", 100, 100, true), move("start", 100, 100, false)]));
    store.dispatch(flowActions.undo());
    expect(selectCanvasNodes(store.getState())[0].measured).toEqual({ width: 220, height: 64 });
  });
});

describe("problems", () => {
  const doc = () => flow([block("trigger", "start"), block("http", "call"), block("delay", "wait")], ["start>call", "call>wait"]);

  it("gives each block a count of what is wrong with it", () => {
    const { store } = setup(doc());
    expect(selectProblemBadge(store.getState(), "call")).toEqual({ errors: 1, warnings: 0, text: "Give it an address to call." });
    expect(selectProblemBadge(store.getState(), "wait")).toEqual({ errors: 0, warnings: 0, text: "" });
  });

  it("does not check the flow again when a block is only moved", () => {
    const { store } = setup(doc());
    const before = selectProblems(store.getState());

    store.dispatch(flowActions.canvasNodesChanged([move("call", 400, 200, true)]));
    store.dispatch(flowActions.canvasNodesChanged([move("call", 420, 220, false)]));
    expect(selectProblems(store.getState())).toBe(before);

    // A real change is checked.
    store.dispatch(flowActions.settingChanged({ nodeId: "call", key: "url", value: "https://api.example.com" }));
    expect(selectProblems(store.getState())).not.toBe(before);
    expect(selectProblems(store.getState())).toEqual([]);
  });
});

describe("opening and saving", () => {
  it("opens a saved flow and reports a missing one", async () => {
    const { store, repository } = setup();
    const saved = flow([block("trigger", "start"), block("output", "result")], ["start>result"]);
    await repository.save(saved);

    await store.dispatch(openFlow("test-flow"));
    expect(store.getState().flow).toMatchObject({ id: "test-flow", status: "ready" });
    expect(store.getState().flow.present.nodes).toHaveLength(2);

    await store.dispatch(openFlow("nope"));
    expect(store.getState().flow.status).toBe("missing");
  });

  it("saves by itself shortly after the last change, once for a burst of changes", async () => {
    const { store, repository } = setup();
    const save = vi.spyOn(repository, "save");

    store.dispatch(addBlock("http"));
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 100);
    store.dispatch(addBlock("delay"));
    expect(selectSaveStatus(store.getState())).toBe("saving");
    expect(save).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(save).toHaveBeenCalledTimes(1);
    expect(selectSaveStatus(store.getState())).toBe("saved");

    const stored = await repository.get("test-flow");
    expect(stored?.nodes.map((node) => node.name)).toEqual(["start", "http1", "wait1"]);
    expect(stored?.updatedAt).toBe(new Date(START.getTime() + 2 * AUTOSAVE_DELAY_MS - 100).toISOString());
  });

  it("does not save a flow that was only opened", async () => {
    const { store, repository } = setup();
    const save = vi.spyOn(repository, "save");
    store.dispatch(flowActions.canvasNodesChanged([{ id: "start", type: "select", selected: true }]));
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2);
    await store.dispatch(saveNow());
    expect(save).not.toHaveBeenCalled();
  });

  it("says so when saving fails, and recovers on the next save", async () => {
    const { store, repository } = setup();
    const save = vi.spyOn(repository, "save").mockRejectedValueOnce(new Error("Storage is full."));

    store.dispatch(addBlock("http"));
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(selectSaveStatus(store.getState())).toBe("failed");
    expect(store.getState().flow.saveError).toBe("Storage is full.");

    await store.dispatch(saveNow());
    expect(save).toHaveBeenCalledTimes(2);
    expect(selectSaveStatus(store.getState())).toBe("saved");
  });
});
