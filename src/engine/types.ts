export type Dir = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface Point {
  x: number;
  y: number;
}

export interface Exit extends Point {
  dir: Dir;
}

export interface Airport extends Point {
  dir: Dir;
}

export type Beacon = Point;

export interface Line {
  p1: Point;
  p2: Point;
}

export type PlaneKind = 'prop' | 'jet';
export type MarkStatus = 'marked' | 'unmarked' | 'ignored';
export type DestType = 'exit' | 'airport';

export type HeadingCmd =
  | { kind: 'fixed'; dir: Dir }
  | { kind: 'circle'; turn: 'cw' | 'ccw' };

export interface Plane {
  id: number;
  kind: PlaneKind;
  status: MarkStatus;
  origType: DestType;
  origNo: number;
  destType: DestType;
  destNo: number;
  x: number;
  y: number;
  dir: Dir;
  heading: HeadingCmd;
  pending: { heading: HeadingCmd; beacon: number } | null;
  altitude: number;
  newAltitude: number;
  fuel: number;
}
