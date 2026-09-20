import type { Airport, Beacon, Exit, Line } from './types';

export interface GameDef {
  name: string;
  updateSecs: number;
  newplane: number;
  width: number;
  height: number;
  exits: Exit[];
  beacons: Beacon[];
  airports: Airport[];
  lines: Line[];
}
