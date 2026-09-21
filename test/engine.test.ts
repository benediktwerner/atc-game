import { describe, expect, it } from 'vitest';
import { BUILTIN_LEVELS } from '../src/data';
import { dirFromDxDy } from '../src/engine/dir';
import {
  CIRCLE_CCW,
  CIRCLE_CW,
  Game,
  nextDirFrom,
  projectPath,
  stepToward,
} from '../src/engine/game';
import { parseLevel } from '../src/engine/parser';
import type { Plane } from '../src/engine/types';

const plane = (overrides: Partial<Plane> = {}): Plane => ({
  id: 0,
  kind: 'jet',
  status: 'marked',
  origType: 'exit',
  origNo: 0,
  destType: 'exit',
  destNo: 1,
  x: 5,
  y: 4,
  dir: 2,
  heading: { kind: 'fixed', dir: 2 },
  pending: null,
  altitude: 9,
  targetAltitude: 9,
  fuel: 100,
  ...overrides,
});

describe('level definitions', () => {
  it('parses every built-in level', () => {
    expect(BUILTIN_LEVELS).toHaveLength(15);
    for (const level of BUILTIN_LEVELS)
      expect(parseLevel(level.source, level.name).name).toBe(level.name);
  });
});

describe('directions', () => {
  it('uses the original truncating displacement conversion', () => {
    expect(dirFromDxDy(1, 0)).toBe(2);
    expect(dirFromDxDy(0, -1)).toBe(0);
    expect(dirFromDxDy(3, -1)).toBe(2);
  });
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
    const path = projectPath(
      plane({ x: 10, y: 10, altitude: 7, targetAltitude: 7, fuel: 10 }),
      def,
    );
    expect(path[0]).toMatchObject({ x: 11, y: 10, dir: 2 });
    expect(path.length).toBeGreaterThan(0);
  });
});

describe('update', () => {
  const def = parseLevel(
    `update = 5; newplane = 1000; width = 10; height = 8;
     exit: ( 0 3 d ) ( 9 4 a );
     airport: ( 6 5 w );`,
    'update',
  );

  it('counts a safe arrival even when the same tick ends the game', () => {
    const game = new Game(def);
    // One step from exit 1 at the required altitude, so it arrives safely...
    game.air.push(plane({ id: 0, x: 8, y: 4, destNo: 1 }));
    // ...while a later plane in the list runs dry on the very same tick.
    game.air.push(plane({ id: 1, x: 2, y: 2, fuel: 0 }));

    const lost = game.update();

    expect(lost?.message).toBe('ran out of fuel.');
    expect(game.safePlanes).toBe(1);
    expect(game.air.map((entry) => entry.id)).toEqual([1]);
  });

  it('does not count a plane that arrives at the wrong altitude', () => {
    const game = new Game(def);
    game.air.push(plane({ x: 8, y: 4, destNo: 1, altitude: 5 }));

    expect(game.update()?.message).toBe('exited at the wrong altitude.');
    expect(game.safePlanes).toBe(0);
  });
});
