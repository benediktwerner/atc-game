import { formatPlaneLine } from '../engine/format';
import type { Game } from '../engine/game';

export function renderInfo(root: HTMLElement, game: Game): void {
  root.textContent = `Time: ${String(game.clock).padEnd(4)} Safe: ${game.safePlanes}\n\n${[...game.air, ...game.ground].map((plane) => formatPlaneLine(plane, game.def)).join('\n')}`;
}
