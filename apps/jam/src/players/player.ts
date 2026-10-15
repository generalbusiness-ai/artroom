// What every player is: a function from (interpretation, bar, seed) to a
// pattern. `bar` counts the player's own bars from 0, the bar it arrived.

import type { Interpretation, ThemeNote } from '../interpret.ts';
import { NEUTRAL, type Style } from '../mood.ts';
import { random, snapToKey } from '../music.ts';
import type { NoteEvent } from '../record.ts';

export const STEPS_PER_BAR = 16;

export interface Played {
  bars: number; // how many bars the pattern lasts
  events: NoteEvent[];
  say?: string; // a line of banter, now and then
}

// `style` is the room's mood (see mood.ts); NEUTRAL when absent. The
// interpretation a player is given is already in the mood's mode.
export type Player = (interpretation: Interpretation, bar: number, seed: number, style?: Style) => Played;

// What every part shares in a mood: each voice's timbre preset, and swing,
// which plays every off-beat eighth a little late.
export function feel(events: NoteEvent[], style: Style = NEUTRAL): NoteEvent[] {
  return events.map((e) => {
    const tone = style.timbre[e.voice as keyof Style['timbre']];
    const late = style.swing && e.step % 4 === 2 ? style.swing : 0;
    return { ...e, ...(tone ? { tone } : {}), ...(late ? { late } : {}) };
  });
}

// One line on arrival, then perhaps one every fourth bar.
export function banter(lines: string[], bar: number, seed: number, salt: number): string | undefined {
  if (bar === 0) return lines[0];
  if (bar % 4 !== 0) return undefined;
  const r = random(seed, salt, bar);
  if (r() < 0.5) return undefined;
  return lines[1 + Math.floor(r() * (lines.length - 1))];
}

// The theme with each note held until the next one starts, up to `most` steps.
export function legato(interpretation: Interpretation, most: number): ThemeNote[] {
  const theme = interpretation.theme;
  const end = interpretation.themeBars * STEPS_PER_BAR;
  let next = end;
  const notes: ThemeNote[] = new Array(theme.length);
  for (let i = theme.length - 1; i >= 0; i--) {
    const n = theme[i];
    // A closing note folded into the repeat can share the first onset.
    // Hold both until the next distinct onset, rather than making one zero.
    if (theme[i + 1] && theme[i + 1].step > n.step) next = theme[i + 1].step;
    notes[i] = { ...n, length: Math.min(most, next - n.step) };
  }
  return notes;
}

// The notes of one bar of a theme, with steps counted from that bar.
export function themeBar(interpretation: Interpretation, bar: number, notes = interpretation.theme): ThemeNote[] {
  const k = ((bar % interpretation.themeBars) + interpretation.themeBars) % interpretation.themeBars;
  return notes
    .filter((n) => Math.floor(n.step / STEPS_PER_BAR) === k)
    .map((n) => ({ ...n, step: n.step % STEPS_PER_BAR }));
}

// The theme's pitches moved to the nearest note of the key.
export function themeInKey(interpretation: Interpretation): number[] {
  return interpretation.theme.map((n) => snapToKey(n.pitch, interpretation.key));
}
