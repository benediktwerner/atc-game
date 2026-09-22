import type { StateId } from '../engine/grammar';

const DIRECTION_BY_CODE: Readonly<Record<string, string>> = {
  KeyW: 'w',
  KeyE: 'e',
  KeyD: 'd',
  KeyC: 'c',
  KeyX: 'x',
  KeyZ: 'z',
  KeyA: 'a',
  KeyQ: 'q',
};

export function directionTokenForCode(code: string): string | null {
  return DIRECTION_BY_CODE[code] ?? null;
}

/** What a keystroke means while a game is running. */
export type PlayIntent =
  { kind: 'token'; token: string } | { kind: 'tick' } | { kind: 'pause' };

export type PauseIntent = 'continue' | 'restart' | 'quit';

/**
 * Maps a keystroke to a playing-mode intent, or `null` when the key is not ours —
 * browser shortcuts and navigation keys must keep their default behaviour.
 */
export function playIntent(
  event: KeyboardEvent,
  state: StateId,
): PlayIntent | null {
  if (event.ctrlKey && event.key.toLowerCase() === 'u')
    return { kind: 'token', token: 'CTRL_U' };
  if (event.ctrlKey || event.metaKey) return null;
  if (event.key === 'Enter') return { kind: 'token', token: 'ENTER' };
  if (event.key === ' ') return { kind: 'tick' };
  if (event.key === 'Backspace') return { kind: 'token', token: 'BACKSPACE' };
  if (event.key === 'Escape') return { kind: 'pause' };
  // In `Turn` the *physical* ring of keys around `s` is what matters, so the
  // layout-independent `code` wins there; everywhere else the typed character is
  // what counts. Either way only single ASCII characters are commands.
  const key =
    (state === 'Turn' ? directionTokenForCode(event.code) : null) ?? event.key;
  return key.length === 1 && key.charCodeAt(0) < 128
    ? { kind: 'token', token: key }
    : null;
}

export function pauseIntent(event: KeyboardEvent): PauseIntent | null {
  if (['Escape', 'c', 'C'].includes(event.key)) return 'continue';
  if (['r', 'R'].includes(event.key)) return 'restart';
  if (['q', 'Q'].includes(event.key)) return 'quit';
  return null;
}

/** After a loss the final position stays up until Space calls the score screen. */
export function isContinueKey(event: KeyboardEvent): boolean {
  return event.key === ' ';
}
