import { Braces, Flag, Globe, ListFilter, MessageSquareText, Play, Split, Timer, type LucideIcon } from "lucide-react";
import type { NodeType } from "@/flow/schema";

// How each kind of block looks: its icon. A block's kind is told by its shape
// (terminators for Start and Output, rectangles for steps, a fork for a
// Condition) and by this glyph, in ink. No block has a colour of its own.

export const BLOCK_ICONS: Record<NodeType, LucideIcon> = {
  trigger: Play,
  http: Globe,
  condition: Split,
  set: Braces,
  filter: ListFilter,
  ai: MessageSquareText,
  delay: Timer,
  output: Flag,
};

/** The block's glyph, drawn in ink. */
export function BlockIcon({ type, size = 16 }: { type: NodeType; size?: number }) {
  const Icon = BLOCK_ICONS[type];
  return <Icon aria-hidden className="shrink-0 text-ink" size={size} strokeWidth={2} />;
}
