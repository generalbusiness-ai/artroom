// src/phrases.ts
var ORIGINAL_TUNES = [
  { id: "synthetic-c", label: "Original C phrase", notes: [
    { start: 0, duration: 0.35, pitch: 60, velocity: 80 },
    { start: 0.5, duration: 0.35, pitch: 64, velocity: 85 },
    { start: 1, duration: 0.7, pitch: 67, velocity: 90 }
  ] },
  { id: "synthetic-eb", label: "Original E-flat phrase", notes: [
    { start: 0, duration: 0.35, pitch: 63, velocity: 80 },
    { start: 0.5, duration: 0.35, pitch: 70, velocity: 85 },
    { start: 1, duration: 0.7, pitch: 67, velocity: 90 }
  ] }
];
var THEME = ORIGINAL_TUNES[0].notes;
var RHYTHM = [
  { time: 0, cls: "low" },
  { time: 0.25, cls: "high" },
  { time: 0.5, cls: "high" },
  { time: 0.75, cls: "low" },
  { time: 1, cls: "high" },
  { time: 1.25, cls: "low" },
  { time: 1.5, cls: "high" },
  { time: 1.75, cls: "high" }
];

// src/music.ts
var PITCH_CLASS_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
var MODES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  pentatonic: [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10]
};
function keyName(tonic, mode) {
  return `${PITCH_CLASS_NAMES[tonic]} ${mode}`;
}
function scale(key) {
  return MODES[key.mode].map((i) => (key.tonic + i) % 12);
}
function pitchClass(pitch) {
  return (pitch % 12 + 12) % 12;
}
function snapToKey(pitch, key) {
  const pcs = scale(key);
  for (let d = 0; d < 7; d++) {
    if (pcs.includes(pitchClass(pitch - d))) return pitch - d;
    if (pcs.includes(pitchClass(pitch + d))) return pitch + d;
  }
  return pitch;
}
function stepInKey(pitch, degrees2, key) {
  let p = snapToKey(pitch, key);
  const pcs = scale(key);
  const dir = Math.sign(degrees2);
  for (let n = 0; n < Math.abs(degrees2); n++) {
    do
      p += dir;
    while (!pcs.includes(pitchClass(p)));
  }
  return p;
}
function atOrAbove(pc, floor) {
  return floor + pitchClass(pc - floor);
}
function tonicTriad(key, floor) {
  const root = atOrAbove(key.tonic, floor);
  return [root, root + (MODES[key.mode].includes(4) ? 4 : 3), root + 7];
}
function random(...seeds) {
  let a = 2654435769;
  for (const s of seeds) a = Math.imul(a ^ (s | 0), 2246822507) + 668265263;
  return () => {
    a = a + 1831565813 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// src/mood.ts
var NEUTRAL = {
  tempoNudge: 0,
  swing: 0,
  density: 1,
  length: 1,
  timbre: {},
  synth: "groove",
  percussion: "floor",
  lead: "rockstar"
};
var BRIGHT = { bass: "bright", stab: "bright", arp: "bright", lead: "bright" };
var WARM = { bass: "warm", stab: "warm", arp: "warm", lead: "warm" };
var REFERENCE = {
  // Driving and tight: the synth's bass rolls on every sixteenth under the
  // beat, stabs and an arpeggio on every sixteenth, all bright and
  // saturated; percussion runs sixteenth hats with an open hat on the
  // off-beat; the lead is sparse and stabbing.
  "detroit techno": {
    tempoNudge: 6,
    swing: 0,
    mode: "minor",
    density: 1.5,
    length: 0.5,
    timbre: BRIGHT,
    synth: "drive",
    percussion: "drive",
    lead: "stab"
  },
  // Slower, swung eighths, mixolydian, long notes, warm plain sounds: the
  // synth plays a root and fifth bass under a chord on 2 and 4; percussion
  // plays a train beat; the lead slides and mourns, with the swagger kept and
  // the volume taken out.
  "lonesome country": {
    tempoNudge: -14,
    swing: 0.6,
    mode: "mixolydian",
    density: 0.5,
    length: 2,
    timbre: WARM,
    synth: "boom-chick",
    percussion: "train",
    lead: "mournful"
  }
};
var LEXICON = {
  detroit: { tempoNudge: 6, mode: "minor", timbre: BRIGHT, synth: "drive" },
  techno: { swing: 0, density: 1.5, length: 0.5, synth: "drive", percussion: "drive", lead: "stab" },
  driving: { tempoNudge: 8, density: 1.5 },
  dark: { mode: "minor" },
  bright: { timbre: BRIGHT },
  warm: { timbre: WARM },
  lonesome: { tempoNudge: -14, density: 0.5, length: 2, lead: "mournful" },
  country: { swing: 0.6, mode: "mixolydian", timbre: WARM, synth: "boom-chick", percussion: "train" },
  blues: { swing: 0.6, mode: "blues", lead: "mournful" },
  sad: { tempoNudge: -8, mode: "minor", lead: "mournful" },
  happy: { mode: "major" },
  rock: { mode: "pentatonic", lead: "rockstar" },
  slow: { tempoNudge: -12 },
  fast: { tempoNudge: 12 },
  swing: { swing: 0.6 },
  sparse: { density: 0.5 },
  busy: { density: 1.5 }
};
function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_2, j) => i ? j ? 0 : i : j));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}
function nearestWord(word) {
  let best;
  let bestDistance = Infinity;
  for (const known of Object.keys(LEXICON)) {
    const d = distance(word, known);
    if (d < bestDistance) [best, bestDistance] = [known, d];
  }
  return bestDistance <= Math.max(1, Math.floor(word.length / 4)) ? best : void 0;
}
function readMood(text) {
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  const known = [];
  const fallback = [];
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
  const heard = known.join(" ");
  if (known.length === 0) return { heard, fallback };
  const style = Object.hasOwn(REFERENCE, heard) ? REFERENCE[heard] : known.reduce((s, w) => ({ ...s, ...LEXICON[w] }), NEUTRAL);
  return { style, heard, fallback };
}
function moodCaption(text) {
  const { style, fallback } = readMood(text);
  if (!style) return `${text} (not understood; the style stays as it was)`;
  return fallback.length ? `${text} (${fallback.join("; ")})` : text;
}
function inMood(interpretation, style) {
  if (!style.mode || style.mode === interpretation.key.mode) return interpretation;
  const key = { tonic: interpretation.key.tonic, mode: style.mode, name: keyName(interpretation.key.tonic, style.mode) };
  return { ...interpretation, key };
}
function styleOf(texts) {
  for (let i = texts.length - 1; i >= 0; i--) {
    const { style } = readMood(texts[i]);
    if (style) return style;
  }
  return NEUTRAL;
}

// src/record.ts
var DEFAULT_RULES = { lookahead: 1, defaultTempo: 120, beatsPerBar: 4 };
var EPSILON = 1e-9;
function createLog() {
  return { entries: [] };
}
function record(log, entry) {
  const last = log.entries.at(-1);
  if (last && entry.time < last.time) {
    throw new Error(`entry at ${entry.time}s is earlier than the last entry at ${last.time}s`);
  }
  const full = { ...entry, seq: log.entries.length };
  log.entries.push(full);
  return full;
}
function segmentAtTime(segments, time) {
  let found = segments[0];
  for (const s of segments) {
    if (s.start <= time + EPSILON) found = s;
    else break;
  }
  return found;
}
function segmentAtBar(segments, bar) {
  let found = segments[0];
  for (const s of segments) {
    if (s.bar <= bar) found = s;
    else break;
  }
  return found;
}
function positionIn(segments, time) {
  const s = segmentAtTime(segments, time);
  return s.bar + (time - s.start) / s.barSeconds;
}
function startIn(segments, bar) {
  const s = segmentAtBar(segments, bar);
  return s.start + (bar - s.bar) * s.barSeconds;
}
function lookaheadAt(rules, time) {
  let lookahead = rules.lookahead;
  for (const change of rules.lookaheadChanges ?? []) {
    if (change.time <= time) lookahead = change.lookahead;
  }
  return lookahead;
}
function effectBarIn(segments, previous, time, rules) {
  const earliest = Math.ceil(positionIn(segments, time) + lookaheadAt(rules, time) - EPSILON);
  return Math.max(earliest, previous);
}
var cache = /* @__PURE__ */ new WeakMap();
function schedule(log, rules = DEFAULT_RULES) {
  const hit2 = cache.get(log);
  if (hit2 && hit2.length === log.entries.length && hit2.rules === rules) return hit2.schedule;
  const barSeconds = (tempo) => rules.beatsPerBar * 60 / tempo;
  const segments = [
    { bar: 0, start: 0, tempo: rules.defaultTempo, barSeconds: barSeconds(rules.defaultTempo) }
  ];
  const entries = [];
  let previous = 0;
  let base = rules.defaultTempo;
  let nudge = 0;
  for (const entry of log.entries) {
    const effectBar = effectBarIn(segments, previous, entry.time, rules);
    entries.push({ entry, effectBar });
    previous = effectBar;
    const style = entry.type === "mood" ? readMood(entry.text).style : void 0;
    if (entry.type === "interpret" || style) {
      if (entry.type === "interpret") base = entry.interpretation.tempo;
      if (style) nudge = style.tempoNudge;
      const tempo = Math.min(180, Math.max(60, base + nudge));
      const segment = {
        bar: effectBar,
        start: startIn(segments, effectBar),
        tempo,
        barSeconds: barSeconds(tempo)
      };
      if (segments.at(-1).bar === effectBar) segments[segments.length - 1] = segment;
      else segments.push(segment);
    }
  }
  const result = { entries, segments };
  cache.set(log, { length: log.entries.length, rules, schedule: result });
  return result;
}
function effectBarAt(log, time, rules = DEFAULT_RULES) {
  const s = schedule(log, rules);
  return effectBarIn(s.segments, s.entries.at(-1)?.effectBar ?? 0, time, rules);
}
function positionAt(log, time, rules = DEFAULT_RULES) {
  return positionIn(schedule(log, rules).segments, time);
}
function barStart(log, bar, rules = DEFAULT_RULES) {
  return startIn(schedule(log, rules).segments, bar);
}
function activeAt(log, bar, rules = DEFAULT_RULES) {
  const s = schedule(log, rules);
  const segment = segmentAtBar(s.segments, bar);
  const active = {
    bar,
    start: startIn(s.segments, bar),
    tempo: segment.tempo,
    barSeconds: segment.barSeconds,
    parts: {},
    said: [],
    style: styleOf([])
  };
  const moods = [];
  const patterns = {};
  for (const scheduled of s.entries) {
    if (scheduled.effectBar > bar) break;
    const e = scheduled.entry;
    if (e.type === "interpret") active.interpretation = e;
    else if (e.type === "take") active.parts[e.part] ??= { take: e, barInPattern: 0 };
    else if (e.type === "pattern") patterns[e.part] = scheduled;
    else if (e.type === "say" && scheduled.effectBar === bar) active.said.push(e);
    else if (e.type === "mood") {
      active.mood = e;
      moods.push(e.text);
    }
  }
  active.style = styleOf(moods);
  for (const [part, p] of Object.entries(active.parts)) {
    const scheduled = patterns[part];
    if (!scheduled) continue;
    const pattern = scheduled.entry;
    p.pattern = pattern;
    p.barInPattern = (bar - scheduled.effectBar) % pattern.bars;
  }
  return active;
}

// src/render.ts
var SAMPLE_RATE = 44100;
var TAIL = 2.5;
var TWO_PI = 2 * Math.PI;
function mtof(pitch) {
  return 440 * 2 ** ((pitch - 69) / 12);
}
function onePole(cutoff, sr) {
  return 1 - Math.exp(-TWO_PI * Math.min(cutoff, sr * 0.45) / sr);
}
function noise(seed) {
  let s = seed * 2654435761 >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296 * 2 - 1;
  };
}
var saw = (phase) => 2 * (phase - Math.floor(phase + 0.5));
var square = (phase) => phase - Math.floor(phase) < 0.5 ? 1 : -1;
var triangle = (phase) => 1 - 4 * Math.abs(phase - Math.floor(phase + 0.5));
function playNote(bus, offset, e, stepSeconds) {
  const { dry, send, sr } = bus;
  const seconds = e.length * stepSeconds;
  const v = e.velocity / 127;
  const f = mtof(e.pitch);
  let wet = 0;
  let echo;
  let length;
  let sample;
  switch (e.voice) {
    case "hum": {
      let phase = 0;
      let lp = 0;
      const a = onePole(1600, sr);
      length = Math.floor((seconds + 0.15) * sr);
      wet = 0.25;
      sample = (t) => {
        const vib = t > 0.1 ? 1 + 4e-3 * Math.sin(TWO_PI * 5.5 * t) : 1;
        phase += f * vib / sr;
        lp += a * (triangle(phase) - lp);
        const env = Math.min(1, t / 0.03) * (t < seconds ? 1 : Math.max(0, 1 - (t - seconds) / 0.15));
        return 0.3 * v * env * lp;
      };
      break;
    }
    case "bass": {
      let phase = 0;
      let lp1 = 0;
      let lp2 = 0;
      const bright = e.tone === "bright";
      const warm = e.tone === "warm";
      const decay = warm ? 0.5 : 0.12;
      length = Math.floor((seconds + 0.05) * sr);
      sample = (t) => {
        phase += f / sr;
        const env = Math.exp(-t / decay) * (t < seconds ? 1 : Math.max(0, 1 - (t - seconds) / 0.05));
        const a = onePole(warm ? 500 : 180 + (bright ? 2200 : 900) * env, sr);
        const x = warm ? triangle(phase) : bright ? Math.tanh(2 * saw(phase)) : saw(phase);
        lp1 += a * (x - lp1);
        lp2 += a * (lp1 - lp2);
        return (warm ? 0.7 : 0.55) * v * Math.min(1, t / 3e-3) * env * lp2;
      };
      break;
    }
    case "stab": {
      let p1 = 0;
      let p2 = 0;
      let lp1 = 0;
      let lp2 = 0;
      const bright = e.tone === "bright";
      const warm = e.tone === "warm";
      const a = onePole(bright ? 4200 : warm ? 1800 : 2200, sr);
      const decay = bright ? 0.07 : warm ? Math.max(0.09, seconds * 0.8) : 0.09;
      length = Math.floor((warm ? decay * 5 : 0.4) * sr);
      wet = 0.5;
      sample = (t) => {
        p1 += f * 1.004 / sr;
        p2 += f * 0.996 / sr;
        const x = warm ? (triangle(p1) + triangle(p2)) / 2 : bright ? Math.tanh(1.8 * (saw(p1) + saw(p2))) / 2 : (saw(p1) + saw(p2)) / 2;
        lp1 += a * (x - lp1);
        lp2 += a * (lp1 - lp2);
        return (warm ? 0.16 : 0.12) * v * Math.min(1, t / (warm ? 0.012 : 2e-3)) * Math.exp(-t / decay) * lp2;
      };
      break;
    }
    case "arp": {
      let phase = 0;
      let lp = 0;
      const open = e.filter ?? 0.5;
      const bright = e.tone === "bright";
      const warm = e.tone === "warm";
      const a = onePole(250 + open * open * (bright ? 7e3 : 4500), sr);
      const decay = warm ? 0.2 : 0.08;
      length = Math.floor((warm ? decay * 5 : 0.35) * sr);
      wet = 0.35;
      sample = (t) => {
        phase += f / sr;
        const x = warm ? triangle(phase) : bright ? Math.tanh(1.5 * square(phase)) : square(phase);
        lp += a * (x - lp);
        return (warm ? 0.16 : 0.12) * v * Math.min(1, t / 2e-3) * Math.exp(-t / decay) * lp;
      };
      break;
    }
    case "lead": {
      let p1 = 0;
      let p2 = 0;
      let lp = 0;
      let lo = 0;
      const warm = e.tone === "warm";
      const a = onePole(warm ? 2600 : 5200, sr);
      const aLo = onePole(220, sr);
      const from = e.from ?? e.pitch;
      const glide = e.from === void 0 ? 0 : Math.max(0.01, (e.glide ?? 1) * stepSeconds);
      const held = seconds >= 0.35;
      const drive2 = warm ? 1.2 + v : 3 + 3 * v;
      length = Math.floor((seconds + 0.25) * sr);
      wet = 0.3;
      echo = { delay: Math.round(3 * stepSeconds * sr), gain: warm ? 0.2 : 0.3 };
      sample = (t) => {
        const g = t < glide ? 1 - (1 - t / glide) ** 2 : 1;
        let pitch = from + (e.pitch - from) * g;
        if (held && t > 0.18) pitch += (warm ? 0.4 : 0.3) * Math.min(1, (t - 0.18) / 0.3) * Math.sin(TWO_PI * (warm ? 4.8 : 5.8) * t);
        const fp = mtof(pitch);
        p1 += fp / sr;
        p2 += fp * 1.004 / sr;
        const x = Math.tanh(drive2 * 0.5 * (saw(p1) + saw(p2))) / Math.tanh(drive2);
        lp += a * (x - lp);
        lo += aLo * (lp - lo);
        const env = Math.min(1, t / 5e-3) * (0.7 + 0.3 * Math.exp(-t / 0.08)) * (t < seconds ? 1 : Math.max(0, 1 - (t - seconds) / 0.25));
        return 0.3 * v * env * (lp - lo);
      };
      break;
    }
    case "kick": {
      let phase = 0;
      length = Math.floor(0.45 * sr);
      sample = (t) => {
        phase += (45 + 110 * Math.exp(-t / 0.035)) / sr;
        return 0.5 * v * Math.exp(-t / 0.28) * Math.sin(TWO_PI * phase);
      };
      break;
    }
    case "hat":
    case "openhat": {
      const n = noise(e.pitch * 131 + e.step + 1);
      let lp = 0;
      const a = onePole(7e3, sr);
      const decay = e.voice === "hat" ? 0.035 : 0.25;
      length = Math.floor(decay * 5 * sr);
      sample = (t) => {
        const x = n();
        lp += a * (x - lp);
        return 0.22 * v * Math.exp(-t / decay) * (x - lp);
      };
      break;
    }
    case "clap": {
      const n = noise(e.step + 7);
      let lo = 0;
      let band = 0;
      const aLo = onePole(900, sr);
      const aHi = onePole(3200, sr);
      length = Math.floor(0.3 * sr);
      wet = 0.3;
      sample = (t) => {
        const x = n();
        lo += aLo * (x - lo);
        band += aHi * (x - lo - band);
        const burst = t < 0.03 ? Math.exp(-(t % 0.01 / 3e-3)) : Math.exp(-(t - 0.03) / 0.09);
        return 0.4 * v * burst * band;
      };
      break;
    }
    case "tom": {
      const base = 70 * 2 ** ((e.pitch - 45) / 6);
      let phase = 0;
      length = Math.floor(0.4 * sr);
      sample = (t) => {
        phase += base * (1 + 0.6 * Math.exp(-t / 0.04)) / sr;
        return 0.35 * v * Math.exp(-t / 0.18) * Math.sin(TWO_PI * phase);
      };
      break;
    }
    default:
      return;
  }
  const end = Math.min(dry.length, offset + length);
  for (let i = Math.max(0, offset); i < end; i++) {
    const x = sample((i - offset) / sr, i);
    dry[i] += x;
    if (wet) send[i] += x * wet;
    if (echo) {
      if (i + echo.delay < dry.length) dry[i + echo.delay] += x * echo.gain;
      if (i + 2 * echo.delay < dry.length) dry[i + 2 * echo.delay] += x * echo.gain * echo.gain;
    }
  }
}
function reverb(input, sr) {
  const scale2 = sr / 44100;
  const out2 = new Float32Array(input.length);
  for (const d of [1116, 1188, 1277, 1356]) {
    const len = Math.round(d * scale2);
    const buf = new Float32Array(len);
    let idx = 0;
    let damp = 0;
    for (let i = 0; i < input.length; i++) {
      const y = buf[idx];
      damp = y * 0.8 + damp * 0.2;
      buf[idx] = input[i] + damp * 0.78;
      out2[i] += y * 0.25;
      idx = (idx + 1) % len;
    }
  }
  for (const d of [556, 441]) {
    const len = Math.round(d * scale2);
    const buf = new Float32Array(len);
    let idx = 0;
    for (let i = 0; i < out2.length; i++) {
      const b = buf[idx];
      const x = out2[i];
      buf[idx] = x + b * 0.5;
      out2[i] = b - x * 0.5;
      idx = (idx + 1) % len;
    }
  }
  return out2;
}
function renderBar(log, bar, rules = DEFAULT_RULES, options = {}) {
  const sr = options.sampleRate ?? SAMPLE_RATE;
  const active = activeAt(log, bar, rules);
  const length = Math.ceil((active.barSeconds + TAIL) * sr);
  const bus = { dry: new Float32Array(length), send: new Float32Array(length), sr };
  const stepSeconds = active.barSeconds / 16;
  for (const [part, p] of Object.entries(active.parts)) {
    if (!p.pattern) continue;
    if (options.parts && !options.parts.includes(part)) continue;
    for (const e of p.pattern.events) {
      if (Math.floor(e.step / 16) !== p.barInPattern) continue;
      const offset = Math.round((e.step % 16 + (e.late ?? 0)) * stepSeconds * sr);
      playNote(bus, offset, e, stepSeconds);
    }
  }
  if (options.reverb !== false) {
    const wet = reverb(bus.send, sr);
    for (let i = 0; i < length; i++) bus.dry[i] += wet[i];
  }
  return { start: active.start, seconds: active.barSeconds, samples: bus.dry };
}

// src/interpret.ts
var TEMPO_MIN = 100;
var TEMPO_MAX = 130;
var TEMPO_DEFAULT = 120;
var BEATS_PER_BAR = 4;
var STEPS_PER_BEAT = 4;
var STEPS_PER_BAR = BEATS_PER_BAR * STEPS_PER_BEAT;
var REFINE_SPAN = 6;
var UNCLEAR_FIT = 0.06;
var UNCLEAR_SPREAD = 0.6;
function median(values) {
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}
function gridError(times, tempo) {
  const step = 60 / tempo / STEPS_PER_BEAT;
  let sum = 0;
  for (const t of times) {
    const x = (t - times[0]) / step;
    sum += (x - Math.round(x)) ** 2;
  }
  return sum / times.length;
}
function tempoFromOnsets(times) {
  const unclear = { tempo: TEMPO_DEFAULT, clear: false };
  const spacings = times.slice(1).map((t, i) => t - times[i]).filter((d) => d > 0.05);
  if (spacings.length < 2) return unclear;
  const mean = spacings.reduce((a, b) => a + b, 0) / spacings.length;
  const sd = Math.sqrt(spacings.reduce((a, d) => a + (d - mean) ** 2, 0) / spacings.length);
  if (sd / mean > UNCLEAR_SPREAD) return unclear;
  const raw = 30 / median(spacings);
  const distance2 = (t) => t < TEMPO_MIN ? TEMPO_MIN - t : t > TEMPO_MAX ? t - TEMPO_MAX : 0;
  const folded = [raw / 4, raw / 2, raw, raw * 2, raw * 4].reduce((a, b) => distance2(b) < distance2(a) ? b : a);
  const estimate = Math.round(Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, folded)));
  let best = estimate;
  for (let t = Math.max(TEMPO_MIN, estimate - REFINE_SPAN); t <= Math.min(TEMPO_MAX, estimate + REFINE_SPAN); t++) {
    if (gridError(times, t) < gridError(times, best)) best = t;
  }
  if (gridError(times, best) > UNCLEAR_FIT) return unclear;
  return { tempo: best, clear: true };
}
function barsFor(lastStep) {
  if (lastStep > 0 && lastStep % STEPS_PER_BAR === 0) return lastStep / STEPS_PER_BAR;
  return Math.max(1, Math.ceil((lastStep + 1) / STEPS_PER_BAR));
}
function keyOf(notes) {
  if (notes.length === 0) return { tonic: 9, mode: "minor", name: keyName(9, "minor") };
  const count = new Array(12).fill(0);
  const time = new Array(12).fill(0);
  for (const n of notes) {
    count[pitchClass(n.pitch)] += 1;
    time[pitchClass(n.pitch)] += n.duration;
  }
  let tonic = 0;
  for (let pc = 1; pc < 12; pc++) {
    if (count[pc] > count[tonic] || count[pc] === count[tonic] && time[pc] > time[tonic]) tonic = pc;
  }
  const mode = count[(tonic + 4) % 12] > count[(tonic + 3) % 12] ? "major" : "minor";
  return { tonic, mode, name: keyName(tonic, mode) };
}
function interpretTune(notes) {
  const sorted = [...notes].sort((a, b) => a.start - b.start);
  const { tempo, clear } = tempoFromOnsets(sorted.map((n) => n.start));
  const step = 60 / tempo / STEPS_PER_BEAT;
  const t02 = sorted[0]?.start ?? 0;
  const theme = [];
  for (const n of sorted) {
    let s = Math.round((n.start - t02) / step);
    const last = theme.at(-1);
    if (last && s <= last.step) s = last.step + 1;
    theme.push({ step: s, length: Math.max(1, Math.round(n.duration / step)), pitch: n.pitch, velocity: n.velocity });
  }
  const themeBars = barsFor(theme.at(-1)?.step ?? 0);
  const span = themeBars * STEPS_PER_BAR;
  for (const n of theme) n.step %= span;
  theme.sort((a, b) => a.step - b.step);
  return {
    from: "tune",
    tempo,
    tempoClear: clear,
    beatsPerBar: BEATS_PER_BAR,
    stepsPerBeat: STEPS_PER_BEAT,
    key: keyOf(sorted),
    theme,
    themeBars,
    rhythm: [],
    rhythmBars: 0
  };
}
function interpretRhythm(onsets, previous) {
  const sorted = [...onsets].sort((a, b) => a.time - b.time);
  const { tempo, clear } = tempoFromOnsets(sorted.map((o) => o.time));
  const step = 60 / tempo / STEPS_PER_BEAT;
  const t02 = sorted[0]?.time ?? 0;
  const steps = sorted.map((o) => ({ step: Math.round((o.time - t02) / step), cls: o.cls }));
  const rhythmBars = barsFor(steps.at(-1)?.step ?? 0);
  const span = rhythmBars * STEPS_PER_BAR;
  const rhythm = [];
  for (const h of steps) {
    const s = h.step % span;
    if (!rhythm.some((r) => r.step === s)) rhythm.push({ step: s, cls: h.cls });
  }
  rhythm.sort((a, b) => a.step - b.step);
  const base = previous ?? interpretTune([]);
  return {
    ...base,
    from: "rhythm",
    tempo,
    tempoClear: clear,
    beatsPerBar: BEATS_PER_BAR,
    stepsPerBeat: STEPS_PER_BEAT,
    rhythm,
    rhythmBars
  };
}

// src/players/player.ts
var STEPS_PER_BAR2 = 16;
function feel(events, style = NEUTRAL) {
  return events.map((e) => {
    const tone = style.timbre[e.voice];
    const late = style.swing && e.step % 4 === 2 ? style.swing : 0;
    return { ...e, ...tone ? { tone } : {}, ...late ? { late } : {} };
  });
}
function banter(lines, bar, seed, salt) {
  if (bar === 0) return lines[0];
  if (bar % 4 !== 0) return void 0;
  const r = random(seed, salt, bar);
  if (r() < 0.5) return void 0;
  return lines[1 + Math.floor(r() * (lines.length - 1))];
}
function legato(interpretation, most) {
  const theme = interpretation.theme;
  const end = interpretation.themeBars * STEPS_PER_BAR2;
  let next = end;
  const notes = new Array(theme.length);
  for (let i = theme.length - 1; i >= 0; i--) {
    const n = theme[i];
    if (theme[i + 1] && theme[i + 1].step > n.step) next = theme[i + 1].step;
    notes[i] = { ...n, length: Math.min(most, next - n.step) };
  }
  return notes;
}
function themeBar(interpretation, bar, notes = interpretation.theme) {
  const k = (bar % interpretation.themeBars + interpretation.themeBars) % interpretation.themeBars;
  return notes.filter((n) => Math.floor(n.step / STEPS_PER_BAR2) === k).map((n) => ({ ...n, step: n.step % STEPS_PER_BAR2 }));
}
function themeInKey(interpretation) {
  return interpretation.theme.map((n) => snapToKey(n.pitch, interpretation.key));
}

// src/players/bass.ts
var LINES = ["I will just wait here.", "The synth has the bass. Fine. Fine."];
function bass(interpretation, bar, seed) {
  const root = atOrAbove(interpretation.key.tonic, 28);
  const fifth = root + 7;
  const events = [0, 3, 6, 10, 12].map((step, i) => ({
    step,
    length: 2,
    pitch: i === 3 ? fifth : root,
    velocity: 100,
    voice: "bass"
  }));
  return { bars: 1, events, say: banter(LINES, bar, seed, 4) };
}

// src/players/lead.ts
var LINES2 = [
  "Hello, room! Did you miss me?",
  "Long notes. I make them wait.",
  "The synth asked a question. I have answers.",
  "Was that a run? That was a run.",
  "I bent that note and it said thank you.",
  "Silence. Then me. You are welcome.",
  "Two octaves up. Mind your ears."
];
var UP = 24;
var LATE = 2;
var FLOURISH = 11;
var note = (step, length, pitch, velocity, glide) => ({
  step,
  length,
  pitch,
  velocity,
  voice: "lead",
  ...glide ? { from: glide.from, glide: glide.steps ?? 1 } : {}
});
function degrees(from, to, key) {
  const pcs = scale(key);
  let n = 0;
  for (let p = Math.min(from, to) + 1; p <= Math.max(from, to); p++) if (pcs.includes(pitchClass(p))) n++;
  return to >= from ? n : -n;
}
function passBars(interpretation) {
  return Math.max(2, interpretation.themeBars);
}
var isBigPass = (pass) => pass % 4 === 3;
function mostSung(interpretation) {
  const count = /* @__PURE__ */ new Map();
  for (const p of themeInKey(interpretation)) count.set(p, (count.get(p) ?? 0) + 1);
  return [...count].sort((a, b) => b[1] - a[1])[0][0];
}
function screamPitch(interpretation) {
  return mostSung(interpretation) + 12 + 24;
}
function lead(interpretation, bar, seed, style = NEUTRAL) {
  if (style.lead === "stab") return stabbing(interpretation, bar, seed);
  const played = rockstar(interpretation, bar, seed);
  return style.lead === "mournful" ? mournful(interpretation, played, style) : played;
}
function stabbing(interpretation, bar, seed) {
  const key = interpretation.key;
  const say = banter(LINES2, bar, seed, 3);
  const inKey = themeInKey(interpretation).map((p) => p + UP);
  if (inKey.length === 0) return { bars: 1, events: [], say };
  const held = mostSung(interpretation) + UP;
  if (bar === 0) return { bars: 1, events: [note(10, 1, held, 124), note(13, 1, held, 118)], say };
  const n = bar - 1;
  const up = Math.floor(n / 2) % 2 === 1 ? 3 + Math.floor(random(seed, 3)() * 2) : 0;
  const steps = n % 4 === 3 ? [3, 10, 13, 14, 15] : n % 2 ? [3, 10] : [2, 7, 10];
  const events = steps.map((step, i) => {
    const pitch = stepInKey(inKey[(3 * n + Math.min(i, 2)) % inKey.length], up, key);
    return note(step, 1, pitch, i === 0 || step === 10 ? 124 : 106);
  });
  return { bars: 1, events, say };
}
function mournful(interpretation, played, style) {
  if (played.events.length === 0) return played;
  const scream = screamPitch(interpretation);
  const key = interpretation.key;
  const events = played.events.map((e, i, all) => {
    const pitch = e.pitch === scream ? scream - 12 : e.pitch;
    const next = all[i + 1]?.step;
    const length = next === void 0 ? Math.round(e.length * style.length) : Math.max(e.length, Math.min(Math.round(e.length * style.length), next - e.step));
    const velocity = Math.round(60 + (e.velocity - 60) * 0.38);
    const out2 = { step: e.step, length, pitch, velocity, voice: "lead" };
    if (e.length >= 3 || e.from !== void 0) Object.assign(out2, { from: stepInKey(pitch, 1, key), glide: 2 });
    return out2;
  });
  return { ...played, events };
}
function rockstar(interpretation, bar, seed) {
  const key = interpretation.key;
  const say = banter(LINES2, bar, seed, 3);
  const inKey = themeInKey(interpretation).map((p) => p + UP);
  if (inKey.length === 0) return { bars: 1, events: [], say };
  const scream = screamPitch(interpretation);
  if (bar === 0) {
    const held = mostSung(interpretation) + UP;
    return { bars: 1, events: [note(8 + LATE, 14, held, 120, { from: held - 2, steps: 2 })], say };
  }
  if (bar === 1) {
    const a = inKey.at(-2) ?? inKey[0];
    const b = inKey.at(-1);
    return {
      bars: 1,
      events: [note(8, 3, a, 112, { from: a + 3 }), note(11, 5, b, 124, { from: b - 2, steps: 2 })],
      say
    };
  }
  const n = bar - 2;
  const bars = passBars(interpretation);
  const pass = Math.floor(n / bars);
  const k = n % bars;
  const r = random(seed, 3);
  const answerUp = pass % 2 === 1 ? 3 + Math.floor(r() * 2) : 0;
  const turn = Math.floor(r() * 3);
  const accent = Math.min(127, 108 + 4 * (pass % 4));
  if (isBigPass(pass)) {
    if (k < bars - 1) return { bars: 1, events: [], say };
    const events2 = [];
    for (let i = 0; i < 14; i++) events2.push(note(i, 1, stepInKey(scream - 24, i, key), 90 + 2 * i));
    events2.push(note(14, 16, scream, 127, { from: scream - 2, steps: 2 }));
    return { bars: 1, events: events2, say };
  }
  if (k === bars - 1) {
    const top = scream - 12;
    const events2 = [];
    for (const t of themeBar(interpretation, k)) {
      if (t.step < 3) events2.push(note(t.step, 1, snapToKey(t.pitch, key) + UP, 70));
    }
    for (let i = 0; i < 7; i++) events2.push(note(3 + i, 1, stepInKey(top - 12, i, key), 84 + 4 * i));
    events2.push(note(10, 8, top, 122, { from: top - 1 }));
    return { bars: 1, events: events2, say };
  }
  const notes = themeBar(interpretation, k, legato(interpretation, 8)).filter((t) => t.step < FLOURISH);
  const sung = notes.map((t) => snapToKey(t.pitch, key) + UP);
  const lo = Math.min(...sung, inKey[0]);
  const hi = Math.max(...sung, inKey[0]);
  const events = [];
  for (const [i, t] of notes.entries()) {
    if (k === 0 && t.step === 0) continue;
    const pitch = stepInKey(stepInKey(lo, degrees(sung[i], hi, key), key), answerUp, key);
    const long = t.length >= 3;
    const step = long ? t.step + LATE : t.step;
    const last = events.at(-1);
    if (step >= FLOURISH || last && step <= last.step) continue;
    const bend = events.filter((e) => e.from !== void 0).length % 2 === 0;
    const glide = long ? { from: bend || !last ? pitch - 2 : last.pitch } : void 0;
    events.push(note(step, t.length, pitch, long ? accent : 64, glide));
  }
  for (let i = 0; i < events.length; i++) {
    const next = events[i + 1]?.step ?? FLOURISH;
    events[i] = { ...events[i], length: Math.max(1, Math.min(events[i].length, next - events[i].step)) };
  }
  const end = events.at(-1)?.pitch ?? hi;
  const kind = (pass + turn) % 3;
  if (kind === 0) {
    for (let i = 0; i < 5; i++) events.push(note(FLOURISH + i, 1, i % 2 ? stepInKey(end, 1, key) : end, i % 2 ? 92 : 104));
  } else if (kind === 1) {
    for (let i = 0; i < 5; i++) events.push(note(FLOURISH + i, 1, stepInKey(end, 4 - i, key), 96 + 4 * i));
  } else {
    events.push(note(FLOURISH, 5, scream, 124, { from: scream - 2, steps: 2 }));
  }
  return { bars: 1, events, say };
}

// src/players/percussion.ts
var KICK = 36;
var CLAP = 39;
var CLOSED_HAT = 42;
var OPEN_HAT = 46;
var LOW_TOM = 45;
var MID_TOM = 47;
var HIGH_TOM = 50;
var LINES3 = [
  "Did someone say floor?",
  "Four on the floor, as the law requires.",
  "Fill incoming. Sorry in advance.",
  "I only know one beat and this is it.",
  "Clap on two and four. I read the manual.",
  "Copying your rhythm. Badly, but with feeling."
];
function hit(step, pitch, velocity, voice) {
  return { step, length: 1, pitch, velocity, voice };
}
function percussion(interpretation, bar, seed, style = NEUTRAL) {
  const events = [];
  const fill = bar % 8 === 7;
  const train = style.percussion === "train";
  for (const s of train ? [0, 8] : [0, 4, 8, 12]) events.push(hit(s, KICK, train ? 100 : style.percussion === "drive" ? 124 : 120, "kick"));
  for (const s of [4, 12]) events.push(hit(s, CLAP, train ? 70 : 100, "clap"));
  if (style.percussion === "drive") {
    for (let s = 0; s < 16; s++) {
      if (s % 4 === 2) events.push(hit(s, OPEN_HAT, 92, "openhat"));
      else events.push(hit(s, CLOSED_HAT, s % 2 ? 56 : 76, "hat"));
    }
  } else if (train) {
    for (let s = 0; s < 16; s += 2) {
      if (s % 4 === 2 || style.density >= 1) events.push(hit(s, CLOSED_HAT, s % 4 === 2 ? 72 : 52, "hat"));
    }
  }
  if (style.percussion !== "floor") {
    const k = interpretation.rhythmBars ? bar % interpretation.rhythmBars : 0;
    for (const h of interpretation.rhythm) {
      if (Math.floor(h.step / 16) === k && h.cls === "low" && !(fill && h.step % 16 >= 12)) {
        events.push(hit(h.step % 16, LOW_TOM, train ? 80 : 104, "tom"));
      }
    }
  } else if (interpretation.rhythm.length > 0) {
    const k = bar % interpretation.rhythmBars;
    for (const h of interpretation.rhythm) {
      if (Math.floor(h.step / 16) !== k) continue;
      const s = h.step % 16;
      if (fill && s >= 12) continue;
      if (h.cls === "high") events.push(hit(s, CLOSED_HAT, 96, "hat"));
      else events.push(hit(s, LOW_TOM, 104, "tom"));
    }
  } else {
    for (const s of [2, 6, 10, 14]) {
      const open = s === 14 && bar % 2 === 1;
      events.push(hit(s, open ? OPEN_HAT : CLOSED_HAT, 96, open ? "openhat" : "hat"));
    }
    if (bar >= 2) for (let s = 1; s < 16; s += 2) events.push(hit(s, CLOSED_HAT, 48, "hat"));
  }
  if (fill) {
    const r = random(seed, 2, bar);
    const toms = r() < 0.5 ? [HIGH_TOM, HIGH_TOM, MID_TOM, LOW_TOM] : [HIGH_TOM, MID_TOM, MID_TOM, LOW_TOM];
    if (train) [MID_TOM, LOW_TOM].forEach((pitch, i) => events.push(hit(12 + 2 * i, pitch, 76, "tom")));
    else toms.forEach((pitch, i) => events.push(hit(12 + i, pitch, 90 + i * 8, "tom")));
  }
  const say = interpretation.rhythm.length > 0 && bar % 4 === 0 && bar > 0 ? LINES3[5] : banter(LINES3.slice(0, 5), bar, seed, 2);
  return { bars: 1, events, say };
}

// src/players/synth.ts
var LINES4 = [
  "I heard a tune. I think it was a tune.",
  "That hum had layers. Two, maybe.",
  "Root and fifth. Nobody gets hurt.",
  "Opening the filter. Stand back.",
  "Is it late? It feels late.",
  "I will hold the groove. Someone has to."
];
function humBack(interpretation) {
  const events = legato(interpretation, 4).map((n) => ({
    step: n.step,
    length: n.length,
    pitch: n.pitch + 12,
    velocity: n.velocity,
    voice: "hum"
  }));
  return { bars: interpretation.themeBars, events };
}
function synth(interpretation, bar, seed, style = NEUTRAL) {
  const say = banter(LINES4, bar, seed, 1);
  if (bar === 0 && interpretation.theme.length > 0) return { ...humBack(interpretation), say };
  const groove = Math.max(0, interpretation.theme.length > 0 ? bar - interpretation.themeBars : bar);
  const key = interpretation.key;
  const play = style.synth === "drive" ? drive : style.synth === "boom-chick" ? boomChick : techno;
  return { bars: 1, events: play(interpretation, key, groove, style), say };
}
function arpNotes(interpretation, key) {
  const notes = themeInKey(interpretation).map((p) => atOrAbove(p, 68));
  if (notes.length === 0) notes.push(...tonicTriad(key, 68));
  return notes;
}
function techno(interpretation, key, groove) {
  const root = atOrAbove(key.tonic, 31);
  const fifth = root + 7;
  const events = [];
  for (let beat = 0; beat < 4; beat++) {
    const s = beat * 4;
    const turn = groove % 4 === 3 && beat >= 2;
    events.push({ step: s, length: 1, pitch: turn ? fifth : root, velocity: 112, voice: "bass" });
    events.push({ step: s + 2, length: 1, pitch: root + 12, velocity: 92, voice: "bass" });
    events.push({ step: s + 3, length: 1, pitch: turn ? fifth + 12 : root, velocity: 84, voice: "bass" });
  }
  for (const s of [2, 6, 10, 14]) {
    for (const pitch of tonicTriad(key, 55)) {
      events.push({ step: s, length: 1, pitch, velocity: s % 8 === 2 ? 80 : 64, voice: "stab" });
    }
  }
  if (groove >= 2) {
    const notes = arpNotes(interpretation, key);
    const filter = Math.min(1, 0.15 + 0.1 * (groove - 2));
    for (let i = 0; i < 8; i++) {
      const pitch = notes[(i + groove) % notes.length];
      events.push({ step: 2 * i + 1, length: 1, pitch, velocity: 72, voice: "arp", filter });
    }
  }
  return events;
}
function drive(interpretation, key, groove, style) {
  const root = atOrAbove(key.tonic, 31);
  const fifth = root + 7;
  const events = [];
  for (let s = 0; s < 16; s++) {
    const turn = groove % 4 === 3 && s >= 8;
    const onBeat = s % 4 === 0;
    events.push({ step: s, length: 1, pitch: (turn ? fifth : root) + (s % 4 === 2 ? 12 : 0), velocity: onBeat ? 120 : 86, voice: "bass" });
  }
  for (const s of [2, 6, 10, 11, 14]) {
    for (const pitch of tonicTriad(key, 55)) events.push({ step: s, length: 1, pitch, velocity: s === 11 ? 70 : 88, voice: "stab" });
  }
  if (groove >= 1) {
    const notes = arpNotes(interpretation, key);
    const filter = Math.min(1, 0.25 + 0.2 * (groove - 1));
    const count = Math.min(16, Math.round(8 * style.density));
    for (let i = 0; i < count; i++) {
      const step = Math.floor(i * 16 / count);
      events.push({ step, length: 1, pitch: notes[(i + groove) % notes.length], velocity: 76, voice: "arp", filter });
    }
  }
  return events;
}
function boomChick(interpretation, key, groove, style) {
  const root = atOrAbove(key.tonic, 31);
  const long = (n) => Math.max(1, Math.round(n * style.length));
  const events = [
    { step: 0, length: long(3), pitch: root, velocity: 104, voice: "bass" },
    { step: 8, length: long(3), pitch: groove % 2 ? root + 7 : root - 5, velocity: 96, voice: "bass" }
  ];
  for (const s of [4, 12]) {
    for (const pitch of tonicTriad(key, 55)) events.push({ step: s, length: long(1), pitch, velocity: 72, voice: "stab" });
  }
  if (groove >= 2) {
    const notes = arpNotes(interpretation, key);
    const count = Math.max(1, Math.min(4, Math.round(8 * style.density) - 2));
    for (let i = 0; i < count; i++) {
      events.push({ step: [2, 6, 10, 14][i], length: long(1), pitch: notes[(i + groove) % notes.length], velocity: 64, voice: "arp", filter: 0.4 });
    }
  }
  return events;
}

// src/players/index.ts
var PLAYERS = { synth, percussion, lead, bass };
var ARRIVAL_ORDER = ["synth", "percussion", "lead"];

// src/band.ts
function createBand(options = {}) {
  return {
    log: createLog(),
    rules: options.rules ?? DEFAULT_RULES,
    seed: options.seed ?? 1,
    arrivalEvery: options.arrivalEvery ?? 8,
    arrivals: {},
    coveredUntil: {},
    ownBar: {}
  };
}
function latestInterpretation(log) {
  for (let i = log.entries.length - 1; i >= 0; i--) {
    const e = log.entries[i];
    if (e.type === "interpret") return e.interpretation;
  }
  return void 0;
}
function taken(log, part) {
  return log.entries.some((e) => e.type === "take" && e.part === part);
}
function sing(band, time, phrase) {
  const { log } = band;
  const s = phrase.kind === "tune" ? record(log, { type: "sing", by: "person", time, kind: "tune", notes: phrase.notes }) : record(log, { type: "sing", by: "person", time, kind: "rhythm", onsets: phrase.onsets });
  const interpretation = phrase.kind === "tune" ? interpretTune(phrase.notes) : interpretRhythm(phrase.onsets, latestInterpretation(log));
  record(log, { type: "interpret", by: "synth", time, sing: s.seq, interpretation });
  if (band.arrivals.synth === void 0) {
    const first = schedule(log, band.rules).entries.at(-1).effectBar;
    ARRIVAL_ORDER.forEach((part, i) => band.arrivals[part] = first + i * band.arrivalEvery);
  }
}
function mood(band, time, text, by = "person") {
  record(band.log, { type: "mood", by, time, text });
}
function tick(band, time) {
  const { log, rules } = band;
  for (const part of ARRIVAL_ORDER) {
    const due = band.arrivals[part];
    if (due === void 0 || taken(log, part)) continue;
    if (due <= effectBarAt(log, time, rules)) {
      record(log, { type: "take", by: part, time, part });
      band.coveredUntil[part] = 0;
      band.ownBar[part] = 0;
    }
  }
  for (const part of ARRIVAL_ORDER) {
    if (!taken(log, part)) continue;
    const effect = effectBarAt(log, time, rules);
    if (band.coveredUntil[part] > effect) continue;
    const active = activeAt(log, effect, rules);
    const interpret = active.interpretation;
    if (!interpret) continue;
    const { style } = active;
    const played = PLAYERS[part](inMood(interpret.interpretation, style), band.ownBar[part], band.seed, style);
    record(log, {
      type: "pattern",
      by: part,
      time,
      part,
      bars: played.bars,
      follows: interpret.seq,
      events: feel(played.events, style)
    });
    band.coveredUntil[part] = effect + played.bars;
    band.ownBar[part] = band.ownBar[part] + played.bars;
    if (played.say) record(log, { type: "say", by: part, time, text: played.say });
  }
}

// page/live.ts
function createLive() {
  return { band: createBand(), nextBar: 0 };
}
function singNow(live2, now2, phrase) {
  const effectBar = effectBarAt(live2.band.log, now2, live2.band.rules);
  sing(live2.band, now2, phrase);
  return effectBar;
}
function moodNow(live2, now2, text) {
  const effectBar = effectBarAt(live2.band.log, now2, live2.band.rules);
  mood(live2.band, now2, text);
  return effectBar;
}
function advance(live2, now2, ahead) {
  const { log, rules } = live2.band;
  const bars = [];
  while (barStart(log, live2.nextBar, rules) - now2 < ahead) {
    tick(live2.band, now2);
    bars.push(live2.nextBar++);
  }
  return bars;
}

// page/view.ts
var CAPTION_BARS = 3;
function stageAt(log, time, rules = DEFAULT_RULES) {
  const position = Math.max(0, positionAt(log, time, rules));
  const bar = Math.floor(position);
  const beats = (position - bar) * rules.beatsPerBar;
  const beat = Math.floor(beats);
  const active = activeAt(log, bar, rules);
  const arrived = { synth: false, percussion: false, lead: false, bass: false };
  for (const part of Object.keys(active.parts)) arrived[part] = true;
  const captions = [];
  const pending = [];
  let effected;
  for (const { entry, effectBar } of schedule(log, rules).entries) {
    if (entry.type === "say" && effectBar <= bar && effectBar > bar - CAPTION_BARS) {
      captions.push({ by: entry.by, text: entry.text });
    }
    if (entry.type === "mood" && effectBar <= bar && effectBar > bar - CAPTION_BARS) {
      captions.push({ by: "the room says", text: moodCaption(entry.text) });
    }
    if ((entry.type === "sing" || entry.type === "mood") && effectBar <= bar) {
      effected = { seq: entry.seq, effectBar };
    }
    if (entry.type === "sing" && effectBar > bar) pending.push({ kind: entry.kind, effectBar });
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
    effected
  };
}

// page/captions.ts
function sameCaptions(a, b) {
  return a.length === b.length && a.every((caption, index) => caption.by === b[index].by && caption.text === b[index].text);
}
function captionUpdater(render) {
  let displayed = [];
  return (captions) => {
    if (sameCaptions(displayed, captions)) return;
    render(captions);
    displayed = captions.map((caption) => ({ ...caption }));
  };
}

// page/app.ts
var AHEAD = 0.5;
var audio;
var out;
var live;
var t0 = 0;
var $ = (selector) => document.querySelector(selector);
function now() {
  return audio ? audio.currentTime - t0 : 0;
}
function start() {
  audio = new AudioContext();
  const gain = audio.createGain();
  gain.gain.value = 0.6;
  const limiter = audio.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.ratio.value = 12;
  gain.connect(limiter).connect(audio.destination);
  out = gain;
  t0 = audio.currentTime + 0.05;
  live = createLive();
  setInterval(schedule2, 25);
  requestAnimationFrame(draw);
}
function schedule2() {
  if (!audio || !live) return;
  const { log, rules } = live.band;
  for (const bar of advance(live, now(), AHEAD)) {
    const rendered = renderBar(log, bar, rules, { sampleRate: audio.sampleRate });
    const when = t0 + rendered.start;
    if (when < audio.currentTime) continue;
    if (!rendered.samples.some((x) => x !== 0)) continue;
    const buffer = audio.createBuffer(1, rendered.samples.length, audio.sampleRate);
    buffer.copyToChannel(rendered.samples, 0);
    const source = audio.createBufferSource();
    source.buffer = buffer;
    source.connect(out);
    source.start(when);
  }
}
function press(phrase) {
  if (!audio) start();
  void audio.resume();
  const bar = singNow(live, now(), phrase);
  $("#status").textContent = `You ${phrase.kind === "tune" ? "played the selected original phrase" : "played the original onset pattern"}. It takes effect at bar ${bar}.`;
}
function sayMood(event) {
  event.preventDefault();
  const input = $("#mood-text");
  const text = input.value.trim();
  if (!text) return;
  if (!audio) start();
  void audio.resume();
  const bar = moodNow(live, now(), text);
  input.value = "";
  $("#status").textContent = `The room says "${text}". It takes effect at bar ${bar}.`;
}
var PARTS = ["synth", "percussion", "lead"];
var updateCaptions = captionUpdater((captions) => {
  $("#captions").replaceChildren(...captions.map((caption) => {
    const p = document.createElement("p");
    const who = document.createElement("b");
    who.textContent = `${caption.by}: `;
    p.append(who, caption.text);
    return p;
  }));
});
function draw() {
  if (!live) return;
  const stage = stageAt(live.band.log, now(), live.band.rules);
  $("#bar").textContent = `bar ${stage.bar} \xB7 beat ${stage.beat + 1} \xB7 ${stage.tempo} bpm${stage.key ? ` \xB7 ${stage.key}` : ""}${stage.mood ? ` \xB7 ${stage.mood}` : ""}`;
  for (const part of PARTS) {
    const figure = $(`#${part}-player`);
    figure.style.visibility = stage.arrived[part] ? "visible" : "hidden";
    const head = $(`#${part}-player .head`);
    head.setAttribute("transform", `translate(0 ${(stage.arrived[part] ? stage.nod : 0) * 8})`);
  }
  updateCaptions(stage.captions);
  const waiting = stage.pending.map((p) => `${p.kind} from bar ${p.effectBar}`).join(", ");
  const pending = $("#pending");
  pending.replaceChildren();
  if (waiting) {
    const marker = document.createElement("span");
    marker.className = "entry-marker";
    marker.setAttribute("aria-hidden", "true");
    pending.append(marker, `waiting: ${waiting}`);
  }
  const ack = $("#ack");
  const effect = stage.effected;
  if (ack.getAttribute("data-entry") !== String(effect?.seq ?? "")) {
    ack.replaceChildren();
    ack.setAttribute("data-entry", String(effect?.seq ?? ""));
    if (effect) {
      const marker = document.createElement("span");
      marker.className = "entry-marker recorded";
      marker.setAttribute("aria-hidden", "true");
      ack.append(marker, `Step ${effect.seq} took effect at bar ${effect.effectBar}.`, document.createElement("br"), "dap.");
    }
  }
  requestAnimationFrame(draw);
}
$("#sing").addEventListener("click", () => {
  const chosen = ORIGINAL_TUNES.find((tune) => tune.id === $("#tune").value);
  if (!chosen) return;
  press({ kind: "tune", notes: chosen.notes });
  $("#status").textContent += ` ${chosen.label}; application-owned symbolic notes.`;
});
$("#sing-rhythm").addEventListener("click", () => press({ kind: "rhythm", onsets: RHYTHM }));
$("#mood").addEventListener("submit", sayMood);
