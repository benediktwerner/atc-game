import { describe, expect, it } from 'vitest';
import { formatPlaneLine, timestr } from '../src/engine/format';
import type { Plane } from '../src/engine/types';

describe('formatPlaneLine', () => {
  it('uses the prefix separator for an altitude target without a heading', () => {
    const plane: Plane = {
      id: 0,
      kind: 'prop',
      status: 'marked',
      origType: 'exit',
      origNo: 0,
      destType: 'exit',
      destNo: 0,
      x: 1,
      y: 1,
      dir: 2,
      heading: { kind: 'fixed', dir: 2 },
      pending: null,
      altitude: 7,
      targetAltitude: 8,
      fuel: 20,
    };

    expect(formatPlaneLine(plane)).toBe('A7 E0: ↑8');
  });
});

describe('timestr', () => {
  it('always shows a minute field below one hour', () => {
    expect(timestr(0)).toBe('0:00');
    expect(timestr(27)).toBe('0:27');
    expect(timestr(60)).toBe('1:00');
    expect(timestr(605)).toBe('10:05');
  });

  it('adds fields for longer durations', () => {
    expect(timestr(3600)).toBe('1:00:00');
    expect(timestr(3725)).toBe('1:02:05');
    expect(timestr(90000)).toBe('1d+01hrs');
  });
});
