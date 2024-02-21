"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Workflow } from "lucide-react";
import { CATALOG } from "@/flow/catalog";
import { copyFlow } from "@/flow/document";
import type { FlowDocument, ParseResult } from "@/flow/schema";
import { decodeFlow } from "@/storage/shareLink";
import { useSaveFlowMutation } from "@/store/api";
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
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-5 py-10">
      <Link href="/" className="mb-6 flex items-center gap-2.5 self-start">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-accent-fg">
          <Workflow size={18} />
        </span>
        <span className="text-lg font-semibold tracking-tight">Flowboard</span>
      </Link>

      <div className="rounded-2xl border border-line bg-surface p-5">
        {result === null ? (
          <p className="text-sm text-muted" aria-busy="true">
            Reading the link…
          </p>
        ) : !result.ok ? (
          <>
            <h1 className="text-lg font-semibold">This link cannot be opened</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted">{result.error}</p>
            <Link href="/" className="mt-4 inline-block text-sm font-medium text-accent underline">
              Go to your flows
            </Link>
          </>
        ) : (
          <>
            <p className="text-xs font-medium uppercase tracking-wider text-faint">Shared flow</p>
            <h1 className="mt-1 text-xl font-semibold">{result.flow.name}</h1>
            {result.flow.description && <p className="mt-1 text-sm leading-relaxed text-muted">{result.flow.description}</p>}

            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex gap-3">
                <dt className="w-24 shrink-0 text-muted">Blocks</dt>
                <dd>
                  {result.flow.nodes.length}:{" "}
                  {[...new Set(result.flow.nodes.map((node) => CATALOG[node.type].title))].join(", ")}
                </dd>
              </div>
              <div className="flex gap-3">
                <dt className="w-24 shrink-0 text-muted">Calls</dt>
                <dd className="min-w-0 break-words font-mono text-[13px]">
                  {calledHosts(result.flow).join(", ") || "no outside service"}
                </dd>
              </div>
            </dl>

            <p className="mt-4 text-xs leading-relaxed text-faint">
              Adding it saves a copy in this browser. It does nothing until you press Run, and a flow cannot run code.
            </p>

            <div className="mt-5 flex items-center gap-2">
              <Button variant="primary" className="h-9 px-4" disabled={saving} onClick={() => void add(result.flow)}>
                Add to my flows
              </Button>
              <Link href="/" className="rounded-lg px-3 py-2 text-[13px] font-medium text-muted hover:bg-surface-2 hover:text-fg">
                Not now
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
