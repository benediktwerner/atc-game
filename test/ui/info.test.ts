import { describe, expect, it } from 'vitest';
import { Game } from '../../src/engine/game';
import { parseLevel } from '../../src/engine/parser';
import { formatPlaneLine, renderInfo } from '../../src/ui/info';
import type { Plane } from '../../src/engine/types';

const def = parseLevel(
  `update = 5; newplane = 1000; width = 20; height = 20;
   exit: ( 0 10 d ) ( 19 10 a );
   airport: ( 6 5 w );`,
  'info',
);

const plane = (overrides: Partial<Plane>): Plane => ({
  id: 0,
  kind: 'jet',
  status: 'marked',
  origType: 'exit',
  origNo: 0,
  destType: 'exit',
  destNo: 1,
  x: 10,
  y: 10,
  dir: 2,
  heading: { kind: 'fixed', dir: 2 },
  pending: null,
  altitude: 5,
  targetAltitude: 5,
  fuel: 100,
  ...overrides,
});

const render = (game: Game): { head: string; lines: string[] } => {
  const head = { textContent: '' } as HTMLElement;
  const list = { textContent: '' } as HTMLElement;
  renderInfo(head, list, game);
  return {
    head: String(head.textContent),
    lines: String(list.textContent).split('\n'),
  };
};

describe('renderInfo', () => {
  it('pads the clock so the Safe column keeps its place', () => {
    const game = new Game(def);
    expect(render(game).head).toBe('Time: 0    Safe: 0');
    game.clock = 1234;
    game.safePlanes = 7;
    expect(render(game).head).toBe('Time: 1234 Safe: 7');
  });

  it('lists airborne planes before planes waiting on the ground', () => {
    const game = new Game(def);
    game.ground.push(
      plane({ id: 1, kind: 'prop', altitude: 0, targetAltitude: 0 }),
    );
    game.air.push(plane({ id: 3, dir: 0 }), plane({ id: 2 }));
    expect(render(game).lines).toEqual([
      'd5 E1: 90',
      'c5 E1: ',
      'B0 E1: Holding @ A0',
    ]);
  });

  it('renders an empty panel when no planes exist', () => {
    expect(render(new Game(def)).lines).toEqual(['']);
  });
});

describe('formatPlaneLine', () => {
  it('uses the prefix separator for an altitude target without a heading', () => {
    const plane: Plane = {
      id: 0,
      kind: 'prop',
      status: 'marked',
      origType: 'exit',
      origNo: 0,
      destType: 'exit',
      destNo: 0,
      x: 1,
      y: 1,
      dir: 2,
      heading: { kind: 'fixed', dir: 2 },
      pending: null,
      altitude: 7,
      targetAltitude: 8,
      fuel: 20,
    };

    expect(formatPlaneLine(plane)).toBe('A7 E0: ↑8');
  });
});
