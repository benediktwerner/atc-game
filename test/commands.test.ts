import { beforeEach, describe, expect, it } from 'vitest';
import { BUILTIN_LEVELS } from '../src/data';
import { CommandEditor } from '../src/engine/commands';
import { Game } from '../src/engine/game';
import { parseLevel } from '../src/engine/parser';

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
