"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, CircleAlert, ExternalLink, Eye, EyeOff, LoaderCircle, X } from "lucide-react";
import { AI_PRESETS, AI_PROVIDERS, NO_AI, listModels, presetConfig, type AiConfig, type AiProvider, type KeyCheck } from "@/settings/ai";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { selectAiConfig, selectSettingsOpen } from "@/store/selectors";
import { saveAiConfig, settingsActions } from "@/store/settingsSlice";
import { useToast } from "./toast";
import { Button, IconButton } from "./ui";

const INPUT =
  "h-9 w-full rounded-lg border border-line bg-bg px-2.5 text-[13px] text-fg placeholder:text-faint transition-colors hover:border-line-strong";

/** Where the visitor chooses which model the AI step uses. */
export function SettingsDialog() {
  const open = useAppSelector(selectSettingsOpen);
  // Mounted fresh each time it opens, so the form starts from what is saved.
  return open ? <SettingsForm /> : null;
}

function SettingsForm() {
  const dispatch = useAppDispatch();
  const { showToast } = useToast();
  const saved = useAppSelector(selectAiConfig);
  const dialog = useRef<HTMLDialogElement>(null);
  const ids = { provider: useId(), key: useId(), address: useId(), model: useId(), models: useId() };

  const [draft, setDraft] = useState<AiConfig>(saved);
  const [showKey, setShowKey] = useState(false);
  const [check, setCheck] = useState<KeyCheck | "checking" | null>(null);

  // The browser's own modal dialog: it traps focus and closes on Escape.
  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const close = () => dispatch(settingsActions.settingsClosed());
  const change = (patch: Partial<AiConfig>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setCheck(null);
  };

  const preset = draft.provider === "none" ? null : AI_PRESETS[draft.provider];
  const custom = draft.provider === "custom";
  const complete =
    draft.provider === "none" ||
    (draft.baseUrl.trim() !== "" && draft.model.trim() !== "" && (custom || draft.apiKey.trim() !== ""));

  const runCheck = async () => {
    setCheck("checking");
    setCheck(await listModels(draft));
  };

  const save = () => {
    dispatch(saveAiConfig(draft.provider === "none" ? NO_AI : draft));
    showToast(draft.provider === "none" ? "AI steps will return their sample replies." : `AI steps will use ${draft.model}.`);
    close();
  };

  return (
    <dialog
      ref={dialog}
      onClose={close}
      // A click on the dimmed area around the dialog closes it.
      onClick={(event) => {
        if (event.target === dialog.current) dialog.current?.close();
      }}
      aria-labelledby={`${ids.provider}-title`}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-0 text-fg shadow-panel backdrop:bg-black/50"
    >
      <form
        method="dialog"
        onSubmit={(event) => {
          event.preventDefault();
          if (complete) save();
        }}
      >
        <header className="flex items-start gap-3 border-b border-line p-4">
          <div className="min-w-0 flex-1">
            <h2 id={`${ids.provider}-title`} className="text-base font-semibold">
              Language model
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              AI steps call the model you choose here with your own key. The key is kept in this browser and sent straight
              to the provider, never to Flowboard. With no model, AI steps return their sample reply.
            </p>
          </div>
          <IconButton label="Close" onClick={() => dialog.current?.close()}>
            <X size={16} />
          </IconButton>
        </header>

        <div className="space-y-4 p-4">
          <div>
            <label htmlFor={ids.provider} className="mb-1 block text-xs font-medium text-muted">
              Provider
            </label>
            <select
              id={ids.provider}
              value={draft.provider}
              onChange={(event) => {
                // Keep a key already typed when switching between providers.
                setDraft(presetConfig(event.target.value as AiProvider, draft.apiKey));
                setCheck(null);
              }}
              className={`${INPUT} cursor-pointer`}
            >
              {AI_PROVIDERS.map((provider) => (
                <option key={provider} value={provider}>
                  {provider === "none" ? "None (use sample replies)" : AI_PRESETS[provider].label}
                </option>
              ))}
            </select>
            {preset && (
              <p className="mt-1 text-[11px] leading-relaxed text-faint">
                {preset.note}{" "}
                {preset.keyPage && (
                  <a href={preset.keyPage} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-accent underline">
                    Get a key <ExternalLink size={10} />
                  </a>
                )}
              </p>
            )}
          </div>

          {preset && (
            <>
              {custom && (
                <div>
                  <label htmlFor={ids.address} className="mb-1 block text-xs font-medium text-muted">
                    Address
                  </label>
                  <input
                    id={ids.address}
                    type="url"
                    value={draft.baseUrl}
                    onChange={(event) => change({ baseUrl: event.target.value })}
                    placeholder="http://localhost:11434/v1"
                    spellCheck={false}
                    className={`${INPUT} font-mono text-[12.5px]`}
                  />
                </div>
              )}

              <div>
                <label htmlFor={ids.key} className="mb-1 block text-xs font-medium text-muted">
                  API key{custom && " (leave empty if the service needs none)"}
                </label>
                <div className="flex gap-1.5">
                  <input
                    id={ids.key}
                    type={showKey ? "text" : "password"}
                    value={draft.apiKey}
                    onChange={(event) => change({ apiKey: event.target.value })}
                    autoComplete="off"
                    spellCheck={false}
                    className={`${INPUT} font-mono text-[12.5px]`}
                  />
                  <IconButton label={showKey ? "Hide the key" : "Show the key"} className="h-9 w-9" onClick={() => setShowKey(!showKey)}>
                    {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                  </IconButton>
                </div>
              </div>

              <div>
                <label htmlFor={ids.model} className="mb-1 block text-xs font-medium text-muted">
                  Model
                </label>
                <div className="flex gap-1.5">
                  <input
                    id={ids.model}
                    type="text"
                    value={draft.model}
                    onChange={(event) => setDraft((current) => ({ ...current, model: event.target.value }))}
                    list={ids.models}
                    spellCheck={false}
                    autoComplete="off"
                    className={`${INPUT} font-mono text-[12.5px]`}
                  />
                  <Button className="h-9" onClick={() => void runCheck()} disabled={check === "checking" || draft.baseUrl.trim() === ""}>
                    {check === "checking" ? <LoaderCircle size={13} className="animate-spin" /> : null}
                    Check key
                  </Button>
                </div>
                <datalist id={ids.models}>
                  {check && check !== "checking" && check.ok && check.models.map((model) => <option key={model} value={model} />)}
                </datalist>

                <p className="mt-1.5 min-h-4 text-[11px] leading-relaxed" role="status">
                  {check && check !== "checking" && check.ok && (
                    <span className="flex items-start gap-1.5 text-ok">
                      <Check size={12} strokeWidth={3} className="mt-0.5 shrink-0" />
                      <span>
                        The key works. It can use {check.models.length} {check.models.length === 1 ? "model" : "models"}; start
                        typing in the Model field to pick one.
                        {draft.model.trim() !== "" && !check.models.includes(draft.model.trim()) && (
                          <span className="text-warn"> “{draft.model.trim()}” is not in that list.</span>
                        )}
                      </span>
                    </span>
                  )}
                  {check && check !== "checking" && !check.ok && (
                    <span className="flex items-start gap-1.5 text-bad">
                      <CircleAlert size={12} className="mt-0.5 shrink-0" /> {check.message}
                    </span>
                  )}
                  {!check && (
                    <span className="text-faint">
                      Model names change often. “Check key” asks the provider which ones your key can use, at no cost.
                    </span>
                  )}
                </p>
              </div>
            </>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-line p-4">
          <Button onClick={() => dialog.current?.close()}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!complete}>
            Save
          </Button>
        </footer>
      </form>
    </dialog>
  );
}
