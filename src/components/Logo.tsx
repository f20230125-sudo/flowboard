import Link from "next/link";

/**
 * The mark: an outline circle, a wire, a filled circle. In the page it is all
 * ink, because nothing on the page has a hue until a flow has run. (The icon
 * and the preview image draw the wire in the current's colour.)
 */
export function LogoMark() {
  return (
    <svg width="30" height="16" viewBox="0 0 30 16" aria-hidden="true" className="shrink-0">
      <circle cx="6" cy="8" r="4.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M10.5 8h9" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="24" cy="8" r="4.5" fill="currentColor" />
    </svg>
  );
}

/** The mark and the name, as a link to the home page. */
export function Wordmark() {
  return (
    <Link href="/" className="-ml-1 inline-flex min-h-8 items-center gap-2.5 rounded-control px-1 text-ink">
      <LogoMark />
      <span className="text-lg font-extrabold tracking-tight">Flowboard</span>
    </Link>
  );
}
