import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { block, blocks, connections, mockApis, openBlankFlow, openTemplate, saved } from "./helpers";

test.describe("building a flow", () => {
  test("blocks added by clicking are chained and connected, and undo takes them back", async ({ page }) => {
    await openBlankFlow(page);

    // Select the trigger, then click blocks in the palette: each is added after the last.
    await blocks(page).first().click();
    await page.getByRole("button", { name: "Add HTTP request" }).click();
    await page.getByRole("button", { name: "Add Condition" }).click();
    await page.getByRole("button", { name: "Add Output" }).click();

    await expect(blocks(page)).toHaveCount(4);
    await expect(connections(page)).toHaveCount(3);
    await expect(blocks(page).nth(1)).toContainText("http1");

    const undo = page.getByRole("button", { name: /^Undo/ });
    await expect(undo).toHaveAttribute("title", "Undo: Add Output (Ctrl+Z)");
    await undo.click();
    await undo.click();
    await expect(blocks(page)).toHaveCount(2);
    await expect(connections(page)).toHaveCount(1);

    await page.getByRole("button", { name: /^Redo/ }).click();
    await expect(blocks(page)).toHaveCount(3);

    // Keyboard works too, once focus is on the canvas.
    await page.locator(".react-flow__pane").click({ position: { x: 20, y: 20 } });
    await page.keyboard.press("Control+z");
    await expect(blocks(page)).toHaveCount(2);
    await page.keyboard.press("Control+y");
    await expect(blocks(page)).toHaveCount(3);
  });

  test("a block can be dragged from the palette and connected by hand", async ({ page }) => {
    await openBlankFlow(page);

    await page.getByRole("button", { name: "Add Output" }).dragTo(page.locator(".react-flow__pane"), {
      // Well clear of the trigger, which sits near the middle of the canvas.
      targetPosition: { x: 760, y: 600 },
    });
    await expect(blocks(page)).toHaveCount(2);
    await expect(connections(page)).toHaveCount(0);
    // Dropped away from the flow, it is flagged until it is connected.
    await expect(page.getByText("Nothing leads here from the trigger, so this block will not run.")).toBeVisible();

    // Drag from the trigger's output dot to the new block's input dot.
    const from = blocks(page).first().locator(".react-flow__handle.source");
    const to = blocks(page).nth(1).locator(".react-flow__handle.target");
    await from.hover();
    await page.mouse.down();
    await to.hover();
    await to.hover();
    await page.mouse.up();

    await expect(connections(page)).toHaveCount(1);
    await expect(page.getByText("Nothing leads here from the trigger")).toBeHidden();
  });

  test("renaming a block rewrites the references to it", async ({ page, context }) => {
    await mockApis(context);
    await openTemplate(page, /Heat check/, "getWeather");

    await block(page, "getWeather").click();
    const name = page.getByRole("textbox", { name: "Name", exact: true });
    await name.fill("forecast");
    await name.press("Enter");
    await expect(block(page, "getWeather")).toContainText("forecast");

    // The Condition pointed at steps.getWeather; it now points at steps.forecast.
    await block(page, "isTooHot").click();
    await expect(page.getByLabel("Value", { exact: true })).toHaveValue("{{ steps.forecast.body.current.temperature_2m }}");
    await page.getByRole("tab", { name: /Problems/ }).click();
    await expect(page.getByRole("tabpanel")).toContainText("No problems");

    // A name that would break references is refused, with the reason.
    await block(page, "getWeather").click();
    await page.getByRole("textbox", { name: "Name", exact: true }).fill("start");
    await page.getByRole("textbox", { name: "Name", exact: true }).press("Enter");
    await expect(page.getByText('Another block is already named "start".')).toBeVisible();
  });

  test("delete, duplicate, copy and paste", async ({ page, context }) => {
    await mockApis(context);
    await openTemplate(page, /Heat check/, "getWeather");
    await expect(blocks(page)).toHaveCount(6);

    await block(page, "goOut").click();
    await page.keyboard.press("Delete");
    await expect(blocks(page)).toHaveCount(5);
    await expect(connections(page)).toHaveCount(4);

    await page.keyboard.press("Control+z");
    await expect(blocks(page)).toHaveCount(6);
    await expect(connections(page)).toHaveCount(6);

    await block(page, "stayIn").click();
    await page.keyboard.press("Control+d");
    await expect(blocks(page)).toHaveCount(7);

    await block(page, "stayIn").click();
    await page.keyboard.press("Control+c");
    await page.keyboard.press("Control+v");
    await expect(blocks(page)).toHaveCount(8);
  });
});

test.describe("keeping and sharing flows", () => {
  test("changes are saved by themselves and survive a reload", async ({ page }) => {
    await openBlankFlow(page);
    await blocks(page).first().click();
    await page.getByRole("button", { name: "Add Delay" }).click();
    await page.getByLabel("Flow name").fill("Morning routine");
    await page.getByLabel("Flow name").press("Enter");
    await expect(saved(page)).toBeVisible();

    await page.reload();
    await expect(blocks(page)).toHaveCount(2);
    await expect(page.getByLabel("Flow name")).toHaveValue("Morning routine");

    // It is listed on the home page, and can be deleted and brought back.
    await page.getByRole("link", { name: "Back to all flows" }).click();
    const row = page.getByRole("listitem").filter({ hasText: "Morning routine" });
    await expect(row).toContainText("2 blocks");
    await page.getByRole("button", { name: "Delete Morning routine" }).click();
    await expect(row).toBeHidden();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(row).toBeVisible();
  });

  test("a flow exported as a file can be imported again", async ({ page, context }) => {
    await mockApis(context);
    await openTemplate(page, /Dirham rate watch/, "getRates");

    await page.getByRole("button", { name: "More actions" }).click();
    const download = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: "Export as a file" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe("dirham-rate-watch.flowboard.json");
    const exported = JSON.parse(await readFile(await file.path(), "utf8"));
    expect(exported).toMatchObject({ version: 1, name: "Dirham rate watch" });
    expect(exported.nodes).toHaveLength(6);

    await page.goto("/");
    await page.getByLabel("Choose a flow file to import").setInputFiles(await file.path());
    await page.waitForURL(/\/flows\//);
    await expect(blocks(page)).toHaveCount(6);
    await expect(page.getByLabel("Flow name")).toHaveValue("Dirham rate watch");
  });

  test("a file that is not a flow is refused", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Choose a flow file to import").setInputFiles({
      name: "notes.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"hello": "world"}'),
    });
    await expect(page.getByRole("status")).toContainText("This is not a valid flow file.");
    await expect(page).toHaveURL(/\/$/);
  });

  test("a share link opens as a copy in another browser", async ({ page, context, browser }) => {
    await mockApis(context);
    await openTemplate(page, /Heat check/, "getWeather");

    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Copy a share link" }).click();
    await expect(page.getByRole("status")).toContainText("Link copied.");
    const link = await page.evaluate(() => navigator.clipboard.readText());
    expect(link).toMatch(/\/import#1\.[A-Za-z0-9_-]+$/);

    // Someone else, with empty storage, opens the link.
    const other = await browser.newContext();
    const visitor = await other.newPage();
    await visitor.goto(link);
    await expect(visitor.getByRole("heading", { name: "Heat check" })).toBeVisible();
    await expect(visitor.getByText("api.open-meteo.com")).toBeVisible();
    await visitor.getByRole("button", { name: "Add to my flows" }).click();
    await visitor.waitForURL(/\/flows\//);
    await expect(blocks(visitor)).toHaveCount(6);
    await other.close();
  });

  test("a damaged share link says so", async ({ page }) => {
    await page.goto("/import#1.this-is-not-a-flow");
    await expect(page.getByRole("heading", { name: "This link cannot be opened" })).toBeVisible();
  });
});

test.describe("the app around the editor", () => {
  test("templates are served by the REST API", async ({ request }) => {
    const list = await request.get("/api/templates");
    expect(list.status()).toBe(200);
    const { templates } = await list.json();
    expect(templates.map((template: { id: string }) => template.id)).toEqual([
      "heat-check",
      "ticket-triage",
      "repo-digest",
      "dirham-rate",
    ]);

    const one = await request.get("/api/templates/heat-check");
    expect((await one.json()).flow.nodes).toHaveLength(6);

    const missing = await request.get("/api/templates/nope");
    expect(missing.status()).toBe(404);
    expect(await missing.json()).toEqual({ error: { code: "not_found", message: 'There is no template called "nope".' } });

    expect((await request.get("/api/health")).status()).toBe(200);
  });

  test("the relay refuses addresses it should not call", async ({ request }) => {
    const refused = async (url: string) => {
      const response = await request.post("/api/relay", { data: { method: "GET", url } });
      return [response.status(), (await response.json()).error.code];
    };
    expect(await refused("https://example.com/")).toEqual([403, "host_not_allowed"]);
    expect(await refused("https://169.254.169.254/latest/meta-data/")).toEqual([403, "private_address"]);
    expect(await refused("http://localhost:3020/api/health")).toEqual([400, "bad_url"]);
    expect((await request.post("/api/relay", { data: { method: "TRACE" } })).status()).toBe(400);
    expect((await request.get("/api/relay")).status()).toBe(405);
  });

  test("the theme is remembered", async ({ page }) => {
    await page.goto("/");
    const html = page.locator("html");
    const before = await html.getAttribute("data-theme");
    await page.getByRole("button", { name: /Switch to (light|dark) theme/ }).click();
    const after = before === "dark" ? "light" : "dark";
    await expect(html).toHaveAttribute("data-theme", after);
    await page.reload();
    await expect(html).toHaveAttribute("data-theme", after);
  });

  test("a flow that is not in this browser says so", async ({ page }) => {
    await page.goto("/flows/000000000000");
    await expect(page.getByRole("heading", { name: "This flow is not in this browser" })).toBeVisible();
  });
});

test.describe("help and small screens", () => {
  test("the list of shortcuts opens with ? and from the menu", async ({ page }) => {
    await openBlankFlow(page);
    await page.locator(".react-flow__pane").click({ position: { x: 20, y: 20 } });
    await page.keyboard.press("?");
    const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    await expect(dialog).toContainText("Run the flow");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Keyboard shortcuts" }).click();
    await expect(dialog).toBeVisible();
  });

  test("on a phone the flow can be run but not edited", async ({ page, context }) => {
    await mockApis(context);
    await page.setViewportSize({ width: 390, height: 780 });
    await openTemplate(page, /Heat check/, "getWeather");

    await expect(page.getByText("To edit it, open Flowboard on a wider screen.")).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Blocks" })).toBeHidden();
    await expect(page.getByRole("complementary", { name: "Settings" })).toBeHidden();
    await expect(page.getByRole("button", { name: /^Nothing to undo|^Undo/ })).toBeHidden();
    await expect(page.locator(".react-flow__minimap")).toBeHidden();

    await page.getByRole("button", { name: "Run", exact: true }).click();
    await expect(page.getByRole("tab", { name: /Run succeeded/ })).toBeVisible();
    await expect(page.getByRole("tabpanel")).toContainText("Too hot. Stay inside until the evening.");

    // Nothing spills past the edge of the screen.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
