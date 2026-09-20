import { dirFromDxDy, dirFromKey, idFromLetter } from './dir';
import type { Game } from './game';
import { projectPath } from './game';
import type { HeadingCmd, MarkStatus, Plane } from './types';

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
}

interface Draft {
  plane: Plane | null;
  heading?: HeadingCmd;
  delayBeacon?: number;
  target?: { type: TargetType; index: number };
  altitude?: number;
  relDir?: 'up' | 'down';
  status?: MarkStatus;
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
  };

  constructor(private readonly game: Game) {}

  reset(): void {
    this.editor.frags = [];
    this.editor.state = 'Start';
    this.editor.col = 0;
    this.editor.message = '';
    this.editor.caretUnder = null;
  }

  feed(token: Token): 'accepted' | 'invalid' | 'forced-update' {
    if (token === '?') {
      this.editor.message = hints[this.editor.state];
      this.editor.caretUnder = null;
      return 'accepted';
    }
    this.editor.message = '';
    this.editor.caretUnder = null;
    if (token === 'BACKSPACE') return this.backspace() ? 'accepted' : 'invalid';
    if (token === 'CTRL_U') {
      this.reset();
      return 'accepted';
    }
    const transition = this.transition(this.editor.state, token);
    if (!transition) return 'invalid';
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
      if (error) {
        const problem = this.editor.frags[error.index];
        this.editor.message = error.message;
        this.editor.caretUnder = { col: problem.col, len: problem.text.length };
      }
      this.resetAfterCommand(
        error ? this.editor.message : '',
        this.editor.caretUnder,
      );
      return forced ? 'forced-update' : 'accepted';
    }
    this.editor.state = transition.state;
    return 'accepted';
  }

  private resetAfterCommand(
    message: string,
    caretUnder: { col: number; len: number } | null = null,
  ): void {
    this.editor.frags = [];
    this.editor.state = 'Start';
    this.editor.col = 0;
    this.editor.caretUnder = caretUnder;
    this.editor.message = message;
  }

  private backspace(): boolean {
    const fragment = this.editor.frags.pop();
    if (!fragment) return false;
    this.editor.state = fragment.state;
    this.editor.col = fragment.col;
    return true;
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
      return digit ? { state: 'End', text: ` ${token}000 ft` } : null;
    return state === 'End' && token === 'ENTER'
      ? { state: null, text: '' }
      : null;
  }

  private apply(): { message: string; index: number } | null {
    const draft: Draft = { plane: null };
    const states = this.editor.frags.map((fragment) => fragment.state);
    for (let i = 0; i < this.editor.frags.length; i += 1) {
      const fragment = this.editor.frags[i];
      const error = this.action(fragment, states[i], draft);
      if (error) return { message: error, index: i };
    }
    const plane = draft.plane;
    if (!plane) return { message: 'Unknown Plane', index: 0 };
    if (draft.status !== undefined) plane.status = draft.status;
    else if (draft.altitude !== undefined)
      plane.targetAltitude = draft.altitude;
    else if (draft.heading !== undefined) {
      if (draft.delayBeacon !== undefined)
        plane.pending = { heading: draft.heading, beacon: draft.delayBeacon };
      else {
        plane.heading = draft.heading;
        plane.pending = null;
      }
    }
    return null;
  }

  private action(fragment: Frag, state: StateId, draft: Draft): string | null {
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
    )
      draft.heading = { kind: 'fixed', dir: dirFromKey(token)! };
    else if (state === 'Towards') {
      const type =
        token === 'e' ? 'exit' : token === 'a' ? 'airport' : 'beacon';
      draft.target = { type, index: -1 };
    } else if (state === 'TowardsNum') {
      const index = Number(token);
      const target = draft.target!;
      const list =
        target.type === 'beacon'
          ? this.game.def.beacons
          : target.type === 'exit'
            ? this.game.def.exits
            : this.game.def.airports;
      if (index >= list.length) return `Unknown ${target.type}`;
      target.index = index;
      draft.heading = {
        kind: 'fixed',
        dir: dirFromDxDy(list[index].x - plane.x, list[index].y - plane.y),
      };
    } else if (state === 'Circle' && (token === 'l' || token === 'r'))
      draft.heading = { kind: 'circle', turn: token === 'l' ? 'ccw' : 'cw' };
    else if (state === 'Alt') {
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
      if (altitude > 9) return 'Altitude would be too high';
      draft.altitude = altitude;
    } else if (state === 'DelayNum')
      return this.delayAtBeacon(plane, draft, Number(token));
    return null;
  }

  private delayAtBeacon(
    plane: Plane,
    draft: Draft,
    beaconNo: number,
  ): string | null {
    const beacon = this.game.def.beacons[beaconNo];
    if (!beacon) return 'Unknown beacon';
    if (plane.heading.kind === 'circle') return 'Plane is circling';
    const arrival = projectPath(plane, this.game.def).find(
      (step) => step.x === beacon.x && step.y === beacon.y,
    );
    if (!arrival) return 'Beacon is not in flight path';
    draft.delayBeacon = beaconNo;
    if (draft.target) {
      const list =
        draft.target.type === 'beacon'
          ? this.game.def.beacons
          : draft.target.type === 'exit'
            ? this.game.def.exits
            : this.game.def.airports;
      const target = list[draft.target.index];
      const dx = target.x - beacon.x;
      const dy = target.y - beacon.y;
      if (dx === 0 && dy === 0) return 'Would already be there';
      const dir = dirFromDxDy(dx, dy);
      if (dir === arrival.dir) return 'Already going in that direction';
      draft.heading = { kind: 'fixed', dir };
    }
    return null;
  }
}
