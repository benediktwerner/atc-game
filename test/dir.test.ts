import { describe, expect, it } from 'vitest';
import {
  CIRCLE_CCW,
  CIRCLE_CW,
  DIR_KEYS,
  dirFromDxDy,
  dirFromKey,
  idFromLetter,
  nextDirFrom,
} from '../src/engine/dir';

describe('directions', () => {
  it('maps the keyboard ring and displacement examples', () => {
    expect(DIR_KEYS.split('').map(dirFromKey)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(dirFromKey('s')).toBeNull();
    expect(dirFromDxDy(1, 0)).toBe(2);
    expect(dirFromDxDy(0, -1)).toBe(0);
    expect(dirFromDxDy(1, -1)).toBe(1);
    expect(dirFromDxDy(-1, 0)).toBe(6);
    expect(dirFromDxDy(3, -1)).toBe(2);
  });

  it('uses the literal circle tables, with CCW as CW’s mirror', () => {
    expect(CIRCLE_CW).toEqual([2, 3, 4, 5, 6, 7, 0, 0]);
    expect(CIRCLE_CCW).toEqual([6, 0, 0, 1, 2, 3, 4, 5]);
    for (let dir = 0; dir < 8; dir++) {
      expect(CIRCLE_CCW[dir]).toBe((8 - CIRCLE_CW[(8 - dir) % 8]) % 8);
    }
    expect(nextDirFrom(7, { kind: 'circle', turn: 'cw' })).toBe(0);
    expect(nextDirFrom(0, { kind: 'fixed', dir: 5 })).toBe(6);
  });

  it('accepts only one ASCII letter for a plane id', () => {
    expect(idFromLetter('A')).toBe(0);
    expect(idFromLetter('z')).toBe(25);
    expect(idFromLetter('!')).toBeNull();
    expect(idFromLetter('AA')).toBeNull();
  });
});
