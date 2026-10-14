// The bass: a part that exists but nobody takes, since the synth already
// carries the bass. See bass.prompt.md.

import type { Interpretation } from '../interpret.ts';
import { atOrAbove } from '../music.ts';
import type { NoteEvent } from '../record.ts';
import { banter, type Played } from './player.ts';

export const LINES = ['I will just wait here.', 'The synth has the bass. Fine. Fine.'];

export function bass(interpretation: Interpretation, bar: number, seed: number): Played {
  const root = atOrAbove(interpretation.key.tonic, 28);
  const fifth = root + 7;
  const events: NoteEvent[] = [0, 3, 6, 10, 12].map((step, i) => ({
    step,
    length: 2,
    pitch: i === 3 ? fifth : root,
    velocity: 100,
    voice: 'bass',
  }));
  return { bars: 1, events, say: banter(LINES, bar, seed, 4) };
}
