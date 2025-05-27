import { z } from "zod";
import { errorMessage, type AiSettings } from "@/engine/types";

// Which language model the AI step talks to.
//
// Flowboard has no key of its own and no server that calls a model. The
// visitor brings a key, it is kept in their browser only, and requests go
// straight from the browser to the provider. With no key, AI steps return
// their sample reply instead.
//
// Every provider here speaks the same "chat completions" API that OpenAI
// introduced, so one executor covers them all.

export const AI_PROVIDERS = ["none", "gemini", "groq", "openai", "custom"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

type Preset = {
  label: string;
  baseUrl: string;
  /**
   * A starting point only. The dialog can list what the key really has access to.
   * Checked against each provider's own model list on 6 October 2026: providers
   * retire models, and a name that worked last year may refuse a new key.
   *
   * The starting model is a small, quick one on purpose. Tried with a real free
   * key that day, Gemini's largest Flash model was either busy (503) or took
   * 25 to 40 seconds for one word, while Flash-Lite answered in under two.
   */
  model: string;
  keyPage?: string;
  note: string;
};

export const AI_PRESETS: Record<Exclude<AiProvider, "none">, Preset> = {
  gemini: {
    label: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-3.5-flash-lite",
    keyPage: "https://aistudio.google.com/apikey",
    note: "Has a free tier. Create a key in Google AI Studio.",
  },
  groq: {
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    model: "openai/gpt-oss-120b",
    keyPage: "https://console.groq.com/keys",
    note: "Has a free tier. Create a key in the Groq console.",
  },
  openai: {
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    keyPage: "https://platform.openai.com/api-keys",
    note: "Paid. Calls are billed to your OpenAI account.",
  },
  custom: {
    label: "Another compatible service",
    baseUrl: "",
    model: "",
    note: "Any service with an OpenAI-style /chat/completions endpoint, such as a model running on your own machine.",
  },
};

export const aiConfigSchema = z.object({
  provider: z.enum(AI_PROVIDERS).default("none"),
  baseUrl: z.string().max(500).default(""),
  apiKey: z.string().max(500).default(""),
  model: z.string().max(200).default(""),
});
export type AiConfig = z.infer<typeof aiConfigSchema>;

export const NO_AI: AiConfig = { provider: "none", baseUrl: "", apiKey: "", model: "" };

/** The settings a provider starts with when it is picked in the dialog. */
export function presetConfig(provider: AiProvider, apiKey = ""): AiConfig {
  if (provider === "none") return NO_AI;
  const preset = AI_PRESETS[provider];
  return { provider, baseUrl: preset.baseUrl, apiKey, model: preset.model };
}

/**
 * What the engine needs to call a model, or null when the settings are not
 * enough to make a call. Only a custom service may go without a key, because
 * a model on your own machine usually needs none.
 */
export function toAiSettings(config: AiConfig): AiSettings | null {
  if (config.provider === "none") return null;
  const baseUrl = config.baseUrl.trim();
  const model = config.model.trim();
  const apiKey = config.apiKey.trim();
  if (baseUrl === "" || model === "") return null;
  if (apiKey === "" && config.provider !== "custom") return null;
  return { baseUrl, apiKey, model };
}

export const AI_STORAGE_KEY = "flowboard:ai";

type KeyValueStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function loadAiConfig(store: KeyValueStore): AiConfig {
  try {
    const parsed = aiConfigSchema.safeParse(JSON.parse(store.getItem(AI_STORAGE_KEY) ?? "null"));
    return parsed.success ? parsed.data : NO_AI;
  } catch {
    return NO_AI;
  }
}

export function storeAiConfig(store: KeyValueStore, config: AiConfig): void {
  try {
    if (config.provider === "none") store.removeItem(AI_STORAGE_KEY);
    else store.setItem(AI_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Storage may be full or switched off. The key still works until the page is closed.
  }
}

export type KeyCheck = { ok: true; models: string[] } | { ok: false; message: string };

/**
 * Ask the provider which models this key can use. Doubles as a check that the
 * address and the key are right, without spending anything on a real prompt.
 */
export async function listModels(config: AiConfig, fetcher: typeof fetch = fetch): Promise<KeyCheck> {
  const baseUrl = config.baseUrl.trim().replace(/\/+$/, "");
  if (baseUrl === "") return { ok: false, message: "Enter the service's address first." };

  let response: Response;
  try {
    response = await fetcher(`${baseUrl}/models`, {
      headers: config.apiKey.trim() === "" ? {} : { Authorization: `Bearer ${config.apiKey.trim()}` },
    });
  } catch {
    return { ok: false, message: "Could not reach the service. Check the address." };
  }

  const data = (await response.json().catch(() => null)) as { data?: { id?: unknown }[] } | null;

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      return { ok: false, message: "The service refused the key. Check that it is complete and still active." };
    }
    return { ok: false, message: `The service answered ${response.status}. ${errorMessage(data) ?? ""}`.trim() };
  }

  const models = (data?.data ?? [])
    .map((entry) => (typeof entry.id === "string" ? entry.id.replace(/^models\//, "") : ""))
    .filter(Boolean)
    .sort();
  return { ok: true, models };
}
