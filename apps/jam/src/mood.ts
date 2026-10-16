// A mood: a short phrase anyone in the room says, such as "detroit techno",
// read into a style the whole band plays in. A small lexicon maps words to
// style parameters. A word not in the lexicon is read as the nearest word
// that is, if one is near enough; otherwise it is ignored. A phrase with no
// word understood leaves the style as it was. All of it is deterministic.

import type { Interpretation } from './interpret.ts';
import { keyName, type Mode } from './music.ts';

export type Tone = 'bright' | 'warm';

export interface Style {
  tempoNudge: number; // beats per minute added to the interpretation's tempo
  swing: number; // how late each off-beat eighth is, in sixteenth steps; 0 is straight
  mode?: Mode; // the mode the key is played in; absent keeps the interpretation's
  density: number; // 1 plays as written; lower plays fewer notes, higher more
  length: number; // note lengths are multiplied by this
  timbre: Partial<Record<'bass' | 'stab' | 'arp' | 'lead', Tone>>; // presets per voice
  synth: 'groove' | 'drive' | 'boom-chick'; // each player's pattern vocabulary
  percussion: 'floor' | 'drive' | 'train';
  lead: 'rockstar' | 'stab' | 'mournful';
}

// No mood: the band as it was before moods.
export const NEUTRAL: Style = {
  tempoNudge: 0,
  swing: 0,
  density: 1,
  length: 1,
  timbre: {},
  synth: 'groove',
  percussion: 'floor',
  lead: 'rockstar',
};

const BRIGHT = { bass: 'bright', stab: 'bright', arp: 'bright', lead: 'bright' } as const;
const WARM = { bass: 'warm', stab: 'warm', arp: 'warm', lead: 'warm' } as const;

// The two reference moods, fully worked.
export const REFERENCE: Record<string, Style> = {
  // Driving and tight: the synth's bass rolls on every sixteenth under the
  // beat, stabs and an arpeggio on every sixteenth, all bright and
  // saturated; percussion runs sixteenth hats with an open hat on the
  // off-beat; the lead is sparse and stabbing.
  'detroit techno': {
    tempoNudge: 6,
    swing: 0,
    mode: 'minor',
    density: 1.5,
    length: 0.5,
    timbre: BRIGHT,
    synth: 'drive',
    percussion: 'drive',
    lead: 'stab',
  },
  // Slower, swung eighths, mixolydian, long notes, warm plain sounds: the
  // synth plays a root and fifth bass under a chord on 2 and 4; percussion
  // plays a train beat; the lead slides and mourns, with the swagger kept and
  // the volume taken out.
  'lonesome country': {
    tempoNudge: -14,
    swing: 0.6,
    mode: 'mixolydian',
    density: 0.5,
    length: 2,
    timbre: WARM,
    synth: 'boom-chick',
    percussion: 'train',
    lead: 'mournful',
  },
};

// Each word sets some parameters; the rest come from NEUTRAL, then from the
// words before it in the phrase.
export const LEXICON: Record<string, Partial<Style>> = {
  detroit: { tempoNudge: 6, mode: 'minor', timbre: BRIGHT, synth: 'drive' },
  techno: { swing: 0, density: 1.5, length: 0.5, synth: 'drive', percussion: 'drive', lead: 'stab' },
  driving: { tempoNudge: 8, density: 1.5 },
  dark: { mode: 'minor' },
  bright: { timbre: BRIGHT },
  warm: { timbre: WARM },
  lonesome: { tempoNudge: -14, density: 0.5, length: 2, lead: 'mournful' },
  country: { swing: 0.6, mode: 'mixolydian', timbre: WARM, synth: 'boom-chick', percussion: 'train' },
  blues: { swing: 0.6, mode: 'blues', lead: 'mournful' },
  sad: { tempoNudge: -8, mode: 'minor', lead: 'mournful' },
  happy: { mode: 'major' },
  rock: { mode: 'pentatonic', lead: 'rockstar' },
  slow: { tempoNudge: -12 },
  fast: { tempoNudge: 12 },
  swing: { swing: 0.6 },
  sparse: { density: 0.5 },
  busy: { density: 1.5 },
};

// Edit distance between two words: letters added, removed, changed, or two
// next to each other swapped.
function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i ? (j ? 0 : i) : j)));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

// The lexicon word nearest to `word`, if it is near enough: at most one edit
// in four letters, and at least one. Ties go to the word first in the lexicon.
export function nearestWord(word: string): string | undefined {
  let best: string | undefined;
  let bestDistance = Infinity;
  for (const known of Object.keys(LEXICON)) {
    const d = distance(word, known);
    if (d < bestDistance) [best, bestDistance] = [known, d];
  }
  return bestDistance <= Math.max(1, Math.floor(word.length / 4)) ? best : undefined;
}

export interface Reading {
  style?: Style; // absent when nothing was understood
  heard: string; // the phrase as understood
  fallback: string[]; // what was read as a nearer word, or ignored
}

export function readMood(text: string): Reading {
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  const known: string[] = [];
  const fallback: string[] = [];
  for (const w of words) {
    if (Object.hasOwn(LEXICON, w)) known.push(w);
    else {
      const near = nearestWord(w);
      if (near) {
        known.push(near);
        fallback.push(`"${w}" heard as "${near}"`);
      } else fallback.push(`"${w}" not understood`);
    }
  }
  const heard = known.join(' ');
  if (known.length === 0) return { heard, fallback };
  const style = Object.hasOwn(REFERENCE, heard) ? REFERENCE[heard] : known.reduce<Style>((s, w) => ({ ...s, ...LEXICON[w] }), NEUTRAL);
  return { style, heard, fallback };
}

// The caption for a mood: the phrase, then any fallback.
export function moodCaption(text: string): string {
  const { style, fallback } = readMood(text);
  if (!style) return `${text} (not understood; the style stays as it was)`;
  return fallback.length ? `${text} (${fallback.join('; ')})` : text;
}

// The interpretation played in the mood's mode.
export function inMood(interpretation: Interpretation, style: Style): Interpretation {
  if (!style.mode || style.mode === interpretation.key.mode) return interpretation;
  const key = { tonic: interpretation.key.tonic, mode: style.mode, name: keyName(interpretation.key.tonic, style.mode) };
  return { ...interpretation, key };
}

// The style in force after a run of mood phrases, oldest first: the latest
// one understood, or NEUTRAL.
export function styleOf(texts: string[]): Style {
  for (let i = texts.length - 1; i >= 0; i--) {
    const { style } = readMood(texts[i]);
    if (style) return style;
  }
  return NEUTRAL;
}
