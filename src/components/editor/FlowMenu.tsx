"use client";

import { useState } from "react";
import { Download, Ellipsis, Link as LinkIcon, Settings } from "lucide-react";
import { useAppDispatch, useAppStore } from "@/store/hooks";
import { toDocument } from "@/store/selectors";
import { settingsActions } from "@/store/settingsSlice";
import { exportFileName, shareUrl } from "@/storage/shareLink";
import { useToast } from "../toast";
import { IconButton } from "../ui";

/** The "more" menu in the top bar: export, share, settings. */
export function FlowMenu() {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);

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
  ];

  return (
    <div className="relative">
      <IconButton label="More actions" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Ellipsis size={16} />
      </IconButton>

      {open && (
        <>
          {/* Covers the page under the menu, so a click anywhere else closes it. */}
          <button type="button" aria-hidden tabIndex={-1} className="fixed inset-0 z-30 cursor-default" onClick={() => setOpen(false)} />
          <div
            role="menu"
            aria-label="More actions"
            onKeyDown={(event) => {
              if (event.key === "Escape") setOpen(false);
            }}
            className="absolute right-0 top-9 z-40 w-60 rounded-xl border border-line bg-surface p-1 shadow-panel"
          >
            {items.map(({ label, icon: Icon, run }) => (
              <button
                key={label}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  run();
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-fg hover:bg-surface-2"
              >
                <Icon size={15} className="text-muted" /> {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
