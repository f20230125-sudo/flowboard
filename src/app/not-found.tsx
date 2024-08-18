import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "No page here",
  description: "There is no page at this address. Flowboard is a visual workflow builder: connect blocks, press Run.",
};

export default function NotFound() {
  return (
    <main id="main" tabIndex={-1} className="flex flex-1 flex-col justify-center gap-3 px-[var(--page-x)] py-16">
      <h1 className="max-w-xl text-3xl font-extrabold leading-tight tracking-tight">There is no page at this address</h1>
      <p className="max-w-[62ch] text-base leading-normal text-ink-2">The link may be mistyped, or the page may have moved.</p>
      <Link
        href="/"
        className="mt-2 inline-flex h-11 items-center self-start rounded-control bg-ink px-4 text-sm font-bold text-sheet hover:bg-ink-2"
      >
        Go to Flowboard
      </Link>
    </main>
  );
}
