import { describe, expect, it } from 'vitest';
import { directionTokenForCode } from '../src/ui/keyboard';

describe('physical direction keys', () => {
  it('maps the physical ring around S to direction tokens', () => {
    expect(directionTokenForCode('KeyW')).toBe('w');
    expect(directionTokenForCode('KeyZ')).toBe('z');
    expect(directionTokenForCode('KeyY')).toBeNull();
  });
});
