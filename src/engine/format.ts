import { DEG, letterOf } from './dir';
import { LOW_FUEL } from './game';
import type { GameDef, Plane } from './types';

export function formatPlaneLine(plane: Plane, _def: GameDef): string {
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

export function timestr(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor(seconds / 3600) % 24;
  const minutes = Math.floor(seconds / 60) % 60;
  const secs = seconds % 60;
  if (days > 0) return `${days}d+${String(hours).padStart(2, '0')}hrs`;
  if (hours > 0)
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}
