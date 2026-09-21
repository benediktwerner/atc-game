import { formatPlaneLine } from '../engine/format';
import type { Game } from '../engine/game';

export function renderInfo(
  head: HTMLElement,
  list: HTMLElement,
  game: Game,
): void {
  head.textContent = `Time: ${String(game.clock).padEnd(4)} Safe: ${game.safePlanes}`;
  list.textContent = [...game.air, ...game.ground]
    .map((plane) => formatPlaneLine(plane))
    .join('\n');
}
