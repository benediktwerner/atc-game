# ATC — Implementation Plan (TypeScript / static web page)

This is a complete, self-contained implementation plan for a clean re-implementation of
the BSD `atc` game as a static web page.

**Read `SPEC.md` first.** It is the authoritative description of the original game's
rules. This document specifies _what to build_, _how to structure it_, and
**every intentional deviation** from `SPEC.md`. Where this plan and `SPEC.md`
disagree, **this plan wins**.

---

## 1. Goal

A single-page, fully client-side web game that reproduces the gameplay of BSD `atc`
with a terminal aesthetic, replacing all CLI/terminal-specific mechanisms with
browser-native equivalents.

Non-goals: multiplayer, server-side anything, mobile/touch support, i18n,
custom-scenario authoring UI.

---

## 2. Tech stack & deliverable

| item         | choice                                                                         |
| ------------ | ------------------------------------------------------------------------------ |
| Language     | TypeScript, `strict: true`                                                     |
| Build        | Vite (library-free; no UI framework)                                           |
| Tests        | Vitest (engine unit tests, jsdom not required except for a few UI helpers)     |
| Output       | `npm run build` → static bundle in `dist/` (HTML + JS + CSS, no server needed) |
| Runtime deps | none                                                                           |
| Dev deps     | `typescript`, `vite`, `vitest`                                                 |

`index.html` at the repo root, `src/` for sources, `test/` for tests.
The build must produce a `dist/` that works when opened from a static file server.

---

## 3. Deviations from SPEC.md (authoritative delta list)

### 3.1 Bugs that are fixed

| SPEC §12  | Original behaviour                                                                                                                    | New behaviour                                                                                                                                                                                                                                    |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **#8**    | `cl`/`cr` documented but unimplemented; circling is always clockwise                                                                  | `cl` (counter-clockwise) and `cr` (clockwise) are implemented. Plain `c` = clockwise. See §7.4 for the exact turn tables.                                                                                                                        |
| **#9**    | Command commit used three mutually exclusive branches, so e.g. a redundant altitude command silently cancelled a pending delayed turn | A command is modelled as a typed intent that names exactly the fields it changes; only those fields are written. See §8.5.                                                                                                                       |
| **#10**   | Message reads `exceded flight ceiling.`                                                                                               | `exceeded flight ceiling.`                                                                                                                                                                                                                       |
| **#7**    | Typing `?` entered a dead-end state escapable only with Backspace                                                                     | `?` is a transient hint: it prints the list of valid next characters in the message row and does **not** consume a command slot or change state. Any subsequent keystroke is processed normally and clears the hint.                             |
| **#6**    | `ac0` / `ad0` silently did nothing (the guard compared against NUL instead of `'0'`)                                                  | `ac0` / `ad0` produce the error `Altitude not changed`. (Original literal was lower-case `altitude not changed`; capitalised here for consistency with every other message.)                                                                     |
| **#11**   | Origin-selection retry loop could never retry an airport origin                                                                       | Origin selection is a clean bounded retry loop (§7.6). Behaviourally equivalent: airport origins are still always accepted, including onto an airport that already has a plane waiting — this matches the original and is **deliberately kept**. |
| index > 9 | Beacon/exit/airport index 10+ rendered as `:`, `;`, … and was unaddressable by the single-digit command grammar                       | The game-file validator **rejects** any game defining more than 10 exits, beacons or airports. All 15 shipped games comply (the maximum is exactly 10).                                                                                          |

### 3.2 Features removed

- **All relative turn commands are removed**: `tl`, `tr`, `t-`, `t+`, `tL`, `tR`,
  and the `tl<dir>` / `tr<dir>` forms. The `t` command now only supports
  `t<dir>` (absolute heading) and `tt<b|*|e|a><n>` (turn towards).
  The old state 6 and the `rel_dir` / `left` / `right` / `Left` / `Right` actions
  disappear entirely.
- **Ctrl-L (redraw)** — removed; the DOM always shows current state.
- **`!` (shell escape)** — removed.
- **Command-line flags** — replaced by the HTML UI (§9).
- **`---- more ----` info-panel truncation** — replaced by a scrollable panel.
- **The shared score file**, `host` column, file locking, setgid handling —
  replaced by `localStorage` (§10).

### 3.3 Features changed or added

- **Escape pauses the game.** The pause overlay completely hides the game state and
  offers Continue / Restart / Quit (§9.6). The game also auto-pauses when the tab
  becomes hidden. Paused time is excluded from the recorded real time.
- **Circling display**: the info panel shows `Circle R` or `Circle L` (never plain
  `Circle`).
- **Invalid keystroke feedback**: the original rang the terminal bell. Replaced by a
  brief visual flash of the input row (CSS animation). No audio.
- **Delayed commands no longer freeze steering.** In the original, setting a delay
  suppressed the turn step entirely (`if (!pp->delayd)`), so the plane flew dead
  straight to the beacon and any turn already in progress was silently abandoned.
  That was forced by the original having a single `new_dir` field doing double duty as
  both the active and the deferred heading. Here a plane carries two independent
  fields — `heading` (executing now) and `pending` (deferred until a beacon) — and it
  keeps executing `heading` normally, turning and all, until it reaches the beacon.
- **The "beacon is in flight path" check is now exact.** The original accepted any
  beacon lying in the same 45° octant as the current heading, so it happily accepted
  beacons the plane would visibly miss. It is replaced by a forward simulation of the
  plane's actual future path (§7.7).
- **New error `Plane is circling`.** A circling plane's path is a closed loop, so it
  can never reach a distant beacon; delayed commands are rejected outright with this
  message rather than a misleading "not in flight path".
- **`Already going in that direction`** (for `tt…@b<n>`) now compares against the
  direction the plane will actually have _on arrival at the beacon_, not its direction
  at the time the command is typed.
- **In-progress altitude changes are made visible.** The original displayed only the
  plane's _current_ altitude, never `new_altitude`, so a climb or descent — and a
  ground plane already cleared for take-off — was indistinguishable from a plane with
  no altitude command. The info panel now appends ` ↑<n>` / ` ↓<n>` (§9.3) and the
  radar's altitude digit is over/underlined while changing (§9.2). The info panel is
  widened from 20 to 24 columns to accommodate this.
- **Randomness**: there is no seed input. The engine takes an injectable
  `Rng = () => number` (default `Math.random`) purely so tests can be deterministic.
  Exact reproduction of glibc `random()` sequences is explicitly **not** a goal.
- **Score table semantics** are simplified (§10.2).

### 3.4 Quirks deliberately preserved

- Circling preserves the original's odd→even heading convergence (§7.4).
- Prop planes move only on even ticks; jets every tick.
- Multiple planes may queue on the ground at one airport.
- An **immediate** heading command supersedes and clears any pending delayed command.
  (In the original this fell out of `setplane` doing `p.delayd = 0` on the draft copy,
  which is also what caused bug #9; here it is an explicit, deliberate rule that
  applies to heading commands _only_. Altitude and mark/unmark/ignore commands no
  longer affect the pending command.)
- All original error and loss message wordings, except `exceeded` and
  `Altitude not changed`.
- The credit area text `ATC - by Ed James`.

---

## 4. Repository layout

```
atc/
  index.html
  package.json
  tsconfig.json
  vite.config.ts
  SPEC.md
  PLAN.md
  src/
    main.ts                  bootstrap, screen router
    engine/
      types.ts               shared domain types & enums
      dir.ts                 direction tables & conversions
      rng.ts                 Rng type + helpers
      gamedef.ts             GameDef type
      parser.ts              game-file lexer + parser + validator
      game.ts                Game class: state, update loop, spawn, loss
      commands.ts            command grammar, parsing, validation, application
      format.ts              info-line and duration formatting
    data/
      index.ts               ordered list of built-in games (raw text imports)
      default.atc  easy.atc  crossover.atc  Killer.atc  game_2.atc
      Atlantis.atc  OHare.atc  Tic-Tac-Toe.atc  airports.atc  box.atc
      crosshatch.atc  game_3.atc  game_4.atc  novice.atc  two-corners.atc
    ui/
      app.ts                 wires Game <-> DOM, owns the clock & lifecycle
      radar.ts               static radar layer + span-grid renderer
      info.ts                plane info panel renderer
      input.ts               input area renderer (echo / caret / message rows)
      keyboard.ts            key event -> engine token mapping
      screens.ts             start / pause / game-over overlays
      scores.ts              localStorage high-score table
      styles.css
  test/
    parser.test.ts
    dir.test.ts
    update.test.ts
    commands.test.ts
    format.test.ts
    scores.test.ts
```

The `.atc` files are **verbatim copies** of `orig/games/*` (same content, renamed with
an extension). They are imported with Vite's `?raw` suffix.

---

## 5. Domain types (`src/engine/types.ts`)

```ts
export type Dir = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface Point {
  x: number;
  y: number;
}
export interface Exit extends Point {
  dir: Dir;
}
export interface Airport extends Point {
  dir: Dir;
}
export type Beacon = Point;
export interface Line {
  p1: Point;
  p2: Point;
}

export type PlaneKind = 'prop' | 'jet';
export type MarkStatus = 'marked' | 'unmarked' | 'ignored';
export type DestType = 'exit' | 'airport';

/** What a plane is currently commanded to do about its heading. */
export type HeadingCmd =
  { kind: 'fixed'; dir: Dir } | { kind: 'circle'; turn: 'cw' | 'ccw' };

export interface Plane {
  id: number; // 0..25, letter index
  kind: PlaneKind;
  status: MarkStatus;
  origType: DestType;
  origNo: number;
  destType: DestType;
  destNo: number;
  x: number;
  y: number;
  dir: Dir;
  heading: HeadingCmd; // the command currently being executed
  /** A command deferred until the plane reaches `beacon`. Replaces delayd/delayd_no. */
  pending: { heading: HeadingCmd; beacon: number } | null;
  altitude: number; // 0..9
  newAltitude: number; // 0..9
  fuel: number;
}
```

Notes:

- `HeadingCmd` replaces the original's `new_dir` int with the `8` sentinel. "Is
  circling" becomes `heading.kind === 'circle'`.
- The original's single `new_dir` field had to serve as both the active and the
  deferred heading, which is why setting a delay froze steering. Splitting it into
  `heading` + `pending` removes that limitation (§3.3).
- Plane letter: `kind === 'prop' ? String.fromCharCode(65 + id) : String.fromCharCode(97 + id)`.
- Letter → id: uppercase or lowercase letter → `0..25` (case-insensitive).

---

## 6. Game definitions (`src/engine/parser.ts`, `src/data/`)

### 6.1 `GameDef`

```ts
export interface GameDef {
  name: string; // e.g. "default"
  updateSecs: number;
  newplane: number;
  width: number;
  height: number;
  exits: Exit[];
  beacons: Beacon[];
  airports: Airport[];
  lines: Line[];
}
```

### 6.2 Parser

Implement a small hand-written lexer + recursive-descent parser for the format in
`SPEC.md` §3. It must accept every shipped game file unchanged.

**Lexer tokens**: integer, one of the keywords `height|width|newplane|update|airport|line|exit|beacon`,
a direction letter from `wedcxzaq`, or a single punctuation character from `= ; : ( ) [ ]`.
Whitespace is skipped; `#` runs to end of line. Track line numbers for error messages.

Keep the original's greedy keyword matching (keywords are matched before direction
letters, and are matched even when immediately followed by other letters). A simple
way to match the original: scan `[A-Za-z]+`; if the run _starts with_ a keyword, emit
that keyword and push back the remainder; otherwise if it is a single direction letter,
emit a direction token; otherwise error.

**Parser**: the four `key = int ;` definitions first (in any order, each at most once),
then any number of `beacon:`/`exit:`/`airport:`/`line:` sections.

**Validation** — implement every rule from `SPEC.md` §3.3, with identical messages:

- `'width'|'height'|'update'|'newplane' undefined.`
- `Redefinition of 'X'.`
- `'update'|'newplane' is too small.` (value < 1)
- `'width'|'height' is too small.` (value < 3)
- `X value out of range.` / `Y value out of range.`
- `edge value not on edge.`
- `Bad direction for entrance at exit.` (use the 3×3 table in SPEC §3.3)
- `Bad line endpoints.`
- `Need at least 2 airports and/or exits.`
- **NEW**: `Too many exits (max 10).` / `Too many beacons (max 10).` /
  `Too many airports (max 10).`

Errors are collected (not thrown one at a time) and reported as
`"<name>": line <n>: <message>`. `parseGame()` returns `GameDef` or throws an
`Error` containing the joined messages. Since the built-in games are known-good, a
parse failure is a programming error and may surface as a fatal start-screen message.

### 6.3 `src/data/index.ts`

```ts
import defaultGame from './default.atc?raw';
// ...
export interface BuiltinGame {
  name: string;
  source: string;
}
export const BUILTIN_GAMES: BuiltinGame[] = [/* in Game_List order */];
```

Order (first is the default selection):
`default, easy, crossover, Killer, game_2, Atlantis, OHare, Tic-Tac-Toe, airports,
box, crosshatch, game_3, game_4, novice, two-corners`.

---

## 7. Engine (`src/engine/game.ts`)

### 7.1 Direction tables (`src/engine/dir.ts`)

```ts
export const DX: readonly number[] = [0, 1, 1, 1, 0, -1, -1, -1];
export const DY: readonly number[] = [-1, -1, 0, 1, 1, 1, 0, -1];
export const DEG: readonly number[] = [0, 45, 90, 135, 180, 225, 270, 315];
export const DIR_KEYS = 'wedcxzaq'; // index == dir
export function dirFromKey(k: string): Dir | null;
export function dirFromDxDy(dx: number, dy: number): Dir;
```

Plane-letter helpers also live here:

```ts
export function letterOf(p: Plane): string; // 'prop' -> A..Z, 'jet' -> a..z
export function idFromLetter(ch: string): number | null; // case-insensitive, 0..25
```

`dirFromDxDy` **must** reproduce the original formula exactly, including truncation:

```ts
Math.trunc((Math.atan2(dy, dx) * 8) / (2 * Math.PI) + 2.5 + 8) % 8;
```

(The argument is always positive so `Math.trunc` == `Math.floor` here; keep `trunc`
to mirror the C cast.) Verify against the worked examples in `SPEC.md` §2.3.

### 7.2 Game state

```ts
export class Game {
  readonly def: GameDef;
  clock = 0;
  safePlanes = 0;
  readonly air: Plane[] = []; // kept sorted ascending by id
  readonly ground: Plane[] = []; // kept sorted ascending by id
  private lastPlaneId = -1;
  constructor(
    def: GameDef,
    private rng: Rng = Math.random,
  ) {}
}
```

`GameOver` is represented by a result object, never by throwing from deep inside:

```ts
export interface GameOver {
  planeLetter: string | null;
  message: string;
}
```

`update()` returns `GameOver | null`. Once a game is over the caller stops the clock
and ignores further input.

Both lists are kept sorted by `id` on insert (simple insertion into the array).

### 7.3 Constants

```ts
export const MAX_ALTITUDE = 9;
export const ENTRY_ALTITUDE = 7;
export const EXIT_ALTITUDE = 9;
export const LOW_FUEL = 15;
export const MAX_PLANES = 26;
export const SPAWN_CLEARANCE = 4;
export const COLLISION_DISTANCE = 1;
export const MAX_TURN_PER_MOVE = 2;
export const NUM_SCORES = 18;
```

These constants are the single source of truth: the update loop and the validators
**must** reference them rather than repeating the literals `9`, `1`, `4`, `2`.

### 7.3a Randomness (`src/engine/rng.ts`)

```ts
export type Rng = () => number; // uniform in [0, 1)

/** Uniform integer in [0, n). Mirrors the original's `rand() % n`. */
export function randInt(rng: Rng, n: number): number {
  return Math.floor(rng() * n);
}
```

`Game` stores the `Rng` and exposes a private `randInt(n)` wrapper, which is what the
rest of this document means when it writes `randInt(...)`. Tests inject a scripted
`Rng` (e.g. an array of values cycled through) to make spawning and plane types
deterministic. The engine must never call `Math.random` directly.

### 7.4 Turning

```ts
/** Shortest-path turn toward a fixed heading, clamped to +-2 steps. */
function stepToward(dir: Dir, target: Dir): Dir {
  let d = target - dir;
  if (d > 4) d -= 8;
  else if (d < -4) d += 8;
  d = Math.max(-2, Math.min(2, d));
  return ((dir + d + 8) % 8) as Dir;
}

/** Circling. Preserves the original's odd->even convergence; CCW is its mirror. */
const CIRCLE_CW = [2, 3, 4, 5, 6, 7, 0, 0] as const;
const CIRCLE_CCW = [6, 0, 0, 1, 2, 3, 4, 5] as const;
```

`CIRCLE_CW[d]` is exactly the original's result of `new_dir = 8` (note the asymmetry at
`d = 6` and `d = 7`, both mapping to `0`). `CIRCLE_CCW` is the mirror image under the
reflection `d ↦ (8 - d) mod 8`, i.e. `CIRCLE_CCW[d] = (8 - CIRCLE_CW[(8 - d) % 8]) % 8`.
Both tables must be present as literals _and_ covered by a unit test asserting the
mirror relation.

Resulting new heading for one move:

```ts
/** The heading after one move, given a current direction and a heading command. */
export function nextDirFrom(dir: Dir, cmd: HeadingCmd): Dir {
  if (cmd.kind === 'circle')
    return (cmd.turn === 'cw' ? CIRCLE_CW : CIRCLE_CCW)[dir] as Dir;
  return stepToward(dir, cmd.dir);
}

export function nextDir(p: Plane): Dir {
  return nextDirFrom(p.dir, p.heading);
}
```

`nextDirFrom` is the single implementation of "one step of steering". Both the update
loop (§7.5 step 3.4) and `projectPath` (§7.7) call it, which is what guarantees the
projected path matches what the simulation will actually do.

### 7.5 `update(): GameOver | null`

Implements `SPEC.md` §6 verbatim, in this exact order:

1. `clock++`.
2. **Take-offs**: move every plane in `ground` with `newAltitude > 0` into `air`
   (preserving id order).
3. **Per-plane movement** over `air` in id order. For each plane `p`:
   1. If `p.kind === 'prop' && clock % 2 === 1` → skip this plane entirely.
   2. `p.fuel--`; if `p.fuel < 0` → lose `ran out of fuel.`
   3. `p.altitude += Math.sign(p.newAltitude - p.altitude)`.
   4. `p.dir = nextDir(p)` — **always**, whether or not a command is pending
      (deviation from the original, see §3.3).
   5. `p.x += DX[p.dir]; p.y += DY[p.dir];`
   6. If `p.pending !== null` and `(p.x, p.y)` equals `beacons[p.pending.beacon]`:
      set `p.heading = p.pending.heading; p.pending = null;` and if
      `p.status === 'unmarked'` set `p.status = 'marked'`.
      (Because the turn in step 4 already happened, the newly adopted command first
      takes effect on the _next_ update — same as the original.)
   7. **Destination check**:
      - `destType === 'airport'` and position equals the destination airport and
        `altitude === 0`:
        - `p.dir !== airport.dir` → lose `landed in the wrong direction.`
        - else mark the plane as _gone_ and skip the remaining checks.
      - `destType === 'exit'` and position equals the destination exit:
        - `altitude !== 9` → lose `exited at the wrong altitude.`
        - else mark as _gone_ and skip the remaining checks.
   8. `altitude > 9` → lose `exceeded flight ceiling.`
   9. `altitude <= 0`:
      - over any airport → lose `landed at the wrong airport.` if
        `destType === 'airport'`, else `landed instead of exited.`
      - otherwise → lose `crashed on the ground.`
   10. `x < 1 || x >= width-1 || y < 1 || y >= height-1`:
       - at any exit → lose `exited via the wrong exit.` if `destType === 'exit'`,
         else `exited instead of landed.`
       - otherwise → lose `illegally left the flight arena.`
4. **Reap**: remove _gone_ planes from `air`, incrementing `safePlanes` for each.
5. **Collisions**: for every pair `(i, j)` with `i < j` in `air` (id order), if
   `tooClose(a, b, 1)` → lose `collided with plane '<letter(b)>'.` attributed to `a`.
6. **Spawn**: if `randInt(def.newplane) === 0` → `addPlane()`.

`tooClose(a, b, d)` = `|a.altitude-b.altitude| <= d && |a.x-b.x| <= d && |a.y-b.y| <= d`.

"Gone" is best modelled as a local `Set<Plane>` collected during step 3 rather than a
`status` value, keeping `MarkStatus` a clean three-value type.

Losing: return `{ planeLetter: letter(p), message }` immediately; the caller treats the
game as over. Do **not** mutate further state after a loss.

### 7.6 `addPlane(): void`

Called once before the first update, and from step 6 of `update()`.

```
kind      = randInt(2) === 0 ? 'prop' : 'jet'
starts    = exits.length + airports.length
destIdx   = randInt(starts)
dest      = destIdx < exits.length ? {exit, destIdx} : {airport, destIdx - exits.length}

for attempt in 0 .. starts-1:
    origIdx = randInt(starts) repeated until origIdx !== destIdx
    if origIdx < exits.length:
        candidate origin = exit[origIdx]
        position = exit pos, dir = heading = exit.dir, altitude = newAltitude = 7
        if any plane in `air` satisfies tooClose(that, candidate, 4): continue
    else:
        candidate origin = airport[origIdx - exits.length]
        position = airport pos, dir = heading = airport.dir, altitude = newAltitude = 0
        (no proximity check — airport origins are always accepted)
    fuel = width + height
    accepted -> break
else: return                      // could not place a plane; do nothing

id = nextPlaneId(); if id === null: return
status = 'marked'; pending = null
push into `ground` if origin is an airport else `air`, keeping id order
```

`nextPlaneId()`: round-robin over `0..25` starting after `lastPlaneId`, returning the
first id not currently used by any plane in `air` or `ground`; `null` if all 26 are
taken. `lastPlaneId` persists for the lifetime of the `Game`.

Notes:

- The bounded retry of at most `starts` attempts is the fix for quirk #11.
- If `airports.length === 0`, all planes are exit→exit.
- Origin can never equal destination.

### 7.7 `projectPath(plane, def): PathStep[]`

Simulates a plane's future path assuming its **current** heading command keeps
running unchanged. Used only by the command validator (§8.5); the update loop does not
call it.

```ts
export interface PathStep {
  x: number;
  y: number;
  dir: Dir;
}

export function projectPath(plane: Plane, def: GameDef): PathStep[] {
  const path: PathStep[] = [];
  const seen = new Set<string>();
  let { x, y, dir } = plane;
  for (;;) {
    dir = nextDirFrom(dir, plane.heading); // same rule as nextDir(), step 4
    x += DX[dir];
    y += DY[dir];
    // Leaving the interior ends the flight (exits sit on the border).
    if (x < 1 || x >= def.width - 1 || y < 1 || y >= def.height - 1)
      return path;
    const key = `${x},${y},${dir}`;
    if (seen.has(key)) return path; // closed loop (circling)
    seen.add(key);
    path.push({ x, y, dir });
  }
}
```

Points to get right:

- Turn **then** move, mirroring `update()` steps 4–5, so the first `PathStep` is the
  cell the plane occupies after its next move.
- Altitude is deliberately ignored: this is a purely geometric reachability test, not
  a prediction of whether the plane will survive the trip.
- The interior bound is `1 <= x <= width-2`, `1 <= y <= height-2`, matching the
  arena-bounds loss check. Beacons are validated to lie inside it, so stopping at the
  border never hides a reachable beacon.
- Termination: with a fixed heading the plane straightens out within at most two moves
  and then flies a straight line off the board. The `seen` guard exists for circling,
  whose path is a closed loop — a circling plane returns to its exact starting cell
  every four moves (turn-then-move traces a 2×2 square; an odd starting heading takes
  four transient steps before joining the same loop).
- **`plane.pending` is deliberately ignored.** A plane has exactly one pending slot, so
  the delayed command now being validated will _replace_ any existing one (§8.5).
  The old pending command will therefore never fire, and the plane really will fly
  `heading` indefinitely. Following the existing `pending` here would validate against
  a future that the command being validated is about to cancel.

---

## 8. Commands (`src/engine/commands.ts`)

### 8.1 Model

The input area runs an incremental token consumer driven by the keyboard. Its state:

```ts
interface Frag {
  text: string; // echoed text for this token
  col: number; // column where `text` starts
  state: StateId; // the state the editor was in BEFORE consuming this token
  ch: string; // the key that produced it
}
interface Editor {
  frags: Frag[]; // pushed tokens, in order
  state: StateId; // current state
  col: number; // next echo column
  message: string; // error or hint text (row 2)
  caretUnder: { col: number; len: number } | null; // row 1 '^' run
}
```

- `col` starts at 0; each accepted token appends its echo text and advances `col`.
- **Backspace** pops the last fragment, restoring `state` and `col` from that
  fragment's `state` and `col` fields (which is why `Frag.state` is the _pre_-token
  state); if `frags` is empty, flash.
- **Ctrl-U** pops all fragments, resetting to `state = Start`, `col = 0`.
- Any keystroke clears `message` and `caretUnder` first.

### 8.2 Grammar (after removing relative turns)

States, rules in declaration order. `DIGIT` matches `0-9`; `ENTER` matches Return.
`?` is handled globally (§8.4) and is not a rule.

| state          | key    | → state    | echo            | action                   |
| -------------- | ------ | ---------- | --------------- | ------------------------ |
| **Start**      | letter | Cmd        | `<ch>:`         | `selectPlane`            |
|                | ENTER  | _done_     | ``              | _(forced update)_        |
|                | _hint_ |            |                 | ` [a-z]<ret>`            |
| **Cmd**        | `t`    | Turn       | ` turn`         | `requireAirborneForTurn` |
|                | `a`    | Alt        | ` altitude:`    | —                        |
|                | `c`    | Circle     | ` circle`       | `circle('cw')`           |
|                | `m`    | End        | ` mark`         | `mark`                   |
|                | `u`    | End        | ` unmark`       | `unmark`                 |
|                | `i`    | End        | ` ignore`       | `ignore`                 |
|                | _hint_ |            |                 | ` tacmui`                |
| **Circle**     | `l`    | Delayable  | ` left`         | `circle('ccw')`          |
|                | `r`    | Delayable  | ` right`        | `circle('cw')`           |
|                | `@`    | DelayKey   | ` at`           | —                        |
|                | `a`    | DelayKey   | ` at`           | —                        |
|                | ENTER  | _done_     | ``              | —                        |
|                | _hint_ |            |                 | ` lr@a<ret>`             |
| **Turn**       | `t`    | Towards    | ` towards`      | —                        |
|                | `w`    | Delayable  | ` to 0`         | `setHeading(0)`          |
|                | `e`    | Delayable  | ` to 45`        | `setHeading(1)`          |
|                | `d`    | Delayable  | ` to 90`        | `setHeading(2)`          |
|                | `c`    | Delayable  | ` to 135`       | `setHeading(3)`          |
|                | `x`    | Delayable  | ` to 180`       | `setHeading(4)`          |
|                | `z`    | Delayable  | ` to 225`       | `setHeading(5)`          |
|                | `a`    | Delayable  | ` to 270`       | `setHeading(6)`          |
|                | `q`    | Delayable  | ` to 315`       | `setHeading(7)`          |
|                | _hint_ |            |                 | ` t<dir>`                |
| **Towards**    | `b`    | TowardsNum | ` beacon #`     | `setTarget('beacon')`    |
|                | `*`    | TowardsNum | ` beacon #`     | `setTarget('beacon')`    |
|                | `e`    | TowardsNum | ` exit #`       | `setTarget('exit')`      |
|                | `a`    | TowardsNum | ` airport #`    | `setTarget('airport')`   |
|                | _hint_ |            |                 | ` b*ea`                  |
| **TowardsNum** | DIGIT  | Delayable  | `<ch>`          | `towardsIndex`           |
|                | _hint_ |            |                 | ` [0-9]`                 |
| **Delayable**  | `@`    | DelayKey   | ` at`           | —                        |
|                | `a`    | DelayKey   | ` at`           | —                        |
|                | ENTER  | _done_     | ``              | —                        |
|                | _hint_ |            |                 | ` @a<ret>`               |
| **DelayKey**   | `b`    | DelayNum   | ` beacon #`     | —                        |
|                | `*`    | DelayNum   | ` beacon #`     | —                        |
|                | _hint_ |            |                 | ` b*`                    |
| **DelayNum**   | DIGIT  | End        | `<ch>`          | `delayAtBeacon`          |
|                | _hint_ |            |                 | ` [0-9]`                 |
| **Alt**        | `+`    | AltRel     | ` climb`        | `setAltDir('up')`        |
|                | `c`    | AltRel     | ` climb`        | `setAltDir('up')`        |
|                | `-`    | AltRel     | ` descend`      | `setAltDir('down')`      |
|                | `d`    | AltRel     | ` descend`      | `setAltDir('down')`      |
|                | DIGIT  | End        | ` <ch>000 feet` | `setAbsoluteAltitude`    |
|                | _hint_ |            |                 | ` +-cd[0-9]`             |
| **AltRel**     | DIGIT  | End        | ` <ch>000 ft`   | `setRelativeAltitude`    |
|                | _hint_ |            |                 | ` [0-9]`                 |
| **End**        | ENTER  | _done_     | ``              | —                        |
|                | _hint_ |            |                 | ` <ret>`                 |

Rules are matched in order; the first match wins. No match → flash (§9.5).

Note: a letter key matches the `letter` rule in **Start** only; in every other state
only the explicitly listed characters match.

### 8.3 Resulting user-facing command set

Prefix: the plane letter (case-insensitive).

**Immediate only** (cannot be delayed): `a<n>`, `ac<n>`/`a+<n>`, `ad<n>`/`a-<n>`,
`m`, `u`, `i`.

**Delayable** (optional `@b<n>` / `@*<n>` / `ab<n>` / `a*<n>` suffix):
`c`, `cr`, `cl`, `t<dir>` (`dir` ∈ `wedcxzaq`), `ttb<n>`, `tt*<n>`, `tte<n>`, `tta<n>`.

### 8.4 `?` help

`?` is intercepted before rule matching. It sets `message` to the current state's hint
string and returns without modifying `frags`, `state` or `col`. The next keystroke
clears the message. This is the fix for quirk #7.

### 8.5 Semantic validation and the intent model

Actions run left-to-right over a **draft** as tokens are _committed_ — i.e. all actions
are executed once, in order, when the command terminates (matching the original, so
that error positions refer to the right fragment).

```ts
interface Draft {
  plane: Plane | null; // set by selectPlane; live ref, never mutated
  // heading branch
  heading?: HeadingCmd;
  delayBeacon?: number;
  target?: { type: 'beacon' | 'exit' | 'airport'; index: number };
  // altitude branch
  altitude?: number; // resolved absolute target
  relDir?: 'up' | 'down';
  // status branch
  status?: MarkStatus;
}
```

The draft starts as `{ plane: null }`. `selectPlane` is always the first action (it is
the only action on the **Start** state's only non-ENTER rule), so every later action
may assume `draft.plane !== null`; assert it rather than threading optionality.

An action returns `null` on success or an error string. On the first error, the run
stops, `caretUnder` is set to that fragment's `{col, len}` and `message` to the error;
the command is discarded.

| action                    | behaviour                                                                                                                 | errors                                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `selectPlane(ch)`         | find plane by letter in `air` then `ground`; store in `draft.plane`                                                       | `Unknown Plane`                                                                                                  |
| `requireAirborneForTurn`  | —                                                                                                                         | `Planes at airports may not change direction` if `altitude === 0`                                                |
| `circle(turn)`            | `draft.heading = { kind:'circle', turn }`                                                                                 | `Planes cannot circle on the ground` if `altitude === 0`                                                         |
| `setHeading(d)`           | `draft.heading = { kind:'fixed', dir: d }`                                                                                | —                                                                                                                |
| `setTarget(t)`            | `draft.target = { type: t, index: -1 }`                                                                                   | —                                                                                                                |
| `towardsIndex(ch)`        | `n = ch - '0'`; store index; `draft.heading = { kind:'fixed', dir: dirFromDxDy(target.x - plane.x, target.y - plane.y) }` | `Unknown beacon` / `Unknown exit` / `Unknown airport` if `n >= count`                                            |
| `delayAtBeacon(ch)`       | see below                                                                                                                 | see below                                                                                                        |
| `setAltDir(d)`            | `draft.relDir = d`                                                                                                        | —                                                                                                                |
| `setAbsoluteAltitude(ch)` | `draft.altitude = ch - '0'`                                                                                               | `Already at that altitude` if `plane.altitude === n && plane.newAltitude === n`                                  |
| `setRelativeAltitude(ch)` | `n = ch - '0'`; `draft.altitude = plane.altitude ± n`                                                                     | `Altitude not changed` if `n === 0`; `Altitude would be too low` if `< 0`; `Altitude would be too high` if `> 9` |
| `mark`                    | `draft.status = 'marked'`                                                                                                 | `Cannot mark planes on the ground` if `altitude === 0`; `Already marked`                                         |
| `unmark`                  | `draft.status = 'unmarked'`                                                                                               | `Cannot unmark planes on the ground`; `Already unmarked`                                                         |
| `ignore`                  | `draft.status = 'ignored'`                                                                                                | `Cannot ignore planes on the ground`; `Already ignored`                                                          |

**`delayAtBeacon(ch)`** — `n = ch - '0'`:

1. `n >= beacons.length` → `Unknown beacon`.
2. `plane.heading.kind === 'circle'` → `Plane is circling`. A circling plane's path
   is a closed loop, so no delayed command can ever fire; the player must issue an
   immediate heading command to break the circle first.
3. **Exact reachability test.** Walk `projectPath(plane, def)` (§7.7) and find the
   first step whose `(x, y)` equals `beacons[n]`. If there is none →
   `Beacon is not in flight path`. Remember that step's `dir` as `arrivalDir` — the
   direction the plane will actually be flying when it gets there.
4. `draft.delayBeacon = n`.
5. If `draft.target` is set (this is a `tt…@b<n>` command), recompute the deferred
   heading **from the beacon**: `dx = target.x - beacon.x`, `dy = target.y - beacon.y`.
   - `dx === 0 && dy === 0` → `Would already be there`.
   - `dir = dirFromDxDy(dx, dy)`.
   - `dir === arrivalDir` → `Already going in that direction`.
   - `draft.heading = { kind:'fixed', dir }`.

Step 3 replaces the original's coarse octant test, which only asked whether the beacon
lay in the same 45° sector as the current heading and therefore accepted beacons the
plane would visibly miss. Because the plane now keeps turning while a command is
pending (§3.3), the projected path may be curved, and the test accounts for that.
Step 5 compares against `arrivalDir` rather than the plane's present direction for the
same reason.

**Applying the draft (fix for bug #9).** Exactly one branch applies, determined by
_which_ kind of command was entered, not by value comparison:

```ts
if (draft.status !== undefined) {
  plane.status = draft.status;
} else if (draft.altitude !== undefined) {
  plane.newAltitude = draft.altitude;
} else if (draft.heading !== undefined) {
  if (draft.delayBeacon !== undefined) {
    // Deferred: the plane keeps flying its current heading until the beacon.
    plane.pending = { heading: draft.heading, beacon: draft.delayBeacon };
  } else {
    // Immediate: supersedes anything that was pending.
    plane.heading = draft.heading;
    plane.pending = null;
  }
}
```

An altitude or mark/unmark/ignore command therefore never touches `heading` or
`pending`. A delayed heading command writes **only** `pending`, leaving the plane's
current heading command running. An immediate heading command replaces `heading` and
discards any pending command.

**A plane has exactly one pending slot.** Issuing a new delayed command silently
replaces any existing one — there is no queue, and no error. This matches the
original (`delayd` / `delayd_no` were single fields) and is what licenses
`projectPath` to ignore `pending` (§7.7).

Note there is no draft for `c` alone reaching **Delayable** via `@`/`a`: the `circle`
action already set `draft.heading`, and `delayAtBeacon` only adds the beacon — so
`c@b1` correctly means "start circling once you reach beacon 1", not "circle now".

### 8.6 Empty command = forced update

If the command terminates with exactly one fragment (i.e. the user pressed Return
immediately), no plane command is issued; instead the caller performs an update
immediately and restarts the interval timer (`SPEC.md` §8.5).

---

## 9. UI

### 9.1 Layout

```
+---------------------------------------------+-------------------+
|                                             |   plane info      |
|                 RADAR                       |   (scrollable)    |
|            (height rows x 2*width cols)     |                   |
|                                             |                   |
+---------------------------------------------+-------------------+
|  input area (3 rows)                        |  credit (3 rows)  |
+---------------------------------------------+-------------------+
```

- One monospace character grid overall. Fixed column widths: info/credit panel is
  24 characters wide, input area fills the rest. (The original used 20; widened to 24
  to fit the altitude-change indicator, §9.3.)
- Everything is sized in `ch` units off a single root `font-size`, so the whole board
  scales together. Use `font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace`.
- Palette: black background, phosphor green (`#33ff33`) foreground, dim green
  (`#1f7a1f`) for background dots and lines. "Standout" = inverted (black on green).
- No responsive/mobile layout. Provide a sensible minimum size and let the page scroll
  if the viewport is too small.

### 9.2 Radar rendering (`src/ui/radar.ts`)

**Static layer**, computed once per game as a `string[][]` of `height` rows ×
`2*width` columns, initialised to spaces and then painted in this exact order
(`SPEC.md` §9.1):

1. Background: for `1 <= y <= height-2`, `1 <= x <= width-2`, put `.` at column `2x`.
2. Lines: step from `p1` to `p2` by `(sign(dx), sign(dy))`, writing `'+'` at column
   `2x` and `' '` at column `2x+1` for each cell.
3. Top row and bottom row: `2*width - 1` dashes (`-`), starting at column 0.
4. For `1 <= y <= height-2`: `|` at column 0 and at column `2*(width-1)`.
5. Beacons: `*` at `2x`, `'0'+index` at `2x+1`.
6. Exits: `'0'+index` at `2x` only (leave `2x+1` as painted).
7. Airports: glyph at `2x`, `'0'+index` at `2x+1`. Glyph from `"^?>?v?<?"[dir]`
   (dir 0 `^`, 2 `>`, 4 `v`, 6 `<`; odd dirs `?`).

**Dynamic layer**: for each plane in `air`, overwrite `2x` with the plane letter and
`2x+1` with `'0' + altitude`. `status === 'marked'` renders both cells in standout.

**Altitude-change cue.** When `plane.newAltitude !== plane.altitude`, the altitude
digit cell (`2x+1`) additionally carries a CSS class — `climbing` (`text-decoration:
overline`) or `descending` (`text-decoration: underline`). This is deliberately _not_
signalled with colour, because colour is already used for the marked/unmarked
highlight and the two must remain independently readable. The character itself is
unchanged, so the grid geometry and all text-based tests are unaffected. See §9.3 for
the explicit textual counterpart.

**DOM strategy**: build a persistent grid of `<span>` elements (one per character
cell, `height * 2 * width` spans; ≤ 1260 for all shipped games) inside per-row
`<div>`s. On each render, diff against the previously rendered character/class and
update only changed spans. This is simple, fast, and trivially inspectable in tests.

### 9.3 Plane info panel (`src/ui/info.ts`)

```
Time: <clock padded to 4, left-aligned> Safe: <safePlanes>
<blank>
pl dt  comm
<one line per airborne plane, id order>
<blank>
<one line per ground plane, id order>
```

The list area is scrollable via CSS (`overflow-y: auto`); there is no
`---- more ----` truncation.

Per-plane line (`src/engine/format.ts`, `formatPlaneLine(plane, def)`):

1. `<letter><altitude digit><'*' if fuel < 15 else ' '><'A' if dest is airport else 'E'><destNo>: `
2. Then, with `h = plane.pending ? plane.pending.heading : plane.heading` — i.e. a
   pending command takes display priority, matching the original — exactly one of:
   - `Holding @ A<origNo>` — if `altitude === 0`
   - `Circle R` / `Circle L` — if `h.kind === 'circle'`
   - `<degrees>` (`DEG[h.dir]`) — if `h.kind === 'fixed'` and either a command is
     pending or `h.dir !== plane.dir`
   - nothing
3. Then ` @ B<plane.pending.beacon>` if a command is pending.
4. Then, if step 2 produced nothing **and** status is `unmarked` or `ignored`,
   the literal `---------` (nine hyphens).
5. Then, if `plane.newAltitude !== plane.altitude`, ` ↑<newAltitude>` when climbing or
   ` ↓<newAltitude>` when descending.

A plane can simultaneously be turning to one heading and have a different command
pending; the panel shows the pending one (the in-progress turn is visible on the
radar).

**Altitude indicator (deviation, §3.3).** The original never displayed
`new_altitude` anywhere, so a climb or descent was completely invisible — as was a
ground plane that had already been cleared for take-off, which showed a bare
`Holding @ A<n>` either way. Step 5 fixes that:

```
g7 E4: Circle R @ B1 ↑9      ← widest possible line, 23 columns
B0 E2: Holding @ A0 ↑7       ← cleared for take-off, now distinguishable
d3 A1: 225 ↓1
a9 E0: --------- ↓4          ← still unattended, but descending
```

Step 5 is deliberately **additive** and ordered _after_ the `---------` filler, which
stays keyed on the heading field exactly as in the original. An altitude command
therefore does not suppress the "you have not attended to this plane" hint.

The widest possible line is 23 columns, which is why the panel is 24 wide (§9.1).
`↑`/`↓` are single-width glyphs in every monospace font the layout targets; if a
fallback font renders them double-width the line still fits.

### 9.4 Input area (`src/ui/input.ts`)

Three rows:

- row 0 — the concatenated echo text of all fragments, with a block cursor rendered at
  column `editor.col`
- row 1 — `'^'` repeated `caretUnder.len` times starting at `caretUnder.col`, else blank
- row 2 — `editor.message` (error or `?` hint), else blank

### 9.5 Keyboard (`src/ui/keyboard.ts`)

A single `keydown` listener on `window`, active only while a game is playing and not
paused.

| key                                             | action                            |
| ----------------------------------------------- | --------------------------------- |
| `Enter`                                         | ENTER token                       |
| `Backspace`                                     | pop one fragment (flash if empty) |
| `Ctrl-U`                                        | pop all fragments                 |
| `Escape`                                        | pause                             |
| `?`                                             | show hint (§8.4)                  |
| any other single printable ASCII char           | feed as a token                   |
| anything else (arrows, F-keys, modifier combos) | ignore                            |

`preventDefault()` on every handled key (notably `Backspace`, `?` and `/`).
On an unmatched token: add a CSS class to the input row for ~120 ms to flash it
(replaces the terminal bell), then remove it.

### 9.6 Screens (`src/ui/screens.ts`)

**Start screen** — full-page overlay:

- Title `ATC`, subtitle `air traffic controller`.
- `<select>` of the 15 built-in games, defaulting to `default`; show the game's
  `update` / `newplane` values next to it.
- `Start` button (also Enter).
- A short controls/commands reference (the table from §8.3).
- The local high-score table (§10).

**Game header bar** — a thin bar above the board with the game name and two buttons:
`Pause (Esc)` and `Quit`. `Quit` opens the pause overlay rather than quitting directly
(so a misclick is recoverable).

**Pause overlay** — covers and fully **hides** the board (set the board container's
`visibility: hidden`, not just an opacity overlay, so the player cannot study the
state while paused):

- `PAUSED`
- `Continue` (`C` or `Esc`)
- `Restart` (`R`) — starts a fresh game with the same definition
- `Quit` (`Q`) — ends the game and goes to the game-over screen, recording the score

**Game-over screen**:

- The loss message, formatted as `Plane 'X' <message>` (or just the message when no
  plane is involved), or `You quit.` when quitting from the pause overlay.
- Stats: `Planes safe: N`, `Time: N updates`, `Real time: <formatted>`.
- If the score qualifies for the table (§10.2), a name input (pre-filled with the last
  used name from `localStorage`) and a `Save` button.
- The high-score table.
- `New game` button → back to the start screen.

Real-time formatting reuses the original `timestr` rules (`SPEC.md` §7.3):
`Nd+HHhrs` / `H:MM:SS` / `M:SS` / `:SS` / empty.

---

## 10. High scores (`src/ui/scores.ts`)

### 10.1 Storage

`localStorage` key `atc.scores.v1`:

```ts
interface ScoreEntry {
  name: string; // <= 16 chars, trimmed
  game: string; // GameDef.name
  planes: number;
  ticks: number;
  realTimeSec: number;
  dateISO: string;
}
type ScoreTable = ScoreEntry[]; // at most NUM_SCORES (18), kept sorted
```

Also `atc.lastName.v1` → the last name entered, used to pre-fill the input.

Treat malformed/missing storage as an empty table; never throw. Wrap all
`localStorage` access in try/catch (private-browsing quotas).

### 10.2 Ranking (simplified — deviation from the original)

Sort comparator, descending: `planes`, then `ticks`, then _ascending_ `realTimeSec`
as a final tie-breaker.

Insertion on game over:

1. Build the candidate entry from the finished game (`planes`, `ticks`,
   `realTimeSec`, `game`, `dateISO`), with `name` still unknown.
2. `qualifies(candidate, name)`:
   - if an entry with the same `(name, game)` exists → qualifies iff the candidate
     sorts **strictly before** that entry (it replaces it);
   - otherwise → qualifies iff, after inserting and re-sorting, the candidate is
     within the first `NUM_SCORES` entries.
3. **Whether to prompt for a name** is decided with `qualifies(candidate, ANY)`,
   where `ANY` is the weakest case: a name that does _not_ collide with any existing
   entry for this game. That is, prompt iff the candidate would make the top 18 as a
   brand-new entry. This is monotone — replacing an existing entry is never harder
   than inserting a new one — so the prompt is shown exactly when some name could
   succeed.
4. On **Save**, re-evaluate `qualifies(candidate, submittedName)` with the name the
   user actually typed. If it now fails (the user reused a name whose existing entry
   is better), show `Your previous score for this game was better.` and do not write.
5. On success, insert or replace, re-sort, truncate to `NUM_SCORES`, persist, and
   store the name under `atc.lastName.v1`.

Display columns: `#`, `name`, `game`, `time` (ticks), `real time`, `planes safe`.

---

## 11. Clock & lifecycle (`src/ui/app.ts`)

```ts
class App {
  private game: Game | null;
  private timer: number | null;
  private startedAt = 0; // Date.now()
  private pausedMs = 0;
  private pauseStartedAt = 0;
}
```

- **Start**: parse the selected game, `new Game(def)`, `game.addPlane()`, render,
  then **immediately run the first update**, then schedule the timer. (The original
  arms its interval timer with a 1 µs initial delay, so update #1 happens at once.)
- **Timer**: `setTimeout` chained on itself with `def.updateSecs * 1000` ms, so the
  interval can be cleanly reset. Never use `setInterval`.
- **Forced update** (empty Return): clear the timer, run one update, reschedule from now.
- **Pause**: clear the timer, record `pauseStartedAt`, hide the board, show the overlay.
- **Resume**: `pausedMs += Date.now() - pauseStartedAt`, show the board, schedule a
  full fresh interval.
- **Auto-pause**: on `document.visibilitychange` when `document.hidden`, pause (same
  path as Escape). Do **not** auto-resume when the tab becomes visible again; the
  player must press Continue.
- **Real time**: `Math.floor((Date.now() - startedAt - pausedMs) / 1000)`.
- **Render**: after every update, and after every keystroke (for the input echo and the
  info panel). Rendering is a pure function of `Game` + `Editor` state; there is no
  incremental "erase then draw" as in the original.
- **Game over**: stop the timer, detach the keyboard handler, show the game-over screen.

---

## 12. Testing (`test/`, Vitest)

Engine tests only — no DOM required except in `scores.test.ts` (mock `localStorage`).

**`dir.test.ts`**

- `dirFromDxDy` for all 8 unit displacements, plus the shallow-angle examples in
  `SPEC.md` §2.3 (e.g. `(3, -1)` → `2`).
- `stepToward` clamps to ±2 and always takes the shortest way round (all 64 pairs).
- `CIRCLE_CW` matches the original formula `min(8 - d, 2)` for all `d`.
- `CIRCLE_CCW[d] === (8 - CIRCLE_CW[(8 - d) % 8]) % 8` for all `d`.

**`parser.test.ts`**

- All 15 built-in games parse, and their exit/beacon/airport/line counts and
  `update`/`newplane`/`width`/`height` match `SPEC.md` §3.5.
- **Fidelity**: each `src/data/*.atc` is byte-identical to the corresponding
  `orig/games/*` (read both with `fs` and compare). This guards the "verbatim copies"
  rule against well-meaning reformatting.
- Each validation rule rejects a crafted bad input with the expected message
  (out-of-range point, exit not on edge, every cell of the `check_edir` table,
  non-diagonal/non-axial line, missing definitions, redefinition, too-small values,
  fewer than 2 exits+airports, and the new >10-of-a-kind limit).
- Comments and irregular whitespace are handled.

**`update.test.ts`** (construct `Game` with a stub `Rng` and hand-placed planes)

- Prop planes move only on even ticks; jets every tick.
- Altitude changes by at most 1 per move.
- Fuel decrements only on moves; `fuel < 0` loses.
- Fixed-heading turns clamp to 90° per move and take the shortest route.
- Circling `cw` and `ccw` produce the documented sequences from each of the 8 headings.
- A plane with a pending command **keeps turning** (it is not frozen), resolves the
  pending command exactly on the beacon cell, first steers by the new command on the
  _following_ tick, and promotes `unmarked` → `marked` on resolution.
- A pending command that is never reached (plane leaves the arena first) simply never
  fires.
- Each of the 11 loss conditions, in their precedence order — in particular: altitude 0
  over a non-destination airport loses before the arena-bounds check; a correct exit at
  altitude 9 succeeds while altitude 8 loses.
- Successful landing requires position + altitude 0 + matching airport direction.
- `safePlanes` increments on departure/landing.
- Collision triggers at Chebyshev distance 1 in all three dimensions and not at 2;
  ground planes never collide; a prop plane that skipped its move still collides.
- Spawn probability gate uses `randInt(newplane) === 0`.
- `addPlane` never picks origin === destination, respects the clearance of 4 at exits,
  and returns without effect when all 26 letters are taken.
- Take-off: a ground plane with `newAltitude > 0` joins `air` on the next update and
  departs along the airport's direction.
- `projectPath` (§7.7): a settled heading yields a straight line that stops at the
  arena edge; an in-progress turn yields a curved path whose first two steps match
  what `update()` actually produces (assert by stepping a real `Game` and comparing);
  a circling plane's path is a closed loop that revisits its starting cell.

**`commands.test.ts`**

- Every command in §8.3 parses to the right draft and applies the right field.
- Removed commands (`tl`, `tr`, `tL`, `tR`, `t-`, `t+`) are rejected at the keystroke
  that used to match.
- **Bug #9 regression**: with a plane that has a pending `@b0` command, issuing an
  altitude command that resolves to the already-commanded altitude leaves the pending
  command intact; issuing an immediate heading command clears it.
- **Bug #6 regression**: `ac0` and `ad0` yield `Altitude not changed`.
- **Bug #7 regression**: `?` leaves `state`, `col` and `frags` unchanged and only sets
  `message`; the next key is processed normally.
- Every error string from §8.5 is produced by a concrete input.
- **Exact flight-path check** (§8.5 step 3):
  - a beacon lying exactly on the projected straight path is accepted;
  - a beacon in the same 45° octant but **off** the path is rejected — this is the
    case the old octant test wrongly accepted, and deserves an explicit test;
  - a beacon that the plane only reaches because it is still turning (curved path) is
    accepted, and the same beacon is rejected for an otherwise identical plane whose
    turn has already settled;
  - a beacon behind the plane, and one past the arena edge, are rejected.
- `Plane is circling` is returned for a delayed command on a circling plane, and the
  command is accepted once an immediate heading command has broken the circle.
- The `tt…@b<n>` recomputation uses the beacon as the origin and produces
  `Would already be there` / `Already going in that direction`, with the latter
  compared against the **arrival** direction (a plane still turning at command time
  whose arrival direction differs must not trigger it).
- Ground planes reject `t`, `c`, `m`, `u`, `i` but accept `a<n>`.
- `c@b1` sets a _pending_ circle (the plane does not start circling immediately), and
  is accepted even though `delayAtBeacon` rejects planes that are _already_ circling.
- A second delayed command silently replaces the first; the first never fires.
- Backspace/Ctrl-U restore the editor state exactly.

**`format.test.ts`**

- The two examples from the manual, adjusted for the new circle display:
  `B4*A0: Circle R @ B1` and `g7 E4: 225`.
- `Holding @ A<n>` for ground planes; `---------` for unmarked/ignored planes with no
  command; the low-fuel `*`.
- A plane that is mid-turn **and** has a pending command displays the _pending_
  heading plus ` @ B<n>`, not the turn it is currently executing.
- Altitude indicator: ` ↑<n>` while climbing, ` ↓<n>` while descending, and **nothing**
  once `newAltitude === altitude`.
- A ground plane cleared for take-off renders `Holding @ A<n> ↑<n>`, distinct from an
  uncleared one.
- The indicator is appended _after_ `---------`, so an unmarked, undirected, climbing
  plane shows both.
- No line exceeds 24 columns, asserted over a generated worst case.
- `timestr` for 0, 5 s, 65 s, 3661 s, 90000 s.

**`scores.test.ts`**

- Sorting, 18-entry truncation, same-(name, game) replacement only when better,
  corrupt-storage tolerance.
- `qualifies` prompt rule (§10.2 step 3) vs. the re-check on Save (step 4): a
  candidate that would make the top 18 under a fresh name prompts, but is refused on
  Save if the submitted name already has a better entry for that game.

---

## 13. Implementation order

1. Project scaffold: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`,
   empty `src/main.ts`. Verify `npm run dev` and `npm run build`.
2. `engine/types.ts`, `engine/dir.ts`, `engine/rng.ts` + `dir.test.ts`.
3. `engine/gamedef.ts`, `engine/parser.ts`, `data/*.atc`, `data/index.ts`
   - `parser.test.ts`. Milestone: all 15 games parse.
4. `engine/game.ts` (state, `addPlane`, `update`) + `update.test.ts`.
   Milestone: a headless game can be stepped and loses correctly.
5. `engine/format.ts` + `format.test.ts`.
6. `engine/commands.ts` (grammar, editor, actions, apply) + `commands.test.ts`.
   Milestone: the whole engine is complete and tested with no DOM.
7. `ui/styles.css`, `ui/radar.ts`, `ui/info.ts`, `ui/input.ts`.
   Milestone: a game renders and auto-updates; no input yet.
8. `ui/keyboard.ts` + `ui/app.ts` clock/lifecycle. Milestone: fully playable.
9. `ui/screens.ts` (start, pause, game over) and `ui/scores.ts`.
10. Polish: flash animation, focus handling, visibility auto-pause, scaling.

---

## 14. Acceptance checklist

- [ ] `npm run build` emits a `dist/` that plays correctly from a plain static server.
- [ ] All 15 built-in games are selectable and render identically in structure to the
      original (border, dots, `+` lines, `*<n>` beacons, `<n>` exits, `^>v<` + `<n>` airports).
- [ ] Planes render as letter + altitude digit; marked planes are highlighted.
- [ ] An in-progress altitude change is visible both on the radar (over/underlined
      altitude digit) and in the info panel (` ↑<n>` / ` ↓<n>`), including for a ground
      plane cleared for take-off.
- [ ] Prop planes are upper-case and move every other tick; jets are lower-case.
- [ ] Every command in §8.3 works; every removed command is rejected.
- [ ] Every error message in §8.5 and every loss message in `SPEC.md` §7.1 is reachable
      (with `exceeded` spelled correctly).
- [ ] `?` shows a hint without blocking input.
- [ ] A delayed command (`…@b<n>`) does not stop the plane from turning, is accepted
      only when the beacon lies on the plane's actual projected path, and is rejected
      with `Plane is circling` while the plane circles.
- [ ] Empty Return forces an immediate update and resets the timer.
- [ ] Backspace erases one token; Ctrl-U clears the line; an invalid key flashes.
- [ ] Escape pauses, fully hides the board, and offers Continue / Restart / Quit with
      `C` / `R` / `Q` shortcuts; the tab becoming hidden auto-pauses.
- [ ] Paused time is excluded from the recorded real time.
- [ ] High scores persist in `localStorage` across reloads and are shown on the start
      and game-over screens.
- [ ] `vitest run` passes with the coverage described in §12.
- [ ] No runtime dependencies in the shipped bundle.
