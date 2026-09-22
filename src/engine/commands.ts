import { MAX_ALTITUDE } from './constants';
import { dirFromDxDy, dirFromKey, idFromLetter } from './dir';
import type { Frag, StateId, Token } from './grammar';
import { hints, transition } from './grammar';
import type { Game } from './game';
import { projectPath } from './motion';
import type { Dir, HeadingCmd, MarkStatus, Plane, Point } from './types';

export type { Frag, StateId, Token } from './grammar';

type TargetType = 'beacon' | 'exit' | 'airport';

export interface Editor {
  frags: Frag[];
  state: StateId;
  /** A `?` hint, or the message of the last rejected command. */
  message: string;
  /**
   * A rejected command: its fragments, kept on screen so the caret has something to
   * point at, and the index of the offending one. Screen columns are deliberately
   * not computed here — laying the echo out is `ui/input.ts`'s job.
   */
  rejected: { frags: Frag[]; index: number } | null;
}

interface Draft {
  plane: Plane | null;
  heading?: HeadingCmd;
  /** Fragment that chose the heading, so a whole-command error can point at it. */
  headingIndex?: number;
  target?: { type: TargetType; index: number };
  delay?: { beacon: number; index: number };
  altitude?: number;
  relDir?: 'up' | 'down';
  status?: MarkStatus;
}

/** A rejected command: the message to show and the fragment to underline. */
interface CommandError {
  message: string;
  index: number;
}

/**
 * Tracks the command being typed: it feeds tokens through the grammar, keeps the
 * echoed fragments and hands a finished command to `applyCommand`.
 */
export class CommandEditor {
  readonly editor: Editor = {
    frags: [],
    state: 'Start',
    message: '',
    rejected: null,
  };

  constructor(private readonly game: Game) {}

  reset(): void {
    this.resetAfterCommand('');
  }

  /** Invalid keystrokes are silently ignored; only a forced update is signalled. */
  feed(token: Token): 'accepted' | 'forced-update' {
    if (token === '?') {
      this.editor.message = hints[this.editor.state];
      this.editor.rejected = null;
      return 'accepted';
    }
    this.editor.message = '';
    this.editor.rejected = null;
    if (token === 'BACKSPACE') {
      this.backspace();
      return 'accepted';
    }
    if (token === 'CTRL_U') {
      this.reset();
      return 'accepted';
    }
    const next = transition(this.editor.state, token);
    if (!next) return 'accepted';
    this.editor.frags.push({
      text: next.text,
      state: this.editor.state,
      ch: token,
    });
    if (next.state === null) {
      const forced = this.editor.frags.length === 1;
      const error = forced ? null : applyCommand(this.game, this.editor.frags);
      this.resetAfterCommand(
        error?.message ?? '',
        error ? { frags: this.editor.frags, index: error.index } : null,
      );
      return forced ? 'forced-update' : 'accepted';
    }
    this.editor.state = next.state;
    return 'accepted';
  }

  private resetAfterCommand(
    message: string,
    rejected: Editor['rejected'] = null,
  ): void {
    // Replaced, never emptied in place: `rejected` may hold the outgoing array.
    this.editor.frags = [];
    this.editor.state = 'Start';
    this.editor.message = message;
    this.editor.rejected = rejected;
  }

  private backspace(): void {
    const fragment = this.editor.frags.pop();
    if (fragment) this.editor.state = fragment.state;
  }
}

/**
 * Validates a completed command against the game and, if it holds, applies it.
 * Commands are typed intents: each branch writes exactly the plane fields it names.
 */
export function applyCommand(
  game: Game,
  frags: readonly Frag[],
): CommandError | null {
  const draft: Draft = { plane: null };
  for (let i = 0; i < frags.length; i += 1) {
    const error = action(game, frags[i], draft, i);
    if (error) return { message: error, index: i };
  }
  const plane = draft.plane;
  if (!plane) return { message: 'Unknown Plane', index: 0 };
  if (draft.status !== undefined) plane.status = draft.status;
  else if (draft.altitude !== undefined) plane.targetAltitude = draft.altitude;
  else if (draft.heading !== undefined || draft.target !== undefined)
    return commitHeading(game, plane, draft);
  return null;
}

/**
 * Resolves and commits a heading command. None of this can be validated as the
 * fragments are typed: a turn-towards is measured from the delay beacon rather
 * than from the plane, and the delay suffix only arrives at the end.
 */
function commitHeading(
  game: Game,
  plane: Plane,
  draft: Draft,
): CommandError | null {
  const headingIndex = draft.headingIndex!;
  let origin: Point = plane;
  let arrivalDir: Dir | null = null;
  if (draft.delay) {
    const beacon = game.def.beacons[draft.delay.beacon];
    if (plane.heading.kind === 'circle')
      return { message: 'Plane is circling', index: draft.delay.index };
    const arrival = projectPath(plane, game.def).find(
      (step) => step.x === beacon.x && step.y === beacon.y,
    );
    if (!arrival)
      return {
        message: 'Beacon is not in flight path',
        index: draft.delay.index,
      };
    origin = beacon;
    arrivalDir = arrival.dir;
  }
  let heading: HeadingCmd;
  if (draft.target) {
    const point = targetList(game, draft.target.type)[draft.target.index];
    const dx = point.x - origin.x;
    const dy = point.y - origin.y;
    if (dx === 0 && dy === 0)
      return { message: 'Would already be there', index: headingIndex };
    heading = { kind: 'fixed', dir: dirFromDxDy(dx, dy) };
  } else heading = draft.heading!;
  if (heading.kind === 'fixed') {
    // An immediate command also clears any pending one, so it is only a no-op
    // when the plane already holds the heading and has nothing left to cancel.
    const current = draft.delay
      ? arrivalDir
      : plane.pending === null && plane.heading.kind === 'fixed'
        ? plane.heading.dir
        : null;
    if (current === heading.dir)
      return {
        message: 'Already going in that direction',
        index: headingIndex,
      };
  }
  if (draft.delay) plane.pending = { heading, beacon: draft.delay.beacon };
  else {
    plane.heading = heading;
    plane.pending = null;
  }
  return null;
}

function targetList(game: Game, type: TargetType): readonly Point[] {
  const { beacons, exits, airports } = game.def;
  return type === 'beacon' ? beacons : type === 'exit' ? exits : airports;
}

/** Folds one typed fragment into the draft, or returns why it is rejected. */
function action(
  game: Game,
  fragment: Frag,
  draft: Draft,
  index: number,
): string | null {
  const token = fragment.ch;
  const state = fragment.state;
  if (state === 'Start') {
    const id = idFromLetter(String(token));
    draft.plane =
      id === null
        ? null
        : ([...game.air, ...game.ground].find((plane) => plane.id === id) ??
          null);
    return draft.plane ? null : 'Unknown Plane';
  }
  const plane = draft.plane!;
  if (state === 'Cmd') {
    if (token === 't' && plane.altitude === 0)
      return 'Planes at airports may not change direction';
    if (token === 'c') {
      if (plane.altitude === 0) return 'Planes cannot circle on the ground';
      draft.heading = { kind: 'circle', turn: 'cw' };
      draft.headingIndex = index;
    }
    if (token === 'm') {
      if (plane.altitude === 0) return 'Cannot mark planes on the ground';
      if (plane.status === 'marked') return 'Already marked';
      draft.status = 'marked';
    }
    if (token === 'u') {
      if (plane.altitude === 0) return 'Cannot unmark planes on the ground';
      if (plane.status === 'unmarked') return 'Already unmarked';
      draft.status = 'unmarked';
    }
    if (token === 'i') {
      if (plane.altitude === 0) return 'Cannot ignore planes on the ground';
      if (plane.status === 'ignored') return 'Already ignored';
      draft.status = 'ignored';
    }
  } else if (
    state === 'Turn' &&
    typeof token === 'string' &&
    dirFromKey(token) !== null
  ) {
    draft.heading = { kind: 'fixed', dir: dirFromKey(token)! };
    draft.headingIndex = index;
  } else if (state === 'Towards') {
    const type = token === 'e' ? 'exit' : token === 'a' ? 'airport' : 'beacon';
    draft.target = { type, index: -1 };
  } else if (state === 'TowardsNum') {
    const target = draft.target!;
    const targetIndex = Number(token);
    if (targetIndex >= targetList(game, target.type).length)
      return `Unknown ${target.type}`;
    target.index = targetIndex;
    draft.headingIndex = index;
  } else if (state === 'Circle' && (token === 'l' || token === 'r')) {
    draft.heading = { kind: 'circle', turn: token === 'l' ? 'ccw' : 'cw' };
    draft.headingIndex = index;
  } else if (state === 'Alt') {
    if (/^[0-9]$/.test(String(token))) {
      const altitude = Number(token);
      if (plane.altitude === altitude && plane.targetAltitude === altitude)
        return 'Already at that altitude';
      draft.altitude = altitude;
    } else draft.relDir = token === '+' || token === 'c' ? 'up' : 'down';
  } else if (state === 'AltRel') {
    const amount = Number(token);
    if (amount === 0) return 'Altitude not changed';
    const altitude =
      plane.altitude + (draft.relDir === 'up' ? amount : -amount);
    if (altitude < 0) return 'Altitude would be too low';
    if (altitude > MAX_ALTITUDE) return 'Altitude would be too high';
    draft.altitude = altitude;
  } else if (state === 'DelayNum') {
    const beacon = Number(token);
    if (!game.def.beacons[beacon]) return 'Unknown beacon';
    draft.delay = { beacon, index };
  }
  return null;
}
