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
and the namespace to `artroom`.

```
Installed: register sc_hinqqbm4....
The operator key key_baqzbaDy... is kept in the config directory, readable only by you. It is the one founder key.
```

**`artroom claim <name> [--handle @you] [--branch main]`** signs the
register's `found` act. It then waits until the directory, membership,
the rules scope and the destination are created and confirmed. Then it
takes the founder's seat and first key in membership, which makes the
founder the first admin. `<name>` is a label for this output only: the
register's `found` act has no name field (see "What it does not do yet").

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
Refused: bad-field, judged at entry sc_hs5f27fz...:4. Nothing was written.
```

**`artroom log <scope> [--limit n]`** and **`artroom show <entry>`**
read the history and one entry over the read routes.

```
sc_p6xp2lmd...:8  2099-01-01T00:00:00Z  act add-member by key_baqzbaDy...; 6 effects, 1 sends
sc_p6xp2lmd...:9  2099-01-01T00:00:00Z  delivery result from inbox:0; 0 effects, 1 sends
10 entries in all.
```

**`artroom verify <scope>`** runs the replay verifier over the read
routes, with the platform package's rules. It prints the verifier's
report: the result, what it covered, and what it takes on trust.

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
reads without one, and the scope decides. Under a real session a member
can read the scopes that record their membership. No session covers the
register.

## What it does not do yet

- There is no page. This is the command line only.
- Nothing is deployed, so the command has run only against the test
  Worker. Its tests use a stand-in for the Git host and drive the
  scopes' dispatchers in place of a deployment's alarms.
- `act` sends no value beside an act. The directory's `open-issue` and
  `open-pr` need the lane definition's bytes beside the act, at the
  field `definition`, so the directory refuses both `bad-field` when the
  command sends them.
- `invite --acts` is refused: membership's `invite-member` has no list of
  acts for one member.
- On a deployment with read sessions, `claim` cannot read the register or
  the new directory, because no session covers them yet. The verifier
  cannot read the register either, so `verify` of a scope whose creation
  chain starts there reports a missing dependency. The delivery note,
  section 5, has the details.
- An act definition has no description text. The line `acts` prints is
  made from the act's step, item and grant.
