import { describe, expect, it } from 'vitest';
import { formatTime } from '../../src/ui/format';

describe('timestr', () => {
  it('always shows a minute field below one hour', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(27)).toBe('0:27');
    expect(formatTime(60)).toBe('1:00');
    expect(formatTime(605)).toBe('10:05');
  });

  it('adds fields for longer durations', () => {
    expect(formatTime(3600)).toBe('1:00:00');
    expect(formatTime(3725)).toBe('1:02:05');
    expect(formatTime(90000)).toBe('1d+01hrs');
  });
});
