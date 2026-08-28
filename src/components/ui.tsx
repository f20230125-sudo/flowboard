"use client";

import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ComponentPropsWithRef, type ReactNode } from "react";

// The few building blocks every screen shares.

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "outline" | "ghost" | "danger";
  /** sm 28 px, md 32 px, lg 44 px (the primary control of a phone screen). */
  size?: "sm" | "md" | "lg";
};

const VARIANTS: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-ink font-bold text-sheet hover:bg-ink-2",
  outline: "border border-edge bg-sheet font-medium text-ink hover:bg-sheet-2",
  ghost: "font-medium text-ink-2 hover:bg-sheet-2 hover:text-ink",
  danger: "font-medium text-fail hover:bg-sheet-2",
};

const SIZES: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "h-7 px-2 text-xs",
  md: "h-8 px-3 text-[13px]",
  lg: "h-11 px-4 text-sm",
};

/**
 * A button that is "disabled" stays in the tab order and keeps focus, so
 * pressing it while it is busy does not throw the keyboard to the top of the
 * page. It says so with aria-disabled and ignores the click.
 */
function guard<E extends { preventDefault(): void }>(disabled: boolean | undefined, onClick: ((event: E) => void) | undefined) {
  return disabled
    ? (event: E) => {
        event.preventDefault();
      }
    : onClick;
}

export function Button({
  variant = "outline",
  size = "md",
  className = "",
  type = "button",
  disabled,
  onClick,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      aria-disabled={disabled || undefined}
      onClick={guard(disabled, onClick)}
      className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-control transition-colors aria-disabled:cursor-not-allowed aria-disabled:opacity-45 ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
      {...rest}
    />
  );
}

type IconButtonProps = ComponentPropsWithRef<"button"> & {
  /** Read by screen readers and shown as the tooltip. */
  label: string;
  children: ReactNode;
};

export function IconButton({ label, className = "", type = "button", disabled, onClick, children, ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      aria-disabled={disabled || undefined}
      onClick={guard(disabled, onClick)}
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-ink-2 transition-colors hover:bg-sheet-2 hover:text-ink aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:hover:bg-transparent aria-disabled:hover:text-ink-2 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-control border border-edge bg-sheet px-1.5 py-0.5 font-mono text-[11.5px] text-ink-2">{children}</kbd>
  );
}

/**
 * A scrolling region. When its content is longer than it is, it becomes a
 * labelled region that the keyboard can reach and scroll; when it is not, it
 * is a plain box and adds no tab stop.
 */
export function Scroll({ label, className = "", children }: { label: string; className?: string; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const measure = () =>
      setOverflows(element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1);
    // The observer reports once as soon as it starts, so the first measure happens there.
    const resized = new ResizeObserver(measure);
    resized.observe(element);
    // A content box that grows wider or taller than the region is what makes it scroll.
    for (const child of element.children) resized.observe(child);
    const changed = new MutationObserver(measure);
    changed.observe(element, { childList: true, subtree: true });
    return () => {
      resized.disconnect();
      changed.disconnect();
    };
  }, []);

  return (
    <div
      ref={box}
      role={overflows ? "region" : undefined}
      aria-label={overflows ? label : undefined}
      tabIndex={overflows ? 0 : undefined}
      className={className}
    >
      {children}
    </div>
  );
}
