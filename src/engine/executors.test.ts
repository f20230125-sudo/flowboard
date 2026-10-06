import { describe, expect, it, vi } from "vitest";
import { defaultConfig } from "@/flow/catalog";
import type { ConfigOf, NodeType } from "@/flow/schema";
import { EXECUTORS, FIRST_RETRY_WAIT_MS } from "./executors";
import type { Scope } from "./reference";
import { StepError, abortError, type AiSettings, type ExecContext } from "./types";

// No test here touches the network: `fetch` is always a stand-in.

const scope: Scope = {
  steps: { getUser: { body: { id: 7, name: "Amal" } } },
  input: { ok: true },
  trigger: { city: "Dubai", tickets: [{ id: 1, urgency: "high" }, { id: 2, urgency: "low" }] },
};

type FakeFetch = (url: string, init?: RequestInit) => Promise<Response>;

function context(overrides: Omit<Partial<ExecContext>, "fetch"> & { fetch?: FakeFetch } = {}): ExecContext {
  return {
    scope,
    signal: new AbortController().signal,
    fetch: vi.fn(async () => new Response("{}")) as unknown as typeof fetch,
    ai: null,
    relayUrl: "/api/relay",
    sleep: async () => {},
    ...overrides,
  } as ExecContext;
}

function settings<T extends NodeType>(type: T, changes: Partial<ConfigOf<T>> = {}): ConfigOf<T> {
  return { ...defaultConfig(type), ...changes };
}

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" }, ...init });
}

async function failure(run: Promise<unknown>): Promise<StepError> {
  const error = await run.then(
    () => null,
    (problem: unknown) => problem,
  );
  expect(error).toBeInstanceOf(StepError);
  return error as StepError;
}

describe("trigger", () => {
  it("hands its sample data to the flow", async () => {
    const result = await EXECUTORS.trigger(settings("trigger", { payload: '{"city":"Dubai"}' }), context());
    expect(result.output).toEqual({ city: "Dubai" });
  });

  it("treats empty sample data as an empty object", async () => {
    expect((await EXECUTORS.trigger(settings("trigger", { payload: "  " }), context())).output).toEqual({});
  });

  it("fails with a clear message on bad JSON", async () => {
    const error = await failure(EXECUTORS.trigger(settings("trigger", { payload: "{city}" }), context()));
    expect(error.code).toBe("bad_json");
  });
});

describe("http", () => {
  it("builds the address from references and query parameters", async () => {
    const fetch = vi.fn<FakeFetch>(async () => json({ temp: 41 }));
    const result = await EXECUTORS.http(
      settings("http", {
        url: "https://api.example.com/users/{{ steps.getUser.body.id }}",
        query: [
          { key: "city", value: "{{ trigger.city }}" },
          { key: "", value: "ignored" },
        ],
        headers: [{ key: "X-Name", value: "{{ steps.getUser.body.name }}" }],
      }),
      context({ fetch }),
    );

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://api.example.com/users/7?city=Dubai");
    expect(init).toMatchObject({ method: "GET", headers: { "X-Name": "Amal" } });
    expect(init?.body).toBeUndefined();
    expect(result.output).toMatchObject({ status: 200, ok: true, body: { temp: 41 } });
  });

  it("sends a JSON body with the right content type", async () => {
    const fetch = vi.fn<FakeFetch>(async () => json({ id: 101 }, { status: 201 }));
    await EXECUTORS.http(
      settings("http", { method: "POST", url: "https://api.example.com/tickets", body: '{"by": "{{ steps.getUser.body.name }}"}' }),
      context({ fetch }),
    );
    const init = fetch.mock.calls[0][1]!;
    expect(init.body).toBe('{"by": "Amal"}');
    expect(init.headers).toMatchObject({ "Content-Type": "application/json" });
  });

  it("keeps a content type the flow set itself", async () => {
    const fetch = vi.fn<FakeFetch>(async () => json({}));
    await EXECUTORS.http(
      settings("http", { method: "PUT", url: "https://api.example.com/a", body: "{}", headers: [{ key: "content-type", value: "text/plain" }] }),
      context({ fetch }),
    );
    expect(fetch.mock.calls[0][1]!.headers).toEqual({ "content-type": "text/plain" });
  });

  it("returns text when the answer is not JSON", async () => {
    const fetch = async () => new Response("pong", { headers: { "content-type": "text/plain" } });
    const result = await EXECUTORS.http(settings("http", { url: "https://api.example.com/ping" }), context({ fetch }));
    expect(result.output).toMatchObject({ body: "pong" });
  });

  it("fails the step on a 404 and keeps the answer for the run panel", async () => {
    const fetch = async () => json({ message: "Not Found" }, { status: 404, statusText: "Not Found" });
    const error = await failure(EXECUTORS.http(settings("http", { url: "https://api.example.com/nope" }), context({ fetch })));
    expect(error.code).toBe("http_status");
    expect(error.message).toBe("api.example.com answered 404 Not Found.");
    expect(error.detail).toMatchObject({ status: 404, ok: false, body: { message: "Not Found" } });
  });

  it("passes a 404 on as data when told not to fail", async () => {
    const fetch = async () => json({ message: "Not Found" }, { status: 404 });
    const result = await EXECUTORS.http(
      settings("http", { url: "https://api.example.com/nope", failOnError: false }),
      context({ fetch }),
    );
    expect(result.output).toMatchObject({ status: 404, ok: false });
  });

  it("explains a call that could not be made", async () => {
    const fetch = async () => {
      throw new TypeError("Failed to fetch");
    };
    const error = await failure(EXECUTORS.http(settings("http", { url: "https://down.example.com" }), context({ fetch })));
    expect(error.code).toBe("network");
    expect(error.message).toContain("Could not reach down.example.com");
    expect(error.message).toContain("Send through server");
  });

  it("refuses something that is not a web address", async () => {
    for (const url of ["", "ftp://example.com", "example.com/api", "https://"]) {
      const error = await failure(EXECUTORS.http(settings("http", { url }), context()));
      expect(error.code).toBe("bad_url");
    }
  });

  it("gives up when the time limit passes", async () => {
    // A server that never answers: it only reacts to being cut off.
    const fetch: FakeFetch = (_url, init) =>
      new Promise((_resolve, reject) => init!.signal!.addEventListener("abort", () => reject(abortError())));
    const error = await failure(
      EXECUTORS.http(settings("http", { url: "https://slow.example.com", timeoutMs: 20 }), context({ fetch })),
    );
    expect(error.code).toBe("timeout");
    expect(error.message).toBe("slow.example.com did not answer within 0.02 seconds.");
  });

  it("stops at once when the run is stopped, without calling it a failure", async () => {
    const stop = new AbortController();
    const fetch: FakeFetch = (_url, init) =>
      new Promise((_resolve, reject) => init!.signal!.addEventListener("abort", () => reject(abortError())));
    const pending = EXECUTORS.http(settings("http", { url: "https://slow.example.com" }), context({ fetch, signal: stop.signal }));
    stop.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("can send the call through the relay", async () => {
    const fetch = vi.fn<FakeFetch>(async () =>
      json({ status: 200, statusText: "OK", headers: { "content-type": "application/json" }, body: '{"rate":3.67}' }),
    );
    const result = await EXECUTORS.http(
      settings("http", { url: "https://api.example.com/rates", via: "server", query: [{ key: "base", value: "USD" }] }),
      context({ fetch }),
    );

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("/api/relay");
    expect(JSON.parse(init!.body as string)).toMatchObject({ method: "GET", url: "https://api.example.com/rates?base=USD" });
    expect(result.output).toMatchObject({ status: 200, body: { rate: 3.67 } });
  });

  it("shows the relay's own refusal", async () => {
    const fetch = async () => json({ error: { code: "host_not_allowed", message: "The relay does not call evil.example.com." } }, { status: 403 });
    const error = await failure(
      EXECUTORS.http(settings("http", { url: "https://evil.example.com", via: "server" }), context({ fetch })),
    );
    expect(error.code).toBe("host_not_allowed");
  });
});

describe("http, with extra tries", () => {
  const busy = () => json({ reason: "Busy" }, { status: 503, statusText: "Service Unavailable" });

  it("asks again when the server is busy, waiting longer each time, and says which try worked", async () => {
    const fetch = vi.fn<FakeFetch>().mockResolvedValueOnce(busy()).mockResolvedValueOnce(busy()).mockResolvedValueOnce(json({ temp: 41 }));
    const sleep = vi.fn<ExecContext["sleep"]>(async () => {});
    const result = await EXECUTORS.http(settings("http", { url: "https://api.example.com/weather", retries: 2 }), context({ fetch, sleep }));

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([FIRST_RETRY_WAIT_MS, FIRST_RETRY_WAIT_MS * 2]);
    expect(result.output).toMatchObject({ status: 200, body: { temp: 41 } });
    expect(result.note).toBe("Answered on try 3 of 3.");
  });

  it("gives up after the last try and says how many it made", async () => {
    const fetch = vi.fn<FakeFetch>(async () => busy());
    const error = await failure(
      EXECUTORS.http(settings("http", { url: "https://api.example.com/weather", retries: 2 }), context({ fetch })),
    );
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(error.code).toBe("http_status");
    expect(error.message).toBe("api.example.com answered 503 Service Unavailable after 3 tries.");
    expect(error.detail).toMatchObject({ status: 503, body: { reason: "Busy" } });
  });

  it("asks again when the server cannot be reached", async () => {
    const fetch = vi.fn<FakeFetch>().mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce(json({ ok: true }));
    const result = await EXECUTORS.http(settings("http", { url: "https://api.example.com", retries: 1 }), context({ fetch }));
    expect(result.note).toBe("Answered on try 2 of 2.");

    const down = vi.fn<FakeFetch>(async () => {
      throw new TypeError("Failed to fetch");
    });
    const error = await failure(EXECUTORS.http(settings("http", { url: "https://down.example.com", retries: 1 }), context({ fetch: down })));
    expect(down).toHaveBeenCalledTimes(2);
    expect(error.code).toBe("network");
    expect(error.message).toMatch(/^Could not reach down\.example\.com\..* Tried 2 times\.$/);
  });

  it("does not ask again for an answer that would be the same next time", async () => {
    const fetch = vi.fn<FakeFetch>(async () => json({ message: "Not Found" }, { status: 404 }));
    await failure(EXECUTORS.http(settings("http", { url: "https://api.example.com/nope", retries: 3 }), context({ fetch })));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("calls once when no extra tries are set, which is the default", async () => {
    const fetch = vi.fn<FakeFetch>(async () => busy());
    const error = await failure(EXECUTORS.http(settings("http", { url: "https://api.example.com/weather" }), context({ fetch })));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(error.message).toBe("api.example.com answered 503 Service Unavailable.");
  });

  it("hands a busy answer on as data after the last try, when told not to fail", async () => {
    const fetch = vi.fn<FakeFetch>(async () => busy());
    const result = await EXECUTORS.http(
      settings("http", { url: "https://api.example.com/weather", retries: 1, failOnError: false }),
      context({ fetch }),
    );
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.output).toMatchObject({ status: 503, ok: false });
  });

  it("stops waiting for the next try when the run is stopped", async () => {
    const stop = new AbortController();
    const fetch = vi.fn<FakeFetch>(async () => busy());
    // Stop arrives during the wait between tries.
    const sleep = async () => {
      stop.abort();
      throw abortError();
    };
    const pending = EXECUTORS.http(
      settings("http", { url: "https://api.example.com/weather", retries: 3 }),
      context({ fetch, sleep, signal: stop.signal }),
    );
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("condition", () => {
  it("picks the true side", async () => {
    const result = await EXECUTORS.condition(
      settings("condition", { left: "{{ steps.getUser.body.id }}", operator: "greaterThan", right: "5" }),
      context(),
    );
    expect(result).toEqual({ output: { result: true, left: 7, right: 5 }, branch: "true" });
  });

  it("picks the false side", async () => {
    const result = await EXECUTORS.condition(
      settings("condition", { left: "{{ trigger.city }}", operator: "equals", right: "Sharjah" }),
      context(),
    );
    expect(result.branch).toBe("false");
  });
});

describe("set", () => {
  it("builds an object, nesting dotted names and keeping types", async () => {
    const result = await EXECUTORS.set(
      settings("set", {
        fields: [
          { key: "user.name", value: "{{ steps.getUser.body.name }}" },
          { key: "user.id", value: "{{ steps.getUser.body.id }}" },
          { key: "limit", value: "10" },
          { key: "note", value: "From {{ trigger.city }}" },
          { key: " ", value: "skipped" },
        ],
      }),
      context(),
    );
    expect(result.output).toEqual({ user: { name: "Amal", id: 7 }, limit: 10, note: "From Dubai" });
  });

  it("refuses field names that reach into JavaScript itself", async () => {
    const error = await failure(EXECUTORS.set(settings("set", { fields: [{ key: "__proto__.admin", value: "true" }] }), context()));
    expect(error.code).toBe("bad_field");
    expect(({} as { admin?: unknown }).admin).toBeUndefined();
  });
});

describe("filter", () => {
  it("keeps the items that match, using {{ item }}", async () => {
    const result = await EXECUTORS.filter(
      settings("filter", { list: "{{ trigger.tickets }}", left: "{{ item.urgency }}", operator: "equals", right: "high" }),
      context(),
    );
    expect(result.output).toEqual([{ id: 1, urgency: "high" }]);
    expect(result.note).toBe("Kept 1 of 2.");
  });

  it("says what it got when that is not a list", async () => {
    const error = await failure(
      EXECUTORS.filter(settings("filter", { list: "{{ trigger.city }}", left: "{{ item }}" }), context()),
    );
    expect(error.code).toBe("not_a_list");
    expect(error.message).toBe('"{{ trigger.city }}" is not a list. It is text.');
  });
});

describe("delay", () => {
  it("waits, then passes its input on", async () => {
    const sleep = vi.fn(async () => {});
    const result = await EXECUTORS.delay(settings("delay", { ms: 250 }), context({ sleep }));
    expect(sleep).toHaveBeenCalledWith(250, expect.anything());
    expect(result.output).toEqual({ ok: true });
  });
});

describe("output", () => {
  it("passes its input through when no value is set", async () => {
    expect((await EXECUTORS.output(settings("output"), context())).output).toEqual({ ok: true });
  });

  it("renders its value otherwise", async () => {
    const result = await EXECUTORS.output(settings("output", { value: "{{ steps.getUser.body }}" }), context());
    expect(result.output).toEqual({ id: 7, name: "Amal" });
  });
});

describe("ai", () => {
  const key: AiSettings = { baseUrl: "https://ai.example.com/v1/", apiKey: "secret", model: "small-model" };
  const reply = (content: string) => json({ choices: [{ message: { role: "assistant", content } }] });

  it("returns the sample reply, marked as a sample, when there is no key", async () => {
    const fetch = vi.fn<FakeFetch>();
    const result = await EXECUTORS.ai(settings("ai", { prompt: "Summarise", sample: "A short summary." }), context({ fetch }));
    expect(result.output).toEqual({ text: "A short summary.", model: null, sample: true });
    expect(result.note).toBe("Sample reply. No model was called.");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("parses a JSON sample when JSON is expected", async () => {
    const result = await EXECUTORS.ai(
      settings("ai", { prompt: "Sort it", json: true, sample: '{"urgency":"high"}' }),
      context(),
    );
    expect(result.output).toMatchObject({ json: { urgency: "high" }, sample: true });
  });

  it("asks for a key when there is neither a key nor a sample", async () => {
    const error = await failure(EXECUTORS.ai(settings("ai", { prompt: "Summarise" }), context()));
    expect(error.code).toBe("ai_no_key");
  });

  it("calls the chat API with the rendered prompt and the key", async () => {
    const fetch = vi.fn<FakeFetch>(async () => reply("Amal is in Dubai."));
    const result = await EXECUTORS.ai(
      settings("ai", { system: "Be brief.", prompt: "Where is {{ steps.getUser.body.name }}?", temperature: 0.5 }),
      context({ fetch, ai: key }),
    );

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://ai.example.com/v1/chat/completions");
    expect(init!.headers).toMatchObject({ Authorization: "Bearer secret" });
    expect(JSON.parse(init!.body as string)).toEqual({
      model: "small-model",
      temperature: 0.5,
      messages: [
        { role: "system", content: "Be brief." },
        { role: "user", content: "Where is Amal?" },
      ],
    });
    expect(result.output).toEqual({ text: "Amal is in Dubai.", model: "small-model", sample: false });
    expect(result.note).toBeUndefined();
  });

  it("uses the block's own model and asks for JSON when told to", async () => {
    const fetch = vi.fn<FakeFetch>(async () => reply('```json\n{"urgency":"low"}\n```'));
    const result = await EXECUTORS.ai(
      settings("ai", { prompt: "Sort it", json: true, model: "big-model" }),
      context({ fetch, ai: key }),
    );
    const sent = JSON.parse(fetch.mock.calls[0][1]!.body as string);
    expect(sent).toMatchObject({ model: "big-model", response_format: { type: "json_object" } });
    expect(result.output).toMatchObject({ json: { urgency: "low" }, model: "big-model" });
  });

  it("sends no key header to a local model that needs none", async () => {
    const fetch = vi.fn<FakeFetch>(async () => reply("ok"));
    await EXECUTORS.ai(settings("ai", { prompt: "Hi" }), context({ fetch, ai: { ...key, apiKey: "" } }));
    expect(fetch.mock.calls[0][1]!.headers).not.toHaveProperty("Authorization");
  });

  it("shows what the service said when it refuses", async () => {
    const fetch = async () => json({ error: { message: "Invalid API key." } }, { status: 401 });
    const error = await failure(EXECUTORS.ai(settings("ai", { prompt: "Hi" }), context({ fetch, ai: key })));
    expect(error.code).toBe("ai_refused");
    expect(error.message).toBe("The AI service answered 401. Invalid API key.");
  });

  it("reads a refusal that comes wrapped in a list, as Gemini sends it", async () => {
    // What Gemini's chat endpoint really answers to a bad key (checked 6 October 2026).
    const fetch = async () =>
      json([{ error: { code: 400, message: "Please pass a valid API key", status: "INVALID_ARGUMENT" } }], { status: 400 });
    const error = await failure(EXECUTORS.ai(settings("ai", { prompt: "Hi" }), context({ fetch, ai: key })));
    expect(error.message).toBe("The AI service answered 400. Please pass a valid API key");
  });

  it("fails when JSON was expected and the reply is not JSON", async () => {
    const fetch = async () => reply("Sure! The urgency is high.");
    const error = await failure(EXECUTORS.ai(settings("ai", { prompt: "Sort it", json: true }), context({ fetch, ai: key })));
    expect(error.code).toBe("ai_not_json");
  });

  it("fails on an empty reply and on a service it cannot reach", async () => {
    const empty = await failure(EXECUTORS.ai(settings("ai", { prompt: "Hi" }), context({ fetch: async () => json({ choices: [] }), ai: key })));
    expect(empty.code).toBe("ai_empty");

    const offline: FakeFetch = async () => {
      throw new TypeError("Failed to fetch");
    };
    const unreachable = await failure(EXECUTORS.ai(settings("ai", { prompt: "Hi" }), context({ fetch: offline, ai: key })));
    expect(unreachable.code).toBe("network");
  });
});
