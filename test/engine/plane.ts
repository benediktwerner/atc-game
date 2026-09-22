import type { Plane } from '../../src/engine/types';

/** A jet at cruising altitude heading east, for tests that only vary a field or two. */
export const makePlane = (overrides: Partial<Plane> = {}): Plane => ({
  id: 0,
  kind: 'jet',
  status: 'marked',
  origType: 'exit',
  origNo: 0,
  destType: 'exit',
  destNo: 1,
  x: 5,
  y: 4,
  dir: 2,
  heading: { kind: 'fixed', dir: 2 },
  pending: null,
  altitude: 9,
  targetAltitude: 9,
  fuel: 100,
  ...overrides,
});
