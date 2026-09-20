import { describe, expect, it } from 'vitest';
import { BUILTIN_GAMES } from '../src/data';
import { dirFromDxDy } from '../src/engine/dir';
import { CIRCLE_CCW, CIRCLE_CW, nextDirFrom, projectPath, stepToward } from '../src/engine/game';
import { parseGame } from '../src/engine/parser';
import type { Plane } from '../src/engine/types';

describe('game definitions', () => {
  it('parses every built-in scenario', () => {
    expect(BUILTIN_GAMES).toHaveLength(15);
    for (const game of BUILTIN_GAMES) expect(parseGame(game.source, game.name).name).toBe(game.name);
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
    expect(nextDirFrom(7, { kind: 'circle', turn: 'cw' })).toBe(0);
    for (let dir = 0; dir < 8; dir += 1) expect(CIRCLE_CCW[dir]).toBe((8 - CIRCLE_CW[(8 - dir) % 8]) % 8);
  });
});

describe('path projection', () => {
  it('turns before moving and stops at the interior edge', () => {
    const def = parseGame(BUILTIN_GAMES[0].source, 'default');
    const plane: Plane = {
      id: 0, kind: 'jet', status: 'marked', origType: 'exit', origNo: 0, destType: 'exit', destNo: 1,
      x: 10, y: 10, dir: 2, heading: { kind: 'fixed', dir: 2 }, pending: null,
      altitude: 7, newAltitude: 7, fuel: 10,
    };
    const path = projectPath(plane, def);
    expect(path[0]).toMatchObject({ x: 11, y: 10, dir: 2 });
    expect(path.length).toBeGreaterThan(0);
  });
});
