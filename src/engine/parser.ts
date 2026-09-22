import { dirFromKey } from './dir';
import type {
  Airport,
  Beacon,
  CardinalDir,
  Dir,
  Exit,
  LevelDef,
  Line,
  Point,
} from './types';

type Keyword =
  | 'height'
  | 'width'
  | 'newplane'
  | 'update'
  | 'airport'
  | 'line'
  | 'exit'
  | 'beacon';
type TokenKind = Keyword | 'integer' | 'direction' | 'punctuation' | 'eof';

interface Token {
  kind: TokenKind;
  value: string;
  line: number;
}

const KEYWORDS: readonly Keyword[] = [
  'height',
  'width',
  'newplane',
  'update',
  'airport',
  'line',
  'exit',
  'beacon',
];

/**
 * Exits, beacons and airports are addressed by a single digit in the command grammar,
 * so a level may not define more than ten of any of them.
 */
const MAX_ENTRIES = 10;

class Lexer {
  private offset = 0;
  private line = 1;

  constructor(private readonly source: string) {}

  next(): Token {
    this.skipWhitespaceAndComments();
    const line = this.line;
    if (this.offset >= this.source.length)
      return { kind: 'eof', value: '', line };

    const char = this.source[this.offset];
    if (char >= '0' && char <= '9') {
      const start = this.offset++;
      while (this.isDigit(this.source[this.offset])) this.offset++;
      return {
        kind: 'integer',
        value: this.source.slice(start, this.offset),
        line,
      };
    }

    if (this.isLetter(char)) {
      // A keyword only counts when it is a whole word, so `widthx` is not `width`.
      const keyword = KEYWORDS.find(
        (candidate) =>
          this.source.startsWith(candidate, this.offset) &&
          !this.isLetter(this.source[this.offset + candidate.length]),
      );
      if (keyword !== undefined) {
        this.offset += keyword.length;
        return { kind: keyword, value: keyword, line };
      }
      this.offset++;
      if (dirFromKey(char) !== null)
        return { kind: 'direction', value: char, line };
      return { kind: 'punctuation', value: char, line };
    }

    this.offset++;
    return { kind: 'punctuation', value: char, line };
  }

  private skipWhitespaceAndComments(): void {
    while (this.offset < this.source.length) {
      const char = this.source[this.offset];
      if (char === ' ' || char === '\t' || char === '\r') {
        this.offset++;
      } else if (char === '\n') {
        this.offset++;
        this.line++;
      } else if (char === '#') {
        while (
          this.offset < this.source.length &&
          this.source[this.offset] !== '\n'
        )
          this.offset++;
      } else {
        return;
      }
    }
  }

  private isDigit(char: string | undefined): boolean {
    return char !== undefined && char >= '0' && char <= '9';
  }

  private isLetter(char: string | undefined): boolean {
    return (
      char !== undefined &&
      ((char >= 'A' && char <= 'Z') || (char >= 'a' && char <= 'z'))
    );
  }
}

class LevelParser {
  private readonly lexer: Lexer;
  private current: Token;
  private readonly errors: string[] = [];
  private readonly reportedLimits = new Set<string>();
  private readonly values: Partial<
    Record<'height' | 'width' | 'newplane' | 'update', number>
  > = {};
  private readonly defined = new Set<
    'height' | 'width' | 'newplane' | 'update'
  >();
  private readonly exits: Exit[] = [];
  private readonly beacons: Beacon[] = [];
  private readonly airports: Airport[] = [];
  private readonly lines: Line[] = [];

  constructor(
    source: string,
    private readonly name: string,
  ) {
    this.lexer = new Lexer(source);
    this.current = this.lexer.next();
  }

  parse(): LevelDef {
    while (this.isDefinition(this.current.kind)) this.parseDefinition();
    this.validateDefinitions();

    while (this.current.kind !== 'eof') this.parseSection();
    if (this.exits.length + this.airports.length < 2) {
      this.error(this.current.line, 'Need at least 2 airports and/or exits.');
    }

    if (this.errors.length > 0) throw new Error(this.errors.join('\n'));
    return {
      name: this.name,
      updateSecs: this.values.update as number,
      newplane: this.values.newplane as number,
      width: this.values.width as number,
      height: this.values.height as number,
      exits: this.exits,
      beacons: this.beacons,
      airports: this.airports,
      lines: this.lines,
    };
  }

  private parseDefinition(): void {
    const key = this.current.kind as 'height' | 'width' | 'newplane' | 'update';
    const line = this.current.line;
    this.advance();
    this.expect('=');
    const value = this.integer();
    this.expect(';');

    if (this.defined.has(key)) {
      this.error(line, `Redefinition of '${key}'.`);
      return;
    }
    this.defined.add(key);
    const minimum = key === 'height' || key === 'width' ? 3 : 1;
    if (value < minimum) {
      this.error(line, `'${key}' is too small.`);
      return;
    }
    this.values[key] = value;
  }

  private validateDefinitions(): void {
    for (const key of ['width', 'height', 'update', 'newplane'] as const) {
      if (!this.defined.has(key))
        this.error(this.current.line, `'${key}' undefined.`);
    }
  }

  private parseSection(): void {
    const section = this.current.kind;
    if (
      section !== 'beacon' &&
      section !== 'exit' &&
      section !== 'airport' &&
      section !== 'line'
    ) {
      this.syntax(
        `expected a game section, found ${this.describe(this.current)}`,
      );
    }
    this.advance();
    this.expect(':');

    let entries = 0;
    while (this.current.value !== ';') {
      if (this.current.kind === 'eof')
        this.syntax('expected `;` before end of file');
      entries++;
      if (section === 'beacon') this.parseBeacon();
      else if (section === 'exit') this.parseExit();
      else if (section === 'airport') this.parseAirport();
      else this.parseLine();
    }
    if (entries === 0) this.syntax('expected a section entry');
    this.advance();
  }

  private parseBeacon(): void {
    const line = this.current.line;
    const point = this.point();
    this.validateInteriorPoint(point, line);
    this.addLimited(this.beacons, point, 'beacons', line);
  }

  private parseExit(): void {
    const line = this.current.line;
    this.expect('(');
    const x = this.integer();
    const y = this.integer();
    const dir = this.direction();
    this.expect(')');
    const exit = { x, y, dir };
    this.validateExit(exit, line);
    this.addLimited(this.exits, exit, 'exits', line);
  }

  private parseAirport(): void {
    const line = this.current.line;
    this.expect('(');
    const x = this.integer();
    const y = this.integer();
    const dir = this.direction();
    this.expect(')');
    const airport = { x, y, dir: this.cardinal(dir, line) };
    this.validateInteriorPoint(airport, line);
    this.addLimited(this.airports, airport, 'airports', line);
  }

  private parseLine(): void {
    const line = this.current.line;
    this.expect('[');
    const p1 = this.point();
    const p2 = this.point();
    this.expect(']');
    this.validateLine(p1, p2, line);
    this.lines.push({ p1, p2 });
  }

  private point(): Point {
    this.expect('(');
    const x = this.integer();
    const y = this.integer();
    this.expect(')');
    return { x, y };
  }

  private integer(): number {
    if (this.current.kind !== 'integer')
      this.syntax(`expected an integer, found ${this.describe(this.current)}`);
    const value = Number(this.current.value);
    this.advance();
    return value;
  }

  private direction(): Dir {
    if (this.current.kind !== 'direction')
      this.syntax(`expected a direction, found ${this.describe(this.current)}`);
    const direction = dirFromKey(this.current.value);
    if (direction === null)
      this.syntax(`expected a direction, found ${this.describe(this.current)}`);
    this.advance();
    return direction;
  }

  /**
   * Runways may only face north, south, east or west: the radar draws them with a
   * single arrow glyph, and a diagonal runway has none. The substituted value is
   * never observed, because a recorded error stops `parse` from returning a level.
   */
  private cardinal(dir: Dir, line: number): CardinalDir {
    if (dir % 2 !== 0) {
      this.error(line, 'Bad direction for airport.');
      return 0;
    }
    return dir as CardinalDir;
  }

  private validateInteriorPoint(point: Point, line: number): void {
    if (point.x < 1 || point.x >= (this.values.width ?? 0) - 1)
      this.error(line, 'X value out of range.');
    if (point.y < 1 || point.y >= (this.values.height ?? 0) - 1)
      this.error(line, 'Y value out of range.');
  }

  private validateExit(exit: Exit, line: number): void {
    const width = this.values.width ?? 0;
    const height = this.values.height ?? 0;
    if (
      exit.x !== 0 &&
      exit.x !== width - 1 &&
      exit.y !== 0 &&
      exit.y !== height - 1
    ) {
      this.error(line, 'edge value not on edge.');
    }

    const x = exit.x === 0 ? 0 : exit.x === width - 1 ? 2 : 1;
    const y = exit.y === 0 ? 0 : exit.y === height - 1 ? 2 : 1;
    const valid =
      (x === 0 && y === 0 && exit.dir === 3) ||
      (x === 0 && y === 1 && exit.dir >= 1 && exit.dir <= 3) ||
      (x === 0 && y === 2 && exit.dir === 1) ||
      (x === 1 && y === 0 && exit.dir >= 3 && exit.dir <= 5) ||
      (x === 1 && y === 1) ||
      (x === 1 && y === 2 && (exit.dir <= 1 || exit.dir >= 7)) ||
      (x === 2 && y === 0 && exit.dir === 5) ||
      (x === 2 && y === 1 && exit.dir >= 5) ||
      (x === 2 && y === 2 && exit.dir === 7);
    if (!valid) this.error(line, 'Bad direction for entrance at exit.');
  }

  private validateLine(p1: Point, p2: Point, line: number): void {
    this.validateLinePoint(p1, line);
    this.validateLinePoint(p2, line);
    const dx = Math.abs(p2.x - p1.x);
    const dy = Math.abs(p2.y - p1.y);
    if (dx !== dy && dx !== 0 && dy !== 0)
      this.error(line, 'Bad line endpoints.');
  }

  private validateLinePoint(point: Point, line: number): void {
    if (point.x < 0 || point.x >= (this.values.width ?? 0))
      this.error(line, 'X value out of range.');
    if (point.y < 0 || point.y >= (this.values.height ?? 0))
      this.error(line, 'Y value out of range.');
  }

  private addLimited<T>(
    items: T[],
    item: T,
    label: 'exits' | 'beacons' | 'airports',
    line: number,
  ): void {
    if (items.length >= MAX_ENTRIES) {
      // Report once per section, then drop the extras so the parsed level never
      // carries unaddressable entries even if a caller ignores the thrown errors.
      if (!this.reportedLimits.has(label)) {
        this.reportedLimits.add(label);
        this.error(line, `Too many ${label} (max ${MAX_ENTRIES}).`);
      }
      return;
    }
    items.push(item);
  }

  private expect(value: string): void {
    if (this.current.value !== value)
      this.syntax(
        `expected \`${value}\`, found ${this.describe(this.current)}`,
      );
    this.advance();
  }

  private advance(): void {
    this.current = this.lexer.next();
  }

  private isDefinition(
    kind: TokenKind,
  ): kind is 'height' | 'width' | 'newplane' | 'update' {
    return (
      kind === 'height' ||
      kind === 'width' ||
      kind === 'newplane' ||
      kind === 'update'
    );
  }

  private describe(token: Token): string {
    return token.kind === 'eof' ? 'end of file' : `\`${token.value}\``;
  }

  private error(line: number, message: string): void {
    this.errors.push(`"${this.name}": line ${line}: ${message}`);
  }

  private syntax(message: string): never {
    throw new Error(`"${this.name}": line ${this.current.line}: ${message}`);
  }
}

/**
 * Parse one ATC level. Validation failures are reported together in the same
 * `"<name>": line <n>: <message>` format as the original game parser.
 */
export function parseLevel(source: string, name = '<input>'): LevelDef {
  return new LevelParser(source, name).parse();
}
