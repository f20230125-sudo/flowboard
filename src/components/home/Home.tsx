"use client";

import { useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Upload } from "lucide-react";
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
import { Wordmark } from "../Logo";
import { ThemeToggle } from "../ThemeToggle";
import { useToast } from "../toast";
import { Button, IconButton } from "../ui";
import { Stage } from "./Stage";

const WHEN = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

const PAGE = "w-full max-w-[1440px] min-w-0 px-[var(--page-x)]";

export function Home() {
  const router = useRouter();
  const { showToast } = useToast();
  const { data: flows, isLoading, error } = useListFlowsQuery();
  const [saveFlow] = useSaveFlowMutation();
  const [deleteFlow] = useDeleteFlowMutation();
  const [fetchFlow] = useLazyGetFlowQuery();
  const [fetchTemplate] = useLazyGetTemplateQuery();
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

  /** Save a copy of a ready-made flow and open it in the editor. */
  const startFromTemplate = async (id: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const template = await fetchTemplate(id, true).unwrap();
      // Check what came over the wire like any other flow from outside.
      const parsed = parseFlow(template.flow);
      if (!parsed.ok) throw new Error(parsed.error);
      await open(copyFlow(parsed.flow, template.name));
    } catch {
      showToast("That template could not be loaded. Check your connection and try again.", { tone: "bad" });
      setBusy(false);
    }
  };

  const createBlank = () => {
    if (busy) return;
    setBusy(true);
    void open(createFlow("Untitled flow"));
  };

  const fileInput = useRef<HTMLInputElement>(null);
  const chooseFile = () => {
    if (!busy) fileInput.current?.click();
  };

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

  const actions = (
    <>
      <Button className="lg:h-9" size="lg" onClick={createBlank} disabled={busy}>
        <Plus size={15} aria-hidden /> New flow
      </Button>
      <Button className="lg:h-9" size="lg" onClick={chooseFile} disabled={busy}>
        <Upload size={14} aria-hidden /> Import a file
      </Button>
    </>
  );

  return (
    <div className="flex min-h-dvh w-full min-w-0 flex-1 flex-col">
      <header className="border-b border-rule">
        <div className={`${PAGE} flex h-14 items-center`}>
          <Wordmark />
          <div className="ml-auto flex items-center gap-2">
            {/* The two ways to start from nothing sit here on a wide screen, and under the lists on a phone. */}
            <div className="hidden items-center gap-2 lg:flex">{actions}</div>
            <ThemeToggle />
          </div>
        </div>
      </header>
      {/* One file picker, whichever of the two buttons opens it. */}
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        className="sr-only"
        tabIndex={-1}
        aria-label="Choose a flow file to import"
        onChange={(event) => void importFile(event)}
      />

      <main id="main" tabIndex={-1} className="min-w-0 flex-1">
        <section aria-labelledby="hero-title" className={`${PAGE} pt-10`}>
          <h1
            id="hero-title"
            className="text-[32px] font-extrabold leading-[1.02] tracking-[-0.025em] lg:text-[44px]"
          >
            <span className="block">Connect blocks.</span> <span className="block">Press Run.</span>
          </h1>
          <p className="mt-3 max-w-[62ch] text-base leading-normal text-ink-2">
            Every step shows what it received and what it returned.
          </p>
        </section>

        <Stage onEdit={() => void startFromTemplate("heat-check")} busy={busy} />

        <TemplateList busy={busy} onStart={(id) => void startFromTemplate(id)} />

        <section aria-labelledby="flows-title" className={`${PAGE} pt-14`}>
          <h2 id="flows-title" className="text-xl font-bold tracking-tight">
            Your flows
          </h2>
          <p className="mt-1 text-[13px] text-ink-2">Saved in this browser. Flows are not uploaded.</p>

          <div className="mt-4">
            {isLoading || (!flows && !error) ? (
              <p className="text-[13px] text-ink-2" aria-busy="true">
                Loading your flows…
              </p>
            ) : error ? (
              <p className="text-[13px] font-medium text-fail">Your flows could not be read from this browser&apos;s storage.</p>
            ) : flows && flows.length === 0 ? (
              <p className="max-w-[62ch] text-[15px] leading-normal text-ink-2">
                No flows yet. Start from a template above, or choose New flow.
              </p>
            ) : (
              <ul className="border-t border-rule">
                {flows?.map((flow) => (
                  <li key={flow.id} className="flex items-center gap-3 border-b border-rule">
                    <Link href={`/flows/${flow.id}`} className="group min-h-14 min-w-0 flex-1 py-2.5">
                      <span className="block truncate text-[15px] font-bold underline-offset-4 group-hover:underline">{flow.name}</span>
                      <span className="block truncate text-[13px] text-ink-2">
                        {flow.blockCount} {flow.blockCount === 1 ? "block" : "blocks"}, edited {WHEN.format(new Date(flow.updatedAt))}
                        {flow.description ? `, ${flow.description}` : ""}
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

          <div className="mt-6 flex flex-wrap gap-2 lg:hidden">{actions}</div>
        </section>
      </main>

      <footer className="mt-14 border-t border-rule">
        <p className={`${PAGE} py-3 text-[13px] text-ink-3`}>
          Built with Next.js, React and Redux Toolkit.{" "}
          <a
            className="inline-flex min-h-8 items-center font-medium text-ink-2 underline hover:text-ink"
            href="https://github.com/f20230125-sudo/flowboard"
          >
            Source on GitHub
          </a>
        </p>
      </footer>
    </div>
  );
}

/** The ready-made flows, read from this app's own REST API, as ruled rows. */
function TemplateList({ busy, onStart }: { busy: boolean; onStart: (id: string) => void }) {
  const { data: templates, isLoading, error, refetch } = useListTemplatesQuery();

  return (
    <section aria-labelledby="templates-title" className={`${PAGE} pt-14`}>
      <h2 id="templates-title" className="text-xl font-bold tracking-tight">
        Start from a template
      </h2>
      <p className="mt-1 text-[13px] text-ink-2">Each one runs as it is. No key, no account.</p>

      <div className="mt-4">
        {isLoading ? (
          <p className="text-[13px] text-ink-2" aria-busy="true">
            Loading templates…
          </p>
        ) : error || !templates ? (
          <div>
            <p className="text-[13px] font-medium text-fail">The templates could not be loaded.</p>
            <Button size="sm" className="mt-2" onClick={() => void refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          <ul className="border-t border-rule">
            {templates.map((template) => (
              <li key={template.id} className="border-b border-rule">
                <button
                  type="button"
                  aria-disabled={busy || undefined}
                  onClick={() => onStart(template.id)}
                  className="group grid min-h-[60px] w-full gap-x-6 gap-y-1 py-3 text-left aria-disabled:cursor-wait aria-disabled:opacity-60 lg:grid-cols-[15rem_minmax(0,1fr)_16rem_5rem] lg:items-center"
                >
                  <span className="text-[17px] font-bold underline-offset-4 group-hover:underline lg:text-[15px]">{template.name}</span>
                  <span className="text-[13.5px] leading-snug text-ink-2">{template.description}</span>
                  <span className="text-[12.5px] text-ink-2">Uses {template.tags.join(", ")}</span>
                  <span className="font-mono text-[12.5px] text-ink-2 lg:text-right">{template.blockCount} blocks</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
