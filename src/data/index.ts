import Atlantis from './Atlantis.atc?raw';
import Killer from './Killer.atc?raw';
import OHare from './OHare.atc?raw';
import TicTacToe from './Tic-Tac-Toe.atc?raw';
import airports from './airports.atc?raw';
import box from './box.atc?raw';
import crossover from './crossover.atc?raw';
import crosshatch from './crosshatch.atc?raw';
import defaultLevel from './default.atc?raw';
import easy from './easy.atc?raw';
import level2 from './game_2.atc?raw';
import level3 from './game_3.atc?raw';
import level4 from './game_4.atc?raw';
import novice from './novice.atc?raw';
import twoCorners from './two-corners.atc?raw';

export interface BuiltinLevel {
  name: string;
  source: string;
}

export const BUILTIN_LEVELS: BuiltinLevel[] = [
  { name: 'default', source: defaultLevel },
  { name: 'easy', source: easy },
  { name: 'crossover', source: crossover },
  { name: 'Killer', source: Killer },
  { name: 'game_2', source: level2 },
  { name: 'Atlantis', source: Atlantis },
  { name: 'OHare', source: OHare },
  { name: 'Tic-Tac-Toe', source: TicTacToe },
  { name: 'airports', source: airports },
  { name: 'box', source: box },
  { name: 'crosshatch', source: crosshatch },
  { name: 'game_3', source: level3 },
  { name: 'game_4', source: level4 },
  { name: 'novice', source: novice },
  { name: 'two-corners', source: twoCorners },
];
