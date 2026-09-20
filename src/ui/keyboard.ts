const DIRECTION_BY_CODE: Readonly<Record<string, string>> = {
  KeyW: 'w',
  KeyE: 'e',
  KeyD: 'd',
  KeyC: 'c',
  KeyX: 'x',
  KeyZ: 'z',
  KeyA: 'a',
  KeyQ: 'q',
};

export function directionTokenForCode(code: string): string | null {
  return DIRECTION_BY_CODE[code] ?? null;
}
