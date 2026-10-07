import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ANSWER_TIMEOUT_MS, READY_TIMEOUT_MS, describeSend, sendToHindsight, type SendDeps } from "./send";

const URL_OF_HINDSIGHT = "https://hindsight.example";
const envelope = { format: "hindsight/run", version: 1, app: "flowboard", data: { id: "turn-1" } };

type Message = { origin: string; source: unknown; data: unknown };

function stage({ blocked = false }: { blocked?: boolean } = {}) {
  const posted: { message: unknown; origin: string }[] = [];
  const target = { postMessage: (message: unknown, origin: string) => posted.push({ message, origin }) };
  const saved: { name: string; text: string }[] = [];
  const opened: string[] = [];
  let handler: ((event: Message) => void) | null = null;
  let listening = 0;

  const deps: SendDeps = {
    open: (url) => {
      opened.push(url);
      return blocked ? null : target;
    },
    listen: (handle) => {
      handler = handle;
      listening += 1;
      return () => {
        listening -= 1;
        handler = null;
      };
    },
    save: (name, text) => saved.push({ name, text }),
    setTimeout: (run, ms) => setTimeout(run, ms) as unknown as number,
    clearTimeout: (id) => clearTimeout(id),
  };
  const say = (data: unknown, over: Partial<Message> = {}) => handler?.({ origin: URL_OF_HINDSIGHT, source: target, data, ...over });
  return { deps, posted, saved, opened, say, listening: () => listening, target };
}

const send = (deps: SendDeps) => sendToHindsight(envelope, "run.json", deps, URL_OF_HINDSIGHT);

describe("sending a run to Hindsight", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens Hindsight's page, hands the run over when it says it is ready, and finishes when it confirms", async () => {
    const { deps, posted, saved, opened, say, listening } = stage();
    const result = send(deps);
    expect(opened).toEqual([`${URL_OF_HINDSIGHT}/open`]);
    expect(posted).toEqual([]);

    say({ type: "hindsight:ready" });
    // The run is addressed to Hindsight's own origin, so no other page can read it.
    expect(posted).toEqual([{ message: envelope, origin: URL_OF_HINDSIGHT }]);

    say({ type: "hindsight:received", id: "sayso:turn-1" });
    await expect(result).resolves.toEqual({ how: "sent" });
    expect(saved).toEqual([]);
    expect(listening()).toBe(0);
  });

  it("hands the run over once, however many times the page says it is ready", async () => {
    const { deps, posted, say } = stage();
    const result = send(deps);
    say({ type: "hindsight:ready" });
    say({ type: "hindsight:ready" });
    expect(posted).toHaveLength(1);
    say({ type: "hindsight:received" });
    await result;
  });

  it("reports that Hindsight would not take it, with its reason", async () => {
    const { deps, say } = stage();
    const result = send(deps);
    say({ type: "hindsight:ready" });
    say({ type: "hindsight:refused", reason: "This run is too big." });
    await expect(result).resolves.toEqual({ how: "refused", reason: "This run is too big." });
  });

  it("says it was sent, unconfirmed, when nothing comes back after the hand-over", async () => {
    const { deps, say, saved } = stage();
    const result = send(deps);
    say({ type: "hindsight:ready" });
    await vi.advanceTimersByTimeAsync(ANSWER_TIMEOUT_MS + 1);
    await expect(result).resolves.toEqual({ how: "sent-unconfirmed" });
    expect(saved).toEqual([]);
  });

  it("saves the run as a file when the page never says it is ready", async () => {
    const { deps, saved, posted, listening } = stage();
    const result = send(deps);
    await vi.advanceTimersByTimeAsync(READY_TIMEOUT_MS + 1);
    await expect(result).resolves.toEqual({ how: "file", reason: "no-answer" });
    expect(saved).toEqual([{ name: "run.json", text: JSON.stringify(envelope) }]);
    expect(posted).toEqual([]);
    expect(listening()).toBe(0);
  });

  it("saves the run as a file at once when the browser blocks the tab", async () => {
    const { deps, saved } = stage({ blocked: true });
    await expect(send(deps)).resolves.toEqual({ how: "file", reason: "blocked" });
    expect(saved).toHaveLength(1);
  });

  it("ignores messages from any other origin, or from any other window", async () => {
    const { deps, posted, say } = stage();
    const result = send(deps);
    say({ type: "hindsight:ready" }, { origin: "https://evil.example" });
    say({ type: "hindsight:ready" }, { source: {} });
    expect(posted).toEqual([]);

    say({ type: "hindsight:ready" });
    say({ type: "hindsight:received" }, { origin: "https://evil.example" });
    say({ type: "hindsight:refused", reason: "x" }, { source: {} });
    await vi.advanceTimersByTimeAsync(ANSWER_TIMEOUT_MS + 1);
    // Only the hand-over from the real page counted: neither fake answer ended it.
    await expect(result).resolves.toEqual({ how: "sent-unconfirmed" });
  });

  it("ignores things that are not messages from Hindsight", async () => {
    const { deps, posted, say } = stage();
    const result = send(deps);
    say(null);
    say("hindsight:ready");
    say({ type: 7 });
    expect(posted).toEqual([]);
    await vi.advanceTimersByTimeAsync(READY_TIMEOUT_MS + 1);
    await result;
  });
});

describe("describeSend", () => {
  it("says in words what happened", () => {
    expect(describeSend({ how: "sent" }).message).toBe("Opened in Hindsight.");
    expect(describeSend({ how: "refused", reason: "Too big." })).toEqual({ message: "Hindsight would not take it: Too big.", tone: "bad" });
    expect(describeSend({ how: "file", reason: "blocked" }).message).toContain("blocked the new tab");
    expect(describeSend({ how: "file", reason: "no-answer" }).message).toContain("did not answer");
  });
});
