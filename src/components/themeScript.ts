// Shared by the server layout and the client theme code, so it must not be a
// "use client" file: the layout needs the real string, not a reference to it.

export const THEME_STORAGE_KEY = "flowboard:theme";

/**
 * Runs in <head> before anything is drawn, so the page never flashes the wrong
 * theme. Uses the saved choice, or the system's setting when there is none.
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;
