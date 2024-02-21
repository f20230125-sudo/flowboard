// Takes the screenshots used in the README.
//
//   npm run dev            (in one terminal)
//   npm run screenshots    (in another)
//
// The public APIs the templates call are replaced with fixed answers, so the
// pictures come out the same every time and no outside service is touched.

import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://localhost:3020";
const OUT = process.env.OUT_DIR ?? "docs/screenshots";
const THEME = process.env.THEME === "light" ? "light" : "dark";

const json = (body, status = 200) => ({
  status,
  contentType: "application/json",
  headers: { "access-control-allow-origin": "*" },
  body: JSON.stringify(body),
});

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: THEME, deviceScaleFactor: 1 });

let weatherStatus = 200;
await context.route("https://api.open-meteo.com/**", (route) =>
  weatherStatus === 200
    ? route.fulfill(json({ latitude: 25.2, longitude: 55.3, current: { time: "2026-10-05T12:00", temperature_2m: 38.4, wind_speed_10m: 14.2 } }))
    : route.fulfill(json({ error: true, reason: "The weather service is having trouble." }, weatherStatus)),
);
await context.route("https://jsonplaceholder.typicode.com/**", (route) => route.fulfill(json({ id: 101 }, 201)));

const page = await context.newPage();
const shot = async (name) => {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`saved ${OUT}/${name}.png`);
};

// Home
await page.goto(BASE);
await page.getByRole("button", { name: /Heat check/ }).waitFor();
await shot("home");

// Editor, opened from a template
await page.getByRole("button", { name: /Heat check/ }).click();
await page.waitForURL(/\/flows\//);
await page.locator(".react-flow__node").nth(5).waitFor();
await shot("editor");

// A block's settings
await page.getByTestId("rf__node-getWeather").click();
await shot("settings");

// A run that succeeds
await page.getByRole("button", { name: "Run", exact: true }).click();
await page.getByRole("tab", { name: /succeeded/ }).waitFor();
await shot("run");

// A run that fails at the request
weatherStatus = 503;
await page.getByRole("button", { name: "Run", exact: true }).click();
await page.getByRole("tab", { name: /failed/ }).waitFor();
await shot("failed");

await browser.close();
