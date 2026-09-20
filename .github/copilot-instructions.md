# Copilot instructions for `atc`

A clean-room TypeScript re-implementation of the BSD Games `atc` (air traffic
controller) console game, shipped as a static web page.

## Read `DOCS.md` first

**`DOCS.md` is the authoritative reference** for game rules, the command grammar, every
message string, the level-file format, screen layout and the deliberate deviations
from the original BSD game. Read the relevant section before changing behaviour.

**Never guess game mechanics.** If a rule, constant, message string or edge case is not
covered by `DOCS.md` and cannot be settled from the code or tests, ask rather than
inventing behaviour. The original C source is no longer part of this repository.

**`DOCS.md` must be kept up to date.** Any change to game rules, command grammar,
message strings, level-file syntax, screen layout or the deviation list must update
`DOCS.md` in the same change.

## Repository state

The application is implemented as a Vite static site. `src/engine/` contains the
headless game rules, `src/ui/` contains the DOM application, `src/data/` contains
verbatim level files, and `test/` contains Vitest coverage.

## Commands

```bash
npm install
npm run dev                  # Vite dev server
npm run build                # tsc --noEmit + static bundle -> dist/
npm test                     # full test suite
npx vitest run test/engine.test.ts                 # one file
npx vitest run test/engine.test.ts -t "directions"  # one test by name
npx vitest                   # watch mode
npm run format               # Prettier
npm run format:check
```

Prettier is the only style tool; there is no linter. Markdown is Prettier-formatted
with padded tables; keep new markdown consistent with that. `src/data/*.atc` and
`dist/` are excluded from formatting.

## Architecture

Two layers with a hard boundary:

- **`src/engine/`** — pure game logic. **Must have zero DOM/browser dependencies** so
  the whole ruleset is unit-testable headlessly. All randomness goes through an
  injected `Rng = () => number` (default `Math.random`); never call `Math.random`
  directly inside the engine.
- **`src/ui/`** — rendering and lifecycle. Rendering is a **pure function of engine
  state + editor state**, re-run after every update and every keystroke. Do not port
  the original's incremental "erase planes, move, redraw planes" approach.

`src/ui/app.ts` owns the clock: a self-chaining `setTimeout` (never `setInterval`), so
a forced update (empty Return) and pause/resume can cleanly reset the interval.

`src/data/*.atc` are **verbatim copies of the original level files**, imported with
Vite's `?raw` suffix and parsed at runtime by `src/engine/parser.ts`. Do not reformat,
"clean up" or hand-convert them to JSON.

## Conventions specific to this codebase

- **Naming**: a playable map is a **level** (`LevelDef`, `parseLevel`,
  `BUILTIN_LEVELS`, "level files"); `Game` means the running session only.
- **Deliberate deviations are enumerated in `DOCS.md` §8.** Several original bugs are
  fixed and several quirks are **deliberately preserved**. Do not "helpfully" fix a
  preserved quirk, and do not reintroduce a fixed bug. If you think a preserved quirk
  should change, ask first.
- **All relative turn commands (`tl`, `tr`, `tL`, `tR`, `t-`, `t+`) are removed.**
  `t` takes only an absolute direction (`t<dir>`) or a towards-target (`tt<b|*|e|a><n>`).
- **Message strings are part of the contract.** Every error and loss message is listed
  in `DOCS.md` §3.4 and §4.3, and tests assert them literally.
- **Coordinates**: `y` increases **downward**; direction 0 is North and indices run
  clockwise. Each radar cell occupies **two screen columns** — cell `(x, y)` renders at
  column `2*x`. This 2:1 mapping is the most common source of off-by-one errors.
- **`dirFromDxDy` must truncate, not round** — it reproduces the original's C
  `(int)` cast: `Math.trunc(Math.atan2(dy, dx) * 8 / (2 * Math.PI) + 2.5 + 8) % 8`.
- **Circle turn tables are literals, not formulas.** They encode the original's
  odd→even heading convergence. A test asserts `CIRCLE_CCW` is the exact mirror of
  `CIRCLE_CW`.
- **Commands are typed intents, not field-by-field mutation.** Each intent names
  exactly the plane fields it writes. Reverting to comparison-based commit logic
  reintroduces an original bug where a redundant command cancelled a pending one.
- **No runtime dependencies.** Dev dependencies are limited to `typescript`, `vite`,
  `vitest` and `prettier`. No UI framework.
