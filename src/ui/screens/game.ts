import type { Editor } from '../../engine/commands';
import type { Game } from '../../engine/game';
import type { LevelDef } from '../../engine/types';
import { html, setHtml } from '../html';
import { renderInfo } from '../info';
import { renderInput } from '../input';
import { Radar } from '../radar';

export interface PauseActions {
  onContinue: () => void;
  onRestart: () => void;
  onQuit: () => void;
}

/**
 * The playing field: radar, info panel, input area and the pause overlay. Owns the
 * board markup and every element lookup into it, so `ui/app.ts` is left with the
 * game lifecycle and never touches the DOM directly.
 */
export class GameScreen {
  private readonly shell: HTMLElement;
  private readonly board: HTMLElement;
  private readonly overlay: HTMLElement;
  private readonly infoHead: HTMLElement;
  private readonly info: HTMLElement;
  private readonly input: HTMLElement;
  private readonly tickFill: HTMLElement;
  private readonly pauseButton: HTMLButtonElement;
  private readonly radar: Radar;
  private tickBar: Animation | null = null;

  constructor(
    root: HTMLElement,
    levelName: string,
    def: LevelDef,
    onPause: () => void,
  ) {
    setHtml(
      root,
      html`<main class="game">
        <div id="game-shell">
          <header>
            <b>Level: ${levelName}</b>
            <span><button id="pause">Pause (Esc)</button></span>
          </header>
          <section id="board">
            <div id="radar"></div>
            <div id="info-panel">
              <pre id="info-head"></pre>
              <div id="tick"><span id="tick-fill"></span></div>
              <pre id="info"></pre>
            </div>
            <pre id="input"></pre>
            <aside>ATC - by Ed James</aside>
          </section>
        </div>
        <div id="overlay" hidden></div>
      </main>`,
    );
    const find = <T extends HTMLElement>(selector: string): T =>
      root.querySelector<T>(selector)!;
    this.shell = find('#game-shell');
    this.board = find('#board');
    this.overlay = find('#overlay');
    this.infoHead = find('#info-head');
    this.info = find('#info');
    this.input = find('#input');
    this.tickFill = find('#tick-fill');
    this.pauseButton = find<HTMLButtonElement>('#pause');
    // The info panel is sized in radar rows so it is exactly as tall as the radar.
    this.board.style.setProperty('--radar-rows', String(def.height));
    this.radar = new Radar(find('#radar'), def);
    this.pauseButton.onclick = onPause;
  }

  render(game: Game, editor: Editor): void {
    this.radar.render(game);
    renderInfo(this.infoHead, this.info, game);
    renderInput(this.input, editor);
  }

  /** Restarts the progress line that counts down to the next update. */
  armTick(intervalMs: number): void {
    this.cancelTick();
    this.tickBar = this.tickFill.animate(
      [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }],
      { duration: intervalMs, easing: 'linear', fill: 'forwards' },
    );
  }

  cancelTick(): void {
    this.tickBar?.cancel();
    this.tickBar = null;
  }

  /** Replaces the input area with the result, and stops the game being paused. */
  showGameOver(text: string): void {
    this.pauseButton.disabled = true;
    this.input.textContent = text;
  }

  showPause(actions: PauseActions): void {
    this.board.style.visibility = 'hidden';
    this.overlay.hidden = false;
    setHtml(
      this.overlay,
      html`<section class="modal">
        <h1>PAUSED</h1>
        <button id="continue">Continue (C / Esc)</button>
        <button id="restart">Restart (R)</button>
        <button id="quit-now">Quit (Q)</button>
      </section>`,
    );
    const button = (selector: string): HTMLButtonElement =>
      this.overlay.querySelector<HTMLButtonElement>(selector)!;
    button('#continue').onclick = actions.onContinue;
    button('#restart').onclick = actions.onRestart;
    button('#quit-now').onclick = actions.onQuit;
  }

  hidePause(): void {
    this.board.style.visibility = '';
    this.overlay.hidden = true;
  }

  /**
   * Scales the whole board to fill the viewport. The factor is deliberately not
   * clamped at 1: the board is a fixed character grid, so on a large display an
   * unscaled game would be tiny.
   */
  fitToViewport(): void {
    this.shell.style.transform = '';
    const width = this.shell.offsetWidth;
    const height = this.shell.offsetHeight;
    if (!width || !height) return;
    const parentStyle = getComputedStyle(this.shell.parentElement!);
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
    this.shell.style.transform = `scale(${scale})`;
  }
}
