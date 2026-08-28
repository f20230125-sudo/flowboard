"use client";

import { useState, type DragEvent } from "react";
import { useReactFlow } from "@xyflow/react";
import { Search } from "lucide-react";
import { BLOCK_GROUPS, CATALOG } from "@/flow/catalog";
import { NODE_TYPES, type NodeType } from "@/flow/schema";
import { addBlock } from "@/store/editorThunks";
import { useAppDispatch, useAppStore } from "@/store/hooks";
import { Scroll } from "../ui";
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
    <aside className="hidden w-56 shrink-0 flex-col border-r border-rule bg-sheet lg:flex" aria-label="Blocks">
      <div className="border-b border-rule p-3">
        <label className="relative block">
          <span className="sr-only">Search blocks</span>
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search blocks"
            className="h-8 w-full rounded-control border border-edge bg-sheet pl-8 pr-2 text-[13px] text-ink placeholder:text-ink-3"
          />
        </label>
      </div>

      <Scroll label="Blocks you can add" className="min-h-0 flex-1 overflow-y-auto pb-3">
        {shown.length === 0 && <p className="px-3 pt-3 text-[13px] text-ink-2">No block matches “{query.trim()}”.</p>}

        {BLOCK_GROUPS.map((group) => {
          const types = shown.filter((type) => CATALOG[type].group === group);
          if (types.length === 0) return null;
          return (
            <section key={group} className="mt-3 first:mt-0">
              <h2 className="border-b border-rule px-3 pb-1.5 pt-2 text-[13px] font-semibold text-ink-2">{group}</h2>
              <ul>
                {types.map((type) => (
                  <li key={type} className="border-b border-rule">
                    <button
                      type="button"
                      draggable
                      onDragStart={(event) => onDragStart(event, type)}
                      onClick={() => addByClick(type)}
                      className="flex w-full cursor-grab items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-sheet-2 active:cursor-grabbing"
                      aria-label={`Add ${CATALOG[type].title}`}
                    >
                      <BlockIcon type={type} />
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-semibold text-ink">{CATALOG[type].title}</span>
                        <span className="block truncate text-[12px] text-ink-2">{CATALOG[type].summary}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </Scroll>

      <p className="border-t border-rule p-3 text-[12px] leading-relaxed text-ink-3">
        Drag a block onto the canvas, or click it to add it after the selected block.
      </p>
    </aside>
  );
}
