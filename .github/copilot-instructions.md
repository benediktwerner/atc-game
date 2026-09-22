# Copilot instructions for `atc`

A clean-room TypeScript re-implementation of the BSD Games `atc` (air traffic
controller) console game, shipped as a static web page.

## Read `DOCS.md` first

**`DOCS.md` is the authoritative reference** for game rules, the command grammar, every
message string, the level-file format, screen layout, the module list and the
deliberate deviations from the original BSD game. Read the relevant section before
changing behaviour.

**Never guess game mechanics.** If a rule, constant, message string or edge case is not
covered by `DOCS.md` and cannot be settled from the code or tests, ask rather than
inventing behaviour. The original C source is not part of this repository.

**`DOCS.md` must be kept up to date.** Any change to game rules, command grammar,
message strings, level-file syntax, screen layout, the module layout or the deviation
list must update `DOCS.md` in the same change.

## Commands

```bash
npm run dev                        # Vite dev server
npm run build                      # tsc --noEmit + static bundle -> dist/
npm test                           # full test suite
npx vitest run <file> -t "<name>"  # one file, or one test by name
npm run format                     # Prettier; format:check to verify only
```

Prettier is the only style tool; there is no linter. Markdown is Prettier-formatted
with padded tables; keep new markdown consistent with that. `src/data/*.atc` and
`dist/` are excluded from formatting.

## Architecture

A Vite static site with a hard boundary between two layers:

- **`src/engine/`** — pure game logic. **Must have zero DOM/browser dependencies** so
  the whole ruleset is unit-testable headlessly. All randomness goes through an
  injected `Rng = () => number` (default `Math.random`); never call `Math.random`
  directly inside the engine.
- **`src/ui/`** — rendering and lifecycle. Rendering is a **pure function of engine
  state + editor state**, re-run after every update and every keystroke. Do not port
  the original's incremental "erase planes, move, redraw planes" approach.

`src/storage/` holds `localStorage` persistence, `src/data/` the level files, and
`test/` mirrors the `src/` folders.

The game clock is a self-chaining `setTimeout`, **never `setInterval`**, so a forced
update (empty Return) and pause/resume can cleanly reset the interval.

`src/data/*.atc` are **verbatim copies of the original level files**, imported with
Vite's `?raw` suffix and parsed at runtime. Do not reformat, "clean up" or hand-convert
them to JSON.

## Conventions specific to this codebase

- **Naming**: a playable map is a **level** (`LevelDef`, `parseLevel`,
  `BUILTIN_LEVELS`, "level files"); `Game` means the running session only.
- **Deliberate deviations are enumerated in `DOCS.md` §8.** Several original bugs are
  fixed, several quirks are **deliberately preserved** and several features are
  removed. Do not "helpfully" fix a preserved quirk, and do not reintroduce a fixed
  bug or a removed feature. If you think a preserved quirk should change, ask first.
- **Message strings are part of the contract.** Every error and loss message is listed
  in `DOCS.md` §3.4 and §4.3, and tests assert them literally.
- **Coordinates**: `y` increases **downward**; direction 0 is North and indices run
  clockwise. Each radar cell occupies **two screen columns** — cell `(x, y)` renders at
  column `2*x`. This 2:1 mapping is the most common source of off-by-one errors.
- **The original's arithmetic quirks are load-bearing.** `dirFromDxDy` truncates rather
  than rounds (the C `(int)` cast), and the circle turn tables are literals rather than
  a formula. Both are locked down by tests; see `DOCS.md` §2 and §3.3.
- **Commands are typed intents, not field-by-field mutation.** Each intent names
  exactly the plane fields it writes. Reverting to comparison-based commit logic
  reintroduces an original bug where a redundant command cancelled a pending one.
- **No runtime dependencies**, and dev tooling stays limited to TypeScript, Vite,
  Vitest and Prettier. No UI framework.
