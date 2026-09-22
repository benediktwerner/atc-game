import { describe, expect, it } from 'vitest';
import { Game } from '../../src/engine/game';
import { parseLevel } from '../../src/engine/parser';
import { makePlane } from './plane';

const def = parseLevel(
  `update = 5; newplane = 1000; width = 10; height = 8;
     exit: ( 0 3 d ) ( 9 4 a );
     airport: ( 6 5 w );`,
  'game',
);

describe('spawning', () => {
  // The origin is drawn from every start except the destination. A reject-and-redraw
  // loop never terminates when the injected rng keeps returning the same index.
  it.each([0, 0.5, 0.999999])(
    'picks an origin other than the destination with a constant rng (%s)',
    (value) => {
      const game = new Game(def, () => value);
      game.addPlane();
      const spawned = [...game.air, ...game.ground];
      expect(spawned).toHaveLength(1);
      const { origType, origNo, destType, destNo } = spawned[0];
      expect(`${origType}${origNo}`).not.toBe(`${destType}${destNo}`);
    },
  );
});

describe('update', () => {
  it('counts a safe arrival even when the same tick ends the game', () => {
    const game = new Game(def);
    // One step from exit 1 at the required altitude, so it arrives safely...
    game.air.push(makePlane({ id: 0, x: 8, y: 4, destNo: 1 }));
    // ...while a later plane in the list runs dry on the very same tick.
    game.air.push(makePlane({ id: 1, x: 2, y: 2, fuel: 0 }));

    const lost = game.update();

    expect(lost?.message).toBe('ran out of fuel.');
    expect(game.safePlanes).toBe(1);
    expect(game.air.map((entry) => entry.id)).toEqual([1]);
  });

  it('does not count a plane that arrives at the wrong altitude', () => {
    const game = new Game(def);
    game.air.push(makePlane({ x: 8, y: 4, destNo: 1, altitude: 5 }));

    expect(game.update()?.message).toBe('exited at the wrong altitude.');
    expect(game.safePlanes).toBe(0);
  });
});
