"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CATALOG } from "@/flow/catalog";
import { copyFlow } from "@/flow/document";
import type { FlowDocument, ParseResult } from "@/flow/schema";
import { decodeFlow } from "@/storage/shareLink";
import { useSaveFlowMutation } from "@/store/api";
import { ThemeToggle } from "../ThemeToggle";
import { Wordmark } from "../Logo";
import { useToast } from "../toast";
import { Button } from "../ui";

function subscribeToHash(listener: () => void): () => void {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
}

/** The sites a flow will call when it runs, so the visitor can see before adding it. */
function calledHosts(flow: FlowDocument): string[] {
  const hosts = new Set<string>();
  for (const node of flow.nodes) {
    if (node.type !== "http") continue;
    try {
      hosts.add(new URL(node.config.url).host);
    } catch {
      hosts.add(node.config.url.trim() || "(no address yet)");
    }
  }
  return [...hosts];
}

/**
 * The page a share link opens. The flow travels in the part of the address
 * after #, which the browser keeps to itself, so it is read here on the client.
 */
export function ImportFlow() {
  const router = useRouter();
  const { showToast } = useToast();
  const [saveFlow, { isLoading: saving }] = useSaveFlowMutation();

  // null on the server and during hydration, where there is no address to read.
  const hash = useSyncExternalStore(subscribeToHash, () => window.location.hash, () => null);
  const [read, setRead] = useState<{ hash: string; result: ParseResult } | null>(null);

  useEffect(() => {
    if (hash === null) return;
    let stale = false;
    void decodeFlow(hash).then((result) => {
      if (!stale) setRead({ hash, result });
    });
    return () => {
      stale = true;
    };
  }, [hash]);

  const result = read && read.hash === hash ? read.result : null;

  const add = async (flow: FlowDocument) => {
    const copy = copyFlow(flow, flow.name);
    try {
      await saveFlow(copy).unwrap();
      router.replace(`/flows/${copy.id}`);
    } catch {
      showToast("The flow could not be saved. Your browser's storage may be full or switched off.", { tone: "bad" });
    }
  };

  return (
    <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
      <header className="flex h-14 items-center justify-between border-b border-rule px-[var(--page-x)]">
        <Wordmark />
        <ThemeToggle />
      </header>

      <main id="main" tabIndex={-1} className="w-full max-w-[44rem] flex-1 px-[var(--page-x)] py-10">
        {result === null ? (
          <p className="text-[15px] text-ink-2" aria-busy="true">
            Reading the link…
          </p>
        ) : !result.ok ? (
          <>
            <h1 className="text-[32px] font-extrabold leading-tight tracking-tight">This link cannot be opened</h1>
            <p className="mt-3 max-w-[62ch] text-base leading-normal text-ink-2">{result.error}</p>
            <Link
              href="/"
              className="mt-6 inline-flex h-11 items-center rounded-control border border-edge bg-sheet px-4 text-sm font-medium text-ink hover:bg-sheet-2"
            >
              Go to your flows
            </Link>
          </>
        ) : (
          <>
            <p className="text-[13px] font-semibold text-ink-2">Shared flow</p>
            <h1 className="mt-1 text-[32px] font-extrabold leading-tight tracking-tight">{result.flow.name}</h1>
            {result.flow.description && (
              <p className="mt-3 max-w-[62ch] text-base leading-normal text-ink-2">{result.flow.description}</p>
            )}

            <dl className="mt-6 border-t border-rule text-sm">
              <div className="flex gap-4 border-b border-rule py-3">
                <dt className="w-24 shrink-0 text-ink-2">Blocks</dt>
                <dd className="min-w-0">
                  {result.flow.nodes.length}:{" "}
                  {[...new Set(result.flow.nodes.map((node) => CATALOG[node.type].title))].join(", ")}
                </dd>
              </div>
              <div className="flex gap-4 border-b border-rule py-3">
                <dt className="w-24 shrink-0 text-ink-2">Calls</dt>
                <dd className="min-w-0 break-words font-mono text-[13px]">
                  {calledHosts(result.flow).join(", ") || "no outside service"}
                </dd>
              </div>
            </dl>

            <p className="mt-4 max-w-[62ch] text-[13px] leading-relaxed text-ink-2">
              Adding it saves a copy in this browser. It does nothing until you press Run, and a flow cannot run code.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-2">
              <Button variant="primary" size="lg" disabled={saving} onClick={() => void add(result.flow)}>
                Add to my flows
              </Button>
              <Link
                href="/"
                className="inline-flex h-11 items-center rounded-control px-3 text-sm font-medium text-ink-2 hover:bg-sheet-2 hover:text-ink"
              >
                Not now
              </Link>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
