import Atlantis from './Atlantis.atc?raw';
import Killer from './Killer.atc?raw';
import OHare from './OHare.atc?raw';
import TicTacToe from './Tic-Tac-Toe.atc?raw';
import airports from './airports.atc?raw';
import box from './box.atc?raw';
import crossover from './crossover.atc?raw';
import crosshatch from './crosshatch.atc?raw';
import defaultGame from './default.atc?raw';
import easy from './easy.atc?raw';
import game2 from './game_2.atc?raw';
import game3 from './game_3.atc?raw';
import game4 from './game_4.atc?raw';
import novice from './novice.atc?raw';
import twoCorners from './two-corners.atc?raw';

export interface BuiltinGame {
  name: string;
  source: string;
}

export const BUILTIN_GAMES: BuiltinGame[] = [
  { name: 'default', source: defaultGame },
  { name: 'easy', source: easy },
  { name: 'crossover', source: crossover },
  { name: 'Killer', source: Killer },
  { name: 'game_2', source: game2 },
  { name: 'Atlantis', source: Atlantis },
  { name: 'OHare', source: OHare },
  { name: 'Tic-Tac-Toe', source: TicTacToe },
  { name: 'airports', source: airports },
  { name: 'box', source: box },
  { name: 'crosshatch', source: crosshatch },
  { name: 'game_3', source: game3 },
  { name: 'game_4', source: game4 },
  { name: 'novice', source: novice },
  { name: 'two-corners', source: twoCorners },
];
