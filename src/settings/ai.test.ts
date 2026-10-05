import { describe, expect, it, vi } from "vitest";
import { AI_PRESETS, AI_STORAGE_KEY, NO_AI, listModels, loadAiConfig, presetConfig, storeAiConfig, toAiSettings } from "./ai";

function fakeStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("AI settings", () => {
  it("starts a provider from its preset", () => {
    expect(presetConfig("groq", "key")).toEqual({
      provider: "groq",
      baseUrl: AI_PRESETS.groq.baseUrl,
      apiKey: "key",
      model: AI_PRESETS.groq.model,
    });
    expect(presetConfig("none", "key")).toEqual(NO_AI);
  });

  it("only hands the engine settings it can make a call with", () => {
    expect(toAiSettings(NO_AI)).toBeNull();
    expect(toAiSettings(presetConfig("gemini"))).toBeNull(); // no key yet
    expect(toAiSettings({ ...presetConfig("gemini", "k"), model: " " })).toBeNull();
    expect(toAiSettings(presetConfig("gemini", " k "))).toEqual({
      baseUrl: AI_PRESETS.gemini.baseUrl,
      apiKey: "k",
      model: AI_PRESETS.gemini.model,
    });
  });

  it("lets a custom service go without a key, for a model on your own machine", () => {
    expect(toAiSettings({ provider: "custom", baseUrl: "http://localhost:11434/v1", apiKey: "", model: "llama3" })).toEqual({
      baseUrl: "http://localhost:11434/v1",
      apiKey: "",
      model: "llama3",
    });
    expect(toAiSettings({ provider: "custom", baseUrl: "", apiKey: "", model: "llama3" })).toBeNull();
  });

  it("remembers the settings in the browser and forgets them when switched off", () => {
    const storage = fakeStorage();
    const config = presetConfig("groq", "secret");

    storeAiConfig(storage, config);
    expect(loadAiConfig(storage)).toEqual(config);

    storeAiConfig(storage, NO_AI);
    expect(storage.data.has(AI_STORAGE_KEY)).toBe(false);
    expect(loadAiConfig(storage)).toEqual(NO_AI);
  });

  it("falls back to no model when what is stored is damaged", () => {
    const storage = fakeStorage();
    storage.data.set(AI_STORAGE_KEY, "{broken");
    expect(loadAiConfig(storage)).toEqual(NO_AI);
    storage.data.set(AI_STORAGE_KEY, JSON.stringify({ provider: "skynet" }));
    expect(loadAiConfig(storage)).toEqual(NO_AI);
  });
});

describe("listModels", () => {
  it("asks the provider's models endpoint with the key and returns the names", async () => {
    const fetcher = vi.fn(async () => json({ data: [{ id: "models/gemini-b" }, { id: "gemini-a" }, { id: 7 }] }));
    const answer = await listModels(presetConfig("gemini", "secret"), fetcher as unknown as typeof fetch);

    expect(fetcher).toHaveBeenCalledWith("https://generativelanguage.googleapis.com/v1beta/openai/models", {
      headers: { Authorization: "Bearer secret" },
    });
    expect(answer).toEqual({ ok: true, models: ["gemini-a", "gemini-b"] });
  });

  it("explains a refused key, another error, and a service it cannot reach", async () => {
    const config = presetConfig("groq", "bad");
    const refused = await listModels(config, (async () => json({ error: { message: "Invalid API Key" } }, 401)) as typeof fetch);
    expect(refused).toEqual({ ok: false, message: "The service refused the key. Check that it is complete and still active." });

    const broken = await listModels(config, (async () => json({ error: "overloaded" }, 503)) as typeof fetch);
    expect(broken).toEqual({ ok: false, message: "The service answered 503. overloaded" });

    const offline = await listModels(config, (async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch);
    expect(offline).toEqual({ ok: false, message: "Could not reach the service. Check the address." });
  });

  it("asks for an address before trying", async () => {
    const fetcher = vi.fn();
    const answer = await listModels({ provider: "custom", baseUrl: " ", apiKey: "", model: "" }, fetcher as unknown as typeof fetch);
    expect(answer.ok).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("sends no key header when there is no key", async () => {
    const fetcher = vi.fn(async () => json({ data: [] }));
    await listModels({ provider: "custom", baseUrl: "http://localhost:11434/v1/", apiKey: "", model: "" }, fetcher as unknown as typeof fetch);
    expect(fetcher).toHaveBeenCalledWith("http://localhost:11434/v1/models", { headers: {} });
  });
});
