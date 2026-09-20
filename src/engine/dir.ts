import type { Dir, HeadingCmd, Plane } from './types';

export const DX: readonly number[] = [0, 1, 1, 1, 0, -1, -1, -1];
export const DY: readonly number[] = [-1, -1, 0, 1, 1, 1, 0, -1];
export const DEG: readonly number[] = [0, 45, 90, 135, 180, 225, 270, 315];
export const DIR_KEYS = 'wedcxzaq';

export function dirFromKey(key: string): Dir | null {
  const index = DIR_KEYS.indexOf(key);
  return index === -1 ? null : (index as Dir);
}

export function dirFromDxDy(dx: number, dy: number): Dir {
  return (Math.trunc((Math.atan2(dy, dx) * 8) / (2 * Math.PI) + 2.5 + 8) %
    8) as Dir;
}

export function letterOf(plane: Plane): string {
  const base = plane.kind === 'prop' ? 65 : 97;
  return String.fromCharCode(base + plane.id);
}

export function idFromLetter(ch: string): number | null {
  if (ch.length !== 1) return null;
  const code = ch.toUpperCase().charCodeAt(0);
  return code >= 65 && code <= 90 ? code - 65 : null;
}

/** Shortest-path turn toward a fixed heading, clamped to +-2 steps. */
function stepToward(dir: Dir, target: Dir): Dir {
  let delta = target - dir;
  if (delta > 4) delta -= 8;
  else if (delta < -4) delta += 8;
  delta = Math.max(-2, Math.min(2, delta));
  return ((dir + delta + 8) % 8) as Dir;
}

/** Circling tables preserve the original's odd-to-even heading convergence. */
export const CIRCLE_CW = [2, 3, 4, 5, 6, 7, 0, 0] as const;
export const CIRCLE_CCW = [6, 0, 0, 1, 2, 3, 4, 5] as const;

export function nextDirFrom(dir: Dir, cmd: HeadingCmd): Dir {
  if (cmd.kind === 'circle') {
    return (cmd.turn === 'cw' ? CIRCLE_CW : CIRCLE_CCW)[dir] as Dir;
  }
  return stepToward(dir, cmd.dir);
}

export function nextDir(plane: Plane): Dir {
  return nextDirFrom(plane.dir, plane.heading);
}
