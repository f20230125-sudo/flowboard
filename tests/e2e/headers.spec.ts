import { expect, test } from "@playwright/test";

// The headers every page is sent with: they stop another site from showing the
// editor inside a frame, and fence in what a page may embed (see next.config.ts).

test("a page is sent with the headers that stop it being framed, except by Uzair's portfolio, or sniffed", async ({ request }) => {
  const response = await request.get("/");
  expect(response.ok()).toBe(true);
  const headers = response.headers();

  // The older header cannot name one other site, so it is left out; the policy does it.
  expect(headers["x-frame-options"]).toBeUndefined();
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'self' https://uzair-khan-lac.vercel.app;");
  expect(headers["content-security-policy"]).not.toContain("frame-ancestors *");
  // "Open in Hindsight" has to hear back from the tab it opens, and this policy would stop that.
  expect(headers["cross-origin-opener-policy"]).toBeUndefined();
});
