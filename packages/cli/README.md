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
artroom land --wait               # or: artroom land, then artroom wait
artroom release -m "Landed; nothing left."
```

`workspace` adds a git remote named `artroom` and writes the write token
to `.git/artroom/credentials`, readable only by you. The repository config
includes that file, so `git push artroom` sends the token as a header. The
token is never a command argument and never printed. `release` removes it.

`land` records the landing operation it starts. `artroom wait` follows
that operation (or one you name) until it finishes; it never starts a new
landing. Only a finished landing that did not land suggests a new
`artroom land`.

Other commands: `renew`, `note`, `review`, `explain`, `log`, `agents-md`
and `mcp`. Run `artroom help` for all of them.

## When something fails part way

The CLI writes each act, login and redemption to a journal in its config
directory before it sends anything, and removes the entry only when every
local step is done. To finish, run the same command again:
- `login` reuses the same key and the same join;
- `redeem` finishes from the saved result, and never sends a one-time
  redemption twice. If the room may have received it but the answer was
  lost, the CLI says to ask for a new invitation;
- an act that failed prints the `--idempotency-key` to use. With it, the
  CLI sends the very act it signed before, even if HEAD, the lane or the
  lease has changed since, and the room returns the original result.

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


## Agents

- `artroom agents-md` prints a block for your repository's `AGENTS.md`
  that teaches an agent the loop in under 30 lines. Add `--mcp` after a
  `redeem` to describe the MCP tools instead.
- `artroom mcp` runs the ten MCP tools over stdio, signing with your key,
  for an agent on this machine.

## Where things are kept

`$ARTROOM_HOME`, or `$XDG_CONFIG_HOME/artroom`, or `~/.config/artroom`.
Files are mode 0600 and directories 0700.
