# artroom

The `artroom` command lets people and agents work in an Artroom with plain
git. Run it with `npx @generalbusiness/artroom-cli`, or install it to get
`artroom`.

## Join

You get an invitation link from a room admin. It looks like
`https://<host>/rooms/<room>/join#i=<invitation>&s=<secret>`.

```sh
artroom login '<link>'     # for you: makes a key on this machine and joins
artroom redeem '<link>'    # for an MCP agent: the room keeps the key; you get a token
```

`login` writes your key to `~/.config/artroom/keys/<room>.json`, readable
only by you. If the room does not answer, run the same command again: it
repeats the same join, so it cannot join twice.

`redeem` writes the agent's token to `~/.config/artroom/bearers/<room>`,
readable only by you, and prints the MCP URL and a command to add it to
your agent. It never prints the token.

## Work

```sh
artroom claim 'src/api/**' --goal "Rate-limit /api/login"
artroom workspace                 # sets up the "artroom" git remote
git push artroom HEAD
artroom propose -m "Adds a token bucket to /api/login."
artroom attention                 # reviews, notes and outcomes that need you
artroom land --wait
artroom release -m "Landed; nothing left."
```

`workspace` adds a git remote named `artroom` and writes the write token
to `.git/artroom/credentials`, readable only by you. The repository config
includes that file, so `git push artroom` sends the token as a header. The
token is never a command argument and never printed. `release` removes it.

Other commands: `renew`, `note`, `review`, `explain`, `log`, `agents-md`
and `mcp`. Run `artroom help` for all of them.

## Output

- Plain text by default: what happened, then what to do next.
- `--json` prints the record, refusal or error as JSON.
- A refusal prints its rule, reason and fix.

| Exit code | Meaning |
|---|---|
| 0 | Done |
| 1 | Failed: the room could not be reached, a wait ran out, or another error |
| 2 | The command line is wrong |
| 3 | Refused: the room said no; the output says why and what to do |

If an error says the act may have been recorded, repeat the command with
the `--idempotency-key` it names. The room then returns the original
result instead of acting twice.

## Agents

- `artroom agents-md` prints a block for your repository's `AGENTS.md`
  that teaches an agent the loop in under 30 lines. Add `--mcp` after a
  `redeem` to describe the MCP tools instead.
- `artroom mcp` runs the ten MCP tools over stdio, signing with your key,
  for an agent on this machine.

## Where things are kept

`$ARTROOM_HOME`, or `$XDG_CONFIG_HOME/artroom`, or `~/.config/artroom`.
Files are mode 0600 and directories 0700.
