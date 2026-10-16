# Local archive dependency inventory

Source request `7e39eb4b`, promise `c248de8d`. Design `1815b3dd` and technical
decisions `9f5b0a32` and `372ff6c0` govern this implementation. Native pin
prerequisite `b40f8765` is independently approved and locally merged as
`8e7481ee`.

The inventory names the immutable inputs of one local scope through an
exact sequence and hash. It returns entry/object descriptors, consumer
reasons and explicit detached-text omissions. It returns no payload bytes,
writer release, authority, replay result, ancestry proof or retention lease.
There is no new route, exporter, Git writer, clone or privacy certificate.

## Admission and selection

`inventoryArchive()` uses the caller's real synchronous SQLite transaction
and one budget across these stages:

1. Read bounded native pin/seed metadata and bind the full scope reference,
   incarnation and cutoff. Legacy membership pins and unadmitted roots stop
   before local entry bodies. Check the complete native scope frame and all
   scalar positions from zero through the cutoff, including older archived
   portions. Check stored and actual byte sizes before entry JSON work.
2. Validate the pinned declaration and its static closure as permitted
   bounded declaration metadata. Classify the whole selected prefix using
   bounded native JSON metadata. Refuse foreign copies, custom domains,
   unknown entry/effect/owner/capability metadata, missing support or any
   incomplete/stopped classification. Finish reviewed inline entry-class
   admission for every position before loading a local entry body.
3. Read and validate canonical local entries for internal planning. Bind
   each to its preflight scope, sequence, hash, size and input variant.
   Shared native selectors produce typed dependencies and text omissions.
   No body or partial plan leaves this stage.
4. Classify all additional required and potential declaration roots and
   their static closure before any rule/snapshot/value payload read. Each
   present declaration needs its own exact trusted policy coverage; a
   parent's certificate does not certify a child. Complete supported
   owner/domain metadata is checked even on a selected declaration that has
   no local entry. A missing potential definition probe is distinct from
   an uncovered present declaration. A selected root must have complete
   closure. A present unclassified potential root can refuse availability
   even before an earlier ordered value probe is tried.
5. Read and byte-validate required immutable inputs and ordered observation
   probes. The first valid probe wins; failed probes select nothing and
   still spend attempts. Snapshot form/digest and recorded ancestry count
   are checked. The ancestry walk and outside evidence remain unproved.
   Detached text is omitted without reading it or following tombstones.
6. Rebind native pin and cutoff before the only completed descriptor result.
   There is no await or mutation between that fence and the result.

The policy registry is trusted reviewer/native configuration. It must
explicitly cover inline signed fields and owner evidence as well as the
exact definition. A request, digest in a set or supplied support map cannot
create that coverage. This Source configures no real policy certificate;
its witnesses use labelled stand-ins. The registry is looked up by key,
without copying or walking a global certificate list. Platform data must
match the exact compiled native version. Missing coverage refuses. Access,
consent/disclosure and writer admission remain separate prerequisites.

## Shared grammar and byte checks

Pure consumer planning lives in derive, beside the native value places,
observation rows, text grammar, owner evidence and ancestry record grammar.
Replay uses the shared selectors at its actual retained read sites. It
keeps ordinary proof/history/tombstone traversal, error behavior and trust
qualifications. Unreadable snapshot metadata remains for ordinary replay's
judge; an inventory refuses it instead of claiming no dependency.

Plans retain full local fact provenance and all eight input variants,
exact kind/domain/digest, and required, ordered-probe or text handling.
Replay-required roots and archive-only definition children remain distinct.
`creates()` is mechanically shared with native founding: direct typed
create sends in acts/receives, distinct digest edges in byte order, and
platform/self references terminating. No arbitrary-string or retained-store
inventory search discovers roots. Ordinary replay still tolerates a missing
unused child. Archive closure requires its bytes; later availability can
complete the same cutoff while unrelated later entries remain excluded.

Bytes owns canonical/hash/key helpers and imports no semantic/runtime code.
Ordinary replay keeps its existing JSON spelling rules. Archive selection
requires canonical bytes. Native definition-domain values use the
`definition` retained key, never an alias in the generic value table.

## Bounds

One pass admits at most 4,096 prefix entries, 512 retained attempts,
64 aggregate visited declaration nodes, 16,384 SQL calls, 4 MiB of projected
metadata and 64 MiB of cumulative input work, under one original 30-second
logical deadline. Limits can decrease, with no reset or top-up. Failed
probes, metadata requests and cache-hit validation requests spend the same
allowances. Native per-reply, entry and definition/grammar limits also apply.
The native namedDefinitions convention allows a root plus at most 16
additional visited children; aggregate 64 does not enlarge any one root.
Support tables additionally cap owners, kinds, preparation/record names and
value-domain declarations at 64 each, with bounded names and charged work.
A prefix with more than 64 effects in an entry is initially unavailable.

SQLite's [octet_length](https://www.sqlite.org/lang_corefunc.html#octet_length)
obtains column size from stored metadata before JSON parsing. Prefix sizing
reserves 64 full-entry byte equivalents for the fixed header and bounded
owner/effect JSON expressions. This is conservative participating input work,
not a measured CPU or heap bound. Raw transfers, scope metadata, repeated
byte validation and declaration validation spend separate charges in the
same input-work ledger. Larger prefixes can stop well below the row ceiling;
4,096 entries of 256 KiB would be 1 GiB and are not supported by this pass.

Every native call and synchronous selection checks active/deadline state.
Awaited budget mechanics also fence a delayed value before continuation,
but this inventory starts no provider task and remains synchronous inside
its owned frame. A timeout cannot publish an inventory or continue SQL.
No physical preemption or global heap claim is made. Historical scopes
without the separately approved pin index refuse; there is no backfill.

## Verification before the frozen gate

There are 23 focused native prefix/privacy/retained/inventory witnesses.
They cover genuine founding/acts and SQL read frames; full-prefix forbidden
metadata at the last position with zero local-entry/payload reads; uncovered
or custom additional roots after admitted local planning with zero dependent
payload reads; ordinary covered selection; exact 4,096/4,097 positions;
huge-row JSON-work refusal before entry JSON; cutoff/incarnation/frame/hash/
size drift; ordered probes and definition-key parity; text omission; exact
512 attempts, 64 aggregate nodes, separate root-plus-16 ceiling and measured
call/byte boundaries; original deadline and unreadable owner evidence.
Synthetic rows, certificate/support tables and owner evidence are labelled
stand-ins. They prove no admission judgment or actual archive eligibility.
Four separate budget cases cover fake SQL/clock mechanics, including a
pending read that times out and cannot later install a value or continue SQL.

The selected byte/consumer/replay/policy run passes 59 cases across four
files, including the complete existing replay verification file. Thirteen
ancestry/snapshot cases also passed at the earlier extraction. The native
missing-child witness independently keeps ordinary replay consistent before
and after later child availability at the original cutoff.

Two final inventory controls distinguish by assertion and restore Source:
skipping additional-root admission makes the final-root witness detect an
earlier forbidden rule-body read (and prevents the covered graph case from
completing); removing the per-root limit makes an 18-node root complete and
fails its limit assertion. Inventory restore SHA-256:
`6161856ec354da235106bf80ad88cbe1817e2f71e0cc1638afb4f6e0c4ff5120`.
Earlier bounded JSON-work and foreign-copy controls each fail their intended
assertion with the guard removed and restore it. Their guard text and
witness remain; subsequent frame/support checks are additional Source.

The final frozen gate and exact-head review remain to be recorded. No
push or deployment ran.
