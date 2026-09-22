import { describe, expect, it } from 'vitest';
import { BUILTIN_LEVELS } from '../../src/data';
import {
  CIRCLE_CCW,
  CIRCLE_CW,
  nextDirFrom,
  projectPath,
  stepToward,
} from '../../src/engine/motion';
import { parseLevel } from '../../src/engine/parser';
import type { Plane } from '../../src/engine/types';
import { makePlane } from './plane';

describe('turning', () => {
  it('limits fixed turns and preserves the circle mirror', () => {
    expect(stepToward(0, 4)).toBe(2);
    expect(nextDirFrom(0, { kind: 'fixed', dir: 5 })).toBe(6);
    expect(CIRCLE_CW).toEqual([2, 3, 4, 5, 6, 7, 0, 0]);
    expect(CIRCLE_CCW).toEqual([6, 0, 0, 1, 2, 3, 4, 5]);
    expect(nextDirFrom(7, { kind: 'circle', turn: 'cw' })).toBe(0);
    for (let dir = 0; dir < 8; dir += 1)
      expect(CIRCLE_CCW[dir]).toBe((8 - CIRCLE_CW[(8 - dir) % 8]) % 8);
  });
});

describe('path projection', () => {
  it('turns before moving and stops at the interior edge', () => {
    const def = parseLevel(BUILTIN_LEVELS[0].source, 'default');
    const flying: Plane = makePlane({
      x: 10,
      y: 10,
      altitude: 7,
      targetAltitude: 7,
      fuel: 10,
    });
    const path = projectPath(flying, def);
    expect(path[0]).toMatchObject({ x: 11, y: 10, dir: 2 });
    expect(path.length).toBeGreaterThan(0);
  });
});
