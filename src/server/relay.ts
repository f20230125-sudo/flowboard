import { z } from "zod";
import { HTTP_METHODS, MAX_TIMEOUT_MS } from "@/flow/schema";

// The rules of the relay (/api/relay), kept apart from the route so they can
// be tested without a server.
//
// The relay makes a request on the visitor's behalf, for APIs that refuse
// calls from a browser. A server that fetches any address it is handed is a
// well-known hole (server-side request forgery): it can be pointed at things
// only the server can reach, such as a cloud provider's metadata address or
// services on the private network. So the relay is closed by default:
//
//   1. It only calls hosts on a list.
//   2. It never calls a private or local address, whatever the list says.
//   3. It does not follow redirects, which could lead off the list.
//   4. It caps how long it waits and how much it reads.
//   5. It drops headers that belong to the visitor's own session.

/** Public APIs the hosted relay may call. Set RELAY_ALLOWED_HOSTS to replace the list. */
export const DEFAULT_ALLOWED_HOSTS = [
  "api.open-meteo.com",
  "open.er-api.com",
  "api.frankfurter.dev",
  "api.github.com",
  "jsonplaceholder.typicode.com",
  "dummyjson.com",
  "httpbin.org",
  "hacker-news.firebaseio.com",
];

export const MAX_RESPONSE_BYTES = 1_000_000;
export const MAX_BODY_CHARS = 100_000;

export type RelayConfig = {
  allowedHosts: readonly string[];
  /** For someone running their own copy: any public host, still never a private one. */
  allowAll: boolean;
};

export function readRelayConfig(env: Record<string, string | undefined>): RelayConfig {
  const listed = env.RELAY_ALLOWED_HOSTS?.split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  return {
    allowedHosts: listed && listed.length > 0 ? listed : DEFAULT_ALLOWED_HOSTS,
    allowAll: env.RELAY_ALLOW_ALL === "1",
  };
}

export const relayRequestSchema = z.object({
  method: z.enum(HTTP_METHODS),
  url: z.string().min(1).max(2000),
  headers: z.record(z.string(), z.string()).default({}),
  body: z.string().max(MAX_BODY_CHARS).optional(),
  timeoutMs: z.number().int().min(1000).max(MAX_TIMEOUT_MS).default(10_000),
});
export type RelayRequest = z.infer<typeof relayRequestSchema>;

export type Refusal = { status: number; code: string; message: string };

const refuse = (status: number, code: string, message: string): { ok: false; refusal: Refusal } => ({
  ok: false,
  refusal: { status, code, message },
});

function ipv4Parts(address: string): number[] | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  const numbers = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : NaN));
  return numbers.every((value) => value >= 0 && value <= 255) ? numbers : null;
}

/** True for addresses that only make sense from inside a machine or a private network. */
export function isPrivateAddress(address: string): boolean {
  const text = address.toLowerCase().replace(/^\[|\]$/g, "");

  const v4 = ipv4Parts(text);
  if (v4) {
    const [a, b] = v4;
    return (
      a === 0 || // "this" network
      a === 10 || // private
      a === 127 || // loopback
      (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
      (a === 169 && b === 254) || // link-local, where cloud metadata lives
      (a === 172 && b >= 16 && b <= 31) || // private
      (a === 192 && b === 168) || // private
      (a === 192 && b === 0) || // protocol assignments
      (a === 198 && (b === 18 || b === 19)) || // benchmarking
      a >= 224 // multicast and reserved
    );
  }

  if (text.includes(":")) {
    if (text === "::" || text === "::1") return true;
    // An IPv4 address written inside an IPv6 one: judge the IPv4 part.
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(text);
    if (mapped) return isPrivateAddress(mapped[1]);
    if (/^::ffff:/.test(text)) return true;
    return /^f[cd]/.test(text) || /^fe[89ab]/.test(text); // unique local, link-local
  }

  return false;
}

/** Decide, from the address alone, whether the relay may call it. */
export function checkTarget(address: string, config: RelayConfig): { ok: true; url: URL } | { ok: false; refusal: Refusal } {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return refuse(400, "bad_url", "That is not a valid web address.");
  }

  if (url.protocol !== "https:" && !(config.allowAll && url.protocol === "http:")) {
    return refuse(400, "bad_url", "The relay only calls https addresses.");
  }
  if (url.username !== "" || url.password !== "") {
    return refuse(400, "bad_url", "Leave the user name and password out of the address.");
  }

  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return refuse(403, "private_address", "The relay does not call local or private addresses.");
  }
  if (isPrivateAddress(host)) {
    return refuse(403, "private_address", "The relay does not call local or private addresses.");
  }

  if (!config.allowAll) {
    if (!config.allowedHosts.includes(host)) {
      return refuse(
        403,
        "host_not_allowed",
        `The relay does not call ${host}. It only calls a short list of public APIs. Send this request from your browser instead, or run your own copy of Flowboard.`,
      );
    }
    if (url.port !== "") return refuse(403, "host_not_allowed", "The relay only calls the standard port.");
  }

  return { ok: true, url };
}

// Headers that describe the connection, or carry the visitor's own session
// with this site. None of them belong on a request to someone else's API.
const DROPPED_REQUEST_HEADERS = new Set([
  "host",
  "cookie",
  "connection",
  "content-length",
  "transfer-encoding",
  "origin",
  "referer",
  "forwarded",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-real-ip",
]);

export function forwardableHeaders(headers: Record<string, string>): Record<string, string> {
  const kept: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (!DROPPED_REQUEST_HEADERS.has(name.trim().toLowerCase())) kept[name.trim()] = value;
  }
  return kept;
}

const RETURNED_RESPONSE_HEADERS = ["content-type", "location", "retry-after", "x-ratelimit-remaining", "x-ratelimit-limit"];

export function returnableHeaders(headers: Headers): Record<string, string> {
  const kept: Record<string, string> = {};
  for (const name of RETURNED_RESPONSE_HEADERS) {
    const value = headers.get(name);
    if (value !== null) kept[name] = value;
  }
  return kept;
}

/**
 * A fixed-window limit on how often one visitor may use the relay. It lives
 * in memory, so on a host that runs several copies of the server it is a
 * brake, not a guarantee.
 */
export function createRateLimiter(limit: number, windowMs: number, now: () => number = Date.now) {
  const windows = new Map<string, { startedAt: number; count: number }>();

  return function allow(key: string): { allowed: boolean; retryAfterSeconds: number } {
    const time = now();
    const current = windows.get(key);
    if (!current || time - current.startedAt >= windowMs) {
      // Forget visitors whose window has passed, so the map cannot grow forever.
      if (windows.size > 5000) {
        for (const [other, window] of windows) if (time - window.startedAt >= windowMs) windows.delete(other);
      }
      windows.set(key, { startedAt: time, count: 1 });
      return { allowed: true, retryAfterSeconds: 0 };
    }
    if (current.count < limit) {
      current.count += 1;
      return { allowed: true, retryAfterSeconds: 0 };
    }
    return { allowed: false, retryAfterSeconds: Math.ceil((current.startedAt + windowMs - time) / 1000) };
  };
}
