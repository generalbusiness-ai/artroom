# Plan 027.2: Make local preparation and room creation predictable

> **Executor instructions:** This is a future implementation handoff. The review changed no CLI behavior. Obtain the existing contract owner's adopted decisions before dependent source work. Execute steps in order, track work with a gitseq request, and stop on the conditions below. Do not substitute an invented hosted account or implicit operator authority. The planner maintains the parent index.
>
> **Current baseline:** Accepted I5 is `7bb3a6415892138a25f5a147f89ae8469b0a716d`; the publication base is `16d7ba440d148c8d6dc29307810ee3c0c103c624`. [BASELINE.md](../BASELINE.md) supersedes the old findings below. Implementation remains uncommissioned and undispatched.
>
> **Drift check after future dispatch:** `git diff --stat 7bb3a6415892138a25f5a147f89ae8469b0a716d..HEAD -- packages/cli/src packages/cli/test docs/cli.md docs/hosts.md`
> Compare excerpts against live source. Accepted I5 retains main claim/join recovery and integrates repaired planned-install/clone/edit code. Compare later drift from accepted I5, including `store.ts`, `clone-proof.ts` and `clone-outcome.ts`; do not copy the historical315 implementation. STOP if integration changes retry meaning or source does not match.

## Status

- **Priority:** P1 for preparation/preset; P2 for full import and renewed Git reads
- **Effort:** L
- **Risk:** HIGH
- **Depends on:** plan 006 C1/C3/C4/N5; plan 025 application preset; 027.1 read/receipt semantics
- **Category:** dx / direction
- **Planned at:** main `1eed91aacac56649ac0b75c0652215b0418eeff8`, candidate `3157859665e5531a3f94b124ccec00d2994c01ad`, 2026-10-08

## Current I5 reconciliation

| Earlier finding | Accepted I5 behavior | Work still proposed and owed |
|---|---|---|
| Failed/capped item or history reads and failed destination reads look empty | Page summary, definition and enumerations reject incomplete, failed and mixed-head results; budget exhaustion is unreadable. Publications use checked destination reads. | Partial rows with typed provenance/continuation; text absent/redacted versus unreadable; qualified advisory fallbacks; bounded room query and scoped publication reads. |
| Returned action answer disappears after failed refresh | `act` exposes the real answer before awaited refresh; `main.ts` retains it by service/directory/membership/key/scope and the failure view displays it. | This map is memory-only. Durable draft, original signed envelope, lost-reply settlement and reload/outbox recovery remain with the shared owner. |
| Unsafe service/identity or proposal links; HEAD presented as a selected version | Page rejects credential-bearing and unsupported cross-origin service settings before persistence/join/read; join validates supplied identity. Site validates URL and stable repository identity. Latest-site navigation is labelled separately; invalid proposal paths have no version link and immutable rendering is explicitly unavailable. | Fresh standing and contextual authority; authorized immutable artifact/preview routes, cross-origin isolation and selected-version viewing. `siteAddress` still constructs a HEAD address; the guarded view, not this helper alone, suppresses invalid proposal links. |
| Clone and planned install use weaker recovery | Planned install retains an exact attempted marker and configured-service acknowledgement; clone checks the exact accepted request/opening/outcome before reading one credential, bounds observation and preserves unknown/refused recovery guidance. Existing claim/join saved-envelope recovery is retained. | Clone occupied/writable-target preflight, renewed fetch custody, local attachment/import, multi-room context and durable application/edit orchestration. Service acknowledgement is not independent founding-history proof; stand-in witnesses are not provider acceptance. |

Future steps are proposed only. Reuse the already-landed invariants above rather than commission them twice. Remaining reload/outbox, standing, query, preview and external acceptance duties stay open.

## Why this matters

The rehearsal requires six commands plus a Worker-setting intervention before an issue/change can be created. Current global configuration selects one room, and the claimed name is output-only. A local project and durable application orchestrator remove unnecessary mechanisms from everyday work while preserving authority, files, secrets and exact-request recovery.

## Historical inspected state (1eed/315)

Main `packages/cli/src/files.ts/configDir` chooses user storage; `fileStore` atomically writes owner-only configuration/key/private records. `store.ts/Config` contains one repository; `ClaimStep`, `PendingClaim` and `PendingJoin` retain exact envelopes/facts. `commands.ts/install` founds an operator-controlled register; `claim` creates a room and enrollment, refuses a second room and prints the friendly name. `line.ts/USAGE/command` is the parser/dispatcher. `docs/cli.md` and `hosts.md` document operator/provider constraints.

Historical1eed excerpts; these are not current line numbers:

```ts
// files.ts:19–21
if (env["ARTROOM_HOME"]) return env["ARTROOM_HOME"];
return join(env["XDG_CONFIG_HOME"] || join(homedir(), ".config"), "artroom");
// commands.ts:277 — install
const fields = { host: options.host ?? "github.com", namespace: options.namespace ?? "artroom", policy: "keys", founders: [signer.key] };
// commands.ts:344 — claim
if (config.repository) return usage(`A repository is claimed here already: directory ${config.repository.directory.scope}.`);
// commands.ts:355–358
const handle = options.handle ?? "@founder";
const shape = platform(REGISTER)!.data as unknown as DefinitionShape;
const fields = { branch: options.branch ?? "main", founderHandle: handle, recoveryKey: recovery };
// store.ts:28
export interface ClaimStep { signed: SignedIntent; accepted?: FactRef }
```

Candidate `commands.ts/clone:853–905` mints a read token before Git clone discovers an occupied target, uses one-hour expiry by default and keeps authorization in Git's environment only. Candidate `edit:959–1015` reads UTF-8 up to 65,536 bytes, opens a change, asks rules, proposes and tries merge; no durable journal covers the successive acts. Candidate `merging:1043–1073` correctly distinguishes refused publication but requires log inspection before retry after timeout. Neither main nor candidate supports the proposed `init/connect/propose/status/publish` vocabulary.

Main `test/claim.scope.test.ts` demonstrates exact saved found/seat/first-key across lost replies and real scope restart, with host/scheduler/clock stand-ins. `join.scope.test.ts` keeps secret-bearing envelope private and checks facts cannot substitute another enrollment. `files.test.ts` is the owner-only/atomic storage exemplar. Do not copy candidate's older recovery instead of these mechanisms.

## Scope

**In scope after decisions:** `packages/cli/src/commands.ts`, `line.ts`, `store.ts`, `files.ts`, `main.ts`, `index.ts`; integrated `git.ts` only when the adopted change affects it; create `packages/cli/src/project.ts` for the adopted nonsecret binding/context resolver and `packages/cli/src/application.ts` for the adopted preset orchestration adapter; `packages/cli/test/files.test.ts`, `claim.scope.test.ts`, `join.scope.test.ts`, `story.scope.test.ts`; create `packages/cli/test/project.test.ts` and `application.scope.test.ts` only when their adopted slices require them; extend existing `clone.scope.test.ts`; `docs/cli.md` and `docs/hosts.md`. Additional release guides remain with plan 026's owner; changing them requires an exact path/scope amendment.

**Out of scope:** new membership/register authority rules, account/authentication backend, provider account creation/App installation, generic outbox/settlement engine, source mirroring, force pushes/history rewriting, renderer, framework/package updates, secret detection guarantees. Existing-repository import and renewed Git fetch are design prerequisites owned with C4/N1; do not fabricate them within this CLI wrapper.

## Verification after future dispatch (not run for publication)

This is a selection map, not a script to run repeatedly. Reuse the accepted I5 witnesses for unchanged guards. Select one exact affected file per changed invariant at its cheapest sufficient boundary; extend an existing witness where it owns that invariant. A later step references its retained result instead of rerunning it unless material source changes invalidate it. Asset parity follows an actual UI build; one final gate covers the completed implementation. New test paths and proposed product commands are unavailable until their separately dispatched slice creates them.

| Purpose | Command | Expected result |
|---|---|---|
| CLI types | `npm run typecheck --workspace @generalbusiness/artroom-cli` | Exit 0 |
| Local storage/context | `./node_modules/.bin/vitest run --project cli packages/cli/test/project.test.ts` (new context file after dispatch; select existing `files.test.ts` only for changed storage invariants) | Node CLI tests pass, including new project tests |
| Durable real-scope recovery | the exact affected `packages/cli/test/claim.scope.test.ts`, `join.scope.test.ts` or `story.scope.test.ts`, once; preserve unchanged recovery evidence | Only the changed recovery invariant's exact file runs; no similarly named Page/lane stories are selected |
| New orchestration witness, once created | the proposed `packages/cli/test/application.scope.test.ts` after creation or existing `packages/cli/test/clone.scope.test.ts`, selected for the changed invariant | Select only the implemented orchestration or changed clone invariant; label stand-ins |
| Changed-source selection | `npm run test:changed` (only for affected witnesses not already exercised) | Affected witnesses pass |
| Whitespace | `git diff --check` | Exit 0 |
| Review gate | `npm run gate` | Once at implementation review head, all steps pass |

Use installed tooling; never install a probing package in a checkout. No documented command is proof of a deployed provider flow. Guides require the named release/hosted acceptance owned by plan 026.

## Git workflow

Create an isolated request worktree. Keep logical commits with plain subjects such as `Bind prepared projects to explicit room identities`. Do not push, merge or deploy without operator dispatch. Keep uncommitted changes out of a landing checkout.

## Steps

### Step 1: Freeze the application/context contract with existing owners

Adopt who may create a room on an installed service; signed discovery/readiness; persisted room display label versus immutable scope identity; exact preset digest/configuration generation; review policy including solo exception; local binding location/version; multi-room user registry; CLI context precedence; resume/settle interface and credential custody. Explicit CLI `--room` must either override local context with a displayed subject or require deliberate switch; decide one behavior. An invitation selects its exact room, not last-use context. Decide Git metadata needs, committed-snapshot import, worktree/submodule/bare handling and inclusion rules. Do not derive identity authority from Git author configuration. Record separate unavailable/operator/not-authorized states.

**Verify:** `git diff --check` → exit 0 for the commissioned contract. The named C1/C3/C4/N5/025 owners adopt decisions and provide actual interfaces. Missing service creation/settlement/import APIs are a STOP before dependent source; no fabricated command can verify them.

### Step 2: Implement reversible local preparation and deterministic resolution

Add `project.ts` using the adopted format. `init` preserves all local files/Git state, writes only nonsecret attachment/preparation metadata and is idempotent. No register creation, signing or upload. User keys remain under `fileStore`; public repository metadata never contains key or invitation bytes. Resolve bound folder/explicit room/user registry deterministically; ambiguous context returns a useful error before signing. Migrate legacy one-room config without dropping pending envelopes or keys, and refuse destructive schema downgrade. Handle nested roots/worktrees/bare according to adopted contract, with safe rejection for unsupported cases.

**Verify:** `./node_modules/.bin/vitest run --project cli packages/cli/test/project.test.ts` (new context file after dispatch; select existing `files.test.ts` only for changed storage invariants) → preparation repeated twice leaves one binding, existing Git/index/remotes/files unchanged, no transport calls, ambiguous/wrong-room context signs nothing, metadata contains no fixture secret, atomic/owner-only tests pass. `npm run typecheck --workspace @generalbusiness/artroom-cli` → exit 0.

### Step 3: Add durable preset orchestration over existing acts

Implement `application.ts` against shared retained preparation/settlement. Separate local preparation, authorized remote creation, application activation and local attachment. Save every exact signed stage before send and accepted fact after; validate persisted subject/key/incarnation. Resume known accepted stages; settle unknown ones without fresh signature/deadline. Bind only the created room, including when local write fails after remote creation. Do not treat multiple scopes/external effects as an atomic transaction. Missing provider configuration ends with “Waiting for operator configuration” and one real action, not success. Generated nonsecret operator config must pin the same retained register identity.

**Verify:** `./node_modules/.bin/vitest run --project scope packages/cli/test/application.scope.test.ts` (after creation; reuse claim/join mechanisms and unchanged evidence) → failures before delivery, after accepted reply, between activation stages and at local binding recover one room/generation with same envelopes; `--again` is deliberate distinct creation; swapped cached scope/key/fact refuses; unavailable founder authority signs no unauthorized room request. Use injected fault gates/clocks, not sleeps.

### Step 4: Expose outcome vocabulary and preflight clone

Add adopted high-level command dispatch and concise output: subject, result, publication distinction, one next action and link; optional verbose inspection retains exact IDs/receipts. Do not silently change existing `edit` publication semantics while aliases are introduced; deprecate/transition explicitly. Check Git and target shape/writability before token mint. Clone uses the adopted readable label and writes a nonsecret binding. A failed/partial clone never deletes user files automatically. Make one-time authorization and supported renewal explicit, with no token in arguments/log/config/URL. Implement import only once its actual source snapshot/authorization contract exists; otherwise stop that slice and accurately document what remains unsupported.

**Verify:** `./node_modules/.bin/vitest run --project scope packages/cli/test/clone.scope.test.ts` for changed target preflight; proposed `application.scope.test.ts` only for orchestration → occupied/unwritable target/missing Git mint nothing; token is environment-only; failed clone retains precise recovery; known proposal success is explicitly unpublished where appropriate; unknown merge never prints a confirmed live result. `./node_modules/.bin/vitest run --project cli packages/cli/test/project.test.ts` (new context file after dispatch; select existing `files.test.ts` only for changed storage invariants) → parser/help and context tests pass.

### Step 5: Produce release-bound guides and acceptance evidence

Update actual command/reference guides with plan 026; label operator setup separately from provisioned-service creation and member joining. Do not present unimplemented examples as executable. Run focused affected tests and one review gate. Obtain the existing journey owner's explicit commission for a cold-person journey with existing files, join/clone, second room, existing Git, interruption after creation and protected-file publication. Record decisions, unfamiliar terms, assistance, time and state understanding; preserve actual host boundary and exact release. Do not claim the prior main gate proves this workflow.

**Verify:** `npm run test:changed` (only for affected witnesses not already exercised) and `git diff --check` → exit 0; `npm run gate` → one successful review-head run. Guide owner records generated-interface drift check and actual passing hosted tutorial/cold reader acceptance; if those are absent, source can be reviewed but guide/journey acceptance remains open.

## Test plan

Use `files.test.ts` for actual filesystem fixtures and storage modes; `project.test.ts` must compare before/after file bytes, index/remotes and transport call counts. Follow exact-envelope capture/fault injection in `claim.scope.test.ts` and `join.scope.test.ts` for `application.scope.test.ts`. Cover empty/populated/non-Git/existing Git/already bound/conflicting service/multiple rooms/nested roots/worktrees/bare/submodules; interruption and schema migration; expired unattempted versus attempted unknown request; unsupported host and creation authority; clone failures before and after token issuance. Demonstrate preserved secrets through assertions on fixture values, never dump production credentials. Test the actual accepted facts, not only CLI strings.

## Done criteria

- [ ] Local init performs no remote effect and leaves files/history/index/remotes unchanged.
- [ ] Context selects an immutable room unambiguously before signing; legacy pending operations survive migration.
- [ ] Provisioned creation uses real authority and one preset with durable exact stage recovery.
- [ ] Clone preflight prevents needless tokens; credentials never persist in ordinary project files/logs.
- [ ] No success message conflates prepared, proposed, submitted, pending and published.
- [ ] Implemented command help/types/focused tests and one review gate pass.
- [ ] Documentation names supported release and actual hosted acceptance limits.
- [ ] Only commissioned in-scope paths changed.

## STOP conditions

Stop for unresolved founder authority, binding schema/context precedence, application preset/review policy, generic retained submission interface or import/Git renewal custody. Stop if a proposed easy path requires operator secrets for normal members, changed retry would re-sign an attempted request, local adoption would overwrite files/remotes, candidate drift loses main recovery, out-of-scope backend changes become necessary, or focused verification fails twice. Do not weaken rules to meet onboarding targets.

## Maintenance notes

The application preset is versioned product configuration; updates must preserve historical meaning and resumed request identity. Future multiple-device identity and import work belongs with plan 006 C4/N1. N5 owns provider/installation seams, plan 025 owns pages packaging, and plan 026 owns released guides. The room's canonical copy must remain distinct from a source Git repository until synchronization is explicitly designed.
