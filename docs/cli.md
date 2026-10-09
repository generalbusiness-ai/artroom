# The artroom command

`artroom` is a command-line client for the new model. Each command is a
thin function over two things: a scope service's base URL and a signing
key. The command builds and signs intents and reads the service's routes.
It judges nothing: whether an act takes effect is the scope's decision,
and the command prints the scope's actual answer category. A refusal exits
1 with its reason. An unavailable answer confirms no acceptance; timed
entries may already have been written. Inspect the history before another
mutation. Recovery needs the original signed envelope; repeating a generic
command signs a new request.

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
`destination`, `inbox`. An entry is named `<scope>:<seq>`. An issue is
named by its number, `3` or `#3`, as `artroom issues` lists it, or by its
lane's scope ID.

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
register's genesis records both. A later plan replaces it.

```
Planned: register sc_4kq2v7..., under platform:register@2, on host artifacts, namespace artroom-demo. The seed's time is 2026-10-08T09:14:00Z.
Set registerScope to sc_4kq2v7... in the Worker's host setting, then run artroom install --planned before 2026-10-08T09:14:00Z.
```

**`artroom install --planned`** founds the planned register, with the kept
intent and no other argument. Before anything is sent it checks the plan:
a plan whose ID is not the one its intent and version make, or whose
version is not the one this command founds under, is refused as
`plan-mismatch`; a plan whose time is over is refused as `plan-expired`.
Either refusal sends nothing and writes nothing; plan again, and set the
new ID. After the founding, the receipt's register must be the planned
one.

```
Installed: register sc_4kq2v7..., under platform:register@2, as planned.
```

[deploy.md](deploy.md) says why and when to plan first.

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
Refused: guard-failed (not-activated), judged at entry sc_hs5f27fz...:4. The request was refused.
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
routes, with the platform package's rules and the code of the two lane
capabilities, `hold@1` and `git-read@1`, so it replays a lane too. It reads with the caller's
session, and a read that the session is refused goes again as a signed
read by the caller's key. It prints the verifier's report: the result,
what it covered, and what it takes on trust. A history whose first page
cannot be read has no report; the command prints
`... cannot be read: <reason>` and exits 1.

```
Result: consistent, for the mode, target, coverage and trusts stated below.
Mode: replay. Within the coverage stated below, the history was folded from its genesis, ...
```

**`artroom verify --all`** runs the same replay for every scope of the
room: the register, the directory, and every scope that the directory
created and each of those created (membership, the rules scope, the
destination, each lane, each inbox), found by the creations in their
histories. It prints one line for each scope: its kind, its ID, the entry
the replay reached and the result. The last line is `All consistent: <n>
scopes.`, or the first finding, and then the command exits 1. A history
that cannot be read is a finding. The example is from
`packages/lanes/test/issues.scope.test.ts`, after two issues were closed by
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

**`artroom propose <branch> [--title <text>]`** submits the committed files
that differ between the room's published head and a local branch tip. It
reads committed objects, so uncommitted files and the index remain untouched.
The room's head must be an ancestor of that tip. The room creates and
publishes its own commit; the person does not push the branch. After a
publication, `git pull` reads that room commit.

This command requires a manifest-list change definition and a destination
at version 3. Existing rooms retain their genesis pins. An older room is
refused with `version-mismatch`; activation alone cannot upgrade its
native destination. A founder supplies the authored `change3.json` or
`change-demo3.json` bytes to the rules scope, by their exact digest.

The change records one signed `propose-file` source entry per path, then
one `propose-manifest` that freezes all paths, entry references and byte
digests on the published base. The destination builds their shared tree
at reservation and records it before any required check. A check request
reads that reservation tree; publication waits for every required check's
authentic pass. While a check is owed, the command prints the change and
reserved tree. A published result prints the room's commit. A policy
refusal prints its name and the merge command to run after approval.

This delivery carries UTF-8 text, including its exact byte order mark and
NUL bytes. It names refusals for deleted or renamed files, non-UTF-8
content, an unsupported mode change, more than 64 changed paths, a path
that cannot be written, and a file over 65,536 bytes. Each source entry
uses the existing per-entry transport bound. It carries no Git pack.
Binary content, deletion and rename support remain in the later R5 work.
The demonstration uses two text files.

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
6. With `--closes <issue>`, it signs the lane's `link-own` to that issue,
   as `artroom merge --closes` does.
7. It merges the change as `artroom merge` does.

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

With **`--closes <issue>`**, `merge` first signs the change lane's
`link-own` to the issue (`how` is `keyword`). The link is a fact of the
change lane. When the merge is published, the lane tells the issue, and
the issue closes with the reason `completed`, by its own entry. Only the
change's author may sign `link-own`; the demo profile has no `link-any`.
So a member who opens a change can link it, but cannot merge it: members
do not hold `change.merge`. The member's change waits, linked, and an
admin or a maintainer merges it. The examples from here on have the form
that `packages/lanes/test/issues.scope.test.ts` asserts, with IDs cut
short; the numbers and hashes in them are illustrative.

```
Proposed guide/start.md (53 bytes) as change sc_q3xk..., version 6.
Linked: when it is published, the change sc_q3xk... closes issue #1 (sc_4bbo...).
Refused: unauthorized, judged at entry sc_q3xk...:7. The request was refused.
The change sc_q3xk... waits, at version 6. When it may be merged, run: artroom merge sc_q3xk...
```

Then, as the admin, `artroom merge sc_q3xk...`:

```
Published: commit 5d0c1e6b..., by the merge sc_q3xk...:8.
Page: https://scopes.test/site/sc_hs5f27fz.../HEAD/guide/start.md
```

**`artroom issue open --title <text> [--body <text>]`** signs the
directory's `open-issue` under the issue definition that the rules scope
holds active, with its bytes beside the act, and waits for the issue's
lane. The body is a detached text: the act holds its digest. The issue's
one condition is its title, because the lane refuses an issue with no
condition. The directory numbers issues and changes in one sequence. An
admin activates the demo profile's issue definition as for the change
definition: `--set name=issue --value
packages/lanes/definitions/issue-demo.json`.

```
Opened issue #1: The handbook has no start page. Its lane is sc_4bbosp5k....
```

**`artroom issue comment <issue> <text>`** is the issue lane's `comment`.
Any member may comment.

**`artroom issue assign <issue> <@member>`** is the lane's `assign`. It
sets the assignee, and needs `issue.triage`, which admins and maintainers
hold. Assignment is optional; no rule of the demo profile needs it.

**`artroom issue close <issue>`** signs `close-own` when the caller opened
the issue, and `close-any` otherwise, which needs `issue.triage`. The
reason is `completed`. The demo profile has no rule that lets an assignee
close an issue. A member who did not open it is refused:

```
Commented: entry sc_4bbosp5k...:1, hash sha256:3b1f0c2d9e8a.
Refused: unauthorized, judged at entry sc_yx6ty22i...:1. The request was refused.
```

**`artroom issues`** lists every issue, oldest first: its number, its
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

Before it reads, the command asks the repository's membership scope for a
read session, signed by its key. If membership gives none (a service with
no session secret, or a key that is no active member's), the command
reads by signed reads of its key, and the scope decides. Under a real
session a member can read the scopes that record their membership, and,
at the register, its genesis and the entries that come from the claim
that founded the repository. A signed read reads the entries that the
key signed, the entries that come from one of those within 15 minutes of
it (the intent window), and the retained inputs those entries carry. History and log pages can
be filtered; a sparse page is not complete replay evidence. Replay still states its actual coverage and foreign-history trust.

## What it does not do yet

- There is no page. This is the command line only.
- The documented CLI story is a workerd fixture with real scope rules,
  authority, signed reads and sessions. Its Git host is a stand-in, and
  it drives dispatchers in place of deployment alarms. The deployed
  repository journey still needs its own evidence.
- `edit` carries a file as UTF-8 text of at most 65,536 bytes: no image
  or other binary file. See `notes/2026-10-07-i5-edit-page-delivery.md`,
  section 3.
- `issue open` has no flag for an issue's conditions: the title is its one
  condition. See `notes/2026-10-07-i5-issues-delivery.md`, section 5.
- A member cannot merge their own change: `merge` needs `change.merge`.
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
- An active member's session reads the destination before its first act,
  including after the founder's signed-read window. The destination checks
  the full confirmed membership reference from its recorded birth directory
  before accepting a session, even before its first retained observation. The first `remote` or `clone`
  need not occur within 15 minutes of the claim. Signed reads without a
  session retain their window. See the destination-read follow-up in
  `notes/2026-10-07-i5-clone-delivery.md`.
- `git fetch` and `git pull` in a clone have no command that gives them a
  token.
