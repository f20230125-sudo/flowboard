// Draws docs/architecture.svg, the diagram in the README.
//
//   npm run diagram
//
// The picture is plain SVG with its own background, so it reads the same on
// GitHub's light and dark themes and anywhere else it is shown. Every label is
// placed by hand below; the chips() helper stops the script if one would not
// fit, so a changed label cannot silently spill out of its box.

import fs from "node:fs";

const W = 1280;
const H = 784;

const C = {
  bg: "#0b0d10",
  panel: "#101318",
  panelLine: "#262b34",
  box: "#161a20",
  boxLine: "#2c323d",
  chip: "#20252d",
  chipLine: "#363d49",
  text: "#e8eaee",
  muted: "#aab2bd",
  faint: "#8b94a1",
  accent: "#9090f8",
  blue: "#6aa8ff",
  violet: "#b197fc",
  amber: "#f5b942",
  green: "#3ddc97",
  rose: "#ff7a9c",
};

const SANS = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";

// Sizes are on the large side on purpose: a README shows this at about two
// thirds of its drawn width.
const NOTE = 12.5;

const esc = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const out = [];
const add = (svg) => out.push(svg);

function text(x, y, value, { size = NOTE, fill = C.text, weight = 400, anchor = "start", mono = false, spacing } = {}) {
  add(
    `<text x="${x}" y="${y}" font-family="${mono ? MONO : SANS}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"${
      spacing ? ` letter-spacing="${spacing}"` : ""
    }>${esc(value)}</text>`,
  );
}

/** A group of related boxes, with a small label in the corner. */
function panel(x, y, w, h, label, note) {
  add(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="${C.panel}" stroke="${C.panelLine}"/>`);
  text(x + 24, y + 30, label, { size: 11.5, fill: C.accent, weight: 700, spacing: "1.2" });
  if (note) text(x + w - 24, y + 30, note, { fill: C.faint, anchor: "end" });
}

/** One part of the system: a title, a note on what it is made of, and a coloured edge. */
function box(x, y, w, h, title, note, tone) {
  add(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${C.box}" stroke="${C.boxLine}"/>`);
  add(`<rect x="${x}" y="${y + 14}" width="4" height="${h - 28}" rx="2" fill="${tone}"/>`);
  if (title) text(x + 20, y + 30, title, { size: 16, weight: 600 });
  if (note) text(x + w - 16, y + 30, note, { fill: C.muted, anchor: "end" });
}

/** Small labelled pills, laid out left to right, one list per row. */
function chips(x, y, maxX, rows) {
  rows.forEach((row, rowIndex) => {
    let at = x;
    for (const label of row) {
      const width = Math.round(label.length * 7.6 + 22);
      if (at + width > maxX) throw new Error(`"${label}" does not fit on its row (ends at ${at + width}, limit ${maxX})`);
      const top = y + rowIndex * 34;
      add(`<rect x="${at}" y="${top}" width="${width}" height="26" rx="13" fill="${C.chip}" stroke="${C.chipLine}"/>`);
      text(at + width / 2, top + 17.5, label, { size: 13, anchor: "middle" });
      at += width + 8;
    }
  });
}

/** A line through the given points, ending in an arrowhead. */
function arrow(points, { color = C.muted, dashed = false, both = false } = {}) {
  const d = points.map(([px, py], index) => `${index === 0 ? "M" : "L"}${px} ${py}`).join(" ");
  const id = color === C.accent ? "head-accent" : color === C.green ? "head-green" : "head";
  add(
    `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round"${dashed ? ' stroke-dasharray="5 5"' : ""} marker-end="url(#${id})"${
      both ? ` marker-start="url(#${id}-start)"` : ""
    }/>`,
  );
}

/** A numbered marker. The same numbers appear on the arrows and in the strip of steps below. */
function badge(x, y, value) {
  const width = value.length > 1 ? 32 : 22;
  add(`<rect x="${x - width / 2}" y="${y - 11}" width="${width}" height="22" rx="11" fill="${C.accent}"/>`);
  text(x, y + 4.5, value, { size: 12, fill: C.bg, weight: 700, anchor: "middle" });
}

// --- Frame ---------------------------------------------------------------------

add(`<rect width="${W}" height="${H}" rx="18" fill="${C.bg}"/>`);
text(40, 54, "How Flowboard works", { size: 24, weight: 700 });
text(
  40,
  81,
  "Building and running a flow happens in your browser. The server serves the pages, the templates and a guarded relay.",
  { size: 14, fill: C.muted },
);

// --- In your browser -----------------------------------------------------------

panel(40, 104, 760, 510, "IN YOUR BROWSER", "TypeScript · React 19 · Next.js 16");

// Screen
box(64, 150, 712, 100, "Screen", "React components", C.blue);
chips(84, 198, 760, [["Block palette", "Canvas", "Settings panel", "Run panel", "Problems list", "Home page"]]);

// Screen <-> State
arrow([[200, 254], [200, 290]]);
text(212, 277, "what you do: drag, connect, type, press Run", { fill: C.muted });
arrow([[540, 290], [540, 254]], { color: C.accent });
badge(563, 272, "5");
text(582, 277, "state, read through selectors", { fill: C.muted });

// State and storage
box(64, 294, 492, 116, "State", "Redux Toolkit store", C.violet);
chips(84, 340, 540, [
  ["flow + undo history", "last run", "settings"],
  ["RTK Query (data)", "autosave listener"],
]);
box(596, 294, 180, 116, "Storage", "this browser", C.faint);
chips(616, 340, 770, [["your flows"], ["your AI key"]]);
arrow([[560, 352], [592, 352]], { both: true });

// State -> rules, State -> engine, engine -> State
arrow([[120, 414], [120, 458]], { color: C.accent });
badge(143, 436, "1");
text(162, 441, "check the flow", { fill: C.muted });

arrow([[466, 414], [466, 458]], { color: C.accent });
badge(430, 436, "2-3");
text(406, 441, "run it", { fill: C.muted, anchor: "end" });

arrow([[530, 458], [530, 414]], { color: C.accent });
badge(553, 436, "4");
text(572, 441, "events: started, finished, failed", { fill: C.muted });

// Flow rules and engine
box(64, 462, 340, 128, "Flow rules", "src/flow · no React", C.amber);
chips(84, 510, 392, [
  ["schema (Zod)", "block catalogue"],
  ["checks before a run", "graph helpers"],
]);
box(436, 462, 340, 128, "Engine", "src/engine · no React", C.green);
chips(456, 510, 766, [
  ["scheduler", "references", "conditions"],
  ["one executor per block"],
]);

// --- Flowboard server ----------------------------------------------------------

panel(880, 104, 360, 262, "FLOWBOARD SERVER", "Next.js on Vercel or Docker");

box(904, 156, 312, 54, "", "", C.blue);
text(924, 179, "GET /api/templates", { size: 13.5, mono: true, weight: 600 });
text(924, 198, "four ready-made flows", { fill: C.muted });

box(904, 220, 312, 72, "", "", C.rose);
text(924, 243, "POST /api/relay", { size: 13.5, mono: true, weight: 600 });
text(924, 262, "listed hosts only · never a private address", { fill: C.muted });
text(924, 279, "no redirects · time, size and rate limits", { fill: C.muted });

box(904, 302, 312, 48, "", "", C.faint);
text(924, 324, "GET /api/health", { size: 13.5, mono: true, weight: 600 });
text(924, 341, "for Docker and Kubernetes probes", { fill: C.muted });

// --- Outside services ----------------------------------------------------------

panel(880, 418, 360, 196, "OUTSIDE SERVICES");

box(904, 468, 312, 56, "", "", C.green);
text(924, 491, "Public REST APIs", { size: 15, weight: 600 });
text(924, 510, "weather, GitHub, exchange rates, any other", { fill: C.muted });

box(904, 538, 312, 56, "", "", C.green);
text(924, 561, "Your AI provider", { size: 15, weight: 600 });
text(924, 580, "Gemini, Groq, OpenAI or a compatible one", { fill: C.muted });

// --- Browser to the right-hand side ---------------------------------------------

// Templates, read with RTK Query
arrow([[780, 183], [900, 183]]);
text(840, 175, "RTK Query", { fill: C.muted, anchor: "middle" });

// HTTP block, straight from the browser
arrow([[780, 508], [900, 508]], { color: C.green });
text(840, 500, "HTTP block", { fill: C.muted, anchor: "middle" });

// HTTP block through the relay, for APIs that refuse browsers
arrow([[780, 478], [856, 478], [856, 256], [900, 256]], { color: C.green, dashed: true });
add(
  `<text transform="translate(848 366) rotate(-90)" font-family="${SANS}" font-size="12" fill="${C.faint}" text-anchor="middle">when an API refuses browsers</text>`,
);
arrow([[1220, 256], [1230, 256], [1230, 496], [1220, 496]], { color: C.green, dashed: true });

// AI step, with the visitor's own key
arrow([[780, 566], [900, 566]], { color: C.green });
text(840, 558, "AI step, your key", { fill: C.muted, anchor: "middle" });

// --- What happens when you press Run ---------------------------------------------

text(40, 648, "What happens when you press Run", { size: 15, weight: 600 });

const steps = [
  ["1", "Check", "One trigger, no loops, valid", "settings and references."],
  ["2", "Schedule", "A block is ready when all", "that feeds it has settled."],
  ["3", "Execute", "Ready blocks run together.", "A Condition takes one side."],
  ["4", "Report", "The engine emits an event", "as each step starts and ends."],
  ["5", "Draw", "The store records it; only", "that block is drawn again."],
];
steps.forEach(([number, title, first, second], index) => {
  const x = 40 + index * 244;
  add(`<rect x="${x}" y="662" width="224" height="94" rx="12" fill="${C.box}" stroke="${C.boxLine}"/>`);
  badge(x + 27, 688, number);
  text(x + 48, 693.5, title, { size: 15, weight: 600 });
  text(x + 16, 721, first, { fill: C.muted });
  text(x + 16, 739, second, { fill: C.muted });
  if (index < steps.length - 1) {
    add(`<path d="M${x + 230} 709 l6 0 m-4 -4 l4 4 l-4 4" fill="none" stroke="${C.faint}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`);
  }
});

// --- Assemble ------------------------------------------------------------------

const head = (id, color) =>
  `<marker id="${id}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="${color}"/></marker>` +
  `<marker id="${id}-start" viewBox="0 0 10 10" refX="1.5" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M10 0 L0 5 L10 10 z" fill="${color}"/></marker>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="title desc">
<title id="title">How Flowboard works</title>
<desc id="desc">In the browser, React components talk to a Redux Toolkit store. The store checks a flow against the flow rules, hands it to the engine, and receives events back as each block runs. Flows and the AI key are kept in browser storage. The engine calls public REST APIs directly, or through the server's relay when an API refuses browsers, and calls the AI provider with the visitor's own key. The Next.js server serves templates, the relay and a health route.</desc>
<defs>${head("head", C.muted)}${head("head-accent", C.accent)}${head("head-green", C.green)}</defs>
${out.join("\n")}
</svg>
`;

fs.mkdirSync("docs", { recursive: true });
fs.writeFileSync("docs/architecture.svg", svg);
console.log(`wrote docs/architecture.svg (${svg.length} bytes)`);
