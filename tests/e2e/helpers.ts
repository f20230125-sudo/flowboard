import { expect, type BrowserContext, type Page } from "@playwright/test";

// No test talks to the outside world. Every public API the templates call is
// answered here, and each test can change an answer to see what the app does.

export type Answers = {
  weather: { status: number; body: unknown };
  models: { status: number; body: unknown };
  chat: { status: number; body: unknown };
};

export function defaultAnswers(): Answers {
  return {
    weather: { status: 200, body: { current: { time: "2026-10-05T12:00", temperature_2m: 38.4, wind_speed_10m: 14.2 } } },
    models: { status: 200, body: { data: [{ id: "llama-small" }, { id: "llama-large" }] } },
    chat: {
      status: 200,
      body: { choices: [{ message: { role: "assistant", content: '{"urgency": "normal", "reason": "A question about an invoice."}' } }] },
    },
  };
}

const reply = (answer: { status: number; body: unknown }) => ({
  status: answer.status,
  contentType: "application/json",
  headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" },
  body: JSON.stringify(answer.body),
});

/** Calls seen by the stand-in APIs, so a test can check what the app sent. */
export type Seen = { url: string; method: string; body: string | null; authorization: string | null }[];

export async function mockApis(context: BrowserContext, answers: Answers = defaultAnswers()): Promise<Seen> {
  const seen: Seen = [];
  const record = (request: import("@playwright/test").Request) =>
    seen.push({
      url: request.url(),
      method: request.method(),
      body: request.postData(),
      authorization: request.headers().authorization ?? null,
    });

  await context.route("https://api.open-meteo.com/**", (route) => {
    record(route.request());
    return route.fulfill(reply(answers.weather));
  });
  await context.route("https://jsonplaceholder.typicode.com/**", (route) => {
    record(route.request());
    return route.fulfill(reply({ status: 201, body: { id: 101 } }));
  });
  await context.route("https://api.groq.com/**", (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: reply(answers.models).headers });
    record(route.request());
    return route.fulfill(reply(route.request().url().endsWith("/models") ? answers.models : answers.chat));
  });
  return seen;
}

/** Start a flow from a template and wait for the editor to show its blocks. */
export async function openTemplate(page: Page, name: RegExp, firstBlock: string): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name }).click();
  await page.waitForURL(/\/flows\/[0-9a-f]+$/);
  await expect(block(page, firstBlock)).toBeVisible();
}

/** Start an empty flow, which has a trigger and nothing else. */
export async function openBlankFlow(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "New flow" }).click();
  await page.waitForURL(/\/flows\/[0-9a-f]+$/);
  await expect(page.locator(".react-flow__node")).toHaveCount(1);
}

/** A block on the canvas. Template blocks keep their name as their id. */
export const block = (page: Page, id: string) => page.getByTestId(`rf__node-${id}`);
export const blocks = (page: Page) => page.locator(".react-flow__node");
export const connections = (page: Page) => page.locator(".react-flow__edge");
export const runButton = (page: Page) => page.getByRole("button", { name: "Run", exact: true });
export const saved = (page: Page) => page.getByText("Saved in this browser");
