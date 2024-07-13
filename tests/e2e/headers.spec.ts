import { expect, test } from "@playwright/test";

// The headers every page is sent with: they stop another site from showing the
// editor inside a frame, and fence in what a page may embed (see next.config.ts).

test("a page is sent with the headers that stop it being framed or sniffed", async ({ request }) => {
  const response = await request.get("/");
  expect(response.ok()).toBe(true);
  const headers = response.headers();

  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  // "Open in Hindsight" has to hear back from the tab it opens, and this policy would stop that.
  expect(headers["cross-origin-opener-policy"]).toBeUndefined();
});
