# The MCP service

`dap mcp` serves a room to an agent host over the Model Context
Protocol (MCP). It is one server for every application the room holds. It
reads the room's definitions as data and derives one tool for each act
declaration, so an application it has never seen gets its tools the moment
the room holds it. The server signs with the key of the config directory it
runs in; nothing it serves grants authority. Each scope judges each act, and
the server reports that judgment as the scope gave it.

The server is the package `packages/mcp` (`@generalbusiness/dap-mcp`).
For one release, `artroom mcp` runs the same server through the command
line's `artroom` alias. `DAP_HOME` selects the config directory, with
`ARTROOM_HOME` retained as a compatible alias. The CLI and MCP server use
one resolved directory; conflicting variables refuse before either store
is accessed. [The CLI guide](cli.md) describes new defaults and discovery of
legacy custody. Plan 031 is its design; the
delivery note `notes/implementation/2026-10-13-mcp-generic-delivery.md` says what was built
and what ran.

## Connect an agent host

The server runs where the command line runs, with the same config
directory (`DAP_HOME`, or the legacy `ARTROOM_HOME`). Set the room up first
with `dap install` and `dap create`; or start the server with an empty config directory
and call its `join` tool with an invitation link, which records the room
there as `dap join` does. The link holds the invitation's secret.
`join`'s own result never repeats it. The join that membership admits
holds it, as its signed input, so a journal read of membership (`step`,
`record`) returns it to whoever may read that journal, as the native
record does for any member's session.

### Over stdio

The agent host starts the server as a child process and speaks MCP on its
standard input and output:

```
dap mcp
```

An agent host's configuration names the command and its arguments, for
example `{"command": "artroom", "args": ["mcp"]}`, with `DAP_HOME` in
its environment when the config directory is not the default one. Messages
are one JSON object per line. Diagnostics go to standard error.

### Over loopback HTTP

```
dap mcp --http 127.0.0.1:8765
```

The server binds a loopback address only (`127.0.0.1` or `::1`); it refuses
any other address. It prints its URL and a bearer token once, on standard
error:

```
dap mcp: serving http://127.0.0.1:8765/mcp; bearer (shown once): <token>
```

Give the agent host the URL and the header `Authorization: Bearer <token>`.
The server answers `401` to a request without that header, `403` to any
request that carries an `Origin` header (no browser page is a client of a
signing server), and `404` to any path but `/mcp`. A new process makes a
new token. Batches are not served.

The loopback server and the hosted endpoint validate every request the
same way, through one HTTP layer (`packages/mcp/src/http.ts`); the rules
are under "The hosted endpoint", below. In short: a 2026-07-28 request
carries `MCP-Protocol-Version: 2026-07-28` and `Mcp-Method`, and
`Mcp-Name` on `tools/call`; a 2025-11-25 request names its session; and a
`GET` or `DELETE` is served only under the 2025-11-25 header, where it
needs `Mcp-Session-Id` (`400` without it) and a live session (`404`
otherwise); with no header, or the 2026-07-28 header, it is `405` with
`Allow: POST`.

### Options

| Option | Effect |
|---|---|
| `--generic` | Lists the generic tools and the pair `actions` and `act` in place of the act tools. For an agent host that lists few tools. |
| `--generic=add` | Lists the act tools and the pair. |
| `--tools <names>` | Lists the act tools of these definition names only, separated by commas, such as `--tools issue,change`. The generic tools stay. |
| `--http <address>:<port>` | Serves loopback HTTP in place of stdio. |
| `--scope <scope> --membership <scope>` | Records a standalone scope in the config before serving, with the membership its standing is read from. The server lists its acts from then on. `--membership` is optional; without it the standing is unknown. An application the room's directory created needs no `--scope`: the server finds it. |

### The two wire revisions

The server serves two MCP revisions on both transports, and chooses per
request.

| | 2025-11-25 | 2026-07-28 |
|---|---|---|
| Start | `initialize`, then `notifications/initialized` | No handshake: each request carries `_meta` with `io.modelcontextprotocol/protocolVersion` and the client's capabilities; `server/discover` describes the server |
| Session over HTTP | `Mcp-Session-Id`, issued at `initialize`; `DELETE` ends it; an unknown session is answered `404` | None |
| List changes | `notifications/tools/list_changed` on the session's `GET` stream, or on stdio | A notification tagged with the subscription's ID on the stream of `subscriptions/listen`, for a client that opted in to `toolsListChanged` |
| `tools/list` | Paged | Paged, with `ttlMs` 30000 and `cacheScope` `private` |
| Results | Structured content, and the same JSON as text | The same, with `resultType: "complete"` |

A request with a version the server does not serve is answered with error
`-32022`, whose data names the versions it serves and the one asked.

A notification (a message with no ID) is never answered: over HTTP it gets
status 202 and no body, and on stdio nothing is written. A method that is
only a request, such as `tools/call`, `initialize` or `tools/list`, sent as
a notification, is not run and issues no session.

## What the server lists

The list has two parts.

- **The generic tools**, the same for every room: `room`, `inspect`,
  `create`, `join`, `prepare`, `items`, `steps`, `step`, `record`, `sends`, `text`,
  `wait`, `settle` and `credential`, and in `--generic` and
  `--generic=add` modes `actions` and `act`.
- **The act tools**, one for each act declaration of the definitions the
  room's scopes run, that the caller's role may sign or that a rule
  decides. Their names come from the words table below. A tool is bound to
  an exact declaration: its definition name, its native kind and the digest
  of the declaration. Two declarations that share a name and differ get two
  tools, each named `<name>@<8 hex>`, and neither keeps the plain name.

The room's scopes are found, not configured: the repository's platform
scopes (register, directory, membership, rules, destination and your
inbox), every lane the directory lists, and every application the
directory's application factory created, such as a Counter: an
`application` item of the directory in state `created`, whose `scope` names
the created scope. A lane and an application are both held under the
directory's membership, so the caller's role there decides their tools.
`room` lists the applications beside the lanes, with each one's definition
name, digest, scope and state. `room` reads the directory's live items
only: an application still being created is listed as `creating`, with no
scope and no tools; a creation that was refused or conflicted is final,
leaves the live items, and is not listed. A scope outside the
repository is added with `--scope`; a configured scope that is also one of
the directory's applications is held and listed once, as the application.

The list is a function of the room, the caller's standing and the launch
options, never of a connection. The server computes a generation from those
inputs. A change of the generation (an activation, a role change, a new
kind of lane, a new application, a scope recorded in the config) is told
once to each
subscribed client. An ordinary step, such as a comment, changes no
generation, and nothing is told. While a client is subscribed, the server
reads the generation's inputs every 30 seconds; with no subscriber, it
reads nothing.

A page of `tools/list` is at most 256 KiB, with a cursor to the next page.
A cursor of an earlier generation is refused, and the client lists again
from the start.

### Each act tool's description

A description is derived from the whole declaration: what the act does,
which action of the role it needs and whether the caller's role holds it,
each field with its type and bounds, and each guard as a sentence with its
name. A description is at most 1,000 characters. When the guards do not
fit, the description keeps whole sentences only and names the guards it
left out, by position and name, with a pointer to `inspect` with
`describe`, which returns the complete text.

Five worked examples, as `tools/list` sends them. The first three are
those of plan 031, section 4. The first is for a member of the demo room,
the third for an admin; the others are for a member who holds the action
named. The last two are acts of the Counter's definition,
`counting-commitments`.

`issue.comment`, the issue lane's `comment`:

> comment: opens a comment; needs issue.comment, which your role (member) holds. Fields: body (required): text up to 65536 bytes, kept apart from the entry: give the text itself, or its digest with the text in texts. replyTo: the ID of a comment item on this scope. mentions: a list of up to 16, each a member, as @handle. No guards.

`lane.take-hold`, the derivation fixture's `take-hold`:

> take-hold: opens a hold; needs hold, which your role (member) holds. Fields: commitment (required): the ID of a commitment item on this scope. Guards: the commitment is accepted; you are the commitment's performer; no hold is held where the hold's under equals the act's commitment.

`issue.create`, the directory's `open-issue`:

> open-issue: opens a lane; needs issue.open, which your role (admin) holds. Fields: definition (required): the digest of a value in the definition domain, up to 262144 bytes, with its bytes in values or read from the rules scope; choices from the rules scope: change sha256:d86c64ae0a570165660a6eb4d75153b8c2f59c9cdaec2ecc789e2c38524a17a2, issue sha256:82a938c8f54ddcac7974ca688ebea7d51c35d2aa70f4e3729965e9f915bc464e. title (required): text up to 256 bytes. body: text up to 65536 bytes, kept apart from the entry: give the text itself, or its digest with the text in texts. conditions (required): a list of up to 16, each text up to 4096 bytes. Guards: the definition is active in the rules scope, and its bytes and the definitions it names are at hand (not-activated, unsupported-definition).

`counting-commitments.participate`, the Counter's `participate`:

> participate: opens a participant; needs counting.participate, which your role (member) holds. Fields: none. Guards: no participant is inactive or active where the participant's agent equals you.

`counting-commitments.commit`, the Counter's `commit`, whose last guard is a
rule too long for the description:

> commit: opens a promise; needs counting.commit, which your role (member) holds. Fields: participant (required): the ID of a participant item on this scope. generation (required): a whole number from 0 to 1000000. serial (required): a whole number from 1 to 1000000. n (required): a whole number from 1 to 100. basis (required): a list of up to 16, each a record of id (required): the ID of a participant item on this scope; member (required): a member, as @handle. Guards: the board is open; the board's pledge is not set; no promise is pledged; the participant is active; you are the participant's agent; the p.id of each p in the act's basis are exactly the participant items that are active matched by the participant's agent equals p.member, in order; one of: [between 0 and 1 participants are active] or [you are not the board's lastSpeaker]. Guards 8 to 8 of 8 are left out; see inspect with describe: "commit".

### Each act tool's input

Every act tool takes the same controls at the top level, and the act's own
fields under `fields`, so a field named like a control never collides:

| Input | Meaning |
|---|---|
| `target` | The scope: its ID, or for a lane the issue or change number. A tool of a scope the room has once, such as membership, needs none. |
| `on` | The local ID of the item the act is on, for an act on an existing item. |
| `idempotencyKey` | Required. 1 to 128 bytes of UTF-8, chosen by the caller. One key is one meaning. |
| `resubmit` | Send a refused envelope again, deliberately. |
| `fields` | The act's fields, as the description lists them. A member is `@handle`. |
| `texts` | Detached texts, when a field gives a text's digest in place of the text. Only for acts with a detached text. |
| `presented` | The facts the act presents, by name. Only for acts that present one. |
| `values` | A value's bytes for a field that names a value in a byte domain, such as a definition. Only for such acts. When it is not given, the server reads the bytes from the rules scope. |

The result of an act tool is the scope's answer: `accepted` with the fact
and the sends it created, or `refused`, `unavailable` or `mismatch` with a
sentence that names the scope, the kind, the judged head and, for a named
guard, the guard's sentence, and a next step.

A field left out is left out of the intent: the scope applies the field's
declared default itself. The server reads the revisions of the items the
act names from the same fields with those defaults applied, and with a
fact of the target scope read as its entry's position, as the scope reads
it. So an item a default selects, or one a local fact selects, is expected
like one the caller named by its ID. The intent carries the fact as given.

An error the server finds itself (a shape, a target, custody, a read) is
`error`, `message` and `next`. A fragment of what the caller gave, such as
a target, a field's name, a key or a tool's name, is repeated in the
message for at most 128 characters, then an ellipsis and its length. The
whole error result is at most 2 KiB, the smallest tool bound; if the
message would pass it, only the message is cut, and says so. `error` and
`next` stay whole: every next step the server writes is bounded. Only if
a next step alone passed the bound would it be cut too, with its length.

### Custody

The server keeps each signed envelope before it sends it, under the
caller's `idempotencyKey`, in the config directory's
`private/mcp-custody/`, readable only by its owner.

- **A lost reply** leaves the record unknown. The same call with the same
  key sends the same bytes again; `settle` reads the scope's settlement.
  Neither signs a second intent.
- **Another meaning under a used key** is refused before anything is
  signed.
- **The outcome** given is always the newest decisive one of the current
  attempt: an answer other than unavailable, or a receipt that settlement
  found. A record that was lost, then unavailable, then settled answers `accepted`.
- **Terminal records.** `accepted` and `mismatch` records are never sent again, even
  with `resubmit: true`. A refusal is kept; `resubmit: true` first keeps a
  new attempt, unresolved, with the refusal as history, and then sends the
  same envelope. A lost reply to it leaves the record unresolved, and
  `settle` asks the scope.
- **Capacity.** At most 256 records may be unresolved at once, admitted
  under a lease that every process sharing the directory takes, so two
  processes cannot both admit the 256th. A resubmitted refusal is admitted
  the same way: it becomes unresolved under the lease, and a full store
  keeps the refusal as it was. Nothing unresolved is evicted.
- **Size.** A record is at most 2 MiB. An act whose fields, texts,
  presented facts and values would not fit with room for its outcomes is
  refused as full, for bytes, before it is signed. A record keeps up to 64
  outcomes inline; older ones, or ones that would push it past 2 MiB, move
  to a segment file beside it, which keeps every one and is read in bounded
  slices. The decisive outcome is searched inline first, then in the
  segment one slice of 64 at a time, newest first, stopping at the decisive
  outcome or at the start of the current attempt.
- **Preparation steps** are kept apart from the act. A step keeps its first
  answer and its latest 63; the answers between them are not kept. The act's
  outcomes are never dropped.
- **Archives.** Terminal records move to archive files of at most 64 MiB,
  with an index, in one transaction under an archive lease: the archive file
  is written whole and renamed into place, then the index, and only then are
  the live records removed. A record whose lock another process holds is
  skipped. A crash at any point loses no record.
- **Locks.** A lock or lease is broken only when the process that took it
  is gone, whatever its time; the passing of an intent's deadline is never
  an outcome. One process at a time breaks it, under a reclaim lock, after
  reading it again; a release removes only the releaser's own holding.
  A reclaim lock is never broken: if the process holding it died, every
  call that needs that lock is refused as `locked` until an operator
  removes the reclaim file after all processes using this config directory
  have stopped.
  The refusal's next step names the file once, whole, relative to
  the selected config directory (for example
  `private/mcp-custody/capacity.lease.reclaim`), so its length does not
  depend on the home's. Archival reads each record again under its lock and
  skips one that is no longer terminal.
  If a recorded PID has been reused by another user's process, a process
  check can return `EPERM` (permission denied). The server treats that as
  alive and leaves the lock in place; `blockedBy` can return no reclaim
  path even when an old file blocks recovery. A deadline or an old file
  time does not establish that the lock is safe to remove.

  To recover, stop every process using the selected config directory.
  Identify the exact lock or lease under `private/mcp-custody` and verify
  that its original holder is gone, no process uses this store, and the
  file still contains the same holding. Have an administrator check
  process ownership if permission prevents that check. Once those facts
  are established, remove only the verified stale lock or reclaim file.
  Keep the records, segments, archives and their indexes. Restart the
  server and check the retained original request. If ownership or a
  stopped store cannot be verified, leave the lock in place.
- **Steps with no act.** `prepare` without `kind` sends a capability step
  that has no act, such as hold@1's instance: the step's own intent, kept
  under custody under the caller's key, with its answers kept as the step's.
  Such a record is never an act that took effect. A decisive answer is kept, and
  the same call returns it again without sending; a lost or unavailable
  answer leaves the record unresolved, and the same call sends the exact
  step again. When every step of the record has a decisive answer, the
  record is `settled`: terminal, archivable, and no longer counted against
  the 256. `settle` answers `settled` for it.
- **Names.** A capability or step name longer than 128 bytes is refused
  whole, before anything is kept or sent.

## Tool reference

### The generic tools

These are the generic tools as `tools/list` sends them in
`--generic=add` mode: each name, description, input schema and
annotations. In the default mode, `actions` and `act` are not listed.

### `room`

Orientation. The service, your key, the scopes of the room by name, the issues and changes the directory lists, the applications its factory created (such as a Counter), the standalone scopes, your standing on each membership, the active definitions, and the act tools your role does not hold; paged by bytes, with a cursor. Start here.

```json
{
  "inputSchema": {
    "type": "object",
    "properties": {
      "cursor": {
        "type": "string"
      }
    },
    "required": [],
    "additionalProperties": false
  },
  "annotations": {
    "readOnlyHint": true,
    "destructiveHint": false,
    "idempotentHint": true,
    "openWorldHint": false
  }
}
```

### `inspect`

One scope: its definition and digest, status, head, counts by item type and state, and its live items, paged by bytes at its head. With declaration: true, the definition's bytes, paged. With describe: <kind>, the complete derived text of one act, for an act whose tool description points here.

```json
{
  "inputSchema": {
    "type": "object",
    "properties": {
      "scope": {
        "type": [
          "string",
          "integer"
        ],
        "description": "A scope ID; one of register, directory, membership, rules, destination, inbox; or an issue or change number."
      },
      "declaration": {
        "type": "boolean"
      },
      "describe": {
        "type": "string"
      },
      "cursor": {
        "type": "string"
      },
      "offset": {
        "type": "integer",
        "minimum": 0
      }
    },
    "required": [
      "scope"
    ],
    "additionalProperties": false
  },
  "annotations": {
    "readOnlyHint": true,
    "destructiveHint": false,
    "idempotentHint": true,
    "openWorldHint": false
  }
}
```

### `create`

Creates a scope with no existing target, and records it in your configuration so later connections list its tools. definition: a platform name such as platform:register@3, a definition's JSON, or its digest; kind: the definition's genesis act; fields; texts and definitions beside it; membership: the membership scope standing for the new scope is read from. Kept under custody like an act: the idempotencyKey is required.

```json
{
  "inputSchema": {
    "type": "object",
    "properties": {
      "definition": {
        "type": [
          "string",
          "object"
        ]
      },
      "kind": {
        "type": "string"
      },
      "fields": {
        "type": "object"
      },
      "texts": {
        "type": "array",
        "items": {
          "type": "string"
        }
      },
      "definitions": {
        "type": "array",
        "items": {
          "type": "object"
        }
      },
      "membership": {
        "type": [
          "string",
          "object"
        ]
      },
      "idempotencyKey": {
        "type": "string",
        "minLength": 1,
        "maxLength": 128,
        "description": "Your key for this one meaning, 1 to 128 bytes. Keep it."
      },
      "resubmit": {
        "type": "boolean"
      }
    },
    "required": [
      "definition",
      "kind",
      "idempotencyKey"
    ],
    "additionalProperties": false
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "answer": {
        "type": "string",
        "description": "accepted, refused, unavailable, mismatch, or unknown when the reply was lost"
      },
      "sentence": {
        "type": "string"
      },
      "next": {
        "type": "string"
      },
      "scope": {
        "type": "string"
      },
      "kind": {
        "type": "string"
      },
      "tool": {
        "type": "string"
      },
      "fact": {
        "type": "object"
      },
      "outboxIds": {
        "type": "array",
        "items": {
          "type": "string"
        }
      },
      "reason": {
        "type": "string"
      },
      "name": {
        "type": "string"
      },
      "judgedAt": {
        "type": "object"
      },
      "retained": {
        "type": "boolean",
        "description": "true when this is a terminal outcome kept under custody, and nothing was sent"
      }
    },
    "required": [
      "answer",
      "sentence",
      "next"
    ]
  },
  "annotations": {
    "readOnlyHint": false,
    "destructiveHint": true,
    "idempotentHint": true,
    "openWorldHint": false
  }
}
```

### `join`

Joins a room with an invitation link from dap invite (artroom-invite:...), as dap join does: signs membership's join with this server's key, keeps the exact request under custody before sending it, and on acceptance records the room in your configuration, so its tools are listed. After a lost reply, call again with the same link and idempotencyKey: the same request is sent again, never a new one. The link is private: this tool's result never repeats it. Legacy membership records the invitation secret in the join entry, visible through authorized history reads. The invitation-key cohort records a proof bound to this membership, invitation and joining key; its private invitation seed stays out of the entry.

```json
{
  "inputSchema": {
    "type": "object",
    "properties": {
      "link": {
        "type": "string",
        "description": "The invitation link, artroom-invite:..."
      },
      "idempotencyKey": {
        "type": "string",
        "minLength": 1,
        "maxLength": 128,
        "description": "Your key for this one meaning, 1 to 128 bytes. Keep it."
      }
    },
    "required": [
      "link",
      "idempotencyKey"
    ],
    "additionalProperties": false
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "answer": {
        "type": "string",
        "description": "accepted, refused, unavailable, mismatch, or unknown when the reply was lost"
      },
      "sentence": {
        "type": "string"
      },
      "next": {
        "type": "string"
      },
      "scope": {
        "type": "string"
      },
      "kind": {
        "type": "string"
      },
      "tool": {
        "type": "string"
      },
      "fact": {
        "type": "object"
      },
      "outboxIds": {
        "type": "array",
        "items": {
          "type": "string"
        }
      },
      "reason": {
        "type": "string"
      },
      "name": {
        "type": "string"
      },
      "judgedAt": {
        "type": "object"
      },
      "retained": {
        "type": "boolean",
        "description": "true when this is a terminal outcome kept under custody, and nothing was sent"
      }
    },
    "required": [
      "answer",
      "sentence",
      "next"
    ]
  },
  "annotations": {
    "readOnlyHint": false,
    "destructiveHint": true,
    "idempotentHint": true,
    "openWorldHint": false
  }
}
```

### `prepare`

Asks the scope that owns a resource for one step of a capability. With kind: for the intent an act will submit later under the same idempotencyKey; resource: the scope asked, which may differ from target; then the act's own target, kind, on, fields, texts, presented and values. Without kind: a step with no act, such as hold@1's instance, whose own intent (kind capability:step, with fields) goes to the resource. Returns the resource's answer for that step, never an act's receipt.

```json
{
  "inputSchema": {
    "type": "object",
    "properties": {
      "resource": {
        "type": [
          "string",
          "integer"
        ],
        "description": "A scope ID; one of register, directory, membership, rules, destination, inbox; or an issue or change number."
      },
      "capability": {
        "type": "string"
      },
      "step": {
        "type": "string"
      },
      "target": {
        "type": [
          "string",
          "integer"
        ],
        "description": "A scope ID; one of register, directory, membership, rules, destination, inbox; or an issue or change number."
      },
      "kind": {
        "type": "string"
      },
      "on": {
        "type": "integer",
        "minimum": 0
      },
      "fields": {
        "type": "object"
      },
      "texts": {
        "type": "array",
        "items": {
          "type": "string"
        }
      },
      "presented": {
        "type": "object"
      },
      "values": {
        "type": "array",
        "items": {
          "type": "string"
        }
      },
      "idempotencyKey": {
        "type": "string",
        "minLength": 1,
        "maxLength": 128,
        "description": "Your key for this one meaning, 1 to 128 bytes. Keep it."
      }
    },
    "required": [
      "resource",
      "capability",
      "step",
      "idempotencyKey"
    ],
    "additionalProperties": false
  },
  "annotations": {
    "readOnlyHint": false,
    "destructiveHint": true,
    "idempotentHint": true,
    "openWorldHint": false
  }
}
```

### `items`

A page of one item type of a scope, in one of two traversals, each with its own cursor: the live items, from the scope's summary (the default); or, with final: true, the retained final items. The cursor is not checked against its traversal: to continue, call again with the same scope, type and final flag.

```json
{
  "inputSchema": {
    "type": "object",
    "properties": {
      "scope": {
        "type": [
          "string",
          "integer"
        ],
        "description": "A scope ID; one of register, directory, membership, rules, destination, inbox; or an issue or change number."
      },
      "type": {
        "type": "string"
      },
      "final": {
        "type": "boolean",
        "description": "true: the traversal of the retained final items, separate from the live one; the default is the live items"
      },
      "cursor": {
        "type": "string"
      }
    },
    "required": [
      "scope",
      "type"
    ],
    "additionalProperties": false
  },
  "annotations": {
    "readOnlyHint": true,
    "destructiveHint": false,
    "idempotentHint": true,
    "openWorldHint": false
  }
}
```

### `steps`

A page of a scope's entries, oldest first, one line each: seq, time, kind, signer, effects and sends counts.

```json
{
  "inputSchema": {
    "type": "object",
    "properties": {
      "scope": {
        "type": [
          "string",
          "integer"
        ],
        "description": "A scope ID; one of register, directory, membership, rules, destination, inbox; or an issue or change number."
      },
      "cursor": {
        "type": "string"
      }
    },
    "required": [
      "scope"
    ],
    "additionalProperties": false
  },
  "annotations": {
    "readOnlyHint": true,
    "destructiveHint": false,
    "idempotentHint": true,
    "openWorldHint": false
  }
}
```

### `step`

One entry in full: its input, fields, effects, sends and hash, paged by bytes with offset. A detached text's digest resolves with text.

```json
{
  "inputSchema": {
    "type": "object",
    "properties": {
      "scope": {
        "type": [
          "string",
          "integer"
        ],
        "description": "A scope ID; one of register, directory, membership, rules, destination, inbox; or an issue or change number."
      },
      "seq": {
        "type": "integer",
        "minimum": 0
      },
      "offset": {
        "type": "integer",
        "minimum": 0
      }
    },
    "required": [
      "scope",
      "seq"
    ],
    "additionalProperties": false
  },
  "annotations": {
    "readOnlyHint": true,
    "destructiveHint": false,
    "idempotentHint": true,
    "openWorldHint": false
  }
}
```

### `record`

A page of the history as stored: each entry's canonical bytes and hash, for a verifier or an exact comparison.

```json
{
  "inputSchema": {
    "type": "object",
    "properties": {
      "scope": {
        "type": [
          "string",
          "integer"
        ],
        "description": "A scope ID; one of register, directory, membership, rules, destination, inbox; or an issue or change number."
      },
      "cursor": {
        "type": "string"
      }
    },
    "required": [
      "scope"
    ],
    "additionalProperties": false
  },
  "annotations": {
    "readOnlyHint": true,
    "destructiveHint": false,
    "idempotentHint": true,
    "openWorldHint": false
  }
}
```

### `sends`

A page of a scope's sends with their attempts and results; or, with outboxId (seq.n, as a receipt lists it), the status of that one send.

```json
{
  "inputSchema": {
    "type": "object",
    "properties": {
      "scope": {
        "type": [
          "string",
          "integer"
        ],
        "description": "A scope ID; one of register, directory, membership, rules, destination, inbox; or an issue or change number."
      },
      "outboxId": {
        "type": "string"
      },
      "cursor": {
        "type": "string"
      }
    },
    "required": [
      "scope"
    ],
    "additionalProperties": false
  },
  "annotations": {
    "readOnlyHint": true,
    "destructiveHint": false,
    "idempotentHint": true,
    "openWorldHint": false
  }
}
```

### `text`

A retained input by scope, kind and digest: a definition, a foreign entry, a rule's input, a detached text, a snapshot, or a value in its byte domain; paged by bytes with offset.

```json
{
  "inputSchema": {
    "type": "object",
    "properties": {
      "scope": {
        "type": [
          "string",
          "integer"
        ],
        "description": "A scope ID; one of register, directory, membership, rules, destination, inbox; or an issue or change number."
      },
      "kind": {
        "enum": [
          "definition",
          "entry",
          "rule",
          "text",
          "snapshot",
          "value"
        ]
      },
      "digest": {
        "type": "string"
      },
      "domain": {
        "type": "string"
      },
      "offset": {
        "type": "integer",
        "minimum": 0
      }
    },
    "required": [
      "scope",
      "kind",
      "digest"
    ],
    "additionalProperties": false
  },
  "annotations": {
    "readOnlyHint": true,
    "destructiveHint": false,
    "idempotentHint": true,
    "openWorldHint": false
  }
}
```

### `wait`

Waits at most 60 seconds until one of: a scope's head reaches seq; an item reaches one of states; the scopes an entry created (entry) and the scopes their genesis created exist and are active; a send (outboxId) has a result. Returns what it saw and whether it timed out. Never writes.

```json
{
  "inputSchema": {
    "type": "object",
    "properties": {
      "scope": {
        "type": [
          "string",
          "integer"
        ],
        "description": "A scope ID; one of register, directory, membership, rules, destination, inbox; or an issue or change number."
      },
      "seq": {
        "type": "integer",
        "minimum": 0
      },
      "item": {
        "type": "integer",
        "minimum": 0
      },
      "type": {
        "type": "string",
        "description": "the item's type; with item, a final item is found among the retained ones"
      },
      "states": {
        "type": "array",
        "items": {
          "type": "string"
        }
      },
      "entry": {
        "type": "integer",
        "minimum": 0
      },
      "outboxId": {
        "type": "string"
      },
      "seconds": {
        "type": "integer",
        "minimum": 1,
        "maximum": 60
      }
    },
    "required": [
      "scope"
    ],
    "additionalProperties": false
  },
  "annotations": {
    "readOnlyHint": true,
    "destructiveHint": false,
    "idempotentHint": true,
    "openWorldHint": false
  }
}
```

### `settle`

What is known about the envelope under idempotencyKey on target (or the creation of definition): the act's phase and kept outcome, the scope's settlement for an act that is not final, and each preparation step apart. Signs nothing and sends no act.

```json
{
  "inputSchema": {
    "type": "object",
    "properties": {
      "target": {
        "type": [
          "string",
          "integer"
        ],
        "description": "A scope ID; one of register, directory, membership, rules, destination, inbox; or an issue or change number."
      },
      "definition": {
        "type": [
          "string",
          "object"
        ]
      },
      "idempotencyKey": {
        "type": "string",
        "minLength": 1,
        "maxLength": 128,
        "description": "Your key for this one meaning, 1 to 128 bytes. Keep it."
      },
      "cursor": {
        "type": "string"
      }
    },
    "required": [
      "idempotencyKey"
    ],
    "additionalProperties": false
  },
  "annotations": {
    "readOnlyHint": true,
    "destructiveHint": false,
    "idempotentHint": true,
    "openWorldHint": false
  }
}
```

### `credential`

The one-time read credential for a read-token act your key signed (entry: its seq at the destination), read once from the destination's credential route with your session. Its result is a secret: the credential is in the structured field credential only, with the remote URL beside it. Use it with Git; it is not kept here.

```json
{
  "inputSchema": {
    "type": "object",
    "properties": {
      "entry": {
        "type": "integer",
        "minimum": 1
      },
      "target": {
        "type": [
          "string",
          "integer"
        ],
        "description": "A scope ID; one of register, directory, membership, rules, destination, inbox; or an issue or change number."
      }
    },
    "required": [
      "entry"
    ],
    "additionalProperties": false
  },
  "annotations": {
    "readOnlyHint": true,
    "destructiveHint": false,
    "idempotentHint": false,
    "openWorldHint": false
  }
}
```

### `actions`

The acts of one scope, as act tools would describe them: each kind with its derived description, input schema, binding and the definition digest to give to act. For a host that lists few tools.

```json
{
  "inputSchema": {
    "type": "object",
    "properties": {
      "scope": {
        "type": [
          "string",
          "integer"
        ],
        "description": "A scope ID; one of register, directory, membership, rules, destination, inbox; or an issue or change number."
      },
      "cursor": {
        "type": "string"
      }
    },
    "required": [
      "scope"
    ],
    "additionalProperties": false
  },
  "annotations": {
    "readOnlyHint": true,
    "destructiveHint": false,
    "idempotentHint": true,
    "openWorldHint": false
  }
}
```

### `act`

Signs one act of a scope by its native kind, under the same custody and binding checks as an act tool. digest: the definition digest actions gave; fields as actions describes; idempotencyKey required.

```json
{
  "inputSchema": {
    "type": "object",
    "properties": {
      "target": {
        "type": [
          "string",
          "integer"
        ],
        "description": "A scope ID; one of register, directory, membership, rules, destination, inbox; or an issue or change number."
      },
      "kind": {
        "type": "string"
      },
      "digest": {
        "type": "string"
      },
      "on": {
        "type": "integer",
        "minimum": 0
      },
      "fields": {
        "type": "object"
      },
      "texts": {
        "type": "array",
        "items": {
          "type": "string"
        }
      },
      "presented": {
        "type": "object"
      },
      "values": {
        "type": "array",
        "items": {
          "type": "string"
        }
      },
      "idempotencyKey": {
        "type": "string",
        "minLength": 1,
        "maxLength": 128,
        "description": "Your key for this one meaning, 1 to 128 bytes. Keep it."
      },
      "resubmit": {
        "type": "boolean"
      }
    },
    "required": [
      "target",
      "kind",
      "digest",
      "idempotencyKey"
    ],
    "additionalProperties": false
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "answer": {
        "type": "string",
        "description": "accepted, refused, unavailable, mismatch, or unknown when the reply was lost"
      },
      "sentence": {
        "type": "string"
      },
      "next": {
        "type": "string"
      },
      "scope": {
        "type": "string"
      },
      "kind": {
        "type": "string"
      },
      "tool": {
        "type": "string"
      },
      "fact": {
        "type": "object"
      },
      "outboxIds": {
        "type": "array",
        "items": {
          "type": "string"
        }
      },
      "reason": {
        "type": "string"
      },
      "name": {
        "type": "string"
      },
      "judgedAt": {
        "type": "object"
      },
      "retained": {
        "type": "boolean",
        "description": "true when this is a terminal outcome kept under custody, and nothing was sent"
      }
    },
    "required": [
      "answer",
      "sentence",
      "next"
    ]
  },
  "annotations": {
    "readOnlyHint": false,
    "destructiveHint": true,
    "idempotentHint": true,
    "openWorldHint": false
  }
}
```

### The act tools of the demo room

The act tools that `tools/list` sends to an admin of the demo room: the six
platform scopes on the default cohort, an issue lane under `issue-demo` and
a change lane under `change-demo`. Each description is as sent. The whole
list, with every input and output schema, is `docs/mcp-tools.json`; a test
derives it again and compares.

| Tool | Act | Description as sent |
|---|---|---|
| `change.ask-rules` | change `ask-rules` | ask-rules: moves a proposal; needs change.propose, which your role (admin) holds. Fields: none. No guards. |
| `change.cancel-merge` | change `cancel-merge` | cancel-merge: moves a merge; needs change.merge, which your role (admin) holds; from intended. Fields: none. Guards: this merge is intended; this merge's withdrawal is not set. |
| `change.close-own` | change `close-own` | close-own: moves a proposal; needs change.edit-own, which your role (admin) holds; from draft or open, to closed. Fields: none. Guards: this proposal is draft or open; no merge is intended, committed or unknown (merge-in-progress); you are this proposal's author. |
| `change.comment` | change `comment` | comment: opens a comment; needs change.comment, which your role (admin) holds. Fields: body (required): text up to 65536 bytes, kept apart from the entry: give the text itself, or its digest with the text in texts. replyTo: the ID of a comment item on this scope. thread: the ID of a thread item on this scope. mentions: a list of up to 16, each a member, as @handle. No guards. |
| `change.create` | platform:directory `open-pr` | open-pr: opens a lane; needs change.open, which your role (admin) holds. Fields: definition (required): the digest of a value in the definition domain, up to 262144 bytes, with its bytes in values or read from the rules scope; choices from the rules scope: change sha256:d86c64ae0a570165660a6eb4d75153b8c2f59c9cdaec2ecc789e2c38524a17a2, issue sha256:82a938c8f54ddcac7974ca688ebea7d51c35d2aa70f4e3729965e9f915bc464e. title (required): text up to 256 bytes. body: text up to 65536 bytes, kept apart from the entry: give the text itself, or its digest with the text in texts. draft (required): true or false. Guards: the repository's destination is set; the repository's rules is set; the definition is active in the rules scope, and its bytes and the definitions it names are at hand (not-activated, unsupported-definition). |
| `change.edit-own` | change `edit-own` | edit-own: moves a proposal; needs change.edit-own, which your role (admin) holds; from draft, open or closed. Fields: title: text up to 256 bytes. body: text up to 65536 bytes, kept apart from the entry: give the text itself, or its digest with the text in texts. labels: a list of up to 20, each text up to 64 bytes. Guards: this proposal is draft, open or closed; you are this proposal's author. |
| `change.link-own` | change `link-own` | link-own: opens a link; needs change.edit-own, which your role (admin) holds. Fields: issue (required): a reference to a lane scope, as { scope, inc, kind }. how (required): one of keyword, manual. Guards: no merge is intended, committed or unknown (merge-in-progress); the proposal is draft, open or closed; no link is set where the link's issue equals the act's issue (already-linked); you are the proposal's author. |
| `change.merge` | change `merge` | merge: opens a merge; needs change.merge, which your role (admin) holds. Fields: manifest (required): the ID of a manifest item on this scope. reports (required): a list of up to 32, each an entry of kind report under issue, as { at, seq, hash }. Guards: the proposal is open (draft); the manifest is current (newer-version); the manifest's complete equals true (not-complete); no merge is intended, committed or unknown (merge-in-progress); the rules' revision differs from nothing (rules-unknown); at least the rules' approvals reviews are submitted where the review's verdict equals "approve" and the review's manifest equals the manifest (approvals-needed); no review is submitted where the review's verdict equals "request-changes" and the review's manifest equals the manifest (changes-requested). Guards 8 to 10 of 10 are left out (named: required-check-not-passed, reports-not-selected); see inspect with describe: "merge". |
| `change.offer` | change `offer` | offer: opens a commitment; needs change.request, which your role (admin) holds. Fields: offeree: a member, as @handle. terms (required): text up to 4096 bytes. Guards: the proposal is draft or open. |
| `change.propose-file` | change `propose-file` | propose-file: opens a manifest; needs change.propose, which your role (admin) holds. Fields: base (required): a Git commit ID, 40 or 64 hex characters. path (required): text up to 1024 bytes. digest (required): a digest, sha256: and 64 hex characters. size (required): a whole number from 0 to 65536. content (required): text up to 65536 bytes. Guards: the proposal is draft or open; you are the proposal's author; no merge is intended, committed or unknown (merge-in-progress); no manifest is current or superseded (one-version). |
| `change.propose-version` | change `propose-manifest` | propose-manifest: opens a manifest; needs change.propose, which your role (admin) holds. Fields: in the input schema. Presented facts: in the input schema. Guards: the proposal is draft or open; no merge is intended, committed or unknown (merge-in-progress); no manifest is current, except the previous (not-the-current-version); the previous is current; one of: [the act's hold differs from nothing; the act's lane equals nothing; the act's foreignHold equals nothing; the presented pin equals nothing] or [the act's hold equals nothing; the act's lane differs from nothing; the act's foreignHold differs from nothing; the presented pin differs from nothing] (source-shape); you are the hold's holder; the hold is held or ended; the commitment is accepted; you are the commitment's performer. Guards 10 to 24 of 24 are left out (named: pin-mismatch, selection-malformed, plan-not-of-goal, decision-without-plan, not-complete); see inspect with describe: "propose-manifest". |
| `change.ready-own` | change `ready-own` | ready-own: moves a proposal; needs change.edit-own, which your role (admin) holds; from draft, to open. Fields: none. Guards: this proposal is draft; you are this proposal's author. |
| `change.release` | change `release-hold` | release-hold: moves a hold; needs change.work, which your role (admin) holds; from held. Fields: none. Guards: this hold is held; you are this hold's holder. |
| `change.request-check` | change `request-check` | request-check: opens a job; needs change.propose, which your role (admin) holds. Fields: manifest (required): the ID of a manifest item on this scope. earlier: the ID of a job item on this scope. name (required): text up to 128 bytes. configuration (required): a digest, sha256: and 64 hex characters. Guards: the manifest is current; no merge is intended, committed or unknown (merge-in-progress); the earlier's manifest equals the manifest; the earlier's name equals the act's name; the earlier is requested, passed, failed, errored or timed-out; no job is requested, passed, failed, errored or timed-out where the job's manifest equals the manifest and the job's name equals the act's name, except the earlier (job-exists); some k in the rules' checks where k.name equals the act's name and k.configuration equals the act's configuration (not-a-check-of-the-rules). |
| `change.request-review` | change `request-review-own` | request-review-own: opens a review-request; needs change.edit-own, which your role (admin) holds. Fields: requested (required): a member, as @handle. Guards: the proposal is draft or open; you are the proposal's author. |
| `change.review` | change `review-verdict` | review-verdict: opens a review; needs change.review, which your role (admin) holds. Fields: manifest (required): the ID of a manifest item on this scope. earlier: the ID of a review item on this scope. request: the ID of a review-request item on this scope. verdict (required): one of approve, request-changes. body: text up to 65536 bytes, kept apart from the entry: give the text itself, or its digest with the text in texts. extent: text up to 64 bytes. Guards: the manifest is current; no merge is intended, committed or unknown (merge-in-progress); neither you nor your principal is the manifest's authors (author-cannot-review); you are the earlier's reviewer; the earlier's manifest equals the manifest; the earlier is submitted; you are the request's requested; the request is open; no review is submitted where the review's manifest equals the manifest and the review's reviewer equals you, except the earlier (verdict-exists). |
| `change.take` | change `accept` | accept: moves a commitment; needs change.promise, which your role (admin) holds; from offered, to accepted. Fields: terms (required): an entry of kind offer under change, as { at, seq, hash }. Guards: this commitment is offered; one of: [this commitment's offeree is not set] or [you are this commitment's offeree] (not-offeree); the act's terms equals this commitment's termsAt (terms-differ). |
| `change.work` | change `take-hold` | take-hold: opens a hold; needs change.work, which your role (admin) holds. Fields: commitment (required): the ID of a commitment item on this scope. extent: text up to 1024 bytes. Guards: the proposal is draft or open; the commitment is accepted; you are the commitment's performer; no hold is held where the hold's under equals the commitment (hold-held). |
| `inbox.dismiss` | platform:inbox `dismiss` | dismiss: moves a notice; needs inbox.own, which your role (admin) holds; from unread or read, to dismissed. Fields: none. Guards: you are the inbox's owner; this notice is unread or read. |
| `inbox.mark-read` | platform:inbox `mark-read` | mark-read: moves a notice; needs inbox.own, which your role (admin) holds; from unread, to read. Fields: none. Guards: you are the inbox's owner; this notice is unread. |
| `issue.accept` | issue `accept-report` | accept-report: moves a report; needs issue.request, which your role (admin) holds; from reported, to accepted. Fields: commitment (required): the ID of a commitment item on this scope. terms (required): an entry of kind file, revise or propose-terms under issue, as { at, seq, hash }. Guards: this report is reported; this report's under equals the commitment (not-this-commitment); you are the commitment's requester; neither you nor your principal is this report's authors; this report's termsAt equals the commitment's termsAt (terms-differ); the act's terms equals this report's termsAt (terms-differ). |
| `issue.assign` | issue `assign` | assign: moves an intent; needs issue.triage, which your role (admin) holds. Fields: assignees (required): a list of up to 10, each a member, as @handle. No guards. |
| `issue.close-any` | issue `close-any` | close-any: moves an intent; needs issue.triage, which your role (admin) holds; from open, to closed. Fields: reason: one of completed, not-planned. Guards: this intent is open. |
| `issue.close-own` | issue `close-own` | close-own: moves an intent; needs issue.close-own, which your role (admin) holds; from open, to closed. Fields: reason: one of completed, not-planned. Guards: this intent is open; you are this intent's requester. |
| `issue.comment` | issue `comment` | comment: opens a comment; needs issue.comment, which your role (admin) holds. Fields: body (required): text up to 65536 bytes, kept apart from the entry: give the text itself, or its digest with the text in texts. replyTo: the ID of a comment item on this scope. mentions: a list of up to 16, each a member, as @handle. No guards. |
| `issue.create` | platform:directory `open-issue` | open-issue: opens a lane; needs issue.open, which your role (admin) holds. Fields: definition (required): the digest of a value in the definition domain, up to 262144 bytes, with its bytes in values or read from the rules scope; choices from the rules scope: change sha256:d86c64ae0a570165660a6eb4d75153b8c2f59c9cdaec2ecc789e2c38524a17a2, issue sha256:82a938c8f54ddcac7974ca688ebea7d51c35d2aa70f4e3729965e9f915bc464e. title (required): text up to 256 bytes. body: text up to 65536 bytes, kept apart from the entry: give the text itself, or its digest with the text in texts. conditions (required): a list of up to 16, each text up to 4096 bytes. Guards: the definition is active in the rules scope, and its bytes and the definitions it names are at hand (not-activated, unsupported-definition). |
| `issue.edit-own` | issue `edit-own` | edit-own: moves an intent; needs issue.edit-own, which your role (admin) holds. Fields: title: text up to 256 bytes. body: text up to 65536 bytes, kept apart from the entry: give the text itself, or its digest with the text in texts. Guards: you are this intent's requester. |
| `issue.hand-in` | issue `report` | report: opens a report; needs issue.work, which your role (admin) holds. Fields: commitment (required): the ID of a commitment item on this scope. terms (required): an entry of kind file, revise or propose-terms under issue, as { at, seq, hash }. commit (required): a Git commit ID, 40 or 64 hex characters. tree (required): a Git tree ID, 40 or 64 hex characters. claims: a list of up to 32, each text up to 1024 bytes. evidence: a list of up to 32, each a digest, sha256: and 64 hex characters. summary: text up to 65536 bytes, kept apart from the entry: give the text itself, or its digest with the text in texts. Guards: the commitment is accepted; you are the commitment's performer; the act's terms equals the commitment's termsAt (terms-differ); hold's rule staged holds, with commit the act's commit and under the commitment; git-read's rule ancestry holds, with commit the act's commit and row "report". |
| `issue.offer` | issue `offer` | offer: opens a commitment; needs issue.request, which your role (admin) holds. Fields: offeree: a member, as @handle. Guards: the goal is open. |
| `issue.reopen-own` | issue `reopen-own` | reopen-own: moves an intent; needs issue.close-own, which your role (admin) holds; from closed, to open. Fields: none. Guards: this intent is closed; you are this intent's requester. |
| `issue.take` | issue `accept` | accept: moves a commitment; needs issue.promise, which your role (admin) holds; from offered, to accepted. Fields: terms (required): an entry of kind file, revise or propose-terms under issue, as { at, seq, hash }. Guards: this commitment is offered; one of: [this commitment's offeree is not set] or [you are this commitment's offeree] (not-offeree); the act's terms equals this commitment's termsAt (terms-differ). |
| `issue.work` | issue `take-hold` | take-hold: opens a hold; needs issue.work, which your role (admin) holds. Fields: commitment (required): the ID of a commitment item on this scope. extent: text up to 1024 bytes. Guards: the commitment is accepted; you are the commitment's performer; no hold is held where the hold's under equals the commitment (hold-held). |
| `key.invite` | platform:membership `invite-key` | invite-key: opens a key; the rule recovery-key decides who may sign, or your role holds membership.invite. Fields: member (required): the ID of a member item on this scope. kind (required): one of device, agent, checker. inviteHash (required): a digest, sha256: and 64 hex characters. inviteEnds (required): a time, as RFC 3339 UTC ending in Z. Guards: the member is active (member-removed). |
| `key.revoke` | platform:membership `revoke-key` | revoke-key: moves a key; the rule recovery-key decides who may sign, or your role holds membership.manage; from active, to retired or compromised. Fields: as (required): one of retired, compromised. Guards: this key is active; the room keeps at least one active admin with an active key (last-admin). |
| `member.actions` | platform:membership `set-actions` | set-actions: moves a roster; needs membership.manage, which your role (admin) holds. Fields: role (required): one of admin, maintainer, member, agent, checker. actions (required): a value that the platform rule checks: a list of actions, each an action the platform knows. No guards. |
| `member.add` | platform:membership `add-member` | add-member: opens a member; needs membership.manage, which your role (admin) holds. Fields: handle (required): text up to 256 bytes. kind (required): one of agent, checker. controller: a member, as @handle. Guards: no member is invited, active or removed where the member's handle equals the act's handle (handle-in-use); the handle is a handle: @, then letters, digits, dots, dashes or underscores (bad-handle); one of: [the act's kind equals "checker"; the act's controller equals nothing] or [the act's kind equals "agent"; some member is active where the member's member equals the act's controller and the member's kind equals "person"] (no-controller). |
| `member.invite` | platform:membership `invite-member` | invite-member: opens a member; the rule recovery-key decides who may sign, or your role holds membership.invite. Fields: handle (required): text up to 256 bytes. role (required): one of admin, maintainer, member, agent, checker. inviteHash (required): a digest, sha256: and 64 hex characters. inviteEnds (required): a time, as RFC 3339 UTC ending in Z. Guards: no member is invited, active or removed where the member's handle equals the act's handle (handle-in-use); the handle is a handle: @, then letters, digits, dots, dashes or underscores (bad-handle). |
| `member.remove` | platform:membership `remove-member` | remove-member: moves a member; the rule recovery-key decides who may sign, or your role holds membership.manage; from active, to removed. Fields: none. Guards: this member is active; the room keeps at least one active admin with an active key (last-admin). |
| `member.role` | platform:membership `set-role` | set-role: moves a member; needs membership.manage, which your role (admin) holds; from active. Fields: role (required): one of admin, maintainer, member. Guards: this member is active; this member's kind equals "person"; one of: [this member's role differs from "admin"] or [at least 2 members are active where the member's role equals "admin"] (last-admin). |
| `repository.add-branch-room` | platform:destination `add-branch-room` | add-branch-room: moves a branch; needs ledger.retry, which your role (admin) holds. Fields: none. No guards. |
| `repository.add-room` | platform:destination `add-room` | add-room: moves a publication; needs ledger.retry, which your role (admin) holds; from queued, reserved, publishing or unresolved. Fields: none. Guards: this publication is queued, reserved, publishing or unresolved. |
| `repository.adopt-head` | platform:destination `adopt-head` | adopt-head: moves a branch; needs destination.adopt, which your role (admin) holds. Fields: commit (required): a Git commit ID, 40 or 64 hex characters. why (required): text up to 1024 bytes. Guards: no publication is reserved, publishing or unresolved; this branch's slot is not set. |
| `repository.read-token` | platform:destination `read-token` | read-token: moves a branch; needs destination.read-token, which your role (admin) holds. Fields: hours (required): a whole number from 1 to 24. No guards. |
| `repository.resend` | platform:destination `resend` | resend: moves a publication; needs ledger.retry, which your role (admin) holds. Fields: none. Guards: the earlier attempt is unanswered and its retry is due (resend-not-due). |
| `repository.resend-receipt` | platform:destination `resend-receipt` | resend-receipt: moves a branch; needs ledger.retry, which your role (admin) holds. Fields: receipt (required): the ID of a receipt item on this scope. Guards: the receipt is owed (receipt-not-owed); the earlier attempt is unanswered and its retry is due (resend-not-due). |
| `repository.retry-import` | platform:directory `retry-import` | retry-import: moves a repository; needs ledger.retry, which your role (admin) holds. Fields: none. Guards: the repository's import has ended without success, so it may be tried again (import-not-spent). |
| `room.create` | platform:register `found` | found: opens a claim; the rule founding-policy decides who may sign. Fields: branch (required): text up to 256 bytes. founderHandle (required): text up to 256 bytes. recoveryKey (required): text up to 64 bytes. import: text up to 2048 bytes. Guards: the creator's handle is a handle: @, then letters, digits, dots, dashes or underscores (bad-handle). |
| `room.enrol` | platform:membership `enrol` | enrol: moves a roster; the rule by-invitation decides who may sign. Fields: invitation (required): a whole number from 0 to 1000000000. secret (required): text up to 256 bytes. Guards: the key is invited or lapsed (invitation-used); now is before the key's inviteEnds (invitation-expired); the key is invited (invitation-expired); the member is active (member-removed). |
| `room.first-key` | platform:membership `first-key` | first-key: opens a key; the rule founding-key decides who may sign. Fields: member (required): the ID of a member item on this scope. Guards: no key is invited, active, retired or compromised; the member is active; the member's handle equals the roster's foundingHandle. |
| `room.join` | platform:membership `join` | join: opens a key; the rule by-invitation decides who may sign. Fields: invitation (required): a whole number from 0 to 1000000000. secret (required): text up to 256 bytes. Guards: the member is invited or lapsed (invitation-used); now is before the member's inviteEnds (invitation-expired); the member is invited (invitation-expired). |
| `room.rotate-recovery` | platform:membership `rotate-recovery` | rotate-recovery: moves a roster; the rule recovery-key decides who may sign. Fields: key (required): text up to 64 bytes. Guards: no key is active, retired or compromised where the key's id equals the act's key (key-in-use). |
| `room.seat` | platform:membership `seat` | seat: opens a member; the rule founding-key decides who may sign. Fields: none. Guards: no member is invited, active or removed. |
| `rules.activate` | platform:rules `activate` | activate: opens a definition; needs rules.activate, which your role (admin) holds. Fields: digest (required): the digest of a value in the definition domain, up to 262144 bytes, with its bytes in values or read from the rules scope; choices from the rules scope: change sha256:d86c64ae0a570165660a6eb4d75153b8c2f59c9cdaec2ecc789e2c38524a17a2, issue sha256:82a938c8f54ddcac7974ca688ebea7d51c35d2aa70f4e3729965e9f915bc464e. name (required): text up to 64 bytes. Guards: the definition's bytes are given beside the act, hash to the digest and validate (unsupported-definition); no definition is active where the definition's digest equals the act's digest. |
| `rules.keep-configuration` | platform:rules `keep-configuration` | keep-configuration: opens a configuration; needs rules.publish, which your role (admin) holds. Fields: digest (required): the digest of a value in the artroom-check-configuration-1 domain, up to 32768 bytes, with its bytes in values. name (required): text up to 128 bytes. Guards: the configuration's bytes are given beside the act and hash to the digest (configuration-mismatch). |
| `rules.publish` | platform:rules `publish` | publish: moves a rules; needs rules.publish, which your role (admin) holds. Fields: approvals (required): a whole number from 0 to 64. ownerMayReview (required): true or false. checks (required): a list of up to 32, each a record of name (required): text up to 128 bytes; configuration (required): a digest, sha256: and 64 hex characters; required (required): true or false; checker (required): a member, as @handle. labels (required): a list of up to 32, each text up to 64 bytes. extents (required): a value that the platform rule checks: a list of extents, each with a name, a class, paths, approvals, an approver and checks. singleControllerException: true or false. Guards: for each k in the act's checks: [some configuration is kept where the configuration's digest equals k.configuration] (configuration-unknown). Guards 2 to 3 of 3 are left out (named: not-a-checker, rules-extent-required, catch-all-required, extent-check-unknown); see inspect with describe: "publish". |
| `rules.retire` | platform:rules `retire-definition` | retire-definition: moves a definition; needs rules.activate, which your role (admin) holds; from active, to retired. Fields: none. Guards: this definition is active. |
| `task.create` | platform:directory `open-task` | open-task: opens a task; needs task.control, which your role (admin) holds. Fields: worker (required): a member, as @handle. controller (required): a member, as @handle. lane (required): a reference to a lane scope, as { scope, inc, kind }. Guards: the worker is an active member with an active key (worker-not-active). |

### The words table

A tool's name is `<noun>.<verb>`. The table maps a definition's native
kind to a surface name; a kind it does not map keeps its own name under
the definition's name, such as `garden.plant`. The table maps names only.
A table that would give two kinds of one definition the same name is
refused when the server starts.

| Definition | Noun | Kind | Tool name |
|---|---|---|---|
| platform:register | room | `found` | `room.create` |
| platform:directory | issue | `open-issue` | `issue.create` |
| platform:directory | issue | `open-pr` | `change.create` |
| platform:directory | issue | `open-task` | `task.create` |
| platform:directory | issue | `retry-import` | `repository.retry-import` |
| platform:directory | issue | `establish-application` | `application.create` |
| platform:membership | room | `join` | `room.join` |
| platform:membership | room | `enrol` | `room.enrol` |
| platform:membership | room | `seat` | `room.seat` |
| platform:membership | room | `first-key` | `room.first-key` |
| platform:membership | room | `rotate-recovery` | `room.rotate-recovery` |
| platform:membership | room | `invite-member` | `member.invite` |
| platform:membership | room | `add-member` | `member.add` |
| platform:membership | room | `set-role` | `member.role` |
| platform:membership | room | `set-actions` | `member.actions` |
| platform:membership | room | `remove-member` | `member.remove` |
| platform:membership | room | `invite-key` | `key.invite` |
| platform:membership | room | `revoke-key` | `key.revoke` |
| platform:rules | rules | `publish` | `rules.publish` |
| platform:rules | rules | `activate` | `rules.activate` |
| platform:rules | rules | `retire-definition` | `rules.retire` |
| platform:rules | rules | `keep-configuration` | `rules.keep-configuration` |
| platform:destination | repository | `read-token` | `repository.read-token` |
| issue |  | `accept` | `issue.take` |
| issue |  | `take-hold` | `issue.work` |
| issue |  | `release-hold` | `issue.release` |
| issue |  | `renew-hold` | `issue.renew` |
| issue |  | `report` | `issue.hand-in` |
| issue |  | `accept-report` | `issue.accept` |
| change |  | `accept` | `change.take` |
| change |  | `take-hold` | `change.work` |
| change |  | `release-hold` | `change.release` |
| change |  | `renew-hold` | `change.renew` |
| change |  | `propose-manifest` | `change.propose-version` |
| change |  | `request-review-own` | `change.request-review` |
| change |  | `review-verdict` | `change.review` |

## The W1 inventory

Every command of the command line and every action of the page, with the
tool calls that perform it in each launch mode and the count of calls.
The public item query is not yet available through MCP. Its marked gap
row has no execution recipe; all other rows remain covered.
`packages/mcp/test/recipes.scope.test.ts` runs every recipe row through the server
on the real test Worker, with complete arguments, in the default and
`--generic` modes, and checks that the tools called are the ones the row
names, in order, as many times as it counts. In `--generic` mode, `actions`
is called once per scope within one activity, and its result serves every
later `act` on that scope. `--generic=add` lists both, so either recipe
works; the count given is the default recipe's.

| Activity | Default | --generic | --generic=add |
|---|---|---|---|
| `dap install <base-url>`, `--plan`, `--planned` | `create` with `platform:register@3` (or the cohort's register), kind install, the host, namespace, policy and creator keys: 1. The signed intent is kept before it is sent, which is what --plan keeps; after a lost reply, settle adds 1 | `create`: 1 | 1 |
| `dap create <name>` | `room.create` on the register with the branch, the creator's handle and a recovery key, `wait` with the entry for the created directory and its children, `room.seat`, `room.first-key` with the seat's entry, `wait` for the inbox: 5 | `actions` on the register, `act`, `wait`, `actions` on membership, `act` seat, `act` first-key, `wait`: 7 | 5 |
| Page: Create room | the same calls as `dap create`: `room.create`, `wait`, `room.seat`, `room.first-key`, `wait`: 5 | the same calls as `dap create`: 7 | 5 |
| `dap invite <@member> --role <role>` | `member.invite` with the handle, the role, the digest of a secret of at least 32 bytes that the inviter makes, and the end; the inviter passes the link with the number and secret to the member: 1 | `actions` on membership, `act`: 2 | 1 |
| `dap join <link>` | `join` with the link, from an empty configuration, then `wait` for the inbox: 2 | `join`, `wait`: 2 | 2 |
| Page: Join with an invitation link | `join`, `wait`: 2 | `join`, `wait`: 2 | 2 |
| Page: Rules editor | `inspect` on the rules scope, `rules.publish` with the changed counts and the rest kept: 2 | `inspect`, `actions` on the rules scope, `act`: 3 | 2 |
| `dap act <kind> --on <scope>` | The act tool of that kind, such as `rules.activate` with the definition's digest, name and bytes: 1 | `actions`, `act`: 2 | 1 |
| `dap acts [<scope>]` | `room`, whose notHeld names the act tools the role does not hold; the list holds the rest: 1 | `actions` on the scope: 1 | 1 |
| `dap issue open --title <text>` | `issue.create` with the issue definition's digest (its bytes are read from the rules scope), the title, the body and the title as its condition, then `wait` for the issue's lane: 2 | `actions` on the directory, `act`, `wait`: 3 | 2 |
| Page: Create issue | `issue.create`, `wait`: 2 | `actions`, `act`, `wait`: 3 | 2 |
| `dap issue comment <issue> <text>` | `issue.comment` with the issue's number and the body: 1 | `actions` on the lane, `act`: 2 | 1 |
| `dap issue assign <issue> <@member>` | `issue.assign` on the issue's intent item with the assignees: 1 | `actions`, `act`: 2 | 1 |
| `dap issue close <issue>` | `issue.close-own` when the caller opened it (issue.close-any otherwise), with the reason: 1 | `actions`, `act`: 2 | 1 |
| `dap issues` | `room` for the lanes (paged by bytes), then `inspect` for each issue's own state: 1 + n | `room`, then `inspect` for each issue: 1 + n | 1 + n |
| `dap items <scope> --query <canonical-item-query-JSON>` (MCP gap: public item query) | Unavailable in MCP; use the SDK, CLI or Page query surface | Unavailable in MCP | Unavailable in MCP |
| `dap log <scope>` | `steps`, one per page: 1 | `steps`: 1 | 1 |
| `dap show <scope>:<seq>` | `step`: 1 | `step`: 1 | 1 |
| `dap verify <scope>` | `record`, one per page; the server verifies nothing, so a verifier outside it replays the canonical bytes, such as dap verify itself: 1 | `record`: 1 | 1 |
| `dap verify --all` | `room`, then `record` for each scope it names: 1 + n | `room`, then `record` for each scope: 1 + n | 1 + n |
| `dap status [<scope>] [--request <16-hex-id>]` (MCP gap: operational status) | Unavailable in MCP; use the CLI or SDK operational reads | Unavailable in MCP | Unavailable in MCP |
| `dap remote` | `inspect` on the destination, whose branch item names the host, namespace and name: 1 | `inspect`: 1 | 1 |
| `dap clone [<directory>]` | `repository.read-token` with the hours, `wait` for the outcome entry, `credential` with the act's entry, then Git: git clone with the credential as the header: 3 and Git | `actions` on the destination, `act`, `wait`, `credential`, then Git: 4 and Git | 3 and Git |
| Page: Propose an edit | `change.create` with the change definition's digest and a title, `wait` for the lane, `change.ask-rules`, `wait` for the rules item, `inspect` on the destination for the head, `change.propose-file` with the base, path, digest, size and the text inline: 6 | `actions` on the directory, `act`, `wait`, `actions` on the lane, `act`, `wait`, `inspect`, `act`: 8 | 6 |
| Page: Review | `inspect` on the change for its current version, `change.review` with the version and the verdict: 2 | `inspect`, `actions`, `act`: 3 | 2 |
| Page: Comment | `change.comment` on a change (issue.comment on an issue), with the body: 1 | `actions`, `act`: 2 | 1 |
| Page: Merge | `inspect` on the change for its current version, `change.merge` with the version and the reports it selects, `wait` for the merge to be published, refused or aborted: 3 | `inspect`, `actions`, `act`, `wait`: 4 | 3 |
| `dap edit <path> --file <file>` | `change.create`, `wait`, `change.ask-rules`, `wait`, `inspect` on the destination for the head, `change.propose-file` with the text inline, then as dap merge: `inspect` on the change, `change.link-own` with the issue for --closes, `change.merge`, `wait`; 9 without --closes: 10 | `actions` on the directory, `act`, `wait`, `actions` on the lane, `act`, `wait`, `inspect`, `act`, `inspect`, `act` link-own, `act` merge, `wait`: 12 | 10 |
| `dap merge <change>` | `inspect` on the change for its current version, `change.merge`, `wait`: 3; with --closes, change.link-own first | `inspect`, `actions`, `act`, `wait`: 4 | 3 |
| `dap propose <branch>` | Git first: the agent reads the committed files that differ from the room's head. Then, under the manifest-list change definition and a version 3 destination: `change.create`, `wait` for the lane, `change.ask-rules`, `wait` for the rules item, `inspect` on the destination for the head, `change.propose-file` once per path with the base, path, digest, size and text, `change.propose-version` with the base and each file's entry and digest, `change.merge` with that version, `wait` for the merge to be published: 8 + n | `actions` on the directory, `act`, `wait`, `actions` on the lane, `act`, `wait`, `inspect`, `act` per path, `act` propose-manifest, `act` merge, `wait`: 10 + n | 8 + n |
| Page: Check status | `settle` with the target and the key: 1 | `settle`: 1 | 1 |
| Page: Record inspection | `room` for the role and key, `record` on membership: 2 | `room`, `record`: 2 | 2 |
| A capability step | `prepare` at the resource, with the act's own target, kind and fields, then the act tool under the same key, such as `issue.hand-in`: 2 | `prepare`, `actions`, `act`: 3 | 2 |
| A send's outcome | `sends` on the scope, then `wait` with the outbox ID a receipt named: 2 | `sends`, `wait`: 2 | 2 |

Git steps: `clone` and `propose` use Git outside the server. The server
returns the remote URL and a one-time credential; the agent's own Git, or
a generic credential helper, uses them. The server runs no Git.

`propose` runs, in the recipe test, in a room of its own under
`change-demo3`, the manifest-list change definition, with a version 3
destination: two files, a version that names both, accepted, and a merge
that the room publishes. The destination builds the tree from the files'
entries; the agent sends no tree. Under the demo change definition,
`change-demo`, whose `propose-manifest` is the hold workflow's and which
holds one version only, the same steps end in the lane's refusal of the
version as `source-shape`; the recipe test asserts that refusal too.

## Taking part in a Counter

A Counter is an application the room's application factory creates
(`application.create`, the directory's `establish-application`). The
agent is handed no scope ID and no `--scope`: `room` lists the Counter
among its applications, with its definition name
(`counting-commitments`), digest, scope and state, and the list holds the
Counter's act tools from then on.
`packages/mcp/test/counter.scope.test.ts` runs this recipe on the real
test Worker in both modes, after an admin has initialized the board, and
checks the tools called and their count against this table (observed).
The count covers taking part, from finding the Counter to deactivating;
the room's setup, the board's initialization and the story's final
readings of the board and the steps are not counted. The story's one
member holds every grant, so the same member starts the board and takes
the turn; in a room with several members the controller starts. In `--generic` mode the story's second
connection shares the first one's key and configuration: the same member,
not a second admitted one.

| Activity | Default | --generic |
|---|---|---|
| Take part in a Counter: find it, participate, activate, start, commit to a number, fulfill it, deactivate | `room`, whose applications name the Counter's scope; `counting-commitments.participate`; `counting-commitments.activate`; `inspect` on the Counter for the board, `counting-commitments.start`; `inspect`, `counting-commitments.commit`; `counting-commitments.fulfill`; `counting-commitments.deactivate`: 9 | `room`; `actions` on the Counter, `act` participate; `act` activate; `inspect`, `act` start; `inspect`, `act` commit; `act` fulfill; `act` deactivate: 10 |

Each further turn is one `inspect`, one `counting-commitments.commit` and
one `counting-commitments.fulfill` (one `act` each in `--generic` mode).
When more than one participant is active, the last speaker cannot commit
next. [The Counter](../apps/counter/README.md) has diagrams of every
act and who may attempt it.

The commitments Counter (`apps/counter/commitments.ts`, the one the
target-100 recording runs) grants differently from the Counter above: an
agent's role needs `counting.participate`, `counting.activity` (which
authorizes both `activate` and `deactivate`; there is no `counting.activate`
or `counting.deactivate` grant), and `counting.commit`, `counting.fulfill`
and `counting.fail` as its part needs; `counting.control` stays with the
controller. An agent enrolled by an agent-key invitation holds its role's
actions as the roster lists them for the membership the room is pinned to:
membership@2, membership@4 (the application cohort) or membership@5 (the
Counting cohort); the invitation carries that pin, and the enrolment is
verified against the receipt's definition.

## Taking part in the lending library

The [lending library](../examples/lending) is also an application that
the room's application factory creates, in a room of the
`application-publication` cohort. Its definition name is `lending`, so
its act tools are `lending.donate`, `lending.borrow`, `lending.return`,
`lending.cancel` and `lending.publish`. The caller's genesis values are
`{}`: the factory makes the signer the creator and supplies the room's
destination. A donation opens a thing at the entry that records it, so
the position of the act's fact is the thing's ID. `borrow`, `return` and
`cancel` name that ID in `on`.

Every act after `establish` carries `content`, the text of the thing's
shelf page, and the library tells the destination to publish it. A
donation also names the page's path in `page`, which must start with
`shelf/` and end with `.md`; the member interface picks
`shelf/<16 characters>.md`. The scope does not check the text against the
thing. An agent that writes the page states it under its own key, and
the next act on the thing rewrites it. Taking effect is not publication:
read the destination's receipt to see the commit.

`packages/mcp/test/lending.scope.test.ts` runs this recipe on the real
test Worker in both modes, after an admin has activated the definition,
given the admin role `lending.member` and `lending.staff`, and created
the library. It checks the tools called and their count against this
table (observed). The room's setup is not counted, and the test does not
read the destination.

| Activity | Default | --generic |
|---|---|---|
| Take part in the lending library: find it, donate a thing, borrow it, return it | `room`, whose applications name the library's scope; `lending.donate`; `lending.borrow`; `lending.return`: 4 | `room`; `actions` on the library, `act` donate; `act` borrow; `act` return: 5 |

The same test then returns the thing a second time. The answer is
`refused`, with the reason `guard-failed`, because the thing is no longer
lent. A refusal is an answer, not a tool error, and the scope writes
nothing for it.

Who may sign each act is set by the room, not the server. `donate`,
`borrow`, `return` and `publish` need `lending.member`; `cancel` needs
`lending.staff`. In the rehearsal room the `admin` role holds both
actions and the `member` role holds `lending.member`; there a member's
`cancel` was refused as `unauthorized`. Anyone with
`lending.member` may return a lent thing, not only its borrower. The
library's [README](../examples/lending/README.md) lists the items and the
acts.

## The hosted endpoint

The same service, served from the scope Worker at `POST /mcp`, for an agent
on a host that cannot run a process. One Durable Object per agent holds the
agent's key, its bearer, its sessions and its custody, so one agent's
sessions, subscriptions and custody are kept apart from every other
agent's by construction; one registry per repository creates agents. The
design is notes/2026-10-13-hosted-mcp-endpoint.md; this section is what an
operator and a controller need.

### Routes

| Route | Authorization | What it does |
|---|---|---|
| `POST /mcp/agents` | `Control`, action `create` | Creates and enrols an agent. Body: `{ "link": "<artroom-agent-key:…>" }`, the agent-key invitation from `dap invite --kind agent-key`. Answers `201` once with `{ agent, key, handle, member, bearer }`; the bearer is shown this once, and again only to the same `op` |
| `POST /mcp/agents/<agent>/bearer` | `Control`, action `bearer` | A new bearer. Every session of the agent ends, every 2025-11-25 stream closes with a final event and every listen completes with its result. A replay of a completed `op` returns its answer and ends nothing |
| `DELETE /mcp/agents/<agent>` | `Control`, action `retire` | Retires the bearer; sessions and streams end the same way. A retired agent answers `401` from then on, and no later `bearer` or unfinished `create` revives it. An enrolment still unfinished can be retired |
| `POST /mcp` | `Bearer <agent>.<secret>` | One JSON-RPC request or notification, either revision |
| `GET /mcp` | `Bearer`, `Mcp-Session-Id` | The 2025-11-25 server stream of that session |
| `DELETE /mcp` | `Bearer`, `Mcp-Session-Id` | Ends that 2025-11-25 session |

### Creating an agent: the controller's recipe

Enrolment is the membership's own; nothing here grants a permission.

1. An admin adds the agent as a member with its controller, an active
   person: `member.add` with `kind: agent`, the handle and `controller`.
2. An admin invites a key for that member: `key.invite` with the member,
   `kind: agent`, `inviteHash` (the digest of a 32-byte secret) and
   `inviteEnds`. `dap invite --kind agent-key` performs both and prints the
   invitation link, which holds the secret: keep it private.
3. The controller (or an admin) signs a **control request** with their own
   member key and sends `create` with the link as the body. The Worker's
   registry checks the signature, that the request is for this service and
   this membership with its incarnation, the body's digest, the deadline
   (at most 15 minutes ahead), and the signer's current authority, read
   from the membership now: an active key of an active member who holds
   `membership.manage` or is the agent's recorded controller. Then it
   records the request under `op` and creates the agent's object.
4. The agent's object makes its key, keeps the signed `enrol` under
   custody before sending it, reads the admitted entry back, confirms the
   key is active, and mints the bearer. The secret of the invitation lives
   where the membership puts it, in `enrol`'s signed fields and the entry
   that retains them, and nowhere else in the hosted store.
5. Give the agent host `https://<service>/mcp` and
   `Authorization: Bearer <agent>.<secret>`.

A control request is the canonical JSON of
`{ v: 1, action, service, membership, agent, actor, body, op, notAfter }`,
signed by `actor` under the tag `artroom-mcp-control-1`, and presented as
`Authorization: Control <base64url of the JSON>.<signature>`. `body` is the
SHA-256 digest of the request body; `agent` is null for `create`; `op` is
the caller's identity for the operation, 1 to 128 bytes. The same `op` with
the same request answers the same, resuming unfinished work; another
request under the same `op` is refused `409`; an answer is kept seven days
past the request's `notAfter`, then `409` as stale, and the `op` is never
reused. Each object removes expired answer bodies when it next acts; the
`create` answer, which shows the bearer, is among them. Refusals are fixed bodies naming a rule, never a value: `403` for a
bad signature, another service, another repository or incarnation, a
revoked key, an ended member or a signer without authority; `400` for a
binding that does not match the route, a body digest that differs or a
deadline out of range; `507` when the object's control budget is full.

### The bearer

`<agent>.<secret>`: the object holds the secret's digest and compares in
constant time. Missing, malformed, wrong and retired each answer `401` with
no body. Failures that name an agent are counted by that agent per
connecting address: after ten in a minute, the eleventh request from that
address answers `429`, right bearer or not. Revocation is also the
membership's: `key.revoke` or `member.remove` by an admin makes the key's
acts refused everywhere; `retire` only stops the hosted service.

### The two revisions over HTTP

Exactly `2025-11-25` and `2026-07-28` are served; any other
`MCP-Protocol-Version` is refused `400` before anything is dispatched, on
every method. The revision is selected before the method is handled: from
the header when present, else from the request's own content (a `_meta`
protocol version, or `initialize`) or from the recorded version of the
session the request names. Then:

| Version, as selected | `POST` | `GET` | `DELETE` |
|---|---|---|---|
| header `2026-07-28` | modern: `_meta` must name the same version, `Mcp-Method` must equal the method, `Mcp-Name` the tool on `tools/call` (`=?base64?…?=` for a name that is not header-safe); else `400` with `-32020`; an unknown method `404` with `-32601`; a notification `202` | `405` with `Allow: POST`; no session consulted | `405`; nothing ended |
| header `2025-11-25` | legacy: `initialize` mints a session; any other request needs `Mcp-Session-Id` (`400` without, `404` unknown); `Mcp-Method` and `Mcp-Name` are ignored | session required: `400` without, `404` unknown, else the stream | session required; else the session ends |
| header absent, `_meta` names `2026-07-28` | `400` with `-32020`: that revision requires the header | | |
| header absent, `initialize` | legacy | | |
| header absent, `Mcp-Session-Id` names a live session | that session's revision | the stream | the session ends |
| header absent, otherwise | `400` | `405` | `405` |

A batch is refused on every request; a body over 1 MiB is `413`; an
`Origin` header is `403`. At most 16 sessions per agent (a 17th
`initialize` is admitted first and then ends the oldest; a refused
`initialize` ends nothing) and 4 open streams, legacy streams and
listens together (a 5th is `409`). Every byte bound here counts UTF-8
bytes. A legacy HTTP session expires after 30 minutes without a client
request. The server checks expiry before an authenticated legacy request
uses or creates a session; it does not run a separate expiry timer. A
client request that reaches its session, including `GET`, renews the idle
time; server notifications do not. Expiry removes the stored session,
closes its stream with a final event, and leaves its ID answering `404`.
Initialize again to obtain a new ID. Origin or bearer refusals and the
stateless modern revision neither renew nor expire legacy sessions.

A session's activity time survives the object's eviction. A stored row
from before idle tracking uses its creation time until its next request.
Its open stream does not survive eviction: when the stream reconnects, a list
change the client has not listed is told once more.

### Budgets and recovery

| Budget | Bound | When full |
|---|---|---|
| Custody, per agent | 1 GiB | A new act whose completion need (its record up to 2 MiB plus a 512 KiB segment row) cannot be reserved is refused `full` before anything is signed; a resubmit, repeat step or settle that cannot reserve is refused before anything is dispatched; retained answers stay readable |
| One identity's history | 64 MiB | Further attempts on that identity refuse `full`; its retained answer stays readable |
| Control, per registry and per agent | 16 MiB, the last 1 MiB for `retire` alone; one aggregate of every persisted row: each operation (4 KiB reserved, its answer charged beyond that), each 2025-11-25 session row (its declared capabilities at most 16 KiB), and the agent's configuration | `create` and `bearer` refuse `507`; a session cannot be issued (`507`, error `-32001`); a root cannot be added; `retire` still succeeds. Were the reserve exhausted too, the admin's `key.revoke` ends the agent's authority in the scope regardless of the hosted objects |

Nothing is deleted: terminal custody records move to an archive table in
the same object. A storage failure rolls its transaction back and settles
nothing; the next `settle` writes the receipt. Recovery of a budget-full
agent is `retire` and a new agent; an `export` control action is owed.

### Observed figures

| Figure | Value | How taken |
|---|---|---|
| HTTP framing beyond the CallResult, a 2026-07-28 `tools/call` | 144 bytes: the JSON-RPC envelope with a one-digit id (34) and the modern result's added members (110) | Observed, `packages/mcp/test/hosted.scope.test.ts`, H7 |
| Control request header | about 600 bytes | Reconstruction: the canonical JSON of the nine members, base64url, and a 64-byte signature |

## Budgets and observed figures

Each figure below is labelled by how it was taken: an observed run of a
named test, or a sum of a recipe's steps.

### Whole responses

A tool's bound is for the whole tool result as the service makes it: the
structured content, the text and `isError` together (plan 031, section 8: 4 KiB for an
act, `wait`, `settle` and `prepare`; 8 KiB for `room` and a page of
`inspect`; 64 KiB for `items`, `steps`, `step`, `record`, `sends`, `text`,
`actions` and the declaration or complete text of `inspect`; 2 KiB for
`credential`). The text repeats the structured content's JSON only when
the whole result still fits; otherwise the text says where the result
is. Pages are sized for the whole result, and a text slice is measured
after JSON escaping. Over 2026-07-28 each result also carries
`resultType` and the server's information in `_meta`: 110 bytes more,
observed in `wire.test.ts` (the constant `MODERN_RESULT_EXTRA`), which the
bounds do not count. Over 2025-11-25 nothing is added. The one result larger than its bound is a single live
item larger than a page, which is served whole, alone on its page.

`room` pages every collection it returns (lanes, applications, standalone scopes,
standing, active definitions, the act tools not held, the scopes not read)
together, by bytes, with a cursor. The cursor is bound to the layout of
those collections, a digest of every entry in order, not to the tool
list's generation: an application being created moves the entries after
it without changing the generation. A cursor whose layout no longer holds
is answered with the first page and `restarted`, so no entry is repeated
or skipped.

The searches of `wait` and `credential` retain at most 64 recent entry-search
positions and 64 recent final-page positions per server. A lookup keeps its
position recent; the oldest is evicted at the bound. Each poll or call still
reads at most 16 entries, or 4 pages of final items, with no fixed history
window. An evicted search restarts those bounded reads. These hints hold
neither an answer nor a credential and grant no authority.

An entry search belongs to its service and immutable opening entry's full
scope, position and hash, so appending entries does not reset it. A final-page
position belongs to its service, full scope, observed head and query. A new
head or query starts at the first page. If the head changes between summary
and final-item reads, that poll returns no item; a later poll reads again.

### Per tool, end to end

Observed run of `packages/mcp/test/budget.test.ts`, on the stand-in scope
service of the Node tests, which counts every request the server makes. A
warm call holds a read session; a cold call adds one session request. The
plan's bound is plan 031, section 8. Response bytes are the whole result
of the warm call, as the service makes it; the test asserts both calls' sizes against the bound.

| Tool | Reads, warm | Posts | Cold | Response bytes | Plan's bound, warm |
|---|---|---|---|---|---|
| `room` | 3 | 0 | +1 session | 3874 | 3, + roots and memberships |
| `inspect` | 1 | 0 | +1 | 990 | 1 |
| `inspect` with `describe` | 1 | 0 | +1 | 1471 | 2 |
| `inspect` with `declaration` | 2 | 0 | +1 | 64536 | 2 |
| `items` | 1 | 0 | +1 | 506 | 1 |
| `steps` | 1 | 0 | +1 | 1012 | 1 |
| `step` | 1 | 0 | +1 | 2264 | 1 |
| `record` | 1 | 0 | +1 | 4932 | 1 |
| `sends` | 1 | 0 | +1 | 442 | 1 |
| `text` | 1 | 0 | +1 | 474 | 1 |
| `wait`, one poll | 1 | 0 | +1 | 476 | 1 |
| `settle` | 1 | 0 | +1 | 1570 | 1 |
| `actions` | 1 | 0 | +1 | 20056 | 3 |
| `issue.comment`, on a lane | 1 | 1 | +1 | 1184 | 2 |
| `issue.create`, with the definition's bytes read | 2 | 1 | +1 | 1204 | 2 |
| `create` | 0 | 1 | | | 0 |
| `credential`, a second token after the first was read | 3 | 0 | +1 | 362 | 1 |
| `tools/list` | 3 | 0 | +1 | | 3, + roots and memberships |

`credential` reads the act's entry, then the entries after it until the
operation's outcome names the token (two here), then the credential route:
3 reads where plan 031 counts 1.

The warm counts above are of a room with no applications. An application
the directory created costs reads the first time the server sees it: one
summary of its scope for its pin, and its definition's bytes once per
digest; both are kept, so later calls read nothing more for it. Its row
comes from the directory summary the list already reads.

Other observed figures from the same run:

- A session that has ended: the next read asks for a new one, +1.
- A session refused at the membership: one session request, then signed
  reads; the refusal is remembered for a minute.
- A session the scope refuses on a read: one signed-read fallback for that
  read, so 2 reads.
- A room with two standalone roots, one under a second membership: `room`
  warm reads 6 (3, + 2 roots, + 1 for standing on the second membership);
  cold, 2 session requests.
- A room of 60 lanes, 30 applications and 40 roots: `room` in 6 pages
  (observed; the test asserts more than one), each within 8 KiB. That
  case proves the totals and the bound, not that pages agree with each
  other; a second case does: a continuation inside the roots, after an
  application appears as `creating`, is created, or is refused, restarts,
  and the walk from the restart returns every root once.
- 20 prepared steps under one key: `settle` in 4 pages, each within 4 KiB;
  each `prepare` result at most 1692 bytes.
- A known tool name called at a root another process added under a second
  membership: served under that membership, with no list call first.
- A mint's outcome 100 entries after its act: found in 7 `credential`
  calls; a creation completed 100 entries after its act: found in 7 polls
  of one `wait`; a final item on the fifth page of final items: found in 2
  polls. No entry was read twice.
- A 64 KiB live item is served alone and whole on its own `inspect` page.
  A continuation after the head moved restarts at the new head and says so.
- A 200 KiB retained text is read whole in 4 calls of `text` by offset.
- With a 2 KiB list page, each descriptor larger than the page is alone on
  its page (35 of them), and all 71 tools are reachable.
- 70 resubmissions of one refused envelope: each of the 70 made 1 read and
  1 post, and all 70 outcomes are readable.
- A subscribed client is told 2 times for an activation and a role change,
  and 0 times for an ordinary head advance. Each watch run reads 3
  summaries.

### The list, per role

Observed run of `packages/mcp/test/budget.test.ts`, taken in the
discovery head (request f9ca5f96). Bytes are the
canonical JSON of each `tools/list` result as sent; every page is asserted
to be at most 256 KiB. Tokens are counted by gpt-tokenizer 3.4.0 with the
`o200k_base` encoding, a proxy: an agent host's own tokenizer gives other
counts.

| Room and role | Tools | Pages | Bytes | Tokens |
|---|---|---|---|---|
| Demo room, admin | 71 | 1 | 146531 | 37745 |
| Demo room, maintainer | 57 | 1 | 114615 | 29617 |
| Demo room, member | 54 | 1 | 108040 | 27860 |
| Demo room, agent | 52 | 1 | 102274 | 26421 |
| Full lane definitions (`issue`, `change`, `change3`), admin | 158 | 2 | 339157 | 88992 |
| Demo room, admin, `--generic` | 16 | 1 | 15236 | 3581 |

No cap applies to the whole list. `--tools` shortens it for an agent with
one job; `--generic` replaces the act tools with the pair.

### List changes in the room story

Observed run of `packages/mcp/test/room.scope.test.ts` on the real test
Worker, in both modes: the creator's subscribed client was told of 7 list
changes (3 while creating the room), and the second member's of 4.
