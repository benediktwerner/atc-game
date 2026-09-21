import type { Dir, Plane } from './types';

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
