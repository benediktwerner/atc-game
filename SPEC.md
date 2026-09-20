# ATC - Air Traffic Controller: Complete Behavioural Specification

Derived from the BSD Games `atc` source in `orig/` (NetBSD/Debian bsd-games lineage,
Ed James, UC Berkeley 1987). This document describes **exact observable behaviour**,
independent of implementation language. Where the shipped manual page (`MANPAGE`,
`orig/atc.6.in`) disagrees with the code, the code is authoritative and the
discrepancy is flagged.

Build configuration note: the shipped `Makefrag` defines `-DBSD`, so all `#ifdef BSD`
code paths are active and all `#ifdef SYSV` paths are dead.

---

## 1. Overview

The player is an air traffic controller. Planes appear at _exits_ (border entry/exit
points) and at _airports_. Each plane has a destination (an exit or an airport). The
player issues commands to steer planes so that they either leave via their designated
exit at exactly 9000 ft, or land at their designated airport (altitude 0, over the
airport, heading in the airport's direction).

The game has no winning state. It ends on the first fatal error (see §7) or when the
player quits. The score is (planes safely dispatched, ticks survived).

---

## 2. Coordinate system, directions, units

### 2.1 Grid

- The arena is a `width` × `height` grid of integer cells.
- `x` increases to the right (0 .. width-1), `y` increases **downward** (0 .. height-1).
- Row 0, row `height-1`, column 0 and column `width-1` form the border. Planes may
  only legally occupy interior cells `1 <= x <= width-2`, `1 <= y <= height-2`
  (plus border cells that are exits, momentarily).
- Beacons and airports must be strictly interior. Exits must be on the border.

### 2.2 Directions

Eight compass directions, numbered 0..7 clockwise starting at North.
`MAXDIR = 8`.

| dir | degrees | name | dx  | dy  | key |
| --- | ------- | ---- | --- | --- | --- |
| 0   | 0       | N    | 0   | -1  | `w` |
| 1   | 45      | NE   | 1   | -1  | `e` |
| 2   | 90      | E    | 1   | 0   | `d` |
| 3   | 135     | SE   | 1   | 1   | `c` |
| 4   | 180     | S    | 0   | 1   | `x` |
| 5   | 225     | SW   | -1  | 1   | `z` |
| 6   | 270     | W    | -1  | 0   | `a` |
| 7   | 315     | NW   | -1  | -1  | `q` |

The key letters are the ring of keys around `s` on a QWERTY keyboard.

`dir_deg(d)` maps dir → degrees per the table; any other value maps to `-1`.

`dir_no(ch)` maps key letter → dir per the table. Any other character is invalid
(the original prints `bad character in dir_no` to stderr and returns -1).

### 2.3 Direction from a displacement

```
DIR_FROM_DXDY(dx, dy) = ((int)(atan2(dy, dx) * 8 / (2*PI) + 2.5 + 8)) % 8
```

The conversion to `int` is **truncation toward zero** on a value that is always
positive (the pre-mod expression lies in (6.5, 14.5]). This must be reproduced
exactly; it is _not_ the same as rounding. Worked examples:

- `(dx=1, dy=0)` → `atan2(0,1)=0` → `10.5` → `10` → `2` (East). ✔
- `(dx=0, dy=-1)` → `atan2(-1,0)=-π/2` → `8.5` → `8` → `0` (North). ✔
- `(dx=1, dy=-1)` → `-π/4` → `9.5` → `9` → `1` (NE). ✔
- `(dx=-1, dy=0)` → `atan2(0,-1)=π` → `14.5` → `14` → `6` (West). ✔
- `(dx=3, dy=-1)` → `atan2(-1,3) ≈ -0.32175` → `-0.40972+10.5 = 10.0903` → `10` → `2` (East).

### 2.4 Altitude

Integer 0..9, representing thousands of feet. Altitude 0 means "on the ground".
Planes enter the arena at altitude 7 and must exit at exactly altitude 9.

### 2.5 Time

The game clock `clck` is an integer count of updates ("ticks"), starting at 0 and
incremented at the beginning of each update. Real time between automatic updates is
`update` seconds, taken from the game file.

---

## 3. Game (scenario) file format

Games are plain text files. The lexer/parser accept the following.

### 3.1 Lexical

- `[0-9]+` → integer constant.
- Keywords (lower case, exact): `height`, `width`, `newplane`, `update`,
  `airport`, `line`, `exit`, `beacon`.
- `[wedcxzaq]` → direction literal.
- Spaces and tabs are skipped.
- `#` starts a comment that runs to end of line.
- Any other character is returned literally (used for `= ; : ( ) [ ]`).

Note the lexer matches keywords anywhere; a bare token like `exitx` lexes as `exit`
followed by the character `x`.

### 3.2 Grammar

```
file          : def+ line+
def           : "update"   '=' CONST ';'
              | "newplane" '=' CONST ';'
              | "width"    '=' CONST ';'
              | "height"   '=' CONST ';'
line          : "beacon"  ':' Bpoint+ ';'
              | "exit"    ':' Epoint+ ';'
              | "airport" ':' Apoint+ ';'
              | "line"    ':' Lline+  ';'
Bpoint        : '(' CONST CONST ')'
Epoint        : '(' CONST CONST DIR ')'
Apoint        : '(' CONST CONST DIR ')'
Lline         : '[' '(' CONST CONST ')' '(' CONST CONST ')' ']'
```

All four `def`s must appear before any `line` section. Sections may repeat and may
appear in any order; entries accumulate in file order, and the index of a beacon /
exit / airport is its 0-based position in that accumulated order.

### 3.3 Validation

Checked after the definitions block (`checkdefs`), all four must be defined
(non-zero); otherwise parsing aborts:

- `'width' undefined.` / `'height' undefined.` / `'update' undefined.` / `'newplane' undefined.`

Per-definition checks:

- Redefinition of any of the four → `Redefinition of 'X'.` (fatal, returns immediately)
- `update < 1` → `'update' is too small.`
- `newplane < 1` → `'newplane' is too small.`
- `width < 3` → `'width' is too small.`
- `height < 3` → `'height' is too small.`

Point checks:

- **Beacon / airport** (`check_point`): `x` must satisfy `1 <= x < width-1`, else
  `X value out of range.`; `y` must satisfy `1 <= y < height-1`, else
  `Y value out of range.`
- **Exit** (`check_edge`): must satisfy `x == 0 || x == width-1 || y == 0 || y == height-1`,
  else `edge value not on edge.`
- **Exit direction** (`check_edir`): the direction is the heading planes have when
  _entering_ through that exit, so it must point inward. Classify
  `X = (x==0 ? 0 : x==width-1 ? 2 : 1)` and `Y = (y==0 ? 0 : y==height-1 ? 2 : 1)`:

  | X,Y | position                               | allowed dir |
  | --- | -------------------------------------- | ----------- |
  | 0,0 | top-left corner                        | 3 only      |
  | 0,1 | left edge                              | 1..3        |
  | 0,2 | bottom-left corner                     | 1 only      |
  | 1,0 | top edge                               | 3..5        |
  | 1,1 | interior (impossible after check_edge) | any         |
  | 1,2 | bottom edge                            | 7, 0 or 1   |
  | 2,0 | top-right corner                       | 5 only      |
  | 2,1 | right edge                             | 5..7        |
  | 2,2 | bottom-right corner                    | 7 only      |

  Violation → `Bad direction for entrance at exit.`

- **Line** (`check_line` / `check_linepoint`): both endpoints must satisfy
  `0 <= x < width` and `0 <= y < height` (`X/Y value out of range.`). The line must be
  horizontal, vertical, or exactly diagonal: with `d1 = |x2-x1|`, `d2 = |y2-y1|`,
  require `d1 == d2 || d1 == 0 || d2 == 0`, else `Bad line endpoints.`

Final check after the whole file: `num_exits + num_airports >= 2`, else
`Need at least 2 airports and/or exits.`

Error format on stderr: `"<filename>": line <n>: <message>`. A nonzero error count
causes the program to exit with status 1.

Note: only errors detected via `return (yyerror(...))` abort immediately; the point
checks merely count errors and continue parsing.

### 3.4 Game selection

- Games live in a data directory (`_PATH_GAMES`, e.g. `/usr/share/games/atc/`).
- `Game_List` in that directory lists one game filename per line. The **first line is
  the default game**.
- `-g`/`-f name`: if `name` matches a line in `Game_List`, that game in the data
  directory is used. Otherwise the argument is used as a literal path, **test mode**
  is enabled (score not logged), and stderr gets:
  ```
  <gamedir>/Game_List: <name>: game not found
  Your score will not be logged.
  ```
  followed by a 2-second sleep.
- `-l` prints `available games:` then each `Game_List` line prefixed with a tab.

### 3.5 Shipped games

`Game_List` order (first = default):

```
default, easy, crossover, Killer, game_2, Atlantis, OHare, Tic-Tac-Toe,
airports, box, crosshatch, game_3, game_4, novice, two-corners
```

Their headline parameters:

| game        | update | newplane | width | height | exits | beacons | airports | lines |
| ----------- | ------ | -------- | ----- | ------ | ----- | ------- | -------- | ----- |
| default     | 5      | 10       | 30    | 21     | 8     | 2       | 2        | 9     |
| easy        | 7      | 12       | 15    | 15     | 4     | 1       | 1        | 4     |
| crossover   | 5      | 5        | 29    | 21     | 8     | 4       | 0        | 4     |
| Killer      | 1      | 4        | 30    | 21     | 4     | 4       | 1        | 9     |
| game_2      | 5      | 8        | 30    | 21     | 8     | 7       | 1        | 9     |
| Atlantis    | 5      | 5        | 30    | 21     | 4     | 7       | 2        | 15    |
| OHare       | 5      | 5        | 30    | 21     | 6     | 3       | 1        | 9     |
| Tic-Tac-Toe | 5      | 5        | 30    | 21     | 8     | 4       | 0        | 12    |
| airports    | 6      | 6        | 30    | 21     | 2     | 9       | 7        | 11    |
| box         | 5      | 6        | 29    | 21     | 8     | 10      | 4        | 25    |
| crosshatch  | 5      | 5        | 30    | 21     | 10    | 10      | 3        | 22    |
| game_3      | 5      | 5        | 30    | 21     | 4     | 1       | 1        | 5     |
| game_4      | 5      | 5        | 30    | 21     | 7     | 10      | 2        | 23    |
| novice      | 6      | 6        | 30    | 21     | 4     | 2       | 0        | 5     |
| two-corners | 5      | 5        | 30    | 21     | 6     | 2       | 1        | 8     |

The exact files must be reproduced verbatim (see `orig/games/`). They are the
authoritative data; the table above is only a summary.

Note `crosshatch` contains the line `[ ( 25 10 ) ( 29 10 ) ]` whose endpoint x=29 equals
`width-1`, which is legal for lines (line points may lie on the border).

---

## 4. Plane model

Per-plane state:

| field                  | meaning                                                                  |
| ---------------------- | ------------------------------------------------------------------------ |
| `status`               | `S_NONE`(0), `S_GONE`(1), `S_MARKED`(2), `S_UNMARKED`(3), `S_IGNORED`(4) |
| `plane_no`             | 0..25, letter index                                                      |
| `plane_type`           | 0 = prop plane, 1 = jet                                                  |
| `orig_type`, `orig_no` | where it came from (`T_EXIT`=2 or `T_AIRPORT`=3)                         |
| `dest_type`, `dest_no` | where it must go (`T_EXIT` or `T_AIRPORT`)                               |
| `altitude`             | current altitude 0..9                                                    |
| `new_altitude`         | commanded altitude                                                       |
| `dir`                  | current heading 0..7                                                     |
| `new_dir`              | commanded heading, 0..7, or `8` (= `MAXDIR`) meaning "circle"            |
| `fuel`                 | remaining fuel, in moves                                                 |
| `xpos`, `ypos`         | position                                                                 |
| `delayd`               | 1 if the pending heading change is deferred to a beacon                  |
| `delayd_no`            | beacon index for the deferred change                                     |

Two lists are maintained: `air` (airborne planes) and `ground` (planes waiting at
airports). Both are kept sorted ascending by `plane_no` (`append` inserts in order).

Plane display letter (`name`): prop planes (`plane_type == 0`) are `'A' + plane_no`
(upper case); jets (`plane_type == 1`) are `'a' + plane_no` (lower case).

`number(letter)` is the inverse: `'a'..'z'` → 0..25, otherwise `letter - 'A'`
(so `'A'..'Z'` → 0..25). Case is therefore ignored when addressing a plane, and
a prop plane and a jet can never share a `plane_no`.

---

## 5. Plane creation (`addplane`)

Called once at program start (before the first update), and possibly once per update
(§6). Steps, in exact order, consuming randomness in exactly this sequence:

1. Zero-initialise a candidate plane `p`. Set `p.status = S_MARKED`.
2. `p.plane_type = random() % 2`.
3. `num_starts = num_exits + num_airports`.
4. `rnd = random() % num_starts` — this selects the **destination**:
   - `rnd < num_exits` → `dest_type = T_EXIT`, `dest_no = rnd`
   - else → `dest_type = T_AIRPORT`, `dest_no = rnd - num_exits`
5. Loop `i` from `0` to `num_starts - 1` looking for a usable **origin**:
   1. Repeatedly draw `rnd2 = random() % num_starts` until `rnd2 != rnd`
      (origin must differ from destination).
   2. If `rnd2 < num_exits` (exit start):
      - `orig_type = T_EXIT`, `orig_no = rnd2`
      - position = that exit's `(x, y)`; `dir = new_dir =` that exit's direction
      - `altitude = new_altitude = 7`
      - If `too_close(q, p, 4)` for **any** plane `q` currently in the air, `continue`
        to the next `i` (drawing a fresh `rnd2`).
   3. Else (airport start):
      - `orig_type = T_AIRPORT`, `orig_no = rnd2 - num_exits`
      - position = that airport's `(x, y)`; `dir = new_dir =` that airport's direction
      - `altitude = new_altitude = 0`
      - No proximity check is performed.
   4. `fuel = width + height`; `break`.
6. If the loop exhausted without breaking (`i >= num_starts`), abort: no plane is added.
7. `plane_no = next_plane()`; if that returns `-1` (all 26 letters in use), abort.
8. Allocate the plane and append it to `ground` if `orig_type == T_AIRPORT`, else to `air`.

`too_close(p1, p2, dist)` returns true iff
`|p1.altitude - p2.altitude| <= dist && |p1.x - p2.x| <= dist && |p1.y - p2.y| <= dist`.

`next_plane()` keeps a static `last_plane`, initialised to `-1`. It repeatedly
increments `last_plane` (wrapping 26 → 0) and checks whether any plane in `air` or
`ground` already has that `plane_no`; it stops at the first free number, or returns
`-1` if it wraps all the way back to the starting value with every number taken.
The static value persists across calls, so letters are handed out round-robin.

Implementation notes that must be preserved for behavioural fidelity:

- The candidate destination and the candidate origin are drawn from the same combined
  index space `[0, num_exits + num_airports)`; exits occupy the low indices.
- A game with zero airports can still produce airport destinations? No — with
  `num_airports == 0` the index space contains only exits, so all planes are
  exit→exit.
- A plane may be created whose destination airport equals... it cannot equal its
  origin, by construction (`rnd2 != rnd`).

---

## 6. The update cycle

An update happens either when the interval timer fires (every `update` seconds of real
time) or immediately when the player presses Return on an empty command line
(§8.4). A forced update cancels and restarts the interval timer.

An update performs the following, in order:

### 6.1 Clock

`clck += 1`.

### 6.2 Take-offs

Repeatedly scan `ground` from the head; on finding the first plane with
`new_altitude > 0`, move it from `ground` to `air` and restart the scan. Repeat until
no such plane remains. (Net effect: all ground planes with a commanded altitude above
0 become airborne this tick, preserving `plane_no` ordering in `air`.)

### 6.3 Movement, altitude and per-plane hazard checks

Iterate over `air` in order. For each plane `pp`:

1. **Prop plane skip.** If `plane_type == 0` and `clck` is odd, skip this plane
   entirely (no fuel burn, no altitude change, no movement, no checks). Jets move
   every tick; props move on even ticks only.
2. **Fuel.** `fuel -= 1`. If `fuel < 0` → **lose**: `ran out of fuel.`
3. **Altitude.** `altitude += sign(new_altitude - altitude)` (i.e. at most 1000 ft per
   move).
4. **Turn** — only if `delayd == 0`:
   - `d = new_dir - dir`
   - If `0 <= new_dir < 8` (a real heading, not "circle"), normalise:
     if `d > 4` then `d -= 8`; else if `d < -4` then `d += 8`.
   - Clamp: `d = max(-2, min(2, d))` — at most 90° of turn per move.
   - `dir = (dir + d) mod 8` (normalised into 0..7).

   For circling (`new_dir == 8`) the normalisation step is skipped, so
   `d = 8 - dir`, which is `>= 2` for `dir <= 6` and equals `1` for `dir == 7`.
   Consequence: **circling turns 90° clockwise per move**, and a plane on an odd
   heading converges onto even headings (…,1→3→5→7→0→2→4→6→0→…).
   There is no counter-clockwise circle.

5. **Move.** `x += dx[dir]`, `y += dy[dir]`.
6. **Delay resolution.** If `delayd` and the new position equals beacon
   `delayd_no`'s position: set `delayd = 0`, and if `status == S_UNMARKED` set
   `status = S_MARKED`. (The commanded turn therefore begins on the _following_
   update, not on arrival at the beacon.)
7. **Destination check.**
   - `dest_type == T_AIRPORT`: if position equals the destination airport's position
     **and** `altitude == 0`:
     - if `dir != airport.dir` → **lose**: `landed in the wrong direction.`
     - else `status = S_GONE`, skip the remaining checks for this plane.
   - `dest_type == T_EXIT`: if position equals the destination exit's position:
     - if `altitude != 9` → **lose**: `exited at the wrong altitude.`
     - else `status = S_GONE`, skip the remaining checks for this plane.
   - anything else → **lose**: `has a bizarre destination, get help!`
8. **Ceiling.** If `altitude > 9` → **lose**: `exceded flight ceiling.`
   (spelling as in the original). Unreachable in practice: `setrelalt` rejects > 9.
9. **Ground.** If `altitude <= 0`:
   - If the position coincides with **any** airport:
     - if `dest_type == T_AIRPORT` → **lose**: `landed at the wrong airport.`
     - else → **lose**: `landed instead of exited.`
   - Otherwise → **lose**: `crashed on the ground.`
10. **Arena bounds.** If `x < 1 || x >= width-1 || y < 1 || y >= height-1`:
    - If the position coincides with **any** exit:
      - if `dest_type == T_EXIT` → **lose**: `exited via the wrong exit.`
      - else → **lose**: `exited instead of landed.`
    - Otherwise → **lose**: `illegally left the flight arena.`

Note the ordering: a plane at altitude 0 over a _non-destination_ airport dies by
rule 9 even though it is over an airport; and a plane reaching a border cell that is
not an exit dies by rule 10.

### 6.4 Reap

Traverse `air` and for every plane with `status == S_GONE`: `safe_planes += 1` and
remove it from the list.

### 6.5 Collision check

For every unordered pair `(p1, p2)` of planes remaining in `air`, if
`too_close(p1, p2, 1)` — i.e. altitude, x and y all differ by at most 1 —
**lose**: `collided with plane '<name(p2)>'.` reported against `p1`.

Pairs are enumerated with `p1` walking the list and `p2` walking from `p1->next`, so
the reported pair is the first such pair in `plane_no` order.

Note this happens _after_ all movement, so a prop plane that did not move this tick
still participates.

Ground planes never collide.

### 6.6 New plane

If `rand() % newplane == 0`, call `addplane()` (§5). So a spawn attempt occurs with
probability `1/newplane` per tick. (The original uses `rand()` here and `random()`
inside `addplane`.)

---

## 7. Losing and scoring

### 7.1 Loss

Any `loser()` call immediately ends the game. The timer is disabled, the input area
is cleared and shows:

```
Plane '<letter>' <message>

Hit space for top players list...
```

(or just `<message>` if no plane is associated, e.g. `Out of memory!`). The program
waits for a space character (or EOF), leaves curses mode, prints the score list, and
exits with status 0.

Full list of loss messages:

| message                                   | cause                                               |
| ----------------------------------------- | --------------------------------------------------- |
| `ran out of fuel.`                        | fuel exhausted                                      |
| `landed in the wrong direction.`          | at destination airport, alt 0, wrong heading        |
| `exited at the wrong altitude.`           | at destination exit, altitude != 9                  |
| `has a bizarre destination, get help!`    | internal                                            |
| `exceded flight ceiling.`                 | altitude > 9                                        |
| `landed at the wrong airport.`            | alt <= 0 over an airport, destination is an airport |
| `landed instead of exited.`               | alt <= 0 over an airport, destination is an exit    |
| `crashed on the ground.`                  | alt <= 0 not over an airport                        |
| `exited via the wrong exit.`              | left arena at an exit, destination is an exit       |
| `exited instead of landed.`               | left arena at an exit, destination is an airport    |
| `illegally left the flight arena.`        | left arena not at an exit                           |
| `collided with plane 'X'.`                | adjacency in all 3 dimensions                       |
| `deleted a non-existent plane! Get help!` | internal                                            |
| `Out of memory!`                          | internal                                            |

### 7.2 Quitting

`SIGINT` and `SIGQUIT` prompt on input line 2:

```
Really quit? (y/n)
```

A single character is read. `y` or EOF quits (disable timer, clear screen, leave
curses, log/print scores, exit 0). Anything else clears lines 2+ and resumes.

`SIGHUP` and `SIGTERM` log the score and exit immediately. `SIGTSTP`/`SIGSTOP` are
ignored (suspension is disabled).

### 7.3 Score file

Plain text, one record per line:

```
<name> <host> <game> <planes> <time> <real_time>
```

parsed with `"%9s %255s %255s %d %d %d"`. At most `NUM_SCORES = 18` records are kept.

- `name` — the player's Unix login name
- `host` — `uname().nodename`
- `game` — the basename of the game file (after the last `/`)
- `planes` — `safe_planes`
- `time` — `clck` (ticks survived)
- `real_time` — wall-clock seconds since program start

Update algorithm on game end (skipped entirely in test mode, or when invoked with
`-s`/`-t`):

1. Read up to `NUM_SCORES` records.
2. If a record with the same (name, host, game) exists:
   - If `this.time > existing.time`, overwrite its `time`, `planes` and `real_time`;
     mark changed. Set `found`.
3. Else, scan records in order for the first with `this.time > record.time`;
   if found: grow the array by one if below `NUM_SCORES`, copy the record at that
   slot to the (new) last slot, and store the new score at that slot; mark changed.
4. If not found and not changed and there is room, append the new score; mark changed.
5. If changed, print `You beat your previous score!` (if `found`) or
   `You made the top players list!`, then sort and rewrite the file, truncating it.
   Otherwise print `You didn't beat your previous score.` or
   `You didn't make the top players list.` Then a blank line.

Sort order (`compar`, descending): primarily by `planes` descending; ties broken by
`time` descending.

Printed listing (always shown at game end and for `-s`):

```
 #:  name      host      game                time  real time  planes safe
-------------------------------------------------------------------------------
%2d:  %-8s  %-8s  %-18s  %4d  %9s  %4d
```

Header uses `printf("%2s:  %-8s  %-8s  %-18s  %4s  %9s  %4s\n", ...)`. The host is
truncated at the first `.` before printing. A trailing blank line follows.

`real time` formatting (`timestr(t)`, seconds):

- days > 0 → `%dd+%02dhrs` (days, hours)
- else hours > 0 → `%d:%02d:%02d`
- else minutes > 0 → `%d:%02d`
- else seconds > 0 → `:%02d`
- else empty string

The file is locked with `flock(LOCK_EX)` during the update.

---

## 8. Input

### 8.1 Terminal setup

Raw-ish mode: `ICANON` and `ECHO` cleared, `ICRNL` set, `VMIN = 1`, `VTIME = 0`.
So Return arrives as `'\n'` (0x0A) thanks to `ICRNL`.

### 8.2 Special characters handled before tokenising

- `Ctrl-L` (0x0C) — redraw the whole screen; consumed, not a token.
- `!` — suspend the timer, fork a subshell (`$SHELL`, else `/bin/sh`), wait for it,
  restore terminal settings and the timer, then redraw. Consumed, not a token.
- The terminal's **erase** character (`VERASE`, typically Backspace/DEL) — pop one
  token off the command stack; if the stack is already empty, beep.
- The terminal's **kill** character (`VKILL`, typically Ctrl-U) — pop all tokens.

### 8.3 Token classes

- any digit → `NUMTOKEN`
- any alphabetic character → `ALPHATOKEN`
- otherwise the character itself (notably `'\n'` = `RETTOKEN`, `'?'` = `HELPTOKEN`,
  `'@'`, `'+'`, `'-'`, `'*'`)

A rule matches if its token equals the token class **or** equals the raw character.
Rules are tested in declaration order and the first match wins. No match → beep.

### 8.4 Command state machine

Each rule is `(token, next_state, echo_string, semantic_action)`. On a match the
`echo_string` is printed at the current cursor column of input line 0 (with `%c`
replaced by the raw character just typed), the cursor advances by its length, the
rule is pushed on the stack, and the state becomes `next_state`. `next_state == -1`
terminates the command. On the very first push, input lines below line 0 are cleared.

| state  | token            | →   | echo            | action      |
| ------ | ---------------- | --- | --------------- | ----------- |
| **0**  | ALPHA            | 1   | `%c:`           | `setplane`  |
|        | RET              | -1  | ``              | —           |
|        | `?`              | 12  | ` [a-z]<ret>`   | —           |
| **1**  | `t`              | 2   | ` turn`         | `turn`      |
|        | `a`              | 3   | ` altitude:`    | —           |
|        | `c`              | 4   | ` circle`       | `circle`    |
|        | `m`              | 7   | ` mark`         | `mark`      |
|        | `u`              | 7   | ` unmark`       | `unmark`    |
|        | `i`              | 7   | ` ignore`       | `ignore`    |
|        | `?`              | 12  | ` tacmui`       | —           |
| **2**  | `l`              | 6   | ` left`         | `left`      |
|        | `r`              | 6   | ` right`        | `right`     |
|        | `L`              | 4   | ` left 90`      | `Left`      |
|        | `R`              | 4   | ` right 90`     | `Right`     |
|        | `t`              | 11  | ` towards`      | —           |
|        | `w`              | 4   | ` to 0`         | `to_dir`    |
|        | `e`              | 4   | ` to 45`        | `to_dir`    |
|        | `d`              | 4   | ` to 90`        | `to_dir`    |
|        | `c`              | 4   | ` to 135`       | `to_dir`    |
|        | `x`              | 4   | ` to 180`       | `to_dir`    |
|        | `z`              | 4   | ` to 225`       | `to_dir`    |
|        | `a`              | 4   | ` to 270`       | `to_dir`    |
|        | `q`              | 4   | ` to 315`       | `to_dir`    |
|        | `?`              | 12  | ` lrLRt<dir>`   | —           |
| **3**  | `+`              | 10  | ` climb`        | `climb`     |
|        | `c`              | 10  | ` climb`        | `climb`     |
|        | `-`              | 10  | ` descend`      | `descend`   |
|        | `d`              | 10  | ` descend`      | `descend`   |
|        | NUM              | 7   | ` %c000 feet`   | `setalt`    |
|        | `?`              | 12  | ` +-cd[0-9]`    | —           |
| **4**  | `@`              | 9   | ` at`           | —           |
|        | `a`              | 9   | ` at`           | —           |
|        | RET              | -1  | ``              | —           |
|        | `?`              | 12  | ` @a<ret>`      | —           |
| **5**  | NUM              | 7   | `%c`            | `delayb`    |
|        | `?`              | 12  | ` [0-9]`        | —           |
| **6**  | `@`              | 9   | ` at`           | —           |
|        | `a`              | 9   | ` at`           | —           |
|        | `w`              | 4   | ` 0`            | `rel_dir`   |
|        | `e`              | 4   | ` 45`           | `rel_dir`   |
|        | `d`              | 4   | ` 90`           | `rel_dir`   |
|        | `c`              | 4   | ` 135`          | `rel_dir`   |
|        | `x`              | 4   | ` 180`          | `rel_dir`   |
|        | `z`              | 4   | ` 225`          | `rel_dir`   |
|        | `a`              | 4   | ` 270`          | `rel_dir`   |
|        | `q`              | 4   | ` 315`          | `rel_dir`   |
|        | RET              | -1  | ``              | —           |
|        | `?`              | 12  | ` @a<dir><ret>` | —           |
| **7**  | RET              | -1  | ``              | —           |
|        | `?`              | 12  | ` <ret>`        | —           |
| **8**  | NUM              | 4   | `%c`            | `benum`     |
|        | `?`              | 12  | ` [0-9]`        | —           |
| **9**  | `b`              | 5   | ` beacon #`     | —           |
|        | `*`              | 5   | ` beacon #`     | —           |
|        | `?`              | 12  | ` b*`           | —           |
| **10** | NUM              | 7   | ` %c000 ft`     | `setrelalt` |
|        | `?`              | 12  | ` [0-9]`        | —           |
| **11** | `b`              | 8   | ` beacon #`     | `beacon`    |
|        | `*`              | 8   | ` beacon #`     | `beacon`    |
|        | `e`              | 8   | ` exit #`       | `ex_it`     |
|        | `a`              | 8   | ` airport #`    | `airport`   |
|        | `?`              | 12  | ` b*ea`         | —           |
| **12** | (none matchable) |     |                 |             |

Important consequences:

- **State 12 is a dead end.** After typing `?` the help text is echoed and no further
  character can match (its only rule has token `-1`). The player must use erase or
  kill to back out. This is the original behaviour.
- **Ambiguity resolution in state 2**: `a` is listed as `to 270` _after_ `L`/`R`/`t`;
  `c` is `to 135`; `d` is `to 90`. In state 6, `a` means "at" (delay) and comes
  **before** `a` = 270°, so `tla…` is always parsed as a delay, and the relative
  direction 270 is unreachable via `a` in state 6.
- **`cl`/`cr` do not exist.** `c` (circle) goes to state 4, which only accepts
  `@`/`a`/Return/`?`. _The manual page documents `cl` (counter-clockwise) and `cr`
  (clockwise) but the implementation has neither — circling is always clockwise._
- Altitude commands end in state 7 (Return only), so they **cannot be delayed**.
- `t<dir>`, `tL`, `tR`, `tt<x><n>` and `tl/tr[<dir>]` all end in state 4 or 6, which
  allow the optional `@b<n>` / `ab<n>` delay suffix.

### 8.5 Semantic actions

After the command terminates (`next_state == -1`):

- If exactly one rule was pushed (`level == 1`), i.e. the line was just Return, this
  is a **forced update**: perform an update immediately (§6) and restart the timer.
- Otherwise `dest_type` is reset to `T_NODEST` and the semantic actions are run in
  stack order (left to right). The first action returning a non-NULL string is an
  error: a run of `^` characters is drawn on input line 1 under that token's echo
  text, and the message is printed on input line 2. The command is discarded.

Actions operate on a scratch copy `p` of the plane, plus the globals `dir`
(`D_LEFT`=1, `D_RIGHT`=2, `D_UP`=3, `D_DOWN`=4), `dest_type`, `dest_no`.

| action         | behaviour                                                                                                                      | errors                                                                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setplane(c)`  | look up plane `number(c)` in `air` then `ground`; copy it into `p`; **set `p.delayd = 0`**                                     | `Unknown Plane` if not found                                                                                                                       |
| `turn`         | no state change                                                                                                                | `Planes at airports may not change direction` if `p.altitude == 0`                                                                                 |
| `circle`       | `p.new_dir = 8`                                                                                                                | `Planes cannot circle on the ground` if `p.altitude == 0`                                                                                          |
| `left`         | `dir = D_LEFT`; `p.new_dir = (p.dir - 1) mod 8`                                                                                | —                                                                                                                                                  |
| `right`        | `dir = D_RIGHT`; `p.new_dir = (p.dir + 1) mod 8`                                                                               | —                                                                                                                                                  |
| `Left`         | `p.new_dir = (p.dir - 2) mod 8` (does **not** set `dir`)                                                                       | —                                                                                                                                                  |
| `Right`        | `p.new_dir = (p.dir + 2) mod 8` (does **not** set `dir`)                                                                       | —                                                                                                                                                  |
| `to_dir(c)`    | `p.new_dir = dir_no(c)`                                                                                                        | —                                                                                                                                                  |
| `rel_dir(c)`   | `a = dir_no(c)`; if `dir==D_LEFT` `p.new_dir=(p.dir-a) mod 8`; if `D_RIGHT` `(p.dir+a) mod 8`                                  | `Bizarre direction in rel_dir!  Get help!` otherwise                                                                                               |
| `beacon`       | `dest_type = T_BEACON`                                                                                                         | —                                                                                                                                                  |
| `ex_it`        | `dest_type = T_EXIT`                                                                                                           | —                                                                                                                                                  |
| `airport`      | `dest_type = T_AIRPORT`                                                                                                        | —                                                                                                                                                  |
| `benum(c)`     | `n = c-'0'`; `dest_no = n`; set `p.new_dir = DIR_FROM_DXDY(target.x - p.x, target.y - p.y)` for the object of type `dest_type` | `Unknown beacon` / `Unknown exit` / `Unknown airport` if `n >= count`; `Unknown case in benum!  Get help!` if `dest_type` unset                    |
| `climb`        | `dir = D_UP`                                                                                                                   | —                                                                                                                                                  |
| `descend`      | `dir = D_DOWN`                                                                                                                 | —                                                                                                                                                  |
| `setalt(c)`    | `p.new_altitude = c-'0'`                                                                                                       | `Already at that altitude` if `p.altitude == c-'0' && p.new_altitude == p.altitude`                                                                |
| `setrelalt(c)` | `D_UP`: `p.new_altitude = p.altitude + (c-'0')`; `D_DOWN`: `p.altitude - (c-'0')`                                              | `Altitude would be too low` if result < 0; `Altitude would be too high` if result > 9; `Unknown case in setrelalt!  Get help!` if `dir` is neither |
| `delayb(c)`    | see below                                                                                                                      | see below                                                                                                                                          |
| `mark`         | `p.status = S_MARKED`                                                                                                          | `Cannot mark planes on the ground` if alt 0; `Already marked` if already `S_MARKED`                                                                |
| `unmark`       | `p.status = S_UNMARKED`                                                                                                        | `Cannot unmark planes on the ground` if alt 0; `Already unmarked`                                                                                  |
| `ignore`       | `p.status = S_IGNORED`                                                                                                         | `Cannot ignore planes on the ground` if alt 0; `Already ignored`                                                                                   |

`setrelalt` also contains a check `if (c == 0) return "altitude not changed";`, which
tests the raw character against NUL rather than `'0'`. Since digit characters are
never NUL, this branch is dead: `ac0` / `ad0` are accepted and set
`new_altitude = altitude` (a silent no-op). Reproduce as-is.

**`delayb(c)`** — `n = c - '0'`:

1. If `n >= num_beacons` → `Unknown beacon`.
2. Let `sx = sign(beacon[n].x - p.x)`, `sy = sign(beacon[n].y - p.y)`. If
   `(sx, sy) != (dx[p.dir], dy[p.dir])` → `Beacon is not in flight path`.
   (This is a coarse octant test against the plane's _current_ heading, not a check
   that the plane will actually pass over the beacon.)
3. `p.delayd = 1`, `p.delayd_no = n`.
4. If `dest_type != T_NODEST` (i.e. this is a `tt<x><m>@b<n>` command), recompute
   the deferred heading **from the beacon**, not from the current position:
   `(dx, dy) = target(dest_type, dest_no) - beacon[n]`.
   - If `dx == 0 && dy == 0` → `Would already be there`.
   - `p.new_dir = DIR_FROM_DXDY(dx, dy)`.
   - If `p.new_dir == p.dir` → `Already going in that direction`.

### 8.6 Committing the command

After all actions succeed, the real plane `pp` (looked up by `p.plane_no`) is updated
by exactly **one** of three mutually exclusive branches, tested in order:

1. `if (pp.new_altitude != p.new_altitude)` → `pp.new_altitude = p.new_altitude`
2. `else if (pp.status != p.status)` → `pp.status = p.status`
3. `else` → `pp.new_dir = p.new_dir; pp.delayd = p.delayd; pp.delayd_no = p.delayd_no`

Because `setplane` clears `p.delayd`, any command that falls into branch 3 without
setting a new delay **cancels an existing delayed command**.

Quirk worth reproducing: if an altitude command sets `new_altitude` to the value the
plane already had commanded (e.g. plane at 5000 ft climbing to 7000 ft, player types
`a7`), branch 1 does not fire, branch 2 does not fire, and branch 3 runs — silently
cancelling any pending delayed turn while leaving the heading unchanged.

### 8.7 Command grammar summary (user-facing)

All commands begin with the plane letter (case-insensitive).

**Immediate only:**

| syntax            | meaning                                                      |
| ----------------- | ------------------------------------------------------------ |
| `a<n>`            | set altitude to `n`000 ft                                    |
| `ac<n>` / `a+<n>` | climb `n`000 ft                                              |
| `ad<n>` / `a-<n>` | descend `n`000 ft                                            |
| `m`               | mark (highlight)                                             |
| `u`               | unmark (un-highlight; re-marks when a delayed command fires) |
| `i`               | ignore (un-highlight; command field shows dashes)            |

**Delayable** (may be followed by `@b<n>`, `@*<n>`, `ab<n>` or `a*<n>`):

| syntax                | meaning                                        |
| --------------------- | ---------------------------------------------- |
| `c`                   | circle (clockwise)                             |
| `t<dir>`              | turn to absolute heading (`wedcxzaq`)          |
| `tl` / `t-`           | turn 45° counter-clockwise                     |
| `tl<dir>` / `t-<dir>` | turn counter-clockwise by the angle of `<dir>` |
| `tr` / `t+`           | turn 45° clockwise                             |
| `tr<dir>` / `t+<dir>` | turn clockwise by the angle of `<dir>`         |
| `tL`                  | turn 90° counter-clockwise                     |
| `tR`                  | turn 90° clockwise                             |
| `ttb<n>` / `tt*<n>`   | turn towards beacon `n`                        |
| `tte<n>`              | turn towards exit `n`                          |
| `tta<n>`              | turn towards airport `n`                       |

Caveat from §8.4: in the relative-turn state, `a` is consumed as the delay keyword,
so `tla`/`tra` cannot express a 270° relative turn.

Examples (from the manual): `atlab1`, `cc`, `gtte4ab2`, `ma+2`, `stq`, `xi`.

---

## 9. Display

Terminal is split into four windows using curses. `INPUT_LINES = 3`,
`PLANE_COLS = 20`.

| window          | geometry                                       |
| --------------- | ---------------------------------------------- |
| `radar`         | `height` rows × `2*width` cols at (0, 0)       |
| `planes` (info) | `LINES - 3` rows × 20 cols at (0, `COLS - 20`) |
| `input`         | 3 rows × `COLS - 20` cols at (`LINES - 3`, 0)  |
| `credit`        | 3 rows × 20 cols at (`LINES - 3`, `COLS - 20`) |

Each radar cell occupies **two screen columns**: cell `(x, y)` is drawn at screen
column `2*x`, row `y`.

### 9.1 Radar

Drawn once at startup into both `radar` and a pristine copy `cleanradar` (used to
erase planes), in this order:

1. Background: for `1 <= y <= height-2`, `1 <= x <= width-2`, put `.` at column `2x`
   (the odd column is left blank).
2. Lines: each configured line is drawn from p1 to p2 by stepping
   `(sign(dx), sign(dy))` and writing the two characters `"+ "` (plus, space) at each
   cell. Lines are drawn _before_ border/beacons/exits/airports so those overwrite them.
3. Top border: row 0 filled with `width-1` occurrences of `"--"` plus one `-`
   (i.e. `2*width - 1` dashes). Same for row `height-1`.
4. Left/right borders: for `1 <= y <= height-2`, `|` at column 0 and at column
   `2*(width-1)`.
5. Beacons: `*` followed by `'0' + index` at the beacon cell.
6. Exits: a single character `'0' + index` at the exit cell (the second column keeps
   whatever was underneath).
7. Airports: a direction glyph followed by `'0' + index`. The glyph comes from the
   string `"^?>?v?<?"` indexed by the airport's direction — so dir 0 → `^`,
   2 → `>`, 4 → `v`, 6 → `<`, and any odd direction → `?`.

Exit and beacon indices are printed as single characters, so indices ≥ 10 render as
the characters following `'9'` in ASCII (`:`, `;`, …). The `crosshatch` game has 10
exits, whose last exit therefore renders as `9`; indices are 0..9 there. Any game with
more than 10 of a kind would render non-digits; reproduce the literal
`'0' + index` behaviour.

Planes are drawn each update as two characters: the plane letter followed by
`'0' + altitude`, at the plane's cell. Planes with `status == S_MARKED` are drawn in
**standout** (highlighted/reverse video); `S_UNMARKED` and `S_IGNORED` planes are
drawn normally.

Erasing (start of each update, before movement) restores both cell columns from
`cleanradar` at each airborne plane's current position.

Draw order within an update: erase all planes → (movement etc.) → draw all planes →
refresh radar → redraw info window → refresh input window (to park the cursor).

### 9.2 Information window

```
row 0: Time: %-4d Safe: %d          (clck, safe_planes)
row 1: (blank)
row 2: pl dt  comm
row 3+: one line per airborne plane, in plane_no order
       (blank line)
        one line per ground plane, in plane_no order
```

If the window runs out of rows, `---- more ----` is written on the last row
(row `LINES - INPUT_LINES - 1`) and the rest of the list is dropped.

Per-plane line (`command()`), built as:

1. `"%c%d%c%c%d: "` = plane letter, altitude digit, `*` if `fuel < LOWFUEL` (15) else
   a space, `A` if the destination is an airport else `E`, destination index.
2. Then exactly one of:
   - `Holding @ A%d` (origin airport index) — if `altitude == 0`
   - `Circle` — if `new_dir >= 8` or `new_dir < 0`
   - `%d` (`dir_deg(new_dir)`) — if `new_dir != dir`
   - nothing — otherwise
3. Then ` @ B%d` (delay beacon index) if `delayd`.
4. Then, if step 2 produced nothing **and** status is `S_UNMARKED` or `S_IGNORED`,
   the literal `---------` (nine hyphens).

Examples from the manual: `B4*A0: Circle @ B1`, `g7 E4: 225`.
(The manual page renders the beacon marker lower-case as `@ b1`; the code emits
upper-case `B`.)

### 9.3 Input window

Three rows:

- row 0 — the echoed command as it is typed
- row 1 — a run of `^` under the offending token when a semantic error occurs
- row 2 — the error message, or the `Really quit? (y/n) ` prompt, or the
  loss message continuation

Erase pops a token and clears from that token's start column to end of line. The
first pushed token clears rows 1 and 2.

### 9.4 Credit window

20 columns × 3 rows at the bottom right. Rows 0 and 2 are filled with `*` for the
first 19 columns (one short, to avoid scrolling). Row 1 column 1 contains
`ATC - by Ed James`.

### 9.5 Redraw

`Ctrl-L` clears and refreshes the physical screen, then touches and refreshes radar,
planes, credit and finally input (so the cursor ends up in the input area).

---

## 10. Command-line interface

```
atc [-u?lstp] [-gf game_name] [-r random_seed]
```

| flag                                                   | effect                                                     |
| ------------------------------------------------------ | ---------------------------------------------------------- |
| `-u`, `-?`, any unknown flag, or any non-flag argument | print usage to stderr                                      |
| `-l`                                                   | print the list of available games                          |
| `-s`, `-t`                                             | print the score list                                       |
| `-p`                                                   | print the game data directory path (trailing `/` stripped) |
| `-g name`, `-f name`                                   | select the game (last one wins)                            |
| `-r seed`                                              | set the random seed (`atoi` of the argument)               |

Usage string:

```
Usage: <argv0> -[u?lstp] [-[gf] game_name] [-r random seed]
```

If any of `-u/-?/-l/-s/-t/-p` (or a usage error) was given, the requested output is
produced in the order usage → scores → list → path, and the program exits 0 without
playing.

Default seed is `time(NULL)`, which is also recorded as the game start time (used for
`real_time` in the score file). Seeding uses `srandom(seed)`.

Startup order: open score file → drop privileges → parse args → seed → resolve game
file → parse game file (exit 1 on failure) → init curses → draw radar → `addplane()`
→ install signal handlers → set terminal modes → start the interval timer → enter the
input loop.

The first interval timer is armed with an initial delay of 1 microsecond and a period
of `update` seconds, so the first automatic update happens essentially immediately
after startup.

---

## 11. Constants reference

| name                         | value               | meaning                                                                |
| ---------------------------- | ------------------- | ---------------------------------------------------------------------- |
| `MAXDIR`                     | 8                   | number of compass directions; also the "circle" sentinel for `new_dir` |
| `LOWFUEL`                    | 15                  | fuel below this shows `*` in the info window                           |
| `NUM_SCORES`                 | 18                  | maximum scoreboard entries                                             |
| `INPUT_LINES`                | 3                   | height of the input/credit windows                                     |
| `PLANE_COLS`                 | 20                  | width of the info/credit windows                                       |
| entry altitude               | 7                   | altitude of planes entering via an exit                                |
| exit altitude                | 9                   | required altitude to leave via an exit                                 |
| max altitude                 | 9                   | flight ceiling                                                         |
| initial fuel                 | `width + height`    | moves before running out of fuel                                       |
| new-plane proximity          | 4                   | Chebyshev-ish clearance required at an exit spawn                      |
| collision distance           | 1                   | adjacency in x, y and altitude                                         |
| max turn per move            | 2                   | 90°                                                                    |
| max altitude change per move | 1                   | 1000 ft                                                                |
| prop plane cadence           | every other tick    | moves only when `clck` is even                                         |
| `AUTHOR_STR`                 | `ATC - by Ed James` | credit line                                                            |

---

## 12. Known original bugs / quirks to preserve

From `orig/BUGS` and code reading:

1. `log restarts if interrupted` — score logging is not atomic against signals.
2. `Still refreshes after exit`.
3. `Should ^Z be disabled?` — it is (SIGTSTP ignored).
4. `does not exit after hup`.
5. `number()`'s guard `if (l < 'a' && l > 'z' && l < 'A' && l > 'Z')` is always false;
   the function never returns -1.
6. `setrelalt`'s `c == 0` check is against NUL, not `'0'`; `ac0`/`ad0` are silent no-ops.
7. Typing `?` leads to a state from which only erase/kill can escape.
8. `cl`/`cr` (documented) are unimplemented; circling is always clockwise.
9. The commit logic (§8.6) can cancel a delayed command as a side effect of a
   redundant altitude command.
10. `exceded` is misspelled in the flight-ceiling message.
11. `addplane` breaks out of its retry loop unconditionally on an airport start, so
    the anti-clustering retry only ever applies to exit starts.
12. The comment in `update()` about "check every other update" for new planes does not
    match the code, which checks every update.

---

## 13. Out of scope (implementation-specific)

Curses specifics, signal/timer mechanics, `fork`/`exec` for the `!` shell escape,
setgid score-file privilege handling, and file locking are implementation choices.
The observable behaviour they produce (see §8.2, §7.3, §10) is in scope.
