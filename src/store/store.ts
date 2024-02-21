import {
  combineReducers,
  configureStore,
  createListenerMiddleware,
  type ThunkAction,
  type TypedStartListening,
  type UnknownAction,
} from "@reduxjs/toolkit";
import { api, type Extra } from "./api";
import { startAutosave } from "./autosave";
import { flowReducer } from "./flowSlice";
import { runReducer } from "./runSlice";
import { settingsReducer } from "./settingsSlice";
import { uiReducer } from "./uiSlice";

const rootReducer = combineReducers({
  flow: flowReducer,
  run: runReducer,
  settings: settingsReducer,
  ui: uiReducer,
  [api.reducerPath]: api.reducer,
});

export type RootState = ReturnType<typeof rootReducer>;

/**
 * Build a store. The repository is passed in, so the app hands it the
 * browser's storage and a test hands it one that lives in memory. `preloaded`
 * carries what the browser remembered from the last visit.
 */
export function makeStore(extra: Extra, preloaded: Partial<RootState> = {}) {
  const listeners = createListenerMiddleware({ extra });
  startAutosave(listeners.startListening as AppStartListening);

  return configureStore({
    reducer: rootReducer,
    preloadedState: preloaded as RootState,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ thunk: { extraArgument: extra } })
        .prepend(listeners.middleware)
        .concat(api.middleware),
  });
}

export type AppStore = ReturnType<typeof makeStore>;
export type AppDispatch = AppStore["dispatch"];
export type AppThunk<Result = void> = ThunkAction<Result, RootState, Extra, UnknownAction>;
export type AppStartListening = TypedStartListening<RootState, AppDispatch, Extra>;
