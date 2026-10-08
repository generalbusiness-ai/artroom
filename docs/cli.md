# The artroom command

`artroom` is a command-line client for the new model. Each command is a
thin function over two things: a scope service's base URL and a signing
key. The command builds and signs intents and reads the service's routes.
It judges nothing: whether an act takes effect is the scope's decision,
and the command prints the scope's answer. A refusal writes nothing, and
the command exits 1 with the refusal's reason.

The source is `packages/cli`. In this repository it runs as
`packages/cli/bin/artroom.js` under Node 22.0.0 or later, using the CLI's
installed `tsx` 4.21.0 dependency. The launcher resolves that loader beside
the package, so it works from another directory and fetches no tool when
it runs. The launcher is checked on Node 22.0.0 and 26.10.0. Nothing is
published to a registry. A scope Worker is deployed at
<https://artroom-scope.inguz.workers.dev>; its routes start at `/v1/scopes`.
The root URL returns 404 because it has no application page. This endpoint
does not establish a completed live founding, publication, clone or
authenticated replay.

## What it needs

- **A base URL**: the scope Worker's address, given once to `install`
  (or carried by an invitation link to `join`) and kept in the config.
- **A key**: an Ed25519 key, which the command makes. It keeps the
  32-byte secret in `keys/<name>.key` under its config directory:
  `$ARTROOM_HOME`, or `$XDG_CONFIG_HOME/artroom`, or `~/.config/artroom`.
  The directory has mode 0700 and each file 0600. A key is never
  replaced and never printed; only its ID (`key_...`) is printed.

A scope is named by its ID (`sc_...`) or by one of the names `claim` or
`join` learned: `register`, `directory`, `membership`, `rules`,
`destination`, `inbox`. An entry is named `<scope>:<seq>`.

An install receipt does not enable GitHub effects by itself. The deployment
must configure its GitHub authority and pin the chosen register's scope ID
beforehand; other registers do not receive that host authority. Full
authorization to install a register remains unimplemented.

## The commands

The examples are from one run of the test in
`packages/cli/test/story.scope.test.ts`, with long IDs cut short.

**`artroom install <base-url> [--host <git-host>] [--namespace <name>]`**
founds the register with an `install` intent, signed by a new operator
key, which is also the one founder key. The host defaults to `github.com`
and the namespace to `artroom`. For the demo's host, the hosting's own Git
service, use `--host artifacts --namespace artroom-demo`;
[hosts.md](hosts.md) says what each host needs.

```
Installed: register sc_hinqqbm4....
The operator key key_baqzbaDy... is kept in the config directory, readable only by you. It is the one founder key.
```

**`artroom install --plan <base-url> [--host <git-host>] [--namespace <name>]`**
signs the same `install` intent and founds nothing. A register's ID is a
function of its seed, and the seed of the intent and the register's
version alone, so the command prints the ID that the install will found,
and the seed's time: the intent's `notAfter`, 14 minutes ahead, until
which it can be founded. It keeps the signed intent, the version and the
ID in the config. An intent and its signature are no secret; the
register's genesis records both. A later plan replaces a never-attempted
plan. Once submission was attempted, both a new plan and plain install
refuse `install-pending`: recover with the original `install --planned`.

```
Planned: register sc_4kq2v7..., under platform:register@2, on host artifacts, namespace artroom-demo. The seed's time is 2026-10-08T09:14:00Z.
Set registerScope to sc_4kq2v7... in the Worker's host setting, then run artroom install --planned before 2026-10-08T09:14:00Z.
```

**`artroom install --planned`** founds the planned register, with the kept
intent and no other argument. Before anything is sent it checks the plan:
a plan whose ID is not the one its intent and version make, or whose
operator/service binding is wrong, is refused as `plan-mismatch`. An
unsupported pinned version keeps the pending plan and reports unsupported
provenance. A never-attempted plan whose time is over is refused as
`plan-expired`, without network: plan again and set the new ID.

Before the first possible founding submission, the command saves an
attempted marker bound to the exact plan. If delivery or the final config
save is uncertain, retry `install --planned`. An attempted plan may send
only its original envelope after expiry; the server returns an already
accepted identical founding, or refuses an expired unaccepted one. The
marker proves no acceptance and extends no deadline. The native configured-service
acknowledgement is checked against the exact planned definition, intent digest
and complete register fact. It must match any retained accepted fact. Recovery
does not require an aged bootstrap read. The command saves the original plan
and receipt before the installed config and retains them afterwards, labelled
`service-acknowledged` for later history verification. This acknowledges the
service's installed identity; it does not independently verify genesis bytes
or grant new authority. A mismatch or unavailable acknowledgement leaves the
recovery plan intact.

```
Installed: register sc_4kq2v7..., under platform:register@2, as planned.
```

[deploy.md](deploy.md) says why and when to plan first.

The retained service acknowledgement recovers installed identity. A fresh
claim after the bootstrap read window still needs the current register
summary in this source. The code-backed expected-state context is a pending
proposal, not an installed permission or executable-provenance proof.

**`artroom claim <name> [--handle @you] [--branch main] [--again]`**
signs the register's `found` act. It then waits until the directory,
membership, the rules scope and the destination are created and
confirmed. Then it takes the founder's seat and first key in membership,
which makes the founder the first admin. `<name>` is a label for this
output only: the register's `found` act has no name field (see "What it
does not do yet").

Before each founding step, the command saves its exact signed envelope:
`found`, then `seat`, then `first-key`. It saves accepted fact references
as each step completes. These records contain no private signing key.
A refusal, unavailable reply or lost answer leaves the request pending;
a later run keeps the same signature and deadline. An accepted marker is
checked against the receipt for that exact envelope before reuse.

```
Gave up waiting for the directory after 120 reads. What was asked may still take effect; run artroom claim demo again to go on waiting for this claim, or with --again to sign a new one, which creates a second repository.
```

Run `artroom claim <name>` again to continue the saved claim. The command
reads or retries the exact saved steps, then waits for their confirmed
scopes. It checks child identities against the actual directory seed and
full reference. It does not extend a saved deadline or invent a replacement
request. `--handle` is ignored on resume: the handle is the one already
signed. Older digest-only state resumes only when the retained founding
and enrollment records prove the exact signed steps; otherwise it stops
without a new submission.

`--again` deliberately replaces the pending claim with a new signed
`found`. Each `found` that takes effect creates a repository, so an earlier
unknown claim may still produce another repository. Use this option only
when deliberately starting another claim. An expired envelope stays saved
until this explicit replacement.

```
Claimed demo: directory sc_hs5f27fz..., membership sc_p6xp2lmd..., rules sc_sfbjwioy..., destination sc_e5xgdizd...; each created and confirmed.
You are @rita, an admin, on key key_baqzbaDy...; your inbox is sc_u5joavqp....
```

**`artroom invite <@member> --role <role> [--hours 24]`** is
membership's `invite-member`. It prints a link that holds the
invitation's number and its secret. The secret is a one-time invitation
secret, not a signing key; pass the link only to that member.

```
Invited @una as member: invitation sc_p6xp2lmd...:5, until 2099-01-02T00:00:00Z.
Link for @una only (it holds the invitation's secret): artroom-invite:eyJ2Ijox...
```

**`artroom join <link>`** is membership's `join`, signed by a new key
that the command makes and keeps. Before sending, it saves the exact signed
request in an owner-only `private/<name>.data` file; the invitation secret
is absent from public config. It saves the accepted fact and inbox progress
before waiting for the member's inbox. After a lost reply or an interrupted
wait, run `artroom join` with the original link again. This reuses the same
key, request and deadline. An accepted request is confirmed by a read-only
settlement, even after its deadline. A missing private request or a different
link stops the retry; it never signs a replacement automatically.

```
Joined as @una on key key_H1bY2Hml....
Your inbox: sc_zbtu7vax....
```

**`artroom acts [<scope>]`** lists the acts of the scope's definition
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

**`artroom act <kind> --on <scope> [--target <item>] [--set name=value ...]`**
signs and sends one act. A value is read by its field's type; a list or a
record is JSON, and `@handle` is a member of this repository. The command
fills in the current revision of each item the act names, from the
scope's summary; the scope checks it again.

```
Took effect: entry sc_p6xp2lmd...:8, hash sha256:2cd70f9ada97.
Refused: guard-failed (not-activated), judged at entry sc_hs5f27fz...:4. Nothing was written.
```

**`artroom log <scope> [--limit n]`** and **`artroom show <entry>`**
read the history and one entry over the read routes.

```
sc_p6xp2lmd...:8  2099-01-01T00:00:00Z  act add-member by key_baqzbaDy...; 6 effects, 1 sends
sc_p6xp2lmd...:9  2099-01-01T00:00:00Z  delivery result from inbox:0; 0 effects, 1 sends
10 entries in all.
```

**`artroom verify <scope>`** runs the replay verifier over the read
routes, with the platform package's rules. It reads with the caller's
session, and a read that the session is refused goes again as a signed
read by the caller's key. It prints the verifier's report: the result,
what it covered, and what it takes on trust. A history whose first page
cannot be read has no report; the command prints
`... cannot be read: <reason>` and exits 1.

```
Result: consistent, for the mode, target, coverage and trusts stated below.
Mode: replay. Within the coverage stated below, the history was folded from its genesis, ...
```

Exit codes: 0 done; 1 refused, unavailable, not found or not consistent;
2 a command line this cannot run.

## Reads and sessions

Before it reads, the command asks the repository's membership scope for a
read session, signed by its key. If membership gives none (a service with
no session secret, or a key that is no active member's), the command
reads by signed reads of its key, and the scope decides. Under a real
session a member can read the scopes that record their membership, and,
at the register, its genesis and the entries that come from the claim
that founded the repository. A signed read reads the entries that the
key signed, the entries that come from one of those within 15 minutes of
it (the intent window), and the retained inputs those entries carry. History and log pages can
be filtered; a sparse page is not complete replay evidence. The multiple-claim
coverage and destination-session gaps remain explicit intake findings.

## What it does not do yet

- There is no page. This is the command line only.
- The documented CLI story is a workerd fixture with real scope rules,
  authority, signed reads and sessions. Its Git host is a stand-in, and
  it drives dispatchers in place of deployment alarms. The deployed
  repository journey still needs its own evidence.
- The command does not activate lane definitions. The directory refuses
  `open-issue` and `open-pr` until the rules scope has activated the
  supplied definition.
- `invite --acts` is refused: membership's `invite-member` has no list of
  acts for one member.
- The founder must reach the seat within 15 minutes of the claim: until
  the seat, the founder reads the new scopes by signed reads only, and
  those last for the intent window after the claim. A claim whose
  creation takes longer gives up, and a resumed claim cannot read the
  directory either. See `notes/2026-10-07-i5-live-ops-delivery.md`,
  section 4.
- An act definition has no description text. The line `acts` prints is
  made from the act's step, item and grant.
