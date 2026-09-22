import { LOW_FUEL } from '../engine/constants';
import { DEG, letterOf } from '../engine/dir';
import type { Game } from '../engine/game';
import type { Plane } from '../engine/types';

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

/** One plane-list row: `<letter><alt><fuel><dest>: <detail>`, see DOCS.md §5.2. */
export function formatPlaneLine(plane: Plane): string {
  const destination = plane.destType === 'airport' ? 'A' : 'E';
  let line = `${letterOf(plane)}${plane.altitude}${plane.fuel < LOW_FUEL ? '*' : ' '}${destination}${plane.destNo}: `;
  const heading = plane.pending?.heading ?? plane.heading;
  let detail = '';
  if (plane.altitude === 0) detail = `Holding @ A${plane.origNo}`;
  else if (heading.kind === 'circle')
    detail = `Circle ${heading.turn === 'cw' ? 'R' : 'L'}`;
  else if (plane.pending || heading.dir !== plane.dir)
    detail = String(DEG[heading.dir]);
  line += detail;
  if (plane.pending) line += ` @ B${plane.pending.beacon}`;
  if (!detail && (plane.status === 'unmarked' || plane.status === 'ignored'))
    line += '---------';
  if (plane.targetAltitude !== plane.altitude) {
    line += `${line.endsWith(' ') ? '' : ' '}${plane.targetAltitude > plane.altitude ? '↑' : '↓'}${plane.targetAltitude}`;
  }
  return line;
}
