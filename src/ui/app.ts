import { CommandEditor } from '../engine/commands';
import { parseLevel } from '../engine/parser';
import { Game } from '../engine/game';
import { timestr } from '../engine/format';
import { BUILTIN_LEVELS } from '../data';
import { renderInfo } from './info';
import { renderInput } from './input';
import { Radar } from './radar';
import { directionTokenForCode } from './keyboard';
import {
  lastName,
  loadScores,
  previewScores,
  qualifies,
  saveScore,
  type ScoreCandidate,
  type ScoreEntry,
} from './scores';

interface FinishedGame {
  candidate: ScoreCandidate;
  plane: string | null;
  message: string;
}

export class App {
  private game: Game | null = null;
  private editor: CommandEditor | null = null;
  private radar: Radar | null = null;
  private timer: number | null = null;
  private startedAt = 0;
  private pausedMs = 0;
  private pauseStartedAt = 0;
  private levelName = '';
  private board: HTMLElement | null = null;
  private gameShell: HTMLElement | null = null;
  private finishedGame: FinishedGame | null = null;

  constructor(private readonly root: HTMLElement) {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.game && !this.finishedGame) this.pause();
    });
    window.addEventListener('keydown', (event) => this.keydown(event));
    window.addEventListener('resize', () => this.fitGameToViewport());
    this.startScreen();
  }

  private startScreen(): void {
    this.clearTimer();
    this.game = null;
    this.finishedGame = null;
    const options = BUILTIN_LEVELS.map(
      (level) => `<option value="${level.name}">${level.name}</option>`,
    ).join('');
    this.root.innerHTML = `<main class="screen"><h1>ATC</h1><p>air traffic controller</p><label>Level <select id="level">${options}</select></label> <button id="start">Start</button><section class="help"><h2>How to play</h2><p>Planes enter from numbered exits and airports. Guide each plane to its labelled destination: land at an airport at altitude 0 in the runway direction, or leave through an exit at altitude 9.</p><p>Type a plane letter first, then a command. The eight physical keys around <code>s</code> turn a plane, regardless of keyboard layout; for example, <code>Atd</code> turns plane A east. Use <code>Aa9</code> to set altitude 9, or <code>Aac2</code> / <code>Aad2</code> to climb or descend two levels.</p><p>Use <code>Attb0</code> to turn towards beacon 0, and append <code>@b0</code> to a heading command to apply it when the plane reaches beacon 0. Mark, unmark, or ignore planes with <code>m</code>, <code>u</code>, and <code>i</code>. Empty Enter advances the simulation; Space advances one step without changing a command you are typing; Escape pauses.</p></section><h2>High scores</h2>${scoreTable(loadScores())}</main>`;
    this.root.querySelector<HTMLButtonElement>('#start')!.onclick = () =>
      this.start(this.root.querySelector<HTMLSelectElement>('#level')!.value);
  }

  private start(name: string): void {
    const builtin = BUILTIN_LEVELS.find((item) => item.name === name);
    if (!builtin) return;
    try {
      this.game = new Game(parseLevel(builtin.source, name));
    } catch (error) {
      this.root.textContent = `Unable to load ${name}: ${error instanceof Error ? error.message : String(error)}`;
      return;
    }
    this.levelName = name;
    this.editor = new CommandEditor(this.game);
    this.finishedGame = null;
    this.startedAt = Date.now();
    this.pausedMs = 0;
    this.pauseStartedAt = 0;
    this.root.innerHTML = `<main class="game"><div id="game-shell"><header><b>Level: ${name}</b><span><button id="pause">Pause (Esc)</button></span></header><section id="board"><div id="radar"></div><pre id="info"></pre><pre id="input"></pre><aside>ATC - by Ed James</aside></section></div><div id="overlay" hidden></div></main>`;
    this.board = this.root.querySelector('#board');
    this.gameShell = this.root.querySelector('#game-shell');
    this.radar = new Radar(this.root.querySelector('#radar')!, this.game.def);
    this.root.querySelector<HTMLButtonElement>('#pause')!.onclick = () =>
      this.pause();
    this.game.addPlane();
    this.tick();
    this.render();
    requestAnimationFrame(() => this.fitGameToViewport());
  }

  private keydown(event: KeyboardEvent): void {
    if (!this.game) return;
    if (this.finishedGame) {
      if (event.key === ' ') {
        event.preventDefault();
        this.showScoreScreen(this.finishedGame);
      }
      return;
    }
    if (this.pauseStartedAt) {
      if (['Escape', 'c', 'C'].includes(event.key)) {
        event.preventDefault();
        this.resume();
      } else if (['r', 'R'].includes(event.key)) {
        event.preventDefault();
        this.start(this.levelName);
      } else if (['q', 'Q'].includes(event.key)) {
        event.preventDefault();
        this.end(null, 'You quit.');
      }
      return;
    }
    let token: string | null = null;
    if (event.key === 'Enter') token = 'ENTER';
    else if (event.key === ' ') {
      event.preventDefault();
      this.clearTimer();
      this.tick();
      return;
    } else if (event.key === 'Backspace') token = 'BACKSPACE';
    else if (event.ctrlKey && event.key.toLowerCase() === 'u') token = 'CTRL_U';
    else if (event.key === 'Escape') {
      event.preventDefault();
      this.pause();
      return;
    } else if (this.editor!.editor.state === 'Turn')
      token = directionTokenForCode(event.code) ?? event.key;
    else if (
      !event.ctrlKey &&
      !event.metaKey &&
      event.key.length === 1 &&
      event.key.charCodeAt(0) < 128
    )
      token = event.key;
    if (!token) return;
    event.preventDefault();
    const result = this.editor!.feed(token);
    if (result === 'forced-update') {
      this.clearTimer();
      this.tick();
    }
    this.render();
  }

  private tick(): void {
    if (!this.game) return;
    const lost = this.game.update();
    this.render();
    if (lost) {
      this.awaitScoreScreen(lost.planeLetter, lost.message);
      return;
    }
    this.timer = window.setTimeout(
      () => this.tick(),
      this.game.def.updateSecs * 1000,
    );
  }
  private render(): void {
    if (!this.game || !this.radar || !this.editor) return;
    this.radar.render(this.game);
    renderInfo(this.root.querySelector('#info')!, this.game);
    renderInput(this.root.querySelector('#input')!, this.editor.editor);
  }
  private pause(): void {
    if (!this.game || this.pauseStartedAt) return;
    this.clearTimer();
    this.pauseStartedAt = Date.now();
    this.board!.style.visibility = 'hidden';
    const overlay = this.root.querySelector<HTMLElement>('#overlay')!;
    overlay.hidden = false;
    overlay.innerHTML = `<section class="modal"><h1>PAUSED</h1><button id="continue">Continue (C / Esc)</button><button id="restart">Restart (R)</button><button id="quit-now">Quit (Q)</button></section>`;
    overlay
      .querySelector('#continue')!
      .addEventListener('click', () => this.resume());
    overlay
      .querySelector('#restart')!
      .addEventListener('click', () => this.start(this.levelName));
    overlay
      .querySelector('#quit-now')!
      .addEventListener('click', () => this.end(null, 'You quit.'));
  }
  private resume(): void {
    if (!this.game || !this.pauseStartedAt) return;
    this.pausedMs += Date.now() - this.pauseStartedAt;
    this.pauseStartedAt = 0;
    this.board!.style.visibility = '';
    const overlay = this.root.querySelector<HTMLElement>('#overlay')!;
    overlay.hidden = true;
    this.timer = window.setTimeout(
      () => this.tick(),
      this.game.def.updateSecs * 1000,
    );
  }
  private end(plane: string | null, message: string): void {
    if (!this.game) return;
    this.clearTimer();
    const realTimeSec = Math.floor(
      (Date.now() - this.startedAt - this.pausedMs) / 1000,
    );
    const candidate: ScoreCandidate = {
      level: this.levelName,
      planes: this.game.safePlanes,
      ticks: this.game.clock,
      realTimeSec,
    };
    this.showScoreScreen({ candidate, plane, message });
  }
  private awaitScoreScreen(plane: string | null, message: string): void {
    if (!this.game) return;
    this.clearTimer();
    const realTimeSec = Math.floor(
      (Date.now() - this.startedAt - this.pausedMs) / 1000,
    );
    this.finishedGame = {
      candidate: {
        level: this.levelName,
        planes: this.game.safePlanes,
        ticks: this.game.clock,
        realTimeSec,
      },
      plane,
      message,
    };
    this.root.querySelector('#input')!.textContent =
      `${plane ? `Plane '${plane}' ${message}` : message}\n\nPress Space for high scores.`;
  }
  private showScoreScreen(finished: FinishedGame): void {
    const { candidate, plane, message } = finished;
    this.finishedGame = null;
    const canSave = qualifies(candidate, '__new_name__');
    this.game = null;
    const level = this.levelName;
    const initialName = lastName();
    const initial = canSave
      ? previewScores(candidate, initialName)
      : { scores: loadScores(), index: -1 };
    const saveSection = canSave
      ? `<section class="save"><h2>Save your score</h2><p>Enter a name to add this result to the table below. Reusing a name replaces your previous score for this level, but only when the new one is better.</p><p class="save-row"><label for="score-name">Name</label> <input id="score-name" maxlength="16" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" value="${escapeHtml(initialName)}"> <button id="save"${initial.index < 0 ? ' disabled' : ''}>Save score</button></p><p id="save-message">${rankNote(initial.index)}</p></section>`
      : `<p class="note">This result does not make the high-score table.</p>`;
    this.root.innerHTML = `<main class="screen score-screen"><h1>${plane ? `Plane '${plane}' ${message}` : message}</h1><p class="summary">Planes safe: ${candidate.planes}<br>Time: ${candidate.ticks} updates<br>Real time: ${timestr(candidate.realTimeSec)}</p>${saveSection}<h2>High scores</h2><div id="scores">${scoreTable(initial.scores, initial.index)}</div><p class="actions"><button id="again">Play ${escapeHtml(level)} again</button> <button id="menu">Main menu</button></p></main>`;
    const scores = this.root.querySelector<HTMLElement>('#scores')!;
    const input = this.root.querySelector<HTMLInputElement>('#score-name');
    if (canSave && input) {
      const save = this.root.querySelector<HTMLButtonElement>('#save')!;
      const note = this.root.querySelector<HTMLElement>('#save-message')!;
      const preview = (): void => {
        const projected = previewScores(candidate, input.value);
        scores.innerHTML = scoreTable(projected.scores, projected.index);
        save.disabled = projected.index < 0;
        note.textContent = rankNote(projected.index);
      };
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
        scores.innerHTML = scoreTable(loadScores(), index);
        note.textContent = `Score saved at #${index + 1}.`;
        save.disabled = true;
        input.disabled = true;
      };
      input.focus();
      input.select();
      // Re-check once the browser has had a chance to restore or autofill the field.
      requestAnimationFrame(preview);
    }
    this.root.querySelector<HTMLButtonElement>('#again')!.onclick = () =>
      this.start(level);
    this.root.querySelector<HTMLButtonElement>('#menu')!.onclick = () =>
      this.startScreen();
  }
  private fitGameToViewport(): void {
    if (!this.gameShell) return;
    this.gameShell.style.transform = '';
    const width = this.gameShell.offsetWidth;
    const height = this.gameShell.offsetHeight;
    const parentStyle = getComputedStyle(this.gameShell.parentElement!);
    const availableWidth = Math.max(
      0,
      window.innerWidth -
        parseFloat(parentStyle.paddingLeft) -
        parseFloat(parentStyle.paddingRight),
    );
    const availableHeight = Math.max(
      0,
      window.innerHeight -
        parseFloat(parentStyle.paddingTop) -
        parseFloat(parentStyle.paddingBottom),
    );
    const scale = Math.min(availableWidth / width, availableHeight / height);
    this.gameShell.style.transform = `scale(${scale})`;
  }
  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[char]!,
  );
}

function rankNote(index: number): string {
  return index < 0
    ? 'Your previous score for this level was better, so there is nothing to save.'
    : `Saving will place you at #${index + 1}.`;
}

/** Renders the score table; `highlight` marks a pending or just-saved row. */
function scoreTable(scores: ScoreEntry[], highlight = -1): string {
  const rows = scores
    .map(
      (score, index) =>
        `<tr${index === highlight ? ' class="highlight"' : ''}><td>${index + 1}</td><td>${escapeHtml(score.name)}</td><td>${escapeHtml(score.level)}</td><td>${score.ticks}</td><td>${timestr(score.realTimeSec)}</td><td>${score.planes}</td></tr>`,
    )
    .join('');
  return `<table><thead><tr><th>#</th><th>name</th><th>level</th><th>time</th><th>real time</th><th>planes safe</th></tr></thead><tbody>${rows}</tbody></table>`;
}
