import { lookup } from "node:dns/promises";
import {
  MAX_RESPONSE_BYTES,
  checkTarget,
  createRateLimiter,
  forwardableHeaders,
  isPrivateAddress,
  readRelayConfig,
  relayRequestSchema,
  returnableHeaders,
} from "@/server/relay";

// POST /api/relay
//
// Makes one HTTP request for the visitor and returns the answer, for APIs
// that refuse calls from a browser. What it will and will not call is decided
// in src/server/relay.ts; read the note at the top of that file first.
//
// Request:  { method, url, headers?, body?, timeoutMs? }
// Answer:   200 { status, statusText, headers, body }      the API's answer, whatever its status
//           4xx/5xx { error: { code, message } }            the relay itself refused or failed

const allow = createRateLimiter(30, 60_000);

const fail = (status: number, code: string, message: string, headers?: HeadersInit) =>
  Response.json({ error: { code, message } }, { status, headers });

/** Read the body, giving up once it passes the size limit. */
async function readCapped(response: Response): Promise<string | null> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export async function POST(request: Request) {
  const visitor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const turn = allow(visitor);
  if (!turn.allowed) {
    return fail(429, "too_many_requests", "Too many relayed requests. Try again in a minute.", {
      "Retry-After": String(turn.retryAfterSeconds),
    });
  }

  const parsed = relayRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "bad_request", "The request to the relay is not in the expected shape.");
  const { method, url: address, headers, body, timeoutMs } = parsed.data;

  const config = readRelayConfig(process.env);
  const target = checkTarget(address, config);
  if (!target.ok) return fail(target.refusal.status, target.refusal.code, target.refusal.message);
  const { url } = target;

  // A public name can still point at a private address. Look it up and check.
  // (The address is looked up again when the request is made, so a name that
  // changes its answer between the two could slip through. The host list
  // above is what really keeps the hosted relay closed.)
  try {
    const addresses = await lookup(url.hostname, { all: true });
    if (addresses.length === 0 || addresses.some((entry) => isPrivateAddress(entry.address))) {
      return fail(403, "private_address", "The relay does not call local or private addresses.");
    }
  } catch {
    return fail(502, "network", `Could not find ${url.hostname}.`);
  }

  try {
    const response = await fetch(url, {
      method,
      headers: forwardableHeaders(headers),
      body: method === "GET" ? undefined : body,
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });

    const text = await readCapped(response);
    if (text === null) return fail(502, "too_large", `The answer from ${url.hostname} is larger than 1 MB.`);

    return Response.json({
      status: response.status,
      statusText: response.statusText,
      headers: returnableHeaders(response.headers),
      body: text,
    });
  } catch (problem) {
    if (problem instanceof Error && problem.name === "TimeoutError") {
      return fail(504, "timeout", `${url.hostname} did not answer within ${timeoutMs / 1000} seconds.`);
    }
    return fail(502, "network", `Could not reach ${url.hostname}.`);
  }
}
