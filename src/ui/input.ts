import type { Editor } from '../engine/commands';

export function renderInput(root: HTMLElement, editor: Editor): void {
  const text = editor.frags.length
    ? editor.frags.map((fragment) => fragment.text).join('')
    : editor.errorText;
  const caret = editor.caretUnder
    ? `${' '.repeat(editor.caretUnder.col)}${'^'.repeat(editor.caretUnder.len)}`
    : '';
  root.textContent = `${text}█\n${caret}\n${editor.message}`;
}
