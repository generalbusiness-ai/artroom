# Partial edit-base retrieval

This is G0b, child `7ef38e2e`, promise `39b2aca0`, under Priority 1
request `e0292346` and checker decision `637088c4`.

The existing platform `editTree` already reads only the base commit and
affected directories. The provider currently supplies a full closure
first. `readEditBase` supplies an internal partial alternative for later
integration: the verified base commit and the complete, strictly parsed
ancestor tree bodies needed by an explicit edit cohort. The result states
`coverage: "edit-paths"`. It is no closure or host-possession certificate.
No provider or production caller switches to it in this slice.

The helper requires an isolated `SmartHttpSource` and supports SHA-1 only.
Each object passes the existing Reader's type, size and hash checks;
commits and complete trees pass its parsers before edges are used. Only
verified absence in a complete containing tree can establish a new path
suffix. A denied, missing or corrupt selected object refuses the retrieval.
There is no closure fallback. Parent commits, unrelated child bodies and
the old leaf blob are not requested merely to overwrite a file.

The whole cohort is checked before I/O: at most 64 paths, the existing
1,024-byte edit grammar, well-formed Unicode, distinct encoded paths, no
file/folder conflict, and explicit depth and aggregate path-byte limits.
The existing grammar moved unchanged to the internal bytes package; the
platform keeps its original exports and behavior. The new helper adds its
own lossless-Unicode check. Tree names compare bytewise, including unrelated
non-UTF8 names. Traversed symlinks, gitlinks and file/folder conflicts refuse.
The existing editor still preserves regular and executable file modes.

## Payload and work ownership

The caller supplies distinct-object, total verified-body, path-byte, depth
and combined owned-payload allowances. Limits are copied at entry. Requests
are sequential; shared object IDs deduplicate, and an expected-type conflict
refuses. Before each request, the source receives the smaller of its
per-kind Reader allowance and the remaining total body allowance. That
limit reaches the isolated decoder's pre-inflation check.

The combined allowance must cover the source's actual fixed owned-payload
allowance, plus `5 * bytes` for parsed names and hex keys, plus
`8 * pathBytes` for path encoding and keys. Returned object bodies are
already lifetime-charged as outputs of the isolated source. The extra
payload reservation is admitted before fetching; it does not presume that
earlier caller output was freed. Only one helper may acquire from a source
at a time. Each object operation keeps the source's deadline and terminal
abandonment behavior. This helper sets no new absolute cohort deadline;
the object-count bound limits the number of source operations.

This is a per-call payload model. Engine metadata, allocator/GC behavior,
physical cleanup, measured peak memory and admission across a pool of
sources need separate evidence. No partial result escapes on refusal.

## Validation

Ten focused cases passed: six new Git cases and four unchanged platform
editor cases. Git, bytes and platform source/test compilers passed. The
real local Git witness uses a labelled HTTP adapter backed by
`git http-backend`, a thirty-commit ancestry, a large unrelated blob and
subtree, and an unrelated non-UTF8 name. The exact request set is the base
commit and three shared ancestor trees, with no leaf or unrelated bodies.
Existing `editTree` produces the same tree from partial and complete
inputs. Real Git reads the written objects, new file contents, preserved
executable mode and unchanged subtree/name back.

Other boundaries cover pre-I/O cohort refusals, formats, ownership,
Unicode, depth/path bytes, object and aggregate payload limits, symlinks,
gitlinks and file/folder conflicts. Malformed, duplicate and out-of-order
trees, wrong kinds, corrupt packs, missing wanted objects and denial use
an explicitly synthetic Node-encoded transport transcript. Fake-clock
timeout and concurrent-acquisition cases return no partial result; the
source remains unavailable after expiry.

Two focused controls remove the reverse file/folder cohort check and the
object-count check. Their existing cases fail by assertions: one observes
an unwanted fetch before preflight refusal; the other receives a partial
base where exhaustion required refusal. Both restore the original bytes.
An earlier cohort-control attempt stopped at refusal wording after the
unwanted fetch; the final witness asserts the fetch count first. Exact
hashes, heads and the single frozen-head gate are filed separately.

The original gate at `3ca544a6a878b1e0e5962c9009d45de7055b9eef`
passed typechecks and whitespace, with 1,260 Vitest cases passing and three
skipped. Its one failed case was generated Page bundle equality: moving
the shared grammar changed bundle generation. The Page build regenerated
the served module normally. The three Page asset cases then passed, as did
the previously unrun 13 Node and 55 Counter checks. Only the generated Page
module and this note changed after that gate. The original failed result and native
RefcountedCanceler console trace are retained; no cause is attributed to
that trace. No whole-suite rerun or whole-successor gate is claimed.

G1 still requires separate verified-content and same-repository retention
premises under the adopted decision. A ref advertisement or successful
partial retrieval proves neither. First-head, staging, checker snapshots,
inspection, publication and ancestry keep their current closure gates.
No provider operation, deployment, credential or GitHub connector change
is included; the full parent remains open.
