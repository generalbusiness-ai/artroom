# Original symbolic demo material

9 October 2026. Source delivery for Artroom workroom request
`1b9bcde79f786fc5be3ad90e9b2aeb4cc2b5df33`, promise
`a545b188dd16727fab510429f1b27a9191c7f321`, on Jam base
`2de923524ef893b50d7bd319c5cd5dcd721dfa54`.

The live page and default clip import `src/phrases.ts`. Its default THEME
is now the exact retained application-owned `synthetic-c` note array from
`spikes/j2/themes.json`; the live selector can also submit the exact
retained `synthetic-eb` array. The two arrays are distinct. “Original C
phrase” and “Original E-flat phrase” identify fixture provenance, not an
assertion that the interpreter will name those keys: its actual
most-common-note inference can differ. Neither fixture used an audio or
J0 recording. The retained JSON source is unchanged, SHA-256
`73bad19a498e3a227148922ad9a976e02d5f372920e0e7cd243e5a612b92552d`.

`RHYTHM` is a new short symbolic onset pattern authored by this builder for
this application on 9 October 2026: times
`[0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75]`, classes
`[low, high, high, low, high, low, high, high]`. It uses no recording,
transcription, known melody or private user material. The exact note and
onset bytes live in the reviewed source, not a generated audio file.

Both live and clip defaults replace the published-sketch transcription.
The page's play-phrase control deliberately selects either original
fixture; repeated presses with the same selection repeat that fixture.
The clip plan remains first phrase then rhythm, with no claim that it
records two different phrases. No microphone, model or agent-provider
call is involved; the page says so. The procedural players and ordinary
bar/lookahead/audio scheduling are unchanged.

The original three-note fixture's evenly spaced onsets are interpreted as
120 bpm and one bar, rather than the removed eight-note reference's
105 bpm and two bars. This is a consequence of the exact replacement
material, not a scheduling or interpreter change. The new rhythm also
interprets as 120 bpm, so its effect changes the onset pattern without
claiming a tempo change. Default clip plan is therefore 40 seconds; a
later actual clip/listening run must not borrow older 45-second evidence.

Caption rendering now compares author, text and order against its last
copied displayed values. Unchanged animation frames preserve caption DOM;
changed content or order updates it, including clearing the final line.
Animation, nods, pending state and audio scheduling remain on their
existing loops. No event/history eviction or capacity rule was added.

The actual loopback handler now constructs URL inside its error boundary.
Malformed percent escapes and an invalid absolute-form HTTP target return
400, and the next valid page request still succeeds. This remains a local
preview server serving the checkout, not a hardened hosted application.
Keep private files elsewhere.

## Validation and exact limits

No dependencies, packages, links, platform code, private recordings,
model/provider calls, microphone, browser, audio/video files or public
release changed or ran. A test selection initially included the existing
mood test's in-memory `renderNote`/spectral-centroid calculation. That
waveform execution was outside the intended source-only probe scope and
is disclosed; it created no audio file or output. Further waveform tests
were stopped. Final verification excludes that case and all
`test/render.test.ts`.

The final cheap symbolic checks were:

```
node --test --test-skip-pattern='two reference moods produce measurably different output' test/interpret.test.ts test/band.test.ts test/players.test.ts test/record.test.ts test/mood.test.ts test/page.test.ts test/original-demo.test.ts
node --check page/app.ts
node --check page/captions.ts
node --check scripts/serve-page.ts
git diff --check
```

Result: 43 source tests passed, zero failed; syntax and whitespace checks
passed. The HTTP test briefly starts the local preview, without browser
or audio. Log: `/tmp/artroom-jam-original-demo-checks.log`. No Artroom
gate/workerd or repeated audio benchmark ran. Rendering test expectation
is updated for the new 120-bpm fixture, but that suite was not executed.

The initial ten test failures came from the replaced fixture's note
count/period/tempo/key, not production algorithm changes: (1) synth hum
period two bars → one; (2) clip duration 45 → 40 seconds; (3) rhythm low
steps → 0/6/10; (4–6) three mood tempo assertions now 120+6/120−14 instead
of 105+6/105−14; (7) sampled live rhythm effect bar 10 → 12 at the same
20-second input; (8) hum events eight → three; (9) percussion low/high
steps follow the authored pattern; (10) tied most-sung note is first C,
not inferred G tonic, so scream is checked against C's hum. The remaining
two fixture failures were corrected for arpeggio onset after the one-bar
hum and that tied most-sung pitch. Final symbolic checks passed after
those assertion corrections. Scheduling/lead/synth/percussion code was
not changed.

## Later local manual acceptance

After independent external Source review and ordinary landing, a later
operator can run `node scripts/serve-page.ts` in the exact clean landed
checkout, use the printed loopback URL, and select Original C then
Original E-flat with play phrase, followed by play rhythm. Capture the
actual effect bars, player arrivals, mood changes, captions and any late
or skipped audio bars at desktop and narrow widths. The operator records
HEAD/tree/clean status, browser/output route and final captured-file
hashes. Current-source listening and Hugh's worth-hearing judgment remain
required; no listening, audio/video generation or release occurred here.
The earlier manual plan remains useful only with these new labels/material
and exact new source. Public recording needs its separately authorized
capture/release step. Native room authority, J0/J1/J2/model-backed musicians,
physical-device acceptance and capacity/history redesign remain owned
follow-ups.
