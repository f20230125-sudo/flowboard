"use client";

import { useId, useState } from "react";
import { CircleAlert, CopyPlus, Trash2, TriangleAlert } from "lucide-react";
import { CATALOG } from "@/flow/catalog";
import type { FlowNode } from "@/flow/schema";
import type { Problem } from "@/flow/validate";
import { duplicateSelection, renameBlock } from "@/store/editorThunks";
import { flowActions } from "@/store/flowSlice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  selectEdges,
  selectFlowDescription,
  selectFlowName,
  selectNodes,
  selectProblemsByNode,
  selectSelectedEdgeIds,
  selectSelectedNodes,
} from "@/store/selectors";
import { Button, Kbd } from "../ui";
import { BlockIcon } from "./blockLook";
import { Field } from "./fields";

const INPUT =
  "w-full rounded-lg border border-line bg-bg px-2.5 text-[13px] text-fg placeholder:text-faint transition-colors hover:border-line-strong";

/** The panel on the right: the settings of whatever is selected. */
export function Inspector() {
  const selected = useAppSelector(selectSelectedNodes);
  const selectedEdges = useAppSelector(selectSelectedEdgeIds);

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-line bg-surface" aria-label="Settings">
      {selected.length === 1 ? (
        // Keyed by block, so drafts in the form never carry over to another block.
        <BlockSettings key={selected[0].id} node={selected[0]} />
      ) : selected.length > 1 ? (
        <SelectionActions title={`${selected.length} blocks selected`} />
      ) : selectedEdges.length > 0 ? (
        <SelectionActions
          title={selectedEdges.length === 1 ? "Connection selected" : `${selectedEdges.length} connections selected`}
          connectionsOnly
        />
      ) : (
        <FlowDetails />
      )}
    </aside>
  );
}

function ProblemList({ problems }: { problems: Problem[] }) {
  if (problems.length === 0) return null;
  return (
    <ul className="space-y-1.5">
      {problems.map((problem, index) => (
        <li
          key={index}
          className={`flex gap-2 rounded-lg border px-2.5 py-2 text-xs leading-relaxed ${
            problem.level === "error" ? "border-bad/40 text-bad" : "border-warn/40 text-warn"
          }`}
        >
          {problem.level === "error" ? (
            <CircleAlert size={14} className="mt-0.5 shrink-0" />
          ) : (
            <TriangleAlert size={14} className="mt-0.5 shrink-0" />
          )}
          <span>{problem.message}</span>
        </li>
      ))}
    </ul>
  );
}

function BlockSettings({ node }: { node: FlowNode }) {
  const dispatch = useAppDispatch();
  const spec = CATALOG[node.type];
  const problems = useAppSelector(selectProblemsByNode).get(node.id) ?? [];
  const config = node.config as Record<string, unknown>;

  return (
    <>
      <header className="flex items-center gap-2.5 border-b border-line p-3">
        <BlockIcon type={node.type} size={32} />
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-fg">{spec.title}</h2>
          <p className="truncate text-xs text-muted">{spec.summary}</p>
        </div>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        <ProblemList problems={problems} />
        {/* Keyed by name, so the draft resets when a rename is undone. */}
        <NameField key={node.name} node={node} />
        {spec.fields.map((field) =>
          field.showWhen && !field.showWhen(config) ? null : (
            <Field
              key={field.key}
              spec={field}
              value={config[field.key]}
              onChange={(value) => dispatch(flowActions.settingChanged({ nodeId: node.id, key: field.key, value }))}
            />
          ),
        )}
      </div>

      <footer className="flex items-center gap-2 border-t border-line p-3">
        <Button size="sm" onClick={() => dispatch(duplicateSelection())}>
          <CopyPlus size={13} /> Duplicate
        </Button>
        <Button size="sm" variant="danger" onClick={() => dispatch(flowActions.selectionDeleted())}>
          <Trash2 size={13} /> Delete
        </Button>
      </footer>
    </>
  );
}

/**
 * A block's name is typed into a draft and applied when the field is left or
 * Enter is pressed, because a half-typed name would break the references that
 * point at the block.
 */
function NameField({ node }: { node: FlowNode }) {
  const dispatch = useAppDispatch();
  const id = useId();
  const [draft, setDraft] = useState(node.name);
  const [error, setError] = useState<string | null>(null);

  const commit = () => {
    if (draft.trim() === node.name) {
      setDraft(node.name);
      setError(null);
      return;
    }
    setError(dispatch(renameBlock(node.id, draft)));
  };

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-muted">
        Name
      </label>
      <input
        id={id}
        type="text"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
          if (event.key === "Escape") {
            setDraft(node.name);
            setError(null);
          }
        }}
        spellCheck={false}
        autoComplete="off"
        aria-invalid={error !== null}
        aria-describedby={`${id}-help`}
        className={`${INPUT} h-8 font-mono text-[12.5px] ${error ? "border-bad" : ""}`}
      />
      <p id={`${id}-help`} className={`mt-1 text-[11px] leading-relaxed ${error ? "text-bad" : "text-faint"}`}>
        {error ?? (
          <>
            Other blocks read this one as <code className="font-mono">{`{{ steps.${node.name} }}`}</code>
          </>
        )}
      </p>
    </div>
  );
}

function SelectionActions({ title, connectionsOnly = false }: { title: string; connectionsOnly?: boolean }) {
  const dispatch = useAppDispatch();
  return (
    <div className="space-y-3 p-3">
      <h2 className="text-sm font-semibold text-fg">{title}</h2>
      <div className="flex items-center gap-2">
        {!connectionsOnly && (
          <Button size="sm" onClick={() => dispatch(duplicateSelection())}>
            <CopyPlus size={13} /> Duplicate
          </Button>
        )}
        <Button size="sm" variant="danger" onClick={() => dispatch(flowActions.selectionDeleted())}>
          <Trash2 size={13} /> Delete
        </Button>
      </div>
      <p className="text-xs leading-relaxed text-muted">
        <Kbd>Delete</Kbd> removes the selection. <Kbd>Ctrl</Kbd> <Kbd>Z</Kbd> brings it back.
      </p>
    </div>
  );
}

function FlowDetails() {
  const dispatch = useAppDispatch();
  const name = useAppSelector(selectFlowName);
  const description = useAppSelector(selectFlowDescription);
  const blockCount = useAppSelector(selectNodes).length;
  const connectionCount = useAppSelector(selectEdges).length;
  const descriptionId = useId();

  return (
    <>
      <header className="border-b border-line p-3">
        <h2 className="truncate text-sm font-semibold text-fg">{name}</h2>
        <p className="text-xs text-muted">
          {blockCount} {blockCount === 1 ? "block" : "blocks"}, {connectionCount}{" "}
          {connectionCount === 1 ? "connection" : "connections"}
        </p>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        <div>
          <label htmlFor={descriptionId} className="mb-1 block text-xs font-medium text-muted">
            Description
          </label>
          <textarea
            id={descriptionId}
            value={description}
            onChange={(event) => dispatch(flowActions.descriptionChanged(event.target.value.slice(0, 400)))}
            placeholder="What does this flow do?"
            rows={3}
            className={`${INPUT} resize-y py-1.5 leading-relaxed`}
          />
        </div>

        <div className="rounded-lg border border-line p-3 text-xs leading-relaxed text-muted">
          <p className="mb-2 font-medium text-fg">Getting around</p>
          <ul className="space-y-1.5">
            <li>Select a block to edit its settings here.</li>
            <li>Drag from the dot on a block&apos;s right edge to connect it.</li>
            <li>
              <Kbd>Ctrl</Kbd> <Kbd>Z</Kbd> undo, <Kbd>Ctrl</Kbd> <Kbd>Y</Kbd> redo
            </li>
            <li>
              <Kbd>Ctrl</Kbd> <Kbd>C</Kbd> / <Kbd>V</Kbd> copy and paste, <Kbd>Ctrl</Kbd> <Kbd>D</Kbd> duplicate
            </li>
            <li>
              <Kbd>Shift</Kbd> + drag selects several blocks
            </li>
          </ul>
        </div>
      </div>
    </>
  );
}
