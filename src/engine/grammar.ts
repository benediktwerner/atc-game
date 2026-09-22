import { dirFromKey } from './dir';

export type StateId =
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
export type Token = string | 'ENTER';

export interface Frag {
  text: string;
  state: StateId;
  ch: Token;
}

/** `state: null` ends the command; the fragment itself echoes nothing. */
export interface Transition {
  state: StateId | null;
  text: string;
}

export const hints: Record<StateId, string> = {
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

const CMD_TEXT: Record<string, [StateId, string]> = {
  t: ['Turn', ' turn'],
  a: ['Alt', ' altitude:'],
  c: ['Circle', ' circle'],
  m: ['End', ' mark'],
  u: ['End', ' unmark'],
  i: ['End', ' ignore'],
};

const TOWARDS_TEXT: Record<string, string> = {
  b: ' beacon #',
  '*': ' beacon #',
  e: ' exit #',
  a: ' airport #',
};

/**
 * The command grammar: the fragment a token produces in a state, or `null` when the
 * token is not accepted there. Only shape is decided here — whether the command
 * makes sense for the plane is `applyCommand`'s job.
 */
export function transition(state: StateId, token: Token): Transition | null {
  const digit = typeof token === 'string' && /^[0-9]$/.test(token);
  const dir = typeof token === 'string' ? dirFromKey(token) : null;
  if (state === 'Start')
    return token === 'ENTER'
      ? { state: null, text: '' }
      : typeof token === 'string' && /^[A-Za-z]$/.test(token)
        ? { state: 'Cmd', text: `${token}:` }
        : null;
  if (state === 'Cmd') {
    const next = typeof token === 'string' ? CMD_TEXT[token] : undefined;
    return next ? { state: next[0], text: next[1] } : null;
  }
  if (state === 'Turn') {
    if (token === 't') return { state: 'Towards', text: ' towards' };
    return dir !== null
      ? { state: 'Delayable', text: ` to ${dir * 45}` }
      : null;
  }
  if (state === 'Towards') {
    const text = typeof token === 'string' ? TOWARDS_TEXT[token] : undefined;
    return text ? { state: 'TowardsNum', text } : null;
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
  if (state === 'DelayNum') return digit ? { state: 'End', text: token } : null;
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
