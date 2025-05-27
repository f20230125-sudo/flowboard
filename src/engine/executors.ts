import type { ConfigOf } from "@/flow/schema";
import { evaluate } from "./condition";
import { render, renderText, renderValue, type Json } from "./reference";
import { StepError, abortError, errorMessage, isAbortError, type ExecContext, type Executor, type ExecutorMap } from "./types";

// What each block does when it runs. Every executor is a plain async function
// of (settings, context) → output, so each one can be tested on its own.

const MAX_RESPONSE_CHARS = 2_000_000;

/** Answers that say "not now" rather than "no": worth asking again. */
const BUSY_STATUSES = new Set([429, 502, 503, 504]);
/** Failures without an answer that may pass by themselves. */
const PASSING_FAILURES = new Set(["network", "timeout"]);
/** The wait before the second try. It doubles for each try after that. */
export const FIRST_RETRY_WAIT_MS = 500;

/** How long one call to a model may take. A large model can think for a while. */
export const AI_TIMEOUT_MS = 60_000;
/** A model that says it is busy is asked this many more times. */
export const AI_EXTRA_TRIES = 2;
/**
 * What a busy model answers. 429 is left out on purpose: it means the key's
 * allowance is used up, and asking again a second later only uses more of it.
 */
const AI_BUSY_STATUSES = new Set([502, 503, 504]);

/**
 * A signal for one call. It fires when the call's time is up or when the run
 * is stopped, whichever comes first; `timedOut()` says afterwards which it was.
 */
function timeLimit(ms: number, context: ExecContext) {
  const limit = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    limit.abort();
  }, ms);
  const onStop = () => limit.abort();
  context.signal.addEventListener("abort", onStop, { once: true });
  return {
    signal: limit.signal,
    timedOut: () => timedOut,
    clear() {
      clearTimeout(timer);
      context.signal.removeEventListener("abort", onStop);
    },
  };
}

const trigger: Executor<"trigger"> = async (config) => {
  const text = config.payload.trim();
  if (text === "") return { output: {} };
  try {
    return { output: JSON.parse(text) as Json };
  } catch (problem) {
    throw new StepError("bad_json", `The sample data is not valid JSON. ${(problem as Error).message}`);
  }
};

// --- HTTP request -----------------------------------------------------------

function buildUrl(config: ConfigOf<"http">, context: ExecContext): URL {
  const address = renderText(config.url, context.scope).trim();
  if (address === "") throw new StepError("bad_url", "The address is empty.");
  if (!/^https?:\/\//i.test(address)) {
    throw new StepError("bad_url", `"${address}" is not a web address. It should start with https://.`);
  }
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    throw new StepError("bad_url", `"${address}" is not a valid web address.`);
  }
  for (const { key, value } of config.query) {
    if (key.trim() !== "") url.searchParams.append(key.trim(), renderText(value, context.scope));
  }
  return url;
}

function looksLikeJson(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

function readBody(text: string, contentType: string): Json {
  if (contentType.includes("json") || looksLikeJson(text)) {
    try {
      return JSON.parse(text) as Json;
    } catch {
      return text;
    }
  }
  return text;
}

type Answer = { status: number; statusText: string; headers: Record<string, string>; text: string };

/** Call the address straight from the browser. */
async function callDirect(url: URL, init: RequestInit, context: ExecContext): Promise<Answer> {
  const response = await context.fetch(url.toString(), init);
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return { status: response.status, statusText: response.statusText, headers, text: await response.text() };
}

/** Ask our own server to make the call, for APIs that refuse browsers. */
async function callThroughRelay(
  url: URL,
  request: { method: string; headers: Record<string, string>; body?: string; timeoutMs: number },
  signal: AbortSignal,
  context: ExecContext,
): Promise<Answer> {
  const response = await context.fetch(context.relayUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...request, url: url.toString() }),
    signal,
  });
  const reply = (await response.json().catch(() => null)) as
    | { status: number; statusText: string; headers: Record<string, string>; body: string }
    | { error: { code: string; message: string } }
    | null;
  if (reply === null) throw new StepError("relay_failed", "The server could not make this call.");
  if ("error" in reply) throw new StepError(reply.error.code, reply.error.message);
  return { status: reply.status, statusText: reply.statusText, headers: reply.headers, text: reply.body };
}

const http: Executor<"http"> = async (config, context) => {
  const url = buildUrl(config, context);

  const headers: Record<string, string> = {};
  for (const { key, value } of config.headers) {
    if (key.trim() !== "") headers[key.trim()] = renderText(value, context.scope);
  }

  let body: string | undefined;
  if (config.method !== "GET") {
    const text = renderText(config.body, context.scope);
    if (text.trim() !== "") {
      body = text;
      const hasType = Object.keys(headers).some((name) => name.toLowerCase() === "content-type");
      if (!hasType && looksLikeJson(text)) headers["Content-Type"] = "application/json";
    }
  }

  /** One try, with its own time limit. */
  const callOnce = async (): Promise<Answer> => {
    // Two things can cut the call short: the step's own time limit, and Stop.
    const limit = timeLimit(config.timeoutMs, context);
    try {
      return config.via === "server"
        ? await callThroughRelay(url, { method: config.method, headers, body, timeoutMs: config.timeoutMs }, limit.signal, context)
        : await callDirect(url, { method: config.method, headers, body, signal: limit.signal }, context);
    } catch (problem) {
      if (problem instanceof StepError) throw problem;
      if (context.signal.aborted) throw problem;
      if (limit.timedOut() || isAbortError(problem)) {
        throw new StepError("timeout", `${url.host} did not answer within ${config.timeoutMs / 1000} seconds.`);
      }
      const hint =
        config.via === "server"
          ? "The address may be wrong or the server may be down."
          : "The address may be wrong, the server may be down, or it may refuse calls from a browser. For the last case, turn on \"Send through server\".";
      throw new StepError("network", `Could not reach ${url.host}. ${hint}`);
    } finally {
      limit.clear();
    }
  };

  // Try, and while tries are left, try again after a busy answer or a failure
  // that may pass. Stop cuts the wait short the same way it cuts a Delay.
  let answer: Answer;
  let tries = 0;
  for (;;) {
    tries += 1;
    const lastTry = tries > config.retries;
    try {
      answer = await callOnce();
      if (lastTry || !BUSY_STATUSES.has(answer.status)) break;
    } catch (problem) {
      if (!(problem instanceof StepError) || !PASSING_FAILURES.has(problem.code)) throw problem;
      if (lastTry) {
        throw tries === 1 ? problem : new StepError(problem.code, `${problem.message} Tried ${tries} times.`);
      }
    }
    await context.sleep(FIRST_RETRY_WAIT_MS * 2 ** (tries - 1), context.signal);
  }

  if (answer.text.length > MAX_RESPONSE_CHARS) {
    throw new StepError("too_large", `The answer from ${url.host} is larger than 2 MB.`);
  }

  const output = {
    status: answer.status,
    ok: answer.status >= 200 && answer.status < 300,
    headers: answer.headers,
    body: readBody(answer.text, answer.headers["content-type"] ?? ""),
  };
  if (!output.ok && config.failOnError) {
    const reason = answer.statusText ? `${answer.status} ${answer.statusText}` : String(answer.status);
    const after = tries > 1 ? ` after ${tries} tries` : "";
    throw new StepError("http_status", `${url.host} answered ${reason}${after}.`, output);
  }
  return tries > 1 ? { output, note: `Answered on try ${tries} of ${config.retries + 1}.` } : { output };
};

// --- Logic and data ---------------------------------------------------------

const condition: Executor<"condition"> = async (config, context) => {
  const left = renderValue(config.left, context.scope);
  const right = renderValue(config.right, context.scope);
  const result = evaluate(left, config.operator, right);
  return { output: { result, left, right }, branch: result ? "true" : "false" };
};

const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

/** Write `value` at a dotted key such as "user.name", creating objects on the way. */
function setDeep(target: Record<string, Json>, dottedKey: string, value: Json): void {
  const keys = dottedKey.split(".").map((key) => key.trim());
  if (keys.some((key) => key === "" || FORBIDDEN_KEYS.has(key))) {
    throw new StepError("bad_field", `"${dottedKey}" cannot be used as a field name.`);
  }
  let current = target;
  for (const key of keys.slice(0, -1)) {
    const next = current[key];
    if (next === null || typeof next !== "object" || Array.isArray(next)) current[key] = {};
    current = current[key] as Record<string, Json>;
  }
  current[keys[keys.length - 1]] = value;
}

const set: Executor<"set"> = async (config, context) => {
  const output: Record<string, Json> = {};
  for (const { key, value } of config.fields) {
    if (key.trim() === "") continue;
    setDeep(output, key, renderValue(value, context.scope));
  }
  return { output };
};

function describe(value: Json): string {
  if (value === null) return "empty";
  if (Array.isArray(value)) return "a list";
  if (typeof value === "object") return "an object";
  return typeof value === "string" ? "text" : `a ${typeof value}`;
}

const filter: Executor<"filter"> = async (config, context) => {
  const list = render(config.list, context.scope);
  if (!Array.isArray(list)) {
    throw new StepError("not_a_list", `"${config.list.trim()}" is not a list. It is ${describe(list)}.`);
  }
  const kept = list.filter((item) => {
    const scope = { ...context.scope, item };
    return evaluate(renderValue(config.left, scope), config.operator, renderValue(config.right, scope));
  });
  return { output: kept, note: `Kept ${kept.length} of ${list.length}.` };
};

const delay: Executor<"delay"> = async (config, context) => {
  await context.sleep(config.ms, context.signal);
  return { output: context.scope.input };
};

const output: Executor<"output"> = async (config, context) => {
  if (config.value.trim() === "") return { output: context.scope.input };
  return { output: renderValue(config.value, context.scope) };
};

// --- AI step ----------------------------------------------------------------

/** Models often wrap JSON in a ```json fence. Take it off before parsing. */
function parseJsonReply(text: string): Json {
  const unfenced = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  return JSON.parse(unfenced) as Json;
}

function shapeReply(text: string, wantsJson: boolean, model: string | null, sample: boolean): Json {
  if (!wantsJson) return { text, model, sample };
  try {
    return { text, json: parseJsonReply(text), model, sample };
  } catch {
    throw new StepError(
      "ai_not_json",
      sample ? "The sample reply is not valid JSON." : "The model's reply was not valid JSON.",
      { text },
    );
  }
}

const ai: Executor<"ai"> = async (config, context) => {
  const prompt = renderText(config.prompt, context.scope);
  const system = renderText(config.system, context.scope);

  // No model available: fall back to the block's sample reply, and say so.
  if (!context.ai) {
    if (config.sample.trim() === "") {
      throw new StepError("ai_no_key", "This step needs a key. Add one in Settings, or give the block a sample reply.");
    }
    return {
      output: shapeReply(config.sample, config.json, null, true),
      note: "Sample reply. No model was called.",
    };
  }

  const model = config.model.trim() || context.ai.model;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (context.ai.apiKey !== "") headers.Authorization = `Bearer ${context.ai.apiKey}`;

  const messages = [
    ...(system.trim() === "" ? [] : [{ role: "system", content: system }]),
    { role: "user", content: prompt },
  ];

  const address = `${context.ai.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const request = JSON.stringify({
    model,
    messages,
    ...(config.temperature === null ? {} : { temperature: config.temperature }),
    ...(config.json ? { response_format: { type: "json_object" } } : {}),
  });

  type Reply = { status: number; ok: boolean; statusText: string; data: unknown };

  /** One call, read to the end within its time limit. */
  const callOnce = async (): Promise<Reply> => {
    const limit = timeLimit(AI_TIMEOUT_MS, context);
    try {
      const response = await context.fetch(address, { method: "POST", headers, body: request, signal: limit.signal });
      const data: unknown = await response.json().catch(() => null);
      if (limit.signal.aborted) throw abortError();
      return { status: response.status, ok: response.ok, statusText: response.statusText, data };
    } catch (problem) {
      if (context.signal.aborted) throw problem;
      if (limit.timedOut()) {
        throw new StepError(
          "timeout",
          `The AI service did not answer within ${AI_TIMEOUT_MS / 1000} seconds. The model may be busy: try again, or choose a quicker one in Settings.`,
        );
      }
      throw new StepError("network", "Could not reach the AI service. Check the address in Settings.");
    } finally {
      limit.clear();
    }
  };

  // A model that is busy says so at once, and often is not a moment later.
  let reply: Reply;
  let tries = 0;
  for (;;) {
    tries += 1;
    reply = await callOnce();
    if (!AI_BUSY_STATUSES.has(reply.status) || tries > AI_EXTRA_TRIES) break;
    await context.sleep(FIRST_RETRY_WAIT_MS * 2 ** tries, context.signal);
  }

  if (!reply.ok) {
    const reason = errorMessage(reply.data) ?? reply.statusText;
    const after = tries > 1 ? ` after ${tries} tries` : "";
    const hint = AI_BUSY_STATUSES.has(reply.status) ? " Another model in Settings may be less busy." : "";
    throw new StepError("ai_refused", `${`The AI service answered ${reply.status}${after}. ${reason}`.trim()}${hint}`);
  }

  const text = (reply.data as { choices?: { message?: { content?: unknown } }[] } | null)?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || text === "") {
    throw new StepError("ai_empty", "The AI service sent back no text.");
  }
  const output = shapeReply(text, config.json, model, false);
  return tries > 1 ? { output, note: `Answered on try ${tries} of ${AI_EXTRA_TRIES + 1}.` } : { output };
};

export const EXECUTORS: ExecutorMap = { trigger, http, condition, set, filter, ai, delay, output };
