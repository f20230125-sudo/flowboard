import { describe, expect, it, vi } from "vitest";
import { runFlow } from "@/engine/run";
import type { RunEvent } from "@/engine/types";
import { parseFlow } from "@/flow/schema";
import { validateFlow } from "@/flow/validate";
import { TEMPLATES, findTemplate, summarise } from "./index";

// Stand-ins for the public APIs the templates call, shaped like the real answers.
const ANSWERS: [RegExp, unknown, number?][] = [
  [/api\.open-meteo\.com/, { current: { temperature_2m: 41.2, wind_speed_10m: 12 } }],
  [/open\.er-api\.com/, { result: "success", base_code: "AED", rates: { INR: 26.9, USD: 0.2723 } }],
  [
    /api\.github\.com/,
    [
      { name: "next.js", stargazers_count: 130000 },
      { name: "small-experiment", stargazers_count: 12 },
      { name: "turborepo", stargazers_count: 27000 },
    ],
  ],
  [/jsonplaceholder\.typicode\.com/, { id: 101 }, 201],
];

const fakeFetch = vi.fn(async (input: string | URL | Request) => {
  const url = String(input);
  const match = ANSWERS.find(([pattern]) => pattern.test(url));
  if (!match) throw new TypeError(`Unexpected call to ${url}`);
  return new Response(JSON.stringify(match[1]), { status: match[2] ?? 200, headers: { "content-type": "application/json" } });
}) as unknown as typeof fetch;

describe("templates", () => {
  it("has four, each with its own id", () => {
    expect(TEMPLATES).toHaveLength(4);
    expect(new Set(TEMPLATES.map((template) => template.id)).size).toBe(4);
  });

  it.each(TEMPLATES.map((template) => [template.name, template] as const))("%s is a valid flow with nothing to fix", (_name, template) => {
    expect(parseFlow(JSON.parse(JSON.stringify(template.flow)))).toEqual({ ok: true, flow: template.flow });
    expect(validateFlow(template.flow)).toEqual([]);
  });

  it.each(TEMPLATES.map((template) => [template.name, template] as const))("%s runs to the end with no key", async (_name, template) => {
    const events: RunEvent[] = [];
    const summary = await runFlow(template.flow, { fetch: fakeFetch, ai: null, onEvent: (event) => events.push(event) });

    expect(events.filter((event) => event.type === "node-failed")).toEqual([]);
    expect(summary.status).toBe("succeeded");
    expect(summary.results).toHaveLength(1);
  });

  it("gives the results a visitor would expect", async () => {
    const run = async (id: string) => (await runFlow(findTemplate(id)!.flow, { fetch: fakeFetch, ai: null })).results[0].value;

    expect(await run("heat-check")).toEqual({
      city: "Dubai",
      temperature: 41.2,
      advice: "Too hot. Stay inside until the evening.",
    });
    expect(await run("dirham-rate")).toEqual({
      rate: 26.9,
      message: "1 AED is 26.9 INR. That is at or above your target.",
    });
    expect(await run("repo-digest")).toMatchObject({ account: "vercel", popularRepositories: 2 });
    expect(await run("ticket-triage")).toEqual({
      status: "escalated",
      reference: 101,
      reason: "Payments are failing, which stops all sales.",
    });
  });

  it("sends the escalation as a JSON POST", async () => {
    await runFlow(findTemplate("ticket-triage")!.flow, { fetch: fakeFetch, ai: null });
    const call = vi.mocked(fakeFetch).mock.calls.find(([url]) => String(url).includes("jsonplaceholder"))!;
    expect(call[1]).toMatchObject({ method: "POST", headers: { "Content-Type": "application/json" } });
    expect(JSON.parse(call[1]!.body as string)).toEqual({
      title: "URGENT ticket from Amal",
      body: "Payments are failing, which stops all sales.",
      userId: 1,
    });
  });

  it("summarises a template without its flow", () => {
    const summary = summarise(TEMPLATES[0]);
    expect(summary).toMatchObject({ id: "heat-check", name: "Heat check", blockCount: 6 });
    expect(summary).not.toHaveProperty("flow");
    expect(findTemplate("nope")).toBeUndefined();
  });
});
