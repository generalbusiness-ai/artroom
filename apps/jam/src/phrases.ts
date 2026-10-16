// Application-owned symbolic demo phrases. No microphone, transcription,
// private recording or published melody supplies these live/clip defaults.
import type { HummedNote, Onset } from './interpret.ts';

// Exact retained fixtures from spikes/j2/themes.json (synthetic-c and
// synthetic-eb), authored for this application's J2 harness.
export const ORIGINAL_TUNES: { id: string; label: string; notes: HummedNote[] }[] = [
  { id: 'synthetic-c', label: 'Original C phrase', notes: [
    { start: 0, duration: 0.35, pitch: 60, velocity: 80 },
    { start: 0.5, duration: 0.35, pitch: 64, velocity: 85 },
    { start: 1, duration: 0.7, pitch: 67, velocity: 90 },
  ] },
  { id: 'synthetic-eb', label: 'Original E-flat phrase', notes: [
    { start: 0, duration: 0.35, pitch: 63, velocity: 80 },
    { start: 0.5, duration: 0.35, pitch: 70, velocity: 85 },
    { start: 1, duration: 0.7, pitch: 67, velocity: 90 },
  ] },
];
export const THEME = ORIGINAL_TUNES[0].notes;

// Original application-owned onset figure authored for this source task,
// 9 October 2026: alternating accents on a steady eighth-note pulse.
export const RHYTHM: Onset[] = [
  { time: 0, cls: 'low' },
  { time: 0.25, cls: 'high' },
  { time: 0.5, cls: 'high' },
  { time: 0.75, cls: 'low' },
  { time: 1, cls: 'high' },
  { time: 1.25, cls: 'low' },
  { time: 1.5, cls: 'high' },
  { time: 1.75, cls: 'high' },
];
