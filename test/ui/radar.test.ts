import { describe, expect, it } from 'vitest';
import { BUILTIN_LEVELS } from '../../src/data';
import { parseLevel } from '../../src/engine/parser';
import { staticRadar } from '../../src/ui/radar';

const render = (source: string): string[] =>
  staticRadar(parseLevel(source, 'test')).map((row) => row.join(''));

describe('staticRadar', () => {
  it('draws the border, interior dots and the 2:1 column mapping', () => {
    const rows = render(
      `update = 5; newplane = 1000; width = 5; height = 4;
       exit: ( 0 2 d ) ( 4 1 a );`,
    );
    expect(rows).toEqual([
      '--------- ',
      '| . . . 1 ',
      '0 . . . | ',
      '--------- ',
    ]);
    // Cell (x, y) sits at column 2*x, and every row is two columns per cell wide.
    // Exits replace the border glyph of the row or column they sit on.
    expect(rows.every((row) => row.length === 10)).toBe(true);
  });

  it('places beacons, airports and lines with their index in the second column', () => {
    const rows = render(
      `update = 5; newplane = 1000; width = 7; height = 5;
       exit: ( 0 2 d ) ( 6 2 a );
       beacon: ( 3 1 );
       airport: ( 2 3 w ) ( 4 3 d );
       line: [ ( 1 1 ) ( 1 3 ) ];`,
    );
    expect(rows).toEqual([
      '------------- ',
      '| + . *0. . | ',
      '0 + . . . . 1 ',
      '| + ^0. >1. | ',
      '------------- ',
    ]);
  });

  it('uses one arrow glyph per runway direction', () => {
    const glyphs = (['w', 'd', 'x', 'a'] as const).map(
      (dir) =>
        render(
          `update = 5; newplane = 1000; width = 5; height = 5;
           exit: ( 0 2 d ) ( 4 2 a );
           airport: ( 2 2 ${dir} );`,
        )[2][4],
    );
    expect(glyphs).toEqual(['^', '>', 'v', '<']);
  });

  it('keeps every plotted glyph inside the grid for all built-in levels', () => {
    for (const level of BUILTIN_LEVELS) {
      const def = parseLevel(level.source, level.name);
      const rows = staticRadar(def);
      expect(rows).toHaveLength(def.height);
      expect(rows.every((row) => row.length === def.width * 2)).toBe(true);
    }
  });
});
