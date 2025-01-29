import { findReferences, ROOTS, type Root } from "@/engine/reference";
import { ancestorsOf, nodesInCycles, outgoingBySource, reachableFrom } from "./graph";
import { NODE_NAME_PATTERN, UNARY_OPERATORS, type FlowDocument, type FlowNode, type NodeType } from "./schema";

const PREPARES_DATA: readonly NodeType[] = ["trigger", "condition", "set", "filter"];

// The checks made before a flow may run. Each one returns a problem in plain
// words, tied to the block it is about. Errors block the Run button; warnings
// do not.

export type Problem = {
  level: "error" | "warning";
  /** Stable, so a test or the UI can tell problems apart. */
  code: string;
  message: string;
  nodeId?: string;
};

/** Every piece of text in a block's settings that may hold references. */
export function templatedTexts(node: FlowNode): { field: string; text: string }[] {
  switch (node.type) {
    case "trigger":
      return [];
    case "http":
      return [
        { field: "Address", text: node.config.url },
        { field: "Body", text: node.config.method === "GET" ? "" : node.config.body },
        ...node.config.query.map((pair) => ({ field: "Query parameters", text: pair.value })),
        ...node.config.headers.map((pair) => ({ field: "Headers", text: pair.value })),
      ];
    case "condition":
      return [
        { field: "Value", text: node.config.left },
        { field: "Compare with", text: node.config.right },
      ];
    case "set":
      return node.config.fields.map((pair) => ({ field: pair.key || "Fields", text: pair.value }));
    case "filter":
      return [
        { field: "List", text: node.config.list },
        { field: "Keep an item when", text: node.config.left },
        { field: "Compare with", text: node.config.right },
      ];
    case "ai":
      return [
        { field: "Instructions", text: node.config.system },
        { field: "Prompt", text: node.config.prompt },
      ];
    case "delay":
      return [];
    case "output":
      return [{ field: "Value", text: node.config.value }];
  }
}

function requiredSettings(node: FlowNode): string[] {
  const missing: string[] = [];
  switch (node.type) {
    case "trigger": {
      const text = node.config.payload.trim();
      if (text !== "") {
        try {
          JSON.parse(text);
        } catch {
          missing.push("The sample data is not valid JSON.");
        }
      }
      break;
    }
    case "http":
      if (node.config.url.trim() === "") missing.push("Give it an address to call.");
      break;
    case "condition":
      if (node.config.left.trim() === "") missing.push("Choose the value to check.");
      if (!UNARY_OPERATORS.includes(node.config.operator) && node.config.right.trim() === "") {
        missing.push("Say what to compare the value with.");
      }
      break;
    case "set":
      if (node.config.fields.every((pair) => pair.key.trim() === "")) missing.push("Add at least one field.");
      break;
    case "filter":
      if (node.config.list.trim() === "") missing.push("Choose the list to filter.");
      if (node.config.left.trim() === "") missing.push("Say which items to keep.");
      break;
    case "ai":
      if (node.config.prompt.trim() === "") missing.push("Write a prompt.");
      break;
    case "delay":
    case "output":
      break;
  }
  return missing;
}

export function validateFlow(flow: FlowDocument): Problem[] {
  const problems: Problem[] = [];
  const { nodes, edges } = flow;

  if (nodes.length === 0) {
    return [{ level: "error", code: "empty", message: "The flow is empty. Add a Manual trigger to start." }];
  }

  // --- One starting point --------------------------------------------------
  const triggers = nodes.filter((node) => node.type === "trigger");
  if (triggers.length === 0) {
    problems.push({ level: "error", code: "no-trigger", message: "Add a Manual trigger so the flow has a start." });
  }
  for (const extra of triggers.slice(1)) {
    problems.push({
      level: "error",
      code: "many-triggers",
      nodeId: extra.id,
      message: "A flow has one trigger. Remove this one or the other.",
    });
  }

  // --- Names ----------------------------------------------------------------
  const byName = new Map<string, FlowNode>();
  for (const node of nodes) {
    if (!NODE_NAME_PATTERN.test(node.name)) {
      problems.push({
        level: "error",
        code: "bad-name",
        nodeId: node.id,
        message: `"${node.name}" cannot be used as a name. Use letters, digits and _ and start with a letter.`,
      });
    } else if (byName.has(node.name)) {
      problems.push({
        level: "error",
        code: "duplicate-name",
        nodeId: node.id,
        message: `Two blocks are named "${node.name}". Names must differ so references know which one is meant.`,
      });
    } else {
      byName.set(node.name, node);
    }
  }

  // --- Loops ----------------------------------------------------------------
  const looping = new Set(nodesInCycles(nodes, edges));
  for (const node of nodes) {
    if (looping.has(node.id)) {
      problems.push({
        level: "error",
        code: "loop",
        nodeId: node.id,
        message: "This block is part of a loop, so the flow would never finish.",
      });
    }
  }

  // --- Settings and references, block by block -------------------------------
  const reachable = reachableFrom(triggers.map((node) => node.id), edges);
  const outgoing = outgoingBySource(edges);

  for (const node of nodes) {
    for (const message of requiredSettings(node)) {
      problems.push({ level: "error", code: "missing-setting", nodeId: node.id, message });
    }

    const ancestors = ancestorsOf(node.id, edges);
    for (const { field, text } of templatedTexts(node)) {
      const references = findReferences(text);
      if ((text.match(/\{\{/g) ?? []).length !== references.length) {
        problems.push({
          level: "error",
          code: "bad-reference",
          nodeId: node.id,
          message: `${field}: a reference is not closed. References look like {{ steps.name.field }}.`,
        });
      }
      for (const reference of references) {
        if (reference.error || !reference.path) {
          problems.push({
            level: "error",
            code: "bad-reference",
            nodeId: node.id,
            message: `${field}: ${reference.error ?? "the reference cannot be read."}`,
          });
          continue;
        }
        const root = String(reference.path[0]);
        if (!ROOTS.includes(root as Root)) {
          problems.push({
            level: "error",
            code: "bad-reference",
            nodeId: node.id,
            message: `${field}: {{ ${reference.expression} }} must start with steps, input or trigger.`,
          });
        } else if (root === "item" && node.type !== "filter") {
          problems.push({
            level: "error",
            code: "bad-reference",
            nodeId: node.id,
            message: `${field}: {{ item }} only works inside a Filter list block.`,
          });
        } else if (root === "steps") {
          const name = reference.path[1];
          const target = typeof name === "string" ? byName.get(name) : undefined;
          if (!target) {
            problems.push({
              level: "error",
              code: "unknown-step",
              nodeId: node.id,
              message: `${field}: there is no block named "${String(name ?? "")}".`,
            });
          } else if (!ancestors.has(target.id)) {
            problems.push({
              level: "error",
              code: "step-not-before",
              nodeId: node.id,
              message: `${field}: "${target.name}" does not run before this block, so its data is not there yet.`,
            });
          }
        }
      }
    }

    // --- Connections ---------------------------------------------------------
    if (node.type !== "trigger" && !looping.has(node.id) && !reachable.has(node.id) && triggers.length > 0) {
      problems.push({
        level: "warning",
        code: "not-connected",
        nodeId: node.id,
        message: "Nothing leads here from the trigger, so this block will not run.",
      });
    }
    // A request or an AI call can be the last thing a flow does. A block that
    // only prepares data cannot: if nothing reads it, it has no effect.
    const onlyPreparesData = PREPARES_DATA.includes(node.type);
    if (onlyPreparesData && reachable.has(node.id) && (outgoing.get(node.id) ?? []).length === 0) {
      problems.push({
        level: "warning",
        code: "dead-end",
        nodeId: node.id,
        message: "Nothing uses this block's result. Connect it to another block or an Output.",
      });
    }
  }

  return problems;
}

export function hasErrors(problems: readonly Problem[]): boolean {
  return problems.some((problem) => problem.level === "error");
}
