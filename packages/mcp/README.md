# @generalbusiness/artroom-mcp

The Artroom MCP server: the contract's sixteen tools (R-API-9), for any
`RoomApi`. Fourteen are named for the code-review loop. Two, `acts` and
`act`, serve any act a room declares.

| Tool | Does |
|---|---|
| `claim` | Claims paths, opening a lane you hold under a lease |
| `workspace` | Waits for the lane's git remote and returns the write token to the holder |
| `propose` | Proposes a pushed commit as the lane's next generation |
| `note` | Writes a note on an act or on lines of a proposal |
| `review` | Approves or objects to a proposal generation |
| `land` | Lands the latest proposal, and can wait for the outcome |
| `renew` | Extends the lease |
| `release` | Gives up the lane, with a handover note |
| `attention` | Lists what needs you; pass its cursor back to follow the room. With `waitMs` it waits for the next item for you |
| `explain` | Explains an act or refusal |
| `lanes` | Lists lanes, filtered by state, holder or the paths they touch |
| `lane` | Reads one lane |
| `proposal` | Reads one proposal generation with its obligations |
| `operation` | Reads an operation, and with `waitMs` waits for it to finish |
| `acts` | Lists the acts the room declares, with their bindings |
| `act` | Does any declared act, with the binding the agent read |

Each tool's description says what to keep from the result and what to do
on each likely refusal. A refusal is a normal result (`isError: false`)
with the `Refusal` as structured content. A failure is a tool error
(`isError: true`) with the `ArtroomError` as structured content (R-API-1).

`tools/list` advertises each tool's `outputSchema`. Every root is an
object. The eight tools that can refuse (`claim`, `workspace`, `propose`,
`note`, `review`, `land`, `renew`, `release`) have `oneOf` their result and
`Refusal`, so a refusal's structured content conforms too, as MCP
2026-07-28 requires. Because the root is an object, a 2025-era client gets
the same schema and the same structured content, never wrapped in
`{ result }`. The server instructions are 480 characters, under the 512
that Codex keeps. Each description is at most 1,000 characters.

## What `tools/list` sends (R-API-13)

For each tool: `name`, `title`, `description`, `inputSchema`,
`outputSchema` and `annotations`, always in the same order. The
annotations are hints for a host and never authority. They are fixed:

| Tools | Read-only | Destructive |
|---|---|---|
| `attention`, `explain`, `lanes`, `lane`, `proposal`, `operation`, `acts` | yes | no |
| `claim`, `propose`, `note`, `review`, `renew`, `workspace` | no | no |
| `land`, `release`, `act` | no | yes |

Every tool is idempotent and closed-world. `act` keeps its hints whatever
kind an earlier call performed, because one tool may review, check or land.

A read that finds nothing answers with an object, never `null`: `explain`
with `{ act, outcome: "not-found" }`, `lane`, `proposal` and `operation`
with `{ outcome: "not-found", what }`, `acts` with `{ outcome: "not-found" }`.

## Toolsets: what a caller is shown (R-API-14)

| Toolset | Tools |
|---|---|
| `builder` | `attention`, `claim`, `workspace`, `propose`, `note`, `land`, `release`, `renew`, `lane`, `proposal`, `explain`, `operation`, `acts`, `act` |
| `reviewer` | `attention`, `lanes`, `lane`, `proposal`, `note`, `review`, `explain`, `acts`, `act` |
| `observer` | `attention`, `lanes`, `lane`, `proposal`, `explain`, `operation`, `acts` |
| `all` | All sixteen |

A caller that asks for none gets the default for its authorization: `all`
for an admin or maintainer, `builder` for a member or agent, `reviewer`
for a checker, and `observer` for a delegation that may sign no act this
server offers. A caller may select any of the four by name, whatever its
default is, with `?toolset=NAME` on the MCP URL or `artroom mcp --toolset
NAME`. The selected list has the same filter as the default one, so
selecting `all` shows no act tool the caller could not use, and grants
nothing. An unknown name is `bad-request`.

Under a `v1` policy document the generic `act` is never shown, because the
room refuses a `v: 2` envelope there. An admin then sees the fourteen named
tools and `acts`; under a `v2` document, all sixteen.

Within the chosen set, an act tool is shown only if the caller could make
a new call of it: its role and the declaration's `who` allow the kind, and
for a delegated caller the signed grant names the kind with the binding
that is active now. `act` is shown when at least one declared kind
qualifies. Reads, `workspace` and `operation` are always shown.

A toolset is a presentation, not permission. A tool that is not shown can
still be called, and the room judges that call like any other. Listing
changes no grant: a stale signed binding is never replaced, and a kind the
grant does not name is never added.

The host that authenticated the request supplies the caller's
authorization (`McpCaller`): the credential's current roster role and,
under a delegation, that delegation's `kinds` and signed map exactly as
the room recorded them. This is a seam between the server and its host,
not a method of `RoomApi` or `RoomWire`:

- The room's Worker asks the Room, which judges the bearer token as a read
  does and reads its member's role and its session's delegation.
- The command line builds it from the current roster with
  `callerFromRoster`: a member's own key, or, for a redeemed bearer, the
  delegation its redemption recorded, which the room-held key must have
  granted. A key that names a delegation must be the key it was granted to.

Both read it again for every `tools/list`, so the list follows a changed
role, a revoked delegation or a changed declaration, and never an earlier
call.

## Keys and waits (R-API-9, R-API-15)

Every act tool requires `idempotencyKey`: `claim`, `propose`, `note`,
`review`, `land`, `renew`, `release` and `act`. A call without one is
`bad-request`, and its message says to add any unique string and to reuse
it to retry. A retry with the same key gives the original result and no
second act.

`waitMs` is a whole number from 0 to 45,000 on `attention`, `workspace`,
`land` and `operation`. Anything else is `bad-request`. Waiting is a read:
it holds no lease, no slot and no room state. When the time is up, the
tool returns what is true now (the empty page, or the operation's current
state), never an error.

## Acts a room declares: `acts` and `act`

Beside the fourteen named tools there are two generic ones (R-API-9 as
amended, docs/protocol.md sections 33.10 and 34).

- `acts` lists the acts the room declares: each kind's label, targets,
  body fields, who may sign it, help and its `binding`. With `at` (a seq)
  or `policy` (a version) it gives the declarations in force then, with
  `retired` on a kind a later version dropped. A room on the legacy
  vocabulary declares none; its text says to use the named tools.
- `act` does any declared act. `kind`, `target`, `body`, `binding` and
  `idempotencyKey` are all required. The binding is the one `acts` gave
  for the meaning the agent read. The tool passes it to the room
  unchanged and never reads one for the agent.

On `binding-stale` nothing was done. The tool's text names the active
binding and policy version and tells the agent to read `acts` before it
acts again. The tool does not act again by itself.

`explain` shows an act with the label its kind had at the act's own seq.

When `act` opens a thread, the first line of its text names the thread as
every reader does: by its goal, or by the act's label and its first text
field by name (its first field by name when it has no text field). `acts` with `at` or `policy` reads the room each time, so a kind
retired since the last call is shown as retired.

`acts` and `act` carry the same descriptor shape as the named tools:
a title, fixed annotations and their toolsets (section 34).

## On Workers

```ts
import { createMcpFetch } from "@generalbusiness/artroom-mcp/worker";

const mcp = createMcpFetch<Env>({
  // Check the bearer token, and return a handle whose acts the room signs
  // with the token's session key, under its delegation (R-CRED-3).
  async room(request, env, bearer) {
    return lookUpBearer(env, bearer); // null when unknown, expired or revoked
  },
  // The bearer's authorization now, for tools/list: its member's role, and
  // its delegation's kinds and signed map, unchanged (R-API-14).
  async caller(request, env, bearer) {
    return lookUpCaller(env, bearer);
  },
});

export default {
  fetch(request: Request, env: Env) {
    return mcp(request, env); // serves POST /v1/rooms/:room/mcp
  },
};
```

It uses the Agents SDK's stateless handler (`agents/mcp/server`), which
makes a new server for each request. It serves 2026-07-28 clients and, in
its legacy stateless mode (`legacy: "stateless"`), 2025-era clients such
as Codex by default and pi; GET and DELETE, the 2025 session operations,
are 405. Requests without a valid bearer get HTTP 401 with a message that
says how to get a token. For a custom domain, pass `allowedHostnames`.

The Room Worker serves this handler at `/v1/rooms/:room/mcp`
(`packages/room/src/mcp.ts`), with the `RoomApi` described at the end of
this file.

## On stdio

```ts
import { callerFromRoster, serveArtroomStdio } from "@generalbusiness/artroom-mcp/stdio";
// room: any RoomApi, for example from connect(). key: the caller's own key.
serveArtroomStdio(room, { caller: async () => callerFromRoster(await room.members(), { key }) });
```

`artroom mcp` (the CLI) does this with your own key.

## Notes on the wire shapes

- `claim` takes two forms (a new lane, or an existing lane). MCP clients
  handle a single object schema best, so the schema lists every property
  and requires only `scope`; the tool checks the rest. Both forms, and
  `propose`, pass `because` through unchanged.
- `attention` returns the room's page as it is, with `publishedThrough`.
- `explain` returns `{ act, outcome: "not-found" }` for an unknown act.
  Artroom answers every MCP read that finds nothing with an object.
- Tool names and input keys are checked as own properties, so names such
  as `constructor` or `__proto__` are never tools or fields.
- The input validator is small and has no code generation, so it runs in
  Workers.

On Workers, `room()` usually builds the handle with
`connect(env.ARTROOM, roomId, { kind: "bearer", token: bearer })` from
`@generalbusiness/artroom-client`, which sends acts to `bearerAct` and
workspace requests to `bearerRequest` (R-CRED-10).
