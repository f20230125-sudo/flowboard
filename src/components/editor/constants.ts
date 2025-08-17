import { createContext } from "react";

/** The type tag a block carries while it is dragged from the palette onto the canvas. */
export const BLOCK_DRAG_TYPE = "application/x-flowboard-block";

/** True on the home page's stage, where the same blocks are drawn but cannot be edited. */
export const ReadOnlyContext = createContext(false);
