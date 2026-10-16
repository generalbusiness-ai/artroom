# Archive inventory: replay consumers and decisions

This is preparation for A1c, request `02252148`, promise `48dc951f`,
under durability request `e871ba09`. The inspected local main is
`5cfbaae712063ed351fe1b2ce457240a7ffb9a13`. This note records the
implementation boundary before the manifest and layout are built. It
enables no archive and certifies no definition for export.

The adopted contract is
[section 15.3](../2026-10-09-shared-language-volatile-acts.md#153-what-is-archived).
An archive selects a fixed entry cutoff and the immutable inputs those
entries name. It never enumerates the retained store as it stands later.
The existing path and segment helpers do not perform that selection.

## Current consumers

All locations below are in `packages/replay/src/verify.ts` at the inspected
head. `#retained` calls `HistorySource.retained` at line 566. Two consumers
bypass that helper: detached text at line 583 and observation values at
line 1055. Instrumenting only `#retained` would miss both.

| Input variant | Consumers shared with every variant | Variant-specific retained reads |
|---|---|---|
| `genesis` | The pinned declared definition through `#pin` (732); every `uses` copy (1205); every `prepared` rule input (1246); detached text named by `inputTexts` (1268) | No additional direct retained read in the genesis branch |
| `act` | The same four consumers | Observation values through `#hand` (1317); field places through `placesOf` (1328), using `definition` for the definition domain and `value` otherwise |
| `delivery` | The same four consumers | Observation values through `#hand` for an observing result clause (1359) |
| `diagnosis` | The same four consumers | No additional direct retained read in the diagnosis branch |
| `timed` | The same four consumers, including its recorded `prepared` inputs | No additional direct retained read in the timed branch |
| `preparation` | The same four consumers | No additional direct retained read in the preparation branch; its required capability code is supplied by the verifier caller |
| `outcome` | The same four consumers | Owner-declared snapshots and any ancestry snapshot through `#snapshots` (1412); observation values through `#hand` (1422); owner-declared evidence values through `evidenceValues` (1424) |
| `checkpoint` | The same four consumers | No additional direct retained read in the checkpoint branch |

The shared consumers run before the variant switch. This table states
where they run, rather than claiming every variant necessarily has a
nonempty `uses`, `prepared` or text set. Platform pins use caller-supplied
code through `#code`; they do not read a retained declaration through
`#pin`. Rule inputs use a content digest; declared definitions, values and
texts each use their own existing digest rules.

`#hand` tries each retained domain that the pinned definition declares
until bytes validate against the observation's digest. Missing probes are
not selected dependencies. Only the successful domain belongs in the
manifest. If no domain supplies the named value, replay is incomplete.
The inventory must preserve the difference between an unsuccessful probe
and a required input that is missing.

Foreign-copy bodies are selected by the local entry's `uses` content
digest. Replay separately proves foreign facts through `#prove` (1219).
That can read other histories and their retained inputs. Those reads are
not additional retained files of the local archive. A copied foreign
entry is not evidence that its source admitted it; anchors retain their
explicit trust qualification.

Detached text is requested even when no bytes remain. `#settle` (609)
can then advance an owing scope to its current head to seek a tombstone.
A source wrapper that logs all verifier reads would therefore cross the
archive cutoff and would also select foreign histories. It is not, by
itself, an archive inventory implementation.

## Differences identified before the decision

The adopted table says that declarations named by declarations or fields
are followed to closure. The current verifier reads a pin once in `#pin`
and definition-domain act places in `#replay`; `#pin` validates the
declaration but performs no recursive retained declaration traversal.
The archive must not describe this as an existing verifier guarantee.
Before implementation, decide which native declaration references require
closure and how their consumers become shared with replay. Arbitrary
strings that look like digests are not references.

The inventory must also distinguish local input selection from full
history verification. A successful dependency scan is not a replay
verdict. Missing input, unsupported code, an unproved foreign fact and an
unwalked ancestry snapshot have different meanings. A snapshot's presence
does not make the ancestry walk derived again.

The private v1 admission helper in
`packages/git/src/archive-policy.ts` permits only membership@6 or an exact
definition digest in trusted checker-certified configuration. It refuses
legacy membership before inventory, and refuses custom domains or foreign
copies for an otherwise admitted cohort. The actual inventory must supply
those whole-cohort facts. Caller claims or a scan that stopped early cannot
establish their absence. This remains a whole-export refusal: it is not
permission to omit private entries or rewrite canonical history.

Texts remain explicit omissions by kind and digest. An omission by policy
must be distinguishable from an unavailable named input. No currently
uncertified domain or foreign-copy cohort gains permission from appearing
in the dependency table. Room consent, access disclosure and actual writer
admission remain required before any export.

## Source boundary decided by checker

Checker report `78127fe6` settles the technical boundary below. The
companion amendment to section 15.3 records its distinct replay and archive
purposes and the native declaration-reference grammar. Planner `191d8dec` adopts both as the design basis for inventory Source.
They remain subject to checker design approval and local merge before
dependent inventory Source lands.

Use a shared, bounded dependency selection interface at the consumers
above, with the local full scope, input variant, entry position, kind,
domain and digest. Required selections and optional domain probes must be
separate operations. The verifier keeps its current validation and report
semantics; an archive selector consumes only the chosen local prefix and
does not follow foreign histories or seek later tombstones.

Make every retained read in the verifier pass through that interface,
including text omissions and observation-domain probes. A newly added
consumer must either have a declared per-variant selection or refuse the
inventory as unsupported. Do not add a permissive catch-all kind or infer
dependencies from the current retained-store contents.

The grammar is the existing `creates()` function: typed create-definition
edges, with selected seed/definition-domain roots, shared rather than
copied. Required keys, ordered optional probes and text omissions are
separate operations. Byte validation precedes selection; every attempt,
including failed and cached work, spends one cumulative pass allowance.
Unknown consumers or owners without static declarations refuse. Ordinary
replay keeps its existing unused-child behavior; archive closure requires
the additional child bytes. Exact aggregate limits must be stated and
enforced in Source, with no complete prefix result on exhaustion.

Checker also found that the native producer stores definition-domain
values as `definition`, while replay observation/evidence consumers request
`value`. Separate Source child `a1622876` corrects that prerequisite with
native service/replay witnesses. Checker `8550dadd` approved the corrected
candidate `573c3b42`, now on local main through `77e570a1`. This prerequisite
is not an inventory implementation or export permission.

The next implementation must witness a selected cutoff followed by a turn
that retains another input: rebuilding the selected manifest reads only
its named immutable inputs. It must also distinguish text omission,
missing required input, unsupported privacy cohort and unchanged ancestry
incompleteness. Deterministic object layout and real local Git read-back
follow this selection boundary; asynchronous writer, reconciliation and
clone progress remain separate slices.

This preparation is based on source inspection. No test or gate result is
claimed for an inventory implementation, and no exporter exists in this
slice. No push or deployment ran.


Checker changes `af382b54` correct two contract details. The outcome and
delivery rows now include their definition-domain root keys as
`replay-required`; their extra static children remain `archive-closure`.
A fixed cutoff excludes dependencies named only after it, rather than
excluding bytes that happen to become available later.

A finite two-step witness is owed to inventory Source: first select a
cutoff whose root statically names an unused child with unavailable bytes.
Ordinary replay can remain consistent, but the archive manifest is
incomplete. Then make precisely that immutable child's bytes available.
The same cutoff can now complete without reading later entries, scanning
store inventory, or selecting an unrelated later input. This is a design
counterexample, not an executed archive witness.
