# @generalbusiness/artroom-cli

The `artroom` command for the new model: thin functions over a scope
service's HTTP routes and a signing key. [docs/cli.md](../../docs/cli.md)
says what each command does, what it prints and what it does not do yet.

The JavaScript launcher uses the package's pinned `tsx` 4.21.0 runtime
under Node 22.0.0 or later. It resolves the installed loader from the CLI,
not the current directory, and installs or downloads nothing at launch.

| Module | Holds |
|---|---|
| `commands` | One function for each command, over a `Context`: a store, and optionally a `fetch`, a clock and a pause for waiting. Each returns an exit code and its lines. |
| `line` | `command(ctx, argv)`: a command line, read into one of those functions. |
| `store` | The config and the keys, and `memoryStore()` for a test. |
| `files` | The store on disk under Node, owner-only. Not exported. |
| `main` | The command under Node. `bin/artroom.js` runs it. Not exported. |

## How to test

```
npx vitest run --project cli            # the key files, in Node
npx vitest run --project scope story    # the story on real scopes, in workerd
npm run typecheck --workspace @generalbusiness/artroom-cli
```
