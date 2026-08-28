"use client"; // Error boundaries must be Client Components.

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui";

/** Shown when a page throws. Flows are saved in the browser, so nothing is lost. */
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main id="main" tabIndex={-1} className="flex flex-1 flex-col justify-center gap-3 px-[var(--page-x)] py-16">
      <h1 className="max-w-xl text-3xl font-extrabold leading-tight tracking-tight">Something went wrong on this page</h1>
      <p className="max-w-[62ch] text-base leading-normal text-ink-2">
        Your flows are safe: they are saved in this browser. Try again, or go back to the list.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button variant="primary" size="lg" onClick={() => retry()}>
          Try again
        </Button>
        <Link
          href="/"
          className="inline-flex h-11 items-center rounded-control border border-edge bg-sheet px-4 text-sm font-medium text-ink hover:bg-sheet-2"
        >
          See all flows
        </Link>
      </div>
    </main>
  );
}
