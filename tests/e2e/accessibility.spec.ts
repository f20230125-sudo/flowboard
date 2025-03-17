import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { block, mockApis, openTemplate, runButton } from "./helpers";

// An automated scan for the accessibility problems a machine can find:
// missing labels, poor contrast, wrong roles. It runs in both themes, because
// contrast is a property of the colours.

async function violations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    // The canvas library's own controls and its small credit link are not ours to restyle.
    .exclude(".react-flow__attribution")
    .exclude(".react-flow__minimap")
    .analyze();
  return results.violations.map((violation) => ({
    rule: violation.id,
    impact: violation.impact,
    where: violation.nodes.slice(0, 3).map((node) => node.target.join(" ")),
    help: violation.help,
  }));
}

for (const theme of ["light", "dark"] as const) {
  test.describe(`accessibility, ${theme} theme`, () => {
    test.use({ colorScheme: theme });

    test("the home page", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("button", { name: /Heat check/ })).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });

    test("the editor with a block selected, after a run", async ({ page, context }) => {
      await mockApis(context);
      await openTemplate(page, /Heat check/, "getWeather");
      await runButton(page).click();
      await expect(page.getByRole("tab", { name: /Run succeeded/ })).toBeVisible();
      await block(page, "getWeather").click();
      expect(await violations(page)).toEqual([]);
    });

    test("the settings dialog", async ({ page, context }) => {
      await mockApis(context);
      await openTemplate(page, /Support ticket triage/, "classify");
      await block(page, "classify").click();
      await page.getByRole("button", { name: "Choose a model" }).click();
      await page.getByRole("dialog").getByLabel("Provider").selectOption("groq");
      expect(await violations(page)).toEqual([]);
    });
  });
}
