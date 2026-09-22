import { MAX_TURN_PER_MOVE } from './constants';
import { DX, DY } from './dir';
import type { Dir, LevelDef, HeadingCmd, Plane } from './types';

export interface PathStep {
  x: number;
  y: number;
  dir: Dir;
}

/** Circling tables preserve the original's odd-to-even heading convergence. */
export const CIRCLE_CW = [2, 3, 4, 5, 6, 7, 0, 0] as const;
export const CIRCLE_CCW = [6, 0, 0, 1, 2, 3, 4, 5] as const;

/** Shortest-path turn toward a fixed heading, clamped to +-MAX_TURN_PER_MOVE. */
export function stepToward(dir: Dir, target: Dir): Dir {
  let delta = target - dir;
  if (delta > 4) delta -= 8;
  else if (delta < -4) delta += 8;
  delta = Math.max(-MAX_TURN_PER_MOVE, Math.min(MAX_TURN_PER_MOVE, delta));
  return ((dir + delta + 8) % 8) as Dir;
}

export function nextDirFrom(dir: Dir, cmd: HeadingCmd): Dir {
  if (cmd.kind === 'circle')
    return (cmd.turn === 'cw' ? CIRCLE_CW : CIRCLE_CCW)[dir] as Dir;
  return stepToward(dir, cmd.dir);
}

export function nextDir(plane: Plane): Dir {
  return nextDirFrom(plane.dir, plane.heading);
}

/** Anything with a radar position; `tooClose` never needs a whole plane. */
type Position = Pick<Plane, 'x' | 'y' | 'altitude'>;

export function tooClose(a: Position, b: Position, distance: number): boolean {
  return (
    Math.abs(a.altitude - b.altitude) <= distance &&
    Math.abs(a.x - b.x) <= distance &&
    Math.abs(a.y - b.y) <= distance
  );
}

/** True while a position is inside the radar border, where planes may fly. */
export function inBounds(
  point: Pick<Plane, 'x' | 'y'>,
  def: LevelDef,
): boolean {
  return (
    point.x >= 1 &&
    point.x < def.width - 1 &&
    point.y >= 1 &&
    point.y < def.height - 1
  );
}

export function projectPath(plane: Plane, def: LevelDef): PathStep[] {
  const path: PathStep[] = [];
  const seen = new Set<string>();
  let { x, y, dir } = plane;
  for (;;) {
    dir = nextDirFrom(dir, plane.heading);
    x += DX[dir];
    y += DY[dir];
    if (!inBounds({ x, y }, def)) return path;
    const key = `${x},${y},${dir}`;
    if (seen.has(key)) return path;
    seen.add(key);
    path.push({ x, y, dir });
  }
}
