import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { runActions } from "./runSlice";

// How the editor's panels are arranged. Not saved with the flow.

export type BottomTab = "run" | "problems";

export type UiState = {
  /** The panel under the canvas, or null when it is closed. */
  bottomTab: BottomTab | null;
};

const initialState: UiState = { bottomTab: null };

const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    bottomTabSet(state, action: PayloadAction<BottomTab | null>) {
      state.bottomTab = action.payload;
    },
    bottomTabToggled(state, action: PayloadAction<BottomTab>) {
      state.bottomTab = state.bottomTab === action.payload ? null : action.payload;
    },
  },
  extraReducers: (builder) => {
    // Starting a run brings the run panel up.
    builder.addCase(runActions.runBegan, (state) => {
      state.bottomTab = "run";
    });
  },
});

export const uiActions = uiSlice.actions;
export const uiReducer = uiSlice.reducer;
