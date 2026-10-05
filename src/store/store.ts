import {
  configureStore,
  createListenerMiddleware,
  type ThunkAction,
  type TypedStartListening,
  type UnknownAction,
} from "@reduxjs/toolkit";
import { api, type Extra } from "./api";
import { startAutosave } from "./autosave";
import { flowReducer } from "./flowSlice";

const reducer = {
  flow: flowReducer,
  [api.reducerPath]: api.reducer,
};

/**
 * Build a store. The repository is passed in, so the app hands it the
 * browser's storage and a test hands it one that lives in memory.
 */
export function makeStore(extra: Extra) {
  const listeners = createListenerMiddleware({ extra });
  startAutosave(listeners.startListening as AppStartListening);

  return configureStore({
    reducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ thunk: { extraArgument: extra } })
        .prepend(listeners.middleware)
        .concat(api.middleware),
  });
}

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
export type AppThunk<Result = void> = ThunkAction<Result, RootState, Extra, UnknownAction>;
export type AppStartListening = TypedStartListening<RootState, AppDispatch, Extra>;
