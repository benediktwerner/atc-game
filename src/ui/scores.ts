import { NUM_SCORES } from '../engine/game';

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

const compare = (a: ScoreEntry, b: ScoreEntry): number =>
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
export function qualifies(
  candidate: ScoreCandidate,
  name: string,
  scores = loadScores(),
): boolean {
  const entry: ScoreEntry = {
    ...candidate,
    name: name.trim().slice(0, 16),
    dateISO: candidate.dateISO ?? new Date().toISOString(),
  };
  const existing = scores.find(
    (score) => score.name === entry.name && score.level === entry.level,
  );
  if (existing) return compare(entry, existing) < 0;
  return [...scores, entry].sort(compare).indexOf(entry) < NUM_SCORES;
}
export function saveScore(candidate: ScoreCandidate, name: string): boolean {
  const normalized = name.trim().slice(0, 16);
  const scores = loadScores();
  if (!qualifies(candidate, normalized, scores)) return false;
  const entry: ScoreEntry = {
    ...candidate,
    name: normalized,
    dateISO: candidate.dateISO ?? new Date().toISOString(),
  };
  const existing = scores.findIndex(
    (score) => score.name === normalized && score.level === entry.level,
  );
  if (existing >= 0) scores.splice(existing, 1);
  scores.push(entry);
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify(scores.sort(compare).slice(0, NUM_SCORES)),
    );
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
