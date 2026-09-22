import { BUILTIN_LEVELS } from '../../data';
import { parseLevel } from '../../engine/parser';
import HELP from '../help.html?raw';
import { html, raw, setHtml, type Html } from '../html';
import { loadScores } from '../../storage/scores';
import { scoreTable } from './score';

/** Start screen: title, level picker with its stats line, help and the score table. */
export function renderMenuScreen(
  root: HTMLElement,
  onStart: (level: string) => void,
): void {
  setHtml(
    root,
    html`<main class="screen menu-screen">
      <header class="title">
        <h1>ATC</h1>
        <p>air traffic controller</p>
        <p class="source-link">
          <a
            href="https://github.com/benediktwerner/atc-game"
            target="_blank"
            rel="noreferrer"
            >Source code on GitHub</a
          >
        </p>
      </header>
      <p class="start-row">
        <label for="level">Level</label>
        <select id="level">
          ${BUILTIN_LEVELS.map(
            (level) =>
              html`<option value="${level.name}">${level.name}</option>`,
          )}
        </select>
        <button id="start">Start</button>
      </p>
      <p class="level-stats" id="level-stats"></p>
      ${raw(HELP)}
      <h2>High scores</h2>
      ${scoreTable(loadScores())}
    </main>`,
  );

  const select = root.querySelector<HTMLSelectElement>('#level')!;
  const stats = root.querySelector<HTMLElement>('#level-stats')!;
  const showStats = (): void => setHtml(stats, levelStats(select.value));
  select.onchange = showStats;
  showStats();
  root.querySelector<HTMLButtonElement>('#start')!.onclick = () =>
    onStart(select.value);
}

/** One-line summary of the selected level, with units spelled out. */
function levelStats(name: string): Html {
  const builtin = BUILTIN_LEVELS.find((level) => level.name === name);
  if (!builtin) return html``;
  let def;
  try {
    def = parseLevel(builtin.source, name);
  } catch {
    return html``;
  }
  return html`
    <span><b>${def.width} &times; ${def.height}</b> cells</span>
    <span>ticks every <b>${def.updateSecs}</b> seconds</span>
    <span>new plane on <b>1 in ${def.newplane}</b> ticks</span>
    <span>
      <b>${def.exits.length}</b> exits, <b>${def.beacons.length}</b> beacons,
      <b>${def.airports.length}</b> airports
    </span>
  `;
}
