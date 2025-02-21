import { describe, expect, it } from "vitest";
import { TEMPLATES } from "@/templates";
import { block, flow } from "@/test/build";
import { decodeFlow, encodeFlow, exportFileName, shareUrl } from "./shareLink";

describe("share links", () => {
  it("carries a flow through a link and back unchanged", async () => {
    for (const template of TEMPLATES) {
      const decoded = await decodeFlow(await encodeFlow(template.flow));
      expect(decoded).toEqual({ ok: true, flow: template.flow });
    }
  });

  it("keeps text in any script intact", async () => {
    const doc = flow([block("trigger", "start", { payload: '{"city":"دبي","note":"naïve ☀️ 日本"}' })]);
    const decoded = await decodeFlow(await encodeFlow(doc));
    expect(decoded).toEqual({ ok: true, flow: doc });
  });

  it("uses only characters that are safe in an address, and compresses", async () => {
    const encoded = await encodeFlow(TEMPLATES[0].flow);
    expect(encoded).toMatch(/^1\.[A-Za-z0-9_-]+$/);
    expect(encoded.length).toBeLessThan(JSON.stringify(TEMPLATES[0].flow).length);
  });

  it("builds the whole link, and reads it with or without the #", async () => {
    const url = await shareUrl(TEMPLATES[0].flow, "https://flowboard.example");
    expect(url.startsWith("https://flowboard.example/import#1.")).toBe(true);
    const hash = url.slice(url.indexOf("#"));
    expect((await decodeFlow(hash)).ok).toBe(true);
    expect((await decodeFlow(hash.slice(1))).ok).toBe(true);
  });

  it("explains a link it cannot read", async () => {
    const good = await encodeFlow(TEMPLATES[0].flow);
    const damaged = "This link is incomplete or damaged. Ask for it to be copied again.";

    expect(await decodeFlow("")).toEqual({ ok: false, error: "This link has no flow in it." });
    expect(await decodeFlow("#")).toEqual({ ok: false, error: "This link has no flow in it." });
    expect(await decodeFlow("nonsense")).toEqual({ ok: false, error: damaged });
    expect(await decodeFlow("1.!!!not-base64!!!")).toEqual({ ok: false, error: damaged });
    expect(await decodeFlow(good.slice(0, good.length - 40))).toEqual({ ok: false, error: damaged });
    expect(await decodeFlow(`2.${good.slice(2)}`)).toEqual({
      ok: false,
      error: "This link was made with a newer version of Flowboard.",
    });
    expect(await decodeFlow(`1.${"A".repeat(200_001)}`)).toEqual({ ok: false, error: "This link is too large to open." });
  });

  it("refuses a link whose contents are not a flow", async () => {
    const notAFlow = await encodeFlow({ hello: "world" } as never);
    const decoded = await decodeFlow(notAFlow);
    expect(decoded.ok).toBe(false);
    if (!decoded.ok) expect(decoded.error).toContain("not a valid flow file");
  });
});

describe("exportFileName", () => {
  it("makes a tidy file name from the flow's name", () => {
    expect(exportFileName("Heat check")).toBe("heat-check.flowboard.json");
    expect(exportFileName("  Support / Ticket: Triage!  ")).toBe("support-ticket-triage.flowboard.json");
    expect(exportFileName("日本")).toBe("flow.flowboard.json");
    expect(exportFileName("x".repeat(200))).toHaveLength(60 + ".flowboard.json".length);
  });
});
