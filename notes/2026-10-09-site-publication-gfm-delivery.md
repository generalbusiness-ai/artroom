# Site publication and Markdown delivery preparation

Work in progress under A1 request `6ec330fda2e3337b6626683bbe5c6ee024d33e38`
and promise `74844f2cc415b293a3359837767baa20b2852297`, and A2 request
`8aa398b21474940e726ea9183bf2987ddc914a5d` and promise
`f71346a1c4432df2b05a3fb49e2108ebdfd0fb6c`.
This is not a completed delivery, gate, deployment or Source verdict.

## Exact preparation

The branch was clean at `077df3bb9ee1f5e21a3edc0752f60baf6ef59049`,
tree `e5d8b69afe56a6484e7671c018b28c1141028879`. Merge
`0ada6ce9640c0a02f17c42a49689e63b9b1e3b90`, tree
`e3d0f002c497377e0c8f6b5d2611229446f90fbc`, carries main
`248d179a9832a4c3d4c482de2fa6b6134e0253a0`.
Only landed design documents, offline design and sprint reports were added.
Packages, tests, scripts, package files and the pages/deploy guides stayed
byte-for-byte unchanged. This preparation runs no tests, gate or deployment.

## A1: implemented current-publication seam

Source `986bd01b486e6d73041103b9b197e909883e3b4d` restricts Site to the
confirmed directory's destination and its exact recorded current branch head.
`HEAD` and the recorded branch name select that commit; host advertisements
cannot replace it. Other branch, tag and raw commit names receive
`not-published` before provider access. The versions page contains only the
room's current recorded branch. Stable GitHub repository identity and the
existing conditional-response path/type/size checks remain in force.

`packages/scope/test/site-selected-publication.test.ts` has four witnesses:
a recorded head served despite a newer provider branch; unpublished names
refused; a foreign provider repository ID refused before Git access; and
refusal leaving all destination/directory SQLite rows unchanged after restart.
The scopes, platform rules and SQLite are actual; Git provider, creation
answer, clock and inspector readers are explicit stand-ins.

This is CURRENT-only selection. `site/publication.ts:28-38` reads branch
name/head without historical publication or written-receipt proof.
`site/route.ts:252-254` rejects raw commit IDs, including the recorded head's
own ID. No historical immutable selector or Room-issued tag/version mapping
is implemented. This seam does not complete A1's immutable follow-up.

## A2: implemented completeness fixture

Source `9347f11072d37bca8277396e0eeedb607501b2f8` adds
`packages/scope/test/site/completeness/fixture.md`, its companion page and
repository SVG. The Site-route test asserts headings/anchors, emphasis,
lists/tasks, tables, fenced language code, quotes, URL/email autolinks,
relative/root/parent links, repository image bytes and safety differences.
It follows the rendered companion/image addresses. `docs/pages.md` names
the fixture and records supported constructs, escaped HTML, unsupported
footnotes/wiki links and absent syntax colouring. Links and images already
use the same room/ref prefix; no renderer extension is claimed here.

The composed renderer witnesses use a SCRIPTED publication boundary to
exercise named rows beyond the production current-only model. They do not
prove native tag/version selection or a deployment. The four separate A1
witnesses read actual destination selection records.

## Retained evidence

All logs in this table were read in full for this preparation. They are
historical producer outputs, not checks run again at the prepared head.
The summaries contain no source-head binding, so they are not a fresh
exact-head gate or independent Source review.

| Log in `/tmp` | SHA-256 | Observed result |
| --- | --- | --- |
| `artroom-site-composed-focused.log` | `cf63f1d975191be8a0b857691d65010e6a6a8d6fc17da69305aef7a223b41b24` | Two files, fifteen tests passed, 6.53 seconds. |
| `artroom-site-composed-policy.log` | `bd43e005d4305722d463d46abdb43b8ad8dc98f60db921e701748fab3a362edc` | Four A1 tests passed, 1.32 seconds. |
| `artroom-gfm-site-route-test.log` | `9a8b00880e98ac54f384f6bb694942644fddb26fd24b109093c1f797b5db762c` | Fourteen renderer/route tests passed, 6.77 seconds. |
| `artroom-site-selected-final-focused.log` | `a39d077a2436485b39004a3cabe78f9374a0e1b77ac771875cc1d2a34ac2e8d3` | Earlier parent summary: three files, eighteen tests passed. |
| `artroom-site-selected-policy-control.log` | `cc053365b7a7d5371557b5b25698c1b409f3d48afa55e4987a429e4f36dca315` | Bypassing selection returned 304 instead of not-published; one assertion failed. Source restoration is recorded. |
| `artroom-site-selected-no-write-control.log` | `39819f7b3529086bc3dbb4f07de4727c54f25fa403848b1eff90869ec837da44` | Starting outside work during refusal changed SQLite bookkeeping; one assertion failed. Source restoration is recorded. |

Earlier retained renderer failures remain at
`/tmp/artroom-site-selected-route-tests.log` (three assumptions about old ref
refusals, error-step attribution and row order) and
`/tmp/artroom-gfm-fixture-test.log` (an expected extra newline in escaped block
HTML). Later passing summaries above are distinct. The empty GFM/composed
typecheck logs do not establish exit status on their own; completion remains
producer-attributed. No test or typecheck was repeated here.

## Immutable selector and owner boundary

Planner `5825722071aaa85ecb46c1d4fdba43ae58a6d59c` assigns the merged
change's immutable Open page link to A1. Until that lands, C1 opens the latest
published page and says latest. Its claim-name premise was corrected by
`59a6744c5a97c3038751e99625ebb76b3b9e5f7b`: typed labels are local;
repository names are generated. This preparation adds no UI or name protocol.

The design at `d16134f2bca279f233aed0ea21ac93139c9e3964`, lines 615-640,
requires judged publication history, a written receipt and fetched Git/receipt
correspondence. Review `03ecea3e726a82cf917c83ab5098b908714e59b3` approves
DESIGN evidence only and explicitly adopts no protocol or source enablement.
Its review request `66c7e319a36c7d117fb5c35647bf3def8c0007a4` was reported,
awaiting requester judgment at the inspected workroom frontier. Product
direction and implementation authorization do not supply the missing native
ABI, current-use coupling, label mapping or authority adoption.

A read-only implementation design can map existing destination facts to the
receipt item, its written-vs-conflict judgment, expected `destinationReceipt`
file/ref/commit and fetched hash-checked objects. It can identify bounded
history/index reads and controls for a past published commit after a newer
publication. It must not reinterpret imported ancestry, host tags or a pending
receipt as publication, or adopt the proposed site factory/delegation protocol.

## Work still owed

- Reconcile the immutable selector's concrete owner protocol/adoption and
  implement the authorized historical proof path; retain full A1 scope.
- Observe a published page and an existing unpublished ref refusal on the
  actual deployment, including stable repository identity.
- Publish the exact A2 fixture through the room's normal authorized workflow
  and observe its relative companion link and repository image on deployment.
- Run the final material candidate's gate once, obtain complete independent
  Source review and land. C1 approval supplies none of these steps.

No observed deployment run, final gate, artifact filing or landing occurred
in this preparation. Current-publication hardening and the A2 fixture remain
preparation, not a substituted narrower definition of completion.

## Immutable selection implementation plan

This appendix is a read-only implementation plan for A1, grounded in request
`6ec330fd` and planner `58257220`. It does not adopt the evidence-only
authority amendment or enable a new route. Current source remains `068e33cd`.

The present selector returns only a branch name and its current head. It must
instead return a bounded proof for the requested immutable commit. The
destination already keeps the necessary native facts: the publication item,
the receipt item and its `written` or `conflict` state, and the entries from
which `destinationReceipt` derives the exact receipt file, Git objects and
receipt ref. No new publication act, item field, mutable provider tag or
implicit ancestry permission is needed for this seam.

The smallest internal boundary is a separate readonly method such as
`sitePublishedCommit(directoryRef, repositoryRecord, commitId)`. Its result
must bind the complete destination reference and reported head, the exact
directory reference and stable repository record, the selected content commit,
the judged first-head or publication fact, and its written receipt fact. It
also returns the expected receipt ref, receipt commit and canonical receipt
file derived by the existing `destinationReceipt` helper. A pending or
conflicting receipt gives no eligible result. This method reads destination
storage only; it does not start a turn, driver, session, token or provider call.

Implementation can use the destination's retained `receipt` pages, filtered
by the requested commit, plus direct stored entry and publication lookups.
The native state is the authority at this trusted internal Worker boundary;
the returned facts and entries must still agree by exact hash, incarnation,
kind, position, repository and commit. A scan has a fixed page and byte budget.
Exhaustion returns a named unreadable result, never `not-published` or an
invented complete index. Historical `cleaned` publications remain eligible
only through their actual publication and written receipt proof; cleanup
state alone is neither publication nor revocation of it.

The route then opens the already identity-checked Git source. Before any
conditional response, it resolves the expected receipt ref and requires its
target to equal the derived receipt commit. It reads hash-checked receipt
commit/tree/blob objects and compares canonical `receipt.json` bytes with the
derived file. It then serves the selected content commit through the existing
path, object type and size checks. Missing receipt bytes, a moved receipt ref,
foreign repository identity or correspondence mismatch denies the request.
Provider advertisements never select the content commit. Relative links and
images retain the immutable commit selector in their Site prefix.

`HEAD` and the recorded branch alias can keep the present latest-navigation
meaning while resolving to an eligible commit proof. A raw commit selector
becomes permitted only when the proof method returns that exact commit.
An older publication after a newer head must remain eligible; an arbitrary
ancestor, unpublished branch, proposal commit or imported ancestry must not.
Room-issued tag and human-readable version mappings are still a separate
native owner decision: none exists in the present destination. Do not infer
one from provider refs or advertise tags as implemented.

The likely source delta is `site/publication.ts` for proof construction,
`ScopeObject` for the typed readonly method, `site/host.ts` for its checked
boundary, and `site/route.ts` for receipt correspondence and immutable routing.
The Git reader and existing receipt-object helpers provide the byte and hash
checks. Tests belong in the real-Scope Site selector file: two actual
publications, the older commit served after the newer one, pending/conflict
receipt denied, receipt-ref/object mismatch denied, arbitrary same-repository
commit denied and complete directory/destination SQL snapshots unchanged.
The host remains a labelled stand-in until the required deployment run.

The concrete owner decision needed before source work is whether A1 adopts
this minimal existing-destination proof seam at the trusted internal boundary,
including written receipt and fetched Git correspondence, without adopting
the amendment's separate site-factory/delegation protocol. The owner must
also decide the exact immutable selector syntax and the bounded refusal for
history lookup exhaustion. Full A1 stays open for the recorded label/tag
mapping policy and its implementation; this plan does not narrow it.

A2 remains implemented fixture evidence with deployment publication and
observation owed. C1 continues to say Open latest page until immutable A1
selection is implemented, reviewed and landed. No tests, gate, deployment,
provider calls or production changes were made for this appendix.


## Adopted immutable source implementation

Planner owner decision `53142223f52080fb32d1fcfb9d130ca575888352` adopted the
minimal existing-destination proof seam above and full canonical lowercase
object-ID selector. Isolated source branch `request/site-immutable-source`
starts at `068e33cdd`, incorporates exact plan `03088c355` and main
`38b0b2f2bdb7af6f59076ac3b423741555a7b437`. This is source preparation;
no final gate, provider/deployment observation, artifact or Source approval.

The internal projection binds destination incarnation/head, directory full
reference, repository identity, content commit, judged reservation/first-head
fact and a written receipt state fact. It computes the expected receipt through
`destinationReceipt`; only native published items or the computed nonimport
founding commit qualify. The Site request verifies the provider's repository
identity, exact receipt ref target and hash-checked receipt commit/tree/blob
and canonical file before content or 304. A full lowercase 40-character ID
takes precedence over branch-like names. HEAD and the recorded branch remain
latest aliases. Relative content links/images retain the selected prefix.
No Page wording or link has changed.

Sizes of native scope/item/entry rows are queried before their JSON payloads
are allocated. Selection has fixed page/item/entry/history/byte allowances;
exhaustion returns unreadable/publication-history-limit. Git transport wire,
inflation and retained cache are capped before allocation; object/ref counts
and path traversal are bounded. Native eligibility is rechecked after the
provider read before responses, including 304. Ordinary reads do not start
scope drivers; own-host access still mints a read token and attempts revocation.
Failed revocation remains unconfirmed.

Focused witnesses extend the existing selected-publication and renderer
files and add a real two-publication witness over the shared native CLI/lane/
destination fixture. Host, scheduler, clock and memory stores are explicitly
stand-ins. The historical test reads the first published page after a second,
checks its immutable prefix and 304, snapshots every destination SQLite table,
and refuses pending/conflicting receipt, foreign identity, budget exhaustion
and forged receipt objects. SQL corruption controls are labelled boundary
controls, not fabricated native lifecycle transitions. Renderer tests retain a
scripted proof with matching receipt objects; they do not prove native authority.
Exact final focused results are recorded with the source commit below.

### Accounted tag/version dependency

There is no native destination act or registry for room-issued tags or human
version labels. Provider advertisements cannot fill that gap. A later owner
contract must identify the authorized naming actor/action, immutable published
commit and written-receipt reference, label uniqueness/replacement policy,
incarnation/revocation meaning and finite lookup budgets. It then needs an
explicit native recorded naming act and read projection before Site can list
or select it. This source adopts none of those decisions. Full A1 stays open
for that owed mapping and the original deployed positive/refusal acceptance.

### Subsequent Page delta

After this A1 source is reviewed, gated, deployed and landed, the Page owner
can change a merged-result link to `/site/<directory>/<recorded-publication-
commit>/<selected-path>`, only from the actual publication commit of the
selected merge/version. Missing proof remains a refusal; no guessed HEAD,
model-finished result or generic outbox is supplied. Current Page's Open
latest page stays accurate until that separately owned delta is delivered.

Focused source verification: final selected-publication/renderer/host run passed
21 tests in three files (7.06 s), raw `/tmp/artroom-site-immutable-final-focus.log`,
SHA-256 `978836c6ffed46a8a784532902539c940a199f4e691d738bb3a84b67bcfdf05f`.
The strengthened native history/allocation and receipt-corruption witness passed
at the final source (1 test, 1.96 s), raw
`/tmp/artroom-site-immutable-native-final.log`, SHA-256
`d91ed35056bce67e427d738416f2299c9314db78899074c2df47e1f1a46ef359`.
Scope source and test TypeScript checks passed; whitespace check passed.
Intermediate failed focused runs were retained in /tmp while their concrete
fixture expectations and bounds were corrected. No whole gate or mutation
sweep ran. These local stand-in results do not replace deployment acceptance.

Compatibility correction after root review: the current publication item's
state is not the authority for historical publication. Unlanded b8 destination
@3 moves published items through cleanup-deleted/cleanup-owed/cleaned. The
selector retains historical eligibility through the actual receipt-opening
entry's hashed `published` effect, matching integration, judged reservation
and written receipt, rather than rejecting a cleaned item. Cleanup state alone
still grants nothing. A labelled projection control changes only the folded
state of an actual @2 native publication through those three states and keeps
it eligible; removing its original publication evidence while claiming cleaned
refuses before 304. This is not a native @3 transition witness: that remains
owed when b8 and this source are composed. The strengthened focused witness
passed (1 test,2.11 s), raw `/tmp/artroom-site-immutable-cleanup-compat.log`,
SHA-256 `4727f2a82ddf3bad560d7c3a2d14ace1dbef0a521d1b2b9d7482a1316691d4e3`.
Types and whitespace checks passed. No whole gate or deployment occurred.
