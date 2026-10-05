# I3 implementation plan: platform definitions, authority, effects and publication

Written 2026-10-05, before any source change. Branch
`request/i3-authority-effects`, cut at `50bba45c`.

This plan says what I3 builds, what stands under it, which parts can run
now, what waits and on whom, what is removed, how each part is shown to
work, and what must be asked. It is the builder's working plan. It adopts
nothing and changes no contract. No file under `packages/` was changed to
write it.

The texts it reads, and the short names used below:

| Short name | Text | Standing, as the commission gives it |
|---|---|---|
| The commission | The I3 source commission, read whole | Binding |
| The authority note | Authority, effects and publication, revision 16, at `7bc60cf6` | Adopted |
| The contract | Scope and replay contract, revision 12 as amended, at `53f0e183` | Adopted |
| Revision 13 | The contract's revision 13, at `7efb0f7f` | Under review, changes requested. Proposed, not adopted. Request `c75205df` owns it. |
| The proof plan | Proof and test economy, revision 9, at `85be9f0b` | Adopted |
| The recovery design | Recovery successor, revision 4, at `16777d97` | Adopted. Its interfaces are shared with IA. |
| The demo contract | Demo contract, revision 4, at `3b6e1ad7` | Adopted |
| The four asks | What the contract's revision 12 asks of the authority note and revision 15 did not answer (the note's opening, lines 363 to 370) | Owed by the successor of request `406983fe` |

Section numbers with no name are the authority note's. A source path that
begins with a package's name, such as `scope/src/ports.ts`, is under
`packages/`. Line numbers are those of `50bba45c`.

How this plan was made is stated in section 10, with what was read in
full, in part, by a delegated reader, or not at all.

## 1. What I3 delivers, and what it does not

I3 delivers real authority, real outside effects and real publication on
the scope substrate.

- Six platform definitions: `platform:register@1`, `platform:directory@1`,
  `platform:membership@1`, `platform:rules@1`, `platform:destination@1`
  and `platform:inbox@1` (sections 12.1.1 to 12.1.6).
- The authority port and the readers port, filled: an observation of
  membership, its windows, the grant guard, and read sessions bound to one
  repository (sections 3.3 and 3.9).
- Device enrolment, revocation and recovery (sections 3.5 and 3.6).
- The code of `hold@1` and `git-read@1`: records, preparation, the fork,
  the token, the lane's fence answer, the ancestry check and pins
  (sections 5.1 to 5.7 and 6.2).
- Checker authority: configurations, the service's origin read, signing,
  one run for a job, and late results (section 3.11).
- The gateway and the ledger of outside effects, in which an unknown
  outcome keeps its own identity (sections 5.3, 5.4 and 8.1).
- The destination: an exclusive reservation, one compare-and-set, a read
  that decides, and the receipt (sections 6.4 to 6.10 and 12.2).
- The operator's record of incidents and the two lists of requests that
  wait (section 12, G13 and G17).
- The removal of every earlier path that section 11 gives to I3.

I3 does not deliver:

- **IA's work.** The seventh definition, `platform:task@1`, and the agent
  runtime. I3 supplies the interfaces that IA shares: the `instance` and
  `token` steps, the lane's fence answer, the receiver pin and the license
  entry, the fork's seed, and the gateway's route. Section 3 lists them.
- **I5's work.** Browser pages, the command line and the tool server. The
  device pages, the inbox page and the admin's pages are I5's. So is a
  device key that a real browser makes and keeps.
- **I6's work.** The joint walkthrough on a deployed instance, and the
  retirement of `docs/protocol.md` section by section.
- **E1's work.** Every resource and credential of the earlier
  deployments. I3 deletes none, lists none and settles none.
- **A provider session or a probe.** The proof plan's host session (cases
  HS1 to HS7) and the recovery design's stage-one probe each need their
  own commission. This plan launches neither.
- **A deployment, a registry publication or a new credential.**
- **Delegation** (U6), **collections** (U4), **an export across lanes**
  (the second half of U15), and **a send outside the application**
  (section 9). Each has its own later request.

The commission keeps the whole product: every gap G1 to G18, every choice
U1 to U21, every assumption H1 to H6, all five capacity dimensions, and
the limits on items and on reserved completions, with request
`cc570904`. This plan drops none. Where one cannot be built yet, section
4 says why and who decides.

**One limit decides the shape of the delivery.** Four rules of the six
definitions need bytes that the adopted `Entry` and `Send` types have no
member for (P19, P20, P21 and P23 of section 4). Until an owner rules on
each, a real directory cannot create a lane under an activated
definition, and a real lane cannot find its membership. Everything else
can be built and shown. So the plan ends in milestones that each stand
alone (section 9.3), and the full I3 is not claimed until those four
rules have an owner's answer.

## 2. What stands under it

| Base | Head | Standing | What this plan assumes of it |
|---|---|---|---|
| Main | `3dc8492b`, as this worktree last fetched `origin/main` | Landed. Holds I1. | The substrate: the commit protocol, the fold, delivery, timed rules, replay of one scope, and ports whose production defaults refuse. |
| I2, second head | `50bba45c` | Filed for review. Not landed. Not accepted. | The 38 forms of the I2 delivery note, the two lane definitions as pinned data, the capabilities port, the scripted test capability and scripted peers, and the genesis `kind`. |

This plan claims nothing about I2's review. It prepares beside it. The
gate was run once at `50bba45c` for this plan: it passed, with 282 tests
of vitest and 3 of Node's runner (observed, one run, section 7.5).

**If I2's review changes its head.**

| Change in I2 | Effect on this plan |
|---|---|
| A repair that changes no form and no bytes | Rebase. No step changes. |
| A lane row or a form changes | The two pinned digests change. Steps 16 and 30 read the definitions by digest from the lanes package, so they follow. No platform definition names a lane digest. |
| The scripted capability or the scripted peers are refused by an owner | Steps 16 and 30 remove them in any case. Until then the I2 scenarios that use them go with them, as the I2 delivery note says. I3's own tests use neither. |
| The rule `unsupported-definition` for a whole scope is changed | Step 3 changes: the platform's capability code is supplied through the same port, so one predicate moves. |
| The genesis `kind` (the contract's section 11.10, row 10) is not adopted | The register's `genesis` slot names a fact of kind `establish` (section 13.7). It then cannot be checked by a reader under another definition. Step 9 holds that one slot and reports it. |
| I2 does not land before I3 is ready for review | I3 is reviewed as a branch on top of I2's head, and lands after it. No I3 milestone is filed as landable before I2 lands. |

## 3. The scope table

Every element of sections 11, 11.1 and 11.2, one row each.

"Boundary" is the real boundary that the element crosses. "Now" means it
can be built and tested on the adopted texts. "Part" means the row has a
piece that waits, and section 4 names it.

### 3.1 Where things live

Three new packages, and additions to five that exist.

| Package | Role | Why here |
|---|---|---|
| `packages/platform`, new, `@generalbusiness/artroom-platform` | The six definitions. Each is one `DeclaredDefinition` value, in the canonical form that section 12.1 gives, and one module of the rules that no form can say. It depends on `contract`, `bytes` and `derive`. It reads no clock, no storage and no network. | The existing layout gives each package one role. `derive` and `scope` hold no definition, and `scripts/active-source.test.mjs` already keeps the lanes out of them. The declarable part is data, so the same validator checks it. |
| `packages/git`, new, `@generalbusiness/artroom-git` | Everything that touches a Git repository or a Git host: the object reader, the commands, the push outcome, the gateway's ref fence, the host port. | It crosses an outside boundary, needs the `git` program in its tests, and is the home of the retained code after review. It runs in Node and in a container, never in a scope's commit. |
| `packages/checkers`, new, `@generalbusiness/artroom-checkers` | The checker service: its origin read, its outcome store, its signer and its runner. | It is a separate service with its own key (section 5.5). It is not a scope. |
| `contract` | Types only: the kind `register`, the seventh platform name, the `preparation` input, `Observation` and `ObservationUse`, the evidence of an outcome, and the records and steps that section 5.7 adds to `CAPABILITIES`. | The contract's section 11.7. |
| `derive` | Pure judgments: the grant guard, a preparation, an operation's opening and its outcomes, the ledger rules, the rules of the two capabilities, the ancestry walk, and records in the fold. | The testing guide puts a pure decision here, once. |
| `scope` | The runtime side: the observation read and its cache, sessions, the operations driver beside the outbox, the operator's record, and the production wiring. | It owns the turn, the store, the clock and the alarm. |
| `replay` | The grant derived again from membership's history; the rows "Preparation", "Outcome", "An observation" and "An ancestry record" of the contract's section 9.3. | It owns the verifier. |
| `client` | A request for a read session, and the `preparation` request. | It owns what a client builds and signs. |

`packages/scope/src/worker.ts` is the production entry. It will import
the platform package and the capability rules, and supply them through
ports. No platform package imports the lanes package. The check in
`scripts/active-source.test.mjs` stays, and gains the three new packages.

**A platform definition as data.** Section 12.1 says that a platform
definition is pinned by name and version, that its meaning is the note's
text, and that source holds "as much of it as data as it can". The
contract's section 6.1 says that a platform definition is code. Both are
kept, this way:

- The declarable part of each definition is one value of
  `DeclaredDefinition`, whose `name` is the platform name without its
  version.
- `validateDefinition` checks it whole. The validator refuses a name that
  begins `platform:` today (`derive/src/validate/index.ts:101`). Step 2
  adds one option that only the platform package passes. A declared
  definition from an input is still refused.
- No digest pins it. The test that validates it also checks that the
  value did not change without a change of version or a recorded reason.
- Each rule that a table of section 12.1 marks "Code" is one named
  function, keyed by its definition, its entry and its P row. Section 4.2
  says what such a function may do.

### 3.2 The elements

| # | Element | Section | Lives in | Boundary | Build and test now |
|---|---|---|---|---|---|
| 1 | The register | 12.1.1; 3.8 | `platform/src/register.ts` and its rules; `contract` for the kind and the name; `derive/src/genesis.ts` for the fourth cause | Scope storage. Another scope: the directory. A Git host: `create-repository`. | Now, with a labelled host stand-in for the creation. The real creation is the host session's. |
| 2 | The directory | 12.1.2 | `platform/src/directory.ts` and its rules | Scope storage. Other scopes: its three children, each lane, the rules scope. A Git host: `import`. | Part. Founding, the three creations, `index`, numbers and `compromised`: now. `open-issue` and `open-pr` under an activated digest: wait on P19 and P21. `open-task`: the row is built, and its scope is IA's. |
| 3 | Membership | 12.1.3; 3.1; 3.2 | `platform/src/membership.ts` and its rules | Scope storage. Another scope: an inbox, the directory. A device key. | Now. Test keys are real Ed25519 keys. A key that a device holds is I5's. |
| 4 | The rules | 12.1.4; 3.11 | `platform/src/rules.ts` and its rules | Scope storage. Another scope: a lane, membership. | Part. `publish`, `rules-wanted`, `retire-definition`: now, less the `not-a-checker` check (P19). `activate` and `keep-configuration`: wait on P21. |
| 5 | The destination | 12.1.5; 6.4 to 6.10; 12.2 | `platform/src/destination.ts` and its rules; `git` for the writes | Scope storage. Another scope: a change lane, the directory, membership, the rules. A Git host. A container. | Now for the scope and its judgments, on a real local repository. The real host and the real container are the host session's. |
| 6 | The inbox | 12.1.6 | `platform/src/inbox.ts` | Scope storage. Another scope: a lane. | Part. The definition and its handler: now. The address of a notice from a lane: waits on P23. |
| 7 | The authority port, the observation and the grant guard | 3.3; 3.12 | `derive/src/grant.ts`; `scope/src/authority.ts`; `contract` for the types | Another scope: membership, read before the turn. The clock. | Now for a platform scope. For a lane, part: its membership reference waits on P20. |
| 8 | Retained observations and freshness | 3.3; the contract's 16.1 | The same, with `replay/src/verify.ts` | Scope storage: the entry retains the observation. | Now. |
| 9 | The read port and read sessions bound to one repository | 3.9 | `scope/src/sessions.ts`; `client/src/session.ts` | A deployment secret. Two clocks. | Now, with a test secret. The secret's custody is the operator's. |
| 10 | Device enrolment, revocation and recovery | 3.5; 3.6 | `platform/src/membership.ts`; the serving limits in `scope/src/limits.ts`, after review of the parked rate limiter | Scope storage. A device key. A caller's address. | Now. |
| 11 | `hold@1` records and preparation | 5.7; the contract's 5.5 and 6.11 | `derive/src/prepare.ts`; `derive/src/capability/hold.ts`; `scope/src/core.ts` for the route | Scope storage. | Now for `root`, `pin`, `check` and `receiver-pin`, which the contract declares. Part for `fork`, `token` and `instance`: what makes a hold have a workspace is owed (section 13.7; question Q3). |
| 12 | The fork | 5.1; 5.2 | `derive/src/capability/hold.ts`; `git/src/host.ts` | A Git host: create, delete. | Now, with the host stand-in. The real fork is stage 2 of the proof plan's boundary B7, with IA. |
| 13 | The token | 5.3; 5.4 | `derive/src/ledger.ts`; `scope/src/operations.ts`; `git/src/host.ts` | A Git host: mint, revoke. | Now, with the host stand-in. A real mint is the host session's. |
| 14 | The fence | 5.2 | `scope/src/reads.ts`, the hold-status read; `derive/src/capability/hold.ts` | The lane's own state and clock. | Now. The runtime that asks is IA's. |
| 15 | Ancestry | 6.2; the contract's 16.4 | `derive/src/capability/ancestry.ts`; `git/src/reader.ts` | A Git repository: objects and refs as read. | Now, on a real local repository. |
| 16 | Pins | 6.2 | `derive/src/capability/hold.ts` | Another scope: a change lane. | Now. |
| 17 | `git-read@1`: the guard, and the step `job-read` | 3.11; 6.2 | `derive/src/capability/gitread.ts` | A Git host: a read token, a snapshot repository. | Now, with the host stand-in. |
| 18 | Checker authority and configuration | 3.11 | `platform/src/rules.ts`; `checkers/src/job.ts` | Scope storage. Another scope: the change lane's job entry. | Part: a configuration's bytes wait on P21. |
| 19 | Checker signing and late results | 3.11; 6.3 | `checkers/src/signing.ts`, `service.ts` | The checker's key. A container. | Now for the service and the signer. A run on the real runner needs a deployment (question Q8). |
| 20 | The gateway | 5.3; 6.1; 6.6 | `git/src/gateway.ts` | A Git host over HTTPS. The token's plaintext. | Now, against a local HTTP stand-in for the host's endpoint. |
| 21 | The outside-effect ledger and unknown duties | 5.4; 8.1 | `derive/src/ledger.ts`; `scope/src/operations.ts` | Scope storage. The alarm. | Now. |
| 22 | The destination's exclusive reservation | 6.5 | `platform/src/destination.rules.ts` | Scope storage: one commit. | Now. |
| 23 | Compare-and-set, readback and the lost reply | 6.6 | The same, with `git/src/gitops.ts` and `push-outcome.ts` | A Git host. | Now, on a real local repository. H1 and H2 at the chosen host are the host session's. |
| 24 | Receipt publication | 6.10 | The same | A Git host. | Now, on a real local repository. |
| 25 | Operator incidents and lists | 12, G13 and G17 | `scope/src/operator.ts`; two reads in `scope/src/reads.ts` | Storage outside every history. | Now. The pages are I5's. |
| 26 | Capacity for the capability and the six definitions | 5.8 | `derive/src/reserve.ts`; `derive/src/validate/capacity.ts` | Scope storage. | Part. Entries: now. Records: now, as I3 brings the records. Items, bytes and pending requests: with `cc570904` (question Q5). |
| 27 | The retained Git reader, reviewed | 11.1 | `git/src/reader.ts`, from `parked/log/src/git.ts` | A Git repository. | Now. |
| 28 | The retained runner and signer, reviewed | 11 | `checkers/src/runner.ts`, `sandbox.ts`, `signing.ts` | A container. | Now for the review and the pure parts. |
| 29 | The join under load | 11.1; 3.6 | `scope/src/limits.ts` | A caller's address; memory. | Now. |
| 30 | A device that is offline is not revoked | 11.1; 3.6 | No code of its own: nothing reads a connection. | None. | Now: a row of the revocation witness. |
| 31 | An abandoned reader of a stream, the service's side | 11.1; 3.9 | `scope/src/sessions.ts` | A transport. | Now. |
| 32 | The grant in a replay | 11.2, G18 | `replay/src/verify.ts` | Membership's history, as read. | Now. |

Counts, made by hand over the last column: 32 elements. 23 can be built
and tested whole now, in-process, on the adopted texts. 7 are part. Five
of those wait on the contract's owner, request `c75205df`: rows 2, 4, 6,
7 and 18. One waits on the successor of `406983fe`: row 11. One waits on
`cc570904`: row 26. Two more, rows 19 and 28, can be built now, and their
evidence on a real runner needs a separate commission. No row waits on
IA. A full run from a founding to a merge crosses rows 2, 4 and 7, so it
waits with them.

**The interfaces shared with IA.** I3 builds and owns each. IA uses them.

| Interface | Section | I3's side |
|---|---|---|
| The step `instance` and its record, with the hold's epoch | 5.7; 5.9 | The preparation entry and the record. |
| The step `token`, and the gateway's route for the token | 5.3; 5.7 | The record, the mint, the revocation, the route. |
| The lane's answer to a fence check | 5.2 | "Held, and this instance", from the lane's state and clock. |
| The fork, and its seed as the first push's expected old value | 5.2; 5.9 | The record and the creation. |
| `export-license`, `export-settled`, the receiver pin and the license entry | 4.2 | The guards `license` and `settled`, the effects, and `decided`. |
| The evidence row of a push to a hold's fork | 5.7 | The row's type. IA records the attempt. |

## 4. The gap table

Section 12.1.8 lists 25 forms, P1 to P25. This table sets each against
the source at `50bba45c`, the adopted contract, and revision 13 as a
proposal.

### 4.1 The four statuses

| Status | Means |
|---|---|
| Built | The form is in the source at `50bba45c`. That source is under review and is not accepted. |
| Agreed, I3 builds | The adopted contract has the form. I3 implements it as the contract states it. |
| Platform code | No adopted form says the rule. The authority note says that it is "platform code in the delivery named". Section 4.2 says exactly what that allows. |
| Blocked | The rule needs bytes that no adopted type holds. An owner must rule before it can run. |

### 4.2 What "platform code" means

The authority note uses the term for a rule that no form says. This plan
holds it to three limits, so that no proposed byte is adopted by being
built.

- **For the validator.** The declarable part of the definition validates
  whole, as data. The rule is not in the data. It is one named function in
  the platform package, in a table keyed by definition, entry and P row.
  The validator does not read it. A test lists the table, so a rule cannot
  be added without its row.
- **For the runtime.** The function runs in the commit, as the judges do.
  It is a function of the folded state, the one input and the entry's
  retained inputs. It reads no clock but the commit's reading, no storage
  and no network. It may refuse, and it may add effects and sends. Each
  effect is a member of the adopted `Effect` union, and each send a member
  of the adopted `Send` type. It adds no member to an entry, an input, a
  message or an envelope. An entry that it writes is checked by the same
  four checks as any other.
- **For replay.** A platform definition is pinned by name and version. A
  verifier that has the platform package derives every such entry again
  with the same function. A verifier without it answers
  `unsupported-definition` at the genesis, as the contract's section 6.1
  says. Nothing is trusted because code wrote it.

A rule that cannot be kept inside those limits is not platform code. It
is blocked.

### 4.3 The table

| # | Form | At `50bba45c`, checked | Adopted contract | Revision 13, proposed | Status |
|---|---|---|---|---|---|
| P1 | `name` in a definition; `under` compared with it | Present: `derive/src/validate/index.ts:91`; `scope/src/namespace.ts:83`. A name that begins `platform:` is refused: `index.ts:101`. | 6.1 | Nothing asked | Built. Step 2 adds the platform option. |
| P2 | The kind `register`; `platform:register@1`; a scope with no creator that is not a directory; the fourth cause | Absent. Seven kinds and six names: `contract/src/scope.ts:16` and `:34`; `bytes/src/ids.ts:53`. A founding makes a directory with `creator: null`: `derive/src/genesis.ts:71`. Three causes: `genesis.ts:34` to `:40`. | 2.1, 7.1, 7.2; the row "The `register` kind" of 11.8 | "I3's" | Agreed, I3 builds |
| P3 | A handler's `class`, `fields`, `opens`, `copies`, `settles` | Present: `derive/src/validate/handlers.ts:203` and `:217`; `settles` at `:116` | 6.4, 7.3 | Nothing asked | Built |
| P4 | `via` and `one` in `also` | Present: `validate/handlers.ts:57` to `:70` | 6.4 | Nothing asked | Built |
| P5 | The operands `sender`, `source`, `update`, `result`, `scope`, `intent`, `item`, `element`, and parts | Present: `validate/operands.ts:30` to `:34` | 6.5 | Nothing asked | Built |
| P6 | `if`, `unless`, `reason`, `each`, `has`, `anyOf`, a `count` bound from an operand | Present: `validate/guards.ts:10`, `:66`, `:204`, `:213`, `:237` | 6.5 | Nothing asked | Built |
| P7 | A `tell` addressed by `{ slot, of }`; a `relate` to the sender | The `tell`: `validate/sends.ts:131`. The `relate`: `sends.ts:138`. That its `to` takes the operand `sender` was not traced line by line. It rests on the I2 plan's row 46 and its test. | 6.6 | Nothing asked | Built. Step 2's validation of the rules definition is the check. |
| P8 | The `record` type; a `fact` type with a list of kinds; a detached text | Present: `validate/fields.ts:15`, `:34`, `:36`, `:57` to `:65` | 6.2 | Nothing asked | Built |
| P9 | A `preparation` input; capability records, guards, effects and steps; `git-read@1`; an operation that an entry opens, with outcome entries | Absent in the main part. `Input` has no `preparation`: `contract/src/entry.ts:35` to `:57`. The `operation` effect and the `outcome` input exist (`entry.ts:104` and `:54`), the fold applies one (`derive/src/fold.ts:143`), and nothing produces one. `CAPABILITIES` has four records of `hold@1`, two steps, and no rule: `contract/src/capability.ts:65`. The production port is null: `scope/src/ports.ts:133`. | 4.1, 4.3, 5.5, 6.11, 16.3, 16.4; three rows of 11.8 | "I3's" | Agreed, I3 builds, for what the contract declares. The records `fork`, `token`, `instance` and the steps `instance`, `token`, `job-read`, `retry` are the authority note's (5.7), adopted with it. One part is blocked: how a row states that a hold has a workspace (13.7; question Q3). |
| P10 | The bounds of the contract's 6.1 and 7.5 | Present: `contract/src/bounds.ts:73` to `:103`. 16 item types, 64 acts, 12 value slots, 4 `also`, 128 foreign entries, 104 sends. `roster` has 9 value slots and `lane` has 10: both fit. | 6.1, 7.5 | Nothing asked | Built. Every number is the proof plan's. |
| P11 | Capacity in items, records, bytes and pending requests; `settles`; a count of decisions | Entries only: `derive/src/reserve.ts:81` to `:86`. `settles` in entries. | 17.1 to 17.3 | "The rest of P11 is the capacity follow-through's" | Part built. I3 builds the count of decisions (`decided`, `withdrawDecided`) and the records dimension. The rest: `cc570904` (question Q5). |
| P12 | Any platform definition; a grant that is current; a reader that may read | Absent. A platform name answers `unsupported-definition`: `scope/src/ports.ts:129`, `scope/src/namespace.ts:165`. No grant is current: `ports.ts:123`. Nobody may read: `ports.ts:131`. `FreshnessProof` is `unknown`: `contract/src/scope.ts:64`. A replay calls every grant current: `replay/src/verify.ts:604`. | 6.1, 9.1, 16.1 | "I3's" | Agreed, I3 builds |
| P13 | An act that no grant judges | No form | 6.4: "there is no form" | Platform code; the `act` input records an empty `authority` | Platform code. `authority` is a list in the adopted type, and an empty list is a value of it. The rule that replaces the grant is the definition's, per entry. |
| P14 | The signing key as a value | No form: `signer` is the member | 6.5 | Platform code; read from the intent's `actor` | Platform code. The key is in the signed intent. The effect is an adopted `value` effect. |
| P15 | Selecting a local item by a value | No form | 6.4 | Platform code | Platform code. The function names the item. The effects are adopted ones. |
| P16 | An operation that a platform entry opens, and what its outcomes derive and send | The contract leaves it to "its definition or a capability" | 4.3 | Platform code | Platform code. The `operation` effect and the `outcome` input are adopted. The evidence of an outcome is the authority note's to define, in the table of 5.7. It is the largest row. |
| P17 | A counter | No form | None | Platform code | Platform code. One adopted `value` effect. |
| P18 | A digest computed in a guard | No form | None | Platform code | Platform code for the invitation's secret, which is a field. For a configuration's bytes it needs P21. |
| P19 | An observation retained by an entry that is no act; an observation of another key or member; an observation of the rules | The record exists as a type only | 16.1: an act's grant holds one. Which other inputs may carry one is not stated. | Open: its point R1-53 | **Split.** An outcome entry: platform code, because the outcome's evidence is the authority note's to define, and holds them (the `judge` of the destination). An act entry that must retain a second observation: **blocked**. `publish` (`not-a-checker`), `open-issue` and `open-pr` (`not-activated`), `open-task`. The adopted `act` input has one grant with one `fresh`, and no member for another. |
| P20 | The membership reference of a scope created beside membership; `membership` in the body of a lane's `create` | The body of a `create` is `{ fields, directory }` | 6.6 | A form: `{ fields, directory, membership }`. It changes the bytes of every creation. | **Split.** The rules scope and the destination: platform code, as 12.1 states it. The ID is derived from the directory's seed, and the incarnation is fixed by the first entry that retains an observation. A lane: **blocked**. Question Q1. |
| P21 | Bytes beside an intent that are not a detached text; a `create` whose definition an input names | `Beside` is `{ texts, presented }`. A text is at most 64 KiB; a definition may be 256 KiB. | 6.2, 6.4, 7.2 | The bytes: open, its point R1-54. The `create`: platform code. | **Split.** The `create` under a named digest: platform code (7.2 allows it, and G16 says where the bytes are read). The bytes of `activate` and `keep-configuration`: **blocked**. Question Q2. |
| P22 | A `fact` type that names more than one definition | No form | 6.2 | Platform code | Platform code in I3's one use: a notice's `source` is a record of four values, which is data today. The other uses are IA's. |
| P23 | The address of an attention send | Not stated. No lane derives the send: the I2 plan's row 59. | 6.6 | A form: `to: { member }` on a `notify` | **Blocked** for the send from a lane. The inbox and its handler are built. Question Q2. |
| P24 | A change to one element of a list value; an effect over a range of items | No form | None | Platform code | Platform code. `rotate-recovery` sets the list whole, with one adopted `value` effect. `remove-member` changes no key item: membership's answer to an observation reads the member's state. |
| P25 | The declared type of a field that receives a `collect` list of more than 32 records | Not stated | 6.6 | Platform code, with one rule: a declared field is bound by 32, and a longer list is `bad-field` | Platform code. The destination reads `verdicts` and `jobs` from the message itself, and G5 bounds them. Revision 13's rule would refuse a list the lane may send today, and is not built. |

### 4.4 Summary

Counted by hand over the status column.

- **Built at `50bba45c`: 8.** P1, P3, P4, P5, P6, P7, P8, P10. The
  authority note marks the same eight. Each was found in the source.
  P7's second half rests on a test and not on a traced line.
- **Agreed, I3 builds: 3, and part of a fourth.** P2, P9, P12, and the
  count of decisions and the records dimension of P11.
- **Platform code: 9 whole.** P13, P14, P15, P16, P17, P18 (for a field),
  P22, P24, P25.
- **Split, with a blocked part: 3.** P19, P20, P21.
- **Blocked whole: 1.** P23, for the send.
- **With another owner: the rest of P11.**

**What the table decides.**

- The register, membership, the destination and the inbox can be built
  and run whole on the adopted texts, with platform code as section 4.2
  bounds it.
- The authority port can serve every platform scope now.
- The capability code can be built whole. It can run under the two lane
  definitions in a test that founds lanes from a made-up directory, as
  I2's fixture does, and supplies their membership by hand, with a label.
- **A run from a real founding to a real merge cannot be made yet.** It
  needs an activated definition (P21), a directory that judges activation
  (P19), and a lane that knows its membership (P20). Each is one ruling
  from the contract's owner. Section 8 puts the work that those rulings
  unlock last, in steps that are prepared ahead and filed only on
  adoption, as I2 did for the genesis `kind`.
- The four asks touch four narrow places. The bound-but-malformed license
  request is not built as decided (the contract's 6.11). A `withdraw`
  that is ill-typed is refused `bad-field` as new work, as 12.1.5 says.
  Activation follows G16. The task's reservations are IA's. None stops a
  step. Each is reported as an owned gap in the delivery note.

## 5. What must not be faked

A stand-in proves only the boundary that it exposes. Each stand-in below
is supplied through test support that no production entry imports, and
is labelled in the name or the first comment of each test that uses it,
and in every note that cites its result (the contract's section 6.11).

| Boundary | What I3 proves in-process, against real scope storage | What needs a real external system | Honest stand-in in tests |
|---|---|---|---|
| A Git repository: objects, refs, the push command's contract | Everything about objects and refs. A real `git` program against a local bare repository: the compare-and-set by expected old value, a ref created only if absent, a conditional delete, the readback, the three classes of send evidence, object types and parents, a corrupt object, an interrupted transfer. These run in Node, in the `git` project. | Nothing more about Git itself. | None is needed here. The repository is real. It is labelled "a local repository, not a host". |
| A Git host: its server, its reads after a write, its account interface | That every update is sent with its expected old value through one grant. That the ledger records a duty before the call. That a lost answer stays unknown. | H1 and H2 at the chosen host; a late update (H3); the create, mint, revoke and fork calls; token end times on the host's clock (H6). The proof plan's cases HS1 to HS7, at its boundary B5. **A separate commission.** | `MemoryHost`, a model of a host with a table of faults: an answer lost after the effect, an answer lost before it, a refusal. One table of cases is run against the model and against the local repository, and the expected values come from the design's text, never from the model. It shows the scope's side only. |
| The destination's compare-and-set end to end | In workerd, a real destination scope with `MemoryHost`: reservation, attempts, evidence, the deciding read, the slot. In Node, the same push sequence against the local repository. | One case at B5, in the host session. | `MemoryHost`, labelled. The two halves meet only at the shared table. No test claims that a scope pushed to a real repository. |
| Device keys | Signatures by real Ed25519 keys. The order of a join's checks. That a key in use, a former recovery key and a revoked key are refused. | A key that is made on a device and cannot leave it. Two real devices. A browser. **I5 and I6.** | The shared test keys of `@generalbusiness/artroom-derive/testing`. They show the rules about keys and nothing about a device. |
| A runner in a container | The service's origin read, its one run for a job, what it signs, a late answer, an image that differs. The runner's checkout function against a local repository, with a real `git`: the commit, its tree and its parents are checked against the job. | A container with no network, the image's resolved digest, a job on the real runner for each row of "What the checker signs". **A deployment, so a separate authorization** (question Q8). | A scripted runner that returns a stated end. It shows the service's side only. |
| The publisher's container and the gateway | The gateway as a function over requests: one grant, "forwarding" recorded before the forward, one forward, then closed; no token in an argument or a URL. A local HTTP endpoint stands for the host. | The container's isolation and loss; a callback that never comes. **The host session, or I4.** | The local endpoint, labelled. |
| Provider behaviour: storage, clocks, alarms | Real scope storage in workerd. A controlled clock. A restart of the object. | H5 and H6. No run establishes either. | The scripted clock of `@generalbusiness/artroom-scope/testing`. |
| Another scope | Real scopes in one namespace, with real calls. | Nothing. | None. I3's own tests use no scripted peer. |
| A task scope | Nothing of its own. The lane's side of `export-license`, `export-settled` and the fence answer. | The task definition: IA. | A made-up declared definition named `task-stand-in` that sends the two requests. Labelled. It shows the lane's side and nothing about a task. |

Full acceptance in a browser, on the command line, through the tool
server and across devices is I5's and I6's duty. I3 closes none of it.

**What no step may take as settled** (section 11.1). An unknown attempt,
a token's duty and a writer's duty each keep their own identity until
that request's own answer, or the rule that section 5.4 names. A restart,
a listing, an inventory, elapsed time, a later attempt that succeeds, a
new scope or incarnation, the removal of a staged root, and a new ref
settle none. One test states this for the ledger (T19), and every
operation in every other test goes through the same driver.

## 6. Removal

No compatibility adapter is built, and no earlier path runs beside its
successor. A parked file is deleted in the step that makes its successor
pass its witness. A file that is kept moves only after its review, and
its earlier interface does not move with it.

### 6.1 The earlier paths that section 11 gives to I3

Paths are under `parked/`. The section's table names them under
`packages/`, where they were before I1 parked them.

| Earlier path | Decision of section 11 | Successor | Deleted in step |
|---|---|---|---|
| `room/src/authority.ts`, `roster.ts`; `contract/src/roster.ts` | Replace | Membership, and the observation | 13, when V6 and V9 pass; the last of it in 14 |
| `room/src/requests.ts`: sessions and nonces | Refactor | Read sessions; signed requests | 15 |
| `room/src/requests.ts`: bearer acts and room-held session keys | Delete | Nothing | 15 |
| Delegation records, in `contract/src/roster.ts` and `room/src/authority.ts` | Delete now | Nothing | 13 |
| `room/src/founding.ts`, `registry.ts` | Replace | The register and the directory | 10 |
| `git/src/landing/core.ts`, `engine.ts`, `types.ts`; `contract/src/landing.ts` | Refactor | The destination. The state machine, complete-forward and readback are read and written again as the destination's rules. No file moves. | 28, when A6 and A7 pass |
| The Room's `revalidate` | Replace | The reservation checks | Deleted by I1 with `room.ts`. Step 26 records it. |
| `git/src/publisher/*` but `log-push.ts` | Refactor, after review | `packages/git` | 21 |
| `git/src/publisher/log-push.ts`, `room/src/logremote.ts` | Delete | The receipt write | 27 |
| `git/src/mints.ts` | Refactor | One ledger module | 19 |
| `git/src/workspace/workspaces.ts`, `fork-tokens.ts` | Refactor | A fork and a token for each hold | 18 |
| `git/src/snapshot/repos.ts`; `room/src/snapshot.ts`; `checkers/src/snapshot-commit.ts` | Retain after review; the last is rewritten | Snapshot repositories, owned by the change lane | 24 |
| `room/src/jobs.ts`; `checkers/src/job.ts`, `checker.ts`; `contract/src/checker.ts` | Refactor | The job as an item; the origin read; a result that names its job | 25 |
| `checkers/src/signing.ts`, the sandbox, runner and container | Retain after review | `packages/checkers` | 25 |
| `log/src/git.ts`, `gitcli.ts` | Retain after review | `git/src/reader.ts`. `gitcli.ts` is not kept (section 6.3). | 17 |
| `policy/src/admin.ts` | Rewrite | Part of membership: the last-admin rules and the recovery key | 13 |
| `contract/src/guards.ts` | Rewrite | The three guards on landing types go with the destination | 28 |
| `room/src/artifacts.ts`, `policy.ts`, `memory/artifacts.ts` | Rewrite | `git/src/host.ts`; `MemoryHost` in test support. `policy.ts` adapts a deleted runtime and has no successor. | 19 and 31 |
| `room/src/secrets.ts`, `ratelimit.ts`, `diag.ts`, `errors.ts`, `budgets.ts` | Keep after review | `scope/src/limits.ts` for the limiter; the redactor for O3; the rest only if a step uses it | 15, 20, and 31 for what nothing used |
| Secrets `ROOM_KEY_SECRET`, `CHECKER_KEY`; variables `LEASE_SECONDS`, `OPERATOR_KEYS` | Replace | The secrets of section 5.5; the founding policy; a hold's duration in the definition | The names leave the source in 10, 15 and 25. The values are E1's. |
| The lane and lease keys in workspaces, fork tokens, fork names and pinned refs | Remove | Names made from the lane's scope ID, its incarnation, the hold and the attempt | 18. The demo contract's test: no fork name or ref holds a lane identifier of the earlier log. |

When step 31 ends, `parked/contract`, `parked/log`, `parked/policy`,
`parked/git` and `parked/checkers` are gone, less their `measure/`
directories. `parked/room` keeps only what the ledger gives to others:
`mcp.ts` (I5), `measure/` (I4), and the spike configuration and
`scripts/` (E1). `parked/README.md` is reconciled in the same step, row
by row, by reading the tree.

`scripts/active-source.test.mjs` refuses the names `REGISTRY` and
`LEASE_SECONDS` in an active file. Five lines of the parked files hold
them. No file moves with such a line.

### 6.2 What stays under E1

Nothing below is deleted, listed, read live or settled by I3.

- Every Worker, storage, container application and image of the earlier
  deployments.
- Every repository, fork and token at the earlier Git host.
- The earlier secrets and the credential file.
- `parked/room/wrangler.spike.jsonc`, `parked/checkers/wrangler.spike.jsonc`
  and `parked/room/scripts/`. They stay parked until E1 settles.
- `.github/workflows/row-writes.yml`, which names a parked script. It is
  I4's or E1's.
- Every unknown duty of the earlier deployments, under its own identity.

The new model uses new storage, new names and a new repository. It needs
nothing of the earlier one (section 8.2).

### 6.3 The review that a retained runner or Git reader must pass

The commission asks for a review that includes checked parents, checked
object types and safe object-ID arguments. A delegated reader read the
eleven files for this plan, and found what follows. Each finding is a
task of the step named. The review itself is done again by the builder
in that step, at the lines, before any file moves.

| File | Verdict | What the review must fix |
|---|---|---|
| `log/src/git.ts` | Keep, as `git/src/reader.ts` | A tree's mode is kept exactly, and an unknown mode is refused. A parent line is checked as a full object ID. A repeated header is refused. A read takes the expected type and refuses another. |
| `log/src/gitcli.ts` | Not kept | No value is validated before it is an argument. The token is in the remote's address, so on the command line. Its one use, the log push, has no successor. |
| `git/src/publisher/gitops.ts` | Keep | An end-of-options mark before every remote and revision. The remote is validated here, not only by a caller. A commit's ID is compared with the object's exact type, so a tag does not pass as a commit. **The push of the branch checks nothing about the commit that it sends: it must check its type, that its first parent is the expected base, and its closure.** Gitlinks are refused. Errors carry safe notes, not the program's raw output. |
| `git/src/publisher/push-outcome.ts` | Keep | A forced update is reported apart from an ordinary one. The list of refusal codes is the earlier host's, and becomes a parameter. |
| `git/src/publisher/ref-fence.ts` | Keep, as part of the gateway | A packet's length is four lower-case hex digits and nothing else. Only the three smart-HTTP paths pass. The pack is not inspected, so the checks on the commit are the publisher's. |
| `git/src/first-commit.ts` | Keep only if the first head is pushed this way | The remote is validated. Packets are parsed strictly. The identity and message become the founding commit's (section 12.2). |
| `git/src/diff/treediff.ts` | Keep only if a step uses it | Object IDs are checked at entry. |
| `checkers/src/runner.ts` | Keep | **A commit's parents are never read: the checkout must check them against the job.** Validation moves inside the checkout. An end-of-options mark. Two exit codes are checked. |
| `checkers/src/sandbox.ts` | Keep | Only the read paths under the repository pass the gateway. |
| `checkers/src/snapshot-commit.ts` | Rewrite | Paths and modes are unchecked, and a file and a directory of one name overwrite each other. |
| `checkers/src/signing.ts` | Keep | The byte domain becomes the new model's. The key's custody is unchanged. |

The two rows in bold are the cases of the proof plan's key O15 that the
earlier code does not meet. They are parts 2 and 3 of review row L13.

### 6.4 The stand-ins of I2's test support

| Stand-in | Removed when | In step | Then runs |
|---|---|---|---|
| `scriptedCapability`, `CapabilityScript`, `Controls.capability`, `Net.capability`, in `scope/src/testing.ts` | The rules of `hold@1` and `git-read@1` derive the records | 16 | I2's W1: `report`, `refuse-report`, `propose-manifest`, and the pin and export handlers, with real records. T3, T4, T5b and T8 of the lanes run on them. |
| `Net.peers` and the fixture's `Peer`, a scripted rules scope and destination | A real rules scope and a real destination exist in the graph | 30 | I2's W2: `rules` and `publication` from real peers, a `merge` that reaches a destination, an index row that reaches a directory. |
| `testAuthority` and `testReaders` | The authority and readers ports are filled | 12 for platform scopes. For the lanes' graph: 30, and only with question Q1 answered. | Every act's `grant`, on an observation. |
| The made-up directory `office` of the lanes' fixture | The real directory creates lanes | 30, and only with Q2 answered | Lanes under an activated digest. |

I2's W3 (the publication entry at 35 sends and 33 results, the proof
plan's F23) runs in step 30, after W2. W4 (capacity beyond entries) is
`cc570904`'s. W5 (the checker's dispatch, G22) is answered by G4 and
runs in step 25. A notice that reaches an inbox waits on P23.

If Q1 or Q2 is not answered when step 30 is reached, the lanes' graph
keeps `office` and a hand-supplied membership reference, each with its
label, and the delivery note says that W2 ran with those two stand-ins.

## 7. Evidence

Test economy is the first rule. Each test names one invariant. It sits
at the cheapest boundary that can show it. Fixtures are shared. The
clock is controlled. No test waits on the wall clock. There is no sweep,
no test for one field, and no count to meet. The gate runs once, at the
head sent for review.

### 7.1 Fixtures and runners

| Fixture | File | Used by |
|---|---|---|
| `repository` | `packages/platform/test/support/repository.ts` | One founded repository on real scopes: a register, a directory, membership, the rules, a destination, a seated founder with a first key, `MemoryHost`, and the shared scripted clock. Each test that writes gets its own. It is the proof plan's fixture of that name. |
| `git` | `packages/git/test/support/repo.ts` | A local bare repository in a temporary directory, made once for a file whose tests only read, and once for each test that writes. |
| `graph` | `packages/lanes/test/support/graph.ts`, as I2 left it | The two lane definitions. Step 30 puts it on `repository`. |

| Project | Pool | New files |
|---|---|---|
| `derive` | Node | `forms-grant`, `forms-prepare`, `forms-ledger`, `forms-ancestry`, `forms-records` |
| `platform`, new | Node | `definitions.test.ts` |
| `git`, new | Node, with the `git` program | `reader`, `push`, `gateway` |
| `checkers`, new | Node | `service`, `runner` |
| `scope` | workerd | Its own new files, and `../platform/test/**/*.scope.test.ts`, added in the root `vitest.config.ts` as the lanes' scenarios are. One Worker, loaded once. |
| `replay` | Node | Rows added to `verify.test.ts` |

### 7.2 The invariants that the commission names

One test for each. The command runs that one file.

| # | Invariant | Key | Boundary | Test file | Command |
|---|---|---|---|---|---|
| T1 | Reservation is one commit and the only linearization point. The destination counts from the complete statement under rules that it observed itself: base, integration, authority, evidence, rules, completeness. Each failed check gives its reason. | A6 | Several real scopes | `platform/test/reserve.scope.test.ts` | `npx vitest run --project scope reserve` |
| T2 | A retired revocation of the merger against a reservation, in both orders: observed before, `authority-lost`; after the observation began, reserved. | A6; order R1 | The same | The same file, second test | The same |
| T3 | A `withdraw` against a reservation, in both orders, each with the result first and with the final update first. One result, recorded once. A refusal carries `reserved` or `ended`. | A6; order R2; F34 | The same | `platform/test/withdraw.scope.test.ts` | `npx vitest run --project scope withdraw` |
| T4 | A rules change against a reservation, in both orders: the destination uses the rules that it observed. | A6; order R3 | The same | `reserve.scope.test.ts`, third test | As T1 |
| T5 | A reviewer's key revoked as compromised, at the four points of the proof plan's F12. | A6; F12 | The same, with `MemoryHost` | `platform/test/abort.scope.test.ts` | `npx vitest run --project scope abort` |
| T6 | An observation inside its window admits. At its window it is outside. Past it, with membership silent, the act is refused `authority-unavailable`. After a restart it is read again. A ten-second kind serves one commit. | A6; G14; W1, W3 | One scope and membership; the controlled clock | `scope/test/authority.test.ts` | `npx vitest run --project scope authority` |
| T7 | **The lost push reply, in both orders.** The push applied: evidence unknown, the read shows the integration commit, `published`, one commit on the branch, and the attempt stays unknown with its token duty. The push did not apply: the read shows the base, `unresolved`, and the same compare-and-set is sent as a new attempt. | A7; F9, F10 | A destination, with `MemoryHost` | `platform/test/publish.scope.test.ts` | `npx vitest run --project scope publish` |
| T8 | A later publication waits `queued` while the slot is held, and is then not reserved, `out-of-date`. An unrelated lane's entries go on during the fault. | A7; F11 | The same | The same file, second test | The same |
| T9 | Every send is the same compare-and-set, and its evidence is one of three classes: not sent, refused, unknown. Only a read decides. One table, run against a real local repository and against `MemoryHost`. | A7; H1 as a contract of the command | A real Git repository | `git/test/push.test.ts` | `npx vitest run --project git push` |
| T10 | A join with a valid invitation admits the key. An expired one, a used one and none are each refused with its reason. A recovery key that signs a join is refused before the secret is compared. | V6; L1 | Membership, on real storage | `platform/test/join.scope.test.ts` | `npx vitest run --project scope join` |
| T11 | Revoking device A, in both orders against an act from A that is in flight. Observed first: refused. Recorded first: it stands, and A's next act is refused inside the window. Device B's act is admitted in both. A's read session ends at its own end time and never signs an act. A device that is offline changes nothing. | V7, I3's part | Membership and one platform scope | `platform/test/revoke.scope.test.ts` | `npx vitest run --project scope revoke` |
| T12 | The last key revoked, in both orders against a token request. Observed before the mint: no token, and no `renew-hold` after ten seconds. After: the hold is not ended, its token duty stays, and nothing in flight is settled. | V8, the entries; M1 | A lane and membership, with `MemoryHost` | `platform/test/authority-loss.scope.test.ts` | `npx vitest run --project scope authority-loss` |
| T13 | A member is recovered through an admin and then through the offline key. A removed member is not restored. The last admin's last key is revoked only by the recovery key. | V9 | Membership | `join.scope.test.ts`, second test | As T10 |
| T14 | No credential and no provider's text is in any record or read. A provider's error that holds a token, a query, userinfo and a bearer value is injected at the outside call. The caller's error, the ledger duty, the attempt, the diagnosis and every read of them hold none of it. The custody still holds the credential. | O3 | Several real scopes; the outside call | `scope/test/redaction.test.ts` | `npx vitest run --project scope redaction` |
| T15 | An abandoned reader is cleaned up at once: the pending read completes, the subscription is released once, and no reconnect follows. A session's end closes a stream by its own bound. | O12, the service's row | The Worker's route | `scope/test/sessions.test.ts` | `npx vitest run --project scope sessions` |
| T16 | An object counts only when its bytes match its ID, its type and its size. A commit's parent lines and a tree's modes are checked. An object ID is validated before it is an argument. The table "Corrupt object". | O15; L13, parts 2 and 3 | A real Git repository | `git/test/reader.test.ts` | `npx vitest run --project git reader` |
| T17 | A closure is complete object by object. A transfer that stops part way leaves nothing that counts. The table "Interrupted transfer". | O15 | The same | The same file, second test | The same |

V7's and V8's rows at the proof plan's boundary B7 are IA's and I5's.
T11 and T12 are I3's share: the entries, with the observation that each
used.

### 7.3 The boundary witnesses of section 11

Each row of section 11.1's fourth column that is I3's, and each
witness that section 13.7 lists as real evidence.

| # | Invariant | Section | Test file | Command |
|---|---|---|---|---|
| T18 | Founding in order. Two `created` answers in both orders: the first recorded is selected, and the other is recorded as not selected and opens its own deletion by ID. A provisional scope admits nothing. A second incarnation is a conflict. | 3.8; the contract's 18.3 and 18.8; R11, F26 | `platform/test/founding.scope.test.ts` | `npx vitest run --project scope founding` |
| T19 | An unknown outcome keeps its identity. After a lost answer: a restart, a listing, elapsed time, a later attempt that succeeds and a new ref each settle nothing. That request's own late answer settles it. A token whose ID and end time are known is settled past its end time by the margin, and no mint is. | 5.4; 11.1 | `scope/test/operations.test.ts` | `npx vitest run --project scope operations` |
| T20 | An idle ledger writes nothing. An operation opens at most its stated attempts and then opens none by itself. A retry is a new operation. | 5.4, rule 7; G3; O5 | The same file, second test | The same |
| T21 | A preparation is sealed before any outside write. `stage` makes a root `creating`, then `live` with a provisional pin, and `check` writes the check entry. A refusal writes no entry and uses no key. | 6.2; the contract's 18.4 | `platform/test/stage.scope.test.ts` | `npx vitest run --project scope stage` |
| T22 | A pin ends in one state in both orders of `pin-confirm` and `unpin`, and a late confirmation restores nothing. | 6.2; the contract's 18.7 | The same file, second test | The same |
| T23 | The ancestry walk: the cases of the three witness tables of section 6.2, as rows of one table, with the own ancestor that has no check and its control. | 6.2; F30, F36 | `derive/test/forms-ancestry.test.ts` | `npx vitest run --project derive forms-ancestry` |
| T24 | A replay of an ancestry check gives the same judgment after a root is retired, and reports the read as trusted. | 6.2; the contract's 18.10; F31 | `replay/test/verify.test.ts`, one row | `npx vitest run --project replay verify` |
| T25 | A fork is selected once. A hold has no fork from an empty repository: `failed`, `no-head`. Its seed is from its own commitment only. | 5.1, 5.2, 12.2; F28 | `platform/test/fork.scope.test.ts` | `npx vitest run --project scope fork` |
| T26 | The lane answers a fence check from its own state and clock: held and this instance; not held at its end time, written or not; not held when its clock is behind. | 5.2; W10; F33 | The same file, second test | The same |
| T27 | The gateway holds one grant for an attempt, records that it is forwarding before it forwards, forwards once and closes. No credential is in an argument or a URL. | 5.3; 6.1 | `git/test/gateway.test.ts` | `npx vitest run --project git gateway` |
| T28 | A bound license request is decided once at a lane with no free room, and a repeat uses no further reserve. | 4.2 | `platform/test/license.scope.test.ts` | `npx vitest run --project scope license` |
| T29 | A lane's one `withdraw` is decided at a destination with no free room, once. A repeat, another sender and a second envelope use no reserve. | 5.8 | `withdraw.scope.test.ts`, second test | As T3 |
| T30 | A destination at its budget still writes its closing checkpoint. | 5.8 | `publish.scope.test.ts`, third test | As T7 |
| T31 | The first head: a branch is created only if absent, a read decides, and nothing is reserved before it. | 12.2 | `platform/test/first-head.scope.test.ts` | `npx vitest run --project scope first-head` |
| T32 | The receipt is a second write after `published`, under a name that is never reused. It never holds the slot. Present with other content is an incident. | 6.10 | `publish.scope.test.ts`, fourth test | As T7 |
| T33 | Another writer: a read that shows a commit the destination did not send stops sending, keeps the slot and records an incident. `adopt-head` is admitted only when every earlier operation is final. | 6.9 | `abort.scope.test.ts`, second test | As T5 |
| T34 | The check results table: a judged pass and a judged fail are kept apart from an error, a wait that ended and a retry. The first authentic answer on a `timed-out` job that no retry superseded decides it, and a later answer changes nothing. | 3.11, 6.3; the contract's 18.16; O13 | `platform/test/checks.scope.test.ts` | `npx vitest run --project scope checks` |
| T35 | The checker service reads the job's entry before any run, runs at most once for a job, and signs outside the runner. Another image or environment gives an error and no result. | 3.11; A12 | `checkers/test/service.test.ts` | `npx vitest run --project checkers service` |
| T36 | The runner's checkout checks the commit, its tree and its parents against the job, on a real repository. | 11; O15 | `checkers/test/runner.test.ts` | `npx vitest run --project checkers runner` |
| T37 | The rules: a `publish` that names an unkept configuration is refused. `rules-wanted` is answered by one update and one result. A lane applies an update only at a higher revision. | 12.1.4; O9 | `platform/test/rules.scope.test.ts` | `npx vitest run --project scope rules` |
| T38 | The directory: two index rows of one lane in either order give the same row. A concern's first row takes the next number once. | 12.1.2 | `platform/test/directory.scope.test.ts` | `npx vitest run --project scope directory` |
| T39 | A join under load: nothing is counted against an invitation, the secret is checked before its state is read, and a full table locks nobody out. | 3.6; M3, M4; O10 | `scope/test/limits.test.ts` | `npx vitest run --project scope limits` |
| T40 | An inbox records one notice for an advisory, nothing for its repeat, and only its owner marks it read. | 12.1.6 | `platform/test/inbox.scope.test.ts` | `npx vitest run --project scope inbox` |
| T41 | An incident is kept in the entry that found it and in the operator's record, which no guard reads. The two lists of waiting requests are bounded reads. An instruction to send again dispatches the same envelope once and writes no entry. | G13, G17 | `scope/test/operator.test.ts` | `npx vitest run --project scope operator` |
| T42 | With a binding or a secret missing, no call, no mint and no read is made, and sessions answer `sessions-unavailable`. | 5.5; O6 | `sessions.test.ts`, second test | As T15 |
| T43 | The six definitions validate whole at the adopted bounds. Each "Code" rule has one row in the table of rules, with its P number. No definition lists a capability or declares a rule. | 12.1; 12.1.8 | `platform/test/definitions.test.ts` | `npx vitest run --project platform definitions` |
| T44 | Replay agrees with the runtime on a founded repository, once. A grant is derived again from membership's history at the observed head, and the three mismatch names are reported. | 10; G18; the contract's 9.3 | `platform/test/replay.scope.test.ts` | `npx vitest run --project scope replay` |
| T45 | The grant guard and the commit guards of an observation, as one table of a pure function. | 3.3 | `derive/test/forms-grant.test.ts` | `npx vitest run --project derive forms-grant` |
| T46 | The clock table: which inputs judge time, and what a clock that is behind stops. | 3.12, W1 to W14 | `scope/test/authority.test.ts`, second test | As T6 |

Tests that the last steps add, when their forms are adopted:

| # | Invariant | Waits on | Command |
|---|---|---|---|
| T47 | A lane is created only under a digest that the rules scope holds as `active`, by an observation that the entry retains. A retired definition creates no new lane. | Q2 (P19, P21) | `npx vitest run --project scope directory` |
| T48 | The publication entry has 35 sends and 33 results, with its size measured. | Step 30; the proof plan's F23 | `npx vitest run --project scope links` |
| T49 | A full journey on real scopes with no stand-in for a scope: found, enrol, activate, open, hold, stage, check, merge, publish, receipt. | Q1 and Q2 | `npx vitest run --project scope journey` |

For each new guard, one control with `scripts/control.mjs`, run by hand
and recorded in the delivery note. A control that survives is reported
with its reason.

### 7.4 What these tests do not show

- H1 to H6. No run establishes any.
- A real host, a real container, a real device, a browser, a deployed
  instance.
- The task scope, a hosted agent, an export's release.
- Capacity in items, bytes and pending requests, until `cc570904`.
- The proof plan's rows at its boundaries B5 to B8.

### 7.5 Counts and time: an estimate

Observed for this plan, one run, at `50bba45c`, on a shared machine
(18 cores, other sessions active), with a warm package cache.
`npm ci` ran first, as its own command, and was not timed. Then
`npm run gate`: the whole command took 12.6 s elapsed, with 17.6 s of
user time and 4.1 s of system time, as `/usr/bin/time` reported them.
Inside it, as the gate printed: the install check 2.1 s, the typecheck
2.5 s, the tests 7.7 s. 282 tests of vitest and 3 of Node's runner
passed.

Estimated after I3, and labelled as an estimate until it is observed:

| Figure | Estimate |
|---|---|
| Tests added | 55 to 75. The tables above name 49 tests. The form tables in `derive` and the rows in `replay` add the rest. |
| Tests in the gate | About 350 |
| Typecheck, elapsed | 3.5 to 4.5 s, with three more packages |
| Tests, elapsed | 12 to 16 s. The two Node projects that run the `git` program are the largest unknown. |
| The whole gate | Under 25 s elapsed on this machine, warm |

I2's plan estimated 27 to 32 added tests, and I2 added 71. Most of the
difference was form tables in `derive`. The same error is likely here,
and the range above allows for half of it. If a milestone's count passes
its share of the range by a quarter, the builder stops and merges tests
before going on. The budget is a ceiling to explain, not a target.

**How the full-path cost is measured.** The delivery note reports it
apart from any warm figure.

- `scripts/measure-tests.sh <directory>` times each step alone: elapsed
  seconds, and CPU seconds summed over every process the step started.
  Step 32 adds one step for each new project. A sum of its steps is a
  sum, computed by script, and is never given as one run.
- The install is measured cold: `npm run gate -- --ci`, once, in a new
  clone with no `node_modules`, with the state of the package cache
  stated.
- Setup is reported apart: the time to load the test Worker, and the time
  to make the local repositories, taken from the vitest reports.
- The whole gate is timed once, as one command, at the head sent for
  review.
- Each figure is labelled by how it was taken: an observed run, a sum of
  steps, a reconstruction or a proxy. The machine, the load and the cache
  state are stated with it.
- No gain is claimed against an earlier gate.

## 8. Steps

Each step is one commit, or a few that end at its milestone. Each ends
with its own witness passing and the tests of what it changed. The gate
runs once, at each milestone's head that is sent for review.

"Model" says who can do the step. "Small" is a step that follows a
written table or moves reviewed code, and a smaller model can do it with
the table in hand. "Care" is a step whose errors are judgments: an
authority decision, a race, the compare-and-set, the custody of an
unknown duty. A step marked "Care" is done by the builder or reviewed
line by line before it is committed.

### 8.1 The base

These steps come first because every later step reads them.

| Step | Delivers | Owns | Witness | Model |
|---|---|---|---|---|
| 1 | Types only. The kind `register` and the seventh platform name. The `preparation` input. `Observation` and `ObservationUse` as `FreshnessProof`. The evidence of an outcome, by basis. The records `fork`, `token`, `instance` and the steps `instance`, `token`, `job-read`, `retry` in `CAPABILITIES`. No behaviour changes. | `contract/src/scope.ts`, `entry.ts`, `capability.ts`, `evidence.ts` (new), `observation.ts` (new); `bytes/src/ids.ts`, `records.ts` | Typecheck. The existing tests pass. | Small |
| 2 | The platform package, empty of rules: its manifest, the platform option of the validator, the table of rules as a type, and `inbox` as the first definition, which needs no rule. | `packages/platform/*`; `derive/src/validate/index.ts`, one option; root `vitest.config.ts`, `package-lock.json`, `scripts/active-source.test.mjs`, `scripts/measure-tests.sh` | T43 for one definition. | Small |
| 3 | The ports, re-shaped. The authority port takes an observation that was read before the turn, and answers in the commit. The definitions port supplies a platform definition with its rules. The capabilities port takes real rules and state. Test support keeps its stand-ins, each over the new shape. | `scope/src/ports.ts`, `core.ts`, `turn.ts`, `testing.ts`; `derive/src/judge.ts`, `capability.ts` | The existing tests pass unchanged in meaning. One test: a platform scope is founded under `platform:inbox@1` by the production wiring. | Care |
| 4 | Operations. An entry opens an operation. An attempt is recorded before it is sent. An outcome is `confirmed`, `refused` or `unknown`. A late answer adds one more outcome. A selection is made once. The driver sits beside the outbox, on the alarm. The ledger rules 1 to 7. | `derive/src/ledger.ts` (new), `settle.ts`, `fold.ts`; `scope/src/operations.ts` (new), `sqlite.ts`, `store.ts` | `derive/test/forms-ledger.test.ts`; T19, T20. | Care |

### 8.2 Track A: authority and the first four definitions

It unblocks the grant of every act. Steps 7 to 9 can run beside steps 5
and 6 once step 3 has landed, because they own different modules.

| Step | Delivers | Owns | Witness | Model |
|---|---|---|---|---|
| 5 | The grant guard and the commit guards of an observation, as pure functions. | `derive/src/grant.ts` (new) | T45 | Care |
| 6 | The observation read: before the turn, bounded, counted by run and number, never kept across a restart, at most one per key, a revoked answer kept for the run. | `scope/src/authority.ts` (new), `namespace.ts` | T6, T46 | Care |
| 7 | Membership: the definition as data, and its rules (P13, P14, P18, P24). Its answer to an observation. | `platform/src/membership.ts`, `membership.rules.ts` | T10, T13 | Care |
| 8 | The fourth cause, and a genesis by a register's outcome. | `derive/src/genesis.ts` | One row in `derive/test/compose.test.ts` | Care |
| 9 | The register and the directory: the definitions, and the rules for founding, the three creations, numbers, `index` and `compromised` (P13 to P17, P20 for the two children). `MemoryHost`. | `platform/src/register.ts`, `register.rules.ts`, `directory.ts`, `directory.rules.ts`; `platform/test/support/repository.ts`, `host.ts` | T18, T38. From here the `repository` fixture exists. | Care |
| 10 | Remove the earlier founding and registry. | `parked/room/src/founding.ts`, `registry.ts`; `parked/README.md` | The check of active files passes. | Small |
| 11 | The inbox on the fixture: membership creates one for a member. | `platform/src/inbox.ts`; `membership.rules.ts`, one send | T40 | Small |
| 12 | The production wiring of authority and readers for a platform scope. | `scope/src/worker.ts`, `object.ts` | T11 | Care |
| 13 | Remove the earlier authority, roster and admin code. | `parked/room/src/authority.ts`, `roster.ts`; `parked/contract/src/roster.ts`; `parked/policy/` | The check of active files passes. | Small |
| 14 | The grant in a replay. | `replay/src/verify.ts`, `source.ts` | T44 | Care |
| 15 | Read sessions, the serving limits after review of the parked limiter, and the operator's record with its two lists. Remove the earlier requests code. | `scope/src/sessions.ts`, `limits.ts`, `operator.ts`, `reads.ts` (all new but the last); `client/src/session.ts`; `parked/room/src/requests.ts`, `ratelimit.ts` | T15, T39, T41, T42 | Care for sessions. Small for the lists. |

**Milestone M1, authority.** Six scopes can be founded. An act at a
platform scope is judged on a real observation. A device can join, be
revoked and be recovered.

### 8.3 Track B: the capabilities and Git

It unblocks I2's W1, which stops both lane definitions whole today. It
runs beside track A after step 4. Steps 17 and 21 own only
`packages/git`, so they can start as soon as step 1 has landed.

| Step | Delivers | Owns | Witness | Model |
|---|---|---|---|---|
| 16a | Preparation: a sealed `preparation` entry, judged on a ten-second observation, indexed by request digest, capability and step. Its status in a settlement. | `derive/src/prepare.ts` (new); `scope/src/core.ts`, `worker.ts`, one route; `client/src/prepare.ts` | `derive/test/forms-prepare.test.ts` | Care |
| 16b | The rules of `hold@1` over records: `root`, `pin`, `check`, `receiver-pin`, with the guards `staged`, `pin`, `license`, `settled` and the four effects. Records in the fold, with their counts. | `derive/src/capability/hold.ts` (new), `state.ts`, `fold.ts`, `reserve.ts` | `derive/test/forms-records.test.ts`; T21, T22, T28 | Care |
| 16c | The ancestry walk and the guard `ancestry` of `git-read@1`. | `derive/src/capability/ancestry.ts`, `gitread.ts` (new) | T23 | Care |
| 16 | The production capabilities. The scripted capability is removed from `scope/src/testing.ts`. The lanes' T3, T4, T5b and T8 run on real records, with a labelled host. | `scope/src/testing.ts`, `ports.ts`; `packages/lanes/test/*` | The lanes' scenarios pass with no scripted capability. | Care |
| 17 | The Git package, part one: the reader, after its review. | `packages/git/src/reader.ts`; `parked/log/` deleted | T16, T17 | Small for the move. Care for the review. |
| 18 | The records `fork`, `token`, `instance`; the steps `instance`, `token`, `retry`; the fence answer. Names made from the hold. **Waits on Q3 for what makes a hold have a workspace.** Remove the earlier workspaces and fork tokens. | `derive/src/capability/hold.ts`, the workspace half; `scope/src/reads.ts`; `parked/git/src/workspace/` | T25, T26, T12 | Care |
| 19 | The host port and the token ledger's driver. Remove the earlier mint ledger and host adapter. | `packages/git/src/host.ts`; `parked/git/src/mints.ts`, `parked/room/src/artifacts.ts` | T19 runs through it. | Care |
| 20 | The redaction witness. | `scope/src/diag.ts`, from the parked file after review | T14 | Small |
| 21 | The Git package, part two: the commands, the push outcome and the gateway, after their review. | `packages/git/src/gitops.ts`, `push-outcome.ts`, `gateway.ts`; `parked/git/src/publisher/` but `log-push.ts` | T9, T27 | Care |
| 22 | Replay of preparation, outcomes and an ancestry record. | `replay/src/verify.ts` | T24 | Care |

Steps 16a, 16b and 16c own different modules and can run in parallel.
So can steps 17 and 21 with each other and with all of track A.

**Milestone M2, the capabilities.** `report` and `propose-manifest` run
on real records. The scripted capability is gone. Step 18 is in M2 only
if Q3 is answered. If it is not, M2 is filed without it and says so.

### 8.4 Track C: rules and checks

After M1. It needs step 16a for `job-read`.

| Step | Delivers | Owns | Witness | Model |
|---|---|---|---|---|
| 23 | The rules: the definition, `publish`, `rules-wanted`, `retire-definition`, and an observation of the rules. | `platform/src/rules.ts`, `rules.rules.ts` | T37 | Small, from the table of 12.1.4 |
| 24 | The step `job-read`, the read token and the snapshot repository. The snapshot commit, written again. | `derive/src/capability/gitread.ts`; `packages/git/src/snapshot.ts`; the three parked snapshot files | A row of `forms-prepare` | Care |
| 25 | The checker service: the origin read, the outcome store, one run for a job, the signer, the runner after its review. Remove the earlier jobs and checker code. | `packages/checkers/*`; `parked/checkers/` but `measure/`; `parked/room/src/jobs.ts`; `parked/contract/src/checker.ts` | T34, T35, T36 | Care |

**Milestone M3, checks.**

### 8.5 Track D: the destination

After M1, step 4, step 19 and step 21. Steps 26 and 27 are the centre of
the delivery and are not split across workers.

| Step | Delivers | Owns | Witness | Model |
|---|---|---|---|---|
| 26 | The destination: the definition, `reserve`, the queue, the operation `judge` with its retained observations and fetched entries, `withdraw` with its mark, and the updates to the lane. | `platform/src/destination.ts`, `destination.rules.ts` | T1, T2, T3, T4, T29 | Care |
| 27 | Publishing: attempts, the mint and its revocation, the three classes of evidence, the deciding read, the slot, the first head, the receipt, `resend`. Remove the earlier log push. | `platform/src/destination.rules.ts`, the second half; `parked/git/src/publisher/log-push.ts`, `parked/room/src/logremote.ts` | T7, T8, T30, T31, T32 | Care |
| 28 | A publication that does not publish: the host keeps refusing, a compromised key, another writer, `adopt-head`. The fence of section 6.8 is not built: it is proposed and not adopted (U2). Remove the earlier landing machine. | The same file; `parked/git/src/landing/`; `parked/contract/src/landing.ts`, `guards.ts` | T5, T33 | Care |

**Milestone M4, publication.** The proof plan's A6 and A7 pass in both
orders of each race, with a lost push reply settled by a read.

### 8.6 The assembly

| Step | Delivers | Owns | Witness | Model |
|---|---|---|---|---|
| 29 | **Prepared ahead, filed only on adoption.** Activation and bytes: `activate`, `keep-configuration`, `open-issue`, `open-pr`, the membership reference of a lane, the address of a notice. Each on the form that its owner adopts. | `platform/src/rules.rules.ts`, `directory.rules.ts`; `scope/src/core.ts`, `outbox.ts` | T47 | Care |
| 30 | The lanes on the real repository: the fixture `graph` uses the real directory, rules scope and destination. The scripted peers and the test authority leave it. | `packages/lanes/test/support/graph.ts`; `scope/src/testing.ts` | The lanes' scenarios; T48; T49 if Q1 and Q2 are answered | Care |
| 31 | Removal, completed: what is left of the parked packages that section 6.1 names, and the ledger. | `parked/*`; `parked/README.md` | The check of active files; a listing of `parked/` against section 6.1. | Small |
| 32 | Guides: `docs/scopes.md`, `docs/testing.md`, a new `docs/platform.md`, the READMEs. Measurement. The deltas note and the delivery note. The gate, once. | `docs/*`; `notes/2026-10-0x-i3-*.md`; `scripts/measure-tests.sh` | `npm run gate`; `scripts/measure-tests.sh` | Small for the guides. The builder writes the delivery note. |

### 8.7 Parallel groups, in short

| Group | Steps | Condition |
|---|---|---|
| Base | 1, 2, then 3 and 4 | 3 and 4 own different files and run together after 1. |
| A1 | 5, 6 | After 3. One worker. |
| A2 | 7, 8, 9 | After 3. Beside A1. 7 and 8 are independent; 9 follows both. |
| B1 | 16a, 16b, 16c | After 4. Three workers. |
| B2 | 17, 21 | After 1. Two workers. They touch only `packages/git`, in different files. |
| C | 23 | After 9. Beside everything. |
| D | 26, 27, 28 | One worker, in order. |

Steps 3, 4, 12, 16, 30 and 32 are integration points. Each is one
worker's, with no other step open on the files it owns.

Counted by hand over the "Model" column of 35 steps: 8 are small, 24
need care, and 3 are mixed (15, 17 and 32).

## 9. Open questions, and risks

### 9.1 Questions for owners

| # | Question | Owner | The smallest decision |
|---|---|---|---|
| Q1 | How does a lane know its membership (P20)? The adopted body of a `create` is `{ fields, directory }`. The note says a lane gets the reference "in its creation's fields", and the pinned lane definitions declare no such field. | Request `c75205df`, with the lane forms | One of three. Adopt revision 13's form `{ fields, directory, membership }`. Or rule that a lane uses the note's rule for the rules scope: the ID from the directory's seed, the incarnation fixed by the first retained observation. Or add a genesis field to both lane definitions. This plan builds none until one is chosen. |
| Q2 | Three rules need bytes that no adopted type holds. Where an act entry retains a second observation (P19). How bytes that are not a detached text travel beside an intent (P21). How a notice is addressed (P23). | Request `c75205df` | For each: adopt a form, or name the adopted member that carries it. Revision 13 proposes forms for P21 and P23 and leaves P19 open. Until then no lane is created under an activated definition by a real directory. |
| Q3 | What makes a hold have a workspace? Section 13.7 says no source may derive the `fork`, `token` and `instance` records from the `hold` effect alone, and that the form is owed. | The successor of `406983fe`, with the contract and the lane forms | One predicate. This plan would propose: a definition whose rows write any capability guard or effect of `hold@1`. Step 18 waits for the answer. |
| Q4 | The four asks: the binding of a license request (R1-44); the reading of `not-owner` and `malformed` on a `withdraw`; activation with a platform creator's read; the task's reservations. | The successor of `406983fe` | An answer to each, or a statement that each stays as the note has it. No step waits. The delivery note reports each as an owned gap. |
| Q5 | Who builds capacity in items, bytes and pending requests, and when? The commission keeps all five dimensions "with `cc570904`". Three witnesses of section 5.8 say "no free room", and are shown in entries. | The planner, with `cc570904` | Say whether I3 builds the four dimensions, or declares its reservations in all five and builds entries and records. This plan assumes the second. |
| Q6 | Which Git host does the new model use? The earlier code used a Cloudflare Git service. Two retained files hold that host's refusal codes and its token's scheme. | The operator, under the installation design | Name the host. Until then the host port is abstract, and every host call is shown against `MemoryHost` only. |
| Q7 | Every number: the windows, the attempts, the ancestry bounds, the serving limits, the session's length. | The proof plan | None now. Each is a configured value with the note's proposed number. |
| Q8 | The note says that I3 owes a checker job on the real runner for each row of "What the checker signs", and that I3 runs the host session "when it is commissioned". Both need a deployment or a provider session. | The planner | Commission each separately, or say that I3 is filed without them and they follow. This plan launches neither. |
| Q9 | May each milestone of section 9.3 be reviewed and land while the request stays open, as I2's base did? | The planner | Yes or no. The plan assumes yes, and reports no milestone as I3. |
| Q10 | May the validator take a platform option, so that a platform definition's data is checked by the same validator under a name that begins `platform:`? I2 built the refusal as its own decision (its entries D5 and D14). | Request `c75205df`, with the successor of `406983fe` | Yes or no. If no, the six values are validated under a made-up name in the test, and the plan is otherwise unchanged. |
| Q11 | The serving limits' form for an IPv6 address, and the total request rate. The note says that I3 chooses the first and shares the second with the installation design. | The builder; the installation design | The builder proposes in step 15, and records it as a delta. |
| Q12 | Is the fence of section 6.8 adopted? | The authority note's review (U2) | Until it is, step 28 builds "hold" only, and the proof plan's F16 is not run. |

### 9.2 Risks, the largest first

1. **I3 as commissioned is too large for one review.** It is six
   definitions, two capabilities, a ledger, a gateway, a checker service,
   three new packages, the removal of five parked packages and about 50
   witnesses. I2 was two definitions and 38 forms, took 18 steps, grew
   `derive` by 2,900 lines, and its review still found seven faults. I3
   is perhaps three times that, and most of its steps are judgments, not
   tables. One review of the whole would be shallow. Section 9.3 proposes
   four milestones that each stand alone.
2. **A full run is blocked on four rulings** (Q1 and Q2). Without them
   the most visible result, a merge from a real founding, cannot be shown.
   The plan orders the work so that nothing waits on them until step 29,
   but the final milestone does.
3. **The authority port changes shape.** Today it is one synchronous
   question in the commit (`scope/src/ports.ts:25`). A real observation
   is read before the turn, kept for reuse, and retained in the entry.
   Step 3 touches the turn and every judge's context. A fault there is a
   fault in every act.
4. **Platform code is the largest row (P16), and nothing but its tests
   bounds it.** A rule written as code can drift from the note's table.
   Section 4.2 limits what it may do, T43 lists every rule, and replay
   derives each entry again. That still leaves the review to read each
   rule against its row.
5. **A stand-in could be mistaken for a host.** `MemoryHost` models the
   one property that the whole publication design rests on. The shared
   table of T9 ties it to a real repository, and every note labels it.
   H1 and H2 at the real host stay unproved until the host session.
6. **The unknown-duty custody is easy to get subtly wrong.** A helpful
   retry, a cleanup on restart, or a "reconcile by listing" would each
   settle what must stay unknown. T19 states the rule once. The earlier
   code had the same rule and the same temptation.
7. **Retained code carries earlier assumptions.** The push of the branch
   checked nothing about the commit, and the runner never read parents.
   A move without the review of section 6.3 would carry both faults into
   the new model.
8. **The estimate of tests is likely low**, as I2's was by more than two
   times. The gate's time may pass 25 s once two projects run the `git`
   program.
9. **Capacity is half built.** Records arrive with I3, and the other
   three dimensions do not. A witness "at no free room" in entries alone
   is honest only if it says so.
10. **I2 is not landed.** A change to a lane row moves two digests and
    the lanes' scenarios. The cost is small, and it lands on step 30.
11. **Bytes change again.** The `preparation` input, the register's
    seed, records in the folded state and `Observation` in a grant
    change the bytes of entries and of state digests. Nothing is
    migrated, because no deployed scope is built from these packages.
    That rests on a search of tracked files, as I2's note says, and not
    on proof.
12. **Parallel work meets at four files**: `scope/src/core.ts`,
    `derive/src/fold.ts`, `scope/src/testing.ts` and
    `platform/src/destination.rules.ts`. The step tables give each to
    one step at a time. I2's merge of tracks found three faults at such
    seams.

### 9.3 Proposed milestones

Each is reviewable alone, leaves the gate passing, removes what it
replaces, and can land. None is reported as I3.

| Milestone | Steps | What a reviewer can judge | Removes | Runs after it |
|---|---|---|---|---|
| M1 Authority | 1 to 15 | Founding, membership, the observation and the grant guard, sessions, enrolment, revocation and recovery, incidents. V6 and V9; V7's entries; the authority rows of A6. | The earlier founding, registry, authority, roster, admin and requests code. | Every act of a platform scope, on a real grant. |
| M2 Capabilities | 16a to 22 | Preparation, the records, staging, pins, ancestry, the token ledger, the gateway, the retained Git code after review. O3 and O15; V8's entries. | The scripted capability. The earlier workspaces, mint ledger, publisher and Git reader. | I2's W1. |
| M3 Checks | 23 to 25 | The rules, the checker service and the runner after review. | The earlier jobs and checker code. | A check from a request to its deciding entry. |
| M4 Publication | 26 to 28 | The destination: reservation, compare-and-set, readback, receipt, abort. A6 and A7 in both orders, with the lost push reply. | The earlier landing machine and log push. | A merge that a real destination decides, from a test's `reserve`. |
| M5 Assembly | 29 to 32 | The forms that owners adopt in the meantime; the lanes on the real repository; the last removal; the guides; the measured cost. | The scripted peers and the test authority, where Q1 and Q2 allow. What is left of the parked packages. | I2's W2 and W3. The full I3 is filed here, and accounts for every row of sections 3 and 4. |

M1 and M2 can be built side by side and reviewed in either order. M3 and
M4 each need both. If the planner prefers fewer reviews, M3 can join M4.
M1 should not be joined with anything: it changes the turn.

## 10. How this plan was made, and what it will not do

**Reading coverage.**

- The commission: in full.
- `AGENTS.md`, `docs/testing.md`, `parked/README.md`, the I2
  implementation plan and the I2 delivery note: in full.
- The I2 deltas note: sections 16, 19 and 23 in full; the rest by search.
- The authority note: sections 11, 11.1, 11.2, 12, 12.1 to 12.1.6,
  12.1.8, 12.2, 13 to 13.7 and 14 in full, by the author of this plan.
  Sections 1 to 10 and the opening were read in full by three delegated
  readers, who returned digests with line numbers. This plan rests on
  those digests for sections 3 to 8. Section 12.1.7, the task, was read
  by search only: it is IA's. The corrections file was read in its first
  60 lines. The facts file was not read.
- The contract: sections 6.1, 6.8, 6.9, 6.11, 7, 9, 11, 13, 15.3, 15.3a,
  15.7 to 15.10, 16 and 17 in full, by a delegated reader. Its other
  sections and its companion file were not read.
- Revision 13: its sections 11.11 and 15.3c and its two new send forms,
  by the same reader, as proposals. The rest was not read.
- The proof plan: the rows A6, A7, V6 to V9, O3, O12 and O15, the fault
  rows, section 4.1 and the rules of economy and measurement, by a
  delegated reader. Its sections 8.6 to 9.4 and 14 were not read.
- The recovery design: its section 12 and the parts that name I3, by the
  same reader. Its sections 5 to 11 were not read.
- The demo contract: sections 7 to 9 and 11 to 14, by the same reader.
- The source at `50bba45c`: `scope/src/ports.ts`, `testing.ts` and
  `definitions.ts`, and `contract/src/capability.ts` and `scope.ts` in
  full. `contract/src/entry.ts`, `derive/src/capability.ts`, `hold.ts`,
  `genesis.ts`, `judge.ts` and `scope/src/core.ts`, `namespace.ts` in
  part. The validator's modules by search, for each line that section 4
  cites. `packages/lanes`, `packages/client` and `packages/replay` by
  search only.
- The parked source: by a delegated reader, who read 40 files in full
  and the landing machine, the mint ledger and the workspace modules by
  their headers only. Section 6.3 rests on that reading. No line of it
  was checked again by the author.
- One observed run of `npm ci` and `npm run gate` at `50bba45c`.

A digest loses detail, and its faults read as findings. Each step
that is marked "Care" begins by reading its own sections of the
authority note at the lines.

**What I3 will not do.** No deployment, no provider call, no probe, no
new credential, no registry publication and no external cleanup. No
change to a deployed resource, to what E1 settles, to another checkout
or to a stash. No form is declared in source as if that adopted it. No
stand-in is reported as the thing it stands in for. No unknown duty is
settled by a restart, a listing, time or a new ref.
