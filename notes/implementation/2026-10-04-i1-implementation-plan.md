# I1 implementation plan: the scope substrate

Request 2186c3c2, promise aa78f7f5. Written 2026-10-04 before any source change.
Branch `request/i1-scope-substrate`, cut from main `4a7a13a1`. Main changed by
two document-only notes since the request's observation at `b6a9c0b6`; no
source differs.

The contract is the scope and replay contract, revision 7, at `05244cfb`
("the contract" below; section numbers are its own). The demo contract at
`e6ae8010` gives the scope of I1 in its sections 8 and 9.1 to 9.6.

This plan says what will be built, in what order, what is removed with it, how
each step is shown to work, and what is left to other owners. It is the
builder's working plan. It adopts nothing and changes no contract.

## 1. Packages after I1

Names are the builder's choice, as the request allows.

| Package | Directory | Holds | Depends on |
|---|---|---|---|
| `@generalbusiness/artroom-contract` | `packages/contract`, rewritten | Types and constants only: `scope`, `intent`, `entry`, `definition`, `read`, `report`, `result` (the contract's section 11.7). | Nothing |
| `@generalbusiness/artroom-bytes` | `packages/bytes`, new | The one implementation of canonical JSON, SHA-256, base32 and base64url, Ed25519 signing and checking, and the six byte domains with their digest functions. | contract |
| `@generalbusiness/artroom-derive` | `packages/derive`, new | The definition validator and its bounds; the fold of entries into items; guard, effect, send and attribution derivation; the order of due transitions. Pure functions, shared by the runtime and the verifier. The `rule` guard's evaluator, if it passes review (section 6 below). | contract, bytes |
| `@generalbusiness/artroom-scope` | `packages/scope`, new | The scope runtime: store, the commit protocol of section 5, outbox and inbox, delivery checks, reads, one Durable Object class and a Worker that routes by scope ID. | contract, bytes, derive |
| `@generalbusiness/artroom-replay` | `packages/replay`, new | Independent replay and integrity checks, the report of section 9.5, and one command that prints it. | contract, bytes, derive |
| `@generalbusiness/artroom-client` | `packages/client`, rewritten | A scope handle: build and sign an intent, submit, settle, read, follow a receipt, follow a duty. | contract, bytes |

## 2. Modules and the contract sections they implement

| Package | Module | Implements |
|---|---|---|
| contract | `scope.ts` | Section 2.1 identifiers, `Seed`, `DeliveryCause`; section 3 references. |
| contract | `intent.ts`, `entry.ts` | Section 2.1 `Intent`; section 4.1 `Entry`, inputs, messages, sends and the views. |
| contract | `definition.ts` | Section 6.1 to 6.6: definition, fields, items, acts, handlers, guard, effect, send and attention forms. |
| contract | `read.ts`, `report.ts`, `result.ts` | Section 9.1 reads; 9.5 report; 4.2 answers and every refusal reason. |
| bytes | `canonical.ts`, `hash.ts`, `encode.ts`, `sign.ts`, `domains.ts` | Section 2.1 byte domains; scope ID from a seed; entry hash; intent, message, delivery-cause and definition digests. Reviewed from `packages/log` and `packages/client` and kept once. |
| derive | `validate.ts` | Sections 6.1 to 6.4: bounds, one new item for each entry, required slots, no conflicting effects, no nascent guard, static duplicate `relate`, `genesis-timed`. |
| derive | `state.ts`, `fold.ts` | Items, revisions, the type and state index with exact counts, relationship copies, the idempotency index, pending requests, provisional and active status. |
| derive | `guards.ts`, `effects.ts`, `sends.ts`, `attribution.ts`, `timed.ts` | Sections 6.5 to 6.8 and the order of section 5.2. |
| derive | `judge.ts` | One function for each input type: from state, the input, retained inputs and one clock reading to an entry's effects and sends, or a refusal. The runtime's commit and the verifier both call it. |
| scope | `store.ts`, `sqlite.ts` | Tables `entry`, `item`, `outbox`, `inbox`, `retained_input` (section 11.6); one transaction for each commit. |
| scope | `turn.ts` | Section 5.2 steps 1 to 7 and section 5.3: the turn, the drain, snapshot, preparation, commit, the two budgets, the clock rules. |
| scope | `genesis.ts`, `delivery.ts`, `outbox.ts` | Sections 7.1, 7.2 and 7.4: founding, provisional and confirmed children, source-entry checks, the one result for each request, the attempt log and diagnoses. |
| scope | `reads.ts` | Section 9.1 with pages, cursors, exact counts and settlement. |
| scope | `object.ts`, `worker.ts` | One Durable Object class in one namespace, named by scope ID (section 2.3). |
| replay | `verify.ts`, `report.ts`, `cli.ts` | Sections 9.3 to 9.5, with limits and anchors. |
| client | `intent.ts`, `handle.ts`, `http.ts`, `binding.ts` | The scope handle over HTTPS and over a service binding. |

## 3. Order of delivery

Each step ends with its own witnesses passing and a recorded head. The whole of
I1 is filed for review as one delivery. A step is not reported as I1.

| Step | Delivers | Witnesses at the real boundary |
|---|---|---|
| S1 | `contract` types and `bytes` | Canonical vectors; each digest is over its own domain tag; a tampered byte or signature fails; an entry never contains its own hash. |
| S2 | `derive` | Definitions refused and passed by each validation rule; fold and guards over a small definition; range guards completed by witnesses or refused as incomplete; attribution with a handover; due order for equal deadlines. |
| S3 | `scope` on a store, without transport | One scope: accepted, refused, unavailable and mismatch answers; exact retry; settlement; timed expiry with head and clock races; the spent-budget cases of section 5.2; clock behind. Run on the real Durable Object storage, with a restart between entries. |
| S4 | Composition and transport | Parent and child: founding, creation, provisional child, confirmation, conflict; two distinct creations with equal message bytes; an exact repeated delivery; both arrival orders of a relationship update; wrong incarnation; diagnoses from an attempt log. One real route from the client through a service binding. |
| S5 | `replay` and `client` | Replay of one scope and of a parent and child agrees with the runtime; a forged send, a wrong hash, a missing history and a changed judgment are each reported with the right result. |
| S6 | Removal and retargeting | The replacement map of section 4 below; root scripts, runner projects, the gate, manifests and guides name only what exists. A search and a reading for the earlier meanings. |
| S7 | Measurement and filing | Gate time and install-to-review time before and after, on this machine, stated with their conditions. Artifacts and the review invitation. |

## 4. Replacement and removal

Removed in I1, with the step that removes each:

| Earlier item | Replaced by | Step |
|---|---|---|
| `contract`: `acts.ts`, `lanes.ts`, `legacy.ts`, `log.ts`, `policy.ts`, `ids.ts`, `envelope.ts`, `declarations.ts`, `transports.ts`, `index.ts`, `examples/` | The new `contract` modules; compiled examples of sections 7 and 10 | S1, S6 |
| `room`: `core.ts`, `admission.ts`, `model.ts`, `store.ts`, `log.ts`, `ids.ts`, `declared.ts`, `obligations.ts`, `room.ts`, `worker.ts`, `http.ts`, `config.ts`, `ports.ts`, `reads.ts`, `schema.ts`, `index.ts`; the copies `canonical.ts`, `crypto.ts`, `glob.ts` | `scope`, `bytes` | S6 |
| `log`: `verify.ts`, `fold.ts`, `obligations.ts`, `roster.ts`, `declared.ts`, `calls.ts`, `decode.ts`, `entries.ts`, `layout.ts`, `tree.ts`, `publisher.ts`, `cli.ts`, `index.ts`, `scripts/` | `replay`; `canonical.ts`, `crypto.ts` and `time.ts` move to `bytes` after review | S5, S6 |
| `client`: `room.ts`, `wire.ts`, `connect.ts`, `envelope.ts`, `bearer.ts`, `grants.ts`, `agents-md.ts`, `index.ts` | The scope handle | S5, S6 |
| `policy`: `acts.ts`, `validate.ts`, `steps.ts`, `vocabulary.ts`, `binding.ts`, `rules.ts`, `carry.ts`, `activation.ts`, `explain.ts`, `catalogue.ts`, `codereview.ts`, `pack.ts`, `helpers.ts`, `declared.ts`, `index.ts`, `scripts/compile-policy.ts` | `derive` | S2, S6 |
| Tables `meta`, `entries`, `explain`, `records`, `idem`, `retained`, `lanes`, `generations`, and the rest of section 11.6 that belongs to the Room's core | The five tables of each scope | S3, S6 |
| Formats `artroom-log-v1`, `artroom-policy-v1`, `artroom-policy-v2`, `artroom-steps-v1`, `artroom-legacy-v1`, protocol `artroom.v1`; bindings `ROOMS`, `REGISTRY`; `LEASE_SECONDS` | One scope binding; a hold's duration is a definition value | S6 |
| Root `vitest.config.ts` projects, `scripts/test-changed.mjs` map, `package.json` scripts, workspace manifests, `packages/room/wrangler.test.jsonc`, the testing pointer in `AGENTS.md`, `docs/testing.md` names, the sections of `docs/protocol.md` and the package guides that the new packages replace | The same files, naming the new packages | S6 |
| Tests of the removed modules | Compact witnesses of section 3 above, by the proof plan's rules: no test without an invariant, shared fixtures, no mirror of the implementation | S1 to S6 |

Not removed in I1, tracked for their own delivery:

| Earlier item | Successor |
|---|---|
| `contract`: `evidence.ts`, `landing.ts`, `roster.ts`, `checker.ts` | I2, I3 |
| `room`: `authority.ts`, `roster.ts`, `requests.ts`, `founding.ts`, `registry.ts`, `jobs.ts`, `snapshot.ts`, `artifacts.ts`, `logremote.ts`, `policy.ts`, `mcp.ts` | I3, I5 |
| `policy`: `admin.ts` | I3 |
| `packages/git`, `packages/checkers` | I3 |
| `packages/mcp`, `packages/cli`, `packages/ui` | I5 |

## 5. A decision the planner must make before S6

Every package in the second table of section 4 imports types that I1 deletes.
After S6 none of them can be compiled. Three ways to handle that:

| Option | What happens | Cost |
|---|---|---|
| A. Park them | Their files stay in place as source material for I2, I3 and I5. They leave the workspace list, the type check, the test run and the release set. A ledger in the repository names each parked package, its successor and the commit that last built it. | Main no longer builds the earlier product. The deployed spike keeps running the build of `b6a9c0b6` until E1 retires it. |
| B. Delete them now | The files are deleted. Git history at `b6a9c0b6` is the source material. | The same loss on main, and I3 and I5 fetch retained modules from history. |
| C. Keep the earlier contract alive beside the new one until I5 | Everything keeps building. | Two models in active source. The request forbids it: no legacy adapter and no dual runtime. |

The builder recommends A. It keeps the retained-after-review modules where I3
and I5 expect them, shows plainly that they are not active, and adds no second
model. S1 to S5 do not depend on this choice. S6 waits for the planner's answer.

## 6. Reviews before reuse

| Kept module | Reviewed against | Before |
|---|---|---|
| `log/canonical.ts`, `client/canonical.ts`, `room/canonical.ts` | RFC 8785 behaviour, the strict parser, and each other; one is kept | S1 |
| `log/crypto.ts`, `client/keys.ts`, `room/crypto.ts` | Key IDs, signing bytes, domain separation; one is kept | S1 |
| `policy/evaluator.ts` with `profile.ts`, `values.ts`, `integrity.ts`, `context.ts`, `inputs.ts`, `errors.ts` | The `rule` guard of section 6.5: no clock, no other item, inputs exactly as listed. The contract calls keeping this profile a proposal (point R1-8). If the review does not support it, the `rule` guard is delivered as refused `unsupported-definition` and reported as a deferred module. | S2 |
| `room/secrets.ts`, `ratelimit.ts`, `diag.ts`, `errors.ts`, `budgets.ts` | Their new role in `scope`: budgets become enforced bounds with a settlement reserve | S3 |
| `log/git.ts`, `gitcli.ts` | Not needed by I1's witnesses: the `git-read` capability is the authority note's. They are parked with their successor I3 unless the replay command needs them. | S5 |

## 7. Bounds

Every bound of the contract's section 7.5, and the definition bounds of
section 6, is a named, configurable value with the contract's proposed number
as a temporary default, labelled as such in the source. Costs measured in S7
are reported to the proof plan. The scope refuses new acts with `scope-full` at
its budget and keeps a reserve for timed, delivery, outcome and checkpoint
entries; the size of that reserve is a temporary value and is reported, not
adopted.

## 8. Interfaces left to their owners

I1 builds the base primitive and stops at the named line. Nothing here is
guessed.

| Interface | Owner | What I1 delivers | What waits |
|---|---|---|---|
| Grant freshness and the membership contract | Authority note | The `Grant` shape, the check that a grant names the action, key and scope, and `notAfter` against the commit clock. Freshness is judged through one port whose default refuses. Witnesses use a test authority that is named as one. | The real freshness proof, revocation delivery, principals from membership. |
| Platform definitions: directory, membership, rules, destination, inbox, task | Authority note, lane forms | The mechanics every scope shares: seed, genesis, founding signature, creation and confirmation. A platform name that is not implemented answers `unsupported-definition`. | Each platform definition's code. I1's witnesses run declared definitions. |
| The hold capability's tokens, workspaces and export | Authority note | The hold item, its epoch, and its timed end. | Tokens, forks, export, ancestry and pins. |
| Sends for one entry, by kind, with platform results | Scope contract point R2-13 | The contract's single bound, configurable. | A bound by kind. |
| Terminal `not-found` evidence for settlement | Scope contract, lane forms | Settlement returns a receipt or `not-found` at a position. | When absence is terminal. |
| The forms G1 to G19 that the lane definitions ask for | Scope contract, lane forms | None. A definition that uses one is refused by the validator. | Each form and its replay rule. |
| Outcomes of outside effects | Authority note | The `outcome` entry and operation and attempt numbering. | The evidence rules for a Git publication. |
| Anchors | Authority note | Caller-supplied anchors in replay. | A receipt in the repository. |
| Read sessions and who may read | Authority note | Reads answer `forbidden` through one port whose default allows only the test authority. | Sessions. |

## 9. Test economy

- Each test names the invariant it protects. A test that restates the
  implementation is not written.
- Pure derivation is tested once, in `derive`. The runtime's tests cover what
  only the runtime can show: the transaction, the clock, restart, transport.
- One shared fixture set: two small definitions, a parent and a child, and a
  key set.
- The real Durable Object storage boundary and the real service binding are
  each shown once, not once for each case.
- Tests of removed modules are deleted with the modules. None is ported to keep
  a count.
- Measured in S7: the gate, and edit to review, before and after. No claim
  about a tenfold gain is made without the measurement.

## 10. What I1 will not do

No deployment, no provider change, no registry publication, no new credential,
no work in another application. The deployed spike is not touched.
