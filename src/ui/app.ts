import { BUILTIN_LEVELS } from '../data';
import { CommandEditor } from '../engine/commands';
import { timestr } from '../engine/format';
import { Game } from '../engine/game';
import { parseLevel } from '../engine/parser';
import { renderInfo } from './info';
import { renderInput } from './input';
import { directionTokenForCode } from './keyboard';
import { Radar } from './radar';
import {
  lastName,
  loadScores,
  previewScores,
  qualifiesUnderSomeName,
  saveScore,
  type ScoreCandidate,
  type ScoreEntry,
} from './scores';

const HELP = `<section class="help"><h2>How to play</h2><p>Planes arrive from numbered exits and airports. Send each one to the destination shown in the info panel (A = airport, E = exit): land at its airport at altitude 0 flying along the runway, or leave through its exit at altitude 9. Planes crash if they collide, run out of fuel, hit the ground or leave the arena anywhere else.</p><p>On the radar a plane is its letter followed by its altitude. Capitals are propeller planes, which move every other tick; lower case are jets, which move every tick. In the info panel, "*" marks a plane low on fuel.</p><details><summary>Commands and rules</summary><h3>Commands</h3><p>Type the plane's letter, then a command, then submit using Enter.</p><br><table><tr><td><code>t&lt;dir&gt;</code></td><td>turn to a direction</td></tr><tr><td><code>tt&lt;b|e|a&gt;&lt;n&gt;</code></td><td>turn towards beacon, exit or airport <code>n</code></td></tr><tr><td><code>c</code> / <code>cr</code> / <code>cl</code></td><td>circle clockwise, clockwise, counter-clockwise</td></tr><tr><td><code>a&lt;n&gt;</code></td><td>set target altitude to <code>n</code>000 feet</td></tr><tr><td><code>ac&lt;n&gt;</code> / <code>a+&lt;n&gt;</code></td><td>climb <code>n</code>000 feet</td></tr><tr><td><code>ad&lt;n&gt;</code> / <code>a-&lt;n&gt;</code></td><td>descend <code>n</code>000 feet</td></tr><tr><td><code>m</code> / <code>u</code> / <code>i</code></td><td>mark, unmark or ignore the plane</td></tr><tr><td><code>ab&lt;n&gt;</code> / <code>@b&lt;n&gt;</code></td><td>suffix on a turn or circle command: delay it until beacon <code>n</code> is reached</td></tr></table><p>Directions are the eight keys around <code>s</code>, so they match their position on any layout: <code>w</code> north, <code>e</code> north-east, <code>d</code> east, <code>c</code> south-east, <code>x</code> south, <code>z</code> south-west, <code>a</code> west, <code>q</code> north-west. A plane on the ground only takes off once you give it an altitude. <code>*</code> works instead of <code>b</code> for a beacon.</p><br><table><tr><td><code>Enter</code></td><td>run the command; on an empty line, advance one step</td></tr><tr><td><code>Space</code></td><td>advance one step without touching the command</td></tr><tr><td><code>Backspace</code></td><td>undo the last key</td></tr><tr><td><code>Ctrl-U</code></td><td>clear the command</td></tr><tr><td><code>?</code></td><td>list the keys that are valid next</td></tr><tr><td><code>Esc</code></td><td>pause</td></tr></table><p>Examples: <code>ba9</code> sends plane <code>b</code> to altitude 9, <code>cttb0</code> turns plane <code>c</code> towards beacon 0, <code>dtw@b1</code> makes plane <code>d</code> head north once it reaches beacon 1.</p><h3>Reading the radar</h3><table><tr><td><code>a7</code></td><td>plane <code>a</code> flying at altitude 7; marked planes are highlighted</td></tr><tr><td><code>*0</code></td><td>beacon 0</td></tr><tr><td><code>0</code> on the border</td><td>exit 0</td></tr><tr><td><code>^0</code> / <code>&gt;0</code> / <code>v0</code> / <code>&lt;0</code></td><td>airport 0; the arrow is the runway direction</td></tr><tr><td><code>+</code></td><td>an airway drawn on the map (visual only, for easier alignment)</td></tr></table><h3>Reading the info panel</h3><p>A line such as <code>a7*E0: 90 @ B1 &uarr;9</code> reads: plane <code>a</code> at altitude 7, low on fuel, bound for exit 0, currently heading 90&deg;, with a command waiting at beacon 1, climbing to altitude 9. In place of a heading you may see <code>Circle R</code> or <code>Circle L</code>, <code>Holding @ A0</code> for a plane still on the ground, or <code>---------</code> for an unmarked or ignored plane.</p><h3>Rules of flight</h3><table><tr><td>turning</td><td>at most 90&deg; per move, so a reversal takes two moves</td></tr><tr><td>altitude</td><td>1000 feet per move, until the target altitude is reached</td></tr><tr><td>collisions</td><td>two planes collide when they are within one square and one altitude level of each other</td></tr><tr><td>fuel</td><td>enough for width + height moves; <code>*</code> warns below 15 moves left</td></tr><tr><td>entering</td><td>planes appear at an exit at altitude 7, or wait on an airport at altitude 0</td></tr><tr><td>delaying</td><td>the beacon must lie on the plane&#39;s current path, and a circling plane cannot take a delayed command</td></tr></table><h3>Marking</h3><p>Marked planes are highlighted on the radar and described in full. Unmarked and ignored planes show <code>---------</code> instead, which keeps the panel quiet for traffic you have already dealt with. An unmarked plane marks itself again when it reaches the beacon of a delayed command; an ignored plane never does.</p></details></section>`;

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
  private tickBar: Animation | null = null;
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
    this.teardown();
    const options = BUILTIN_LEVELS.map(
      (level) =>
        `<option value="${escapeHtml(level.name)}">${escapeHtml(level.name)}</option>`,
    ).join('');
    this.root.innerHTML = `<main class="screen menu-screen"><header class="title"><h1>ATC</h1><p>air traffic controller</p><p class="source-link"><a href="https://github.com/benediktwerner/atc-game" target="_blank" rel="noreferrer">Source code on GitHub</a></p></header><p class="start-row"><label for="level">Level</label> <select id="level">${options}</select> <button id="start">Start</button></p><p class="level-stats" id="level-stats"></p>${HELP}<h2>High scores</h2>${scoreTable(loadScores())}</main>`;
    const select = this.root.querySelector<HTMLSelectElement>('#level')!;
    const stats = this.root.querySelector<HTMLElement>('#level-stats')!;
    select.onchange = () => {
      stats.innerHTML = levelStats(select.value);
    };
    stats.innerHTML = levelStats(select.value);
    this.root.querySelector<HTMLButtonElement>('#start')!.onclick = () =>
      this.start(select.value);
  }

  private start(name: string): void {
    const builtin = BUILTIN_LEVELS.find((item) => item.name === name);
    if (!builtin) return;
    // Stop the outgoing game before its DOM is replaced, so a failure below cannot
    // leave the previous game ticking against detached nodes.
    this.teardown();
    let game: Game;
    try {
      game = new Game(parseLevel(builtin.source, name));
    } catch (error) {
      this.root.textContent = `Unable to load ${name}: ${error instanceof Error ? error.message : String(error)}`;
      return;
    }
    this.game = game;
    this.levelName = name;
    this.editor = new CommandEditor(this.game);
    this.startedAt = Date.now();
    this.pausedMs = 0;
    this.pauseStartedAt = 0;
    this.root.innerHTML = `<main class="game"><div id="game-shell"><header><b>Level: ${escapeHtml(name)}</b><span><button id="pause">Pause (Esc)</button></span></header><section id="board"><div id="radar"></div><div id="info-panel"><pre id="info-head"></pre><div id="tick"><span id="tick-fill"></span></div><pre id="info"></pre></div><pre id="input"></pre><aside>ATC - by Ed James</aside></section></div><div id="overlay" hidden></div></main>`;
    this.board = this.root.querySelector('#board');
    this.board!.style.setProperty('--radar-rows', String(game.def.height));
    this.gameShell = this.root.querySelector('#game-shell');
    this.radar = new Radar(this.root.querySelector('#radar')!, this.game.def);
    this.root.querySelector<HTMLButtonElement>('#pause')!.onclick = () =>
      this.pause();
    this.game.addPlane();
    // Render the opening position and only then arm the clock, so the first update
    // lands a full interval later instead of immediately.
    this.render();
    this.scheduleTick();
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
    if (event.ctrlKey && event.key.toLowerCase() === 'u') token = 'CTRL_U';
    // Every other modifier combination belongs to the browser. Without this the
    // `Turn` branch below would read Cmd-D as a direction and swallow the shortcut.
    else if (event.ctrlKey || event.metaKey) return;
    else if (event.key === 'Enter') token = 'ENTER';
    else if (event.key === ' ') {
      event.preventDefault();
      this.clearTimer();
      this.tick();
      return;
    } else if (event.key === 'Backspace') token = 'BACKSPACE';
    else if (event.key === 'Escape') {
      event.preventDefault();
      this.pause();
      return;
    } else {
      // In `Turn` the *physical* ring of keys around `s` is what matters, so the
      // layout-independent `code` wins there; everywhere else the typed character
      // is what counts. Either way only single ASCII characters are commands, so
      // bare modifiers and navigation keys keep their default behaviour.
      const key =
        (this.editor!.editor.state === 'Turn'
          ? directionTokenForCode(event.code)
          : null) ?? event.key;
      if (key.length === 1 && key.charCodeAt(0) < 128) token = key;
    }
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
    this.scheduleTick();
  }
  /** Arms the next update and restarts the progress line that counts down to it. */
  private scheduleTick(): void {
    if (!this.game) return;
    const interval = this.game.def.updateSecs * 1000;
    this.timer = window.setTimeout(() => this.tick(), interval);
    const fill = this.root.querySelector<HTMLElement>('#tick-fill');
    this.tickBar?.cancel();
    this.tickBar =
      fill?.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], {
        duration: interval,
        easing: 'linear',
        fill: 'forwards',
      }) ?? null;
  }
  private render(): void {
    if (!this.game || !this.radar || !this.editor) return;
    this.radar.render(this.game);
    renderInfo(
      this.root.querySelector('#info-head')!,
      this.root.querySelector('#info')!,
      this.game,
    );
    renderInput(this.root.querySelector('#input')!, this.editor.editor);
  }
  private pause(): void {
    if (!this.game || this.pauseStartedAt || this.finishedGame) return;
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
    this.scheduleTick();
  }
  private end(plane: string | null, message: string): void {
    if (!this.game) return;
    this.clearTimer();
    this.showScoreScreen({ candidate: this.candidate(), plane, message });
  }
  private awaitScoreScreen(plane: string | null, message: string): void {
    if (!this.game) return;
    this.clearTimer();
    this.finishedGame = { candidate: this.candidate(), plane, message };
    const pauseButton = this.root.querySelector<HTMLButtonElement>('#pause');
    if (pauseButton) pauseButton.disabled = true;
    this.root.querySelector('#input')!.textContent =
      `${plane ? `Plane '${plane}' ${message}` : message}\n\nPress Space for high scores.`;
  }
  private candidate(): ScoreCandidate {
    return {
      level: this.levelName,
      planes: this.game!.safePlanes,
      ticks: this.game!.clock,
      realTimeSec: this.elapsedSec(),
    };
  }
  /** Real seconds played, excluding paused time — including a pause still open. */
  private elapsedSec(): number {
    const now = Date.now();
    const paused =
      this.pausedMs + (this.pauseStartedAt ? now - this.pauseStartedAt : 0);
    return Math.max(0, Math.floor((now - this.startedAt - paused) / 1000));
  }
  private showScoreScreen(finished: FinishedGame): void {
    const { candidate, plane, message } = finished;
    const canSave = qualifiesUnderSomeName(candidate);
    const level = this.levelName;
    this.teardown();
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
  /**
   * Scales the whole board to fill the viewport. The factor is deliberately not
   * clamped at 1: the board is a fixed character grid, so on a large display an
   * unscaled game would be tiny.
   */
  private fitGameToViewport(): void {
    if (!this.gameShell) return;
    this.gameShell.style.transform = '';
    const width = this.gameShell.offsetWidth;
    const height = this.gameShell.offsetHeight;
    if (!width || !height) return;
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
  /** Stops the running game and drops every reference to its (outgoing) DOM. */
  private teardown(): void {
    this.clearTimer();
    this.game = null;
    this.editor = null;
    this.radar = null;
    this.board = null;
    this.gameShell = null;
    this.finishedGame = null;
    this.pauseStartedAt = 0;
  }
  private clearTimer(): void {
    this.tickBar?.cancel();
    this.tickBar = null;
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

/** One-line summary of the selected level, with units spelled out. */
function levelStats(name: string): string {
  const builtin = BUILTIN_LEVELS.find((level) => level.name === name);
  if (!builtin) return '';
  try {
    const def = parseLevel(builtin.source, name);
    return [
      `<b>${def.width} &times; ${def.height}</b> cells`,
      `ticks every <b>${def.updateSecs}</b> seconds`,
      `new plane on <b>1 in ${def.newplane}</b> ticks`,
      `<b>${def.exits.length}</b> exits, <b>${def.beacons.length}</b> beacons, <b>${def.airports.length}</b> airports`,
    ]
      .map((item) => `<span>${item}</span>`)
      .join('');
  } catch {
    return '';
  }
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
