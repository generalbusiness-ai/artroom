# Isolated Git object reads

This delivery covers G0 transport child `b0140765`, promise `6c9ee717`,
under Priority 1 request `e0292346` and checker decision `5bf37baf`.
It supplies an explicit transport mode. It does not replace a production
provider's closure read or complete the import bottleneck work.

## Select the mode

`SmartHttpSource` accepts `isolateObjects: { ownedBytes }`. Its default
mode and current callers retain their existing closure behavior. Each
source fixes its mode at construction and keeps its own cache.

Isolation requires advertised shallow and filter support. A nonadvertised
want also requires reachable-object permission. Tip-only permission does
not authorize an arbitrary tree or blob. The source requests one object,
`deepen 1` and `filter tree:0`. Explicit wants survive the filter under
[Git's pack protocol](https://git-scm.com/docs/gitprotocol-pack), and
[tree:0 filtering](https://git-scm.com/docs/git-rev-list) excludes
unrequested trees and blobs. Capability support alone does not prove that
a host accepts the request.

The source accepts a bounded, possibly empty shallow-update phase, its
flush, then NAK and an exact one-object pack. A returned shallow boundary
must name the wanted commit. The pack count and caller's object allowance
are checked before inflation. Delta and tag objects are not supported in
this mode. Default decoding still supports their existing forms. Type,
size, Git hash, wanted ID and trailing framing are checked. The caller's
Reader still checks the expected object type.

A denial, unsupported capability or malformed/over-budget reply refuses.
It establishes no absence and triggers no unfiltered retry. The returned
object and its links are verified data, not a claim of reachable closure
or ancestry verification.

## Bound owned payload and work

`maxBytes` remains the wire, inflated and cache allowance. Isolation also
requires room for a conservative working reservation of `16 * maxBytes`
beside existing cache bytes and every output payload previously handed to
the caller. The reservation covers wire chunks and concatenation,
advertisement strings, pack and Blob copies, inflation chunks and
concatenation, and the new retained/output bodies. Protocol metadata is
bounded by wire size, packet/ref counts and one pack object.

Only one operation on a source can borrow that reservation. A concurrent
operation refuses before another request or output copy. This includes
cache and ref reads. Returned bodies and ref strings remain charged for
the source's lifetime: the source cannot know when a caller releases them.
A source that exhausts its allowance refuses. It does not evict authority
or guess that an earlier output has been freed.

One absolute deadline covers advertisement, body transfer, framing and
inflation. It is not renewed for the POST. Inflation reads cancel at the
deadline, and synchronous framing checks the same deadline.

The caller's deadline does not wait for cancellation to settle. On expiry,
the source requests abort and becomes permanently unavailable, retaining
its working reservation. Later calls refuse before work. Late fetch and
cleanup continuations cannot insert cache data or charge or return output.
A late response is cancelled without consuming its body. This bounds one
abandoned operation per source; it does not prove physical cleanup or make
the reservation reusable.

This is an owned-payload model. Engine objects, platform stream buffers,
allocator behavior and garbage collection need separate measurement.
No measured peak-memory or deployed-host capacity result is claimed.

## Validation and remaining work

Nine focused checks passed, including the unchanged full-mode cases.
Git source and test compilers passed after two test-only type corrections.
The new cases use a labelled HTTP adapter stand-in backed by real local
Git. Four explicit object reads each return one pack object and transfer
less than 5,000 response bytes together, beside a forty-commit history
and a large unrelated blob. Tree/blob wants exercise empty shallow phases.
The unchanged full-mode read of that head refuses its fixture byte budget.

Controls cover missing capabilities and tip-only permission before POST,
malformed/duplicate/unrelated boundaries, missing flush, extra/missing or
wrong-kind objects, byte and pre-inflation limits, tags, concurrent
reservation pressure, caller-copy charging and a deadline advanced at an
actual response boundary. No test sleeps on the wall clock.

The original gate at `88dd5011fde88dc95d1175871af2a16039df2cc1`
passed typechecks, whitespace, 1,249 Vitest cases (three skipped), 13 Node
checks and 55 Counter checks. The checker then found that pending stream
cancellation could keep the caller waiting indefinitely. The successor
adds terminal abandonment and two fake-clock cases: stalled reading and
bad-response cleanup whose cancellation never settles, plus late fetch
and cleanup settlement. All entry points remain unavailable afterwards;
the late valid pack body is never pulled. The corrected source and tests
passed the nine focused cases and Git source/test compilers. The whole
suite was not repeated; the original gate is not a successor gate result.

One distinguishing control removes only the caller's inflated-size guard.
The existing malformed-zlib boundary then fails because inflation is
reached instead of the required allowance refusal. The original source
bytes are restored. A second control removes only the outer completion
race while retaining expiry, abort and terminal state. The pending-cancel
case then fails its caller-settled assertion at the fake-clock deadline
while bad-response cancellation remains pending.
The original source bytes are restored. Exact heads and evidence pins are
filed separately.

No provider, credential, namespace, deployed Worker or publication changes.
Current first-head, staging, checker snapshot and ancestry paths keep their
full closure requirements. G1 retained-base/host-possession and publication
custody contracts, bounded path editing, room queries and directory lifetime
remain owed under the parent. No GitHub connector implementation is included.
