import { DX, DY, letterOf } from './dir';
import type { GameDef } from './gamedef';
import type { Rng } from './rng';
import { randInt } from './rng';
import type { Dir, HeadingCmd, Plane } from './types';

export const MAX_ALTITUDE = 9;
export const ENTRY_ALTITUDE = 7;
export const EXIT_ALTITUDE = 9;
export const LOW_FUEL = 15;
export const MAX_PLANES = 26;
export const SPAWN_CLEARANCE = 4;
export const COLLISION_DISTANCE = 1;
export const MAX_TURN_PER_MOVE = 2;
export const NUM_SCORES = 18;

export interface GameOver {
  planeLetter: string | null;
  message: string;
}

export interface PathStep {
  x: number;
  y: number;
  dir: Dir;
}

export const CIRCLE_CW = [2, 3, 4, 5, 6, 7, 0, 0] as const;
export const CIRCLE_CCW = [6, 0, 0, 1, 2, 3, 4, 5] as const;

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

export function tooClose(a: Plane, b: Plane, distance: number): boolean {
  return (
    Math.abs(a.altitude - b.altitude) <= distance &&
    Math.abs(a.x - b.x) <= distance &&
    Math.abs(a.y - b.y) <= distance
  );
}

export function projectPath(plane: Plane, def: GameDef): PathStep[] {
  const path: PathStep[] = [];
  const seen = new Set<string>();
  let { x, y, dir } = plane;
  for (;;) {
    dir = nextDirFrom(dir, plane.heading);
    x += DX[dir];
    y += DY[dir];
    if (x < 1 || x >= def.width - 1 || y < 1 || y >= def.height - 1)
      return path;
    const key = `${x},${y},${dir}`;
    if (seen.has(key)) return path;
    seen.add(key);
    path.push({ x, y, dir });
  }
}

export class Game {
  readonly air: Plane[] = [];
  readonly ground: Plane[] = [];
  clock = 0;
  safePlanes = 0;
  private lastPlaneId = -1;

  constructor(
    readonly def: GameDef,
    private readonly rng: Rng = Math.random,
  ) {}

  addPlane(): void {
    const starts = this.def.exits.length + this.def.airports.length;
    if (starts < 2) return;
    const kind = this.random(2) === 0 ? 'prop' : 'jet';
    const destIndex = this.random(starts);
    const destination =
      destIndex < this.def.exits.length
        ? { type: 'exit' as const, no: destIndex }
        : { type: 'airport' as const, no: destIndex - this.def.exits.length };
    let candidate: Omit<Plane, 'id'> | null = null;
    for (let attempt = 0; attempt < starts; attempt += 1) {
      let originIndex: number;
      do originIndex = this.random(starts);
      while (originIndex === destIndex);
      if (originIndex < this.def.exits.length) {
        const origin = this.def.exits[originIndex];
        const probe = { x: origin.x, y: origin.y, altitude: ENTRY_ALTITUDE };
        if (
          this.air.some((plane) =>
            tooClose(plane, probe as Plane, SPAWN_CLEARANCE),
          )
        )
          continue;
        candidate = {
          kind,
          status: 'marked',
          origType: 'exit',
          origNo: originIndex,
          destType: destination.type,
          destNo: destination.no,
          x: origin.x,
          y: origin.y,
          dir: origin.dir,
          heading: { kind: 'fixed', dir: origin.dir },
          pending: null,
          altitude: ENTRY_ALTITUDE,
          targetAltitude: ENTRY_ALTITUDE,
          fuel: this.def.width + this.def.height,
        };
      } else {
        const originNo = originIndex - this.def.exits.length;
        const origin = this.def.airports[originNo];
        candidate = {
          kind,
          status: 'marked',
          origType: 'airport',
          origNo: originNo,
          destType: destination.type,
          destNo: destination.no,
          x: origin.x,
          y: origin.y,
          dir: origin.dir,
          heading: { kind: 'fixed', dir: origin.dir },
          pending: null,
          altitude: 0,
          targetAltitude: 0,
          fuel: this.def.width + this.def.height,
        };
      }
      break;
    }
    if (!candidate) return;
    const id = this.nextPlaneId();
    if (id === null) return;
    const plane = { ...candidate, id };
    this.insert(plane.altitude === 0 ? this.ground : this.air, plane);
  }

  update(): GameOver | null {
    this.clock += 1;
    for (let index = 0; index < this.ground.length;) {
      const plane = this.ground[index];
      if (plane.targetAltitude > 0) {
        this.ground.splice(index, 1);
        this.insert(this.air, plane);
      } else index += 1;
    }
    const gone = new Set<Plane>();
    for (const plane of this.air) {
      if (plane.kind === 'prop' && this.clock % 2 === 1) continue;
      plane.fuel -= 1;
      if (plane.fuel < 0) return this.loss(plane, 'ran out of fuel.');
      plane.altitude += Math.sign(plane.targetAltitude - plane.altitude);
      plane.dir = nextDir(plane);
      plane.x += DX[plane.dir];
      plane.y += DY[plane.dir];
      if (plane.pending && this.atBeacon(plane, plane.pending.beacon)) {
        plane.heading = plane.pending.heading;
        plane.pending = null;
        if (plane.status === 'unmarked') plane.status = 'marked';
      }
      const destination =
        plane.destType === 'airport'
          ? this.def.airports[plane.destNo]
          : this.def.exits[plane.destNo];
      if (!destination)
        return this.loss(plane, 'has a bizarre destination, get help!');
      if (
        plane.destType === 'airport' &&
        plane.x === destination.x &&
        plane.y === destination.y &&
        plane.altitude === 0
      ) {
        if (plane.dir !== destination.dir)
          return this.loss(plane, 'landed in the wrong direction.');
        gone.add(plane);
        continue;
      }
      if (
        plane.destType === 'exit' &&
        plane.x === destination.x &&
        plane.y === destination.y
      ) {
        if (plane.altitude !== EXIT_ALTITUDE)
          return this.loss(plane, 'exited at the wrong altitude.');
        gone.add(plane);
        continue;
      }
      if (plane.altitude > MAX_ALTITUDE)
        return this.loss(plane, 'exceeded flight ceiling.');
      if (plane.altitude <= 0) {
        if (
          this.def.airports.some(
            (airport) => airport.x === plane.x && airport.y === plane.y,
          )
        ) {
          return this.loss(
            plane,
            plane.destType === 'airport'
              ? 'landed at the wrong airport.'
              : 'landed instead of exited.',
          );
        }
        return this.loss(plane, 'crashed on the ground.');
      }
      if (
        plane.x < 1 ||
        plane.x >= this.def.width - 1 ||
        plane.y < 1 ||
        plane.y >= this.def.height - 1
      ) {
        if (
          this.def.exits.some(
            (exit) => exit.x === plane.x && exit.y === plane.y,
          )
        ) {
          return this.loss(
            plane,
            plane.destType === 'exit'
              ? 'exited via the wrong exit.'
              : 'exited instead of landed.',
          );
        }
        return this.loss(plane, 'illegally left the flight arena.');
      }
    }
    if (gone.size) {
      this.safePlanes += gone.size;
      for (let index = this.air.length - 1; index >= 0; index -= 1)
        if (gone.has(this.air[index])) this.air.splice(index, 1);
    }
    for (let i = 0; i < this.air.length; i += 1) {
      for (let j = i + 1; j < this.air.length; j += 1) {
        if (tooClose(this.air[i], this.air[j], COLLISION_DISTANCE))
          return this.loss(
            this.air[i],
            `collided with plane '${letterOf(this.air[j])}'.`,
          );
      }
    }
    if (this.random(this.def.newplane) === 0) this.addPlane();
    return null;
  }

  private random(n: number): number {
    return randInt(this.rng, n);
  }
  private loss(plane: Plane, message: string): GameOver {
    return { planeLetter: letterOf(plane), message };
  }
  private atBeacon(plane: Plane, beacon: number): boolean {
    const point = this.def.beacons[beacon];
    return point?.x === plane.x && point.y === plane.y;
  }
  private insert(list: Plane[], plane: Plane): void {
    const index = list.findIndex((other) => other.id > plane.id);
    if (index === -1) list.push(plane);
    else list.splice(index, 0, plane);
  }
  private nextPlaneId(): number | null {
    for (let offset = 0; offset < MAX_PLANES; offset += 1) {
      this.lastPlaneId = (this.lastPlaneId + 1) % MAX_PLANES;
      if (
        ![...this.air, ...this.ground].some(
          (plane) => plane.id === this.lastPlaneId,
        )
      )
        return this.lastPlaneId;
    }
    return null;
  }
}
