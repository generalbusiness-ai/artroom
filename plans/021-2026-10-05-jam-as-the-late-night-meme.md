# 021: The jam as the late-night meme

Date: 2026-10-05, 22:30 Eastern. Planner's record of hugh's direction for
the jam demonstration, replacing the story in the jam room note
(`notes/2026-10-01-jam-room.md`, revision 5) while keeping its record and
timing design. It commissions one spike and orders two that the note
already proposes. It changes no platform design.

## The story

A person at a microphone, late at night, hums or sings a few bars,
"kinda". An agent at a synth listens, works out the tune, and plays it
back as a track. More agents arrive and each picks up an instrument: the
first is always the synth, the second the bass line, the third
percussion, and then a guitar or a saxophone solos over the top. The
person hums another phrase and the band picks it up; and again, as long
as they like. The agents talk while they play. It is funny to watch and
to listen to, and it looks like the videos the story comes from: a room,
instruments that look like instruments, players who bop and nod to the
beat.

## What the room records, and what it does not

The design rule of the jam room note stands: the room records
commitments and facts; playing travels in a live layer that is never
authoritative; a committed change takes effect at the first bar boundary
at least one lookahead after the room records it.

The acts of this story, each a declared act of the jam's own definition:

| Act | Who | What the room records |
|---|---|---|
| `sing` | the person | A theme: a MIDI-equivalent encoding of pitch and timing, transcribed from the microphone, with the audio digest beside it. Nothing of the audio itself is authoritative |
| `interpret` | the first agent (synth) | The interpretation of the latest theme: key, tempo, time signature, the bar grid, and the quantized theme. Others come in on this, not on the raw transcription. One interpretation per theme; the synth's is the one in force until the next `sing` |
| `take` | an arriving agent | Claims an instrument. The rule for which instrument is by arrival order: synth, bass, drums, then a lead (guitar or saxophone). An instrument is an exclusive commitment |
| `pattern` | any player | A pattern of a stated length in bars, bound to the interpretation it follows. It takes effect at the first bar boundary at least one lookahead after the room records it, as the timing rule derives; it never names its start bar. This is what the live layer renders |
| `solo` | a lead | A claimed stretch of bars; one solo at a time |
| `say` | anyone | Banter. Bounded, as the lane forms bound comments |
| `release` | a player | Gives the instrument up |

The rules are the room's own and customizable, as in the coding demo: the
instrument order, who may `interpret`, how long a solo may run, and the
lookahead, which is a value of the jam definition's rules item, set at
founding and changed by a rules act. A drummer whose grant covers drums
and tries to `interpret` is refused; the refusal is the lane's answer to
that act, shown on the page and in the agents' banter, and nothing is
written (a refused act writes nothing). The demo should show that once.
A rhythm phrase is a second `sing` with a kind field, tune or rhythm; an
`interpret` after a rhythm sing sets tempo and grid and keeps the key.

## Where the tune is understood

Two places can turn singing into notes, and the first spike decides
between them:

1. **In the browser.** An open audio-to-MIDI model that runs in the page
   transcribes monophonic humming into pitch and timing; a pitch tracker
   alone would give pitch without onsets. The page shows the transcription
   as the theme and the person can sing again if it is wrong. The room
   records the transcription as the `sing` fact. Cheap, private, no
   round trip.
2. **In the room.** The microphone audio goes to the synth agent, which
   claims the interpretation with a model that takes audio: either a
   multimodal model with audio input or a purpose-built audio model. The
   agent's `interpret` then carries both the transcription and the
   interpretation. Slower, and the quality of "kinda singing" transcription
   by a general model is unknown.

Either way, the `interpret` act is the synth's: it fixes the bar grid and
the key for everyone else, which is the part a human band leader does by
counting in.

## The reference clip, as measured

Both links hugh gave are the same 18-second clip: a comedy sketch of a
singer at a keyboard with a comedian who cannot sing, one captioned "Me
and claude every night / Prompting my AI agents at 3am", the other with
the faces swapped for two AI company founders. Read from the frames and
the audio on 2026-10-05 (frames, loudness per second, a spectrogram and
an onset autocorrelation; no listening).

What it looks like:

- A white seamless studio, hard white floor and wall, no set. Two people
  standing. A white table with a small two-octave keyboard controller and
  an open laptop. Nothing else in frame.
- The singer stands at the left in a cardigan, hums with a straight face
  and big hand gestures, then bops: shoulders, head, a fist pump, arms up
  at the end. The keyboard player watches him, then plays with one hand
  while nodding, then laughs out loud when the track hits.
- One take, no cuts, no graphics but two caption bars in a plain white
  sans-serif: one above the picture, one across the middle. Portrait
  9:16 on one site, landscape on the other.

What it sounds like:

- 0 to 3.3 s: a voiced hum, about eight syllables at roughly three a
  second, with strong harmonics. Builder's pitch tracker (spike J0, first
  run, 2026-10-05) found eight notes, all between A2 and A sharp 3. The
  planner's first figures here named leaps to G sharp 2 and D sharp 4;
  they came from the loudest spectral bin per quarter second, which
  follows harmonics, and were wrong. It is a tune, but a silly one, sung
  badly on purpose.
- 3.3 to 7.5 s: mouth percussion, dry and regular, about four hits a
  second: the singer "drums" the rhythm.
- 7.5 s to the end: the keyboard player's track, at about 120 beats per
  minute by onset autocorrelation, bass under 1 kHz with a synth lead
  above it, loudness rising from about minus 20 to minus 14 dBFS across
  the last ten seconds. The last beat lands under a laugh.

So the clip's own shape is: tune, then rhythm, then the band, in under
twenty seconds, with the joke being that the hum was bad and the track is
good. The demo should keep that shape and that duration for its first
phrase.

## Visuals

Meme style, and funny first: a white room, a table, instruments, people
who bop. The reference is above. A stage, not a dashboard: instruments drawn
to look like instruments, a player figure on each that nods and bops on
the beat the interpretation set, arrivals that walk in and pick an
instrument up, and the banter as captions. Each agent is named by its
name and the model it runs on, as text; no provider marks. A waveform or
the bar counter is fine as a corner detail, not the subject.

## Spikes, in order

| Spike | Question | Done when |
|---|---|---|
| J0, hum to theme | Can the browser transcribe real humming well enough that a synth playing the transcription back is recognizably the tune? If not, which audio-capable model does, and how fast? | A note with observed runs on at least five real hummed phrases by two people, the transcriptions, the time each took, and a recommendation between the two places above, with the model named and its cost |
| J1, commit to bar | The jam room note's first spike: commit-to-effect timing on a deployed room, so that lookahead is known | As the note states |
| J2, riffing | The note's second spike, now with a theme fact as input: four agents, in the instrument order above, each with a prompt, producing patterns on a theme; then a second theme they pick up at a bar boundary | A recording, the patterns as recorded, and a judgment of whether it is worth hearing |

Visuals come after J2 has something to animate. The second and later
phrases are the same path as the first, so "indefinitely" costs nothing in
the record; what it costs is musical: whether the band changes well.

## What this needs from the platform

Nothing new beyond the I3 scope. Instruments are exclusive commitments;
the theme and the interpretation are facts; a player is an agent joined
by invitation with a grant limited to its instrument; the room's rules are
the jam's own definition. The jam still lives in its own repository and
waits for a room it can be hosted in.

## Amended 2026-10-06

After the jam room note's revision 8 was adopted (planner decisions
`dff56797` and `7fbe7c43`), this plan follows the note's record and
timing design where the two differed: a pattern takes effect at the
derived bar and names no start bar; a refused act is answered and shown,
not recorded; a rhythm phrase is a second `sing`; the lookahead is a
value of the rules item; and an entry's effect bar is never before the
effect bar of the entry before it in sequence. The note is the design in
force; this plan is the story.
