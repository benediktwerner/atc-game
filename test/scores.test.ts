import { describe, expect, it } from 'vitest';
import { previewScores, type ScoreEntry } from '../src/ui/scores';

const entry = (
  name: string,
  planes: number,
  ticks = 100,
  realTimeSec = 60,
): ScoreEntry => ({
  name,
  level: 'default',
  planes,
  ticks,
  realTimeSec,
  dateISO: '2024-01-01T00:00:00.000Z',
});

const table = [entry('ann', 9), entry('bob', 5), entry('cyd', 1)];

describe('previewScores', () => {
  it('reports where a new score would land', () => {
    const preview = previewScores({ ...entry('', 7) }, 'dee', table);
    expect(preview.index).toBe(1);
    expect(preview.scores.map((score) => score.name)).toEqual([
      'ann',
      'dee',
      'bob',
      'cyd',
    ]);
  });

  it('replaces the previous entry for the same name and level', () => {
    const preview = previewScores({ ...entry('', 7) }, 'cyd', table);
    expect(preview.index).toBe(1);
    expect(preview.scores.map((score) => score.name)).toEqual([
      'ann',
      'cyd',
      'bob',
    ]);
  });

  it('rejects a score worse than the existing one for that name', () => {
    const preview = previewScores({ ...entry('', 2) }, 'ann', table);
    expect(preview.index).toBe(-1);
    expect(preview.scores).toEqual(table);
  });

  it('drops entries beyond the table size', () => {
    const full = Array.from({ length: 18 }, (_, index) =>
      entry(`p${index}`, 18 - index),
    );
    expect(previewScores({ ...entry('', 0) }, 'late', full).index).toBe(-1);
    expect(previewScores({ ...entry('', 19) }, 'best', full).index).toBe(0);
  });
});
