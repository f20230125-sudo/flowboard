"use client"; // Error boundaries must be Client Components.

import { useEffect } from "react";
import Link from "next/link";

/** Shown when a page throws. Flows are saved in the browser, so nothing is lost. */
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-xl font-semibold">Something went wrong on this page</h1>
      <p className="max-w-sm text-sm leading-relaxed text-muted">
        Your flows are safe: they are saved in this browser. Try again, or go back to the list.
      </p>
      <div className="mt-2 flex items-center gap-2">
        <button type="button" onClick={() => retry()} className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-fg">
          Try again
        </button>
        <Link href="/" className="rounded-lg border border-line px-3 py-2 text-sm font-medium hover:bg-surface-2">
          See all flows
        </Link>
      </div>
    </main>
  );
}
