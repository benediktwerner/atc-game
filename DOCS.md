# ATC — reference documentation

This is the authoritative reference for the game's rules, grammar, message strings and
project conventions. It describes **the game as implemented here**, not the original
BSD `atc`. Where this document and the code disagree, that is a bug in one of them —
fix both together.

**Keep this document up to date.** Any change to game rules, command grammar, message
strings, level-file syntax, screen layout or the deviation list in §8 must be
reflected here in the same change.

---

## 1. Architecture

Two layers with a hard boundary:

- **`src/engine/`** — pure game logic with **zero DOM/browser dependencies**, so the
  whole ruleset is unit-testable headlessly. All randomness goes through an injected
  `Rng = () => number` (default `Math.random`); never call `Math.random` directly in
  the engine. Reproducing the original's C `random()` sequences is not a goal; the
  injection exists so tests can be deterministic.
- **`src/ui/`** — rendering and lifecycle. Rendering is a **pure function of engine
  state + editor state**, re-run after every update and every keystroke. Do not
  introduce incremental "erase plane, move, redraw plane" rendering.

| file                  | contains                                                          |
| --------------------- | ----------------------------------------------------------------- |
| `engine/types.ts`     | `Dir`, `LevelDef`, `Plane`, `HeadingCmd` and related domain types |
| `engine/dir.ts`       | direction tables, `dirFromDxDy`, plane-letter conversions         |
| `engine/rng.ts`       | `Rng` type and `randInt`                                          |
| `engine/parser.ts`    | level-file lexer, parser and validator                            |
| `engine/game.ts`      | `Game`: state, update loop, spawning, loss detection, turn tables |
| `engine/commands.ts`  | `CommandEditor`: command grammar, validation, application         |
| `engine/format.ts`    | info-line and duration formatting                                 |
| `ui/app.ts`           | screen lifecycle, the clock and keyboard routing                  |
| `ui/screens/menu.ts`  | start screen: level picker, level stats, help, high scores        |
| `ui/screens/game.ts`  | `GameScreen`: board markup, tick bar, pause overlay, fit-to-view  |
| `ui/screens/score.ts` | game-over screen: result, save form, high-score table             |
| `ui/html.ts`          | auto-escaping `html` tagged template and `setHtml`                |
| `ui/help.html`        | help text for the start screen, imported with `?raw`              |
| `ui/radar.ts`         | static radar layer plus the span-grid renderer                    |
| `ui/info.ts`          | plane info panel                                                  |
| `ui/input.ts`         | input echo, error caret and message rows                          |
| `ui/keyboard.ts`      | key event to engine token mapping                                 |
| `ui/scores.ts`        | `localStorage` high-score table                                   |
| `data/*.atc`          | the 15 built-in levels, imported with Vite's `?raw` suffix        |

`ui/app.ts` owns the clock: a self-chaining `setTimeout` (never `setInterval`), so a
forced update and pause/resume can cleanly reset the interval. It holds no element
references of its own; each screen module owns its markup and its lookups into it.

**Markup convention.** All HTML is built with the `html` tagged template from
`ui/html.ts` and installed with `setHtml`, which accepts only the `Html` values that
tag produces — so a bare string can never reach `innerHTML`. Every interpolated value
is escaped unless it is already `Html`; arrays are concatenated and
`false`/`null`/`undefined` render as nothing, so a falsy condition before a nested
`html` template yields a conditional fragment. `raw()` bypasses escaping and is only
for markup bundled from a `.html` file. The tag is named `html` because Prettier
formats template literals with that tag as real HTML, which is what keeps the markup
readable and diffable in place. Longer prose lives in its own `.html` file imported
with `?raw`.

`src/data/*.atc` are **verbatim copies of the original BSD level files** and are
parsed at runtime. Do not reformat them, "clean them up" or convert them to JSON; they
are excluded from Prettier. `data/index.ts` fixes their presentation order.

There are **no runtime dependencies**, and dev dependencies are limited to
`typescript`, `vite`, `vitest` and `prettier`. No UI framework.

**Naming**: a playable map is a **level** (`LevelDef`, `parseLevel`, `BUILTIN_LEVELS`,
"level files"). `Game` is reserved for the running session — the live plane lists,
clock and update loop.

---

## 2. Coordinates and directions

`x` increases to the right, `y` increases **downward**. Direction `0` is North and
indices run clockwise. Direction keys are the eight physical keys surrounding `s`, so
they work regardless of keyboard layout (`ui/keyboard.ts` maps `KeyW`, `KeyE`, … while
the command editor is expecting a direction). Outside that state the typed character
is used; either way only single ASCII characters become command tokens, so bare
modifiers and navigation keys keep their default browser behaviour.

| dir | key | dx  | dy  | degrees | compass |
| --- | --- | --- | --- | ------- | ------- |
| 0   | `w` | 0   | -1  | 0       | N       |
| 1   | `e` | 1   | -1  | 45      | NE      |
| 2   | `d` | 1   | 0   | 90      | E       |
| 3   | `c` | 1   | 1   | 135     | SE      |
| 4   | `x` | 0   | 1   | 180     | S       |
| 5   | `z` | -1  | 1   | 225     | SW      |
| 6   | `a` | -1  | 0   | 270     | W       |
| 7   | `q` | -1  | -1  | 315     | NW      |

`dirFromDxDy` converts a displacement to the nearest direction by **truncating, not
rounding** — it reproduces the original's C `(int)` cast, and the difference is
visible in `tt` commands to targets that sit near an octant boundary.

Plane letters: propeller planes are `A`–`Z`, jets are `a`–`z`, both derived from the same
`id` in `0..25`.

---

## 3. Game rules

### 3.1 Constants

| constant             | value | meaning                                              |
| -------------------- | ----- | ---------------------------------------------------- |
| `MAX_ALTITUDE`       | 9     | flight ceiling                                       |
| `ENTRY_ALTITUDE`     | 7     | altitude of a plane entering via an exit             |
| `EXIT_ALTITUDE`      | 9     | altitude required to leave via an exit               |
| `LOW_FUEL`           | 15    | at less than this, the info line shows `*`           |
| `MAX_PLANES`         | 26    | simultaneous planes, one per letter                  |
| `SPAWN_CLEARANCE`    | 4     | required separation when entering at an exit         |
| `COLLISION_DISTANCE` | 1     | planes within this distance in x, y and altitude die |
| `MAX_TURN_PER_MOVE`  | 2     | 90° maximum turn per move                            |

A plane's initial fuel is `width + height` moves.

### 3.2 Update tick

One tick, in this exact order:

1. `clock += 1`.
2. Any ground plane whose target altitude is above 0 takes off: it moves from the
   ground list to the air list.
3. For every airborne plane, in list order:
   - Propeller planes are skipped on odd ticks; jets move every tick.
   - `fuel -= 1`; at `fuel < 0` the plane **ran out of fuel**.
   - Altitude moves one step toward the target altitude.
   - The heading advances one step (§3.3) and the plane moves one cell that way.
   - If the plane is now on the beacon of its pending delayed command, the pending
     heading becomes the active heading and the plane is re-marked if it was unmarked.
   - Arrival and loss conditions are evaluated (§3.4).
4. Safely arrived planes are removed and counted. This happens **even when step 3
   ended the game**: a plane that reached its destination before another plane died
   still counts towards the score.
5. Every pair of airborne planes is checked for collision.
6. With probability `1/newplane`, a new plane is spawned (§3.5).

### 3.3 Heading and turning

A plane's commanded heading is either `{ kind: 'fixed', dir }` or
`{ kind: 'circle', turn: 'cw' | 'ccw' }`.

A fixed heading is approached along the shortest rotation, clamped to ±2 steps (90°)
per move. Circling uses **lookup tables, not a formula**: they reproduce the original's
quirk that a plane on a diagonal heading converges onto a cardinal one instead of
circling evenly. Do not "simplify" them into arithmetic; a test asserts that the
counter-clockwise table is the exact mirror of the clockwise one. `stepToward`,
`CIRCLE_CW`/`CIRCLE_CCW` and `nextDirFrom` live in `engine/game.ts` next to
`MAX_TURN_PER_MOVE`; `engine/dir.ts` holds only the direction/letter tables. Keep them
in one place — a second copy elsewhere would be dead code that tests could pass
against while the game used the other.

A plane carries two independent heading fields: `heading` (executing now) and
`pending` (deferred until a beacon). A delayed command therefore does **not** freeze
steering — the plane keeps executing `heading`, turns included, until it reaches the
beacon. An immediate heading command supersedes and clears any pending command;
altitude and mark/unmark/ignore commands leave the pending command alone.

`projectPath(plane, def)` forward-simulates the plane's actual future path, ignoring
`pending`, until it leaves the arena or repeats an `(x, y, dir)` state. It is what
makes the "beacon is in flight path" check exact rather than octant-based.

### 3.4 Arrival and loss

A plane arrives **safely** when it reaches its destination correctly:

- destination airport, at altitude 0, moving in the runway direction;
- destination exit, at altitude 9.

Otherwise the game ends immediately. Loss messages are rendered as
`Plane '<letter>' <message>`, and are part of the contract — tests assert them
literally:

| message                                | cause                                            |
| -------------------------------------- | ------------------------------------------------ |
| `ran out of fuel.`                     | fuel dropped below zero                          |
| `collided with plane '<letter>'.`      | within 1 in x, y and altitude of another plane   |
| `crashed on the ground.`               | reached altitude 0 away from any airport         |
| `landed at the wrong airport.`         | altitude 0 on an airport that is not its own     |
| `landed instead of exited.`            | altitude 0 on an airport while bound for an exit |
| `landed in the wrong direction.`       | reached its airport against the runway direction |
| `exited at the wrong altitude.`        | reached its exit at an altitude other than 9     |
| `exited via the wrong exit.`           | left the arena at an exit that is not its own    |
| `exited instead of landed.`            | left via an exit while bound for an airport      |
| `illegally left the flight arena.`     | left the arena anywhere other than an exit       |
| `exceeded flight ceiling.`             | climbed above altitude 9                         |
| `has a bizarre destination, get help!` | internal inconsistency; should be unreachable    |

Quitting from the pause overlay ends the game with the message `You quit.` and no
plane letter.

### 3.5 Spawning

A level needs at least two exits/airports. The plane kind (propeller or jet) and the
destination are chosen at random over the combined exit+airport list; the origin is
then drawn directly from the remaining entries — one of the `starts - 1` non-destination
indices, shifted back over the destination — and the whole choice is retried on failure
up to `exits + airports` times. Never redraw-until-different: that loop does not
terminate for a degenerate injected `Rng`.

- **Exit origin**: rejected if any airborne plane is within `SPAWN_CLEARANCE` of the
  exit at altitude 7. Accepted origins produce a plane at altitude 7 heading in the
  exit's direction.
- **Airport origin**: always accepted, including onto an airport that already has a
  plane waiting, so planes may queue on the ground. The plane starts at altitude 0
  and only leaves the ground once an altitude command clears it for take-off.

New planes are `marked`. Letters are recycled in a rotation rather than reusing the
lowest free one, so a freed letter takes a while to reappear; nothing spawns while all
26 are in use.

---

## 4. Commands

Every command starts with a plane letter and ends with Return. The editor echoes an
expanded English form as you type, and `?` prints the set of valid next characters
without consuming input or changing state.

### 4.1 Grammar

```
command   := <plane> ( turn | altitude | circle | mark ) <ret>
turn      := 't' ( <dir> | 't' <target> <digit> ) [ delay ]
circle    := 'c' [ 'l' | 'r' ] [ delay ]
altitude  := 'a' ( <digit> | ( '+' | 'c' | '-' | 'd' ) <digit> )
mark      := 'm' | 'u' | 'i'
delay     := ( '@' | 'a' ) ( 'b' | '*' ) <digit>
target    := 'b' | '*' | 'e' | 'a'
<dir>     := one of w e d c x z a q
```

| command                         | effect                                           |
| ------------------------------- | ------------------------------------------------ |
| `<plane>t<dir>`                 | turn to an absolute direction                    |
| `<plane>tt<b\|*\|e\|a><n>`      | turn towards beacon, exit or airport number `n`  |
| `<plane>c`, `<plane>cr`         | circle clockwise                                 |
| `<plane>cl`                     | circle counter-clockwise                         |
| `<plane>a<n>`                   | set altitude to `n` thousand feet                |
| `<plane>ac<n>` / `<plane>a+<n>` | climb `n` thousand feet                          |
| `<plane>ad<n>` / `<plane>a-<n>` | descend `n` thousand feet                        |
| `<plane>m` / `u` / `i`          | mark, unmark or ignore the plane                 |
| `…@b<n>` / `…a*<n>` suffix      | apply the heading command on reaching beacon `n` |

**All relative turn commands are removed** (`tl`, `tr`, `tL`, `tR`, `t-`, `t+` and the
`tl<dir>`/`tr<dir>` forms). `t` accepts only an absolute direction or a
turn-towards-target.

Editing keys: **Backspace** removes one token, **Ctrl-U** clears the command line,
**Return** on an empty line forces an immediate update and restarts the timer,
**Space** advances one step without touching the command being typed, **Escape**
pauses, and `?` shows context-sensitive help. An invalid keystroke is silently
ignored — there is no flash and no audio.

### 4.2 Command application

A command is modelled as a **typed intent that names exactly the plane fields it
writes**, and only those fields are written. Do not revert to comparison-based commit
logic: that reintroduces the original's bug where, for example, a redundant altitude
command silently cancelled a pending delayed turn.

Mark/unmark/ignore write `status`; altitude commands write `targetAltitude`; heading
commands write either `heading` (clearing `pending`) or `pending` when delayed.

Per-token checks run as each fragment is read, but everything that depends on the
command **as a whole** is deferred until Return, in `commitHeading`:

- a turn-towards is measured from the delay beacon when the command is delayed, and
  from the plane's own cell when it is not, so `Would already be there` cannot be
  decided before it is known whether a delay suffix follows;
- `Already going in that direction` compares against the direction on arrival at the
  beacon for a delayed command, and against the plane's current `heading` for an
  immediate one. It only fires when `pending` is already `null`, because an immediate
  heading command that looks redundant is still the way to **cancel** a pending one.

Nothing is written to the plane until every check has passed, so a rejected command
never mutates state.

### 4.3 Error messages

Validation failures print the message and underline the offending token with `^`.
These strings are part of the contract and are asserted literally by tests:

| message                                               | condition                                                |
| ----------------------------------------------------- | -------------------------------------------------------- |
| `Unknown Plane`                                       | the letter matches no plane in the air or on the ground  |
| `Planes at airports may not change direction`         | `t` on a plane at altitude 0                             |
| `Planes cannot circle on the ground`                  | `c` on a plane at altitude 0                             |
| `Cannot mark planes on the ground`                    | `m` on a plane at altitude 0                             |
| `Cannot unmark planes on the ground`                  | `u` on a plane at altitude 0                             |
| `Cannot ignore planes on the ground`                  | `i` on a plane at altitude 0                             |
| `Already marked`                                      | `m` on an already marked plane                           |
| `Already unmarked`                                    | `u` on an already unmarked plane                         |
| `Already ignored`                                     | `i` on an already ignored plane                          |
| `Already at that altitude`                            | target altitude equals current and commanded altitude    |
| `Altitude not changed`                                | `ac0` or `ad0`                                           |
| `Altitude would be too low`                           | relative descent below 0                                 |
| `Altitude would be too high`                          | relative climb above 9                                   |
| `Unknown beacon` / `Unknown exit` / `Unknown airport` | target index not defined by the level                    |
| `Plane is circling`                                   | delayed command on a circling plane                      |
| `Beacon is not in flight path`                        | the projected path never reaches the beacon              |
| `Would already be there`                              | the turn-towards target is the cell the turn starts from |
| `Already going in that direction`                     | the commanded heading is the one already in effect       |

---

## 5. Level files

Level files use the original `atc` level-file syntax. `#` starts a comment that runs
to end of line; whitespace is insignificant. Keywords are matched as whole words, so
`widthx` is not `width`.

```
update = <int>;        seconds of real time per tick
newplane = <int>;      1-in-N chance of spawning a plane each tick
width = <int>;         radar width in cells
height = <int>;        radar height in cells

exit:    ( <x> <y> <dir> ) … ;
beacon:  ( <x> <y> ) … ;
airport: ( <x> <y> <dir> ) … ;
line:    [ ( <x> <y> ) ( <x> <y> ) ] … ;
```

The four definitions come first, then the sections in any order. Validation errors are
collected and reported as `"<name>": line <n>: <message>`:

- `'<key>' undefined.` — a required definition is missing.
- `Redefinition of '<key>'.`
- `'<key>' is too small.` — `width`/`height` below 3, `update`/`newplane` below 1.
- `X value out of range.` / `Y value out of range.` — beacons and airports must be
  strictly inside the border; line endpoints must be inside the grid.
- `edge value not on edge.` — an exit is not on a border row or column.
- `Bad direction for entrance at exit.` — the entry direction does not point inward
  for that edge or corner.
- `Bad line endpoints.` — lines must be horizontal, vertical or exactly diagonal.
- `Bad direction for airport.` — a runway must face north, south, east or west. The
  radar draws a runway as a single arrow glyph and has none for a diagonal.
- `Too many <exits|beacons|airports> (max 10).` — indices must stay a single digit so
  they remain addressable by the command grammar.
- `Need at least 2 airports and/or exits.`

---

## 6. Screens and rendering

### 6.1 Radar

Each radar cell occupies **two screen columns** — cell `(x, y)` renders at column
`2*x`. This 2:1 mapping is the most common source of off-by-one errors.

| glyph                | meaning                                         |
| -------------------- | ----------------------------------------------- |
| `.`                  | empty interior cell (first column of the pair)  |
| `-` `\|`             | arena border                                    |
| `+`                  | a line segment                                  |
| `*<n>`               | beacon `n`                                      |
| `<n>`                | exit `n`, on the border                         |
| `^>v<` `<n>`         | airport `n`, glyph showing the runway direction |
| `<letter><altitude>` | a plane; marked planes are highlighted          |

### 6.2 Info panel

Header `Time: <clock>  Safe: <count>`, then a thin progress line that fills over the
level's `update` interval to show how soon the next move happens, then one line per
plane — airborne planes first, then planes waiting on the ground:

```
<letter><altitude><'*' if low fuel><'A'|'E'><dest>: <detail>
```

The detail is `Holding @ A<n>` for a plane on the ground, `Circle R` / `Circle L` for
a circling plane (never plain `Circle`), or the heading in degrees when the plane is
turning or has a pending command. A pending command appends ` @ B<n>`, an unmarked or
ignored plane with no detail shows `---------`, and an altitude change in progress
appends ` ↑<n>` / ` ↓<n>`.

Within each group planes are listed by **plane id**, not by arrival time: ids are
handed out in a rotation through 0–25, so the list is stable while a plane is in the
air but reorders when the rotation wraps. This keeps a plane's line from jumping
around as other planes come and go.

The progress line is driven by the same code that arms the update timer, so a forced
update and pause/resume keep it in step with the real interval. Starting a level
spawns the first plane, renders the opening position and only then arms the clock, so
the board is visible for a full interval before the first update — do not tick
immediately on start.

The panel is exactly as tall as the radar beside it — `ui/screens/game.ts` sets a
`--radar-rows` custom property from the level's `height` — and scrolls when there are
more planes than rows.

### 6.3 Input area

Three rows: the echoed command with a block cursor, the `^` caret underlining a
rejected token, and the message or `?` hint row. Fragment texts carry their own
leading space, which the caret skips so it starts under the visible token. A rejected
command clears the editor but stays echoed, so the caret still points at the offending
token; the echo disappears on the next keystroke. The board is a two-column grid —
radar and info panel on top, input area bottom-left and the credit line
`ATC - by Ed James` bottom-right, under the info panel.

`CommandEditor` exposes the command as a list of fragments plus, after a rejection,
the index of the offending one. **It computes no screen columns**: turning fragments
into an echo line and a caret row is `ui/input.ts`'s job, which keeps the engine free
of layout. The `?` hint strings stay in `engine/commands.ts` because they enumerate
the grammar's valid next characters per state, not a rendering choice.

The whole game shell is scaled with a CSS transform to fill the viewport. The factor
is deliberately **not** clamped at 1: the board is a fixed character grid, so without
upscaling a game would be uncomfortably small on a large display.

### 6.4 Pause, game over and scores

Escape or the Pause button hides the board completely behind an overlay offering
Continue / Restart / Quit; the game also auto-pauses when the tab is hidden, and
paused time is excluded from the recorded real time. Once a game has ended, pausing is
refused and the Pause button is disabled — the board is still on screen, so without
that guard Continue would restart the clock on a finished game.

On a loss the message is shown and Space opens the score screen, which reports planes
safe, ticks and real time, lists the high-score table and offers buttons to replay the
same level or return to the main menu.

If the result can be saved, the table is shown with the score **already projected into
place** — the pending row highlighted and its rank noted — from the moment the screen
opens, and re-projected whenever the name changes, since the rank depends on it. Saving
persists the score and re-renders the table from storage. Because the table holds one
entry per name+level, nearly any result can be saved under a fresh name; it only fails
to qualify when the table is full and every entry beats it, in which case the screen
says so instead of offering the form.

Scores live in `localStorage` (keys `atc.scores.v1` and `atc.lastName.v1`),
keep the best `NUM_SCORES` (18, defined in `ui/scores.ts` — it is a UI limit, not a
game rule) entries and at most one entry per name+level, and are ranked
by planes safe, then ticks, then lowest real time.

Real-time durations are formatted as `<d>d+<hh>hrs`, `<h>:<mm>:<ss>` or `<m>:<ss>`; the
minute field is always present, so a sub-minute game shows `0:27` and a zero-length one
shows `0:00`.

### 6.5 Main menu

The start screen shows the title, a level picker with a Start button, a stats line for
the selected level, a "How to play" section and the high-score table. The stats line is
re-rendered whenever the picker changes and reports the radar size, the seconds between
moves (`update`), the spawn chance (`newplane`, as `1 in N` moves) and the number of
exits, beacons and airports. The help section keeps a short summary of the objective
visible and hides the full reference — commands, keys, radar symbols, info-panel format
and flight rules — behind a collapsed `Commands and rules` disclosure, so the menu
stays short. Command examples use lower-case plane letters.

---

## 7. Development

```bash
npm install
npm run dev                  # Vite dev server
npm run build                # tsc --noEmit + static bundle -> dist/
npm test                     # full test suite
npx vitest run test/engine.test.ts                  # one file
npx vitest run test/engine.test.ts -t "directions"  # one test by name
npx vitest                   # watch mode
npm run format               # Prettier
npm run format:check
```

Prettier is the only style tool; there is no linter. `src/data/*.atc` and `dist/` are
excluded from formatting.

`.github/workflows/deploy.yml` runs `format:check`, `test` and `build` on every push to
`master` and publishes `dist/` to GitHub Pages, so a formatting or test failure blocks
the deployment. `vite.config.ts` sets a relative `base` so the bundle works from the
project-pages subpath.

---

## 8. Deviations from the original BSD `atc`

The port deliberately differs from the original game in the following ways. Do not
silently revert any of them.

### 8.1 Original bugs that are fixed

- `cl`/`cr` were documented but unimplemented, and circling was always clockwise; both
  directions now work, with plain `c` meaning clockwise.
- The commit logic used three mutually exclusive branches, so a redundant altitude
  command could silently cancel a pending delayed turn; commands are now typed intents
  (§4.2).
- The flight-ceiling message read `exceded flight ceiling.`; it is spelled correctly.
- `?` entered a dead-end state escapable only with Backspace; it is now a transient
  hint that consumes nothing.
- `ac0`/`ad0` silently did nothing because the guard compared against NUL; they now
  report `Altitude not changed` (the original literal was lower-case
  `altitude not changed`).
- The origin-selection retry loop could never retry an airport origin; origin
  selection is now a clean bounded retry loop with the same observable behaviour.
- Beacon/exit/airport indices above 9 rendered as `:`, `;`, … and were unaddressable;
  the level validator now rejects more than 10 of any of them. All 15 shipped levels
  comply.
- Setting a delay suppressed the turn step entirely, so the plane flew dead straight to
  the beacon and abandoned any turn in progress; `heading` and `pending` are now
  independent (§3.3).
- The "beacon is in flight path" check accepted any beacon in the same 45° octant as
  the current heading; it is now an exact forward simulation.

### 8.2 Features removed

- All relative turn commands (§4.1).
- Ctrl-L redraw — the DOM always shows current state.
- `!` shell escape, and all command-line flags (replaced by the HTML UI).
- `---- more ----` info-panel truncation, replaced by a scrollable panel.
- The shared score file, `host` column, file locking and setgid handling, replaced by
  `localStorage`.
- The terminal bell on an invalid keystroke. Invalid input is silently ignored, with
  no visual substitute, so `CommandEditor.feed` only reports whether the keystroke
  forced an update.

### 8.3 Features changed or added

- Escape pauses the game and hides the board (§6.4).
- The info panel always shows `Circle R` or `Circle L`.
- New error `Plane is circling`: a circling plane's path is a closed loop, so it can
  never reach a distant beacon, and a misleading "not in flight path" is avoided.
- `Would already be there` and `Already going in that direction` also reject the
  immediate forms of a turn, not just the delayed ones (§4.2).
- `Already going in that direction` compares against the heading the plane already
  holds, not the direction it happens to be pointing in mid-turn, and for a delayed
  command against the direction it will have **on arrival at the beacon**.
- In-progress altitude changes are visible in the info panel; the original showed only
  the current altitude, so a climb, a descent and a ground plane already cleared for
  take-off were indistinguishable from an idle plane. The radar still shows only the
  current altitude.
- Airports may only face north, south, east or west (§5).
- Score-table semantics are simplified (§6.4).
- Durations always include a minute field. The original's `timestr` omitted it below
  one minute and rendered zero as an empty string, so a short game showed `:27` or
  nothing at all.

### 8.4 Quirks deliberately preserved

Do not "helpfully" fix these. If you think one should change, ask first.

- The odd-to-even heading convergence of the circling tables (§3.3).
- Propeller planes move only on even ticks; jets move every tick.
- Multiple planes may queue on the ground at one airport, and an airport origin is
  accepted even when a plane is already waiting there.
- An immediate heading command supersedes and clears any pending delayed command.
- All original error and loss message wordings, except `exceeded flight ceiling.` and
  `Altitude not changed`.
- The credit line `ATC - by Ed James`.
