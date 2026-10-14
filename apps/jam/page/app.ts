// The page: plays the record live through WebAudio and draws the stage.
// Each bar is rendered by the same offline synthesizer as the clip and
// scheduled as a buffer at the bar's start.

import type { Phrase } from '../src/band.ts';
import { ORIGINAL_TUNES, RHYTHM } from '../src/phrases.ts';
import type { Part } from '../src/record.ts';
import { renderBar } from '../src/render.ts';
import { advance, createLive, moodNow, singNow, type Live } from './live.ts';
import { stageAt } from './view.ts';
import { captionUpdater } from './captions.ts';

// How far ahead of a bar its sound is rendered and scheduled, in seconds.
const AHEAD = 0.5;

let audio: AudioContext | undefined;
let out: AudioNode;
let live: Live | undefined;
let t0 = 0; // audio time of the session's time 0

const $ = <T extends Element>(selector: string) => document.querySelector(selector) as T;

function now(): number {
  return audio ? audio.currentTime - t0 : 0;
}

function start(): void {
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
  setInterval(schedule, 25);
  requestAnimationFrame(draw);
}

function schedule(): void {
  if (!audio || !live) return;
  const { log, rules } = live.band;
  for (const bar of advance(live, now(), AHEAD)) {
    const rendered = renderBar(log, bar, rules, { sampleRate: audio.sampleRate });
    const when = t0 + rendered.start;
    if (when < audio.currentTime) continue; // too late to play this one
    if (!rendered.samples.some((x) => x !== 0)) continue;
    const buffer = audio.createBuffer(1, rendered.samples.length, audio.sampleRate);
    buffer.copyToChannel(rendered.samples as Float32Array<ArrayBuffer>, 0);
    const source = audio.createBufferSource();
    source.buffer = buffer;
    source.connect(out);
    source.start(when);
  }
}

function press(phrase: Phrase): void {
  if (!audio) start();
  void audio!.resume();
  const bar = singNow(live!, now(), phrase);
  $('#status').textContent = `You ${phrase.kind === 'tune' ? 'played the selected original phrase' : 'played the original onset pattern'}. It takes effect at bar ${bar}.`;
}

function sayMood(event: Event): void {
  event.preventDefault();
  const input = $<HTMLInputElement>('#mood-text');
  const text = input.value.trim();
  if (!text) return;
  if (!audio) start();
  void audio!.resume();
  const bar = moodNow(live!, now(), text);
  input.value = '';
  $('#status').textContent = `The room says "${text}". It takes effect at bar ${bar}.`;
}

const PARTS: Part[] = ['synth', 'percussion', 'lead'];
const updateCaptions = captionUpdater((captions) => {
  $('#captions').replaceChildren(...captions.map((caption) => {
    const p = document.createElement('p');
    const who = document.createElement('b');
    who.textContent = `${caption.by}: `;
    p.append(who, caption.text);
    return p;
  }));
});

function draw(): void {
  if (!live) return;
  const stage = stageAt(live.band.log, now(), live.band.rules);
  $('#bar').textContent = `bar ${stage.bar} · beat ${stage.beat + 1} · ${stage.tempo} bpm${stage.key ? ` · ${stage.key}` : ''}${stage.mood ? ` · ${stage.mood}` : ''}`;
  for (const part of PARTS) {
    const figure = $<SVGGElement>(`#${part}-player`);
    figure.style.visibility = stage.arrived[part] ? 'visible' : 'hidden';
    const head = $<SVGGElement>(`#${part}-player .head`);
    head.setAttribute('transform', `translate(0 ${(stage.arrived[part] ? stage.nod : 0) * 8})`);
  }
  updateCaptions(stage.captions);
  const waiting = stage.pending.map((p) => `${p.kind} from bar ${p.effectBar}`).join(', ');
  const pending = $('#pending');
  pending.replaceChildren();
  if (waiting) {
    const marker = document.createElement('span');
    marker.className = 'entry-marker';
    marker.setAttribute('aria-hidden', 'true');
    pending.append(marker, `waiting: ${waiting}`);
  }
  const ack = $('#ack');
  const effect = stage.effected;
  if (ack.getAttribute('data-entry') !== String(effect?.seq ?? '')) {
    ack.replaceChildren();
    ack.setAttribute('data-entry', String(effect?.seq ?? ''));
    if (effect) {
      const marker = document.createElement('span');
      marker.className = 'entry-marker recorded';
      marker.setAttribute('aria-hidden', 'true');
      ack.append(marker, `Step ${effect.seq} took effect at bar ${effect.effectBar}.`, document.createElement('br'), 'dap.');
    }
  }
  requestAnimationFrame(draw);
}

$('#sing').addEventListener('click', () => {
  const chosen = ORIGINAL_TUNES.find((tune) => tune.id === $<HTMLSelectElement>('#tune').value);
  if (!chosen) return;
  press({ kind: 'tune', notes: chosen.notes });
  $('#status').textContent += ` ${chosen.label}; application-owned symbolic notes.`;
});
$('#sing-rhythm').addEventListener('click', () => press({ kind: 'rhythm', onsets: RHYTHM }));
$('#mood').addEventListener('submit', sayMood);
