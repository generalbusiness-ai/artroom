# The dap command

`dap` is a command-line client for the new model. Each command is a
thin function over two things: a scope service's base URL and a signing
key. The command builds and signs intents and reads the service's routes.
It judges nothing: whether an act takes effect is the scope's decision,
and the command prints the scope's actual answer category. A refusal exits
1 with its reason. An unavailable answer does not say whether the act took effect; timed
entries may already have been written. Inspect the journal before another
mutation. Recovery needs the original signed envelope; repeating a generic
command signs a new request.

The source is `packages/cli`. In this repository it runs as
`packages/cli/bin/dap.js` under Node 22.0.0 or later, using the CLI's
installed `tsx` 4.21.0 dependency. The launcher resolves that loader beside
the package, so it works from another directory and fetches no tool when
it runs. The launcher is checked on Node 22.0.0 and 26.10.0. Nothing is
published to a registry. A scope Worker is deployed at
<https://artroom-scope.inguz.workers.dev>; its routes start at `/v1/scopes`.
The root URL returns 404 because it has no application page. This endpoint
does not establish a completed live creation, publication, clone or
authenticated replay.

The launcher's Node 22.0 minimum is separate from the repository's test
runtime. Built-in Node checks import TypeScript directly, as Replay already
does. For those checks and `npm run gate`, use Node 22.18 or later in the
22 series, or Node 23.6 or later. This is Replay's existing engine range;
the launcher continues to use its installed loader. See
[the testing guide](testing.md) for the gate.

## What it needs

- **A base URL**: the scope Worker's address, given once to `install`
  (or carried by an invitation link to `join`) and kept in the config.
- **A key**: an Ed25519 key, which the command makes. It keeps the
  32-byte secret in `keys/<name>.key` under its config directory:
  `$DAP_HOME`, with `$ARTROOM_HOME` still accepted as a compatible alias.
  If both are set, they must resolve to the same directory; otherwise the
  command refuses before reading configuration. Paths are compared after
  resolving relative paths against the current working directory; the
  command does not expand `~`. Empty values are unset.
  Without either variable, an occupied `$XDG_CONFIG_HOME/artroom` takes
  precedence, followed by an occupied `~/.config/artroom`. A directory with
  keys or private pending records counts even without `config.json`. Only
  when neither legacy directory holds entries does the command use the new
  `$XDG_CONFIG_HOME/dap` default, or `~/.config/dap` without XDG. An empty
  new directory cannot hide legacy custody. Nothing is moved or rekeyed.
  The directory has mode 0700 and each file 0600. A key is never
  replaced and never printed; only its ID (`key_...`) is printed.

A scope is named by its ID (`sc_...`) or by one of the names `claim` or
`join` learned: `register`, `directory`, `membership`, `rules`,
`destination`, `inbox`. An entry is named `<scope>:<seq>`. An issue is
named by its number, `3` or `#3`, as `dap issues` lists it, or by its
lane's scope ID.

An install receipt does not enable GitHub effects by itself. The deployment
must configure its GitHub authority and pin the chosen register's scope ID
beforehand; other registers do not receive that host authority. Full
authorization to install a register remains unimplemented.

## The commands

The examples are from one run of the test in
`packages/cli/test/story.scope.test.ts`, with long IDs cut short.

**`dap install <base-url> [--host <git-host>] [--namespace <name>] [--cohort application|application-publication|counting-commitments|invitation-key]`**
creates the register with an `install` intent, signed by a new operator
key, which is also the one creator key. The host defaults to `github.com`
and the namespace to `artroom`. For the demo's host, the hosting's own Git
service, use `--host artifacts --namespace artroom-demo`;
[hosts.md](hosts.md) says what each host needs.

```
Installed: register sc_hinqqbm4....
The operator key key_baqzbaDy... is kept in the config directory, readable only by you. It is the one founder key.
```

**`dap install --plan <base-url> [--host <git-host>] [--namespace <name>] [--cohort application|application-publication|counting-commitments|invitation-key]`**
signs the same `install` intent and creates nothing. A register's ID is a
function of its seed, and the seed of the intent and the register's
version alone, so the command prints the ID that the install will create,
and the seed's time: the intent's `notAfter`, 14 minutes ahead, until
which it can be created. It keeps the signed intent, the version and the
ID in the config. This creation intent carries no invitation credential;
the register's genesis records it and its signature. Only a definitely unsent legacy plan may
be replaced. A selected application or Counting plan always retains its
original envelope, version, register and deadline, including when planning
is repeated.

```
Planned: register sc_4kq2v7..., under platform:register@2, on host artifacts, namespace artroom-demo. The seed's time is 2026-10-08T09:14:00Z.
Set registerScope to sc_4kq2v7... in the Worker's host setting, then run dap install --planned before 2026-10-08T09:14:00Z.
```

**`dap install --planned [--cohort application|application-publication|counting-commitments|invitation-key]`** creates the planned register, with the kept
intent and no other argument. Before anything is sent it checks the plan:
a plan whose ID is not the one its intent and version make, or whose
version is not supported by the installed catalog, is refused as
`plan-mismatch`; a plan whose time is over is refused as `plan-expired`.
An expired plan that was never attempted sends nothing. A definitely
unsent legacy plan can be planned again in the same config. A selected
application or Counting plan cannot: keep that original config directory unchanged and
use a separate empty `DAP_HOME` directory for a new plan. Use that same
new directory for every later command, and configure the host's
`registerScope` with the new plan's ID before installing. Do not copy over
or delete the original config or keys.

For example, set `DAP_HOME` to a new private directory, then run
`dap install --plan <base-url> --cohort <cohort> --host <host>
--namespace <namespace>`, using `application`, `application-publication`, `counting-commitments` or `invitation-key`
for `<cohort>`. After configuring the new register ID,
run `dap install --planned --cohort <cohort>` with the same
`DAP_HOME`. This creates separate custody and a new operator key; it
does not renew or replace the expired original.

An attempted or acknowledged original must instead be reconciled from its
original directory with `install --planned`. Expiry does not prove that a request never took effect and does not authorize a replacement. After
creation, the receipt must match the original planned register, definition
and intent. Its acceptance is a service acknowledgement; independent
journal verification remains separate.

```
Installed: register sc_4kq2v7..., under platform:register@2, as planned.
```

[deploy.md](deploy.md) says why and when to plan first.

### An explicitly selected application room

Omitting `--cohort` keeps the legacy default. `--cohort application` selects
`APPLICATION_COHORT`: register@5, directory@5, membership@4, rules@3,
destination@2 and inbox@1, each with the `platform:` prefix.
`--cohort counting-commitments` retains its separate register@6,
directory@6 and membership@5 lineage. `--cohort application-publication`
selects `FILE_PUBLICATION_COHORT`: register@9, directory@8, membership@4,
rules@3, destination@4 and inbox@1. `--cohort invitation-key` selects
register@10, directory@9, membership@6, rules@3, destination@2 and inbox@1.
It uses the application factory, not the file-publication factory. These
choices use the existing exact
planned-install custody. Unknown or multiple choices, another retained
cohort, service, host or namespace refuse before signing or sending.
`install --planned` may omit the selection: it uses the saved definition
and signature. It never upgrades a plan to a newer catalog version.

Choose `application-publication` for a new application room whose acts tell
the destination `publish-file`. Configure the host with that exact planned
register ID before installing. Existing rooms retain their original pins.
Directory@8 supplies its own destination when the application's genesis
declares `destination` with type `scope` and kind `destination`; callers
cannot include that reserved field in `values`. See
[Publish a file from an act](write-an-application.md#publish-a-file-from-an-act)
for the write authority and publication outcomes.

For an application such as Jam, use a separate owner-only `DAP_HOME`
and a deployed service that supports all six exact application pins:

```sh
dap install --plan <base-url> --cohort application --host <configured-host> --namespace <configured-namespace>
# Configure that host's registerScope with the printed planned ID.
dap install --planned --cohort application
dap create <label> --handle @operator
```

Keep the operator key and pending envelopes in that private directory;
share public full scope references and actual genesis pins, never keys or
session headers. An uncertain install retries `--planned`; an unfinished
claim repeats the same claim without `--again`. Verify the actual directory,
membership, rules and destination creation and confirmation before using
the room. The selected bootstrap does not validate, activate or create Jam.

The provisioning owner must next validate the exact application declaration
with public `validateDefinition` under the deployed bounds, retain its
canonical bytes and `definitionDigest`, and activate that digest and all
required declaration dependencies in the actual rules scope. The authorized
`establish-application` act on directory@5 names that digest, bounded
canonical genesis `values` and `execution=recorded-do`. Supply declaration
bytes beside it; the factory supplies the trusted opener and membership.
Keep the exact signed creation request before submission and reconcile its recorded fact and confirmed child seed after an unknown answer. Do not
create a second application to replace an uncertain first one.

Membership must explicitly grant the declaration's domain actions to the
intended role or agent. Enrollment and a read session alone grant no domain
act. Respect the deployed grant reuse window after permission changes.
Provision each verifier reader for the target and every foreign journal it
needs; a room session may not read another root or membership. Retain the
actual deployed bounds, exact platform catalog, capability versions and
parameters with the public configuration. A missing journal or unsupported
pins remain verification failures. Jam must consume genuine published SDK
packages; this CLI bootstrap proves no registry, deployment, microphone,
model, playback or distributed-user acceptance.

Application bootstrap checks on 2026-10-10: the first focused attempt
stopped in the CLI source compiler before any case ran. The explicit
literal lookup repair passed CLI source, CLI test and Scope test compilers,
both existing CLI custody cases, and the existing native application
factory case. The normal Page build then refreshed its generated module;
all other tracked files and the guarded dependency view stayed unchanged.
The ordinary changed-source gate passed: 1,025 Vitest cases, two original
optional skips, and the chained Node checks (8 repository cases and 37
Counting browser cases). These checks establish bootstrap behavior, with
the witness limitations stated above.

The selected-cohort expiry correction was checked on 11 October 2026.
CLI compilation and both existing custody cases passed for application and
Counting, using labelled memory stores and a fake configured service. The
normal Page build passed and reproduced the unchanged generated module.
An initial tool-hash guard typo stopped before any build; that outcome is
retained. The native application case was unchanged and was not repeated.
The corrected Counter parent remains intact. A new ordinary gate and
an independent review of the code are still required for this follow-up.

**`dap create <name> [--handle @you] [--branch main] [--again]`**

The existing `claim` command remains available for retained workflows.
Both commands use the same creation and recovery code.

The command signs the register's recorded `found` act. It waits until the
directory, membership, the rules scope and the destination are created and
confirmed. Then it takes the creator's seat, their member item, and first key in
membership,
which makes the creator the first admin. `<name>` is a label for this
output only: the register's `found` act has no name field (see "What it
does not do yet").

Before each creation step, the command saves its exact signed envelope:
`found`, then `seat`, then `first-key`. It saves the recorded fact references as each step completes. These records contain no private signing key.
A refusal, unavailable reply or lost answer leaves the request pending;
a later run keeps the same signature and deadline. A marker that the act took effect is checked against the receipt for that exact envelope before reuse.

```
Gave up waiting for the directory after 120 reads. What was asked may still take effect; run dap create demo again to go on waiting for this claim, or with --again to sign a new one, which creates a second repository.
```

Run `dap create <name>` again to continue the saved claim. The command
reads or retries the exact saved steps, then waits for their confirmed
scopes. It checks child identities against the actual directory seed and
full reference. It does not extend a saved deadline or invent a replacement
request. `--handle` is ignored on resume: the handle is the one already
signed. Older digest-only state resumes only when the retained creation
and enrollment records prove the exact signed steps; otherwise it stops
without a new submission.

`--again` deliberately replaces the pending claim with a new signed
`found`. Each `found` that takes effect creates a repository, so an earlier
unknown claim may still produce another repository. Use this option only
when deliberately starting another claim. An expired envelope stays saved
until this explicit replacement.

```
Created demo: directory sc_hs5f27fz..., membership sc_p6xp2lmd..., rules sc_sfbjwioy..., destination sc_e5xgdizd...; each created and confirmed.
You are @rita, an admin, on key key_baqzbaDy...; your inbox is sc_u5joavqp....
```

**`dap invite <@member> --role <role> [--hours 24]`** is
membership's `invite-member`. It prints a link that holds the
invitation's number and its private credential. Legacy scopes use a
one-time secret. Membership@6 uses a 32-byte invitation signing seed;
join records only its signature over the full membership reference,
invitation ID and joining key. Pass either link only to that member.

```
Invited @una as member: invitation sc_p6xp2lmd...:5, until 2099-01-02T00:00:00Z.
Link for @una only (it holds the invitation's secret): artroom-invite:eyJ2Ijox...
```

With `--keep`, the invitation is kept before it is sent: the command
makes the secret, signs `invite-member`, and saves both in an owner-only
private file first. The link names the membership's exact definition,
for example `platform:membership@4` in a room of the application cohort.
If the answer is lost, run `dap invite --check`, which reads the outcome
and sends nothing, or `dap invite --continue`, which resumes the exact
original request. While one kept invitation is unresolved, a new one is
refused, so a lost answer is never replaced by a second invitation. A
verified or refused invitation is released, and its link is printed once.

```
Invited @una: the invitation is recorded and verified.
Link for @una only (it holds the invitation's secret): artroom-invite:eyJ2Ijox...
```

**`dap join <artroom-invite:…>`** is membership's person `join`, signed by a new key
that the command makes and keeps. Before sending, it saves the exact signed
request in an owner-only `private/<name>.data` file; the invitation secret
is absent from public config. Under membership@6, it is also absent from
the signed request and native journal. Existing scopes keep their exact
legacy protocol and can retain their secret in signed history. It saves the recorded fact and inbox progress
before waiting for the member's inbox. After a lost reply or an interrupted
wait, run `dap join` with the original link again. This reuses the same
key, request and deadline. A request that took effect is confirmed by a read-only settlement, even after its deadline. A missing private request or a different
link stops the retry; it never signs a replacement automatically.

```
Joined as @una on key key_H1bY2Hml....
Your inbox: sc_zbtu7vax....
```

**`dap join <artroom-agent-key:…>`** enrolls a genuine agent key with
membership's `enrol`. A verified room controller first creates an agent
member with `add-member`, then invites its key with `invite-key`. The private
handoff carries that invitation and full native references. It carries no
signing key. A person invitation with the role `agent` is still a person;
it cannot substitute for this agent-key protocol.

Use a separate empty owner-only `DAP_HOME` for the receiving agent. The
command generates and retains an independent key and saves the exact private
enrollment envelope before delivery. After an unknown answer, use the same
link with `--check` to settle and follow the original without submitting a
mutation. Run the same command without `--check` only to Continue explicitly.
It retains the original signature, idempotency key and deadline.

The command saves a usable connection only after it verifies the recorded enrollment, genuine agent and key kinds, controller, recorded directory
siblings, and active inbox incarnation. A missing private request, changed
link, person/agent mismatch or definite native refusal keeps the original;
it does not generate a replacement key or request. Existing `artroom-invite:`
links and pending person joins retain their original behavior. Treat either
invitation link as private.

**`dap acts [<scope>]`** lists the acts of the scope's definition
that the caller's role holds now, with each act's fields. The role and
its actions are read from membership. An act that a rule decides, such
as `join`, is always listed. The scope can still refuse an act on its
guards or its state.

```
Acts on sc_hs5f27fz... (platform:directory@1) for @una (member):
  open-issue: opens a lane; needs issue.open. Fields: definition:digest title:text body?:text conditions:list.
  open-pr: opens a lane; needs change.open. Fields: definition:digest title:text body?:text draft:bool.
  open-task: opens a task; needs task.control. Fields: worker:member controller:member lane:scope.
Not shown: 1 that need an action your role does not hold.
```

**`dap act <kind> --on <scope> [--target <item>] [--set name=value ...]`**
signs and sends one act. A value is read by its field's type; a list or a
record is JSON, and `@handle` is a member of this repository. The command
fills in the current revision of each item the act names, from the
scope's summary; the scope checks it again.

```
Took effect: entry sc_p6xp2lmd...:8, hash sha256:2cd70f9ada97.
Refused: guard-failed (not-activated), judged at entry sc_hs5f27fz...:4. The request was refused.
```

`--value <file>`, given once or more, sends each file's text beside the
intent as a value. The scope reads a value only at a place that its
definition states, by its digest: the bytes of a definition for the rules
scope's `activate` and the directory's `open-issue` and `open-pr`. For
example, an admin activates the demo profile's change definition with
`dap act activate --on rules --set digest=<digest> --set name=change
--value apps/room/lanes/definitions/change-demo.json`, whose digest is in
`apps/room/lanes/src/digests.ts`.

**`dap log <scope> [--limit n]`** and **`dap show <entry>`**
read the journal and one entry over the read routes.

```
sc_p6xp2lmd...:8  2099-01-01T00:00:00Z  act add-member by key_baqzbaDy...; 6 effects, 1 sends
sc_p6xp2lmd...:9  2099-01-01T00:00:00Z  delivery result from inbox:0; 0 effects, 1 sends
10 entries in all.
```

**`dap items <scope> --query <canonical-item-query-JSON>`** reads one
explicit bounded item selection. The canonical JSON has exactly `cursor`,
`ids`, `limit`, `scope`, `states`, `type` and `v`; `scope` is the full scope
reference, `cursor` starts as `null`, and `ids: null` selects all matching
IDs. States and explicit IDs must be sorted and unique. The SDK's
`encodeItemQuery` produces this spelling. The command checks the query's
scope against the selected scope before sending it.

This command makes one query, with no per-item detail requests or automatic
page loop. It prints the head, each item, whether the selected suffix is
complete, and any next cursor. To continue, put that exact cursor in the
next query. A refusal exits 1 and says coverage is incomplete. The whole
reply is limited to 256 KiB and the query wait to 10 seconds. A smaller
returned prefix is not a complete inventory; a later `row-too-large`
refusal cannot make it complete.

**`dap verify <scope>`** runs the replay verifier over the read
routes, with the platform package's rules and the code of the two lane
capabilities, `hold@1` and `git-read@1`, so it replays a lane too. It reads with the caller's
session, and a read that the session is refused goes again as a signed
read by the caller's key. It prints the verifier's report: the result,
what it covered, and what it takes on trust. A journal whose first page
cannot be read has no report; the command prints
`... cannot be read: <reason>` and exits 1.

```
Result: consistent, for the mode, target, coverage and trusts stated below.
Mode: replay. Within the coverage stated below, the history was folded from its genesis, ...
```

**`dap verify --all`** runs the same replay for every scope of the
room: the register, the directory, and every scope that the directory
created and each of those created (membership, the rules scope, the
destination, each lane, each inbox), reached by the creations in their
journals. It prints one line for each scope: its kind, its ID, the entry
the replay reached and the result. The last line is `All consistent: <n>
scopes.`, or the first finding, and then the command exits 1. A journal
that cannot be read is a finding. The example is from
`apps/room/lanes/test/issues.scope.test.ts`, after two issues were closed by
two published changes:

```
register sc_3kisrweg..., entry 3: consistent.
directory sc_6frfaa2y..., entry 21: consistent.
membership sc_kc5qv4qq..., entry 10: consistent.
rules sc_qmnrfkiu..., entry 8: consistent.
destination sc_6bqqdirs..., entry 27: consistent.
lane sc_4bbosp5k..., entry 5: consistent.
lane sc_yx6ty22i..., entry 3: consistent.
lane sc_7hogxnge..., entry 12: consistent.
lane sc_zdmnlqyr..., entry 12: consistent.
inbox sc_vyo43gf3..., entry 1: consistent.
inbox sc_obxlkkam..., entry 1: consistent.
inbox sc_3a6xxtoj..., entry 1: consistent.
All consistent: 12 scopes.
```

**`dap remote`** prints the repository's host, namespace, name and
remote URL, from the destination's branch item. On GitHub the URL is
`https://github.com/<namespace>/<name>.git`. On the hosting's own Git
service it is `https://<host>/git/<namespace>/<name>.git`, where `<host>`
is the deployment's setting, which no scope records: until a clone has
learned it, the command marks that part. The examples are from
`packages/cli/test/clone.scope.test.ts`.

```
Host: artifacts
Namespace: artroom-demo
Name: 5kywbv2y...-1
Remote URL: https://<service host>/git/artroom-demo/5kywbv2y...-1.git (the service host is the deployment's setting; dap clone prints it whole)
```

**`dap clone [<directory>] [--hours 1]`** clones the repository with
a read token of the caller's own:

1. If there is no `git` program, it signs nothing and prints the clone
   command with the token's place marked.
2. It signs the destination's `read-token` act with `hours` (1 to 24;
   the default is 1). Every role holds its grant, so any active member
   may sign it. The destination opens a `mint-read` operation, and the
   host mints a read token for that lifetime. On GitHub the lifetime is
   GitHub's own, one hour.
3. It waits for the outcome, which names the token by a nonsecret handle
   and its end. Then it reads the token once, with the caller's read
   session, from the destination's credential route. No other session can
   read it, and it cannot be read twice.
4. It runs `git clone -- <remote> [<directory>]`. The token goes to git
   as an `Authorization` header, in the configuration `http.extraHeader`,
   which the command sets in git's environment (`GIT_CONFIG_COUNT`,
   `GIT_CONFIG_KEY_0`, `GIT_CONFIG_VALUE_0`). That is the same setting as
   `git -c http.extraHeader=...`, but it is in no argument, so no process
   list shows it. The token is in no printed line and in no file the
   command writes, and git does not keep it in the clone's config. The
   header is `Bearer <token>` on Cloudflare Artifacts, and
   GitHub's form for an installation token, `Basic` with the user
   `x-access-token`, on GitHub.

It prints the remote URL, and keeps it in the config for `remote`.

```
Read token: sc_rh5ctnhi...:2, until 2099-01-01T02:00:00Z.
Remote URL: https://service.invalid/git/artroom-demo/5kywbv2y...-1.git
Cloned into here.
```

Without git:

```
git is not installed here, so nothing was signed. With git installed, run dap clone again; it runs:
git -c http.extraHeader="Authorization: Bearer <read token>" clone -- https://<service host>/git/artroom-demo/5kywbv2y...-1.git here
```

The token is for the clone. A later `git fetch` in the clone needs a new
token; run `dap clone` again for one. A token that is never read ends
at its end.

**`dap propose <branch> [--title <text>]`** submits the committed files
that differ between the room's published head and a local branch tip. It
reads committed objects, so uncommitted files and the index remain untouched.
The room's head must be an ancestor of that tip. The room creates and
publishes its own commit; the person does not push the branch. After a
publication, `git pull` reads that room commit.

This command requires a manifest-list change definition and a destination
at version 3. Existing rooms retain their genesis pins. An older room is
refused with `version-mismatch`; activation alone cannot upgrade its
native destination. A creator supplies the authored `change3.json` or
`change-demo3.json` bytes to the rules scope, by their exact digest.

The change records one signed `propose-file` source entry per path, then
one `propose-manifest` that freezes all paths, entry references and byte
digests on the published base. The destination builds their shared tree
at reservation and records it before any required check. A check request
reads that reservation tree; publication waits for every required check's
authentic pass. The destination stages the recorded integration on the
canonical host
under `refs/artroom/reservations/<reservation id>` before it reports the
reservation to the lane. The checker reads that reservation and fetches
its exact ref, then checks its integration ID, tree and first parent. A
missing or mismatched stage gives `reservation-stage-missing` or
`reservation-stage-mismatch` and starts no run. While a check is owed, the
command prints the change and
reserved tree. A published result prints the room's commit. A policy
refusal prints its name and the merge command to run after approval.

Reservation snapshots currently use the Git reader’s supported SHA-1
format. The private checkout refuses SHA-256 as
`unsupported-object-format`; this is a supported-format limit, not a
claim that SHA-256 checks ran.

This delivery carries UTF-8 text, including its exact byte order mark and
NUL bytes. It names refusals for deleted or renamed files, non-UTF-8
content, an unsupported mode change, more than 64 changed paths, a path
that cannot be written, and a file over 65,536 bytes. Each source entry
uses the existing per-entry transport bound. It carries no Git pack.
A `request-check` first records a queued job. The destination fences that
check's exact job generation, invalidating any earlier pass, before its
acknowledgement makes the new job requested and supersedes the old job.
A retry may be requested while checks are pending. If publication has
started, the fence is refused as `publication-started`; the old job and
any unresolved send remain recorded. Delayed results count only for the
destination's acknowledged generation. Cancellation before a push and the
recorded check deadline release logical publication availability. A staged
ref remains a separate cleanup task. Publication moves the branch by its
recorded compare-and-swap; deletion of the reservation ref and revocation
of its tokens must settle before the destination’s publication is final.
Unknown staging or deletion remains recorded and is never inferred from
a read alone. A staging mismatch that may leave a ref keeps a live
`cleanup-aborted` task; its branch slot can be reclaimed independently
of that cleanup. A delete uses the recorded old integration ID and cannot
remove another writer’s replacement ref. Expiry currently retains `cleanup-aborted`; its explicit
`resend` cleanup trigger is awaiting the owner’s disposition (`f1b87a0b`).

Binary content, deletion and rename support remain in the later R5 work.
The demonstration uses two text files.

**`dap edit <path> --file <local file> [--title <text>]`** writes one
file of the repository through the room. The person never writes the
repository: the room judges the change and its destination writes it. The
examples have the form that `apps/room/lanes/test/edit.scope.test.ts`
asserts, with IDs cut short; the numbers in them are illustrative.

1. It reads the local file. A file that is no UTF-8 text, or that has more
   than 65,536 bytes, is not carried: nothing is signed, and it exits 2.
2. It reads the change definition that the rules scope holds active, and
   its bytes. With none active it signs nothing.
3. It signs the directory's `open-pr` under that definition, with its bytes
   beside the act, and waits for the new change lane. The title is
   `--title`, or `Edit <path>`.
4. It signs the lane's `ask-rules`, and waits for the rules scope's answer.
5. It signs `propose-file` on the destination's head: the path, the digest
   and size of the bytes, and the bytes. This is the change's only version.
6. With `--closes <issue>`, it signs the lane's `link-own` to that issue,
   as `dap merge --closes` does.
7. It merges the change as `dap merge` does.

```
Proposed README.md (37 bytes) as change sc_q3xk...., version 6.
Published: commit 5d0c1e6b..., by the merge sc_q3xk...:7.
Page: https://scopes.test/site/sc_hs5f27fz.../HEAD/README.md
```

The rules decide who must approve. A change in an extent that asks no
approval is published on the merger's own act; a change in the rules
extent, such as `AGENTS.md`, waits for the rules scope's controller:

```
Proposed AGENTS.md (31 bytes) as change sc_ab12..., version 6.
Not published: the merge sc_ab12...:7 is refused, rules-not-met:rules. The change sc_ab12... stays open at version 6. When it may be merged, run: dap merge sc_ab12...
```

The controller approves it for that extent with `dap act review-verdict
--on <change> --set manifest=<version> --set verdict=approve --set
extent=rules`, and a member who holds `change.merge` runs `dap merge`.
A second `edit` of the same path replaces the file. A path that no
published tree may hold (an empty, `.`, `..` or `.git` segment, a control
character, more than 1,024 bytes) is refused by the destination as
`path-invalid`, and nothing is pushed. A path where the published tree has
a folder, a symbolic link or a submodule, or a file on the way, is refused
as `integration-invalid`.

**`dap merge <change>`** signs `merge` of the change's current version,
naming the reports it selects, and waits until the merge is published,
refused or aborted. It needs `change.merge`, which admins and maintainers
hold. Published: it prints the commit, and for a one-file version the
page's address. Refused by the lane, it prints the refusal; refused by the
destination, the reason. Either way the change stays open, and `dap
merge` may be run again.

With **`--closes <issue>`**, `merge` first signs the change lane's
`link-own` to the issue (`how` is `keyword`). The link is a fact of the
change lane. When the merge is published, the lane tells the issue, and
the issue closes with the reason `completed`, by its own entry. Only the
change's author may sign `link-own`; the demo profile has no `link-any`.
So a member who opens a change can link it, but cannot merge it: members
do not hold `change.merge`. The member's change waits, linked, and an
admin or a maintainer merges it. The examples from here on have the form
that `apps/room/lanes/test/issues.scope.test.ts` asserts, with IDs cut
short; the numbers and hashes in them are illustrative.

```
Proposed guide/start.md (53 bytes) as change sc_q3xk..., version 6.
Linked: when it is published, the change sc_q3xk... closes issue #1 (sc_4bbo...).
Refused: unauthorized, judged at entry sc_q3xk...:7. The request was refused.
The change sc_q3xk... waits, at version 6. When it may be merged, run: dap merge sc_q3xk...
```

Then, as the admin, `dap merge sc_q3xk...`:

```
Published: commit 5d0c1e6b..., by the merge sc_q3xk...:8.
Page: https://scopes.test/site/sc_hs5f27fz.../HEAD/guide/start.md
```

**`dap issue open --title <text> [--body <text>]`** signs the
directory's `open-issue` under the issue definition that the rules scope
holds active, with its bytes beside the act, and waits for the issue's
lane. The body is a detached text: the act holds its digest. The issue's
one condition is its title, because the lane refuses an issue with no
condition. The directory numbers issues and changes in one sequence. An
admin activates the demo profile's issue definition as for the change
definition: `--set name=issue --value
apps/room/lanes/definitions/issue-demo.json`.

```
Opened issue #1: The handbook has no start page. Its lane is sc_4bbosp5k....
```

**`dap issue comment <issue> <text>`** is the issue lane's `comment`.
Any member may comment.

**`dap issue assign <issue> <@member>`** is the lane's `assign`. It
sets the assignee, and needs `issue.triage`, which admins and maintainers
hold. Assignment is optional; no rule of the demo profile needs it.

**`dap issue close <issue>`** signs `close-own` when the caller opened
the issue, and `close-any` otherwise, which needs `issue.triage`. The
reason is `completed`. The demo profile has no rule that lets an assignee
close an issue. A member who did not open it is refused:

```
Commented: entry sc_4bbosp5k...:1, hash sha256:3b1f0c2d9e8a.
Refused: unauthorized, judged at entry sc_yx6ty22i...:1. The request was refused.
```

**`dap issues`** lists every issue, oldest first: its number, its
state and close reason, its title, its assignees and its lane. Each issue
is read in its own lane. The directory's row for an issue is an index that
the lane's own acts update, and a merge that closes the issue does not
update it, so the row can still say `open`.

```
#1  closed (completed)  The handbook has no start page; assigned to @una; lane sc_4bbosp5k...
#2  closed (completed)  A typo on the front page; lane sc_yx6ty22i...
2 issues, 0 open.
```

Exit codes: 0 done; 1 refused, unavailable, not found or not consistent;
2 a command line this cannot run.

## Reads and sessions

**`dap status [<scope>] [--request <16-hex-id>]`** reports bounded
operational observations through a fresh room session. With no scope it
starts from the configured room and discovers readable scopes. A scope
name or ID selects one scope. Each column prints its own native head.
Lists stop after 20 pages, and discovery stops at 1,000 scopes. Denied,
unknown and partial results keep those labels. Admin sessions can read
waiting lists and incidents. Correlation rows are read only with the
explicit request selector. See [Status reads](operations.md#status-reads)
for the columns, bounds and permission rules.
Status exits 0 when it produces a report, including a report with unknown
or partial columns. Failure to obtain a room session exits 1.

Before it reads, the command asks the repository's membership scope for a
read session, signed by its key. If membership gives none (a service with
no session secret, or a key that is no active member's), the command
reads by signed reads of its key, and the scope decides. Under a real
session a member can read the scopes that record their membership, and,
at the register, its genesis and the entries that come from the claim
that created the repository. A signed read reads the entries that the
key signed, the entries that come from one of those within 15 minutes of
it (the intent window), and the retained inputs those entries carry. Journal and log pages can
be filtered; a sparse page is not complete replay evidence. Replay still states its actual coverage and foreign-journal trust.

## What it does not do yet

- There is no page. This is the command line only.
- The documented CLI story is a workerd fixture with real scope rules,
  authority, signed reads and sessions. Its Git host is a stand-in, and
  it drives dispatchers in place of deployment alarms. The deployed
  repository journey still needs its own evidence.
- `edit` carries a file as UTF-8 text of at most 65,536 bytes: no image
  or other binary file. See `notes/implementation/2026-10-07-i5-edit-page-delivery.md`,
  section 3.
- `issue open` has no flag for an issue's conditions: the title is its one
  condition. See `notes/implementation/2026-10-07-i5-issues-delivery.md`, section 5.
- A member cannot merge their own change: `merge` needs `change.merge`.
- `invite --acts` is refused: membership's `invite-member` has no list of
  acts for one member.
- The creator must reach the seat within 15 minutes of the claim: until
  the seat, the creator reads the new scopes by signed reads only, and
  those last for the intent window after the claim. A claim whose
  creation takes longer gives up, and a resumed claim cannot read the
  directory either. See `notes/implementation/2026-10-07-i5-live-ops-delivery.md`,
  section 4.
- An act definition has no description text. The line `acts` prints is
  made from the act's step, item and grant.
- An active member's session reads the destination before its first act,
  including after the creator's signed-read window. The destination checks
  the full confirmed membership reference from its recorded birth directory
  before accepting a session, even before its first retained observation. The first `remote` or `clone`
  need not occur within 15 minutes of the claim. Signed reads without a
  session retain their window. See the destination-read follow-up in
  `notes/implementation/2026-10-07-i5-clone-delivery.md`.
- `git fetch` and `git pull` in a clone have no command that gives them a
  token.
