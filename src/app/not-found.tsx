import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-xl font-semibold">There is no page at this address</h1>
      <p className="max-w-sm text-sm text-muted">The link may be mistyped, or the page may have moved.</p>
      <Link href="/" className="mt-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-fg">
        Go to Flowboard
      </Link>
    </main>
  );
}
