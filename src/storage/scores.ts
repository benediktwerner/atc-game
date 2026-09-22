export interface ScoreEntry {
  name: string;
  level: string;
  planes: number;
  ticks: number;
  realTimeSec: number;
  dateISO: string;
}

export interface ScoreCandidate extends Omit<ScoreEntry, 'name' | 'dateISO'> {
  dateISO?: string;
}
const KEY = 'atc.scores.v1';
const NAME_KEY = 'atc.lastName.v1';

/** High-score table size. */
export const NUM_SCORES = 18;

/** The fields a result is ranked by; a candidate has them before it has a name. */
type Rankable = Pick<ScoreEntry, 'planes' | 'ticks' | 'realTimeSec'>;

const compare = (a: Rankable, b: Rankable): number =>
  b.planes - a.planes || b.ticks - a.ticks || a.realTimeSec - b.realTimeSec;

export function loadScores(): ScoreEntry[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.map(migrate).filter(valid).sort(compare).slice(0, NUM_SCORES);
  } catch {
    return [];
  }
}
/** Entries written before levels were renamed stored the level as `game`. */
function migrate(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value;
  const entry = value as Record<string, unknown>;
  if (entry.level === undefined && typeof entry.game === 'string') {
    const { game, ...rest } = entry;
    return { ...rest, level: game };
  }
  return value;
}

function valid(value: unknown): value is ScoreEntry {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ScoreEntry).name === 'string' &&
    typeof (value as ScoreEntry).level === 'string' &&
    typeof (value as ScoreEntry).planes === 'number' &&
    typeof (value as ScoreEntry).ticks === 'number' &&
    typeof (value as ScoreEntry).realTimeSec === 'number' &&
    typeof (value as ScoreEntry).dateISO === 'string'
  );
}

export interface ScorePreview {
  /** The table as it would look with the candidate included. */
  scores: ScoreEntry[];
  /** Position of the candidate in `scores`, or -1 if it does not make the table. */
  index: number;
}

function toEntry(candidate: ScoreCandidate, name: string): ScoreEntry {
  return {
    ...candidate,
    name: normalizeName(name),
    dateISO: candidate.dateISO ?? new Date().toISOString(),
  };
}

function normalizeName(name: string): string {
  return name.trim().slice(0, 16);
}

/**
 * Project the candidate into the table without persisting it, so the score screen
 * can show where a pending entry would land.
 */
export function previewScores(
  candidate: ScoreCandidate,
  name: string,
  scores = loadScores(),
): ScorePreview {
  const entry = toEntry(candidate, name);
  const others = [...scores];
  const existing = others.findIndex(
    (score) => score.name === entry.name && score.level === entry.level,
  );
  if (existing >= 0) {
    if (compare(entry, others[existing]) >= 0) return { scores, index: -1 };
    others.splice(existing, 1);
  }
  const table = [...others, entry].sort(compare).slice(0, NUM_SCORES);
  return { scores: table, index: table.indexOf(entry) };
}

/**
 * Whether the result could be saved under *some* name. The table holds one entry per
 * name+level, so a fresh name is always available; this therefore only fails when the
 * table is full and every entry in it already beats the candidate.
 */
export function qualifiesUnderSomeName(
  candidate: ScoreCandidate,
  scores = loadScores(),
): boolean {
  if (scores.length < NUM_SCORES) return true;
  return scores.some((score) => compare(candidate, score) < 0);
}

export function saveScore(candidate: ScoreCandidate, name: string): boolean {
  const normalized = normalizeName(name);
  const { scores, index } = previewScores(candidate, normalized);
  if (index < 0) return false;
  try {
    localStorage.setItem(KEY, JSON.stringify(scores));
    localStorage.setItem(NAME_KEY, normalized);
  } catch {
    return false;
  }
  return true;
}

export function lastName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}
