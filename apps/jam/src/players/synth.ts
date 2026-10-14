// The synth: first it hums the theme back, then it carries the whole groove.
// See synth.prompt.md.

import type { Interpretation } from '../interpret.ts';
import { NEUTRAL, type Style } from '../mood.ts';
import { atOrAbove, tonicTriad, type Key } from '../music.ts';
import type { NoteEvent } from '../record.ts';
import { banter, legato, themeInKey, type Played } from './player.ts';

export const LINES = [
  'I heard a tune. I think it was a tune.',
  'That hum had layers. Two, maybe.',
  'Root and fifth. Nobody gets hurt.',
  'Opening the filter. Stand back.',
  'Is it late? It feels late.',
  'I will hold the groove. Someone has to.',
];

// The theme as it was sung, an octave up, each note held to the next.
function humBack(interpretation: Interpretation): Played {
  const events: NoteEvent[] = legato(interpretation, 4).map((n) => ({
    step: n.step,
    length: n.length,
    pitch: n.pitch + 12,
    velocity: n.velocity,
    voice: 'hum',
  }));
  return { bars: interpretation.themeBars, events };
}

export function synth(interpretation: Interpretation, bar: number, seed: number, style: Style = NEUTRAL): Played {
  const say = banter(LINES, bar, seed, 1);
  if (bar === 0 && interpretation.theme.length > 0) return { ...humBack(interpretation), say };

  const groove = Math.max(0, interpretation.theme.length > 0 ? bar - interpretation.themeBars : bar);
  const key = interpretation.key;
  const play = style.synth === 'drive' ? drive : style.synth === 'boom-chick' ? boomChick : techno;
  return { bars: 1, events: play(interpretation, key, groove, style), say };
}

// The arpeggio's notes: the theme's, moved into the key.
function arpNotes(interpretation: Interpretation, key: Key): number[] {
  const notes = themeInKey(interpretation).map((p) => atOrAbove(p, 68));
  if (notes.length === 0) notes.push(...tonicTriad(key, 68));
  return notes;
}

// The groove with no mood.
function techno(interpretation: Interpretation, key: Key, groove: number): NoteEvent[] {
  const root = atOrAbove(key.tonic, 31);
  const fifth = root + 7;
  const events: NoteEvent[] = [];

  // Bass: a short root on every beat, then an octave and a root or fifth on
  // the last two sixteenths of the beat. Every fourth bar turns to the fifth.
  for (let beat = 0; beat < 4; beat++) {
    const s = beat * 4;
    const turn = groove % 4 === 3 && beat >= 2;
    events.push({ step: s, length: 1, pitch: turn ? fifth : root, velocity: 112, voice: 'bass' });
    events.push({ step: s + 2, length: 1, pitch: root + 12, velocity: 92, voice: 'bass' });
    events.push({ step: s + 3, length: 1, pitch: turn ? fifth + 12 : root, velocity: 84, voice: 'bass' });
  }

  // Off-beat chord stab: the tonic triad on the "and" of each beat.
  for (const s of [2, 6, 10, 14]) {
    for (const pitch of tonicTriad(key, 55)) {
      events.push({ step: s, length: 1, pitch, velocity: s % 8 === 2 ? 80 : 64, voice: 'stab' });
    }
  }

  // Arpeggio of the theme's notes, moved into the key, on the odd sixteenths,
  // from the third groove bar, its filter opening bar by bar.
  if (groove >= 2) {
    const notes = arpNotes(interpretation, key);
    const filter = Math.min(1, 0.15 + 0.1 * (groove - 2));
    for (let i = 0; i < 8; i++) {
      const pitch = notes[(i + groove) % notes.length];
      events.push({ step: 2 * i + 1, length: 1, pitch, velocity: 72, voice: 'arp', filter });
    }
  }
  return events;
}

// Driving: the bass on every sixteenth, hardest on the beat, so the groove
// itself is four on the floor; the stab on the off-beats and on the last
// sixteenth of beat 3; the arpeggio from the second groove bar, on more
// sixteenths the denser the mood, its filter opening twice as fast.
function drive(interpretation: Interpretation, key: Key, groove: number, style: Style): NoteEvent[] {
  const root = atOrAbove(key.tonic, 31);
  const fifth = root + 7;
  const events: NoteEvent[] = [];
  for (let s = 0; s < 16; s++) {
    const turn = groove % 4 === 3 && s >= 8;
    const onBeat = s % 4 === 0;
    events.push({ step: s, length: 1, pitch: (turn ? fifth : root) + (s % 4 === 2 ? 12 : 0), velocity: onBeat ? 120 : 86, voice: 'bass' });
  }
  for (const s of [2, 6, 10, 11, 14]) {
    for (const pitch of tonicTriad(key, 55)) events.push({ step: s, length: 1, pitch, velocity: s === 11 ? 70 : 88, voice: 'stab' });
  }
  if (groove >= 1) {
    const notes = arpNotes(interpretation, key);
    const filter = Math.min(1, 0.25 + 0.2 * (groove - 1));
    const count = Math.min(16, Math.round(8 * style.density));
    for (let i = 0; i < count; i++) {
      const step = Math.floor((i * 16) / count);
      events.push({ step, length: 1, pitch: notes[(i + groove) % notes.length], velocity: 76, voice: 'arp', filter });
    }
  }
  return events;
}

// Boom-chick: a long root on beat 1 and a long fifth on beat 3, the tonic
// chord on 2 and 4, and, from the third groove bar, a few of the theme's notes
// on the off-beat eighths, fewer the sparser the mood. Lengths follow the mood.
function boomChick(interpretation: Interpretation, key: Key, groove: number, style: Style): NoteEvent[] {
  const root = atOrAbove(key.tonic, 31);
  const long = (n: number) => Math.max(1, Math.round(n * style.length));
  const events: NoteEvent[] = [
    { step: 0, length: long(3), pitch: root, velocity: 104, voice: 'bass' },
    { step: 8, length: long(3), pitch: groove % 2 ? root + 7 : root - 5, velocity: 96, voice: 'bass' },
  ];
  for (const s of [4, 12]) {
    for (const pitch of tonicTriad(key, 55)) events.push({ step: s, length: long(1), pitch, velocity: 72, voice: 'stab' });
  }
  if (groove >= 2) {
    const notes = arpNotes(interpretation, key);
    const count = Math.max(1, Math.min(4, Math.round(8 * style.density) - 2));
    for (let i = 0; i < count; i++) {
      events.push({ step: [2, 6, 10, 14][i], length: long(1), pitch: notes[(i + groove) % notes.length], velocity: 64, voice: 'arp', filter: 0.4 });
    }
  }
  return events;
}
