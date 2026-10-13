# @generalbusiness/dap-mcp

One MCP service for every dap application (plan 031). It reads a room's
definitions as data, derives one tool for each act declaration the room
holds, signs with one key, keeps each signed envelope before it sends it,
and serves the list and the calls over stdio and loopback HTTP, for both
MCP wire revisions. `dap mcp` runs it. [docs/mcp.md](../../docs/mcp.md)
says how to connect an agent host and what each tool does.

The server imports the contract, the bytes, the client and the platform
packages only. It names no lane definition, example, page or checker
service; `scripts/active-source.test.mjs` refuses one.

| Module | Holds |
|---|---|
| `words` | The words table (`words.json`): a definition's native kind to a tool's surface name, and the check that no two kinds of one definition share a name. |
| `describe` | A description and an input schema for an act, derived from its declaration: fields, guards as sentences, marks, the 1,000-character bound and its pointer. |
| `catalogue` | Bindings (definition, kind, declaration digest), variant names, which tools a role is listed, and the generation of the list. |
| `inventory` | What the server reads to derive the list: the room's scopes, the lanes, the standalone roots, the standing on each membership, the active definitions. |
| `reads` | Read sessions per membership, with signed reads where a session is refused. |
| `custody` | The custody of signed envelopes under the caller's key, and `memoryStore()` for a test. |
| `errors` | The sentences of answers, refusals and the server's own findings. |
| `shape`, `paging`, `marks` | Fields to signed values; byte paging and cursors; the platform's marks as sentences. |
| `service` | `McpService`: the list, its pages and generations, the watch, the generic tools and the act tools. |
| `wire` | JSON-RPC for the 2025-11-25 and 2026-07-28 revisions. |
| `node` | Under Node only (`./node`): custody files on disk, stdio, loopback HTTP, and `serve`. |

## How to test

```
npx vitest run --project mcp                       # derivation, custody, errors, wire, budgets, in Node
npx vitest run --project scope packages/mcp/test   # the stories on the real test Worker
npm run typecheck --workspace @generalbusiness/dap-mcp
```

The Node tests use a stand-in scope service (`test/support/standin.ts`),
which judges nothing and counts every request. The stories
(`test/*.scope.test.ts`) run on real scopes; each states its stand-ins in
`test/support/room.ts`.
