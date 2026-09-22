import { formatTime } from '../../engine/format';
import { html, setHtml, type Html } from '../html';
import {
  lastName,
  loadScores,
  previewScores,
  qualifiesUnderSomeName,
  saveScore,
  type ScoreCandidate,
  type ScoreEntry,
} from '../scores';

export interface ScoreScreenOptions {
  /** Already-composed result line, e.g. `Plane 'a' ran out of fuel.` */
  heading: string;
  candidate: ScoreCandidate;
  level: string;
  onAgain: () => void;
  onMenu: () => void;
}

/**
 * Game-over screen: the result, an optional save form and the high-score table with
 * the pending entry already projected into place.
 */
export function renderScoreScreen(
  root: HTMLElement,
  options: ScoreScreenOptions,
): void {
  const { heading, candidate, level, onAgain, onMenu } = options;
  const canSave = qualifiesUnderSomeName(candidate);
  const initialName = lastName();
  const initial = canSave
    ? previewScores(candidate, initialName)
    : { scores: loadScores(), index: -1 };

  setHtml(
    root,
    html`<main class="screen score-screen">
      <h1>${heading}</h1>
      <p class="summary">
        Planes safe: ${candidate.planes}<br />
        Time: ${candidate.ticks} updates<br />
        Real time: ${formatTime(candidate.realTimeSec)}
      </p>
      ${
        canSave
          ? saveSection(initialName)
          : html`<p class="note">
              This result does not make the high-score table.
            </p>`
      }
      <h2>High scores</h2>
      <div id="scores">${scoreTable(initial.scores, initial.index)}</div>
      <p class="actions">
        <button id="again">Play ${level} again</button>
        <button id="menu">Main menu</button>
      </p>
    </main>`,
  );

  if (canSave) wireSaveForm(root, candidate, initial.index);
  root.querySelector<HTMLButtonElement>('#again')!.onclick = onAgain;
  root.querySelector<HTMLButtonElement>('#menu')!.onclick = onMenu;
}

function saveSection(initialName: string): Html {
  return html`<section class="save">
    <h2>Save your score</h2>
    <p>
      Enter a name to add this result to the table below. Reusing a name
      replaces your previous score for this level, but only when the new one is
      better.
    </p>
    <p class="save-row">
      <label for="score-name">Name</label>
      <input
        id="score-name"
        maxlength="16"
        autocomplete="off"
        autocapitalize="off"
        autocorrect="off"
        spellcheck="false"
        value="${initialName}"
      />
      <button id="save">Save score</button>
    </p>
    <p id="save-message"></p>
  </section>`;
}

/** Re-projects the pending score as the name changes, since the rank depends on it. */
function wireSaveForm(
  root: HTMLElement,
  candidate: ScoreCandidate,
  initialIndex: number,
): void {
  const scores = root.querySelector<HTMLElement>('#scores')!;
  const input = root.querySelector<HTMLInputElement>('#score-name')!;
  const save = root.querySelector<HTMLButtonElement>('#save')!;
  const note = root.querySelector<HTMLElement>('#save-message')!;

  const preview = (): void => {
    const projected = previewScores(candidate, input.value);
    setHtml(scores, scoreTable(projected.scores, projected.index));
    save.disabled = projected.index < 0;
    note.textContent = rankNote(projected.index);
  };

  save.disabled = initialIndex < 0;
  note.textContent = rankNote(initialIndex);
  input.addEventListener('input', preview);
  input.addEventListener('change', preview);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') save.click();
  });
  save.onclick = () => {
    const { index } = previewScores(candidate, input.value);
    if (index < 0 || !saveScore(candidate, input.value)) {
      preview();
      return;
    }
    setHtml(scores, scoreTable(loadScores(), index));
    note.textContent = `Score saved at #${index + 1}.`;
    save.disabled = true;
    input.disabled = true;
  };
  input.focus();
  input.select();
  // Re-check once the browser has had a chance to restore or autofill the field.
  requestAnimationFrame(preview);
}

function rankNote(index: number): string {
  return index < 0
    ? 'Your previous score for this level was better, so there is nothing to save.'
    : `Saving will place you at #${index + 1}.`;
}

/** Renders the score table; `highlight` marks a pending or just-saved row. */
export function scoreTable(scores: ScoreEntry[], highlight = -1): Html {
  return html`<table>
    <thead>
      <tr>
        <th>#</th>
        <th>name</th>
        <th>level</th>
        <th>time</th>
        <th>real time</th>
        <th>planes safe</th>
      </tr>
    </thead>
    <tbody>
      ${scores.map(
        (score, index) =>
          html`<tr class="${index === highlight ? 'highlight' : ''}">
            <td>${index + 1}</td>
            <td>${score.name}</td>
            <td>${score.level}</td>
            <td>${score.ticks}</td>
            <td>${formatTime(score.realTimeSec)}</td>
            <td>${score.planes}</td>
          </tr>`,
      )}
    </tbody>
  </table>`;
}
