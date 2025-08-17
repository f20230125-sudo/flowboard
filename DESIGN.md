# DESIGN.md: Flowboard

Status: Built and live. Direction picked by Claude under Uzair's blanket go-ahead of 2026-10-13; not yet reviewed by him.
Pages covered: `/` (home: the live flow, templates, saved flows), `/flows/[id]` (the editor: palette, canvas, settings panel, Run and Problems panel, settings and shortcuts dialogs, toasts), `/import` (a shared flow), the not-found and error pages, the favicon and the `og:image`.
Written 2026-10-14 by the design director. Pictures and scripts cited are in the session scratch folder
`C:\Users\UZAIR\AppData\Local\Temp\claude\d--claude-workspace\dc3256bc-48b3-4c89-b760-cb9e543aa661\scratchpad\flowboard\`
(`fb-editor-*.png` are the live editor today, taken with `shots.cjs`; `mock-*.png` are static sketches of this plan, not a build; `type-specimen.png` and `type-zoom.png` are the type specimens; `contrast.mjs` is the arithmetic).
Baseline pictures (before any change): `C:\Users\UZAIR\.claude\design-kit\references\baseline-2026-10-13\flowboard-*.png`, scan in `scan\flowboard.json`. I did not re-run the scanner on `/`: nothing has changed since that baseline (the scanner cannot open the editor, so `shots.cjs` clicks "Heat check" and Run on the live site instead).

## 0. Decisions that are Uzair's (nothing here is final until he says so)

1. **Family or distinct?** Not answered by him. Recommendation applied: **a thin shared layer, a distinct face.** Shared (see `C:\Users\UZAIR\.claude\design-kit\family-layer.md`): light and dark following the system with the header toggle and no flash (`data-theme`, key `flowboard:theme`), the accessibility baseline, the honest tone, the "Open in Hindsight" control, `frame-ancestors` and every security header, a skip link, one `h1`, titles, descriptions and a real `og:image`. Not shared: typeface, accent, radius, first screen, label style, motion, logo. Reverting to the old kit means restoring `globals.css`, `layout.tsx` and the component classes; nothing in `src/engine`, `src/flow` or `src/store` changes either way.
2. **The direction itself** (section 4): the page is ink on a dotted grid and has no colour until you press Run; then the wires that carried data light up in orchid and every block that ran gets a readout tab. One typeface, Sono, with two voices. It is a quieter colour move than Sayso's yellow or Footnote's pink. Fallback if orchid reads as "AI purple" to him: make the lit wire ink, 3 px, and keep everything else (no accent; Flowboard and Hindsight would then both be ink-only, which is the cost).
3. **The first screen becomes a live flow.** Heat check is drawn at full size on a stage, with a Run button on it. Pressing Run really calls `api.open-meteo.com` from the visitor's browser, so the page says so next to the button. Nothing runs on load. It is a new element and a new claim of a kind, so he should see it. If mounting the real canvas on `/` turns out too costly, the fallback is a static drawing of the same flow with "Edit this flow" (section 12).
4. **Colour changes meaning.** Today five group hues (green, blue, orange, violet, pink) tint block icons, left borders and the minimap, plus green and red tint True and False wires and block borders. All retire. A block's kind is shown by its shape and icon; run state by a word and a glyph; colour appears only on a wire that carried data (and red for failure, as in Hindsight).
5. **How he is described: nothing changes.** The site says nothing about Uzair beyond "Source on GitHub"; none is added.
6. **One claim to reword.** Home says under "Your flows": "Saved in this browser. Nothing is sent to a server." That is true of saving, but a run does call APIs from the browser, and an HTTP block set to "Flowboard's server" goes through `/api/relay` (README, `catalog.ts`). Suggested: "Saved in this browser. Flows are not uploaded." plus the Run line in section 7. No test pins either sentence.

## 1. What it is

Flowboard is a small visual workflow builder, like a tiny n8n. A visitor connects blocks (HTTP request, Condition, Filter list, Set fields, AI step and four more) on a canvas, presses Run, and sees what every step received and what it returned. Flows are saved in their own browser; four ready-made ones run with no key and no account.

## 2. Who opens it, and what they do in the first 30 seconds

An AI.AT.Core interviewer or an engineer sent the link (from Uzair's portfolio, where it opens in a window, or from the README's GIF), with a couple of minutes to spare. Within 30 seconds they must: see that this is a canvas of blocks and wires that really runs, press Run on a flow without choosing or typing anything, see which path was taken and what each step returned, and find how to open that flow in the editor. The first screen therefore shows a real flow, not a description of one and not four cards. It must also work in a 720 to 900 px portfolio window; on a phone a flow can be run but not edited (README Limits), and the page says so.

## 3. Source material

1. **Block anatomy.** A 240 px block with its name as an identifier (`getWeather`), a one-line summary of its settings (`GET api.open-meteo.com/v1/fore...`), an icon, round connection dots on its left and right edges, and a status chip on its top edge ("733 ms"). A Condition has two exits, True and False, each with its own dot, and the one taken is marked "True ✓". `src/components/editor/BlockNode.tsx`, `blockLook.tsx`; picture `fb-editor-run-light.png`, `docs/screenshots/run.png`.
2. **The lit path.** After a run, the wire that carried data is drawn heavier, the wire not taken fades to 30% and the block behind it goes dashed and says "Skipped". `src/components/editor/FlowEdgeView.tsx` (`carried`, `settledWithout`), `BlockNode.tsx` (`FRAME.skipped`). This is the product's own drawing of "what happened" and nothing else on the web shows a branch resolving this way.
3. **The grid and its numbers.** Dots every 20 px, blocks snap to 20 px, blocks are 240 wide, templates sit on a 280 px column and 140 px row pitch, Tidy up lines blocks up in that order. `Canvas.tsx` (`snapGrid`, `Background gap={20}`), `src/templates/index.ts` (`COLUMN = 280`, `ROW = 140`), `BlockNode.tsx` (`w-[240px]`). A page can use the same module.
4. **The reference grammar and the data.** `{{ steps.getWeather.body.current.temperature_2m }}`, `{{ trigger.city }}`, `{{ item.stargazers_count }}`; the returned data read as `temperature: 38.4`, `city: "Dubai"`, `advice: "Fine to go out."`; block names as camelCase identifiers (`getWeather`, `isTooHot`, `stayIn`, `goOut`). `README.md` "Data between blocks", `templates/index.ts`, `JsonTree.tsx`. Names and values are things a person types or an engine returns: verbatim, not labels.
5. **The run trace.** An ordered list of steps with name, time and state, then "Returned" and "Received" for the open step; "Run succeeded in 739 ms"; "Skipped" with the reason ("The path into this block was not taken."). `BottomPanel.tsx`, `runText.ts`; picture `fb-editor-run-light.png`.
6. **Real content for samples.** Heat check (Dubai, limit 35), Support ticket triage (Amal's checkout page), Repository digest (`vercel`, 1000 stars), Dirham rate watch (AED to INR, target 26.5). `templates/index.ts`.
7. **Flowchart symbols.** Rounded-end terminators for start and end, rectangles for steps, a fork for a decision (ISO 5807, the category's own vocabulary). Not in the repo, so I use it for shape only and claim no more.

Category looks avoided: n8n's glowing bolt on near-black (`references/good/n8n.png`: orange-red glow, logo wall, which the craft notes already file under "glow-on-dark default"), Make's violet, blueprint-blue graph paper, tinted node kinds in five hues.

## 4. The idea

**Directions considered**

- **A. "The current" (picked).** From 2, 1 and 3. Everything is ink on a dotted grid; kind is shape, state is a readout tab, and colour does not exist until you press Run, when only the wires that carried data light up. Palette: teal-grey ground, ink, one small orchid, red for failure. Type: Sono, a proportional voice for what Flowboard says and a mono voice for names and data. First screen: Heat check on a stage, Run on it.
- **B. "The datasheet".** From 4 and the settings panel. Each block as a component data sheet: a ruled table of settings, pin lists, the reference path as the caption. Rejected: it is the second-wave "spec-sheet corner ticks and small mono labels" chrome, its label-left-value-right skeleton is Hindsight's gutter and track, and it gives the canvas, the thing people use, nothing.
- **C. "The patchbay".** From wires and dots. Blocks as rack modules with jacks, cables in several colours. Rejected: skeuomorphic, needs a palette of cable hues that would collide with Hindsight's data hues (red 0, orange 17, amber 26-41, green 120 and 158, blue 213), and it does not answer the template list, the saved flows or the settings panel.

**The idea, in one sentence.** Flowboard is ink on a dotted grid until you press Run, and then the only colour on the page is the wire that carried data, with every name and value set in the same typeface's mono voice.

Everything below follows from it: shape and glyph carry meaning that colour carried before; a box is a block or a pane, never a card around a sentence; labels are plain words and identifiers are mono; one 20 px module runs from the canvas dots to the page spacing.

## 5. Token plan

### Colour

Roles are what components use. `--accent`, `--accent-fg`, `--accent-soft`, `--ok`, `--warn`, `--group-*`, `--shadow` and `--grid` retire. Mapping to today's names (keep the Tailwind class names only where the pattern is unchanged): `--bg` = ground, `--surface` = sheet, `--surface-2` = sheet-2, `--line` = rule, `--line-strong` = edge, `--fg` = ink, `--muted` = ink-2, `--faint` = ink-3, `--bad` = fail. `--accent` becomes `--current` and is used for wires only; `bg-accent` buttons become `bg-ink`. Hues are HSL, computed in `contrast.mjs`.

| Token | Light | Dark | Role | Used for / never used for |
|---|---|---|---|---|
| `ground` | `#e5eaea` | `#131a1b` | the page, the canvas, the header row of a pane's neighbours, a skipped block's fill | words and the canvas sit here. Teal-grey (hue 180-188, saturation 11-17%), lifted in dark so it is not near-black. Never behind a form field. |
| `sheet` / `sheet-2` | `#f9fbfb` / `#eef2f2` | `#1b2324` / `#242e2f` | `sheet`: blocks, the three panes, the run panel, inputs, dialogs, menus. `sheet-2`: row hover, the inset behind the data view, selected step row | `sheet-2` is not a third card level |
| `ink` / `ink-2` / `ink-3` | `#0f1a1c` / `#3d4a4c` / `#526063` | `#e8f0f0` / `#b9c6c7` / `#93a2a3` | `ink`: text, block names, readout tabs (fill), the primary button (fill), the selected block border, focus ring, selected tab rule. `ink-2`: summaries, the dek, secondary. `ink-3`: placeholder, skipped block text, hollow tab text, meta (12 px and up) | teal-black on purpose (hue 189): not Hindsight's blue-black (222), Sayso's green-black (90) or Footnote's plum (323) |
| `rule` / `edge` | `#cdd5d5` / `#728081` | `#2b3637` / `#6c7b7c` | `rule`: hairlines between rows and around panes (decoration). `edge`: block borders, ports, control borders, idle wires, anything that must be found (3:1) | `rule` never carries meaning |
| `dot` | `#b4bfc0` | `#2c3839` | the 20 px dots of the canvas and the stage | decoration only, never under text on a pane |
| `current` | `#a630a2` | `#e48be1` | **a wire that carried data in the last run**; the line while a connection is dragged; the dot of a valid drop target; the logo's wire in the favicon and og image | hue 302. Never a text colour, button, border, link, selection or focus colour, never a fill behind text. Pick any orchid pixel: it is a wire, a dragged wire, or a logo. |
| `fail` | `#b3261e` | `#ff8f86` | failure and nothing else: the failed block's border and tab, "N to fix", error text, the step's X | always with an X glyph and the word. Same meaning as red in Hindsight. No green "ok", no amber: warnings are an ink triangle and the word. |

Hue arithmetic for the family rule (`family-layer.md`): accent **302** is outside 235-290 (12 degrees past its upper edge: this is the thin part, see below). Footnote's pink 330 is 28 degrees away (rule: 25). Sayso 68 is 126 away; Agent Desk 142 is 160; Portfolio OS 209 is 93. Hindsight has no accent; its data hues are red 0 (58 away), orange 17 (75), amber 26-41 (84-99), green 120 and 158 (144-178), blue 213 (89), all over the 20-degree margin. Flowboard no longer has block-type hues, so nothing here can be mistaken for a Hindsight kind of time. `fail` (hue 3) is Hindsight's red on purpose and means the same thing. The risk: a layperson may still call hue 302 "purple", which is a first-wave tell when it is a brand colour; the plan keeps it to wires and absent until a run, which is why it is not a brand colour here.

**Contrast, computed** (`contrast.mjs`, WCAG 2.x, the final values above):

| Pair | Light | Dark | Needs |
|---|---|---|---|
| ink on ground / sheet / sheet-2 | 14.59 / 17.07 / 15.71 | 15.24 / 13.83 / 12.05 | 4.5 |
| ink-2 on ground / sheet / sheet-2 | 7.58 / 8.86 / 8.16 | 10.04 / 9.12 / 7.94 | 4.5 |
| ink-3 on ground / sheet / sheet-2 | 5.38 / 6.29 / 5.80 | 6.66 / 6.05 / 5.27 | 4.5 |
| readout tab text (sheet on ink) | 17.07 | 13.83 | 4.5 |
| fail as text on ground / sheet / sheet-2 | 5.38 / 6.29 / 5.80 | 8.00 / 7.26 / 6.32 | 4.5 |
| failed tab text (light: sheet on fail; dark: ground on fail) | 6.29 | 8.00 | 4.5 |
| edge on ground / sheet / sheet-2 (block border, port, control border, idle wire) | 3.38 / 3.95 / 3.64 | 4.00 / 3.63 / 3.16 | 3 |
| current on ground / sheet (a 2.5 px wire) | 4.85 / 5.67 | 7.62 / 6.92 | 3 |
| focus ring (ink) on ground / sheet | 14.59 / 17.07 | 15.24 / 13.83 | 3 |

Everything passes; nothing is under its threshold. Borderline: `edge` on ground in light (3.38) and on sheet-2 in dark (3.16): keep text inputs on `sheet`, not on `sheet-2`. Not required, so not claimed: `dot` on ground 1.55 / 1.45 and `rule` on ground 1.23 / 1.41 are decoration; the 30% wire of a path not taken is about 1.4 and is **not** the signal, because the block behind it is dashed, says "Skipped", and the exit it did not leave from is struck through.

### Type

One family, two voices, chosen by what the words are. Rule: **if a person typed it or the engine produced it, it is the mono voice; if Flowboard says it, it is the proportional voice.**

| Role | Family | Weights | Sizes | Why this face for this product | Loaded via |
|---|---|---|---|---|---|
| Say (headline, section titles, body, buttons, labels, palette names) | **Sono** at `MONO` 0 (proportional, kerned) | 800 the h1 and wordmark; 700 section titles, tabs, primary button; 500 buttons and nav; 400 body. 300 not used | h1 44 desktop / 32 phone, line 1.02, tracking -0.025em, two lines on purpose. Section title 20/700. Dek and body 16/1.5, `ink-2`, max 62ch. Buttons and labels 13/500 to 700. Palette and menu names 13/600. Meta 12.5 | One file holds both voices on one skeleton, so a sentence can carry an identifier without a change of face: "Other blocks read this one as `{{ steps.getWeather }}`" is in the product today (`Inspector.tsx`). 800 against 400 is the weight jump the hierarchy uses. The heavy cut has a rounded, slightly blunt shape that does not look like Geist or any sibling (`type-specimen.png`). | `next/font/google`, `axes: ["MONO"]`, `subsets: ["latin"]` |
| Name (block names, summaries, URLs, `{{ }}` references, the JSON data, step names, times, tab readouts, inputs that hold references, URLs or JSON, `kbd`) | **Sono** at `MONO` 1 | 600 block names and step names; 700 tab readouts; 400 everything else | Block name 15; block summary 11.5; step rows 13; data view 12.5/1.55; tab readout 11.5/700; reference inputs 13 | Built to be monospaced by default and tested at the small sizes of a block. Every digit is one width, so a column of times ("1 ms", "733 ms") lines up with no `tabular-nums`. `1`, `l` and `I` differ (`type-zoom.png`: `http1 filter1 fields2 wait1`). | same file, `font-variation-settings: "MONO" 1` on `.font-mono` |

Licence: Sono, SIL Open Font License 1.1, "Copyright 2020 The Sono Project Authors (https://github.com/sursly/sono)" (`ofl/sono/OFL.txt` in google/fonts, read 2026-10-14). It is in this project's `node_modules/next/dist/compiled/@next/font/dist/google/font-data.json`: axes `MONO` 0-1 (default 1) and `wght` 200-800 (default 400), subsets latin, latin-ext, vietnamese. The latin file with both axes is 39,108 bytes from Google's CSS on 2026-10-14 (Hindsight's DESIGN.md measured Geist plus Geist Mono at about 52 KB; I did not measure Flowboard's own), and it is the only font. Self-hosted at build, no CDN link: this site's header policy names no font source, but the family rule is the same for all four.

```ts
const sono = Sono({ variable: "--font-sono", subsets: ["latin"], axes: ["MONO"] });
```
```css
:root { --font-sans: var(--font-sono); --font-mono: var(--font-sono); }
body  { font-variation-settings: "MONO" 0; }
.font-mono { font-variation-settings: "MONO" 1; }   /* the 10 files that already use font-mono keep working */
```

Tailwind's preflight makes buttons, inputs and selects inherit `font-variation-settings` (GUESS: verify in the build; if a control shows the mono voice by mistake, set it on the control). The default of the axis is 1, so if the setting fails to apply, the whole page falls back to monospace, which is ugly but readable.

**Glyph holes.** The latin subset has no `✓` (U+2713) or `▷`, as for every Google font. The code writes "True ✓" in the Condition block and a test pins it (`run.spec.ts:22`). Either keep the character in an `aria-hidden` span with `font-family: system-ui, "Segoe UI Symbol", sans-serif` (renders as today), or draw it with lucide `Check` and change that one assertion to `toContainText("True")` plus a check that the span exists. I recommend the first (no test change). Middle dot, ellipsis, curly quotes and `×` are present.

**Zero.** Sono's zero is plain: `0` and `O` differ only in width (`type-zoom.png`). Digits in names and data are rare to confuse with letters here, so accepted. Runner-up if he dislikes it: Reddit Sans and Reddit Mono (dotted zero, two files, 42 KB and 30 KB latin), which tested fine in the specimen.

No tracked all-caps, no small mono labels: the mono voice names things, it does not label chrome.

### Shape and depth

- **Shape is the kind of block.** Start and Output (the trigger and the output block) are **terminators**: full-round ends (radius 999). Every step (HTTP request, AI step, Set fields, Filter list, Delay) is a **rectangle**, radius 7. A Condition is a rectangle with a **fork**: a ruled foot with two exits, True and False, each with its dot. No block has a coloured icon, a coloured left border or a shadow.
- **Radius by role.** Terminator 999; block, pane, dialog, menu 7; controls (button, input, select, menu item, `kbd`) 5; readout tab top corners 3; ports are circles. No pill chips: the tag chips on template rows and the rounded status chips go.
- **Elevation: three steps.** Ground (flat, canvas included). Sheet (1 px `edge` border on a block, 1 px `rule` on a pane; no shadow). Overlay (dialog, menu, toast, minimap and zoom controls: one shadow `0 8px 24px` at 18% ink). No blur, no glow. `fb-pulse` (the ring glow on a running block) is removed.
- **The readout tab.** A small rectangle hung from the top edge of a block, 8 px in from the right, top corners 3, 20 px high, text 11.5/700 in the mono voice. Filled `ink` with `sheet` text when done ("check 733 ms"); filled `fail` with an X and "Failed" when failed; hollow with a dashed `edge` outline and `ink-3` text for "Skipped", "Stopped" and "Running" (with the spinner icon). It replaces the round status chip. It is the one loud thing on a block and it is legible as a dark shape even when the canvas is fitted small.
- **Block states.**

  | State | Border | Fill | Tab |
  |---|---|---|---|
  | idle | 1.5 px `edge` | `sheet` | none |
  | selected | 2 px `ink` | `sheet` | unchanged |
  | running | 1.5 px `edge` | `sheet` | hollow "Running" with spinner; the wire leaving it marches in `current` |
  | done | 1.5 px `edge` | `sheet` | ink "check, 733 ms" |
  | failed | 2 px `fail` | `sheet` | `fail` "X Failed" |
  | skipped, stopped | 1.5 px dashed `edge` | `ground` | hollow "Skipped" or "Stopped"; name and summary in `ink-3` |
  | has problems (before a run) | 1.5 px `edge` | `sheet` | outlined `fail` "N to fix", or an ink outline with a triangle for warnings |

  Keyboard focus on a block is a 2 px `ink` outline with 3 px offset in addition (it already exists: `.react-flow__node:focus-visible .fb-block`).
- **Wires.** Idle 1.5 px `edge`. After a run, a wire that carried data is 2.5 px `current`; one that did not is `edge` at 30% opacity; a selected wire is 2.5 px `ink`. True and False wires are no longer tinted: the exits are told apart by their words. Ports are 12 px circles: `sheet` fill and 1.5 px `edge` ring; hover scales 1.35 and fills `ink`; a valid drop target fills `current` (it was green).
- **Panes are not cards.** The palette, the canvas, the settings panel and the run panel are four regions divided by 1 px `rule` lines, full height, no radius, no inner cards. Palette items become ruled rows (glyph, name, one-line summary), not bordered tiles. The "Getting around" box in the settings panel becomes plain text with `kbd` keys. Dashed empty-state boxes become a sentence.
- **Selected and focus** everywhere else: selected row `sheet-2` with a bold name; selected tab = `sheet` fill with a 2 px `ink` rule on its top edge, joined to its panel; primary button `ink` fill with `sheet` text; focus a 2 px `ink` outline with 2 px offset on every control, including on filled ones.
- **The canvas library.** `--xy-background-color` = ground, `--xy-background-pattern-color` = dot, `--xy-edge-stroke` = edge, `--xy-edge-stroke-selected` = ink, `--xy-connectionline-stroke` = current, `--xy-handle-background-color` = sheet, `--xy-handle-border-color` = edge, minimap and controls on `sheet` with a `rule` border and radius 7, `--xy-selection-background-color` = ink at 8%, selection border `ink`. The minimap draws blocks in `ink-3` (no group tones) and `blockTone()` is deleted. Dots stay 1.5 px at 20 px.

### Space

Text sits on a 4 px base. **Layout takes the canvas's own module, 20 px**: blocks 240 wide (12 modules), column pitch 280 (14), row pitch 140 (7), block heights multiples of 20 so that ports sit on dot rows (GUESS: process and terminator 80, Condition 120 as in the sketch; tune in the build, and if it costs more than an hour keep 20-px steps only for widths and positions, which already snap). Page: 40 px side padding at 1024 and up, 20 on a phone; between header and h1 40; h1 to dek 12; between the h1 block and the stage 40; between sections 60; ruled rows 60 high on the home lists (44 on a phone). The stage is full-bleed (edge to edge) and 440 high; the rest of the home page is a 1360 px column left-aligned at 40, wider than the 1024 max-width today because the flow is 1360 px wide at 100% (4 columns of 280 plus one block of 240). Controls at least 32 px, primary and links in a row 44 px on a phone; the 24 px floor holds everywhere.

### Motion

**The one moment: the current.** While a flow runs, a wire fills with `current` from its source dot to its target dot when the source block finishes: 220 ms ease-out, as a `stroke-dasharray` draw on a path with `pathLength="1"`, left to right along the wire. At a Condition only the exit taken fills; the other wire fades to 30% over 200 ms and the block behind it turns dashed and takes its "Skipped" tab. A block that is running shows its hollow "Running" tab and the wire leaving it marches (the existing `fb-flow` dash, 0.5 s linear, kept as a state indicator). That is the product's behaviour (a branch resolving) made visible, driven by the real run events, and it plays on the home stage and in the editor alike; it does not play when a finished run is merely redrawn (opening a flow with an old run, switching theme).
State transitions: hover and focus 150 ms ease-out; tab and block border changes 150 ms. **Removed:** `fb-pulse`, `animate-pulse` on the template skeletons (they become the words "Loading templates"), `group-hover:translate-x-0.5` on the card arrow, the spinner ring around a running chip (the spinner icon in the tab stays).
Reduced motion: wires appear fully drawn, the dash does not march (`animation: none` explicitly: the existing global rule shortens durations to 0.01 ms but leaves the iteration count at 1, which for a dash would freeze mid-march), the spinner is a static icon. GUESS to verify at build: `BaseEdge` passes `pathLength` through to its `<path>`; if it does not, draw the fill as a second `<path>` over the first.

## 6. Layout concept

Skeleton on every page: **the canvas is the page.** A full-bleed ground with 20 px dots holds the thing you work on (a flow); words and lists hang left-aligned beneath or beside it in ruled rows. In the editor the same idea is four docked regions around the canvas. The home page is the editor's idea shown as a page: a stage over a ledger.

- **`/`**: header; one h1 and a dek; the **stage** (Heat check at 100% with a Run button on it, an "Edit this flow" button and one honest line); the **trace** under it (empty until Run: the same words the Run panel uses today); then "Start from a template" as four ruled rows, then "Your flows" as ruled rows or a sentence.
- **`/flows/[id]`**: the existing four regions, restyled as above. The Run panel is the trace.
- **`/import`**: a shared flow is a name, what it contains and "Add to my flows"; the "Shared flow" caps label becomes plain text (`ImportFlow.tsx:94`).

### `/` desktop 1440 (pictures: `mock-light-run.png`, `mock-dark-run.png`, `mock-light-idle.png`, `mock-dark-idle.png`; the sketch's trace is wider than planned)

```
+--------------------------------------------------------------------------------------------+
| o-* Flowboard                                        [New flow] [Import a file]         (o) |  56, ground, 1 px rule
|                                                                                            |
|  Connect blocks.                    (44/800, left, two lines)                              |
|  Press Run.                                                                                |
|  Every step shows what it received and what it returned.  (16, ink-2, 62ch)                |
|                                                                                            |
| ........................................................................................... |  stage: full-bleed, ground, 20 px dots
| . Heat check   Looks up the current temperature ...                    [ > Run ]  [Edit]   |  name in mono 600; Run = ink fill, 36 high
| .                                                                                          |
| .                                      +-----------+                                       |
| .                                      | stayIn    |)--------------.                       |
| .                                     /| ...       |               \+------------+          |
| . (start )-----( getWeather )-----( isTooHot )                       | result  (  |          |  start/result are terminators
| .  Starts..       GET api...      | True   o-----'                  +------------+          |
| .                                 | False  o-----( goOut )- - - - -'                       |
| ........................................................................................... |
|  Run calls api.open-meteo.com from your browser; the result is not stored.  (13, ink-2)     |
|  Run succeeded in 739 ms                           (700)                                    |
|  v start        1 ms  |  getWeather  Output                              Done, 733 ms        |  step list 560 px | data view
|  v getWeather 733 ms  |  Returned  Received                                                  |
|  v isTooHot     1 ms  |  status: 200                                                         |
|  v stayIn       1 ms  |  body: { 3 fields }                                                  |
|  > goOut     Skipped  |                                                                      |
|  v result       1 ms  |                                                                      |
|                                                                                            |
|  Start from a template                         (20/700)                                    |
|  Each one runs as it is. No key, no account.                                               |
|  ------------------------------------------------------------------------------------------|
|  Heat check             Looks up the current temperature ...   HTTP request, Condition  6 blocks |  4 rows, 60 high, whole row is a button
|  Support ticket triage  ...                                    AI step, Condition, ...  7 blocks |
|  ...                                                                                       |
|  Your flows            Saved in this browser. Flows are not uploaded.                      |
|  No flows yet. Start from a template above, or choose New flow.                            |
+--------------------------------------------------------------------------------------------+
```
Unequal on purpose: the stage is the only large thing and the only place the page has a texture; the flow is 1360 px wide at 100%, so at 1440 it fits with 40 px margins and at narrower widths the stage fits it to the window (never below 50%). Before Run (`mock-*-idle.png`; the sketch wrongly draws goOut dashed there, as if skipped, which only happens after a run) the trace area holds the sentence "Nothing has run yet. Press Run. Each step shows up here with the data it received and what it returned." and the screen has no hue at all. The first screen at 1440 x 900 shows h1, dek, the whole stage and the first line of the trace; the template rows are one scroll down (today they are on the first screen). The h1 stays one `h1`; the stage is a `section` named "Heat check, a flow you can run here" and its blocks are the same `BlockNode` and `FlowEdge` components as the editor, read-only (no drag, no connect, pan and zoom off).

### `/` phone 390

```
| o-* Flowboard                 (o) |  56
| Connect blocks.                   |  32/800
| Press Run.                        |
| Every step shows what it ...      |  16
| [        > Run        ]           |  full width, 48, ink fill
| Heat check                        |  mono 600
| Looks up the current ...          |
| ......................................  stage: a region you can scroll sideways (tabindex 0, labelled), blocks at 100%
| . (start)--(getWea|                 |  first block and a half show; "Swipe to see the whole flow" in 13/ink-2
| Run calls api.open-meteo.com ...  |
| Nothing has run yet. ...          |  after Run: step list full width, data view below it
| Start from a template             |
| Heat check                        |  rows 56+ high, name 17/700, description, then "6 blocks" on its own line
| ...                               |
| [New flow] [Import a file]        |  44 high
```
README Limits says a flow can be run but not edited on a phone; the stage hides "Edit this flow" below 1024 px, as the editor hides its palette.

### `/flows/[id]` desktop 1440 (pictures: `fb-editor-run-light.png` today; no sketch of the new one)

```
+--------------------------------------------------------------------------------------------+
| <- Heat check   Saved in this browser          undo redo | (o) ...            [ > Run ]     |  48, sheet, 1 px rule
+--------------+------------------------------------------------------------+----------------+
| Search blocks| ground + 20 px dots; flow fitted; blocks as on the stage   | Heat check     |  rules, no cards
| Start        |                                                            | 6 blocks, 6 connections
|  > Manual tr.|     (start)--(getWeather)--[isTooHot]--[stayIn]--(result)  | Description    |
| Actions      |                                                            | [ textarea ]   |
|  o HTTP req. |  [+][-][ ][wand]                              [minimap]    | How to get around: plain text
|  ...         |                                                            |  Ctrl Z undo ...|
+--------------+------------------------------------------------------------+----------------+
| Run  succeeded in 739 ms   Problems           Open in Hindsight (ext icon)   x            |  tabs: selected = sheet + 2 px ink top rule
| v start  1 ms   | result  Output                                          Done, 1 ms        |
| ...             | Returned  Received      Hover a row and press "ref" to copy its reference.  |
+--------------------------------------------------------------------------------------------+
```
Group headings in the palette ("Start", "Actions", "Logic", "Data", "Finish") become 13/600 sentence-case `ink-2` on a ruled line; they are tracked all-caps today (`Palette.tsx:73`). Everything in the panes uses the two voices; field labels are plain 12.5/600 `ink-2` above their field.

## 7. Voice

A plain tool with a dry sense of what it is doing: it says what runs, where, and what came back.

1. Say what happened and where it ran: "Run calls api.open-meteo.com from your browser", "Calls llama-small with your key", "Sample reply. No model was called." (the last two exist and are pinned).
2. State a limit in the sentence where it bites: "On a phone a flow can be opened and run, but not edited." Do not say "nothing leaves your browser": saving is local, a run calls the APIs the flow names.
3. No product-marketing words (powerful, seamless, effortless, no-code magic), no exclamation marks, no emoji, no "AI-powered". Call it an "AI step" and "a language model".
4. A control says what it does: "Run", "Stop", "Tidy up", "Add to my flows", "Open in Hindsight", "Edit this flow". No "Get started", "Learn more".
5. Prefer commas to middle dots in running text ("6 blocks, edited 14 Oct, 02:04"); no arrows on links (an arrow on "Back to all flows" points back; keep it).

Sample lines (existing copy kept where it is already right; T marks a string a test pins):
- Headline: "Connect blocks. Press Run." Dek: "Every step shows what it received and what it returned." (the current h1 "Build a workflow by connecting blocks, then watch it run." is not pinned; the copy-editor may keep it or use this).
- Primary button: "Run" (T, `runButton` exact name "Run" in the editor; on `/` the stage button is also "Run"). Stage secondary: "Edit this flow" (**it must not contain "Heat check"**: `openTemplate` clicks `getByRole("button", { name: /Heat check/ })` and strict mode fails on two matches).
- Line under the stage: "Run calls api.open-meteo.com from your browser. The result is not stored." (new; the host is in `templates/index.ts`).
- Empty trace: "Nothing has run yet. Press Run. Each step shows up here with the data it received and what it returned." (kept, words from `BottomPanel.tsx`).
- Empty flows: "No flows yet. Start from a template above, or choose New flow." (replaces the dashed box; the words are the existing ones).
- Error (templates): "The templates could not be loaded." with "Try again" (kept). Failure on a block: the server's words (T `api.open-meteo.com answered 503`).
- Tooltip on a port: "Drag to connect the True side" (kept).

Facts that must stay true, with sources:
- Eight blocks: manual trigger, HTTP request, condition, set fields, filter list, AI step, delay, output (README; `NODE_TYPES`). Four templates (`TEMPLATES.length`); each runs with no key and no account (`templates/index.ts` header comment, README).
- Flows are saved in the visitor's browser (`FlowRepository`); export, import and share link move them (README).
- An HTTP request goes from the browser, or through `/api/relay` when set to "Flowboard's server"; the relay is closed by default and calls only listed hosts (README).
- The AI step uses the visitor's own key, or returns a reply labelled as a sample (README; `run.spec.ts:143`).
- Editing needs a screen at least 1024 px wide; a phone can open and run (README Limits; T `editor.spec.ts:346` "To edit it, open Flowboard on a wider screen.").
- "Open in Hindsight" hands over each block's name and kind, the joins, the times and the data, never what a block is set up to do, because that can hold keys (README).
- Every time and value on screen comes from the run. The numbers in this file (739 ms, 733 ms, 38.4) are from the sketches and from one real run on 2026-10-14; none is typed into the page.

## 8. Principles that set it apart

1. **No colour before Run.** On a fresh home page and in a flow that has not run, no pixel outside the favicon and og image has a hue except `fail` on a problem. After Run, orchid appears only on wires.
2. **Shape is kind.** Start and Output are terminators, steps are rectangles, a Condition has a two-exit fork; no block has a coloured edge, icon tile or shadow.
3. **Every block that ran has a readout tab.** A filled ink tab with its time, a red tab for a failure, a hollow dashed one for skipped: readable as a dark shape when the canvas is fitted small.
4. **Names are mono, sentences are not.** Every identifier, path, value and time is the mono voice; every sentence and label is the proportional voice; no all-caps and no chips anywhere.
5. **One grid.** Dots, block widths, column pitch and page spacing are multiples of 20 px; on the stage every block edge sits on a dot.

## 9. Second pass: defaults I removed

| First idea | Why it was a default (tell, wave) | Revised to |
|---|---|---|
| Keep indigo and Geist, add flowchart shapes | the family kit plus one gimmick (first wave, indigo; default font) | new face, one small accent, shapes by kind |
| Keep the five group hues on icons, borders and minimap | colour as decoration, five competing hues, a violet one (`--group-data: #7c3aed`, flagged `indigo-hex` by the scanner), a left border on every block (side-accent-border, P2) | shape, icon and word; the minimap in `ink-3` |
| Green and red tint on True and False wires, green "ok" and amber "warn" | green is Hindsight's "waiting for a person" (hue 158) and "good day" (120); four more state hues | wire weight and the words True and False; ink check; amber gone (triangle and word); red kept only for failure, as in Hindsight |
| Electric cyan or blue for the current | cyan on dark (first wave), and blue sits inside Hindsight's 213 +- 20 window | orchid, hue 302 |
| First orchid `#9a2fb4` (dark `#d38ae8`) | computed hue 288, inside the indigo band (235-290) the family rule bans | `#a630a2` / `#e48be1`, hue 302, 12 degrees past the band and 28 from Footnote's pink |
| Dark-first canvas with a glowing wire (n8n's own look) | glow on dark (first wave; second wave 2, near-black plus one accent) | system theme; dark ground lifted to `#131a1b`; the glow pulse (`fb-pulse`) removed; the wire is a flat 2.5 px line |
| The hero flow runs by itself on load | a request to a third party on every view, and no test may touch the network | it runs when Run is pressed, and the page says where it calls |
| The four templates drawn as blocks on the grid | a 2 x 2 card grid again (identical cards) | one live flow on the stage, templates as ruled rows with the tag chips turned into a plain "Uses" line |
| Values drawn on the wires after a run ("38.4" on the wire) | a new feature with a summarising rule for arbitrary JSON; not needed for the look | not in the plan; allowed later as a second step (rule: scalar as is, object as "3 fields", list as "7 items") |
| Round status chip (`rounded-full`) on every block | pill chip (first and second wave) | the readout tab: square, filled, from the block's top edge |
| Tracked all-caps group headings, "Shared flow" caps label | template chrome (second wave 5) | 13/600 sentence case on a ruled line |
| All-mono interface (JetBrains Mono, "it is a developer tool") | mono for vibes (second wave 5), and the sentences get hard to read | two voices from one face, split by who wrote the words |
| IBM Plex Sans with Plex Mono | the engineering-tool default; no point of view | not used |
| Spline Sans + Spline Sans Mono, Reddit Sans + Reddit Mono, Overpass + Overpass Mono | tested in `type-specimen.png`: Overpass Mono is wide enough to wrap a URL inside a 240 px block; Spline and Reddit pairs are sound but two files with no shared skeleton, so an identifier inside a sentence changes face | Sono, one file, `MONO` axis. Reddit is the runner-up (see Type) |
| Selected tab as a 3 px underline | Footnote's selected toggle | `sheet` fill with a 2 px ink rule on top, joined to the panel |
| Shadow on every block (`shadow-panel`), 12 px radius on everything | uniform surfaces, "modern card" | border only, radius by role (999 / 7 / 5 / 3) |

"Have I seen this exact thing?" Checked against: the baseline picture (`flowboard-desktop-light.png`: indigo, Geist, two-column cards), n8n (`references/good/n8n.png`: dark, glow, logo wall; I looked at it and the plan avoids all three), the craft notes on Linear ("the first screen shows the real product") and are.na (a page that demonstrates itself), and the three siblings' `DESIGN.md` files (ink on grey-blue, sage and yellow, mauve and pink). I did not re-open the other `references/good/` pictures. Sketched in `mock-light-run.png`, `mock-dark-run.png`, `mock-light-idle.png`, `mock-dark-idle.png` and looked at in both themes before writing this: the monochrome idle screen reads as chosen (terminators, tabs and the heavy face carry it), and the orchid wires on the run screen are small enough not to read as a purple site. Not seen elsewhere: a node editor whose page has no hue until the first run. Residual risk: the light-theme wires are still "purple" to a quick glance; if the first build looks like Make, switch to the ink fallback in section 0.

## 10. Anti-list for this product

- No indigo or blue accent; no hue at all before a run; orchid only on wires, never on text, buttons, borders or backgrounds. No gradient, glow, blur or glass, no shadow on a block. No emoji.
- No pill chips (template tags, status chips), no tracked all-caps, no mono for chrome labels, no `A · B · C` meta strings, no numbered markers except the step order in the run list (a sequence), no arrow on a link or a card ("Back to all flows" points back).
- No five-hue block kinds, no coloured icon tile, no coloured left border, no green "ok" or amber "warn".
- No box around a sentence, no dashed empty-state box, no card inside a pane, no identical-card grid. Boxes are blocks, panes, fields and dialogs.
- The hero flow never runs on its own; no auto-playing loop, no hero video, no logo wall, no screenshot standing in for the product.
- No count-up, fade-up, bounce or pulse; one current.
- No invented numbers, customers or claims; every time and value is a run's. Never say nothing leaves the browser.
- No gradient app mark: the logo is an outline circle, a wire and a filled circle.

## 11. Sibling check

Read `D:\claude-workspace\hindsight\DESIGN.md`, `D:\claude-workspace\sayso\DESIGN.md`, `D:\claude-workspace\footnote\web\DESIGN.md` (all dated 2026-10-13).

| Axis | Flowboard (this plan) | Hindsight | Sayso | Footnote |
|---|---|---|---|---|
| Primary typeface | Sono, `MONO` axis (one file, two voices) | Mozilla Headline (+ Atkinson Hyperlegible Mono) | B612 (+ B612 Mono) | Libre Franklin (+ Red Hat Mono) |
| Accent | orchid, hue 302 (`#a630a2`, dark `#e48be1`), only on a wire that carried data; teal-grey neutrals (hue 180-189); red `fail` only for failure | none; blue-black ink (222); data hues 0, 17, 26-41, 120, 158, 213 | highlighter yellow, hue 68, fill under ink | pink marker, hue 330, a word of the question |
| Radius | terminator 999, block and pane 7, controls 5, tab 3 | 3 bars / 6 controls / 8 sheet | 14 / 10 / 5 / 2 | 0 leaf / 4 / 2 |
| Label style | plain sentence-case words; identifiers and data in the mono voice; state as a readout tab on the thing it describes | plain 500 sans in a gutter | caption under a ruled value | run-in bold heads in a margin; plain 600 field labels |
| Skeleton | the canvas is the page: a full-bleed dotted stage over ruled rows; in the editor, docked regions around the canvas | label gutter + track | left-aligned docket of forms; welcome = talk left, paper right | 720 px column + 304 px margin of notes |
| One motion moment | the current: a wire fills when its source finishes; the exit not taken fades | a run draws itself once | the fold with a highlighter stroke | the ranking re-sorts |

Shares with a sibling, and why it is fine: selected controls and focus rings are ink, like all three (that is the thin shared layer); a ruled-row list pattern like Sayso's index (different type and rhythm); a fill-on-select tab like Hindsight's segmented control only in a different position (joined top rule, not a filled segment). Not shared: any typeface, any accent hue, any radius set, any skeleton.

Shared on purpose (the thin layer): the `data-theme` mechanism and the toggle at the right end of the header, the accessibility baseline, the skip link and landmarks, the honest tone, the 4 px text rhythm, the "Open in Hindsight" control (a ghost button with the external-link icon at the right of the Run panel's tab row, shown after a finished run, name unchanged), the security headers and `frame-ancestors`.
One thing to know about Hindsight: it reads Flowboard's run and draws one bar per block in its own data colours. Flowboard no longer uses any hue for a kind of block, so Portfolio OS will not show the same colour meaning two things in two windows.

## 12. Constraints from the repo

- **Headers and CSP** (`next.config.ts`): untouched. It sends `frame-ancestors 'self' https://uzair-khan-lac.vercel.app; base-uri 'self'; object-src 'none'; form-action 'self'` and deliberately no `connect-src`, because an HTTP block calls whatever a flow names. Fonts go through `next/font` only, self-hosted; no `<link>` or `@import` to a font host; no external image. `headers.spec.ts` must pass unchanged. The "Open in Hindsight" sender (`src/hindsight/send.ts`, `export.ts`) is not touched.
- **Canvas library**: keep its behaviour, handles, keyboard support (`nodesFocusable`, Tab to a block, arrow keys), `deleteKeyCode={null}`, snapping and `colorMode={theme}`. Restyle only through the `--xy-*` variables, the block component and the existing `.react-flow .react-flow__handle` rule (it uses `scale`, not `transform`, because the library places each dot with a transform; keep that). Terminator blocks keep their dots at the vertical middle of the left or right edge.
- **Tests** (319 unit under vitest: logic only, none renders a component, there is no `.test.tsx`; 37 e2e in `tests/e2e`, axe in both themes on the home page, the editor before and after a run, the value picker and the settings dialog). Copy and structure they pin, which change only together with the tests:
  - Home: exactly one button whose name matches each of `/Heat check/`, `/Support ticket triage/` and the other two templates (`helpers.ts` `openTemplate`, `accessibility.spec.ts:30`), and clicking it saves a copy and goes to `/flows/<hex id>`; button "New flow"; label "Choose a flow file to import"; `Delete <name>` buttons and an "Undo" button in the toast; the saved-flow row `toContainText("2 blocks")`; link "Back to all flows". **The stage's own buttons may not match a template name.**
  - Editor: each block `getByTestId("rf__node-<id>")` and `.react-flow__node`, `.react-flow__handle.source` and `.target`, `.react-flow__edge`, `.react-flow__pane`, `.react-flow__minimap`; palette buttons `Add HTTP request`, `Add Condition`, `Add Output`, `Add Delay` (aria-labels); asides named "Blocks" and "Settings"; buttons "Tidy up the layout", `/^Undo/`, `/^Redo/` with `title` "Undo: Edit settings (Ctrl+Z)"; "More actions" menu with "Export as a file", "Copy a share link", "Keyboard shortcuts"; textbox "Name", "Address", "Wait (ms)", "Temperature", "Flow name"; theme button `/Switch to (light|dark) theme/`; the toast `role=status`.
  - Run: tab `/Run succeeded/`, `/Run failed/`, `/Run stopped/` (the tab's text is "Run" then "succeeded in 22 ms"); list "Steps of the last run" with buttons `/stayIn/` and `/goOut.*Skipped/` (glyph, name, state in that order); a block's own text contains "Skipped", "Failed", "Running", "Stopped", "1 to fix", and the Condition block contains "True ✓" (see Glyph holes); the panel text `advice: "Too hot. Stay inside until the evening."`, `temperature: 38.4`, `status: 200` (so the data view keeps the `key: value` text with quotes and no text between); "Answered on try 2 of 3."; "No problems"; `getByRole("alert")` on a failed step; "Open in Hindsight" button and its toasts "Opened in Hindsight." and "Hindsight did not answer, so the run was saved as a file."; the value picker's group "Values to insert into <field>" with "run the flow to see inside" and "skipped in the last run".
  - Phone: `editor.spec.ts:346` "To edit it, open Flowboard on a wider screen." and the hidden palette, settings, undo, Tidy up and minimap below 1024 px.
- **Accessibility**: axe clean in both themes; focus ring on every control; targets at least 24 px, primary 44 px on a phone. Baseline scan: 1 of 8 phone targets under 24 px (the footer "Source on GitHub" link, 16 px high): give it a 32 px row. The sideways-scrolling stage on a phone must be a labelled region with `tabindex="0"` (axe `scrollable-region-focusable`). Tab text and the skipped block's text are `ink-3` on `ground` or `sheet` (5.38 and 6.29 light, 6.66 and 6.05 dark), so axe passes; recheck the hollow tab on `ground` in the built CSS.
- **Reuse of the editor on `/`** (GUESS, not checked): the stage mounts the same `Canvas` pieces read-only and runs through the existing `startRun` thunk, which reads `flow.present` from the store, so the Heat check document is loaded into the flow slice from `/api/templates/heat-check` (`useLazyGetTemplateQuery`). The editor must clear it on load so a stage flow never appears as an unsaved edit, and the run state must reset when the visitor leaves. **Fallback** if this is too much: draw the same flow as a static picture from the template data (blocks and wires, no run), replace "Run" with "Open and run" (a button that saves a copy and opens the editor with the run started), and say so in the line under it.
- **Colour hooks to replace**: `--accent`, `--accent-fg`, `--accent-soft`, `--ok`, `--warn`, `--group-*`, `--grid`, `--shadow`, `shadow-panel` (6 files), `blockTone()` and its uses (`BlockNode`, `blockLook`, `Canvas` minimap), `FRAME` in `BlockNode.tsx`, every `text-accent`, `bg-accent-soft` and `border-accent` (15 files mention `accent`), the tinted `BlockIcon` square, `rounded-full` chips (3 files), `uppercase` (`Palette.tsx:73`, `ImportFlow.tsx:94`), `fb-pulse`, `animate-pulse`, `FlowEdgeView` tints. `--font-geist-*` in `globals.css` and `layout.tsx` become the Sono variable. The JSON tree's green strings and indigo numbers become ink, with numbers at 600.
- **Files that carry the old look**: `src/app/icon.svg` (an indigo `#4f4fd1` tile with two outlined blocks and a wire; replace with an ink tile with the same two blocks and the wire in `current`), `src/app/opengraph-image.png` (retake from the built site: the stage after Run, light, 1200 x 630), `docs/screenshots/*.png` and `docs/demo.gif` (`npm run screenshots`, `npm run gif`; read `scripts/screenshots.mjs` and `demo-gif.mjs` for the selectors they use before running), the README pictures, `docs/architecture.svg` (checked: it holds no `#4f4fd1`, but its colours are the old kit's; regenerate with `npm run diagram` if they clash). `layout.tsx` has no `viewport.themeColor`; adding one with `#e5eaea` and `#131a1b` is optional.
- **Dev**: port 3020; e2e capped at 6 workers locally, 2 in CI; run the way CI does: `npm run build`, then `CI=1 npx playwright test` with nothing on port 3020. Framed by Portfolio OS: check 720 and 900 px wide windows, not only 1440 and 390. The editor shows blocks at about 60% when fitted at 1440 (`fb-editor-run-light.png`), so text inside a block is under 10 px on screen; the readout tab is the cue that survives.
- **Build order**: tokens and font (`globals.css`, `layout.tsx`); `BlockNode`, `blockLook`, `FlowEdgeView`, the `--xy-*` variables and the current's motion; the panes (palette, settings panel, run panel, top bar, dialogs); home header, h1 and the stage; template and saved-flow rows; `/import`; icon, og image, README pictures.

## 13. Acceptance

- Scanner on `/` (baseline: MILD, 2 signals: indigo accent, Geist) and Playwright pictures of the editor (the scanner cannot open it): at most one signal, or each remaining hit explained. Expect `mono-for-vibes` may fire on block names and tab readouts: they are identifiers and engine output (the verbatim exception); check the hits are only those. Expect "dominant accent" to appear only after Run, in orchid, by design.
- Pictures checked: 1440 light and dark for `/` idle and after Run, and for the editor idle, after Run (a path taken and a Skipped block), and after a failed run (a red tab); 390 light for `/` and for the editor after Run; 720 and 900 px light for `/`. Look at the dark `/` for "acid on black" (the orchid is `#e48be1`, a muted pink-violet with no glow) and at the light `/` for "purple site".
- Contrast ratios in section 5 hold in the built CSS (re-run `contrast.mjs` with the final values).
- No fact, number or claim added that is not sourced (section 7); no time or value typed into copy.
- Lint, typecheck, unit tests (319), build, and e2e CI-style (37, axe in both themes) pass; any changed assertion is listed with the reason (expected: none, or the single "True ✓" line if the glyph is drawn as an icon).
