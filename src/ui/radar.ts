import { letterOf } from '../engine/dir';
import type { Game } from '../engine/game';
import type { GameDef } from '../engine/types';

export function staticRadar(def: GameDef): string[][] {
  const rows = Array.from({ length: def.height }, () =>
    Array<string>(def.width * 2).fill(' '),
  );
  for (let y = 1; y < def.height - 1; y += 1)
    for (let x = 1; x < def.width - 1; x += 1) rows[y][x * 2] = '.';
  for (const line of def.lines) {
    const dx = Math.sign(line.p2.x - line.p1.x),
      dy = Math.sign(line.p2.y - line.p1.y);
    for (let x = line.p1.x, y = line.p1.y; ; x += dx, y += dy) {
      rows[y][x * 2] = '+';
      rows[y][x * 2 + 1] = ' ';
      if (x === line.p2.x && y === line.p2.y) break;
    }
  }
  for (const y of [0, def.height - 1])
    for (let x = 0; x < def.width * 2 - 1; x += 1) rows[y][x] = '-';
  for (let y = 1; y < def.height - 1; y += 1) {
    rows[y][0] = '|';
    rows[y][(def.width - 1) * 2] = '|';
  }
  def.beacons.forEach((point, index) => {
    rows[point.y][point.x * 2] = '*';
    rows[point.y][point.x * 2 + 1] = String(index);
  });
  def.exits.forEach((point, index) => {
    rows[point.y][point.x * 2] = String(index);
  });
  const airportGlyphs = '^?>?v?<?';
  def.airports.forEach((point, index) => {
    rows[point.y][point.x * 2] = airportGlyphs[point.dir];
    rows[point.y][point.x * 2 + 1] = String(index);
  });
  return rows;
}

export class Radar {
  private readonly cells: HTMLSpanElement[][] = [];
  private readonly base: string[][];
  constructor(
    private readonly root: HTMLElement,
    def: GameDef,
  ) {
    this.base = staticRadar(def);
    this.root.className = 'radar';
    this.base.forEach((row) => {
      const line = document.createElement('div');
      const spans = row.map(() => {
        const span = document.createElement('span');
        line.append(span);
        return span;
      });
      this.cells.push(spans);
      this.root.append(line);
    });
  }
  render(game: Game): void {
    const chars = this.base.map((row) => [...row]);
    const classes = this.base.map((row) => row.map(() => ''));
    for (const plane of game.air) {
      chars[plane.y][plane.x * 2] = letterOf(plane);
      chars[plane.y][plane.x * 2 + 1] = String(plane.altitude);
      if (plane.status === 'marked') {
        classes[plane.y][plane.x * 2] = 'marked';
        classes[plane.y][plane.x * 2 + 1] = 'marked-altitude';
      }
    }
    chars.forEach((row, y) =>
      row.forEach((value, x) => {
        this.cells[y][x].textContent = value;
        this.cells[y][x].className = classes[y][x];
      }),
    );
  }
}
