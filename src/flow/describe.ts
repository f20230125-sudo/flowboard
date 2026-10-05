import { OPERATOR_LABELS, isUnary } from "@/engine/condition";
import type { FlowNode } from "./schema";

// The one line shown under a block's name on the canvas, so a flow can be read
// without opening each block.

const short = (text: string, max = 44) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

function comparison(left: string, operator: Parameters<typeof isUnary>[0], right: string): string {
  if (left.trim() === "") return "Not set up yet";
  return short(isUnary(operator) ? `${left} ${OPERATOR_LABELS[operator]}` : `${left} ${OPERATOR_LABELS[operator]} ${right}`);
}

export function describeNode(node: FlowNode): string {
  switch (node.type) {
    case "trigger":
      return "Starts when you press Run";
    case "http": {
      const address = node.config.url.trim().replace(/^https?:\/\//i, "");
      return address === "" ? "No address yet" : short(`${node.config.method} ${address}`);
    }
    case "condition":
      return comparison(node.config.left, node.config.operator, node.config.right);
    case "set": {
      const keys = node.config.fields.map((field) => field.key.trim()).filter(Boolean);
      return keys.length === 0 ? "No fields yet" : short(keys.join(", "));
    }
    case "filter":
      return node.config.list.trim() === ""
        ? "No list chosen yet"
        : `Keep where ${comparison(node.config.left, node.config.operator, node.config.right)}`.slice(0, 48);
    case "ai":
      return node.config.prompt.trim() === "" ? "No prompt yet" : short(node.config.prompt);
    case "delay":
      return `Wait ${node.config.ms >= 1000 ? `${node.config.ms / 1000} s` : `${node.config.ms} ms`}`;
    case "output":
      return node.config.value.trim() === "" ? "Shows whatever arrives" : short(node.config.value);
  }
}
