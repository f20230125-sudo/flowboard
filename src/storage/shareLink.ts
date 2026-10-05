import { parseFlow, type FlowDocument, type ParseResult } from "@/flow/schema";

// A share link carries the whole flow inside the address itself:
//
//   https://…/import#1.<compressed flow>
//
// Nothing is uploaded, so sharing needs no server and no account. The part
// after # never leaves the browser: it is not sent with the request for the
// page. Whoever opens the link gets their own copy to keep or throw away.
//
// A link is only data. It is parsed like any other flow from outside, and a
// flow cannot run code, so opening one is safe. It does nothing until Run is
// pressed.

const VERSION = "1";
/** Longer than this and the link is refused before any work is done on it. */
const MAX_ENCODED_CHARS = 200_000;
const MAX_DECODED_BYTES = 2_000_000;

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function pipeThrough(bytes: Uint8Array, stream: CompressionStream | DecompressionStream, limit = Infinity) {
  const writer = stream.writable.getWriter();
  // Not awaited: the reader below is what drains the stream.
  void writer.write(bytes as Uint8Array<ArrayBuffer>).then(() => writer.close()).catch(() => {});

  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new Error("too large");
    }
    chunks.push(value);
  }
  const joined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined;
}

/** The text that goes after # in a share link. */
export async function encodeFlow(flow: FlowDocument): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(flow));
  const packed = await pipeThrough(bytes, new CompressionStream("deflate-raw"));
  return `${VERSION}.${toBase64Url(packed)}`;
}

/** Read the text after # back into a flow, or say why it cannot be read. */
export async function decodeFlow(encoded: string): Promise<ParseResult> {
  const broken: ParseResult = { ok: false, error: "This link is incomplete or damaged. Ask for it to be copied again." };
  const text = encoded.replace(/^#/, "");
  if (text === "") return { ok: false, error: "This link has no flow in it." };
  if (text.length > MAX_ENCODED_CHARS) return { ok: false, error: "This link is too large to open." };

  const separator = text.indexOf(".");
  if (separator === -1) return broken;
  if (text.slice(0, separator) !== VERSION) {
    return { ok: false, error: "This link was made with a newer version of Flowboard." };
  }

  try {
    const packed = fromBase64Url(text.slice(separator + 1));
    const bytes = await pipeThrough(packed, new DecompressionStream("deflate-raw"), MAX_DECODED_BYTES);
    return parseFlow(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return broken;
  }
}

export async function shareUrl(flow: FlowDocument, origin: string): Promise<string> {
  return `${origin}/import#${await encodeFlow(flow)}`;
}

/** A file name made from the flow's name: "Heat check" → "heat-check.flowboard.json". */
export function exportFileName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "flow"}.flowboard.json`;
}
