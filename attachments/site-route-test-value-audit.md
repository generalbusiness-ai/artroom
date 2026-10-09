# Site-route test-value audit — 2026-10-09

The fifteen current Site-route cases cover useful route, rendering, safety, cache and cleanup invariants. The main optimization opportunity is unnecessary Git object delivery in the test transport. No case deletion is justified by this audit.

## Evidence and scope

Exact source: 016d8e4f42e289a36f78549d946f224cbe125a32, tree ec4a897ee2e08594fc906972fc100b9170a6cdad.
The complete packages/scope/test/site-route.test.ts was read through EOF: 645 lines, 42190 bytes, SHA-256 ef4824891d06bc438a2a14c1d325b1a8aa7f2f3e6fb5a298cd2442b4f9e8256b. Static source has fifteen test declarations; no discovery ran.

Targeted production reads: packages/git/src/http-read.ts 338–445, packages/scope/src/site/route.ts 305–336 and FILE_BYTES declaration, and public Git parser exports. These are bounded source reads, not full production review or executed results. No code, configuration, compiler, tests, benchmark, provider, browser or private data was executed.

The old d026 copied file-duration cache ranked this family at 14648 milliseconds. That is a historical attribution hint, not actual current duration, exclusive CPU or a before/after benchmark. No measured saving or tenfold claim follows.

## Concrete waste

Scripted.fetch answers every git-upload-pack POST with every object in its map, ignoring the requested object. The shared setup includes big.md at FILE_BYTES+1, and the refusal case later adds an exactly-FILE_BYTES edge file. FILE_BYTES is the real one-megabyte bound. Thus ordinary receipt, guide, navigation and image reads can receive and decode unrelated megabyte blobs. The existing immutable pack cache avoids repeated compression but does not avoid consumer pack decoding and object validation.

Actual SmartHttpSource.object sends one packetized want ID. It caches verified objects by ID within a fresh bounded reader and may fetch another advertised or allowed reachable object when absent. Before serving a page, Site verifies its exact written receipt, then reads the selected commit/tree/path. These operations can remain real while the scripted transport sends only requested data.

## Builder handoff

Make the test transport respect actual bounded packetized wants, using a minimal wanted-object pack or a justified bounded reachable subset. Keep real buildPack/withTags, hashes, packet framing, advertisement capabilities, object types and production SmartHttpSource/Reader. Missing or malformed requests must fail clearly; no automatic successful fallback.

Retain only immutable encoded bytes in a bounded fixture cache keyed by the selected object's exact identity/type/content or equivalent complete subset identity. Snapshot bytes before await. A cache must not reuse Responses, tokens, mutable refs, native state or renderer output. Failed current promises must be released, and distinct wanted objects must not incorrectly share bytes. Avoid rescanning/hashing unrelated megabyte blobs for every small object request; otherwise the intended waste remains.

The independent Scripted pack-cache case deliberately tests complete-map replacement, in-place corruption, deletion/clear, failed-promise retry and fresh Responses/authentication. Preserve its distinguishing assertions. An explicit all-object mode for that case is acceptable if the route family uses the wanted-object path; do not silently weaken the cache contract or accept nonsensical want input in the real route path. If the cache witness must change, show equivalent distinguishing evidence and the exact reason. No duplicate test server or production cache framework is needed.

Preserve:
- the actual one shared native register/directory founding and recorded repository binding;
- separately qualified scripted publication/receipt fixtures and real Git receipt checks;
- original fresh token mint/revocation and remote/host/refusal behavior;
- FILE_BYTES and FILE_BYTES+1 through actual byte parsing, including the 200/413 distinction;
- conditional 304 only after valid representation/commit/path checks, and ordinary invalid targets;
- PNG bytes/type/CSP, SVG bytes/sandbox, text attachment and inert HTML/unsafe links;
- branch/tag/header-dependent ETags and all versions/navigation/index/folder behavior;
- meaningful zero-pack redirect and mutation/failure/retry cache controls.

## Why tests remain

| Family | Functional value |
|---|---|
| Markdown plus GFM fixture | Exact source rendering, repeated headings, links and documented unsupported syntax; following emitted companion/image addresses. |
| PNG/SVG/text routes | Different content types, exact bytes, sandbox or attachment behavior. |
| Refusals and real byte limits | Actual status/reason/cache headers and exact bound, rather than a scaled fixture. |
| Page/version ETags | Representation validation before304; ref-specific headers and changed publication, not only matching file content. |
| Host answers and failures | Remote comparison before mint, supported token fields, named error step and redaction, with token cleanup. |
| Index/folder/navigation/empty tree | Actual selection, ordering, title fallback, hidden listing versus direct access, breadcrumbs and recorded commit. |
| Fixture cache | Equal-count replacements, byte mutation/hash rejection, failed retry, deletion/clear and fresh authentication/Responses. |

Some assertions overlap, but their route/material/control contexts differ. There is no proved same-boundary replacement that allows a test to be deleted.

## Verification

After the builder freezes the focused test-fixture successor, use one exact fifteen-case discovery and one affected native run, preserving deadlines/retry and current exclusive fixture ownership. Record actual complete cases, failure dispositions and elapsed/CPU evidence. Do not run a separate unchanged baseline solely for this audit or repeat broad suites. One final coordinated review-head gate and independent normal Source review/landing remain required. This optimization should not delay an unrelated initial candidate if its isolated branch is not ready.
