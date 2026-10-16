// The record: an in-memory log of entries, and the timing rule as pure
// functions over it.
//
// The timing rule. A change is recorded at once and is active from its own
// effect bar: the first bar boundary at least one lookahead after it was
// recorded. Every effect bar is computed with what is active at the entry's
// time. An entry's effect bar is never before the effect bar of the entry
// before it.
//
// Bars are counted from 0, which starts at time 0. Times are seconds since the
// session began. The lookahead is in bars.

import type { HummedNote, Interpretation, Onset } from './interpret.ts';
import { readMood, styleOf, type Style } from './mood.ts';

export type Part = 'synth' | 'percussion' | 'lead' | 'bass';

// One note of a pattern, on the sixteenth grid of the pattern's interpretation.
export interface NoteEvent {
  step: number; // sixteenth steps from the start of the pattern
  length: number; // in sixteenth steps
  pitch: number; // MIDI note number; for drums, the General MIDI drum number
  velocity: number; // 0 to 127
  voice: string; // which sound the renderer uses
  filter?: number; // 0 (closed) to 1 (open), for voices with a filter
  late?: number; // played this fraction of a step late: the swing
  tone?: string; // a timbre preset of the voice, set by the mood
  from?: number; // a glide (bend or slide) starts at this pitch and moves to `pitch`
  glide?: number; // how long the glide takes, in sixteenth steps; 1 when absent
}

interface Base {
  seq: number;
  time: number;
  by: string;
}

export interface SingEntry extends Base {
  type: 'sing';
  kind: 'tune' | 'rhythm';
  notes?: HummedNote[];
  onsets?: Onset[];
}

export interface InterpretEntry extends Base {
  type: 'interpret';
  sing: number; // seq of the sing it interprets
  interpretation: Interpretation;
}

export interface TakeEntry extends Base {
  type: 'take';
  part: Part;
}

// A pattern states its length in bars and the interpretation it follows,
// never a start bar. It plays from its effect bar and repeats until the same
// part's next pattern takes effect.
export interface PatternEntry extends Base {
  type: 'pattern';
  part: Part;
  bars: number;
  follows: number; // seq of the interpret entry
  events: NoteEvent[];
}

export interface SayEntry extends Base {
  type: 'say';
  text: string;
}

// A mood: a short phrase anyone in the room says, which steers the whole
// band's style (see mood.ts). It takes effect by the same rule as a pattern.
export interface MoodEntry extends Base {
  type: 'mood';
  text: string;
}

export type Entry = SingEntry | InterpretEntry | TakeEntry | PatternEntry | SayEntry | MoodEntry;
type WithoutSeq<E> = E extends Entry ? Omit<E, 'seq'> : never;
export type NewEntry = WithoutSeq<Entry>;

export interface Log {
  entries: Entry[];
}

export interface Rules {
  lookahead: number; // bars
  // Later values of the lookahead, each in force from its time onwards.
  lookaheadChanges?: { time: number; lookahead: number }[];
  defaultTempo: number; // beats per minute before any interpretation
  beatsPerBar: number;
}

export const DEFAULT_RULES: Rules = { lookahead: 1, defaultTempo: 120, beatsPerBar: 4 };

// Allows for rounding when an entry is recorded exactly on a bar boundary.
const EPSILON = 1e-9;

export function createLog(): Log {
  return { entries: [] };
}

export function record(log: Log, entry: NewEntry): Entry {
  const last = log.entries.at(-1);
  if (last && entry.time < last.time) {
    throw new Error(`entry at ${entry.time}s is earlier than the last entry at ${last.time}s`);
  }
  const full = { ...entry, seq: log.entries.length } as Entry;
  log.entries.push(full);
  return full;
}

// A stretch of bars at one tempo, from `bar` until the next segment.
export interface Segment {
  bar: number;
  start: number; // seconds
  tempo: number;
  barSeconds: number;
}

export interface Scheduled {
  entry: Entry;
  effectBar: number;
}

export interface Schedule {
  entries: Scheduled[];
  segments: Segment[];
}

function segmentAtTime(segments: Segment[], time: number): Segment {
  let found = segments[0];
  for (const s of segments) {
    if (s.start <= time + EPSILON) found = s;
    else break;
  }
  return found;
}

function segmentAtBar(segments: Segment[], bar: number): Segment {
  let found = segments[0];
  for (const s of segments) {
    if (s.bar <= bar) found = s;
    else break;
  }
  return found;
}

function positionIn(segments: Segment[], time: number): number {
  const s = segmentAtTime(segments, time);
  return s.bar + (time - s.start) / s.barSeconds;
}

function startIn(segments: Segment[], bar: number): number {
  const s = segmentAtBar(segments, bar);
  return s.start + (bar - s.bar) * s.barSeconds;
}

export function lookaheadAt(rules: Rules, time: number): number {
  let lookahead = rules.lookahead;
  for (const change of rules.lookaheadChanges ?? []) {
    if (change.time <= time) lookahead = change.lookahead;
  }
  return lookahead;
}

function effectBarIn(segments: Segment[], previous: number, time: number, rules: Rules): number {
  const earliest = Math.ceil(positionIn(segments, time) + lookaheadAt(rules, time) - EPSILON);
  return Math.max(earliest, previous);
}

const cache = new WeakMap<Log, { length: number; rules: Rules; schedule: Schedule }>();

// The effect bar of every entry, and the tempo map those entries produce.
// Entries are taken in log order; each one's effect bar uses only the
// entries before it.
export function schedule(log: Log, rules: Rules = DEFAULT_RULES): Schedule {
  const hit = cache.get(log);
  if (hit && hit.length === log.entries.length && hit.rules === rules) return hit.schedule;

  const barSeconds = (tempo: number) => (rules.beatsPerBar * 60) / tempo;
  const segments: Segment[] = [
    { bar: 0, start: 0, tempo: rules.defaultTempo, barSeconds: barSeconds(rules.defaultTempo) },
  ];
  const entries: Scheduled[] = [];
  let previous = 0;
  let base = rules.defaultTempo; // the interpretation's tempo
  let nudge = 0; // the mood's
  for (const entry of log.entries) {
    const effectBar = effectBarIn(segments, previous, entry.time, rules);
    entries.push({ entry, effectBar });
    previous = effectBar;
    const style = entry.type === 'mood' ? readMood(entry.text).style : undefined;
    if (entry.type === 'interpret' || style) {
      if (entry.type === 'interpret') base = entry.interpretation.tempo;
      if (style) nudge = style.tempoNudge;
      const tempo = Math.min(180, Math.max(60, base + nudge));
      const segment = {
        bar: effectBar,
        start: startIn(segments, effectBar),
        tempo,
        barSeconds: barSeconds(tempo),
      };
      if (segments.at(-1)!.bar === effectBar) segments[segments.length - 1] = segment;
      else segments.push(segment);
    }
  }
  const result = { entries, segments };
  cache.set(log, { length: log.entries.length, rules, schedule: result });
  return result;
}

// The bar a new entry recorded at `time` would take effect from.
export function effectBarAt(log: Log, time: number, rules: Rules = DEFAULT_RULES): number {
  const s = schedule(log, rules);
  return effectBarIn(s.segments, s.entries.at(-1)?.effectBar ?? 0, time, rules);
}

// Fractional bar position of a time, by the tempo map recorded so far.
export function positionAt(log: Log, time: number, rules: Rules = DEFAULT_RULES): number {
  return positionIn(schedule(log, rules).segments, time);
}

export function barStart(log: Log, bar: number, rules: Rules = DEFAULT_RULES): number {
  return startIn(schedule(log, rules).segments, bar);
}

export interface ActivePart {
  take: TakeEntry;
  pattern?: PatternEntry;
  barInPattern: number; // which bar of the pattern plays
}

export interface Active {
  bar: number;
  start: number; // seconds
  tempo: number;
  barSeconds: number;
  interpretation?: InterpretEntry;
  parts: Partial<Record<Part, ActivePart>>;
  said: SayEntry[]; // say entries whose effect bar is this bar
  mood?: MoodEntry; // the latest mood in effect
  style: Style; // the style of the latest mood in effect that was understood
}

// What is active at a bar: the tempo, the interpretation, each part that has
// been taken with the pattern it plays, what is said at that bar, and the
// mood.
export function activeAt(log: Log, bar: number, rules: Rules = DEFAULT_RULES): Active {
  const s = schedule(log, rules);
  const segment = segmentAtBar(s.segments, bar);
  const active: Active = {
    bar,
    start: startIn(s.segments, bar),
    tempo: segment.tempo,
    barSeconds: segment.barSeconds,
    parts: {},
    said: [],
    style: styleOf([]),
  };
  const moods: string[] = [];
  const patterns: Partial<Record<Part, Scheduled>> = {};
  for (const scheduled of s.entries) {
    if (scheduled.effectBar > bar) break; // effect bars never decrease
    const e = scheduled.entry;
    if (e.type === 'interpret') active.interpretation = e;
    else if (e.type === 'take') active.parts[e.part] ??= { take: e, barInPattern: 0 };
    else if (e.type === 'pattern') patterns[e.part] = scheduled;
    else if (e.type === 'say' && scheduled.effectBar === bar) active.said.push(e);
    else if (e.type === 'mood') {
      active.mood = e;
      moods.push(e.text);
    }
  }
  active.style = styleOf(moods);
  for (const [part, p] of Object.entries(active.parts) as [Part, ActivePart][]) {
    const scheduled = patterns[part];
    if (!scheduled) continue;
    const pattern = scheduled.entry as PatternEntry;
    p.pattern = pattern;
    p.barInPattern = (bar - scheduled.effectBar) % pattern.bars;
  }
  return active;
}
