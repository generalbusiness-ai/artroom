# JSON output for the dap command line

A design for a global `--json` flag on every command of the command line.
Written for request `6a9db1b9777951d2a4ff61ebbe6189681a80176b` under planner
promise `84506c10d8ccda1df931f6d1ebbbebc09061cc52`, from the discussion report
`5784eaed28a216a831f1c744355d3d246739fa88` and the source at main
`013fac7a5c0d65affda51198ae251acb19b6b765`. This is a specification for
design review. Landing this document implements nothing, publishes no package,
changes no output and runs no act. Implementation requests are derived
separately after the review, and none runs before the demo.

Names in transition: this note writes the command as `dap`. At the commit it
describes, the program is still `artroom` (`packages/cli/bin/artroom.js`) and
the packages are `@generalbusiness/artroom-*`. The rename lands as its own
change; nothing here depends on it.

## 1. The decision

Every command returns a typed result. The text that a person reads and the
JSON that a program reads are two renderings of that one result. The JSON
rendering is a versioned envelope around the native structures of the
contract: scope references, facts, receipts, answers, reads, reports and
definitions appear as the contract defines them, with every identifier and
hash intact. The flag is a global switch, `--json`, accepted anywhere on the
line. It changes what is written and where, never what the command does, what
it signs or what it sends.

Two things this design refuses. It does not wrap the lines of today's prose
in an array and call that structured output; a consumer would still parse
sentences. And it does not invent names for things the contract already
names: an act's `step`, `on`, `grant` and `fields` keep their native spelling,
a scope reference keeps `scope`, `inc` and `kind`, and a hash is never
shortened.

## 2. What exists today

The facts this design starts from, read at main `013fac7a`:

- `packages/cli/src/line.ts` parses the words of a line into positional words,
  `--name value` flags and switches. The switches are `again`, `all`, `plan`
  and `planned`. Each command has a list of the flags it accepts (`KNOWN`), and
  an unknown flag is a usage error. There is no `json`, `format` or `output`
  flag.
- Every command returns an `Outcome`: `{ code: 0 | 1 | 2; lines: string[] }`.
  Code 0 is done. Code 1 is refused, unavailable, unknown or not found. Code 2
  is a line the program cannot run. The lines are prose.
- `packages/cli/src/main.ts` writes the lines once, when the command is done:
  to standard output when the code is 0, to standard error otherwise, each
  line followed by a newline. No command writes anything before it ends. A
  wait between reads is silent. `clone` runs `git` as a child process, which
  writes its own progress to the terminal.
- The twenty-two command forms are listed in `USAGE`: `install` (direct,
  `--plan`, `--planned`), `claim`, `invite`, `join`, `acts`, `act`, `log`,
  `show`, `verify`, `verify --all`, `remote`, `clone`, `edit`, `propose`,
  `merge`, `issue open`, `issue comment`, `issue assign`, `issue close` and
  `issues`.
- The outcomes a command can end with, as the source names them: done;
  refused (`Answer.answer === "refused"`, with a reason, an optional guard
  name and the head it was judged at); unavailable (the outcome is unknown and
  no acceptance is confirmed); mismatch (the idempotency key names another
  recorded intent); a read refusal ("Cannot read ... : reason"); gave up
  waiting (the request may still take effect); unknown observation (`merge`
  accepted but its result not observed; `clone` minted or not, unknown);
  partial (`edit` and `propose`: earlier steps recorded, a later step not
  confirmed); not published (`merge` refused or aborted after acceptance);
  unsupported (a definition or destination version the command does not
  drive); usage; and an unexpected error, which today escapes `run()` and
  ends the process without an outcome.
- The size measurement from the discussion (C1, source only, 13 non-genesis
  act declarations of the application profile): full act forms 8,436 compact
  UTF-8 bytes; the `step`, `on`, `grant`, `fields`, nonempty `also` and
  `presents` parts 2,705 bytes; the whole declaration 12,691 bytes, before any
  result metadata. This is evidence for one definition, not a size claim about
  every definition.

## 3. The flag

**Placement.** `--json` is a switch (it takes no value) and may stand anywhere
on the line: before the command word, between words, or last. The parser
removes it before the command's own flags are checked, so no command's `KNOWN`
list changes and no command sees it. Given twice, it is given once. It is the
only global switch; this design adds no `--format`, `--output` or `--pretty`.

**With every line.** The flag applies to usage errors too. `dap --json` with
no command, `dap frob --json`, and `dap act --json` with a missing `--on` all
write one JSON document with status `usage`, exit 2, and the usage text in
`error.usage`. A person who asked for JSON gets JSON even when the line was
wrong.

**With the other flags.** No existing flag changes meaning. `--limit`,
`--hours`, `--set`, `--value`, `--file` and the switches work as before. Where
a text rendering prints a hint ("Run: dap acts"), the JSON carries the same
hint as a structured `next` field (section 5), not as a sentence to parse.

**Not an environment variable.** The flag is explicit on each line. A
configuration or environment default is a remaining decision (section 13),
not part of this design.

## 4. Where the bytes go

In JSON mode the rules are strict and few:

1. **Standard output carries exactly one JSON document**, UTF-8, compact (no
   insignificant whitespace), followed by one newline. This holds for every
   exit status, including 1 and 2. In text mode the lines of a failed command
   go to standard error; in JSON mode the document is the result and belongs
   on standard output whatever the status, so a pipeline reads one stream.
2. **Standard error carries nothing from the command itself** in JSON mode.
   It may carry what the runtime or a child process writes (section 4, item
   4, and the unexpected-error case in section 5). A consumer may discard it.
3. **No progress output.** Today no command writes before it ends, and this
   design keeps that. A wait (`claim`, `join`, `merge`, `clone`) stays silent
   and its bounds are reported in the result (`waited`, section 5).
4. **Child processes.** `clone` runs `git`. In JSON mode the child's standard
   output and standard error both go to the parent's standard error, never to
   standard output. The child's exit code is in the result. The command's
   document is still written once, after the child ends.
5. **Exit status is unchanged by the flag.** 0 for done; 1 for refused,
   unavailable, mismatch, unknown, partial, not found, unsupported and
   unexpected error; 2 for usage. A consumer reads `status` for the
   distinction and `exit` for the number; the process exit code equals
   `exit`.
6. **Pretty printing is the consumer's.** The compact form is the only form.
   `dap acts --json | jq .` is the way to read it by eye. Keys are written in
   a stable order: the envelope keys in the order of section 5, then a
   result's keys in the order this note declares them, then native structures
   in the order the contract's canonical form gives them.

## 5. The envelope

One schema, versioned by `v`. Version 1 is this:

```json
{
  "v": 1,
  "command": ["issue", "open"],
  "status": "done",
  "exit": 0,
  "result": { },
  "error": { },
  "recorded": [ ],
  "next": [ ]
}
```

- `v` (integer, required): the envelope version. 1.
- `command` (array of strings, required): the command words as the parser
  resolved them, without flags. `["install"]`, `["install","plan"]`,
  `["install","planned"]`, `["verify","all"]`, `["issue","close"]`. A usage
  error before a command is recognised gives `[]`.
- `status` (string, required): one of the closed set in the table below.
- `exit` (integer, required): 0, 1 or 2.
- `result` (object): present exactly when `status` is `done` or `partial`.
  Its shape is the command's (section 6).
- `error` (object): present exactly when `status` is not `done`. Its shape
  is the status's (below). A `partial` document has both `result` and
  `error`.
- `recorded` (array): present when the command knows that something was
  recorded although it did not finish: each element is a `FactRef` with a
  `role` naming what it is (`"opened"`, `"proposed"`, `"linked"`,
  `"merge"`, `"read-token"`). Present for `partial`, `unknown` and
  `unavailable` where the command holds a receipt; absent otherwise.
- `next` (array of objects): what the person may do now, as the text
  rendering says in words. Each element is `{ "run": ["show", "sc_…:12"] }`
  (a command line to run, as words) or `{ "inspect": FactRef }`. Present
  when the text rendering prints such a hint; otherwise absent. Never a
  sentence.

The statuses, their exit codes and their `error` shapes:

| status | exit | meaning | `error` |
|---|---|---|---|
| `done` | 0 | the command finished and its result is complete | absent |
| `partial` | 1 | earlier steps are recorded; a later step was not confirmed (`edit`, `propose`) | `{ "step": string, "reason": string }` and `recorded` |
| `refused` | 1 | the scope judged the intent and refused it | `{ "reason": RefusalReason, "name"?: string, "judgedAt": Head, "scope": ScopeId }` |
| `unavailable` | 1 | the scope answered unavailable; outcome unknown, no acceptance confirmed | `{ "reason": UnavailableReason, "scope": ScopeId \| null }` and `next` |
| `mismatch` | 1 | the idempotency key names another recorded intent | `{ "reason": "idempotency-mismatch", "scope": ScopeId \| null }` and `next` |
| `unknown` | 1 | accepted, then the outcome could not be observed; or a wait gave up | `{ "reason": string, "waited"?: { "reads": n, "tries": n }, "scope": ScopeId }` and `recorded` where held |
| `not-found` | 1 | a read refused: the scope, entry, issue, change or definition is not there, or cannot be read | `{ "reason": ReadRefusal \| "no-room" \| "no-repository" \| "no-issue" \| "no-change", "scope"?: ScopeId, "seq"?: n, "detail"?: FactRef \| ScopeRef }` |
| `unsupported` | 1 | the definition, destination version or workflow is one this command does not drive | `{ "reason": string, "definition"?: Digest \| PlatformDefinition, "scope"?: ScopeId }` |
| `no-answer` | 1 | the transport gave no answer (a `TransportError`); whether anything was recorded is stated | `{ "reason": string, "mayBeRecorded": boolean }` |
| `usage` | 2 | the line is not one the program runs | `{ "message": string, "usage": string }` |
| `error` | 1 | an unexpected error; nothing is claimed about what was recorded | `{ "message": string }` |

Rules that hold for every status:

- The acceptance of an intent and the observation or publication of its
  result are different facts and are never merged. `merge` with status
  `unknown` holds `recorded: [{ role: "merge", … }]`: the merge was accepted;
  what happened next was not observed. `clone` with `unknown` means the mint
  was accepted and its outcome not read. A consumer must not retry a
  mutation on `unknown`, `unavailable` or `no-answer`; the `next` field says
  what to inspect.
- `refused` and `unknown` are never the same status. A refusal is a judgment
  at a named head. An unknown is the absence of a judgment the command could
  read.
- The `error` status carries the error's message and nothing else: no stack,
  no file paths, no configuration. The message also goes to standard error
  in text form, for a person.

## 6. The common types

The JSON uses the contract's types without renaming. A consumer that reads
the contract reads these.

- `ScopeId`: a string `sc_…`. `Incarnation`: `in_…`. `KeyId`: `key_…`.
  `Digest`: the contract's digest string.
- `ScopeRef`: `{ "scope": ScopeId, "inc": Incarnation, "kind": ScopeKind }`.
  Wherever a command knows the full reference it writes the full reference;
  it writes a bare `ScopeId` only where the configuration holds only the ID
  (`rules`, `destination`, `inbox` in `Repository`), and the key says which
  (`"rules": "sc_…"` versus `"directory": { "scope": …, "inc": …, "kind": … }`).
- `FactRef`: `{ "at": ScopeRef, "seq": number, "hash": Digest }`.
- `Head`: `{ "seq": number, "hash": Digest }`, the head a read or a judgment
  was made at.
- `MemberRef`: `{ "membership": ScopeRef, "member": MemberId }`.
- `Standing`: `{ "role": Role, "actions": string[], "handle": string }`, the
  caller's current seat as the membership summary shows it.
- `Receipt`, `Answer`, `Founded`, `Entry`, `Summary`, `Report`: exactly the
  contract's shapes. A receipt's `definition` is the pin (a digest or a
  platform definition name). A refusal's `judgedAt` is a `Head`.
- `Read` heads: every value that came from a read carries the head it was
  read at as `at: Head`, and `complete: boolean` where the read was paged.
  Two reads are two heads. An aggregate (section 6.5) names each head
  separately and never one head for all.

Identifiers are complete. The text rendering shortens a hash to nineteen
characters for the eye; the JSON never does.

## 7. Command by command

Each entry gives the `result` of `done`, the statuses that apply besides
`done`, `usage` and `error`, and what must not appear. Native structures are
named by their contract type.

### 7.1 `install <base-url>`

```json
{ "service": "https://…", "register": ScopeRef, "definition": PlatformDefinition,
  "founded": Receipt, "operator": { "key": KeyId, "kept": "config-directory" } }
```

Statuses: `refused` (`Founded.refused`, with `unsupported-definition` or a
delivery refusal as the reason), `unavailable`, `no-answer`. Never: the
operator's secret bytes, the configuration directory's path.

### 7.2 `install --plan <base-url>`

```json
{ "service": "https://…", "register": ScopeId, "definition": PlatformDefinition,
  "host": string, "namespace": string, "notAfter": Timestamp,
  "next": [{ "run": ["install", "--planned"] }] }
```

The planned intent itself (a `SignedIntent`) is kept in the configuration
and is not written: it is the one thing that founds the register, and a plan
printed to a log could be sent by anyone who reads the log. Statuses:
`unsupported` (a selected cohort plan already exists and is exact).

### 7.3 `install --planned`

```json
{ "register": ScopeRef, "definition": PlatformDefinition, "founded": Receipt,
  "recovery": null | { "status": "service-acknowledged", "service": string } }
```

Statuses: `refused`, `unavailable`, `mismatch`, `no-answer`, `not-found` (no
plan is kept here).

### 7.4 `claim <name>`

```json
{ "name": string, "handle": string, "member": { "key": KeyId, "role": "admin" },
  "repository": { "directory": ScopeRef, "membership": ScopeRef, "rules": ScopeId,
                  "destination": ScopeId, "inbox"?: ScopeId },
  "definitions": { "directory": Digest | PlatformDefinition, "membership": …,
                   "rules": …, "destination": … },
  "founded": Receipt, "confirmed": [{ "scope": ScopeRef, "at": Head }] }
```

`confirmed` names each created scope and the head at which its summary read
`active`. Statuses: `refused` (the register refused the claim, or a lane
refused its genesis), `unavailable`, `mismatch`, `unknown` (gave up waiting
for a scope to confirm; `recorded` holds the founding receipt), `no-answer`.
A resumed claim (`--again`, or a pending claim in the configuration) reports
the same shape; `recorded` is absent on `done` because every step is in
`result`.

### 7.5 `invite <@member> --role <role>`

```json
{ "member": MemberId, "role": Role, "invitation": FactRef, "until": Timestamp,
  "definition": Digest | PlatformDefinition,
  "confidential": { "link": string } }
```

The link holds the invitation's secret and is the command's whole purpose,
so it is written. It is written under `confidential` and nowhere else, so a
consumer can drop that one key before logging. The link is no signing key;
it is presented once by `join`. Statuses: `refused`, `unavailable`,
`mismatch`, `no-answer`, `not-found` (no repository here).

### 7.6 `join <link>`

```json
{ "handle": string, "key": KeyId, "member": MemberRef, "inbox": ScopeId,
  "repository": Repository, "joined": Receipt }
```

Statuses: `refused` (including `rate-limited` as an `unavailable` reason,
which is how the contract names it: nothing judged, nothing recorded),
`unavailable`, `mismatch`, `unknown` (gave up waiting for the inbox),
`no-answer`, `usage` (the link does not parse). Never: the link's secret, the
new key's secret.

### 7.7 `acts [<scope>]`

```json
{ "scope": ScopeRef, "at": Head, "definition": Digest | PlatformDefinition,
  "caller": { "key": KeyId, "standing": Standing | null,
              "membership"?: { "scope": ScopeRef, "at": Head } },
  "acts": { "<kind>": { "step": "open" | "transition" | "comment", "on": string | null,
                        "grant": string | { "code": string, "grant"?: string },
                        "also": { … } | omitted when empty,
                        "fields": { "<name>": FieldType & { "required": boolean, "default"?: FieldValue } },
                        "presents"?: { … } } },
  "hidden": number, "detail": "catalog" }
```

The catalog is a map by act kind, as `definition.acts` is natively; it is
not an array with a repeated `kind` key. Each act keeps its native `step`,
`on` and `grant`, and its complete native field declarations: the type, its
bounds (`max`, `min`, `of`, `kind`, `under`), `required`, `default`, nested
`record` and `list` members. `also` and `presents` are included when
nonempty. The default catalog omits `guards`, `effects`, `sends`,
`attention`, `settles`, the definition's `rules`, `items`, `receives` and
`timed`: the C1 measurement shows the catalog at about a third of the full
act forms, and the programs are not what a caller needs to form an intent.
`detail` names what was written; a later `--detail full` (section 13) would
write the native `ActType` whole, and `show` on the definition's retained
bytes is the complete form today.

The list is the role's: acts whose `grant` the caller's standing covers, plus
acts whose grant is a rule (the rule decides at submission). `hidden` counts
the rest. No act carries an `available` flag: guards are not evaluated here,
and the scope's own judgment of a signed intent is the only admission. A
finished Counter still lists `start`.

Two heads: `at` is the scope's summary head and `caller.membership.at` is the
membership's. They are separate reads at separate moments; the document
states both and claims no snapshot across them. Statuses: `not-found` (scope,
definition or membership not readable), `unsupported` (the definition is one
the client cannot pin).

### 7.8 `act <kind> --on <scope>`

```json
{ "scope": ScopeRef, "kind": string, "intent": Digest, "answer": Answer }
```

`answer` is the native `Answer`. On `done` it is `accepted` and carries the
`Receipt`: `fact`, `definition`, `intent`, `effects`, `sends`. A `refused`
answer becomes status `refused` with the answer's `reason`, `name` and
`judgedAt` in `error`; the document carries no `result`. Statuses: `refused`,
`unavailable`, `mismatch`, `no-answer`, `not-found`, `unsupported` (a field
value the client cannot shape), `usage` (an unknown kind, a bad `--set`).
Never: the signed intent's signature bytes beyond what the receipt names,
the local file bytes of `--value`.

### 7.9 `log <scope> [--limit n]`

```json
{ "scope": ScopeRef, "at": Head, "total": number, "limit": number, "complete": true,
  "entries": [{ "seq": number, "hash": Digest, "time": Timestamp,
                "input": "genesis" | "act" | "delivery",
                "kind"?: string, "decision"?: "applied" | "refused" | "superseded",
                "by"?: KeyId, "effects": number, "sends": number }] }
```

`entries` are the last `limit` entries, each a bounded line, not the whole
`Entry`; `show` gives the entry. `total` is the count read; `complete` is
whether the history read reached the head without a refused page. Statuses:
`not-found` (a page refused: reason and the cursor it stopped at in
`error.detail`). Bounds: the history is read whole today, in pages of 200
entries or 1 MiB; `--limit` bounds the output, not the read. A streamed form
is a remaining decision (section 9).

### 7.10 `show <scope>:<seq>`

```json
{ "scope": ScopeRef, "seq": number, "hash": Digest, "entry": Entry }
```

The native `Entry`, whole: `at`, `seq`, `prev`, `time`, `clamped`, `input`
(genesis, act or delivery, with its signed intent, judged authority and
presented facts), `uses`, `prepared`, `effects`, `sends`. A detached text is
named by digest in the intent and is not inlined; the entry read is bounded
at 256 KiB by the contract. Statuses: `not-found`, `usage` (the name is not
`<scope>:<seq>`).

### 7.11 `verify <scope>`

```json
{ "scope": ScopeRef, "report": Report, "consistent": boolean, "why"?: string }
```

The native verifier `Report`: `mode`, `target`, `coverage`, `anchors`,
`dependencies`, `trusts`, `redacted`, `result`, `at`, `name`. `consistent` is
`report.result === "consistent"`, written out so a consumer need not know
the enum. The text rendering exits 1 on any other result, and section 4
keeps exit codes unchanged, so a report with another result is status
`inconsistent`, exit 1, with `result` present and `error` absent. This is
the one status outside the table of section 5, used by `verify` and
`verify --all` only (remaining decision 1).

### 7.12 `verify --all`

```json
{ "repository": Repository, "at": { "directory": Head },
  "scopes": [{ "scope": ScopeRef, "kind": ScopeKind,
               "report"?: Report, "notRead"?: { "reason": string },
               "cleanup"?: { "finding": string | null, "observed": boolean } }],
  "consistent": boolean, "first"?: { "scope": ScopeRef, "finding": string },
  "incomplete"?: { "scope": ScopeRef, "pages": number, "next": Cursor } }
```

Each scope is its own report at its own head; the aggregate is a list, not a
snapshot. `incomplete` names the scope at which discovery hit the page bound
and the cursor to continue from; the whole room was then not verified and
`consistent` is false. Statuses: `inconsistent`, `not-found` (no repository
here), `usage` (`--all` with a scope).

### 7.13 `remote`

```json
{ "destination": ScopeRef, "at": Head, "host": string, "namespace": string,
  "name": string, "remoteUrl": string }
```

Statuses: `not-found`, `unsupported` (the destination is not a supported
destination definition).

### 7.14 `clone [<directory>] [--hours n]`

```json
{ "destination": ScopeRef, "readToken": { "request": FactRef, "operation": OperationId,
    "outcome": "minted", "observedAt": FactRef },
  "git": { "ran": true, "exit": 0, "directory": string }, "remoteUrl": string }
```

The token itself is never written, in any status: it is read by the session,
given to `git` through its environment, and not kept. `git.exit` is the
child's exit code; `git.ran: false` with `exit: null` when there is no
`git`. Statuses: `unsupported` (no `git` here: `result.git.ran` false and
the command `git` would run, with the token placeholder, in `next`),
`refused` (the host refused the mint; `readToken.outcome: "refused"`),
`unknown` (the mint's outcome was not read within the bounded wait, or the
mint is recorded unknown; `recorded` holds the read-token request), `partial`
(the token was read, `git clone` exited nonzero: `recorded` and
`result.git.exit`), `not-found`, `usage` (`--hours` out of range). Nothing
about the token's value, the session or the provider appears.

### 7.15 `edit <path> --file <local file>`

```json
{ "change": { "lane": ScopeRef, "opened": FactRef },
  "proposed": { "fact": FactRef, "version": ItemId, "path": string, "bytes": number },
  "linked"?: { "issue": { "number": number, "lane": ScopeRef }, "fact": FactRef },
  "merge"?: <the result of 7.17>, "page"?: string }
```

`edit` is a workflow: open a change, propose the file, optionally link an
issue, then merge. Its `partial` status (section 5) names the step that was
not confirmed and `recorded` lists the facts of the steps that were. On
`done`, `merge` is the merge's own result object (7.17) including its
`state`. Statuses: `partial`, `refused`, `unavailable`, `unknown`,
`unsupported` (the active change definition or destination version does not
support this command's acts), `not-found`, `usage` (no `--file`, not UTF-8,
too large).

### 7.16 `propose <branch>`

```json
{ "change": { "lane": ScopeRef, "opened": FactRef },
  "proposed": { "fact": FactRef, "version": ItemId, "base": string, "tip": string,
                "files": number },
  "merge"?: <7.17> }
```

Same workflow rules as `edit`. The files' contents are not written; their
count is. Statuses as `edit`, plus `unsupported` with reasons
`git-unavailable`, `version-mismatch`, `no-published-head`,
`no-changed-paths`, `too-many-paths`, `file-too-large`,
`unsupported-workflow`, each as `error.reason` verbatim.

### 7.17 `merge <change> [--closes <issue>]`

```json
{ "lane": ScopeRef, "version": ItemId, "merge": FactRef,
  "state": "published" | "committed",
  "commit"?: string, "tree"?: string, "page"?: string,
  "linked"?: { "issue": { "number": number, "lane": ScopeRef }, "fact": FactRef } }
```

`state: "published"` carries `commit`; `state: "committed"` is a reservation
(`tree`), published only after the required checks. A merge that was
accepted and then refused or aborted is status `refused` with `error.reason`
the recorded reason and `recorded: [{ role: "merge", … }]`: the acceptance is
a fact and the refusal is a later fact, both named. A merge accepted and not
observed is `unknown` with `recorded`. Statuses: `refused`, `unavailable`,
`mismatch`, `unknown`, `no-answer`, `not-found`, `usage` (the lane is no
change).

### 7.18 `issue open --title <text>`

```json
{ "issue": { "number": number, "lane": ScopeRef, "title": string },
  "opened": FactRef, "confirmed": Head }
```

Statuses: `refused`, `unavailable`, `mismatch`, `unknown` (gave up waiting
for the lane), `no-answer`, `not-found`, `usage`.

### 7.19 `issue comment`, `issue assign`, `issue close`

```json
{ "issue": { "number": number, "lane": ScopeRef }, "kind": "comment" | "assign" | "close",
  "answer": Answer }
```

As `act` (7.8): the native `Answer`, and `refused` carries reason, guard name
and `judgedAt`. A `close` refused by a guard is the case Hugh raised in the
forms work; here it is `status: "refused"`, `error.reason: "guard-failed"`,
`error.name` the guard's declared reason, nothing invented.

### 7.20 `issues`

```json
{ "directory": ScopeRef, "at": Head,
  "issues": [{ "number": number, "state": string, "title": string,
               "assignee"?: MemberId, "lane": ScopeRef }],
  "counts": { "total": number, "open": number } }
```

A listing is a read of the directory at one head: it says which lanes exist,
not what any of them admits. Statuses: `not-found`.

## 8. Rendering from one result

Each command's function returns the typed result (or throws a typed stop),
and two renderers produce the outputs: `text(result)` gives today's lines,
`json(result)` gives the document. The invariant that makes the design
honest: the text renderer reads only the result, so every sentence the text
prints is derivable from the JSON, and nothing the JSON prints is parsed from
a sentence. The current `Outcome` becomes the text renderer's output type,
not the commands' return type.

This is an internal restructuring of `commands.ts` and is the bulk of the
implementation cost. It is also what makes the text output verifiable: the
text tests keep passing unchanged, and a new test asserts that each text
line is produced by the renderer from a result the JSON test also sees.

## 9. Large reads and streaming

Bounded today and bounded in this design:

- `log` reads the whole history in pages (200 entries, 1 MiB) and writes the
  last `--limit` lines (default 20). The document is bounded by `--limit`.
- `show` is bounded by the contract's entry read bound, 256 KiB.
- `verify --all` is bounded by the discovery page limit (1,000 pages) and
  reports `incomplete` with a cursor.
- `acts` is bounded by the definition's limits (64 acts) and the catalog's
  omissions.

No command needs a streamed form to meet this design. A JSON-lines mode (one
document per entry, for a whole history) is not in version 1. It is a
remaining decision (section 13) tied to a `--follow` or `--all` on `log`,
which does not exist in text form either. Version 1 writes one document.

## 10. Compatibility and evolution

- **Text output is unchanged.** Without `--json`, every command writes the
  bytes it writes today, to the stream it writes them to today, with the
  exit code it has today. The existing command tests are the witness.
- **Envelope version 1 is frozen on landing.** Within version 1, a change may
  add an optional key to a result or an `error`, add a value to an enum
  only where this note says the enum is open (`error.reason` strings that
  quote the contract follow the contract), and add a command. A change may
  not remove or rename a key, change a key's type, or change a status's
  exit code. Any of those is version 2, and a version-2 document says `"v":
  2`.
- **Consumers ignore unknown keys** and must not depend on key order, which
  is stable for the eye and not a contract.
- **Native structures follow the contract.** A receipt, an entry or a report
  changes when the contract changes; the envelope does not version those.
  `show`'s `entry.v` and a receipt's `definition` pin carry the native
  version. The CLI package version is the compatibility statement for the
  pair.
- **Statuses are closed per version**: the eleven of section 5 plus
  `inconsistent` for `verify`. A new status is a new version.

## 11. What is never written

The configuration directory holds secrets (signing keys, kept under names),
private bytes (read sessions) and public configuration. The `Context` holds
the store, the transport and the `git` runner. None of these is a result,
and the JSON renderer has no access to them: it renders a result value, and
a result value is built from receipts, reads and the public parts of the
configuration only. Specifically, no document ever contains:

- a signing key's secret, a read session's bytes, a read token's value, a
  provider credential, or the planned founding intent;
- the configuration directory's path, environment variables, or the
  transport's URL beyond `service`;
- the local bytes of `--file` or `--value` (the count and the digest the
  scope records are fine);
- a stack trace.

Two boundaries are deliberate and named:

- `invite` writes the invitation link, under `confidential`. It is the
  command's deliverable.
- `show` and `log` write history as the scope retains it. A scope's history
  is readable by whoever can read the scope, and `--json` neither widens nor
  narrows that: it does not sanitize history, and it does not claim to. An
  invitation entry in a membership history holds what the scope recorded
  (the invitation's digest and bounds), not the link's secret, which only
  the link carries. A consumer that redistributes history takes the same
  care it takes with the text of `show` today.

## 12. Verification matrix

Owners: the builder implements and runs; the checker reviews against the
exact head; the planner owns this note and the acceptance list. Each row is
an invariant with a witness, bounded, run in the ordinary test suite.

| # | Invariant | Witness | Commands |
|---|---|---|---|
| 1 | Text output is byte-equal to today's | the existing command tests, unchanged | all |
| 2 | One document on stdout, nothing on stderr from the command, for exit 0, 1 and 2 | a harness that captures both streams and parses stdout once | all |
| 3 | `exit` in the document equals the process exit code | same harness | all |
| 4 | Every text line is produced by `text(result)` from the same result that `json(result)` renders; no renderer reads the other's output | a test that renders both from one fixture result and compares to recorded text | all |
| 5 | Every status in a command's list is reachable and carries the declared `error` shape | one fixture per status per command, using the memory store and the test transport | all |
| 6 | Native structures are embedded unchanged: a receipt, entry or report in the document deep-equals the value the test transport answered | fixture comparison | `act`, `show`, `verify`, `issue *`, `merge` |
| 7 | No hash or identifier is shortened | a scan of the document for the fixture's full hashes | all |
| 8 | No secret appears: the fixture's key secrets, session bytes, read token and planned intent bytes are absent from the document (as bytes, base64 and hex) | a scan with the known fixture values | all, and `clone` in every status |
| 9 | `invite`'s link appears under `confidential` and nowhere else | key path assertion | `invite` |
| 10 | The acts catalog is a map keyed by kind, omits `guards`, `effects`, `sends`, `attention`, `settles`, `rules`, `items`, `receives`, `timed`, keeps every `fields` declaration whole, includes `also` and `presents` when nonempty, and has no `available` key | structural assertion on the application profile and the Counter definition | `acts` |
| 11 | `acts` writes two heads (scope and membership) and they are the heads the two reads returned | fixture with distinct heads | `acts` |
| 12 | A finished Counter lists `start` with no availability claim | Counter fixture at a finished state | `acts` |
| 13 | `refused` and `unknown` are distinct statuses with distinct shapes; a merge accepted then refused is `refused` with `recorded` | merge fixtures: refused at judgment, refused after acceptance, unobserved | `merge`, `act` |
| 14 | `partial` names the unconfirmed step and lists every recorded earlier fact | `edit` and `propose` fixtures that fail at each step | `edit`, `propose` |
| 15 | Child process output never reaches stdout | `clone` with a stand-in `git` that writes to both streams | `clone` |
| 16 | `--json` anywhere on the line, repeated, and with a usage error, gives one document | parser tests | parser |
| 17 | The document is compact and ends with one newline; keys are in declared order | byte assertion on a fixture | all |
| 18 | A version-1 document validates against a checked-in JSON Schema for the envelope and each result | schema file under `packages/cli/schema/`, validated in tests | all |
| 19 | The size of the `acts` document for the application profile is recorded and bounded (the C1 figure as the baseline, a generous ceiling, not a target) | a measurement test that prints the byte count and fails above the ceiling | `acts` |

Row 18 adds a checked-in schema as the machine-readable form of sections 5
to 7; this note stays the readable form, and the two are kept equal by row
18.

## 13. Remaining decisions

Stated here so the review can settle them; none is decided by this note.

1. **`inconsistent` for `verify`.** Section 7.11 adds a twelfth status so
   that an inconsistent report keeps exit 1 and still carries `result`. The
   alternative is `done` with exit 0 and `consistent: false`, which changes
   the exit code the text form has today. The note prefers the twelfth
   status; the review decides.
2. **A full catalog.** `acts --detail full` writing the native `ActType`
   whole, or no flag and `show` on the definition's retained bytes as the
   complete form. The note defers the flag.
3. **Streaming.** Whether `log` gains `--all` with a JSON-lines form. Not in
   version 1.
4. **An environment default.** Whether a variable can turn `--json` on. Not
   in version 1.
5. **The `confidential` wrapper.** Whether `invite`'s link sits under
   `confidential` or at the top level of `result`. The note prefers the
   wrapper.
6. **`recorded` on `done`.** Whether a `done` workflow document also lists
   its facts under `recorded` for uniformity, or only under `result`. The
   note puts them in `result` only.
7. **The schema's home.** `packages/cli/schema/` in the package, or
   `docs/`. The note prefers the package, published with it.

## 14. After the review

Implementation is filed as separate requests after this note is approved and
the demo constraint allows it, in this order, each with the rows of section
12 that it owns:

1. The typed results and the two renderers for the read-only commands:
   `acts`, `log`, `show`, `verify`, `verify --all`, `remote`, `issues`. Rows
   1 to 7, 10 to 12, 16 to 19.
2. The single-intent commands: `act`, `issue open`, `issue comment`, `issue
   assign`, `issue close`, `invite`, `join`, `install` in its three forms.
   Rows 8, 9, 13.
3. The workflows: `claim`, `edit`, `propose`, `merge`, `clone`. Rows 13 to
   15.
4. The CLI reference page gains a section on `--json` with one example per
   command, written from the recorded fixtures.

No step publishes a package, runs a live act or deploys. The text output
does not change in any step.
