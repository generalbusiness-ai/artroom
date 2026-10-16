// The band as it writes to the record. A sing is recorded with the synth's
// interpretation of it. A mood is recorded as said; the players read it. At each bar boundary the band records the takes that
// are due and each taken part's next pattern, so that the patterns take
// effect, by the timing rule, from the next bar the rule allows.

import { interpretRhythm, interpretTune, type HummedNote, type Interpretation, type Onset } from './interpret.ts';
import { inMood } from './mood.ts';
import { PLAYERS, ARRIVAL_ORDER } from './players/index.ts';
import { feel } from './players/player.ts';
import {
  activeAt,
  createLog,
  DEFAULT_RULES,
  effectBarAt,
  record,
  schedule,
  type Log,
  type Part,
  type Rules,
} from './record.ts';

export type Phrase = { kind: 'tune'; notes: HummedNote[] } | { kind: 'rhythm'; onsets: Onset[] };

export interface Band {
  log: Log;
  rules: Rules;
  seed: number;
  arrivalEvery: number; // bars between one agent's arrival and the next
  arrivals: Partial<Record<Part, number>>; // the bar each part is due to be taken
  coveredUntil: Partial<Record<Part, number>>; // first bar the part's patterns do not cover
  ownBar: Partial<Record<Part, number>>; // the player's own bar count
}

export interface BandOptions {
  rules?: Rules;
  seed?: number;
  arrivalEvery?: number;
}

export function createBand(options: BandOptions = {}): Band {
  return {
    log: createLog(),
    rules: options.rules ?? DEFAULT_RULES,
    seed: options.seed ?? 1,
    arrivalEvery: options.arrivalEvery ?? 8,
    arrivals: {},
    coveredUntil: {},
    ownBar: {},
  };
}

function latestInterpretation(log: Log): Interpretation | undefined {
  for (let i = log.entries.length - 1; i >= 0; i--) {
    const e = log.entries[i];
    if (e.type === 'interpret') return e.interpretation;
  }
  return undefined;
}

function taken(log: Log, part: Part): boolean {
  return log.entries.some((e) => e.type === 'take' && e.part === part);
}

// The person sings. The synth interprets at once. The first sing also brings
// the synth in and sets when the others will arrive.
export function sing(band: Band, time: number, phrase: Phrase): void {
  const { log } = band;
  const s =
    phrase.kind === 'tune'
      ? record(log, { type: 'sing', by: 'person', time, kind: 'tune', notes: phrase.notes })
      : record(log, { type: 'sing', by: 'person', time, kind: 'rhythm', onsets: phrase.onsets });
  const interpretation =
    phrase.kind === 'tune' ? interpretTune(phrase.notes) : interpretRhythm(phrase.onsets, latestInterpretation(log));
  record(log, { type: 'interpret', by: 'synth', time, sing: s.seq, interpretation });
  if (band.arrivals.synth === undefined) {
    const first = schedule(log, band.rules).entries.at(-1)!.effectBar;
    ARRIVAL_ORDER.forEach((part, i) => (band.arrivals[part] = first + i * band.arrivalEvery));
  }
}

// Anyone in the room says a mood phrase. It takes effect by the timing rule;
// the players read it from the bar it takes effect.
export function mood(band: Band, time: number, text: string, by = 'person'): void {
  record(band.log, { type: 'mood', by, time, text });
}

// Called at, or a little before, each bar boundary.
export function tick(band: Band, time: number): void {
  const { log, rules } = band;
  for (const part of ARRIVAL_ORDER) {
    const due = band.arrivals[part];
    if (due === undefined || taken(log, part)) continue;
    if (due <= effectBarAt(log, time, rules)) {
      record(log, { type: 'take', by: part, time, part });
      band.coveredUntil[part] = 0;
      band.ownBar[part] = 0;
    }
  }
  for (const part of ARRIVAL_ORDER) {
    if (!taken(log, part)) continue;
    const effect = effectBarAt(log, time, rules);
    if (band.coveredUntil[part]! > effect) continue;
    const active = activeAt(log, effect, rules);
    const interpret = active.interpretation;
    if (!interpret) continue;
    const { style } = active;
    const played = PLAYERS[part](inMood(interpret.interpretation, style), band.ownBar[part]!, band.seed, style);
    record(log, {
      type: 'pattern',
      by: part,
      time,
      part,
      bars: played.bars,
      follows: interpret.seq,
      events: feel(played.events, style),
    });
    band.coveredUntil[part] = effect + played.bars;
    band.ownBar[part] = band.ownBar[part]! + played.bars;
    if (played.say) record(log, { type: 'say', by: part, time, text: played.say });
  }
}
