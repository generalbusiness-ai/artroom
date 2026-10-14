// The live clock's side of the band: as time passes, record what the band
// owes and say which bars are now close enough to be scheduled for sound.

import { createBand, mood, sing, tick, type Band, type Phrase } from '../src/band.ts';
import { barStart, effectBarAt } from '../src/record.ts';

export interface Live {
  band: Band;
  nextBar: number; // the next bar whose sound has not been scheduled
}

export function createLive(): Live {
  return { band: createBand(), nextBar: 0 };
}

// The person sings at `now`. Returns the bar it takes effect from.
export function singNow(live: Live, now: number, phrase: Phrase): number {
  const effectBar = effectBarAt(live.band.log, now, live.band.rules);
  sing(live.band, now, phrase);
  return effectBar;
}

// Someone in the room says a mood at `now`. Returns the bar it takes effect from.
export function moodNow(live: Live, now: number, text: string): number {
  const effectBar = effectBarAt(live.band.log, now, live.band.rules);
  mood(live.band, now, text);
  return effectBar;
}

// Called often. When the next bar is less than `ahead` seconds away, the band
// records what it owes and the bar is returned for scheduling.
export function advance(live: Live, now: number, ahead: number): number[] {
  const { log, rules } = live.band;
  const bars: number[] = [];
  while (barStart(log, live.nextBar, rules) - now < ahead) {
    tick(live.band, now);
    bars.push(live.nextBar++);
  }
  return bars;
}
