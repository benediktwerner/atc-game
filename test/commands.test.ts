import { beforeEach, describe, expect, it } from 'vitest';
import { BUILTIN_LEVELS } from '../src/data';
import { CommandEditor } from '../src/engine/commands';
import { Game } from '../src/engine/game';
import { parseLevel } from '../src/engine/parser';
import type { Plane } from '../src/engine/types';

const def = parseLevel(BUILTIN_LEVELS[0].source, 'default');

describe('command editor errors', () => {
  let game: Game;
  let editor: CommandEditor;

  beforeEach(() => {
    game = new Game(def);
    editor = new CommandEditor(game);
  });

  const feed = (keys: string): void => {
    for (const key of keys.split(' ')) editor.feed(key);
  };

  it('keeps the rejected command on screen for the caret to point at', () => {
    feed('z t w ENTER');
    expect(editor.editor.message).toBe('Unknown Plane');
    expect(editor.editor.errorText).toBe('z: turn to 0');
    expect(editor.editor.caretUnder).toEqual({ col: 0, len: 2 });
    expect(editor.editor.frags).toHaveLength(0);
  });

  it('points the caret at the offending fragment', () => {
    game.air.push({
      id: 0,
      kind: 'jet',
      status: 'marked',
      origType: 'exit',
      origNo: 0,
      destType: 'exit',
      destNo: 1,
      x: 10,
      y: 10,
      dir: 0,
      heading: { kind: 'fixed', dir: 0 },
      pending: null,
      altitude: 5,
      targetAltitude: 5,
      fuel: 100,
    });
    feed('a t t e 9 ENTER');
    expect(editor.editor.message).toBe('Unknown exit');
    expect(editor.editor.errorText).toBe('a: turn towards exit #9');
    const caret = editor.editor.caretUnder!;
    expect(
      editor.editor.errorText.slice(caret.col, caret.col + caret.len),
    ).toBe('9');
  });

  it('clears the echoed command once typing resumes', () => {
    feed('z m ENTER');
    expect(editor.editor.errorText).toBe('z: mark');
    feed('a');
    expect(editor.editor.errorText).toBe('');
    expect(editor.editor.caretUnder).toBeNull();
  });
});

describe('redundant heading commands', () => {
  const level = parseLevel(
    `update = 5; newplane = 1000; width = 20; height = 20;
     exit: ( 0 10 d ) ( 19 10 a );
     beacon: ( 12 10 ) ( 15 10 );
     airport: ( 6 5 w );`,
    'beacons',
  );

  const setup = (
    overrides: Partial<Plane> = {},
  ): { game: Game; plane: Plane; feed: (keys: string) => string } => {
    const game = new Game(level);
    const plane: Plane = {
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
    };
    game.air.push(plane);
    const editor = new CommandEditor(game);
    return {
      game,
      plane,
      feed: (keys) => {
        for (const key of keys.split(' ')) editor.feed(key);
        return editor.editor.message;
      },
    };
  };

  it('rejects an immediate turn the plane is already committed to', () => {
    expect(setup().feed('a t d ENTER')).toBe('Already going in that direction');
  });

  it('rejects an immediate turn-towards that resolves to the current heading', () => {
    expect(setup().feed('a t t b 0 ENTER')).toBe(
      'Already going in that direction',
    );
  });

  it('allows a redundant-looking turn that cancels a pending command', () => {
    const { plane, feed } = setup({
      pending: { heading: { kind: 'fixed', dir: 0 }, beacon: 0 },
    });
    expect(feed('a t d ENTER')).toBe('');
    expect(plane.pending).toBeNull();
    expect(plane.heading).toEqual({ kind: 'fixed', dir: 2 });
  });

  it('rejects an immediate turn-towards the plane is already standing on', () => {
    expect(setup({ x: 12, y: 10 }).feed('a t t b 0 ENTER')).toBe(
      'Would already be there',
    );
  });

  it('rejects a delayed absolute turn matching the heading on arrival', () => {
    expect(setup().feed('a t d @ b 0 ENTER')).toBe(
      'Already going in that direction',
    );
  });

  it('measures a delayed turn-towards from the beacon, not the plane', () => {
    // The plane is standing on beacon 0, but the turn happens at beacon 1, from
    // where beacon 0 lies due west — so this is a legitimate command.
    const { plane, feed } = setup({ x: 12, y: 10 });
    expect(feed('a t t b 0 @ b 1 ENTER')).toBe('');
    expect(plane.pending).toEqual({
      heading: { kind: 'fixed', dir: 6 },
      beacon: 1,
    });
  });

  it('still rejects a delayed turn-towards the delay beacon itself', () => {
    expect(setup().feed('a t t b 1 @ b 1 ENTER')).toBe(
      'Would already be there',
    );
  });
});
