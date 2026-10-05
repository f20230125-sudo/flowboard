"use client";

import { useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Plus, Trash2, Upload, Workflow } from "lucide-react";
import { copyFlow, createFlow } from "@/flow/document";
import { parseFlow, type FlowDocument } from "@/flow/schema";
import {
  useDeleteFlowMutation,
  useLazyGetFlowQuery,
  useLazyGetTemplateQuery,
  useListFlowsQuery,
  useListTemplatesQuery,
  useSaveFlowMutation,
} from "@/store/api";
import { ThemeToggle } from "../ThemeToggle";
import { useToast } from "../toast";
import { Button, IconButton } from "../ui";

const WHEN = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

export function Home() {
  const router = useRouter();
  const { showToast } = useToast();
  const { data: flows, isLoading, error } = useListFlowsQuery();
  const [saveFlow] = useSaveFlowMutation();
  const [deleteFlow] = useDeleteFlowMutation();
  const [fetchFlow] = useLazyGetFlowQuery();
  const [busy, setBusy] = useState(false);

  /** Save a new flow and open it in the editor. */
  const open = async (flow: FlowDocument) => {
    try {
      await saveFlow(flow).unwrap();
      router.push(`/flows/${flow.id}`);
    } catch {
      showToast("The flow could not be saved. Your browser's storage may be full or switched off.", { tone: "bad" });
      setBusy(false);
    }
  };

  const createBlank = () => {
    setBusy(true);
    void open(createFlow("Untitled flow"));
  };

  const fileInput = useRef<HTMLInputElement>(null);

  /** Open a flow exported earlier. It is checked like anything else from outside. */
  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // so the same file can be chosen again
    if (!file) return;
    if (file.size > 2_000_000) {
      showToast("That file is too large to be a flow.", { tone: "bad" });
      return;
    }
    let data: unknown;
    try {
      data = JSON.parse(await file.text());
    } catch {
      showToast(`${file.name} is not a JSON file.`, { tone: "bad" });
      return;
    }
    const parsed = parseFlow(data);
    if (!parsed.ok) {
      // The parser's message can run to several lines. The first says enough.
      showToast(parsed.error.split(/\r?\n/)[0], { tone: "bad" });
      return;
    }
    setBusy(true);
    void open(copyFlow(parsed.flow, parsed.flow.name));
  };

  const remove = async (flow: { id: string; name: string }) => {
    // Keep a copy so the delete can be undone from the toast.
    const copy = await fetchFlow(flow.id).unwrap().catch(() => null);
    await deleteFlow(flow.id);
    showToast(`Deleted “${flow.name}”.`, copy ? { action: { label: "Undo", run: () => void saveFlow(copy) } } : {});
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-5 py-6">
      <header className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-accent-fg">
          <Workflow size={18} />
        </span>
        <span className="text-lg font-semibold tracking-tight">Flowboard</span>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </header>

      <main className="mt-10 space-y-12">
        <section aria-labelledby="hero-title">
          <h1 id="hero-title" className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
            Build a workflow by connecting blocks, then watch it run.
          </h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted">
            Call an API, check the answer, shape the data, hand it to a language model. Press Run and every step shows what
            it received and what it returned.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Button variant="primary" className="h-9 px-4 text-sm" onClick={createBlank} disabled={busy}>
              <Plus size={16} /> New flow
            </Button>
            <Button className="h-9 px-4 text-sm" onClick={() => fileInput.current?.click()} disabled={busy}>
              <Upload size={15} /> Import a file
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept=".json,application/json"
              className="sr-only"
              tabIndex={-1}
              aria-label="Choose a flow file to import"
              onChange={(event) => void importFile(event)}
            />
          </div>
        </section>

        <TemplateGallery busy={busy} onStart={() => setBusy(true)} onFail={() => setBusy(false)} onReady={open} />

        <section aria-labelledby="flows-title">
          <h2 id="flows-title" className="text-lg font-semibold tracking-tight">
            Your flows
          </h2>
          <p className="mt-1 text-sm text-muted">Saved in this browser. Nothing is sent to a server.</p>

          <div className="mt-4">
            {isLoading || (!flows && !error) ? (
              <p className="text-sm text-muted" aria-busy="true">
                Loading your flows…
              </p>
            ) : error ? (
              <p className="text-sm text-bad">Your flows could not be read from this browser&apos;s storage.</p>
            ) : flows && flows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line-strong px-6 py-8 text-center">
                <p className="font-medium">No flows yet</p>
                <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
                  Start from a template above, or create an empty flow and add blocks yourself.
                </p>
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
                    <IconButton label={`Delete ${flow.name}`} onClick={() => void remove(flow)}>
                      <Trash2 size={15} />
                    </IconButton>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </main>

      <footer className="mt-12 border-t border-line pt-4 text-xs text-faint">
        Built with Next.js, React and Redux Toolkit.{" "}
        <a className="underline hover:text-fg" href="https://github.com/f20230125-sudo/flowboard">
          Source on GitHub
        </a>
      </footer>
    </div>
  );
}

type GalleryProps = {
  busy: boolean;
  onStart: () => void;
  onFail: () => void;
  onReady: (flow: FlowDocument) => Promise<void>;
};

/** The ready-made flows, read from this app's own REST API. */
function TemplateGallery({ busy, onStart, onFail, onReady }: GalleryProps) {
  const { showToast } = useToast();
  const { data: templates, isLoading, error, refetch } = useListTemplatesQuery();
  const [fetchTemplate] = useLazyGetTemplateQuery();

  const use = async (id: string) => {
    onStart();
    try {
      const template = await fetchTemplate(id, true).unwrap();
      // Check what came over the wire like any other flow from outside.
      const parsed = parseFlow(template.flow);
      if (!parsed.ok) throw new Error(parsed.error);
      await onReady(copyFlow(parsed.flow, template.name));
    } catch {
      showToast("That template could not be loaded. Check your connection and try again.", { tone: "bad" });
      onFail();
    }
  };

  return (
    <section aria-labelledby="templates-title">
      <h2 id="templates-title" className="text-lg font-semibold tracking-tight">
        Start from a template
      </h2>
      <p className="mt-1 text-sm text-muted">Each one runs as it is. No key, no account.</p>

      <div className="mt-4">
        {isLoading ? (
          <ul className="grid gap-3 sm:grid-cols-2" aria-busy="true" aria-label="Loading templates">
            {[0, 1, 2, 3].map((slot) => (
              <li key={slot} className="h-[132px] animate-pulse rounded-xl border border-line bg-surface" />
            ))}
          </ul>
        ) : error || !templates ? (
          <div className="rounded-xl border border-line bg-surface p-4 text-sm">
            <p className="text-bad">The templates could not be loaded.</p>
            <Button size="sm" className="mt-2" onClick={() => void refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {templates.map((template) => (
              <li key={template.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void use(template.id)}
                  className="group flex h-full w-full flex-col rounded-xl border border-line bg-surface p-4 text-left transition-colors hover:border-accent disabled:cursor-wait disabled:opacity-60"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-[15px] font-semibold">{template.name}</span>
                    <ArrowRight size={16} className="text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
                  </span>
                  <span className="mt-1 text-sm leading-relaxed text-muted">{template.description}</span>
                  <span className="mt-3 flex flex-wrap items-center gap-1.5 pt-1">
                    {template.tags.map((tag) => (
                      <span key={tag} className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-muted">
                        {tag}
                      </span>
                    ))}
                    <span className="ml-auto text-[11px] text-faint">{template.blockCount} blocks</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
