import { describe, expect, it } from 'vitest';
import { randInt } from '../src/engine/rng';

describe('randInt', () => {
  it('returns the floor of a scaled random value', () => {
    expect(randInt(() => 0, 7)).toBe(0);
    expect(randInt(() => 0.5, 7)).toBe(3);
    expect(randInt(() => 0.999999, 7)).toBe(6);
  });
});
