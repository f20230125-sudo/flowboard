import { parseFlow, type FlowDocument } from "@/flow/schema";

// Where flows are kept. The app only ever talks to the FlowRepository
// interface, so the browser storage below can be swapped for a REST backend
// by writing one more class.

export type FlowSummary = {
  id: string;
  name: string;
  description: string;
  updatedAt: string;
  blockCount: number;
};

export interface FlowRepository {
  /** Every saved flow, newest first. */
  list(): Promise<FlowSummary[]>;
  get(id: string): Promise<FlowDocument | null>;
  save(flow: FlowDocument): Promise<void>;
  remove(id: string): Promise<void>;
}

export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageError";
  }
}

const PREFIX = "flowboard:flow:";

/** The parts of the Web Storage API this needs, so tests can pass a stand-in. */
type KeyValueStore = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

/**
 * Keeps each flow under its own key in the browser's localStorage. There is
 * no separate index to fall out of step: listing reads the keys themselves.
 * Whatever is read back is parsed again, so an entry damaged by hand or by an
 * older version is skipped instead of breaking the app.
 */
export class BrowserFlowRepository implements FlowRepository {
  constructor(private readonly store: KeyValueStore) {}

  private read(key: string): FlowDocument | null {
    const text = this.store.getItem(key);
    if (text === null) return null;
    try {
      const parsed = parseFlow(JSON.parse(text));
      return parsed.ok ? parsed.flow : null;
    } catch {
      return null;
    }
  }

  async list(): Promise<FlowSummary[]> {
    const summaries: FlowSummary[] = [];
    for (let index = 0; index < this.store.length; index += 1) {
      const key = this.store.key(index);
      if (!key?.startsWith(PREFIX)) continue;
      const flow = this.read(key);
      if (!flow) continue;
      summaries.push({
        id: flow.id,
        name: flow.name,
        description: flow.description,
        updatedAt: flow.updatedAt,
        blockCount: flow.nodes.length,
      });
    }
    return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string): Promise<FlowDocument | null> {
    return this.read(PREFIX + id);
  }

  async save(flow: FlowDocument): Promise<void> {
    try {
      this.store.setItem(PREFIX + flow.id, JSON.stringify(flow));
    } catch {
      throw new StorageError("Your browser's storage is full or switched off, so the flow could not be saved.");
    }
  }

  async remove(id: string): Promise<void> {
    this.store.removeItem(PREFIX + id);
  }
}

/** Keeps flows in memory only. Used on the server and in tests. */
export class MemoryFlowRepository implements FlowRepository {
  private readonly flows = new Map<string, FlowDocument>();

  async list(): Promise<FlowSummary[]> {
    return [...this.flows.values()]
      .map((flow) => ({
        id: flow.id,
        name: flow.name,
        description: flow.description,
        updatedAt: flow.updatedAt,
        blockCount: flow.nodes.length,
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string): Promise<FlowDocument | null> {
    return this.flows.get(id) ?? null;
  }

  async save(flow: FlowDocument): Promise<void> {
    this.flows.set(flow.id, structuredClone(flow));
  }

  async remove(id: string): Promise<void> {
    this.flows.delete(id);
  }
}
