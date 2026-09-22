import { describe, expect, it } from 'vitest';
import { BUILTIN_LEVELS } from '../src/data';
import { parseLevel } from '../src/engine/parser';

const VALID_LEVEL = `
update = 5;
newplane = 10;
width = 10;
height = 8;
exit: ( 0 3 d ) ( 9 4 a );
beacon: ( 4 4 );
airport: ( 6 5 w );
line: [ ( 0 0 ) ( 7 7 ) ];
`;

describe('parseLevel', () => {
  it('parses every bundled level', () => {
    for (const level of BUILTIN_LEVELS) {
      expect(parseLevel(level.source, level.name).name).toBe(level.name);
    }
  });

  it('preserves parsed entries and directions', () => {
    const level = parseLevel(VALID_LEVEL, 'sample');
    expect(level).toMatchObject({
      name: 'sample',
      updateSecs: 5,
      newplane: 10,
      width: 10,
      height: 8,
      exits: [
        { x: 0, y: 3, dir: 2 },
        { x: 9, y: 4, dir: 6 },
      ],
      beacons: [{ x: 4, y: 4 }],
      airports: [{ x: 6, y: 5, dir: 0 }],
    });
  });

  it('collects validation failures with original-format locations', () => {
    const invalid = `
update = 0;
newplane = 1;
width = 3;
height = 3;
exit: ( 1 1 w );
line: [ ( 0 0 ) ( 2 1 ) ];
`;
    expect(() => parseLevel(invalid, 'bad')).toThrow(
      '"bad": line 2: \'update\' is too small.\n' +
        '"bad": line 6: edge value not on edge.\n' +
        '"bad": line 7: Bad line endpoints.\n' +
        '"bad": line 8: Need at least 2 airports and/or exits.',
    );
  });

  it('rejects an exit whose direction points out of the arena', () => {
    const invalidExit = VALID_LEVEL.replace('( 0 3 d )', '( 0 3 w )');
    expect(() => parseLevel(invalidExit, 'bad-exit')).toThrow(
      '"bad-exit": line 6: Bad direction for entrance at exit.',
    );
  });

  it('does not read a keyword out of a longer word', () => {
    const typo = VALID_LEVEL.replace('width =', 'widthx =');
    expect(() => parseLevel(typo, 'typo')).toThrow(
      '"typo": line 4: expected a game section, found `w`',
    );
  });

  it('rejects a diagonal airport runway', () => {
    const diagonal = VALID_LEVEL.replace('( 6 5 w )', '( 6 5 e )');
    expect(() => parseLevel(diagonal, 'bad-airport')).toThrow(
      '"bad-airport": line 8: Bad direction for airport.',
    );
  });

  it('enforces the addressable-entry limit', () => {
    const beacons = Array.from({ length: 11 }, () => '( 2 2 )').join(' ');
    const source = `${VALID_LEVEL}\nbeacon: ${beacons};`;
    expect(() => parseLevel(source, 'many')).toThrow(
      '"many": line 11: Too many beacons (max 10).',
    );
  });
});
