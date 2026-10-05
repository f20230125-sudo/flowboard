import { describe, expect, it } from "vitest";
import {
  DEFAULT_ALLOWED_HOSTS,
  checkTarget,
  createRateLimiter,
  forwardableHeaders,
  isPrivateAddress,
  readRelayConfig,
  relayRequestSchema,
  returnableHeaders,
  type RelayConfig,
} from "./relay";

const hosted: RelayConfig = { allowedHosts: DEFAULT_ALLOWED_HOSTS, allowAll: false };
const selfHosted: RelayConfig = { allowedHosts: [], allowAll: true };

const refusal = (address: string, config = hosted) => {
  const answer = checkTarget(address, config);
  return answer.ok ? null : answer.refusal.code;
};

describe("isPrivateAddress", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.5",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254", // cloud metadata
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "::",
    "[::1]",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.1",
    "::ffff:7f00:1",
  ])("treats %s as private", (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  it.each(["8.8.8.8", "1.1.1.1", "172.32.0.1", "172.15.0.1", "192.169.0.1", "100.63.0.1", "2606:4700::1111", "::ffff:8.8.8.8"])(
    "treats %s as public",
    (address) => {
      expect(isPrivateAddress(address)).toBe(false);
    },
  );
});

describe("checkTarget on the hosted relay", () => {
  it("allows a listed public API over https", () => {
    const answer = checkTarget("https://api.open-meteo.com/v1/forecast?latitude=25.2", hosted);
    expect(answer.ok).toBe(true);
    if (answer.ok) expect(answer.url.hostname).toBe("api.open-meteo.com");
    expect(refusal("https://API.GITHUB.COM/users/vercel")).toBeNull();
  });

  it("refuses hosts that are not on the list, and says what to do instead", () => {
    const answer = checkTarget("https://example.com/api", hosted);
    expect(answer.ok).toBe(false);
    if (!answer.ok) {
      expect(answer.refusal).toMatchObject({ status: 403, code: "host_not_allowed" });
      expect(answer.refusal.message).toContain("Send this request from your browser instead");
    }
    // A listed name inside another name does not count.
    expect(refusal("https://api.github.com.evil.example/")).toBe("host_not_allowed");
    expect(refusal("https://evil.example/?api.github.com")).toBe("host_not_allowed");
  });

  it("refuses local and private addresses however they are written", () => {
    for (const address of [
      "https://localhost/admin",
      "https://127.0.0.1/",
      "https://169.254.169.254/latest/meta-data/",
      "https://10.0.0.8:8443/",
      "https://[::1]/",
      "https://db.internal/",
      "https://printer.local/",
      "https://app.localhost/",
    ]) {
      expect(refusal(address)).toBe("private_address");
    }
  });

  it("refuses anything that is not plain https to the standard port", () => {
    expect(refusal("http://api.github.com/")).toBe("bad_url");
    expect(refusal("ftp://api.github.com/")).toBe("bad_url");
    expect(refusal("file:///etc/passwd")).toBe("bad_url");
    expect(refusal("not a url")).toBe("bad_url");
    expect(refusal("https://user:secret@api.github.com/")).toBe("bad_url");
    expect(refusal("https://api.github.com:8443/")).toBe("host_not_allowed");
  });
});

describe("checkTarget on a self-hosted relay that allows every host", () => {
  it("allows any public host, on any port, over http too", () => {
    expect(refusal("https://example.com/api", selfHosted)).toBeNull();
    expect(refusal("http://example.com:8080/api", selfHosted)).toBeNull();
  });

  it("still never calls a private address", () => {
    expect(refusal("http://127.0.0.1:5432/", selfHosted)).toBe("private_address");
    expect(refusal("http://169.254.169.254/", selfHosted)).toBe("private_address");
    expect(refusal("https://localhost/", selfHosted)).toBe("private_address");
  });
});

describe("configuration", () => {
  it("uses the built-in list unless told otherwise", () => {
    expect(readRelayConfig({})).toEqual({ allowedHosts: DEFAULT_ALLOWED_HOSTS, allowAll: false });
    expect(readRelayConfig({ RELAY_ALLOWED_HOSTS: " " }).allowedHosts).toBe(DEFAULT_ALLOWED_HOSTS);
  });

  it("reads a list of hosts and the allow-all switch from the environment", () => {
    expect(readRelayConfig({ RELAY_ALLOWED_HOSTS: "api.example.com, Other.Example.com ,", RELAY_ALLOW_ALL: "1" })).toEqual({
      allowedHosts: ["api.example.com", "other.example.com"],
      allowAll: true,
    });
    expect(readRelayConfig({ RELAY_ALLOW_ALL: "true" }).allowAll).toBe(false);
  });
});

describe("the request the relay accepts", () => {
  it("fills in defaults", () => {
    expect(relayRequestSchema.parse({ method: "GET", url: "https://api.github.com" })).toEqual({
      method: "GET",
      url: "https://api.github.com",
      headers: {},
      timeoutMs: 10000,
    });
  });

  it("refuses unknown methods, huge bodies and silly time limits", () => {
    const base = { method: "POST", url: "https://api.github.com" };
    expect(relayRequestSchema.safeParse({ ...base, method: "TRACE" }).success).toBe(false);
    expect(relayRequestSchema.safeParse({ ...base, body: "x".repeat(100_001) }).success).toBe(false);
    expect(relayRequestSchema.safeParse({ ...base, timeoutMs: 600_000 }).success).toBe(false);
    expect(relayRequestSchema.safeParse({ ...base, url: "" }).success).toBe(false);
    expect(relayRequestSchema.safeParse(null).success).toBe(false);
  });
});

describe("headers", () => {
  it("drops headers that carry the visitor's session or describe the connection", () => {
    expect(
      forwardableHeaders({
        Authorization: "Bearer abc",
        Cookie: "session=1",
        HOST: "evil.example",
        " X-Forwarded-For ": "1.2.3.4",
        "Content-Length": "5",
        Accept: "application/json",
      }),
    ).toEqual({ Authorization: "Bearer abc", Accept: "application/json" });
  });

  it("returns only the response headers a flow can use", () => {
    const headers = new Headers({ "Content-Type": "application/json", "Set-Cookie": "a=b", Location: "/next", Server: "nginx" });
    expect(returnableHeaders(headers)).toEqual({ "content-type": "application/json", location: "/next" });
  });
});

describe("rate limit", () => {
  it("allows a number of calls per window, per visitor", () => {
    let time = 0;
    const allow = createRateLimiter(2, 60_000, () => time);

    expect(allow("a").allowed).toBe(true);
    expect(allow("a").allowed).toBe(true);
    expect(allow("a")).toEqual({ allowed: false, retryAfterSeconds: 60 });
    expect(allow("b").allowed).toBe(true);

    time = 45_000;
    expect(allow("a")).toEqual({ allowed: false, retryAfterSeconds: 15 });

    time = 60_000;
    expect(allow("a").allowed).toBe(true);
  });
});
