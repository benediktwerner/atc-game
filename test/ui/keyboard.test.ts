import { describe, expect, it } from 'vitest';
import {
  directionTokenForCode,
  pauseIntent,
  playIntent,
} from '../../src/ui/keyboard';

const event = (init: Partial<KeyboardEvent>): KeyboardEvent =>
  ({
    key: '',
    code: '',
    ctrlKey: false,
    metaKey: false,
    ...init,
  }) as KeyboardEvent;

describe('physical direction keys', () => {
  it('maps the physical ring around S to direction tokens', () => {
    expect(directionTokenForCode('KeyW')).toBe('w');
    expect(directionTokenForCode('KeyZ')).toBe('z');
    expect(directionTokenForCode('KeyY')).toBeNull();
  });
});

describe('playIntent', () => {
  it('maps editing keys to editor tokens', () => {
    expect(playIntent(event({ key: 'Enter' }), 'Start')).toEqual({
      kind: 'token',
      token: 'ENTER',
    });
    expect(playIntent(event({ key: 'Backspace' }), 'Cmd')).toEqual({
      kind: 'token',
      token: 'BACKSPACE',
    });
    expect(playIntent(event({ key: 'u', ctrlKey: true }), 'Cmd')).toEqual({
      kind: 'token',
      token: 'CTRL_U',
    });
    expect(playIntent(event({ key: 'a', code: 'KeyA' }), 'Cmd')).toEqual({
      kind: 'token',
      token: 'a',
    });
  });

  it('maps space to a forced update and Escape to the pause menu', () => {
    expect(playIntent(event({ key: ' ' }), 'Start')).toEqual({ kind: 'tick' });
    expect(playIntent(event({ key: 'Escape' }), 'Start')).toEqual({
      kind: 'pause',
    });
  });

  it('prefers the physical key only while a turn direction is expected', () => {
    const dvorak = event({ key: ',', code: 'KeyW' });
    expect(playIntent(dvorak, 'Turn')).toEqual({ kind: 'token', token: 'w' });
    expect(playIntent(dvorak, 'Cmd')).toEqual({ kind: 'token', token: ',' });
  });

  it('leaves shortcuts and navigation keys to the browser', () => {
    expect(playIntent(event({ key: 'r', metaKey: true }), 'Start')).toBeNull();
    expect(playIntent(event({ key: 'ArrowLeft' }), 'Start')).toBeNull();
    expect(playIntent(event({ key: 'ü' }), 'Start')).toBeNull();
  });
});

describe('pauseIntent', () => {
  it('accepts the pause menu shortcuts in either case', () => {
    expect(pauseIntent(event({ key: 'Escape' }))).toBe('continue');
    expect(pauseIntent(event({ key: 'C' }))).toBe('continue');
    expect(pauseIntent(event({ key: 'r' }))).toBe('restart');
    expect(pauseIntent(event({ key: 'Q' }))).toBe('quit');
    expect(pauseIntent(event({ key: 'x' }))).toBeNull();
  });
});
