import { Braces, Flag, Globe, ListFilter, Play, Sparkles, Split, Timer, type LucideIcon } from "lucide-react";
import { CATALOG } from "@/flow/catalog";
import type { NodeType } from "@/flow/schema";

// How each kind of block looks: its icon, and the colour of its group.

export const BLOCK_ICONS: Record<NodeType, LucideIcon> = {
  trigger: Play,
  http: Globe,
  condition: Split,
  set: Braces,
  filter: ListFilter,
  ai: Sparkles,
  delay: Timer,
  output: Flag,
};

/** The CSS colour of a block's group, such as var(--group-logic). */
export function blockTone(type: NodeType): string {
  return `var(--group-${CATALOG[type].group.toLowerCase()})`;
}

/** The coloured square with the block's icon in it. */
export function BlockIcon({ type, size = 30 }: { type: NodeType; size?: number }) {
  const Icon = BLOCK_ICONS[type];
  const tone = blockTone(type);
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-lg"
      style={{
        width: size,
        height: size,
        color: tone,
        backgroundColor: `color-mix(in srgb, ${tone} 14%, transparent)`,
      }}
    >
      <Icon size={Math.round(size * 0.53)} strokeWidth={2.2} />
    </span>
  );
}
