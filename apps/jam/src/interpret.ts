// From what the person sang to an interpretation the band can play: a tempo,
// a 4/4 grid of sixteenth steps, the quantized theme and a key.

import { keyName, pitchClass, type Key } from './music.ts';

export type { Key } from './music.ts';

// A note as the in-page pitch tracker reports it.
export interface HummedNote {
  start: number; // seconds
  duration: number; // seconds
  pitch: number; // MIDI note number
  velocity: number; // 0 to 127
}

// An onset of a sung rhythm, with its high or low class.
export interface Onset {
  time: number; // seconds
  cls: 'high' | 'low';
}

export interface ThemeNote {
  step: number; // sixteenth steps from the start of the theme
  length: number; // sixteenth steps
  pitch: number;
  velocity: number;
}

export interface RhythmHit {
  step: number;
  cls: 'high' | 'low';
}

export interface Interpretation {
  from: 'tune' | 'rhythm';
  tempo: number; // beats per minute
  tempoClear: boolean; // false when the tempo is the default for want of evidence
  beatsPerBar: number;
  stepsPerBeat: number;
  key: Key;
  theme: ThemeNote[];
  themeBars: number;
  rhythm: RhythmHit[]; // empty for a tune
  rhythmBars: number; // 0 for a tune
}

export const TEMPO_MIN = 100;
export const TEMPO_MAX = 130;
export const TEMPO_DEFAULT = 120;
const BEATS_PER_BAR = 4;
const STEPS_PER_BEAT = 4;
const STEPS_PER_BAR = BEATS_PER_BAR * STEPS_PER_BEAT;

// How far the refinement may move from the first estimate, in beats per minute.
const REFINE_SPAN = 6;
// Mean squared distance from the grid, in steps, above which the fit is
// unclear. Onsets placed at random score 1/12, about 0.083.
const UNCLEAR_FIT = 0.06;
// Spread of the spacings (standard deviation over mean) above which the
// spacing says nothing.
const UNCLEAR_SPREAD = 0.6;

function median(values: number[]): number {
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

// Mean squared distance of the onsets from a sixteenth grid that starts at the
// first onset, in steps.
export function gridError(times: number[], tempo: number): number {
  const step = 60 / tempo / STEPS_PER_BEAT;
  let sum = 0;
  for (const t of times) {
    const x = (t - times[0]) / step;
    sum += (x - Math.round(x)) ** 2;
  }
  return sum / times.length;
}

// Tempo from the spacing of onsets. The typical spacing (the median) is taken
// as an eighth note; the tempo it implies is moved by octaves towards 100 to
// 130 and snapped to the nearest whole tempo in that range. That estimate is
// then refined to the nearby tempo whose sixteenth grid fits the onsets best.
// With too few onsets, spacings that vary too much, or no good fit, the
// tempo is 120 and marked unclear.
export function tempoFromOnsets(times: number[]): { tempo: number; clear: boolean } {
  const unclear = { tempo: TEMPO_DEFAULT, clear: false };
  const spacings = times.slice(1).map((t, i) => t - times[i]).filter((d) => d > 0.05);
  if (spacings.length < 2) return unclear;
  const mean = spacings.reduce((a, b) => a + b, 0) / spacings.length;
  const sd = Math.sqrt(spacings.reduce((a, d) => a + (d - mean) ** 2, 0) / spacings.length);
  if (sd / mean > UNCLEAR_SPREAD) return unclear;

  const raw = 30 / median(spacings);
  const distance = (t: number) => (t < TEMPO_MIN ? TEMPO_MIN - t : t > TEMPO_MAX ? t - TEMPO_MAX : 0);
  const folded = [raw / 4, raw / 2, raw, raw * 2, raw * 4].reduce((a, b) => (distance(b) < distance(a) ? b : a));
  const estimate = Math.round(Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, folded)));

  let best = estimate;
  for (let t = Math.max(TEMPO_MIN, estimate - REFINE_SPAN); t <= Math.min(TEMPO_MAX, estimate + REFINE_SPAN); t++) {
    if (gridError(times, t) < gridError(times, best)) best = t;
  }
  if (gridError(times, best) > UNCLEAR_FIT) return unclear;
  return { tempo: best, clear: true };
}

// The number of bars a figure fills. A last onset exactly on a bar line is
// the downbeat of the repeat and is folded into its playable period.
function barsFor(lastStep: number): number {
  if (lastStep > 0 && lastStep % STEPS_PER_BAR === 0) return lastStep / STEPS_PER_BAR;
  return Math.max(1, Math.ceil((lastStep + 1) / STEPS_PER_BAR));
}

// The simplest key: the most common pitch class (ties go to the longer total
// duration) is the tonic; the mode is major if the major third above it is
// sung more than the minor third, otherwise minor.
export function keyOf(notes: HummedNote[]): Key {
  if (notes.length === 0) return { tonic: 9, mode: 'minor', name: keyName(9, 'minor') };
  const count = new Array(12).fill(0);
  const time = new Array(12).fill(0);
  for (const n of notes) {
    count[pitchClass(n.pitch)] += 1;
    time[pitchClass(n.pitch)] += n.duration;
  }
  let tonic = 0;
  for (let pc = 1; pc < 12; pc++) {
    if (count[pc] > count[tonic] || (count[pc] === count[tonic] && time[pc] > time[tonic])) tonic = pc;
  }
  const mode = count[(tonic + 4) % 12] > count[(tonic + 3) % 12] ? 'major' : 'minor';
  return { tonic, mode, name: keyName(tonic, mode) };
}

export function interpretTune(notes: HummedNote[]): Interpretation {
  const sorted = [...notes].sort((a, b) => a.start - b.start);
  const { tempo, clear } = tempoFromOnsets(sorted.map((n) => n.start));
  const step = 60 / tempo / STEPS_PER_BEAT;
  const t0 = sorted[0]?.start ?? 0;
  const theme: ThemeNote[] = [];
  for (const n of sorted) {
    let s = Math.round((n.start - t0) / step);
    const last = theme.at(-1);
    if (last && s <= last.step) s = last.step + 1; // separate onsets before repeat folding
    theme.push({ step: s, length: Math.max(1, Math.round(n.duration / step)), pitch: n.pitch, velocity: n.velocity });
  }
  const themeBars = barsFor(theme.at(-1)?.step ?? 0);
  const span = themeBars * STEPS_PER_BAR;
  // Keep both the original downbeat and the closing sung note, even when
  // their pitches match: neither velocity nor note identity is discarded.
  for (const n of theme) n.step %= span;
  theme.sort((a, b) => a.step - b.step);
  return {
    from: 'tune',
    tempo,
    tempoClear: clear,
    beatsPerBar: BEATS_PER_BAR,
    stepsPerBeat: STEPS_PER_BEAT,
    key: keyOf(sorted),
    theme,
    themeBars,
    rhythm: [],
    rhythmBars: 0,
  };
}

// A rhythm sets the tempo and grid; the key and theme are kept from the
// interpretation before it.
export function interpretRhythm(onsets: Onset[], previous?: Interpretation): Interpretation {
  const sorted = [...onsets].sort((a, b) => a.time - b.time);
  const { tempo, clear } = tempoFromOnsets(sorted.map((o) => o.time));
  const step = 60 / tempo / STEPS_PER_BEAT;
  const t0 = sorted[0]?.time ?? 0;
  const steps = sorted.map((o) => ({ step: Math.round((o.time - t0) / step), cls: o.cls }));
  const rhythmBars = barsFor(steps.at(-1)?.step ?? 0);
  const span = rhythmBars * STEPS_PER_BAR;
  const rhythm: RhythmHit[] = [];
  for (const h of steps) {
    const s = h.step % span;
    if (!rhythm.some((r) => r.step === s)) rhythm.push({ step: s, cls: h.cls });
  }
  rhythm.sort((a, b) => a.step - b.step);
  const base = previous ?? interpretTune([]);
  return {
    ...base,
    from: 'rhythm',
    tempo,
    tempoClear: clear,
    beatsPerBar: BEATS_PER_BAR,
    stepsPerBeat: STEPS_PER_BEAT,
    rhythm,
    rhythmBars,
  };
}
