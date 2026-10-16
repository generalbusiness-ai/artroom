// Small music helpers shared by the interpreter and the players.

export const PITCH_CLASS_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// An interpretation is major or minor; a mood may play it in another mode.
export type Mode = 'major' | 'minor' | 'mixolydian' | 'pentatonic' | 'blues';

export interface Key {
  tonic: number; // pitch class, 0 is C
  mode: Mode;
  name: string;
}

// Semitones above the tonic. Pentatonic is the minor pentatonic; blues adds
// the flat fifth to it.
export const MODES: Record<Mode, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  pentatonic: [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
};

export function keyName(tonic: number, mode: Mode): string {
  return `${PITCH_CLASS_NAMES[tonic]} ${mode}`;
}

export function scale(key: Key): number[] {
  return MODES[key.mode].map((i) => (key.tonic + i) % 12);
}

export function pitchClass(pitch: number): number {
  return ((pitch % 12) + 12) % 12;
}

// The nearest pitch in the key; a tie goes down.
export function snapToKey(pitch: number, key: Key): number {
  const pcs = scale(key);
  for (let d = 0; d < 7; d++) {
    if (pcs.includes(pitchClass(pitch - d))) return pitch - d;
    if (pcs.includes(pitchClass(pitch + d))) return pitch + d;
  }
  return pitch;
}

// Move a pitch in the key by a number of scale degrees.
export function stepInKey(pitch: number, degrees: number, key: Key): number {
  let p = snapToKey(pitch, key);
  const pcs = scale(key);
  const dir = Math.sign(degrees);
  for (let n = 0; n < Math.abs(degrees); n++) {
    do p += dir;
    while (!pcs.includes(pitchClass(p)));
  }
  return p;
}

// The lowest pitch of a pitch class at or above `floor`.
export function atOrAbove(pc: number, floor: number): number {
  return floor + pitchClass(pc - floor);
}

// The tonic triad of the key, rooted at or above `floor`.
export function tonicTriad(key: Key, floor: number): number[] {
  const root = atOrAbove(key.tonic, floor);
  return [root, root + (MODES[key.mode].includes(4) ? 4 : 3), root + 7];
}

// A small seeded random number generator (mulberry32), so players are
// deterministic.
export function random(...seeds: number[]): () => number {
  let a = 0x9e3779b9;
  for (const s of seeds) a = Math.imul(a ^ (s | 0), 0x85ebca6b) + 0x27d4eb2f;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
