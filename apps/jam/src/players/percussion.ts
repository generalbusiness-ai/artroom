// Percussion: the floor, hats, claps and a fill. See percussion.prompt.md.

import type { Interpretation } from '../interpret.ts';
import { NEUTRAL, type Style } from '../mood.ts';
import { random } from '../music.ts';
import type { NoteEvent } from '../record.ts';
import { banter, type Played } from './player.ts';

// General MIDI drum numbers.
export const KICK = 36;
export const CLAP = 39;
export const CLOSED_HAT = 42;
export const OPEN_HAT = 46;
export const LOW_TOM = 45;
export const MID_TOM = 47;
export const HIGH_TOM = 50;

export const LINES = [
  'Did someone say floor?',
  'Four on the floor, as the law requires.',
  'Fill incoming. Sorry in advance.',
  'I only know one beat and this is it.',
  'Clap on two and four. I read the manual.',
  'Copying your rhythm. Badly, but with feeling.',
];

function hit(step: number, pitch: number, velocity: number, voice: string): NoteEvent {
  return { step, length: 1, pitch, velocity, voice };
}

export function percussion(interpretation: Interpretation, bar: number, seed: number, style: Style = NEUTRAL): Played {
  const events: NoteEvent[] = [];
  const fill = bar % 8 === 7;
  const train = style.percussion === 'train';

  for (const s of train ? [0, 8] : [0, 4, 8, 12]) events.push(hit(s, KICK, train ? 100 : style.percussion === 'drive' ? 124 : 120, 'kick'));
  for (const s of [4, 12]) events.push(hit(s, CLAP, train ? 70 : 100, 'clap'));

  if (style.percussion === 'drive') {
    // Driving: a closed hat on every sixteenth, an open hat on each off-beat.
    for (let s = 0; s < 16; s++) {
      if (s % 4 === 2) events.push(hit(s, OPEN_HAT, 92, 'openhat'));
      else events.push(hit(s, CLOSED_HAT, s % 2 ? 56 : 76, 'hat'));
    }
  } else if (train) {
    // A train beat: hats on the eighths, accented off the beat, only off the
    // beat when the mood is sparse.
    for (let s = 0; s < 16; s += 2) {
      if (s % 4 === 2 || style.density >= 1) events.push(hit(s, CLOSED_HAT, s % 4 === 2 ? 72 : 52, 'hat'));
    }
  }
  if (style.percussion !== 'floor') {
    // The sung rhythm's low onsets on the low tom, over the mood's beat.
    const k = interpretation.rhythmBars ? bar % interpretation.rhythmBars : 0;
    for (const h of interpretation.rhythm) {
      if (Math.floor(h.step / 16) === k && h.cls === 'low' && !(fill && h.step % 16 >= 12)) {
        events.push(hit(h.step % 16, LOW_TOM, train ? 80 : 104, 'tom'));
      }
    }
  } else if (interpretation.rhythm.length > 0) {
    // Follow the sung rhythm: high onsets on the hats, low ones on the low tom.
    const k = bar % interpretation.rhythmBars;
    for (const h of interpretation.rhythm) {
      if (Math.floor(h.step / 16) !== k) continue;
      const s = h.step % 16;
      if (fill && s >= 12) continue;
      if (h.cls === 'high') events.push(hit(s, CLOSED_HAT, 96, 'hat'));
      else events.push(hit(s, LOW_TOM, 104, 'tom'));
    }
  } else {
    for (const s of [2, 6, 10, 14]) {
      const open = s === 14 && bar % 2 === 1;
      events.push(hit(s, open ? OPEN_HAT : CLOSED_HAT, 96, open ? 'openhat' : 'hat'));
    }
    if (bar >= 2) for (let s = 1; s < 16; s += 2) events.push(hit(s, CLOSED_HAT, 48, 'hat'));
  }

  if (fill) {
    // The last beat of every eighth bar rolls down the toms.
    const r = random(seed, 2, bar);
    const toms = r() < 0.5 ? [HIGH_TOM, HIGH_TOM, MID_TOM, LOW_TOM] : [HIGH_TOM, MID_TOM, MID_TOM, LOW_TOM];
    if (train) [MID_TOM, LOW_TOM].forEach((pitch, i) => events.push(hit(12 + 2 * i, pitch, 76, 'tom')));
    else toms.forEach((pitch, i) => events.push(hit(12 + i, pitch, 90 + i * 8, 'tom')));
  }

  const say = interpretation.rhythm.length > 0 && bar % 4 === 0 && bar > 0 ? LINES[5] : banter(LINES.slice(0, 5), bar, seed, 2);
  return { bars: 1, events, say };
}
