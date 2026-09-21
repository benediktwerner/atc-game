import { describe, expect, it } from 'vitest';
import {
  DIR_KEYS,
  dirFromDxDy,
  dirFromKey,
  idFromLetter,
} from '../src/engine/dir';

describe('directions', () => {
  it('maps the keyboard ring and displacement examples', () => {
    expect(DIR_KEYS.split('').map(dirFromKey)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7,
    ]);
    expect(dirFromKey('s')).toBeNull();
    expect(dirFromDxDy(1, 0)).toBe(2);
    expect(dirFromDxDy(0, -1)).toBe(0);
    expect(dirFromDxDy(1, -1)).toBe(1);
    expect(dirFromDxDy(-1, 0)).toBe(6);
    expect(dirFromDxDy(3, -1)).toBe(2);
  });

  it('accepts only one ASCII letter for a plane id', () => {
    expect(idFromLetter('A')).toBe(0);
    expect(idFromLetter('z')).toBe(25);
    expect(idFromLetter('!')).toBeNull();
    expect(idFromLetter('AA')).toBeNull();
  });
});
