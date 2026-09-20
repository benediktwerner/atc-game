# Copilot instructions for `atc`

A clean-room TypeScript re-implementation of the BSD Games `atc` (air traffic
controller) console game, shipped as a static web page.

## Repository state

The application is scaffolded and implemented as a Vite static site. `src/engine/`
contains the headless game rules, `src/ui/` contains the DOM application, `src/data/`
contains verbatim scenario files, and `test/` contains Vitest coverage. `PLAN.md` §14
remains the acceptance checklist for behaviour changes.

## Document hierarchy (read this before changing behaviour)

Three documents describe the same game at different stages. When they disagree, the
later one wins:

1. **`orig/`** — the original C source (NetBSD/Debian bsd-games lineage). Read-only
   historical reference. **Never modify anything under `orig/`.** It is the ground
   truth for _what the original did_, and outranks `orig/MANPAGE` / `orig/atc.6.in`,
   which document several features the code never implemented.
2. **`SPEC.md`** — an exhaustive, language-neutral description of the original's
   observable behaviour, derived from `orig/`. Authoritative for _game rules_.
3. **`PLAN.md`** — the implementation plan for the TypeScript port. **Authoritative
   overall**: where `PLAN.md` and `SPEC.md` conflict, `PLAN.md` wins.

**Never guess game mechanics.** If a rule, constant, message string or edge case is
unclear, verify it against the C source in `orig/` and cite the file. If it cannot be
determined from `orig/`, ask rather than inventing behaviour.

Finding things in `orig/`:

| file                 | contains                                                            |
| -------------------- | ------------------------------------------------------------------- |
| `update.c`           | simulation tick, movement, turning, loss conditions, plane spawning |
| `input.c`            | command state machine, semantic validators, error strings           |
| `graphics.c`         | radar/info/input/credit rendering, quit & loss screens              |
| `grammar.y`, `lex.l` | scenario-file parser and its validation rules                       |
| `log.c`              | score file format and ranking                                       |
| `def.h`, `struct.h`  | constants and data structures                                       |
| `games/`             | the 15 scenario definitions + `Game_List` (order matters)           |

## Commands

```bash
npm install
npm run dev                  # Vite dev server
npm run build                # static bundle -> dist/
npm test                     # full test suite
npx vitest run test/engine.test.ts               # one file
npx vitest run test/engine.test.ts -t "directions" # one test by name
npx vitest                   # watch mode
```

There is no linter configured. `SPEC.md` is Prettier-formatted markdown (padded
tables); keep new markdown consistent with that.

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

`src/data/*.atc` are **verbatim copies** of `orig/games/*`, imported with Vite's
`?raw` suffix and parsed at runtime by `src/engine/parser.ts`. Do not reformat,
"clean up" or hand-convert them to JSON.

## Conventions specific to this codebase

- **Deliberate deviations are enumerated in `PLAN.md` §3.** Bugs #6–#11 from
  `SPEC.md` §12 are fixed; other quirks in §3.4 are **deliberately preserved**. Do not
  "helpfully" fix a preserved quirk, and do not reintroduce a fixed bug. If you think
  a §3.4 quirk should change, ask first.
- **All relative turn commands (`tl`, `tr`, `tL`, `tR`, `t-`, `t+`) are removed.**
  `t` takes only an absolute direction (`t<dir>`) or a towards-target (`tt<b|*|e|a><n>`).
- **Message strings are part of the contract.** Every error and loss message is
  reproduced verbatim from the original (`SPEC.md` §7.1, §8.5) except `exceeded flight
ceiling.` and `Altitude not changed`. Tests assert them literally.
- **Coordinates**: `y` increases **downward**; direction 0 is North and indices run
  clockwise. Each radar cell occupies **two screen columns** — cell `(x, y)` renders at
  column `2*x`. This 2:1 mapping is the most common source of off-by-one errors.
- **`dirFromDxDy` must truncate, not round** — it reproduces the original's C
  `(int)` cast: `Math.trunc(Math.atan2(dy, dx) * 8 / (2 * Math.PI) + 2.5 + 8) % 8`.
- **Circle turn tables are literals, not formulas** (`PLAN.md` §7.4). They encode the
  original's odd→even heading convergence. A test asserts `CIRCLE_CCW` is the exact
  mirror of `CIRCLE_CW`.
- **Commands are typed intents, not field-by-field mutation** (`PLAN.md` §8.5). Each
  intent names exactly the plane fields it writes. This is the fix for bug #9; reverting
  to comparison-based commit logic reintroduces it.
- **No runtime dependencies.** Dev dependencies are limited to `typescript`, `vite`
  and `vitest`. No UI framework.
