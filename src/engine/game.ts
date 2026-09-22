import {
  COLLISION_DISTANCE,
  ENTRY_ALTITUDE,
  EXIT_ALTITUDE,
  MAX_ALTITUDE,
  MAX_PLANES,
  SPAWN_CLEARANCE,
} from './constants';
import { DX, DY, letterOf } from './dir';
import { inBounds, nextDir, tooClose } from './motion';
import type { Rng } from './rng';
import { randInt } from './rng';
import type { Airport, Exit, LevelDef, Plane } from './types';

export interface GameOver {
  planeLetter: string | null;
  message: string;
}

/** What became of a plane during the tick it just moved in. */
type Outcome = GameOver | 'arrived' | null;

export class Game {
  readonly air: Plane[] = [];
  readonly ground: Plane[] = [];
  clock = 0;
  safePlanes = 0;
  private lastPlaneId = -1;

  constructor(
    readonly def: LevelDef,
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
      // Drawn from the `starts - 1` entries that are not the destination and then
      // shifted back over it, so the pick is uniform and always terminates. A
      // reject-and-redraw loop would spin forever on a degenerate injected `Rng`.
      let originIndex = this.random(starts - 1);
      if (originIndex >= destIndex) originIndex += 1;
      if (originIndex < this.def.exits.length) {
        const origin = this.def.exits[originIndex];
        const probe = { x: origin.x, y: origin.y, altitude: ENTRY_ALTITUDE };
        if (this.air.some((plane) => tooClose(plane, probe, SPAWN_CLEARANCE)))
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
    this.takeOff();
    const gone = new Set<Plane>();
    const lost = this.fly(gone);
    // Credited even when this tick also ends the game: a plane that reached its
    // destination before another plane died still arrived safely.
    this.commitArrivals(gone);
    if (lost) return lost;
    const collision = this.collision();
    if (collision) return collision;
    if (this.random(this.def.newplane) === 0) this.addPlane();
    return null;
  }

  /** Moves every ground plane cleared for take-off into the air list. */
  private takeOff(): void {
    for (let index = 0; index < this.ground.length;) {
      const plane = this.ground[index];
      if (plane.targetAltitude > 0) {
        this.ground.splice(index, 1);
        this.insert(this.air, plane);
      } else index += 1;
    }
  }

  /** Advances every airborne plane, collecting safe arrivals into `gone`. */
  private fly(gone: Set<Plane>): GameOver | null {
    for (const plane of this.air) {
      if (plane.kind === 'prop' && this.clock % 2 === 1) continue;
      plane.fuel -= 1;
      if (plane.fuel < 0) return this.loss(plane, 'ran out of fuel.');
      this.advance(plane);
      const outcome = this.outcome(plane);
      if (outcome === 'arrived') gone.add(plane);
      else if (outcome) return outcome;
    }
    return null;
  }

  /** One move: altitude step, turn, displacement and pending-command release. */
  private advance(plane: Plane): void {
    plane.altitude += Math.sign(plane.targetAltitude - plane.altitude);
    plane.dir = nextDir(plane);
    plane.x += DX[plane.dir];
    plane.y += DY[plane.dir];
    if (plane.pending && this.atBeacon(plane, plane.pending.beacon)) {
      plane.heading = plane.pending.heading;
      plane.pending = null;
      if (plane.status === 'unmarked') plane.status = 'marked';
    }
  }

  /** Classifies a plane that has just moved: arrived, lost, or still flying. */
  private outcome(plane: Plane): Outcome {
    const destination: Airport | Exit | undefined =
      plane.destType === 'airport'
        ? this.def.airports[plane.destNo]
        : this.def.exits[plane.destNo];
    if (!destination)
      return this.loss(plane, 'has a bizarre destination, get help!');
    const atDestination =
      plane.x === destination.x && plane.y === destination.y;
    if (atDestination && plane.destType === 'airport' && plane.altitude === 0)
      return plane.dir === destination.dir
        ? 'arrived'
        : this.loss(plane, 'landed in the wrong direction.');
    if (atDestination && plane.destType === 'exit')
      return plane.altitude === EXIT_ALTITUDE
        ? 'arrived'
        : this.loss(plane, 'exited at the wrong altitude.');
    return this.stray(plane);
  }

  /** Loss checks for a plane that did not reach its destination. */
  private stray(plane: Plane): GameOver | null {
    // Defensive only: `targetAltitude` never exceeds MAX_ALTITUDE (the grammar
    // takes a single digit and relative climbs are range-checked) and altitude
    // only ever steps toward it, so this cannot currently fire.
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
    if (!inBounds(plane, this.def)) {
      if (
        this.def.exits.some((exit) => exit.x === plane.x && exit.y === plane.y)
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
    return null;
  }

  private commitArrivals(gone: Set<Plane>): void {
    if (!gone.size) return;
    this.safePlanes += gone.size;
    for (let index = this.air.length - 1; index >= 0; index -= 1)
      if (gone.has(this.air[index])) this.air.splice(index, 1);
  }

  private collision(): GameOver | null {
    for (let i = 0; i < this.air.length; i += 1) {
      for (let j = i + 1; j < this.air.length; j += 1) {
        if (tooClose(this.air[i], this.air[j], COLLISION_DISTANCE))
          return this.loss(
            this.air[i],
            `collided with plane '${letterOf(this.air[j])}'.`,
          );
      }
    }
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
  /**
   * Keeps a list sorted by plane id. That is not arrival order, because ids are
   * handed out in a rotation — see DOCS.md §6.2.
   */
  private insert(list: Plane[], plane: Plane): void {
    const index = list.findIndex((other) => other.id > plane.id);
    if (index === -1) list.push(plane);
    else list.splice(index, 0, plane);
  }
  /**
   * Letters are handed out in a rotation rather than reusing the lowest free one, so
   * a freed letter takes a while to reappear. Returns null when all 26 are in use.
   */
  private nextPlaneId(): number | null {
    const used = new Set(
      [...this.air, ...this.ground].map((plane) => plane.id),
    );
    for (let offset = 0; offset < MAX_PLANES; offset += 1) {
      this.lastPlaneId = (this.lastPlaneId + 1) % MAX_PLANES;
      if (!used.has(this.lastPlaneId)) return this.lastPlaneId;
    }
    return null;
  }
}
