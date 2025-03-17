"use client";

import { useState, type DragEvent } from "react";
import { useReactFlow } from "@xyflow/react";
import { Search } from "lucide-react";
import { BLOCK_GROUPS, CATALOG } from "@/flow/catalog";
import { NODE_TYPES, type NodeType } from "@/flow/schema";
import { addBlock } from "@/store/editorThunks";
import { useAppDispatch, useAppStore } from "@/store/hooks";
import { BlockIcon } from "./blockLook";
import { BLOCK_DRAG_TYPE } from "./constants";

/**
 * The list of blocks. Drag one onto the canvas, or click it: a click adds it
 * after the selected block and connects the two.
 */
export function Palette() {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const { fitView } = useReactFlow();
  const [query, setQuery] = useState("");

  const addByClick = (type: NodeType) => {
    const id = dispatch(addBlock(type));
    // The new block may land outside the view. Wait until the canvas has drawn
    // and measured it (a frame or two), then bring the whole flow into sight.
    const reveal = (triesLeft: number) => {
      if (store.getState().flow.view.measured[id]) {
        requestAnimationFrame(() => fitView({ padding: 0.12, maxZoom: 1, duration: 300 }));
      } else if (triesLeft > 0) {
        requestAnimationFrame(() => reveal(triesLeft - 1));
      }
    };
    reveal(30);
  };

  const wanted = query.trim().toLowerCase();
  const matches = (type: NodeType) => {
    const spec = CATALOG[type];
    return wanted === "" || `${spec.title} ${spec.summary} ${spec.group}`.toLowerCase().includes(wanted);
  };
  const shown = NODE_TYPES.filter(matches);

  const onDragStart = (event: DragEvent, type: NodeType) => {
    event.dataTransfer.setData(BLOCK_DRAG_TYPE, type);
    event.dataTransfer.effectAllowed = "copy";
  };

  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r border-line bg-surface lg:flex" aria-label="Blocks">
      <div className="border-b border-line p-3">
        <label className="relative block">
          <span className="sr-only">Search blocks</span>
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search blocks"
            className="h-8 w-full rounded-lg border border-line bg-bg pl-8 pr-2 text-[13px] text-fg placeholder:text-faint"
          />
        </label>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {shown.length === 0 && <p className="px-1 text-[13px] text-muted">No block matches “{query.trim()}”.</p>}

        {BLOCK_GROUPS.map((group) => {
          const types = shown.filter((type) => CATALOG[type].group === group);
          if (types.length === 0) return null;
          return (
            <section key={group} className="mb-4 last:mb-0">
              <h2 className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-faint">{group}</h2>
              <ul className="space-y-1.5">
                {types.map((type) => (
                  <li key={type}>
                    <button
                      type="button"
                      draggable
                      onDragStart={(event) => onDragStart(event, type)}
                      onClick={() => addByClick(type)}
                      className="flex w-full cursor-grab items-center gap-2.5 rounded-lg border border-line bg-surface p-2 text-left transition-colors hover:border-line-strong hover:bg-surface-2 active:cursor-grabbing"
                      aria-label={`Add ${CATALOG[type].title}`}
                    >
                      <BlockIcon type={type} size={28} />
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-medium text-fg">{CATALOG[type].title}</span>
                        <span className="block truncate text-[11px] text-muted">{CATALOG[type].summary}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <p className="border-t border-line p-3 text-[11px] leading-relaxed text-faint">
        Drag a block onto the canvas, or click it to add it after the selected block.
      </p>
    </aside>
  );
}
