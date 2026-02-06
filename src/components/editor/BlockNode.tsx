"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { CATALOG } from "@/flow/catalog";
import { describeNode } from "@/flow/describe";
import type { CanvasNode } from "@/store/selectors";
import { BlockIcon, blockTone } from "./blockLook";

// One block on the canvas. Data flows left to right: connections come in on
// the left edge and leave on the right. A Condition has two ways out.

function BlockNodeView({ data, selected }: NodeProps<CanvasNode>) {
  const { node } = data;
  const spec = CATALOG[node.type];
  const branches = spec.outputs.length > 1;

  return (
    <div
      className={`fb-block w-[240px] rounded-xl border bg-surface shadow-panel transition-[border-color,box-shadow] ${
        selected ? "border-accent ring-2 ring-accent/25" : "border-line hover:border-line-strong"
      }`}
      style={{ borderLeft: `3px solid ${blockTone(node.type)}` }}
    >
      {spec.hasInput && <Handle type="target" position={Position.Left} aria-label={`Connect into ${node.name}`} />}

      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <BlockIcon type={node.type} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-[13px] font-medium leading-tight text-fg">{node.name}</div>
          <div className="mt-0.5 truncate text-[11px] leading-tight text-muted">{describeNode(node)}</div>
        </div>
      </div>

      {branches ? (
        <div className="border-t border-line py-1">
          {spec.outputs.map((output) => (
            <div key={output.id} className="relative flex h-6 items-center justify-end pr-4 text-[11px] font-medium">
              <span className={output.id === "true" ? "text-ok" : "text-bad"}>{output.label}</span>
              <Handle
                type="source"
                id={output.id}
                position={Position.Right}
                aria-label={`Connect from the ${output.label} side of ${node.name}`}
              />
            </div>
          ))}
        </div>
      ) : (
        spec.outputs.map((output) => (
          <Handle
            key={output.id}
            type="source"
            id={output.id}
            position={Position.Right}
            aria-label={`Connect from ${node.name}`}
          />
        ))
      )}
    </div>
  );
}

export const BlockNode = memo(BlockNodeView);
