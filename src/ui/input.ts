import type { Editor, Frag } from '../engine/commands';

/** Three rows: the echoed command, the error caret, then the message or `?` hint. */
export function renderInput(root: HTMLElement, editor: Editor): void {
  const { rejected } = editor;
  const frags = rejected?.frags ?? editor.frags;
  const text = frags.map((fragment) => fragment.text).join('');
  const caret = rejected ? caretRow(rejected.frags, rejected.index) : '';
  root.textContent = `${text}█\n${caret}\n${editor.message}`;
}

/**
 * Underlines one fragment of the echoed command with `^`. Fragment texts carry their
 * own leading space, which the caret skips so it starts under the visible token.
 */
function caretRow(frags: Frag[], index: number): string {
  const col = frags
    .slice(0, index)
    .reduce((total, fragment) => total + fragment.text.length, 0);
  const text = frags[index].text;
  const token = text.trimStart();
  return `${' '.repeat(col + text.length - token.length)}${'^'.repeat(token.length)}`;
}
