import { beforeEach, describe, expect, it } from 'vitest';
import { CommandEditor } from '../src/engine/commands';
import { Game } from '../src/engine/game';
import { parseLevel } from '../src/engine/parser';
import { renderInput } from '../src/ui/input';
import type { Plane } from '../src/engine/types';

const def = parseLevel(
  `update = 5; newplane = 1000; width = 20; height = 20;
   exit: ( 0 10 d ) ( 19 10 a );
   beacon: ( 12 10 );`,
  'input',
);

const plane = (): Plane => ({
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
});

describe('renderInput', () => {
  let editor: CommandEditor;
  let root: HTMLElement;

  beforeEach(() => {
    const game = new Game(def);
    game.air.push(plane());
    editor = new CommandEditor(game);
    root = { textContent: '' } as HTMLElement;
  });

  const feed = (keys: string): string[] => {
    for (const key of keys.split(' ')) editor.feed(key);
    renderInput(root, editor.editor);
    return String(root.textContent).split('\n');
  };

  it('echoes the command with a block cursor and two empty rows', () => {
    expect(feed('a t w')).toEqual(['a: turn to 0█', '', '']);
  });

  it('shows the `?` hint without consuming the command', () => {
    expect(feed('a t ?')).toEqual(['a: turn█', '', ' t<dir>']);
  });

  it('underlines the offending token of a rejected command', () => {
    // The caret skips the leading space the fragment's text carries.
    expect(feed('a t d @ b 0 ENTER')).toEqual([
      'a: turn to 90 at beacon #0█',
      '        ^^^^^',
      'Already going in that direction',
    ]);
  });

  it('underlines the first token when the plane is unknown', () => {
    expect(feed('z m ENTER')).toEqual(['z: mark█', '^^', 'Unknown Plane']);
  });

  it('drops the rejected echo as soon as typing resumes', () => {
    feed('z m ENTER');
    expect(feed('a')).toEqual(['a:█', '', '']);
  });

  it('is empty after an accepted command', () => {
    expect(feed('a t w ENTER')).toEqual(['█', '', '']);
  });
});
