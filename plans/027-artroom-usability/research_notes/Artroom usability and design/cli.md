# Artroom CLI initialization and cognitive load

## Publication reconciliation — 8 October 2026

This proposal is published under request `41c14d2b`, following assessment `ea37da9c`. The original research used main `1eed91a` and reference `315785966`; their excerpts, screenshots and findings remain historical evidence. The accepted I5 merge is `7bb3a6415892138a25f5a147f89ae8469b0a716d`. Publication starts from `16d7ba440d148c8d6dc29307810ee3c0c103c624`, which adds the sprint report without changing I5 packages. Main now contains the page, site, clone, edit, issue and planned-install code. Neither these historical observations nor the retained sample QA describes the current product as a whole.

| Earlier finding | Accepted I5 behavior | Work still proposed and owed |
|---|---|---|
| Failed/capped item or history reads and failed destination reads look empty | Page summary, definition and enumerations reject incomplete, failed and mixed-head results; budget exhaustion is unreadable. Publications use checked destination reads. | Partial rows with typed provenance/continuation; text absent/redacted versus unreadable; qualified advisory fallbacks; bounded room query and scoped publication reads. |
| Returned action answer disappears after failed refresh | `act` exposes the real answer before awaited refresh; `main.ts` retains it by service/directory/membership/key/scope and the failure view displays it. | This map is memory-only. Durable draft, original signed envelope, lost-reply settlement and reload/outbox recovery remain with the shared owner. |
| Unsafe service/identity or proposal links; HEAD presented as a selected version | Page rejects credential-bearing and unsupported cross-origin service settings before persistence/join/read; join validates supplied identity. Site validates URL and stable repository identity. Latest-site navigation is labelled separately; invalid proposal paths have no version link and immutable rendering is explicitly unavailable. | Fresh standing and contextual authority; authorized immutable artifact/preview routes, cross-origin isolation and selected-version viewing. `siteAddress` still constructs a HEAD address; the guarded view, not this helper alone, suppresses invalid proposal links. |
| Clone and planned install use weaker recovery | Planned install retains an exact attempted marker and configured-service acknowledgement; clone checks the exact accepted request/opening/outcome before reading one credential, bounds observation and preserves unknown/refused recovery guidance. Existing claim/join saved-envelope recovery is retained. | Clone occupied/writable-target preflight, renewed fetch custody, local attachment/import, multi-room context and durable application/edit orchestration. Service acknowledgement is not independent founding-history proof; stand-in witnesses are not provider acceptance. |

The four handoffs below are **future proposals**. This publication does not adopt their designs, commission or dispatch implementation, change application behavior, or authorize cloud/provider/browser/device/user sessions. Proposed commands and APIs remain unavailable until implemented and adopted. Plans 006, 020, 025 and 026 retain their authority, settlement, journey, preview, packaging and guide duties. Exact review, native browser, provider, physical-device, accessibility, scale and cold-user acceptance remain open.

For future implementation, choose the exact affected file and invariant once per slice; do not run repeated broad CLI/Scope selections. Reuse unchanged witnesses, then run one final gate at the implementation review head. This documentation publication runs `git diff --check` and compares source/package tree identity to the retained accepted gate; it runs no suite, build, rehearsal or browser check. See [current baseline and evidence](../../BASELINE.md).

## What does a person have to do today?

### Takeaway
The rehearsal makes an application user do platform-operator work before the first useful act. The major avoidable burden is selecting and configuring mechanisms—register, host namespace, signing identity, rules JSON, definition bytes—rather than the measured waiting time. No `init` or existing-repository import is available in the active baseline CLI.

### Cited Findings

All baseline citations refer to `1eed91aacac56649ac0b75c0652215b0418eeff8`, the historical checkout at research time. Rehearsal-source citations below explicitly use `planner/i5-demo-host` at `315785966`; those files are readable with `git show 315785966:<path>`. Do not cite their line numbers as if they were current main. The sprint report says that deployed planner source is the reference, while planned install, member clone, edit, issues and page were not on main. [Source](../../../../notes/2026-10-07-23-sprint-report.md#L52-L66)

1. **Actual rehearsal setup:** `artroom install --plan <service> --host artifacts --namespace artroom-demo`; manually set the Worker's `registerScope`; `artroom install --planned`; `artroom claim <name> --handle @hugh`; publish a large JSON rules configuration with `act publish`; activate issue and change definitions separately with digest flags and local JSON files. This is six CLI commands and one operator configuration intervention before an issue or edit, excluding software availability and account/deployment setup. Invites, joins and clone add the collaboration setup after that. [Source](/Users/hughpyle/tmp/artroom-rehearsal-1/transcript.md:14); [Source](/Users/hughpyle/tmp/artroom-rehearsal-1/transcript.md:23); [Source](/Users/hughpyle/tmp/artroom-rehearsal-1/transcript.md:40); [Source](/Users/hughpyle/tmp/artroom-rehearsal-1/transcript.md:53); [Source](/Users/hughpyle/tmp/artroom-rehearsal-1/transcript.md:64); [Source](/Users/hughpyle/tmp/artroom-rehearsal-1/transcript.md:75)
2. **An install is not application installation:** it creates a register whose founder policy is `keys` and whose founder is the operator signing key. Default host `github.com` and namespace `artroom` are signed into that register, rather than discovered from a service or account. [Source](/Users/hughpyle/play/artroom/packages/cli/src/commands.ts:270); [Source](/Users/hughpyle/play/artroom/packages/cli/src/commands.ts:277)
3. **A room name is output-only today:** the `claim` argument appears in the completion sentence but not the `found` fields, which contain branch, founder handle and recovery key. Thus a nice name does not identify a remotely addressable named room, and neither `claim project-name` nor the current global config establishes a directory-local project. [Source](/Users/hughpyle/play/artroom/packages/cli/src/commands.ts:356); [Source](/Users/hughpyle/play/artroom/packages/cli/src/commands.ts:481); [Source](/Users/hughpyle/play/artroom/docs/cli.md:61)
4. **One global room by default:** `configDir()` consults `$ARTROOM_HOME`, then `$XDG_CONFIG_HOME/artroom`, then `~/.config/artroom`; it does not consult the current working directory. The config contains a single optional `repository`. A second claim is refused once that is set; joining another room also requires another config directory. [Source](/Users/hughpyle/play/artroom/packages/cli/src/files.ts:18); [Source](/Users/hughpyle/play/artroom/packages/cli/src/store.ts:52); [Source](/Users/hughpyle/play/artroom/packages/cli/src/commands.ts:344); [Source](/Users/hughpyle/play/artroom/packages/cli/src/commands.ts:542)
5. **Local state is not Git state:** baseline CLI command inventory is install/claim/invite/join/acts/act/log/show/verify. Rehearsal branch adds remote/clone/edit/merge/issue(s), but neither inventory supplies `init`, local-repository attachment or import. Baseline and rehearsal `claim` create a repository through the register; neither reads a local `.git`, current branch, existing remote or local files. [Source](/Users/hughpyle/play/artroom/packages/cli/src/line.ts:8); rehearsal source `315785966:packages/cli/src/line.ts:8–32`, `315785966:packages/cli/src/commands.ts:391–455`.
6. **Identity is key-based, not account sign-in:** install makes `operator`, claim makes `recovery`, founder handle defaults to `@founder`; join makes `device` and gets the handle/service/repository from the invitation. Keys remain in the global owner-only key store, and membership decides authority. No login/account authorization command appears in either inventory. [Source](/Users/hughpyle/play/artroom/packages/cli/src/commands.ts:275); [Source](/Users/hughpyle/play/artroom/packages/cli/src/commands.ts:355); [Source](/Users/hughpyle/play/artroom/packages/cli/src/commands.ts:534); [Source](/Users/hughpyle/play/artroom/packages/cli/src/files.ts:1)
7. **Provider setup is real and substantial:** the own-host deployment requires an `ARTIFACTS` binding and nonsecret `ARTIFACTS_CONFIG` with exact fields including the pinned register. Namespace is constrained to `artroom-demo`. GitHub requires App configuration/private key plus creation/read tokens, and optionally cleanup tokens. A host port is restricted to its pinned register and destinations descended from it; unsupported/unconfigured hosts leave operations recorded and unsent. Replacing this with a fictional default hosted account would be inaccurate. [Source](/Users/hughpyle/play/artroom/docs/hosts.md:16); [Source](/Users/hughpyle/play/artroom/docs/hosts.md:27); [Source](/Users/hughpyle/play/artroom/docs/hosts.md:40); [Source](/Users/hughpyle/play/artroom/docs/hosts.md:110); [Source](/Users/hughpyle/play/artroom/docs/cli.md:35)
8. **Retry discipline exists and must survive simplification:** baseline claim saves the exact signed found/seat/first-key before submitting; resumes preserve the signature/deadline and validate accepted facts. `--again` intentionally starts a distinct claim and can create another repository. Join retains its exact secret-bearing request in private owner-only storage, separate from public config. [Source](/Users/hughpyle/play/artroom/packages/cli/src/store.ts:24); [Source](/Users/hughpyle/play/artroom/docs/cli.md:65); [Source](/Users/hughpyle/play/artroom/docs/cli.md:85); [Source](/Users/hughpyle/play/artroom/packages/cli/test/claim.scope.test.ts:16); [Source](/Users/hughpyle/play/artroom/packages/cli/test/join.scope.test.ts:16)
9. **Rehearsal has older retry behavior than main:** its `planInstall` can overwrite an earlier plan, and `installPlanned` checks expiry before attempting founding, with no durable attempted/accepted step. Its claim saves a digest and discards pending state on `Stop`; main preserves the actual signed envelopes. Any implementation plan should integrate main's recovery improvements into the application workflow rather than copying the rehearsal wholesale. Rehearsal source `315785966:packages/cli/src/commands.ts:329–365`, `:381–421`; compare [main source](/Users/hughpyle/play/artroom/packages/cli/src/commands.ts:350).
10. **Clone works once, with transient authorization:** rehearsal `clone [directory]` defaults to a one-hour read token; when directory is omitted Git's default is the generated repository name, not the friendly claimed name. It invokes `git clone` with an environment-only authorization header and does not retain that credential. A normal later Git fetch is not automatically authorized by the original clone. Token minting occurs before Git discovers a nonempty target directory. Rehearsal source `315785966:packages/cli/src/commands.ts:853–905`, `315785966:packages/cli/src/git.ts:1–20`; observed clone [Source](/Users/hughpyle/tmp/artroom-rehearsal-1/transcript.md:134).
11. **`edit` is submit-and-try-publish, not open an editor:** `--file` is mandatory; content must be UTF-8 text at most 65,536 bytes. It opens a change, asks for rules, proposes the file, optionally links an issue, and attempts merge. The default title is `Edit <path>`. No operation journal retains these successive commands; a repeated edit can open a second change. On merge wait timeout it tells the person to examine a log before repeating merge. Rehearsal source `315785966:packages/cli/src/commands.ts:959–1015`, `:1043–1073`. A refused rule merge correctly says "Not published" and preserves the change; [Source](/Users/hughpyle/tmp/artroom-rehearsal-1/transcript.md:205).
12. **This work already has owners:** plan 006 C4/C5/C6 covers identity/import/full journey; N3 is the public starter; DX D3 calls for one shared preparation/outbox/retry path, and DX D5 distinguishes ordinary acts, admin activation, operator bindings and code deployment. Plan 025 pages explicitly proposes `claim <name> --app pages` to bundle definitions/configuration/renderer; it is a proposal, not an implemented command. Plan 020's per-change preview/build/promote deployment must not be confused with the current published markdown renderer. [Source](/Users/hughpyle/play/artroom/plans/006-2026-10-03-experience-and-developer-adoption.md:49); [Source](/Users/hughpyle/play/artroom/plans/006-2026-10-03-experience-and-developer-adoption.md:98); [Source](/Users/hughpyle/play/artroom/plans/025-2026-10-07-published-pages.md:71); [Source](/Users/hughpyle/play/artroom/plans/020-2026-10-05-repository-to-live-site.md:13)

### Inferences

- Six successful commands in about 32 seconds would still impose six different models. The eighty-second expert/scripted run is not evidence of low cognitive load or cold-user success. Count unfamiliar decisions, required concepts, configuration contexts and recovery interventions, not only elapsed time.
- Existing empty directory, populated directory and existing Git repository currently all face the same limitation: the room is a fresh remote creation; local contents are unrelated until a later one-file `edit` (rehearsal) or unimplemented import path. Do not imply cloning into an existing nonempty working directory solves adoption.
- The first product win can be a high-level room/application orchestrator over existing signed acts, but enabling normal members to create rooms on an already-installed service requires explicit authority/lifecycle design: current register `keys` policy names the operator key. An orchestration wrapper alone cannot turn every joining member into a founder.

### Gaps

- The transcript identifies deployment and runner, not a precise runner git commit. Branch `315785966` is corroborating nearby source, not a cryptographic claim that every transcript byte came from exactly that head.
- No cold-person or mobile setup study was found. Timings in the sprint report are expert observed runs. No substantial effort estimate is reliable until the authority model and local-binding format are agreed.
- Identity enrollment across browser and CLI and a hosted service that can admit multiple independent founders are separately owed; current install authorization is explicitly unimplemented. A proposed one-command sign-in should be labeled future architecture, not available infrastructure.

### Short source excerpts for writer vetting

These are repository excerpts, not inferred behavior:

- `packages/cli/src/files.ts:19–21`: `if (env["ARTROOM_HOME"]) return env["ARTROOM_HOME"]; return join(env["XDG_CONFIG_HOME"] || join(homedir(), ".config"), "artroom");`
- `packages/cli/src/commands.ts:277`: `const fields = { host: options.host ?? "github.com", namespace: options.namespace ?? "artroom", policy: "keys", founders: [signer.key] };`
- `packages/cli/src/commands.ts:356–358`: `const handle = options.handle ?? "@founder";` and `const fields = { branch: options.branch ?? "main", founderHandle: handle, recoveryKey: recovery };`
- `docs/cli.md:61–63`: "`<name>` is a label for this output only: the register's `found` act has no name field".
- `docs/hosts.md:27–29`: "Its setting pins one register scope ID. Only that register, and the destinations born of that register's claims, can use the host."
- `packages/cli/src/commands.ts:344`: `if (config.repository) return usage(\`A repository is claimed here already: directory ${config.repository.directory.scope}.\`);`
- `315785966:packages/cli/src/commands.ts:856`: "default 1, from 1 to 24" for clone token hours; `:901–902` saves only `remote`, then calls Git with `headerEnv(authorization(repository, value.token))`.
- `315785966:packages/cli/src/commands.ts:1066`: `run artroom merge ${lane} again only after artroom log ${lane} shows the merge ${seq} ended.`
- `notes/2026-10-07-23-sprint-report.md:64–66`: "The member's path, edit, issues, the page and the planned install are not on main."

**Count unit:** six command invocations, not six shell tokens or six unique verb families: (1) install --plan, (2) install --planned, (3) claim, (4) act publish, (5) act activate issue, (6) act activate change; plus one out-of-band Worker-setting intervention. This ends at application readiness, before invitations, clones, issue creation or any content publication. The observed setup shots run from 03:07:42.287Z to the end of change activation (03:08:13.835Z by start 03:08:12.535Z + 1.3s), approximately 31.5 seconds including the operator wait; the user still has not completed a useful issue/change. This is the transcript's runner clock, not a measured cold-user study. [Source](/Users/hughpyle/tmp/artroom-rehearsal-1/transcript.md:3); [Source](/Users/hughpyle/tmp/artroom-rehearsal-1/transcript.md:70)

## What should the easiest supported path become?

### Takeaway
Separate local adoption, room creation, provider connection and deployment installation. Make a project understandable before hosting; once a service is genuinely provisioned and the user authorized, create a usable room with one application-level command and one summary, while retaining the individual durable steps underneath.

### Cited Findings

The recommended separation follows current install/claim authority, the absence of local binding, global room config, own-host constraints and the already proposed application preset. [Source](/Users/hughpyle/play/artroom/docs/cli.md:35); [Source](/Users/hughpyle/play/artroom/packages/cli/src/store.ts:52); [Source](/Users/hughpyle/play/artroom/docs/hosts.md:27); [Source](/Users/hughpyle/play/artroom/plans/025-2026-10-07-published-pages.md:71)

### Inferences

The following are **proposed commands and copy, not current support**. Command spelling should be validated with users before being commissioned.

**A. Local-first entry:**

```text
$ mkdir handbook
$ cd handbook
# Write a page using any editor.
$ artroom init
Prepared handbook in this folder.
Files are local. No room has been created or published.
Next: artroom connect
```

`init` should be local, reversible and repeatable; it should not create a register, host repository, public site or account, and should not stage/commit files. If a local Artroom binding already exists, show its room and status rather than replace it. The key store belongs to the user, outside the repository. The project binding contains only nonsecret service/room identity. Existing Git metadata/remotes/branch remain intact. Creating Git metadata for a non-Git directory is a decision to resolve explicitly; my recommendation is no implicit `git init` until the chosen proposal/import path requires it.

**B. Connected service with legitimate room-creation authority:**

```text
$ artroom connect
Create a room for handbook on Example Workspace?  [Create room]
Creating room…
Setting up issues and changes…
Connected handbook.
Review: independent approval for controlled files; ordinary content follows the chosen preset.
Files have not been published.
Open room: <room URL>
Next: artroom propose
```

For an authorized, already-configured service, folder name is the suggested room label; one preset bundles lane activation and rules setup. A web version uses a minimal **Create room** form with Name and workspace context, plus an Advanced disclosure. Provider settings and custom definition digests stay in operator/application configuration. If the operator has not provisioned the service, the CLI must diagnose that and provide the exact operator action; it must not silently found a register for every user or fake that deployment work succeeded.

**C. Existing Git repository:** same local `init`; `connect` detects origin/current branch and offers **Create room from this repository** with a concrete import summary. Import a chosen committed snapshot first; explain whether the room uses an Artifacts copy or a GitHub destination. Display the source repository separately. Dirty/untracked files stay local unless deliberately included in a proposal. Do not rename `origin`, force push, rewrite history or claim continuous synchronization. Subsequent `propose` makes an exact reviewable change; the destination remains the writer of the published branch.

**D. Joining:** invitation contains service/room/member identity, so no provider choices. After membership admission, show `Joined handbook as @sam. Next: artroom clone handbook`, plus the room link. Clone uses a readable room label by default and writes a local binding in the clone. Joining another room extends a user room registry rather than requiring a second `ARTROOM_HOME`. From a bound folder, room context is automatic; elsewhere require an explicit room selection if ambiguous. Do not guess a room from the most recent command.

**E. Self-hosted operator:** retain an explicitly advanced `artroom admin setup` / existing `install --plan` path, with actual provider prerequisites. Sign and retain the install identity; generate the complete nonsecret configuration artifact from it; check binding readiness before allowing a claim; resume exact attempted envelopes. A CLI cannot create external accounts/App installations/credentials without the appropriate provider consent. Show "Waiting for operator configuration" with a failed prerequisite and one precise next step, never a two-minute spinner headed "Creating your room" when the port is disabled.

#### Defaults to adopt

| Choice | Current default / observation | Proposed default | When to expose a choice |
|---|---|---|---|
| Service | Mandatory URL for install; invitation carries URL | Existing user workspace or explicit service selection once | First connection, changed service, self-host operator |
| Host | `github.com` | Service's actually supported/provisioned room host | Connect GitHub as optional provider; operator setup |
| Namespace | `artroom` (own host only supports `artroom-demo`) | Service-selected namespace, validated before creation | Operator / explicit organization selection |
| Display name | `claim` argument is only printed | Folder basename, persisted as room metadata | One editable field at creation; collision/invalid name |
| Handle | `@founder` | Reuse confirmed user identity; ask once if missing | Membership identity setup; never infer signing authority from git author |
| Branch | `main` | New room `main`; imported repo's chosen default branch | Import branch mismatch / explicit advanced setting |
| Application | Rules publish + activate issue/change separately | Issues + changes preset; optional pages application | Pages intent / custom application author |
| Review | Rehearsal explicitly allows ordinary content without approvals; controlled rules need one approval | State preset in one short sentence; require independent approval on protected control files | Team review preference; solo policy must be explicit, not silently weakened |
| Visibility | Own-host repo private; renderer visibility is separate | Members-only room; publishing website is a distinct explicit act | Public site / destination connection |
| Local directory | Clone omitted target uses generated repository name | Readable room label, collision-safe preflight | Existing directory / explicit path |
| Credentials | Clone's read token lasts one hour and is not retained | Keep this transient credential discipline; refresh for authorized fetch | Lifetime override only advanced |
| Repeat command | Mixed durable behavior across branches | Resume same operation; no automatic new signature for changed meaning | Explicit start-new/reset choice with consequences |
| Output | Long scope IDs, hashes, definition versions | Outcome, readable subject, status, one next action; `--verbose`/record link for evidence | Diagnostic request / machine-readable output |

The table's current column is supported by the earlier cited install/claim/clone source, not by UX assumptions. The proposed column is a product recommendation. Review/visibility defaults need architecture and product adoption; do not present them as currently effective.

#### Directory and retry contract

- Empty directory: no template content until chosen application needs it; no remote write on local init.
- Populated non-Git directory: preserve contents, permissions and ignore rules; show included/excluded file summary before first import/proposal. Never default-upload dotfiles, local secrets or generated dependencies merely because the directory exists; no claim of perfect secret detection.
- Existing Git repo: preserve dirty index, working tree, remote names, branch and history; reject or clarify submodule/bare/worktree/nested-root ambiguity before attaching. A nonfatal local binding failure after cloud creation must resume attachment to that same room.
- Already bound directory: report existing room; run is idempotent. A conflicting room/service needs an explicit switch rather than an invisible replacement.
- Existing clone target: validate empty/directory/writable and `git` availability before minting a token. On partial clone, keep the exact target/problem and offer recover/remove only with deliberate choice; do not automatically delete user files.
- Connection loss: preserve operation identity and completed stages. Show "Room created; application setup pending" when that is true. Resume activation/configuration without duplicate repositories or definition generations. Expired unattempted request may be deliberately replaced; unknown attempted mutation must be settled before a new meaning is signed.
- Publication: "Proposed", "Waiting for approval", "Checks failed", "Publishing", "Publication unknown", and "Published" are distinct. A successful proposal command can exit 0 while explicitly unpublished; an unavailable/unknown publication must not claim a live URL. Report final publication with commit and receipt accessible behind details.

#### Representative copy correction

Current rehearsal: `Claimed demo: directory sc_..., membership sc_..., rules sc_..., destination sc_...; each created and confirmed. Definitions: platform:directory@2, ...`

Proposed: `Created handbook. Issues and changes are ready. Open room: <URL>. Files have not been published.` Internal identities are available through `artroom status --verbose` or **View record**.

Current refusal: `Not published: ... rules-not-met:rules ... When it may be merged, run artroom merge sc_...`.

Proposed: `Change #12 is waiting for approval of AGENTS.md. Ask a room admin to review it: <change URL>. Nothing has been published.` Keep the exact failed requirement, current proposal version and request/receipt in details; this explanation must be derived from authenticated rule/authority data, never guessed from a raw reason string.

### Gaps

- The final command vocabulary, project binding location/schema, room registry, room naming authority and solo review preset are decisions to adopt. Existing design requests should own these decisions; avoid parallel competing mechanisms.
- Existing-repository import and renewed Git fetch require real data/credential boundaries that are not solved by a frontend wrapper. Plan these as implementation work, not copy changes.
- The signed client/service discovery endpoint and an authorization mechanism for non-operator room creators are needed for a complete cloud easy path. Until they exist, write separate supported operator and member guides and show readiness honestly.

## What detailed implementation and acceptance work follows?

### Takeaway
Start with one complete new-room application flow and repeatable recovery, then integrate local adoption/import. Accept the improvement through cold-person tasks and meaningful state boundaries, using the existing exact-request tests rather than multiplying mirrored CLI/UI tests.

### Cited Findings

Repository testing guidance says run changed/focused tests while working and the gate once before review. Node CLI file/store tests are project `cli`; CLI scope tests are included in workerd project `scope`. Existing claim and join witnesses cover actual runtime restarts and lost request/reply conditions, with the host/scheduler honestly labeled stand-ins. [Source](/Users/hughpyle/play/artroom/docs/testing.md:295); [Source](/Users/hughpyle/play/artroom/docs/testing.md:322); [Source](/Users/hughpyle/play/artroom/vitest.config.ts:45); [Source](/Users/hughpyle/play/artroom/packages/cli/README.md:24); [Source](/Users/hughpyle/play/artroom/packages/cli/test/claim.scope.test.ts:16); [Source](/Users/hughpyle/play/artroom/packages/cli/test/join.scope.test.ts:16)

Plan 026 requires actual CLI/error reference generation, concrete hosted tutorial runs at a named release, and cannot close manual acceptance from a fixture or failed run; plan 006 specifically requires measuring setup steps, terms, interventions and time to first useful publication on a cold journey. [Source](/Users/hughpyle/play/artroom/plans/026-2026-10-06-manual-inventory-review-binding.md:45); [Source](/Users/hughpyle/play/artroom/plans/026-2026-10-06-manual-inventory-review-binding.md:60); [Source](/Users/hughpyle/play/artroom/plans/006-2026-10-03-experience-and-developer-adoption.md:94)

### Inferences

1. **Design/adopt the product contract first.** Specify local vs connected state, identity vs membership, service readiness and who may create rooms; choose one application preset and independent-review behavior; freeze folder binding/multi-room resolution semantics. Reuse C4/N5 and pages-app work from plans 006/025.
2. **Ship the new-room application orchestrator.** Persist a room label, expose a single create command/web action, bundle rules + issue/change activation, retain each signed stage and accepted fact. Every stage has an authenticated precondition and a truthful partially-complete state. Do not hold a database-wide transaction open during external work or pretend multiple scopes are atomically created.
3. **Ship clean outputs and preflight.** Add a short status/readiness projection shared across CLI/browser. Default output names human artifacts, the result and one next action. Preflight clone targets, Git availability and supported host before token/mutation. Errors link to exact subjects; diagnostics remain available.
4. **Ship local binding and multiple rooms.** Distinguish user credentials/room registry from nonsecret project attachment. Init and clone bind a folder; outside a folder choose by room label/URL. Exercise nested roots, worktrees, existing configs and conflicting service bindings.
5. **Ship committed-snapshot import and proposal workflow.** Include deliberate reviewable file selection; preserve source remotes; clearly label the canonical room copy vs original repository. Renew room-issued read credentials through the supported mechanism. Do not imply mirror support.
6. **Evaluate with cold users.** Tasks: new directory with pre-existing files; join and clone; re-open from another folder; existing Git repository; interruption after room creation but before application activation; protected-file change waiting for approval; publication lost reply. Measure interventions, terms/decisions encountered, incorrect state conclusions, setup completion and time to first useful proposal/published outcome. Proposed target: no JSON, digests, scope IDs, provider tokens or operator configuration on the provisioned-service member/new-room path; one room-name decision; zero duplicate room creation after retry. A local-only run must be understandable without an account.

Suggested focused commands for subsequent implementation (verified from the present test configuration; use installed checkout tools, no package-install probe):

```text
npm run test:changed
./node_modules/.bin/vitest run --project cli packages/cli/test/files.test.ts
# Select one actual affected recovery invariant, for example:
./node_modules/.bin/vitest run --project scope packages/cli/test/claim.scope.test.ts
npm run typecheck --workspace @generalbusiness/artroom-cli
npm run gate
```

Install/clone tests are now integrated; use their exact paths only when the adopted slice changes that invariant. For each change, select the meaningful witnesses it affects; do not run this whole list repetitively. This publication changes no application behavior and does not rerun the gate. The original coordinator gate stays attributed to1eed; current publication reuses accepted I5 package/source identity. A future implementation needs one final gate at its actual review head.

Finding-format handoff:

- **DX-01: Remove operator setup from everyday room creation.** Evidence: `docs/cli.md:35`, `docs/hosts.md:27`, rehearsal `transcript.md:14–75`. Impact: six technical commands + manual host setting before first issue/change; accounts without founder authority cannot use a pretend one-command shortcut. Effort L after authority decision; Risk HIGH (creation/provider authority); Confidence HIGH current facts. Sketch: provision service once; create usable rooms under explicit user authority through a durable preset orchestrator.
- **DX-02: Bind rooms to projects and support multiple rooms.** Evidence: `packages/cli/src/files.ts:19`, `store.ts:52`, `commands.ts:344`, `:542`. Impact: cwd does not select context, second room requires alternate config directory, friendly names are output-only. Effort L; Risk MED (wrong-room act/migration). Confidence HIGH. Sketch: user room registry plus nonsecret local binding with clear precedence; idempotent init/clone; ambiguous context stops before signing.
- **DX-03: Preserve retry discipline across the application flow.** Evidence: main `store.ts:24`, `claim.scope.test.ts:16`, rehearsal-source `commands.ts:329`, `:416`, `:989`, `:1052`. Impact: proposal/application retries can duplicate user work and planned-install retry semantics lag landed claim behavior. Effort L; Risk HIGH (duplicate outside effects/changed authority). Confidence HIGH code; runtime outcome untested in this audit. Sketch: one shared operation journal/outbox, exact signed step settlement and unchanged immutable authority subject.
- **DX-04: Preflight and clarify transient Git authorization.** Evidence: rehearsal-source `commands.ts:853–905`, `git.ts:1–20`. Impact: bad clone target can consume a token, generated default folder names confuse, later plain fetch has no retained credential. Effort M plus credential-helper design; Risk MED (credential custody). Confidence HIGH code. Sketch: preflight target before minting; bind readable room label and provide explicit authorized refresh/fetch.
- **DX-05: Explain application results before internal evidence.** Evidence: main `commands.ts:481`, rehearsal `transcript.md:205`, rehearsal-source `commands.ts:1066`. Impact: users decipher scope IDs/refusal strings/logs instead of knowing what to do. Effort M; Risk LOW copy, MED if explanation is not sourced from real requirements. Confidence HIGH. Sketch: shared status/requirement projection; succinct outcome/subject/next action with record/verbose detail.

### Gaps

- The above estimates are planning estimates, not measured delivery commitments. Identity/provider/import architectures determine scope.
- No tests or hosted commands were run by this read-only research task; all execution claims are explicitly attributed to source notes/transcript. No package installation, app source change, commit or hosted mutation was performed.
