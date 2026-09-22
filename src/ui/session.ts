import { CommandEditor } from '../engine/commands';
import { Game } from '../engine/game';
import type { LevelDef } from '../engine/types';
import { isContinueKey, pauseIntent, playIntent } from './keyboard';
import { GameScreen } from './screens/game';
import type { ScoreCandidate } from '../storage/scores';

export interface FinishedGame {
  candidate: ScoreCandidate;
  plane: string | null;
  message: string;
}

export interface SessionHandlers {
  /** Restart the same level, from the pause menu. */
  onRestart: () => void;
  /** The player has left the finished game; show the score screen. */
  onFinished: (finished: FinishedGame) => void;
}

/** Composes the loss line shared by the input area and the score screen. */
export function resultLine(plane: string | null, message: string): string {
  return plane ? `Plane '${plane}' ${message}` : message;
}

/**
 * One played game: the running `Game`, its command editor and screen, the clock and
 * every keystroke from the first plane to the score screen. The clock is a
 * self-chaining `setTimeout` (never `setInterval`), so a forced update and
 * pause/resume can cleanly reset the interval.
 */
export class GameSession {
  private readonly game: Game;
  private readonly editor: CommandEditor;
  private readonly screen: GameScreen;
  private timer: number | null = null;
  private startedAt = 0;
  private pausedMs = 0;
  private pauseStartedAt = 0;
  private finished: FinishedGame | null = null;

  constructor(
    root: HTMLElement,
    private readonly levelName: string,
    def: LevelDef,
    private readonly handlers: SessionHandlers,
  ) {
    this.game = new Game(def);
    this.editor = new CommandEditor(this.game);
    this.screen = new GameScreen(root, levelName, def, () => this.pause());
  }

  /** Renders the opening position and arms the clock. */
  start(): void {
    this.startedAt = Date.now();
    this.game.addPlane();
    // Render first and only then arm the clock, so the first update lands a full
    // interval later instead of immediately.
    this.render();
    this.scheduleTick();
    requestAnimationFrame(() => this.screen.fitToViewport());
  }

  keydown(event: KeyboardEvent): void {
    if (this.finished) {
      if (!isContinueKey(event)) return;
      event.preventDefault();
      this.handlers.onFinished(this.finished);
      return;
    }
    if (this.pauseStartedAt) {
      const intent = pauseIntent(event);
      if (!intent) return;
      event.preventDefault();
      if (intent === 'continue') this.resume();
      else if (intent === 'restart') this.handlers.onRestart();
      else this.quit();
      return;
    }
    const intent = playIntent(event, this.editor.editor.state);
    if (!intent) return;
    event.preventDefault();
    if (intent.kind === 'pause') {
      this.pause();
      return;
    }
    if (intent.kind === 'tick') {
      this.forceTick();
      return;
    }
    if (this.editor.feed(intent.token) === 'forced-update') this.forceTick();
    else this.render();
  }

  fitToViewport(): void {
    this.screen.fitToViewport();
  }

  pause(): void {
    if (this.pauseStartedAt || this.finished) return;
    this.clearTimer();
    this.pauseStartedAt = Date.now();
    this.screen.showPause({
      onContinue: () => this.resume(),
      onRestart: () => this.handlers.onRestart(),
      onQuit: () => this.quit(),
    });
  }

  /** Stops the clock; the session must not be used afterwards. */
  stop(): void {
    this.clearTimer();
  }

  private resume(): void {
    if (!this.pauseStartedAt) return;
    this.pausedMs += Date.now() - this.pauseStartedAt;
    this.pauseStartedAt = 0;
    this.screen.hidePause();
    this.scheduleTick();
  }

  private quit(): void {
    this.clearTimer();
    this.handlers.onFinished(this.result(null, 'You quit.'));
  }

  private forceTick(): void {
    this.clearTimer();
    this.tick();
  }

  private tick(): void {
    const lost = this.game.update();
    this.render();
    if (!lost) {
      this.scheduleTick();
      return;
    }
    // A lost game keeps its final position on screen; the score screen only
    // replaces it once the player presses Space.
    this.clearTimer();
    this.finished = this.result(lost.planeLetter, lost.message);
    this.screen.showGameOver(
      `${resultLine(lost.planeLetter, lost.message)}\n\nPress Space for high scores.`,
    );
  }

  /** Arms the next update and restarts the progress line that counts down to it. */
  private scheduleTick(): void {
    const interval = this.game.def.updateSecs * 1000;
    this.timer = window.setTimeout(() => this.tick(), interval);
    this.screen.armTick(interval);
  }

  private render(): void {
    this.screen.render(this.game, this.editor.editor);
  }

  private result(plane: string | null, message: string): FinishedGame {
    return {
      candidate: {
        level: this.levelName,
        planes: this.game.safePlanes,
        ticks: this.game.clock,
        realTimeSec: this.elapsedSec(),
      },
      plane,
      message,
    };
  }

  /** Real seconds played, excluding paused time — including a pause still open. */
  private elapsedSec(): number {
    const now = Date.now();
    const paused =
      this.pausedMs + (this.pauseStartedAt ? now - this.pauseStartedAt : 0);
    return Math.max(0, Math.floor((now - this.startedAt - paused) / 1000));
  }

  private clearTimer(): void {
    this.screen.cancelTick();
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
