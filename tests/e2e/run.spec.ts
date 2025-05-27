import { expect, test } from "@playwright/test";
import { block, defaultAnswers, mockApis, openTemplate, runButton } from "./helpers";

test.describe("running a flow", () => {
  test("a template runs to the end and shows each step's data", async ({ page, context }) => {
    const seen = await mockApis(context);
    await openTemplate(page, /Heat check/, "getWeather");

    await runButton(page).click();
    await expect(page.getByRole("tab", { name: /Run succeeded/ })).toBeVisible();

    // The request carried the values from the trigger.
    const call = new URL(seen[0].url);
    expect(call.searchParams.get("latitude")).toBe("25.2");
    expect(call.searchParams.get("current")).toBe("temperature_2m,wind_speed_10m");

    // 38.4 is above the limit of 35: the "true" side ran, the other was skipped.
    const steps = page.getByRole("list", { name: "Steps of the last run" });
    await expect(steps.getByRole("button", { name: /stayIn/ })).toBeVisible();
    await expect(steps.getByRole("button", { name: /goOut.*Skipped/ })).toBeVisible();
    await expect(block(page, "goOut")).toContainText("Skipped");
    await expect(block(page, "isTooHot")).toContainText("True ✓");

    // The result opens by itself.
    const panel = page.getByRole("tabpanel");
    await expect(panel).toContainText('advice: "Too hot. Stay inside until the evening."');
    await expect(panel).toContainText("temperature: 38.4");

    // Any step can be opened, from the list or from the canvas.
    await block(page, "getWeather").click();
    await expect(panel).toContainText("status: 200");
  });

  test("takes the other path when the data says so", async ({ page, context }) => {
    const answers = defaultAnswers();
    answers.weather.body = { current: { temperature_2m: 21 } };
    await mockApis(context, answers);
    await openTemplate(page, /Heat check/, "getWeather");

    await runButton(page).click();
    await expect(page.getByRole("tab", { name: /Run succeeded/ })).toBeVisible();
    await expect(page.getByRole("tabpanel")).toContainText('advice: "Fine to go out."');
    await expect(block(page, "stayIn")).toContainText("Skipped");
  });

  test("a failed request stops the run and is shown on the block", async ({ page, context }) => {
    const answers = defaultAnswers();
    answers.weather = { status: 503, body: { reason: "The weather service is having trouble." } };
    await mockApis(context, answers);
    await openTemplate(page, /Heat check/, "getWeather");

    await runButton(page).click();
    await expect(page.getByRole("tab", { name: /Run failed/ })).toBeVisible();

    await expect(block(page, "getWeather")).toContainText("Failed");
    const panel = page.getByRole("tabpanel");
    await expect(panel.getByRole("alert")).toContainText("api.open-meteo.com answered 503");
    // What the server said is kept, so the failure can be understood.
    await expect(panel).toContainText("The weather service is having trouble.");
    await expect(block(page, "result")).toContainText("Skipped");
  });

  test("a busy API is asked again before the step is called a failure", async ({ page, context }) => {
    const seen = await mockApis(context);
    // Busy the first time, fine after that.
    let calls = 0;
    await context.route("https://api.open-meteo.com/**", (route) => {
      calls += 1;
      if (calls > 1) return route.fallback();
      return route.fulfill({ status: 503, headers: { "access-control-allow-origin": "*" }, body: "busy" });
    });
    await openTemplate(page, /Heat check/, "getWeather");

    await runButton(page).click();
    await expect(page.getByRole("tab", { name: /Run succeeded/ })).toBeVisible();
    expect(calls).toBe(2);
    expect(seen).toHaveLength(1);

    await block(page, "getWeather").click();
    await expect(page.getByRole("tabpanel")).toContainText("Answered on try 2 of 3.");
  });

  test("when it stays busy, the failure says how often it was tried", async ({ page, context }) => {
    const answers = defaultAnswers();
    answers.weather = { status: 503, body: { reason: "The weather service is having trouble." } };
    const seen = await mockApis(context, answers);
    await openTemplate(page, /Heat check/, "getWeather");

    await runButton(page).click();
    await expect(page.getByRole("tab", { name: /Run failed/ })).toBeVisible();
    await expect(page.getByRole("tabpanel").getByRole("alert")).toContainText("after 3 tries");
    expect(seen).toHaveLength(3);
  });

  test("a flow with problems does not run, and says what to fix", async ({ page, context }) => {
    await mockApis(context);
    await openTemplate(page, /Heat check/, "getWeather");

    // Empty the address of the request.
    await block(page, "getWeather").click();
    await page.getByRole("textbox", { name: "Address" }).fill("");
    await expect(block(page, "getWeather")).toContainText("1 to fix");

    await runButton(page).click();
    const problems = page.getByRole("tabpanel");
    await expect(problems).toContainText("Give it an address to call.");
    await expect(page.getByRole("tab", { name: /Run/ })).not.toContainText("succeeded");

    // Putting it back clears the problem.
    await page.getByRole("textbox", { name: "Address" }).fill("https://api.open-meteo.com/v1/forecast");
    await expect(problems).toContainText("No problems");
  });

  test("Stop ends a run that is waiting", async ({ page, context }) => {
    await mockApis(context);
    await page.goto("/");
    await page.getByRole("button", { name: "New flow" }).click();
    await page.waitForURL(/\/flows\//);

    // start → wait (60 s)
    await page.locator(".react-flow__node").first().click();
    await page.getByRole("button", { name: "Add Delay" }).click();
    await page.getByLabel("Wait (ms)").fill("60000");
    await page.getByLabel("Wait (ms)").blur();

    await runButton(page).click();
    await expect(page.locator(".react-flow__node", { hasText: "wait1" })).toContainText("Running");
    await page.getByRole("button", { name: "Stop" }).click();

    await expect(page.getByRole("tab", { name: /Run stopped/ })).toBeVisible();
    await expect(page.locator(".react-flow__node", { hasText: "wait1" })).toContainText("Stopped");
  });

  test("an AI step returns its sample with no key, and calls the model once a key is set", async ({ page, context }) => {
    const seen = await mockApis(context);
    await openTemplate(page, /Support ticket triage/, "classify");

    // No key: the sample reply says the ticket is urgent, so it is escalated.
    await runButton(page).click();
    await expect(page.getByRole("tab", { name: /Run succeeded/ })).toBeVisible();
    await expect(page.getByRole("tabpanel")).toContainText('status: "escalated"');
    await block(page, "classify").click();
    await expect(page.getByRole("tabpanel")).toContainText("Sample reply. No model was called.");
    expect(seen.filter((call) => call.url.includes("groq"))).toHaveLength(0);

    // Set a key. "Check key" lists the models it can use.
    await page.getByRole("button", { name: "Choose a model" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Provider").selectOption("groq");
    await dialog.getByLabel(/API key/).fill("test-key");
    await dialog.getByRole("button", { name: "Check key" }).click();
    await expect(dialog.getByRole("status")).toContainText("The key works. It can use 2 models");
    await dialog.getByLabel("Model").fill("llama-small");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();

    // With a key the model is called, and its answer ("normal") changes the path.
    await runButton(page).click();
    await expect(page.getByRole("tab", { name: /Run succeeded/ })).toBeVisible();
    await expect(page.getByRole("tabpanel")).toContainText('status: "queued"');

    const chat = seen.find((call) => call.url.endsWith("/chat/completions"))!;
    expect(chat.authorization).toBe("Bearer test-key");
    expect(JSON.parse(chat.body!)).toMatchObject({
      model: "llama-small",
      response_format: { type: "json_object" },
      messages: [{ role: "system" }, { role: "user", content: "Our checkout page has been down for an hour and customers cannot pay." }],
    });

    // A temperature is only sent when the block sets one. Emptying the field
    // hands the choice back to the model.
    const chats = () => seen.filter((call) => call.url.endsWith("/chat/completions")).map((call) => JSON.parse(call.body!));
    expect(chats()[0]).not.toHaveProperty("temperature");
    await block(page, "classify").click();
    const temperature = page.getByLabel("Temperature");
    await expect(temperature).toHaveValue("");
    await temperature.fill("0.7");
    await temperature.blur();
    await runButton(page).click();
    await expect.poll(() => chats().length).toBe(2);
    expect(chats()[1]).toMatchObject({ temperature: 0.7 });
    await temperature.fill("");
    await temperature.blur();
    await runButton(page).click();
    await expect.poll(() => chats().length).toBe(3);
    expect(chats()[2]).not.toHaveProperty("temperature");

    // The key is remembered in this browser across a reload.
    await page.reload();
    await block(page, "classify").click();
    await expect(page.getByText("Calls llama-small with your key.")).toBeVisible();
  });
});
