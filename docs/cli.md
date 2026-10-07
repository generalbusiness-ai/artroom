# The artroom command

`artroom` is a command-line client for the new model. Each command is a
thin function over two things: a scope service's base URL and a signing
key. The command builds and signs intents and reads the service's routes.
It judges nothing: whether an act takes effect is the scope's decision,
and the command prints the scope's answer. A refusal writes nothing, and
the command exits 1 with the refusal's reason.

The source is `packages/cli`. In this repository it runs as
`packages/cli/bin/artroom.js` under Node 22 or later. Nothing is
published to a registry, and no service is deployed.

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

**`artroom claim <name> [--handle @you] [--branch main] [--again]`**
signs the register's `found` act. It then waits until the directory,
membership, the rules scope and the destination are created and
confirmed. Then it takes the founder's seat and first key in membership,
which makes the founder the first admin. `<name>` is a label for this
output only: the register's `found` act has no name field (see "What it
does not do yet").

Before it sends the `found`, the command saves a pending claim in the
config: the register, the digest of the signed intent and the handle.
None of these is a secret. If the register refuses the claim, or answers
that it is unavailable, nothing was written and the pending claim is
removed. If the command gives up waiting, the claim stays pending:

```
Gave up waiting for the directory after 120 reads. What was asked may still take effect; run artroom claim demo again to go on waiting for this claim, or with --again to sign a new one, which creates a second repository.
```

Run `artroom claim <name>` again to go on. It signs nothing: it reads
the register once, which starts a register that was restarted since the
claim, and waits for the directory that the pending claim's digest names.
`--handle` is then ignored: the handle is the one the claim signed.
`--again` signs a new `found`. Each `found` that takes effect creates a
repository, so use it only when the first claim was refused or will never
take effect.

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
that the command makes and keeps. It waits for the member's inbox.

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

`--value <file>`, given once or more, sends each file's text beside the
intent as a value. The scope reads a value only at a place that its
definition states, by its digest: the bytes of a definition for the rules
scope's `activate` and the directory's `open-issue` and `open-pr`. For
example, an admin activates the demo profile's change definition with
`artroom act activate --on rules --set digest=<digest> --set name=change
--value packages/lanes/definitions/change-demo.json`, whose digest is in
`packages/lanes/src/digests.ts`.

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

**`artroom remote`** prints the repository's host, namespace, name and
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
Remote URL: https://<service host>/git/artroom-demo/5kywbv2y...-1.git (the service host is the deployment's setting; artroom clone prints it whole)
```

**`artroom clone [<directory>] [--hours 1]`** clones the repository with
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
   header is `Bearer <token>` on the hosting's own Git service, and
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
git is not installed here, so nothing was signed. With git installed, run artroom clone again; it runs:
git -c http.extraHeader="Authorization: Bearer <read token>" clone -- https://<service host>/git/artroom-demo/5kywbv2y...-1.git here
```

The token is for the clone. A later `git fetch` in the clone needs a new
token; run `artroom clone` again for one. A token that is never read ends
at its end.

**`artroom edit <path> --file <local file> [--title <text>]`** writes one
file of the repository through the room. The person never writes the
repository: the room judges the change and its destination writes it. The
examples have the form that `packages/lanes/test/edit.scope.test.ts`
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
6. It merges the change as `artroom merge` does.

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
Not published: the merge sc_ab12...:7 is refused, rules-not-met:rules. The change sc_ab12... stays open at version 6. When it may be merged, run: artroom merge sc_ab12...
```

The controller approves it for that extent with `artroom act review-verdict
--on <change> --set manifest=<version> --set verdict=approve --set
extent=rules`, and a member who holds `change.merge` runs `artroom merge`.
A second `edit` of the same path replaces the file. A path that no
published tree may hold (an empty, `.`, `..` or `.git` segment, a control
character, more than 1,024 bytes) is refused by the destination as
`path-invalid`, and nothing is pushed. A path where the published tree has
a folder, a symbolic link or a submodule, or a file on the way, is refused
as `integration-invalid`.

**`artroom merge <change>`** signs `merge` of the change's current version,
naming the reports it selects, and waits until the merge is published,
refused or aborted. It needs `change.merge`, which admins and maintainers
hold. Published: it prints the commit, and for a one-file version the
page's address. Refused by the lane, it prints the refusal; refused by the
destination, the reason. Either way the change stays open, and `artroom
merge` may be run again.

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
it (the intent window), and the retained inputs those entries name.

## What it does not do yet

- There is no page. This is the command line only.
- Nothing is deployed, so the command has run only against the test
  Worker. Its tests use a stand-in for the Git host and drive the
  scopes' dispatchers in place of a deployment's alarms.
- `edit` carries a file as UTF-8 text of at most 65,536 bytes: no image
  or other binary file. See `notes/2026-10-07-i5-edit-page-delivery.md`,
  section 3.
- `verify` carries no code of the lane capabilities, so it cannot replay a
  change lane, nor a destination whose history names one.
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
- A destination where no act has been signed yet cannot be read by
  anyone once the founder's intent window after the claim has passed:
  it accepts no read session until its first act records membership's
  incarnation, and the founder's signed read lasts 15 minutes after the
  claim. `remote` and `clone` then stop with `Cannot read <destination>:
  forbidden.` Run the first `clone` within 15 minutes of the claim. See
  `notes/2026-10-07-i5-clone-delivery.md`, section 5.
- `git fetch` and `git pull` in a clone have no command that gives them a
  token.
