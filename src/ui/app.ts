import { BUILTIN_LEVELS } from '../data';
import { CommandEditor } from '../engine/commands';
import { Game } from '../engine/game';
import { parseLevel } from '../engine/parser';
import { directionTokenForCode } from './keyboard';
import type { ScoreCandidate } from './scores';
import { GameScreen } from './screens/game';
import { renderMenuScreen } from './screens/menu';
import { renderScoreScreen } from './screens/score';

interface FinishedGame {
  candidate: ScoreCandidate;
  plane: string | null;
  message: string;
}

/** Composes the loss line shared by the input area and the score screen. */
function resultLine(plane: string | null, message: string): string {
  return plane ? `Plane '${plane}' ${message}` : message;
}

/**
 * Screen lifecycle and the game clock. All markup lives in `ui/screens/`; this class
 * owns the running game, the self-chaining update timer and keyboard routing.
 */
export class App {
  private game: Game | null = null;
  private editor: CommandEditor | null = null;
  private screen: GameScreen | null = null;
  private timer: number | null = null;
  private startedAt = 0;
  private pausedMs = 0;
  private pauseStartedAt = 0;
  private levelName = '';
  private finishedGame: FinishedGame | null = null;

  constructor(private readonly root: HTMLElement) {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.game && !this.finishedGame) this.pause();
    });
    window.addEventListener('keydown', (event) => this.keydown(event));
    window.addEventListener('resize', () => this.screen?.fitToViewport());
    this.startScreen();
  }

  private startScreen(): void {
    this.teardown();
    renderMenuScreen(this.root, (level) => this.start(level));
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
      const detail = error instanceof Error ? error.message : String(error);
      this.root.textContent = `Unable to load ${name}: ${detail}`;
      return;
    }
    this.game = game;
    this.levelName = name;
    this.editor = new CommandEditor(game);
    this.startedAt = Date.now();
    this.pausedMs = 0;
    this.pauseStartedAt = 0;
    this.screen = new GameScreen(this.root, name, game.def, () => this.pause());
    game.addPlane();
    // Render the opening position and only then arm the clock, so the first update
    // lands a full interval later instead of immediately.
    this.render();
    this.scheduleTick();
    requestAnimationFrame(() => this.screen?.fitToViewport());
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
    if (!this.game || !this.screen) return;
    const interval = this.game.def.updateSecs * 1000;
    this.timer = window.setTimeout(() => this.tick(), interval);
    this.screen.armTick(interval);
  }

  private render(): void {
    if (!this.game || !this.editor || !this.screen) return;
    this.screen.render(this.game, this.editor.editor);
  }

  private pause(): void {
    if (!this.game || this.pauseStartedAt || this.finishedGame) return;
    this.clearTimer();
    this.pauseStartedAt = Date.now();
    this.screen!.showPause({
      onContinue: () => this.resume(),
      onRestart: () => this.start(this.levelName),
      onQuit: () => this.end(null, 'You quit.'),
    });
  }

  private resume(): void {
    if (!this.game || !this.pauseStartedAt) return;
    this.pausedMs += Date.now() - this.pauseStartedAt;
    this.pauseStartedAt = 0;
    this.screen!.hidePause();
    this.scheduleTick();
  }

  private end(plane: string | null, message: string): void {
    if (!this.game) return;
    this.clearTimer();
    this.showScoreScreen({ candidate: this.candidate(), plane, message });
  }

  /**
   * A lost game keeps its final position on screen; the score screen only replaces
   * it once the player presses Space.
   */
  private awaitScoreScreen(plane: string | null, message: string): void {
    if (!this.game) return;
    this.clearTimer();
    this.finishedGame = { candidate: this.candidate(), plane, message };
    this.screen?.showGameOver(
      `${resultLine(plane, message)}\n\nPress Space for high scores.`,
    );
  }

  private showScoreScreen(finished: FinishedGame): void {
    const { candidate, plane, message } = finished;
    const level = this.levelName;
    this.teardown();
    renderScoreScreen(this.root, {
      heading: resultLine(plane, message),
      candidate,
      level,
      onAgain: () => this.start(level),
      onMenu: () => this.startScreen(),
    });
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

  /** Stops the running game and drops every reference to its (outgoing) DOM. */
  private teardown(): void {
    this.clearTimer();
    this.game = null;
    this.editor = null;
    this.screen = null;
    this.finishedGame = null;
    this.pauseStartedAt = 0;
  }

  private clearTimer(): void {
    this.screen?.cancelTick();
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
