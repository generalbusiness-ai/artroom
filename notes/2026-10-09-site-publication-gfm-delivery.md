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
