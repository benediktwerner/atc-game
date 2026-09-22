import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  lastName,
  loadScores,
  previewScores,
  qualifiesUnderSomeName,
  saveScore,
  type ScoreEntry,
} from '../../src/storage/scores';

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

describe('qualifiesUnderSomeName', () => {
  it('accepts anything while the table has room', () => {
    expect(qualifiesUnderSomeName({ ...entry('', 0) }, table)).toBe(true);
  });

  it('ignores a worse existing entry under the same name', () => {
    // 'ann' already has a better score, but the result is still savable as someone else.
    expect(qualifiesUnderSomeName({ ...entry('', 2) }, table)).toBe(true);
  });

  it('rejects a result beaten by every entry of a full table', () => {
    const full = Array.from({ length: 18 }, (_, index) =>
      entry(`p${index}`, 18 - index),
    );
    expect(qualifiesUnderSomeName({ ...entry('', 0) }, full)).toBe(false);
    expect(qualifiesUnderSomeName({ ...entry('', 2) }, full)).toBe(true);
  });
});

describe('localStorage round-trip', () => {
  const stub = (initial: Record<string, string> = {}): Map<string, string> => {
    const store = new Map(Object.entries(initial));
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    });
    return store;
  };

  afterEach(() => vi.unstubAllGlobals());

  it('returns an empty table when storage is unavailable or corrupt', () => {
    expect(loadScores()).toEqual([]);
    stub({ 'atc.scores.v1': 'not json' });
    expect(loadScores()).toEqual([]);
    stub({ 'atc.scores.v1': '{"nope":true}' });
    expect(loadScores()).toEqual([]);
  });

  it('drops entries that are not well-formed and sorts the rest', () => {
    stub({
      'atc.scores.v1': JSON.stringify([
        entry('low', 1),
        { name: 'broken', level: 'default' },
        null,
        entry('high', 9),
      ]),
    });
    expect(loadScores().map((score) => score.name)).toEqual(['high', 'low']);
  });

  it('migrates entries written before the game/level rename', () => {
    const old = entry('old', 4);
    stub({
      'atc.scores.v1': JSON.stringify([
        {
          name: old.name,
          game: 'Killer',
          planes: old.planes,
          ticks: old.ticks,
          realTimeSec: old.realTimeSec,
          dateISO: old.dateISO,
        },
      ]),
    });
    expect(loadScores()).toEqual([{ ...old, level: 'Killer' }]);
  });

  it('persists a saved score and remembers the name', () => {
    const store = stub();
    expect(saveScore({ ...entry('', 5) }, '  ada  ')).toBe(true);
    expect(loadScores().map((score) => score.name)).toEqual(['ada']);
    expect(lastName()).toBe('ada');
    expect(store.has('atc.scores.v1')).toBe(true);
  });

  it('refuses to save a result that does not improve on the same name', () => {
    stub();
    expect(saveScore({ ...entry('', 5) }, 'ada')).toBe(true);
    expect(saveScore({ ...entry('', 3) }, 'ada')).toBe(false);
    expect(loadScores().map((score) => score.planes)).toEqual([5]);
  });
});
