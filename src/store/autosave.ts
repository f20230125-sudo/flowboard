import { saveNow } from "./editorThunks";
import type { AppStartListening } from "./store";

export const AUTOSAVE_DELAY_MS = 600;

/**
 * Save the flow shortly after it stops changing.
 *
 * Every change to the document raises `revision`. Each raise starts a short
 * wait and cancels the wait of the change before it, so a burst of edits (a
 * drag, a typed sentence) leads to one save, not hundreds.
 */
export function startAutosave(startListening: AppStartListening): void {
  startListening({
    predicate: (_action, state, previous) =>
      state.flow.status === "ready" &&
      state.flow.revision !== previous.flow.revision &&
      state.flow.revision > state.flow.savedRevision,
    effect: async (_action, listener) => {
      listener.cancelActiveListeners();
      await listener.delay(AUTOSAVE_DELAY_MS);
      await listener.dispatch(saveNow());
    },
  });
}
