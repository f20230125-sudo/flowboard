"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Ellipsis, Keyboard, Link as LinkIcon, Settings } from "lucide-react";
import { useAppDispatch, useAppStore } from "@/store/hooks";
import { toDocument } from "@/store/selectors";
import { settingsActions } from "@/store/settingsSlice";
import { uiActions } from "@/store/uiSlice";
import { exportFileName, shareUrl } from "@/storage/shareLink";
import { useToast } from "../toast";
import { IconButton } from "../ui";

/** The "more" menu in the top bar: export, share, settings, shortcuts. */
export function FlowMenu() {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  /** Close the menu and put the keyboard back on the button that opened it, so focus never falls to the page. */
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  // Opening the menu moves focus onto its first item.
  useEffect(() => {
    if (open) menu.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
  }, [open]);

  const moveFocus = (step: number) => {
    const items = [...(menu.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    items[(at + step + items.length) % items.length]?.focus();
  };

  const currentFlow = () => toDocument(store.getState().flow, new Date());

  const exportFile = () => {
    const flow = currentFlow();
    const url = URL.createObjectURL(new Blob([JSON.stringify(flow, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = exportFileName(flow.name);
    link.click();
    URL.revokeObjectURL(url);
    showToast(`Saved ${link.download} to your downloads.`);
  };

  const copyLink = async () => {
    try {
      const url = await shareUrl(currentFlow(), window.location.origin);
      await navigator.clipboard.writeText(url);
      showToast("Link copied. Anyone who opens it gets their own copy of this flow.");
    } catch {
      showToast("The link could not be copied. Export the flow as a file instead.", { tone: "bad" });
    }
  };

  const items = [
    { label: "Export as a file", icon: Download, run: exportFile },
    { label: "Copy a share link", icon: LinkIcon, run: () => void copyLink() },
    { label: "Language model settings", icon: Settings, run: () => dispatch(settingsActions.settingsOpened()) },
    { label: "Keyboard shortcuts", icon: Keyboard, run: () => dispatch(uiActions.shortcutsToggled(true)) },
  ];

  return (
    <div className="relative">
      <IconButton
        ref={trigger}
        label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <Ellipsis size={16} />
      </IconButton>

      {open && (
        <>
          {/* Covers the page under the menu, so a click anywhere else closes it. */}
          <button type="button" aria-hidden tabIndex={-1} className="fixed inset-0 z-30 cursor-default" onClick={() => setOpen(false)} />
          <div
            ref={menu}
            role="menu"
            aria-label="More actions"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                close();
              } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                moveFocus(event.key === "ArrowDown" ? 1 : -1);
              } else if (event.key === "Tab") {
                setOpen(false);
              }
            }}
            className="absolute right-0 top-10 z-40 w-60 rounded-block border border-rule bg-sheet p-1 shadow-overlay"
          >
            {items.map(({ label, icon: Icon, run }) => (
              <button
                key={label}
                type="button"
                role="menuitem"
                onClick={() => {
                  // Focus goes back first, so a dialog that opens next returns focus there when it closes.
                  close();
                  run();
                }}
                className="flex min-h-9 w-full items-center gap-2.5 rounded-control px-2.5 text-left text-[13px] font-medium text-ink hover:bg-sheet-2"
              >
                <Icon size={15} className="text-ink-2" aria-hidden /> {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
