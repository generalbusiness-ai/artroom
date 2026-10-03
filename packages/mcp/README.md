# @generalbusiness/artroom-mcp

The Artroom MCP server: exactly the contract's ten tools (R-API-9), for
any `RoomApi`.

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
| `attention` | Lists what needs you; pass its cursor back to follow the room |
| `explain` | Explains an act or refusal |

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
`{ result }`. The server instructions are 378 characters, under the 512
that Codex keeps.

## Acts a room declares: `acts` and `act`

Beside the ten named tools there are two generic ones (R-API-9 as amended,
docs/protocol.md section 33.10).

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

The descriptor shape (titles, annotations, toolsets) and the further read
tools of the MCP core (`a9788a59`) are not part of this change. `acts` and
`act` are written in the existing shape, in their own block of
`src/tools.ts`, so the core's descriptors can be added beside them.

## On Workers

```ts
import { createMcpFetch } from "@generalbusiness/artroom-mcp/worker";

const mcp = createMcpFetch<Env>({
  // Check the bearer token, and return a handle whose acts the room signs
  // with the token's session key, under its delegation (R-CRED-3).
  async room(request, env, bearer) {
    return lookUpBearer(env, bearer); // null when unknown, expired or revoked
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
import { serveArtroomStdio } from "@generalbusiness/artroom-mcp/stdio";
serveArtroomStdio(room); // room: any RoomApi, for example from connect()
```

`artroom mcp` (the CLI) does this with your own key.

## Notes on the wire shapes

- `claim` takes two forms (a new lane, or an existing lane). MCP clients
  handle a single object schema best, so the schema lists every property
  and requires only `scope`; the tool checks the rest. Both forms, and
  `propose`, pass `because` through unchanged.
- `attention` returns the room's page as it is, with `publishedThrough`.
- `explain` returns `{ act, outcome: "not-found" }` for an unknown act,
  because MCP structured content must be an object.
- Tool names and input keys are checked as own properties, so names such
  as `constructor` or `__proto__` are never tools or fields.
- The input validator is small and has no code generation, so it runs in
  Workers.

On Workers, `room()` usually builds the handle with
`connect(env.ARTROOM, roomId, { kind: "bearer", token: bearer })` from
`@generalbusiness/artroom-client`, which sends acts to `bearerAct` and
workspace requests to `bearerRequest` (R-CRED-10).
