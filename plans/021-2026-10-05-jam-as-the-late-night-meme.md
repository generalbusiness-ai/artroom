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
| `pattern` | any player | A pattern per bar or per phrase, bound to the interpretation it follows and the bar it starts at. This is what the live layer renders |
| `solo` | a lead | A claimed stretch of bars; one solo at a time |
| `say` | anyone | Banter. Bounded, as the lane forms bound comments |
| `release` | a player | Gives the instrument up |

The rules are the room's own and customizable, as in the coding demo: the
instrument order, who may `interpret`, how long a solo may run. A drummer
whose grant covers drums and tries to `interpret` is refused, and the
refusal is recorded; the demo should show that once.

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

## Visuals

Meme style, and funny first. A stage, not a dashboard: instruments drawn
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
