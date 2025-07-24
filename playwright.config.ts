import { defineConfig, devices } from "@playwright/test";

// End-to-end tests drive the real app in a real browser. Locally they use the
// dev server (and reuse one that is already running); in CI they run against
// the production build.
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  // One server answers every test, and it runs on one thread. With a worker for
  // every two cores of a big machine, its answers come late enough that a test
  // times out though nothing is wrong.
  workers: process.env.CI ? 2 : 6,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: "http://localhost:3020",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        permissions: ["clipboard-read", "clipboard-write"],
      },
    },
  ],
  webServer: {
    command: process.env.CI ? "npm run start" : "npm run dev",
    url: "http://localhost:3020",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
