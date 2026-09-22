import { BUILTIN_LEVELS } from '../data';
import { parseLevel } from '../engine/parser';
import type { FinishedGame } from './session';
import { GameSession, resultLine } from './session';
import { renderMenuScreen } from './screens/menu';
import { renderScoreScreen } from './screens/score';

/**
 * Screen routing. All markup lives in `ui/screens/` and everything about a running
 * game lives in `ui/session.ts`; this class only decides which of the three screens
 * — menu, game, score — currently owns the root element.
 */
export class App {
  private session: GameSession | null = null;

  constructor(private readonly root: HTMLElement) {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.session?.pause();
    });
    window.addEventListener('keydown', (event) => this.session?.keydown(event));
    window.addEventListener('resize', () => this.session?.fitToViewport());
    this.startScreen();
  }

  private startScreen(): void {
    this.endSession();
    renderMenuScreen(this.root, (level) => this.start(level));
  }

  private start(name: string): void {
    const builtin = BUILTIN_LEVELS.find((item) => item.name === name);
    if (!builtin) return;
    // Stop the outgoing game before its DOM is replaced, so a failure below cannot
    // leave the previous game ticking against detached nodes.
    this.endSession();
    let session: GameSession;
    try {
      session = new GameSession(
        this.root,
        name,
        parseLevel(builtin.source, name),
        {
          onRestart: () => this.start(name),
          onFinished: (finished) => this.showScoreScreen(name, finished),
        },
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.root.textContent = `Unable to load ${name}: ${detail}`;
      return;
    }
    this.session = session;
    session.start();
  }

  private showScoreScreen(level: string, finished: FinishedGame): void {
    const { candidate, plane, message } = finished;
    this.endSession();
    renderScoreScreen(this.root, {
      heading: resultLine(plane, message),
      candidate,
      level,
      onAgain: () => this.start(level),
      onMenu: () => this.startScreen(),
    });
  }

  /** Stops the running game and drops every reference to its (outgoing) DOM. */
  private endSession(): void {
    this.session?.stop();
    this.session = null;
  }
}
