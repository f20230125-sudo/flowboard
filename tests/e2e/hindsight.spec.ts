import { expect, test } from "@playwright/test";
import { mockApis, openTemplate, runButton } from "./helpers";

// The "Open in Hindsight" button in the Run panel. Hindsight itself is not
// reached: a page is put in its place, at its address, that does what
// Hindsight's page does.

const HINDSIGHT = "https://hindsight-sand.vercel.app";

const STAND_IN = `<!doctype html><title>Hindsight</title><script>
  window.addEventListener("message", (event) => {
    window.__received = event.data;
    window.opener.postMessage({ type: "hindsight:received" }, event.origin);
  });
  window.opener.postMessage({ type: "hindsight:ready" }, "*");
</script>`;

async function runHeatCheck(page: import("@playwright/test").Page, context: import("@playwright/test").BrowserContext) {
  await mockApis(context);
  await openTemplate(page, /Heat check/, "getWeather");
  await runButton(page).click();
  await expect(page.getByRole("tab", { name: /Run succeeded/ })).toBeVisible();
}

test("hands the run to Hindsight in a new tab, with the data but not the blocks' settings", async ({ page, context }) => {
  await context.route(`${HINDSIGHT}/open`, (route) => route.fulfill({ contentType: "text/html", body: STAND_IN }));
  await runHeatCheck(page, context);

  const opened = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Open in Hindsight" }).click();
  const popup = await opened;

  await expect(page.getByText("Opened in Hindsight.")).toBeVisible();
  const received = (await popup.evaluate(() => (window as unknown as { __received: unknown }).__received)) as {
    format: string;
    app: string;
    data: { flow: { blocks: { id: string; type: string }[] }; run: { status: string; steps: { id: string; status: string }[] } };
  };
  expect(received).toMatchObject({ format: "hindsight/run", app: "flowboard", data: { run: { status: "succeeded" } } });
  expect(received.data.flow.blocks.find((block) => block.id === "getWeather")?.type).toBe("http");
  const steps = Object.fromEntries(received.data.run.steps.map((step) => [step.id, step.status]));
  expect(steps).toMatchObject({ getWeather: "succeeded", goOut: "skipped" });

  // What the HTTP block is set up to call stays in the browser.
  expect(JSON.stringify(received)).not.toContain("api.open-meteo.com");
});

test("saves the run as a file when Hindsight does not answer", async ({ page, context }) => {
  await context.route(`${HINDSIGHT}/open`, (route) => route.abort());
  await runHeatCheck(page, context);

  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Open in Hindsight" }).click();
  const download = await downloaded;

  expect(download.suggestedFilename()).toMatch(/^hindsight-flowboard-run-\d+\.json$/);
  await expect(page.getByText("Hindsight did not answer, so the run was saved as a file.")).toBeVisible();
  const { readFile } = await import("node:fs/promises");
  const file = JSON.parse(await readFile(await download.path(), "utf8"));
  expect(file).toMatchObject({ format: "hindsight/run", app: "flowboard", data: { run: { status: "succeeded" } } });
});

test("has no button until a flow has run", async ({ page, context }) => {
  await mockApis(context);
  await openTemplate(page, /Heat check/, "getWeather");
  await expect(page.getByRole("button", { name: "Open in Hindsight" })).toHaveCount(0);
});
