import { dirFromDxDy, dirFromKey, idFromLetter } from './dir';
import type { Game } from './game';
import { projectPath, MAX_ALTITUDE } from './game';
import type { Dir, HeadingCmd, MarkStatus, Plane, Point } from './types';

type StateId =
  | 'Start'
  | 'Cmd'
  | 'Turn'
  | 'Towards'
  | 'TowardsNum'
  | 'Circle'
  | 'Delayable'
  | 'DelayKey'
  | 'DelayNum'
  | 'Alt'
  | 'AltRel'
  | 'End';
type TargetType = 'beacon' | 'exit' | 'airport';
type Token = string | 'ENTER';

interface Frag {
  text: string;
  col: number;
  state: StateId;
  ch: Token;
}

export interface Editor {
  frags: Frag[];
  state: StateId;
  col: number;
  message: string;
  caretUnder: { col: number; len: number } | null;
  /** Text of a rejected command, kept on screen so `caretUnder` has something to point at. */
  errorText: string;
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

const hints: Record<StateId, string> = {
  Start: ' [a-z]<ret>',
  Cmd: ' tacmui',
  Turn: ' t<dir>',
  Towards: ' b*ea',
  TowardsNum: ' [0-9]',
  Circle: ' lr@a<ret>',
  Delayable: ' @a<ret>',
  DelayKey: ' b*',
  DelayNum: ' [0-9]',
  Alt: ' +-cd[0-9]',
  AltRel: ' [0-9]',
  End: ' <ret>',
};

export class CommandEditor {
  readonly editor: Editor = {
    frags: [],
    state: 'Start',
    col: 0,
    message: '',
    caretUnder: null,
    errorText: '',
  };

  constructor(private readonly game: Game) {}

  reset(): void {
    this.editor.frags = [];
    this.editor.state = 'Start';
    this.editor.col = 0;
    this.editor.message = '';
    this.editor.caretUnder = null;
    this.editor.errorText = '';
  }

  /** Invalid keystrokes are silently ignored; only a forced update is signalled. */
  feed(token: Token): 'accepted' | 'forced-update' {
    if (token === '?') {
      this.editor.message = hints[this.editor.state];
      this.editor.caretUnder = null;
      this.editor.errorText = '';
      return 'accepted';
    }
    this.editor.message = '';
    this.editor.caretUnder = null;
    this.editor.errorText = '';
    if (token === 'BACKSPACE') {
      this.backspace();
      return 'accepted';
    }
    if (token === 'CTRL_U') {
      this.reset();
      return 'accepted';
    }
    const transition = this.transition(this.editor.state, token);
    if (!transition) return 'accepted';
    const fragment: Frag = {
      text: transition.text,
      col: this.editor.col,
      state: this.editor.state,
      ch: token,
    };
    this.editor.frags.push(fragment);
    this.editor.col += transition.text.length;
    if (transition.state === null) {
      const forced = this.editor.frags.length === 1;
      const error = forced ? null : this.apply();
      if (!error) {
        this.resetAfterCommand('');
        return forced ? 'forced-update' : 'accepted';
      }
      const problem = this.editor.frags[error.index];
      const text = this.editor.frags.map((fragment) => fragment.text).join('');
      this.resetAfterCommand(
        error.message,
        { col: problem.col, len: problem.text.length },
        text,
      );
      return forced ? 'forced-update' : 'accepted';
    }
    this.editor.state = transition.state;
    return 'accepted';
  }

  private resetAfterCommand(
    message: string,
    caretUnder: { col: number; len: number } | null = null,
    errorText = '',
  ): void {
    this.editor.frags = [];
    this.editor.state = 'Start';
    this.editor.col = 0;
    this.editor.caretUnder = caretUnder;
    this.editor.message = message;
    this.editor.errorText = errorText;
  }

  private backspace(): void {
    const fragment = this.editor.frags.pop();
    if (!fragment) return;
    this.editor.state = fragment.state;
    this.editor.col = fragment.col;
  }

  private transition(
    state: StateId,
    token: Token,
  ): { state: StateId | null; text: string } | null {
    const digit = typeof token === 'string' && /^[0-9]$/.test(token);
    const dir = typeof token === 'string' ? dirFromKey(token) : null;
    if (state === 'Start')
      return token === 'ENTER'
        ? { state: null, text: '' }
        : typeof token === 'string' && /^[A-Za-z]$/.test(token)
          ? { state: 'Cmd', text: `${token}:` }
          : null;
    if (state === 'Cmd') {
      const map: Record<string, [StateId, string]> = {
        t: ['Turn', ' turn'],
        a: ['Alt', ' altitude:'],
        c: ['Circle', ' circle'],
        m: ['End', ' mark'],
        u: ['End', ' unmark'],
        i: ['End', ' ignore'],
      };
      const next = typeof token === 'string' ? map[token] : undefined;
      return next ? { state: next[0], text: next[1] } : null;
    }
    if (state === 'Turn') {
      if (token === 't') return { state: 'Towards', text: ' towards' };
      return dir !== null
        ? { state: 'Delayable', text: ` to ${dir * 45}` }
        : null;
    }
    if (state === 'Towards') {
      const map: Record<string, [TargetType, string]> = {
        b: ['beacon', ' beacon #'],
        '*': ['beacon', ' beacon #'],
        e: ['exit', ' exit #'],
        a: ['airport', ' airport #'],
      };
      const next = typeof token === 'string' ? map[token] : undefined;
      return next ? { state: 'TowardsNum', text: next[1] } : null;
    }
    if (state === 'TowardsNum')
      return digit ? { state: 'Delayable', text: token } : null;
    if (state === 'Circle') {
      if (token === 'l') return { state: 'Delayable', text: ' left' };
      if (token === 'r') return { state: 'Delayable', text: ' right' };
      if (token === '@' || token === 'a')
        return { state: 'DelayKey', text: ' at' };
      return token === 'ENTER' ? { state: null, text: '' } : null;
    }
    if (state === 'Delayable')
      return token === 'ENTER'
        ? { state: null, text: '' }
        : token === '@' || token === 'a'
          ? { state: 'DelayKey', text: ' at' }
          : null;
    if (state === 'DelayKey')
      return token === 'b' || token === '*'
        ? { state: 'DelayNum', text: ' beacon #' }
        : null;
    if (state === 'DelayNum')
      return digit ? { state: 'End', text: token } : null;
    if (state === 'Alt') {
      if (token === '+' || token === 'c')
        return { state: 'AltRel', text: ' climb' };
      if (token === '-' || token === 'd')
        return { state: 'AltRel', text: ' descend' };
      return digit ? { state: 'End', text: ` ${token}000 feet` } : null;
    }
    if (state === 'AltRel')
      return digit ? { state: 'End', text: ` ${token}000 feet` } : null;
    return state === 'End' && token === 'ENTER'
      ? { state: null, text: '' }
      : null;
  }

  private apply(): CommandError | null {
    const draft: Draft = { plane: null };
    const states = this.editor.frags.map((fragment) => fragment.state);
    for (let i = 0; i < this.editor.frags.length; i += 1) {
      const fragment = this.editor.frags[i];
      const error = this.action(fragment, states[i], draft, i);
      if (error) return { message: error, index: i };
    }
    const plane = draft.plane;
    if (!plane) return { message: 'Unknown Plane', index: 0 };
    if (draft.status !== undefined) plane.status = draft.status;
    else if (draft.altitude !== undefined)
      plane.targetAltitude = draft.altitude;
    else if (draft.heading !== undefined || draft.target !== undefined)
      return this.commitHeading(plane, draft);
    return null;
  }

  /**
   * Resolves and commits a heading command. None of this can be validated as the
   * fragments are typed: a turn-towards is measured from the delay beacon rather
   * than from the plane, and the delay suffix only arrives at the end.
   */
  private commitHeading(plane: Plane, draft: Draft): CommandError | null {
    const headingIndex = draft.headingIndex!;
    let origin: Point = plane;
    let arrivalDir: Dir | null = null;
    if (draft.delay) {
      const beacon = this.game.def.beacons[draft.delay.beacon];
      if (plane.heading.kind === 'circle')
        return { message: 'Plane is circling', index: draft.delay.index };
      const arrival = projectPath(plane, this.game.def).find(
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
      const point = this.targetList(draft.target.type)[draft.target.index];
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

  private targetList(type: TargetType): readonly Point[] {
    const { beacons, exits, airports } = this.game.def;
    return type === 'beacon' ? beacons : type === 'exit' ? exits : airports;
  }

  private action(
    fragment: Frag,
    state: StateId,
    draft: Draft,
    index: number,
  ): string | null {
    const token = fragment.ch;
    if (state === 'Start') {
      const id = idFromLetter(String(token));
      draft.plane =
        id === null
          ? null
          : ([...this.game.air, ...this.game.ground].find(
              (plane) => plane.id === id,
            ) ?? null);
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
      const type =
        token === 'e' ? 'exit' : token === 'a' ? 'airport' : 'beacon';
      draft.target = { type, index: -1 };
    } else if (state === 'TowardsNum') {
      const target = draft.target!;
      const targetIndex = Number(token);
      if (targetIndex >= this.targetList(target.type).length)
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
      if (!this.game.def.beacons[beacon]) return 'Unknown beacon';
      draft.delay = { beacon, index };
    }
    return null;
  }
}
