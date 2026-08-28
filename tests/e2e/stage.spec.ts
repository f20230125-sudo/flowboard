import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { block, blocks, defaultAnswers, mockApis, openTemplate } from "./helpers";

// The first screen is the real Heat check flow with a Run button on it. These
// tests cover what that adds: nothing runs on load, Run really runs it, the
// page does not scroll sideways at any size, and the keyboard is never left
// with nothing focused. The weather API is stubbed (mockApis), as everywhere.

const run = (page: Page) => page.getByRole("button", { name: "Run", exact: true });

test.describe("the stage on the home page", () => {
  test("the flow is drawn at once, calls nothing until Run is pressed, then shows the path taken", async ({ page, context }) => {
    const seen = await mockApis(context);
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toContainText("Connect blocks.");
    await expect(blocks(page)).toHaveCount(6);
    await expect(run(page)).toBeVisible();
    await expect(page.getByText("Run calls api.open-meteo.com from your browser. The result is not stored.")).toBeVisible();
    await expect(page.getByText("Nothing has run yet")).toBeVisible();
    // Let a request, if one were going to be made, be made.
    await page.waitForTimeout(500);
    expect(seen).toHaveLength(0);

    await run(page).click();
    await expect(page.getByText(/Run succeeded in/)).toBeVisible();
    expect(seen).toHaveLength(1);

    // 38.4 is above the limit of 35: the "true" side ran, the other was skipped.
    await expect(block(page, "isTooHot")).toContainText("True ✓");
    await expect(block(page, "goOut")).toContainText("Skipped");
    await expect(page.getByRole("list", { name: "Steps of the last run" }).getByRole("button", { name: /goOut.*Skipped/ })).toBeVisible();
    await expect(page.getByText('advice: "Too hot. Stay inside until the evening."')).toBeVisible();

    // Nothing was saved by running it, and the stage is not one of the visitor's flows.
    await expect(page.getByText("No flows yet.")).toBeVisible();
  });

  test("a failed request is said in plain words", async ({ page, context }) => {
    const answers = defaultAnswers();
    answers.weather = { status: 503, body: { reason: "The weather service is having trouble." } };
    await mockApis(context, answers);
    await page.goto("/");
    await run(page).click();
    await expect(page.getByText(/Run failed in/)).toBeVisible();
    await expect(page.getByRole("region", { name: "What the run did" }).getByRole("alert")).toContainText("api.open-meteo.com answered 503");
  });

  test("Edit this flow saves a copy and opens it in the editor", async ({ page, context }) => {
    await mockApis(context);
    await page.goto("/");
    await page.getByRole("button", { name: "Edit this flow" }).click();
    await page.waitForURL(/\/flows\/[0-9a-f]+$/);
    await expect(blocks(page)).toHaveCount(6);
    await expect(page.getByLabel("Flow name")).toHaveValue("Heat check");
  });
});

test.describe("no sideways scroll", () => {
  for (const width of [390, 800, 1440]) {
    test(`the home page and the editor fit a ${width} px window`, async ({ page, context }) => {
      await mockApis(context);
      await page.setViewportSize({ width, height: 900 });
      const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

      await page.goto("/");
      await expect(blocks(page)).toHaveCount(6);
      expect(await overflow()).toBeLessThanOrEqual(0);
      await run(page).click();
      await expect(page.getByText(/Run succeeded in/)).toBeVisible();
      expect(await overflow()).toBeLessThanOrEqual(0);

      await openTemplate(page, /Heat check/, "getWeather");
      await run(page).click();
      await expect(page.getByRole("tab", { name: /Run succeeded/ })).toBeVisible();
      expect(await overflow()).toBeLessThanOrEqual(0);
    });
  }

  test("on a phone the stage is a labelled region that scrolls sideways, and a finger on it may scroll", async ({ page, context }) => {
    await mockApis(context);
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto("/");
    const region = page.getByRole("region", { name: "Heat check, scrolls sideways" });
    await expect(region).toBeVisible();
    await expect(region).toHaveAttribute("tabindex", "0");
    expect(await region.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
    expect(await page.locator(".react-flow__pane").evaluate((element) => getComputedStyle(element).touchAction)).toBe("pan-x pan-y");
  });
});

test.describe("the keyboard is never left with nothing focused", () => {
  test("the skip link comes first and moves focus to the content", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to the content" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("main#main")).toBeFocused();
  });

  test("Run keeps focus while it runs and after it ends", async ({ page, context }) => {
    await mockApis(context);
    await page.goto("/");
    await expect(blocks(page)).toHaveCount(6);
    await run(page).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText(/Run succeeded in/)).toBeVisible();
    await expect(run(page)).toBeFocused();
  });

  test("the menu opens onto its first item, and Escape or a choice puts focus back on its button", async ({ page, context }) => {
    await mockApis(context);
    await openTemplate(page, /Heat check/, "getWeather");
    const more = page.getByRole("button", { name: "More actions" });

    await more.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menuitem", { name: "Export as a file" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitem", { name: "Copy a share link" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(more).toBeFocused();

    // A choice that opens a dialog gives focus back to the button when the dialog closes.
    await page.keyboard.press("Enter");
    await page.getByRole("menuitem", { name: "Keyboard shortcuts" }).press("Enter");
    const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(more).toBeFocused();
  });
});

async function violations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .exclude(".react-flow__attribution")
    .exclude(".react-flow__minimap")
    .analyze();
  return results.violations.map((violation) => ({
    rule: violation.id,
    where: violation.nodes.slice(0, 3).map((node) => node.target.join(" ")),
    help: violation.help,
  }));
}

for (const theme of ["light", "dark"] as const) {
  test.describe(`accessibility of the stage, ${theme} theme`, () => {
    test.use({ colorScheme: theme });

    test("the home page, before and after a run", async ({ page, context }) => {
      await mockApis(context);
      await page.goto("/");
      await expect(blocks(page)).toHaveCount(6);
      expect(await violations(page)).toEqual([]);
      await run(page).click();
      await expect(page.getByText(/Run succeeded in/)).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });

    test("the home page on a phone, after a run", async ({ page, context }) => {
      await mockApis(context);
      await page.setViewportSize({ width: 390, height: 800 });
      await page.goto("/");
      await expect(blocks(page)).toHaveCount(6);
      await run(page).click();
      await expect(page.getByText(/Run succeeded in/)).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });
  });
}
