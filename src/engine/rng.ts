export type Rng = () => number;

/** Uniform integer in [0, n). Mirrors the original's `rand() % n`. */
export function randInt(rng: Rng, n: number): number {
  return Math.floor(rng() * n);
}
