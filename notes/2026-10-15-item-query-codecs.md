# Bounded item-query arguments and cursors

G2q-a is child `4cccd0b7`, promise `54b50412`, under Priority 1 request
`e0292346` and adopted decision `69a33abc`. It follows landed G2p-b
`3fbeaf39`. This is pure wire support. It enables no route, read name,
session claim, admission path, SQL query, public client transport or authority.

An `ItemQuery` explicitly carries version 1, a full ScopeRef, item type,
selected states, IDs, requested row limit and cursor or null. The initial
page binds the scope incarnation before any cursor exists. Names are
nonempty well-formed UTF-8 of at most 64 bytes. States are byte-sorted unique
names, at most 16. IDs are sorted unique nonnegative safe integers, at most
100; negative zero is invalid. Null IDs mean all matching IDs; empty IDs or
states select nothing. The row limit is from 1 to 100. No empty-list form
broadens a query.

Raw input is canonical JSON, at most 8 KiB of actual UTF-8. Character and
byte caps precede parsing. A lexical scan caps nesting at three before the
strict parser; quotes and escapes inside strings do not count as structure.
Exact fields, shapes and canonical bytes follow. Decoded queries and their
lists/reference are frozen. Unknown type/state existence is not decided
by this codec; an authorized runtime must check the pinned definition.
Typed local encoders preflight finite fields and counts before serialization,
then check the whole serialized query before any selection or argument hash.
JSON escaping can make otherwise small fields exceed the whole query cap.
These producer APIs are not a substitute for raw admission of a remote tree.

`itemQueryDigest` binds full scope, version, type, states, IDs, requested
limit, ascending numeric-ID order and every fixed resource bound. It excludes
the current cursor to avoid self-reference. `itemQueryArgument` uses a separate
domain and includes exact cursor bytes or explicit null. Its tagged SHA-256
argument is always 86 ASCII bytes. A later page therefore needs a newly
exactly bound read; the summary literal is never its argument.

The fixed bound record includes 100 rows, 16 states, 100 explicit IDs, 1,616
metadata candidates, 128 KiB metadata, 256 KiB serialized payload, 64-byte
names, the query/cursor byte limits and nesting limit. The candidate and
metadata maxima agree with the reviewed G2a primitive. This codec performs
no metadata selection, body admission, envelope assembly or completeness
judgment; the runtime must still enforce those bounds and reserve framing.

A cursor is strict canonical unpadded base64url with the `iq1.` prefix and
a 2-KiB encoded limit and ASCII-alphabet admission before decode. Its exact schema binds full scope,
head sequence/hash, selection digest, version, order, the whole fixed bound
record, requested limit and last emitted numeric ID. Decode is finite, strict
UTF-8 and canonical JSON, with the same nesting admission. Immutable decoded
scope/head and the frozen bound record prevent alias changes. Typed encoders
refuse an altered bound record rather than silently normalizing it.

Continuation checks take an already authorized expected full scope/head.
They distinguish malformed cursor, query mismatch, wrong query scope and a
stale cursor at another scope incarnation or head. A null cursor starts at
null; a present empty string is malformed, not an implicit first page.
No helper fetches private scope state or authenticates a caller. Runtime code
must authorize before using these semantic results or disclosing their reason.

The cursor is continuation, not authority, integrity or proof that earlier
IDs were read. A caller can encode another last ID. Fresh page authorization
and exact arguments remain necessary. A future `complete` result means only
that the selected suffix is exhausted at one head, not a whole inventory or
verified prefix. Same-head runtime traversal and consumer drift/restart policy
are still required work.

The existing UTF-8 `byteOrder` implementation moves unchanged to Bytes.
Derive imports and re-exports it under the same name, so existing users keep
their API and ordering. The new codec uses that one implementation without
adding a dependency from Bytes to Derive.

Eight pure Node cases cover canonical shape/immutability, UTF-8 versus UTF-16
state order, exact count/spelling edges, empty semantics, duplicate/unsorted/
unsafe IDs, whole escaped-payload admission before hashing, and nesting before
JSON parse. Spies observe no parser/hash calls for the refused inputs.
Independent Node SHA-256 agrees with the exact domain-tagged argument and
selection bytes. Cursor cases cover strict encodings/schema/bounds, full
resource/head drift, query mismatch and deliberately forgeable last IDs.
Seven existing timed-rule cases exercise the unchanged Derive re-export;
Bytes and Derive source/test compilers pass.

Five targeted controls fail by assertions and restore exact codec bytes:
removing cursor binding collapses distinct page arguments; bypassing whole
query admission creates a hash for an oversized escaped payload; omitting
lexical depth admission invokes JSON parsing; ignoring head equality accepts
a stale continuation; removing ASCII admission invokes base64 decoding for
multibyte text beyond the byte cap. No timeout/compile-only failure or mutation sweep is
counted. An initial fixed-width test expectation of 85 was corrected to 86;
its independent hash already agreed. An initial nonexistent Derive test-file
filter selected only the eight Bytes cases; the actual seven timed cases were
then selected explicitly. Four original controls preceded the final ASCII
preflight; their raw results are retained, and the final controls were run
again after that guarded file changed.

The one frozen gate at `540e0555` passed installation, whitespace and all
types, then reported 1,328 passing Vitest cases, three skipped and one failed
Page asset comparison. Moving the shared byte-order function changed the
bundle's order. The normal local Page build regenerated the checked-in asset;
its one comparison case then passed. The previously unrun 13 Node script
cases and 55 Counting browser-module cases also passed. The final changes
after the gate are this report and that generated asset; no whole gate or
whole suite was repeated. The original failed gate remains part of the
evidence and is not described as a passing gate.

The raw gate includes scripted reset/retention faults, Git HTTP body-text
warnings and a native `RefcountedCanceler` cross-object I/O diagnostic. The
previous landed G2p-b gate contains the same diagnostic text and stack site.
Vitest reports no separate unhandled-errors section, but that does not resolve
the runtime diagnostic or prove physical cancellation or draining. This pure
codec slice makes no such claim.

There is no native SQL, deployed runtime, heap, wire-buffer, global resource,
mutation authority, authentication or full G2 completion claim. `SignedReadName`
and existing read validators/admission remain unchanged until all scoped
admission/preparation/final checks and transport are implemented together.
Native indexed execution, signed bootstrap, session response binding, byte
framing, visibility, coherent pagination and bounded consumers remain owed.
