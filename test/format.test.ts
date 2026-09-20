import { describe, expect, it } from 'vitest';
import { formatPlaneLine } from '../src/engine/format';
import { parseGame } from '../src/engine/parser';
import { BUILTIN_GAMES } from '../src/data';
import type { Plane } from '../src/engine/types';

describe('formatPlaneLine', () => {
  it('uses the prefix separator for an altitude target without a heading', () => {
    const plane: Plane = {
      id: 0, kind: 'prop', status: 'marked', origType: 'exit', origNo: 0, destType: 'exit', destNo: 0,
      x: 1, y: 1, dir: 2, heading: { kind: 'fixed', dir: 2 }, pending: null,
      altitude: 7, newAltitude: 8, fuel: 20,
    };

    expect(formatPlaneLine(plane, parseGame(BUILTIN_GAMES[0].source, 'default'))).toBe('A7 E0: ↑8');
  });
});
