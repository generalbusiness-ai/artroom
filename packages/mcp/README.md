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
makes a new server for each request. Requests without a valid bearer get
HTTP 401 with a message that says how to get a token. For a custom domain,
pass `allowedHostnames`.

## On stdio

```ts
import { serveArtroomStdio } from "@generalbusiness/artroom-mcp/stdio";
serveArtroomStdio(room); // room: any RoomApi, for example from connect()
```

`artroom mcp` (the CLI) does this with your own key.

## Notes on the wire shapes

- `claim` takes two forms (a new lane, or an existing lane). MCP clients
  handle a single object schema best, so the schema lists every property
  and requires only `scope`; the tool checks the rest.
- `attention` adds `publishedThrough`, which it reads from the log.
- `explain` returns `null` for an unknown act. MCP structured content must
  be an object, so a `null` result is text only.
- The input validator is small and has no code generation, so it runs in
  Workers.
