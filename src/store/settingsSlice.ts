import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { NO_AI, storeAiConfig, type AiConfig } from "@/settings/ai";
import type { AppThunk } from "./store";

// Settings that belong to the visitor, not to a flow: which model the AI step
// uses. They are kept in the browser and never sent to Flowboard's server.

export type SettingsState = {
  ai: AiConfig;
  /** Whether the settings dialog is showing. */
  open: boolean;
};

const initialState: SettingsState = { ai: NO_AI, open: false };

const settingsSlice = createSlice({
  name: "settings",
  initialState,
  reducers: {
    aiConfigSet(state, action: PayloadAction<AiConfig>) {
      state.ai = action.payload;
    },
    settingsOpened(state) {
      state.open = true;
    },
    settingsClosed(state) {
      state.open = false;
    },
  },
});

export const settingsActions = settingsSlice.actions;
export const settingsReducer = settingsSlice.reducer;

/** Apply new AI settings and remember them in the browser. */
export const saveAiConfig =
  (config: AiConfig): AppThunk =>
  (dispatch, _getState, { settingsStore }) => {
    dispatch(settingsActions.aiConfigSet(config));
    if (settingsStore) storeAiConfig(settingsStore, config);
  };
