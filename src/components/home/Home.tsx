"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Workflow } from "lucide-react";
import { createFlow } from "@/flow/document";
import { useDeleteFlowMutation, useListFlowsQuery, useSaveFlowMutation } from "@/store/api";
import { ThemeToggle } from "../ThemeToggle";
import { useToast } from "../toast";
import { Button, IconButton } from "../ui";

const WHEN = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

export function Home() {
  const router = useRouter();
  const { showToast } = useToast();
  const { data: flows, isLoading, error } = useListFlowsQuery();
  const [saveFlow, { isLoading: creating }] = useSaveFlowMutation();
  const [deleteFlow] = useDeleteFlowMutation();

  const createNew = async () => {
    const flow = createFlow("Untitled flow");
    try {
      await saveFlow(flow).unwrap();
      router.push(`/flows/${flow.id}`);
    } catch {
      showToast("The flow could not be created. Your browser's storage may be full or switched off.", { tone: "bad" });
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-5 py-6">
      <header className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-accent-fg">
          <Workflow size={18} />
        </span>
        <span className="text-lg font-semibold tracking-tight">Flowboard</span>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </header>

      <main className="mt-10">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Your flows</h1>
            <p className="mt-1 text-sm text-muted">Saved in this browser. Nothing is sent to a server.</p>
          </div>
          <Button variant="primary" onClick={createNew} disabled={creating}>
            <Plus size={15} /> New flow
          </Button>
        </div>

        <div className="mt-6">
          {isLoading || (!flows && !error) ? (
            <p className="text-sm text-muted" aria-busy="true">
              Loading your flows…
            </p>
          ) : error ? (
            <p className="text-sm text-bad">Your flows could not be read from this browser&apos;s storage.</p>
          ) : flows && flows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line-strong p-10 text-center">
              <p className="font-medium">No flows yet</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
                A flow is a chain of blocks: fetch something, check it, shape it, hand it to a model.
              </p>
              <Button variant="primary" className="mt-4" onClick={createNew} disabled={creating}>
                <Plus size={15} /> Create your first flow
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
              {flows?.map((flow) => (
                <li key={flow.id} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2">
                  <Link href={`/flows/${flow.id}`} className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{flow.name}</span>
                    <span className="block truncate text-xs text-muted">
                      {flow.blockCount} {flow.blockCount === 1 ? "block" : "blocks"} · edited{" "}
                      {WHEN.format(new Date(flow.updatedAt))}
                      {flow.description ? ` · ${flow.description}` : ""}
                    </span>
                  </Link>
                  <IconButton label={`Delete ${flow.name}`} onClick={() => deleteFlow(flow.id)}>
                    <Trash2 size={15} />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
