# artroom

The `artroom` command lets people and agents work in an Artroom with plain
git. Run it with `npx @generalbusiness/artroom-cli`, or install it to get
`artroom`.

## Install

The command is released as a tarball that holds one bundled file. It needs
Node 22.18 or later and no other package:

```sh
npm install ./generalbusiness-artroom-cli-<version>.tgz
npx artroom --help
```

It is not in a registry. [docs/release.md](../../docs/release.md) says how a release is made and checked.
Until it is, `npx @generalbusiness/artroom-cli` works only where the tarball
is installed.

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
to `.git/artroom/credentials`, readable only by you. The file names the
lane it belongs to, and the CLI records where it wrote it. The repository config
includes that file, so `git push artroom` sends the token as a header. The
token is never a command argument and never printed. Everything written
into that file is checked first, because most of it comes from the room:
the remote must be a plain `https://` URL in normal form, the token may
hold only the characters a bearer token can have, and the file's first
line, which names the lane, lease and installation it belongs to, takes
only a canonical lane ID (`act_<number>_<8 hex digits>`), a whole-number
lease and the CLI's own installation ID. A claim's lane is selected only
if canonical, and `--lane` takes only a lane ID. A grant that fails a
check is refused with exit code 1, before the git remote or credential is
touched or an installation is recorded (request 55be0661). `release` removes
that lane's credential, from wherever you run it, and leaves a credential
that a newer workspace for another lane has written.

Each repository keeps a record of who owns its Artroom remote and
credential, in `.git/artroom/owner.json`. Every Room you use with the
repository shares that record. It keeps the installed credential apart
from workspace commands still in progress, so a failed command never
hides what a release must clean up. A lock file that names its holding
process guards each change; a stopped command's lock is recovered only
when that process is gone. If two `artroom workspace` commands overlap,
or a release happens while one is being prepared, only the workspace
started last installs anything, whichever Room it is for. The
other says it was superseded, and leaves the newer remote and credential
alone.

`land` records the landing operation it starts. `artroom wait` follows
that operation (or one you name) until it finishes; it never starts a new
landing. Only a finished landing that did not land suggests a new
`artroom land`.

Other commands: `renew`, `note`, `review`, `explain`, `log`, `agents-md`
and `mcp`. Run `artroom help` for all of them.

## Acts a room declares

A room may declare acts of its own in its policy document.

```sh
artroom acts                 # what this room declares
artroom acts take-part       # one act: its fields, who may sign it, its binding
artroom act take-part --binding sha256:… --set part=bass
```

- `artroom acts KIND` prints the binding. `artroom act` needs it with
  `--binding`: it names the meaning you read, and the CLI never chooses
  one for you.
- The target is `--lane LANE` (a thread), `--lane LANE --generation N` (a
  version), `--entry ACT` (an entry), `--target JSON`, or nothing.
- `--set FIELD=VALUE` gives a field, read by its declared type; a list of
  globs is comma-separated. `--body JSON` gives several at once.
- The lease, the lane's generation and a version's head are read from the
  room when you leave them out, as the named commands read them.
- If the meaning changed since you read it, the act is refused
  `binding-stale` and nothing is done. The CLI prints the active meaning,
  what changed where the room still has the earlier version, and the
  command with the new binding. Run it only if that is still what you
  intend.
- A failed command is finished by running it again with its
  `--idempotency-key`: the journal holds the act with its binding, and
  sends the same bytes.

`artroom act` prints the act as the room recorded it. After the room
answers, the CLI reads the declarations that were in force at the record's
own seq and prints the label from them. That is not always the label you
read: a label can change before your act is admitted and leave its binding
as it was. It is not always the latest label either. With `--json` the
record is printed and nothing more is read.

When an act opens a thread, `artroom act` prints a second line that names
the thread as every reader does: by its goal, or by the act's label and its
first text field by name (its first field by name when it has no text
field). The field values are those of the act as it was sent.

A command finished from the journal prints the same two lines, from the
act the journal kept. Finishing reads nothing to prepare the act again.

The journal finds a saved act by its idempotency key, not by its kind. If
you run `artroom act` with that key and name another kind, the saved act is
what is finished, and no act of the kind you named is made. The receipt
names the saved act, and a line on the error stream says so and says what
the run did. If the saved act had no answer yet, its saved bytes go back
unchanged: "This idempotency key belongs to a saved start-song act. That
act was sent again as it was saved; no start-tune act was made." If the
journal already held its answer, nothing is sent: "That act had already
been answered, and this is its result. Nothing was sent, and no start-tune
act was made."
If the room refuses the saved act, the refusal is explained for the saved
kind and the binding it was prepared under.

The read for these words needs a session. If it fails, the act is still
done and nothing is sent again: the first line names the kind in place of
its label, and the thread is named by its goal or its ID.

`artroom log` and `artroom explain` show a declared act with the label its
kind had at that entry's own seq, and say where a kind was retired.
`artroom acts --at SEQ` shows the declarations in force at an entry.

## When something fails part way

The CLI writes each act, login and redemption to a journal in its config
directory before it sends anything. For an act, the entry then keeps the
room's answer until the local steps after it (the config, the landing to
wait for, the workspace credential) are done; only then is it removed. To
finish, run the same command again:
- `login` reuses the same key and the same join;
- `redeem` finishes from the saved result, and never sends a one-time
  redemption twice. If the room may have received it but the answer was
  lost, the CLI says to ask for a new invitation;
- finishing never undoes newer work: if the selected lane or the followed
  landing changed in any way after the act was sent, even back to the same
  value, or the lane was taken again with a new lease and workspace, the
  CLI keeps the newer state and says so;
- an act that failed prints the `--idempotency-key` to use. With it, the
  CLI finishes from the kept answer, or sends the very act it signed
  before, straight to the room. Neither needs a read session or current
  state, so it works even if HEAD, the lane or the lease has changed, or
  your key was retired since. The room returns the original result.

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
- `artroom mcp` runs the MCP tools over stdio, signing with your key,
  for an agent on this machine. It shows the tools your role may use,
  read from the room's roster each time the agent asks for the list. With
  a redeemed bearer it shows what that session's own delegation allows.
  `--toolset builder`, `reviewer`, `observer` or `all` selects another
  list, with the same filter; a tool that is not listed can still be
  called, and the room judges the call.

## Where things are kept

`$ARTROOM_HOME`, or `$XDG_CONFIG_HOME/artroom`, or `~/.config/artroom`.
Files are mode 0600 and directories 0700.

The config and journal files carry a schema version. Files from an older
artroom are read conservatively: where they cannot prove which local
change is theirs, the CLI still returns the act's result, changes nothing
locally, and prints "Manual local step" lines. Files from a newer artroom
are refused.
