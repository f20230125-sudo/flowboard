// Records the short demo at the top of the README.
//
//   npm run dev     (in one terminal)
//   npm run gif     (in another)
//
// A browser is driven through one tour of the editor while every frame it
// draws is kept, and the frames become docs/demo.gif. The weather API is
// replaced with a fixed answer that takes a second to arrive, so the recording
// comes out the same every time and the running step can be seen.

import { mkdir, stat } from "node:fs/promises";
import { chromium } from "@playwright/test";
import sharp from "sharp";

const BASE = process.env.BASE_URL ?? "http://localhost:3020";
const OUT = process.env.OUT_FILE ?? "docs/demo.gif";
const VIEW = { width: 1280, height: 760 };

// --- Drawn on top of the page: a pointer, since a headless browser has none,
// --- and one line saying what is happening.

function overlay() {
  const layer = document.createElement("div");
  layer.setAttribute("aria-hidden", "true");
  layer.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none;font-family:ui-sans-serif,system-ui,sans-serif";
  layer.innerHTML = `
    <div id="demo-caption" style="position:absolute;left:50%;top:60px;transform:translateX(-50%);padding:8px 16px;
      border-radius:12px;background:rgba(12,14,19,.95);border:1px solid #454d5c;color:#f3f5f8;font-size:16px;
      font-weight:500;white-space:nowrap;box-shadow:0 10px 30px rgba(0,0,0,.5);display:none"></div>
    <div id="demo-pointer" style="position:absolute;left:0;top:0;width:24px;height:24px;margin:-2px 0 0 -4px">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 30"><path d="M5 3 L5 24 L11 18.5 L15 27 L19 25 L15 16.8 L23 16.8 Z"
        fill="#fff" stroke="#0b0d10" stroke-width="1.8" stroke-linejoin="round"/></svg>
    </div>`;
  document.body.appendChild(layer);
  const pointer = document.getElementById("demo-pointer");
  document.addEventListener("mousemove", (event) => {
    pointer.style.transform = `translate(${event.clientX}px, ${event.clientY}px)`;
  }, true);
  window.demoCaption = (text) => {
    const caption = document.getElementById("demo-caption");
    caption.textContent = text;
    caption.style.display = text ? "" : "none";
  };
}

// --- The tour ---------------------------------------------------------------------

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: VIEW, colorScheme: "dark", deviceScaleFactor: 1 });
await context.route("https://api.open-meteo.com/**", async (route) => {
  await new Promise((done) => setTimeout(done, 1100));
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*" },
    body: JSON.stringify({ latitude: 25.2, longitude: 55.3, current: { time: "2026-10-06T12:00", temperature_2m: 38.4, wind_speed_10m: 14.2 } }),
  });
});

const page = await context.newPage();
await page.goto(BASE);
await page.getByRole("button", { name: /Heat check/ }).click();
await page.waitForURL(/\/flows\//);
await page.getByTestId("rf__node-result").waitFor();
// Open the run panel first and fit the flow into the room that is left, so
// nothing jumps or hides when the run starts.
await page.getByRole("tab", { name: "Run" }).click();
await page.locator(".react-flow__controls-fitview").click();
await page.waitForTimeout(500);
await page.evaluate(overlay);

let at = { x: 640, y: 260 };
await page.mouse.move(at.x, at.y);

const wait = (ms) => page.waitForTimeout(ms);
const caption = (text) => page.evaluate((line) => window.demoCaption(line), text);

/** Glide the pointer to the middle of something, then click it. */
async function click(target) {
  const box = await target.boundingBox();
  const to = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const steps = 14;
  for (let step = 1; step <= steps; step += 1) {
    // Ease out: quick at first, slowing as it arrives.
    const part = 1 - (1 - step / steps) ** 2;
    await page.mouse.move(at.x + (to.x - at.x) * part, at.y + (to.y - at.y) * part);
    await wait(18);
  }
  at = to;
  await wait(180);
  await page.mouse.click(to.x, to.y);
}

// Keep every frame drawn from here on, with the time it was drawn.
const frames = [];
let recording = true;
const camera = (async () => {
  while (recording) frames.push({ at: Date.now(), png: await page.screenshot() });
})();

await wait(700);
await caption("Press Run: each block lights up as it executes");
await click(page.getByRole("button", { name: "Run", exact: true }));
await page.getByRole("tab", { name: /Run succeeded/ }).waitFor();
await wait(1900);

await caption("Click a block to see what it received and returned");
await click(page.getByTestId("rf__node-getWeather"));
await wait(1900);

await caption("Use a value from an earlier step with one click");
await click(page.getByTestId("rf__node-result"));
await wait(400);
await click(page.getByRole("button", { name: "Insert a value into Value" }));
await wait(800);
await click(page.getByRole("button", { name: "Insert the reference to trigger.city" }));
await wait(2300);

recording = false;
await camera;
await browser.close();

// --- Frames to a GIF -------------------------------------------------------------

// Each frame stays up until the next one was drawn. Frames in which nothing
// changed are folded into the one before, which keeps the file small.
const kept = [];
frames.forEach((frame, index) => {
  const ms = (frames[index + 1]?.at ?? frame.at + 100) - frame.at;
  const last = kept[kept.length - 1];
  if (last && last.png.equals(frame.png)) last.ms += ms;
  else kept.push({ png: frame.png, ms });
});

await mkdir(OUT.split("/").slice(0, -1).join("/") || ".", { recursive: true });
await sharp(kept.map((frame) => frame.png), { join: { animated: true } })
  .gif({
    delay: kept.map((frame) => frame.ms),
    loop: 0,
    colours: 96,
    dither: 0,
    effort: 8,
    // Pixels that barely changed are left as they were in the frame before.
    interFrameMaxError: 6,
    interPaletteMaxError: 8,
  })
  .toFile(OUT);

const seconds = kept.reduce((sum, frame) => sum + frame.ms, 0) / 1000;
const { size } = await stat(OUT);
console.log(`saved ${OUT}: ${kept.length} frames, ${seconds.toFixed(1)} s, ${(size / 1_048_576).toFixed(2)} MB`);
