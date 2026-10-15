// What the stage shows at a moment: pure functions of the record and the
// time, so they can be tested without a browser.

import { inMood, moodCaption } from '../src/mood.ts';
import { activeAt, positionAt, schedule, DEFAULT_RULES, type Log, type Part, type Rules } from '../src/record.ts';

export interface Caption {
  by: string;
  text: string;
}

export interface Pending {
  kind: 'tune' | 'rhythm';
  effectBar: number;
}

export interface Stage {
  bar: number;
  beat: number; // 0 to 3
  nod: number; // 1 on the beat, falling to 0 before the next
  tempo: number;
  key?: string;
  mood?: string; // the latest mood phrase in effect
  arrived: Record<Part, boolean>;
  captions: Caption[];
  pending: Pending[];
  // The latest person's entry whose effect bar has actually arrived.
  effected?: { seq: number; effectBar: number };
}

// How many bars a line of banter stays up.
export const CAPTION_BARS = 3;

export function stageAt(log: Log, time: number, rules: Rules = DEFAULT_RULES): Stage {
  const position = Math.max(0, positionAt(log, time, rules));
  const bar = Math.floor(position);
  const beats = (position - bar) * rules.beatsPerBar;
  const beat = Math.floor(beats);
  const active = activeAt(log, bar, rules);
  const arrived = { synth: false, percussion: false, lead: false, bass: false };
  for (const part of Object.keys(active.parts) as Part[]) arrived[part] = true;

  const captions: Caption[] = [];
  const pending: Pending[] = [];
  let effected: Stage['effected'];
  for (const { entry, effectBar } of schedule(log, rules).entries) {
    if (entry.type === 'say' && effectBar <= bar && effectBar > bar - CAPTION_BARS) {
      captions.push({ by: entry.by, text: entry.text });
    }
    // A mood shows from its effect bar, with any fallback.
    if (entry.type === 'mood' && effectBar <= bar && effectBar > bar - CAPTION_BARS) {
      captions.push({ by: 'the room says', text: moodCaption(entry.text) });
    }
    if ((entry.type === 'sing' || entry.type === 'mood') && effectBar <= bar) {
      effected = { seq: entry.seq, effectBar };
    }
    if (entry.type === 'sing' && effectBar > bar) pending.push({ kind: entry.kind, effectBar });
  }
  return {
    bar,
    beat,
    nod: (1 - (beats - beat)) ** 3,
    tempo: active.tempo,
    key: active.interpretation && inMood(active.interpretation.interpretation, active.style).key.name,
    mood: active.mood?.text,
    arrived,
    captions: captions.slice(-3),
    pending,
    effected,
  };
}
