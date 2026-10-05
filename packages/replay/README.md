# @generalbusiness/artroom-replay

Independent checks of an Artroom scope's history: an integrity check, and a
full replay of the scope and of the scopes it used. It prints a report that
states its mode, its target, what it covered and what it took on trust.

The scope and replay contract is the authority, in its sections 9.3 to 9.5.
Where the contract was silent,
`notes/2026-10-04-i1-contract-deltas.md` records what was implemented, in
its section "Replay", and `notes/2026-10-05-i2-contract-deltas.md` in its
entries DJ10 and DJ14.

This package does not import the scope runtime. A replay derives each entry
again with the judges and the fold of `@generalbusiness/artroom-derive`,
which are pure functions. The turn, the store and transport are not here.
The library runs under Node and under Workers.

## What it exports

| Module | Holds |
|---|---|
| `source` | `HistorySource`: what a verifier reads. `page(scope, from, allow)`: a page of a scope's entries, each as its canonical bytes with the hash the source gives for it. `retained(scope, kind, digest, allow)`: one retained input. `allow` is the most the read may take in, and each result says how many raw bytes it read. `httpSource(service, options?)`: a source over a scope service's read routes. `MemorySource`: a source over histories in memory. `hashOfBytes`. `PAGE_REPLY_BYTES`, `RETAINED_REPLY_BYTES`, `PAGE_ENTRIES`, `READ_SECONDS`. |
| `verify` | `verify(source, options)`: a `Verification`, which is the report and, in words, what was found. `Options`: the mode, the target scope ID, a known head, anchors, limits, bounds, and `capabilities`: the rules of the capability versions the caller has code for. This package has none of its own. `LIMITS`, `TRUSTS`, `SourceError`. |
| `report` | `Report`, the contract's type, and `render(report, why?)`: the report in plain English. |
| `cli` | `main(argv, io)`: the command, with no process state. `src/bin.ts` runs it under Node. |

## Two modes

**Integrity** checks, for the target scope only:

- each entry's bytes hash to the hash the source gives for it, and are
  canonical JSON that the bytes package's `isEntry` passes: the twelve
  members of an entry, an input of one of the contract's types with its
  members, and each effect, send, use and prepared result as one of the
  contract's records. That guard does not read a request's body, an
  outcome's evidence, a grant's `within` and `fresh`, or the values of an
  intent's fields, and it does not compare a slot's value with the type the
  definition declares;
- the chain: `seq` counts from 0, `prev` is the hash of the entry before,
  every entry is at one scope and incarnation, times do not go back, and a
  clamped entry has the time of the entry before it;
- the scope ID is the digest of the genesis's seed;
- the signature of each act and of a founding.

No judgment is derived again, and the report says so in words. A history
whose recorded effects were altered and whose chain was sealed again passes
this mode.

**Replay** does all of that, and for every entry, from the genesis:

1. reads the retained copy of each foreign entry the entry used, and checks
   it against the content digest the entry records;
2. shows each foreign fact, as below;
3. checks that no transition was due and unapplied before an entry that is
   not timed, and that the entry has no two `relate` sends for one key;
4. evaluates each recorded rule result again, from the rule's retained
   input;
5. derives the judgment again with derive's judge for that input, from the
   folded state, the recorded input, the retained inputs and the recorded
   time, with every range guard scanned to its end;
6. compares the derived input with its decision, `uses`, `prepared`,
   `effects` and `sends` with the recorded ones, and then the whole entry;
7. folds the entry.

A checkpoint is checked against the fold. It is never used as a place to
start.

A detached text is a retained input. The verifier asks for each text that
an entry's input names and checks it against its digest. A text whose
bytes are gone is owed. A later entry of the same scope answers for it
when one of its `redact` effects lists that digest: that entry is the
tombstone, and the report's `redacted` holds one row for the effect, with
the tombstone, the item and the slot. The text is not derived again. A
scope that still owes a text at the end is read on to its head, and a text
that no tombstone answers for makes the result `incomplete`.

## Foreign facts

A retained copy of a foreign entry lets a judgment be derived again. It
does not show that the source scope admitted that entry. For each fact an
entry used, the verifier does one of two things:

- **An anchor.** If the caller supplied an anchor that names exactly that
  entry, by scope, position and hash, the fact is taken on the caller's
  word. The source is not read.
- **Replay of the source.** Otherwise the source scope is replayed from its
  genesis up to that entry, under its own definition, and the hash of its
  entry there is compared with the reference before the entry's content is
  read. The scope's incarnation and kind must be the ones the reference
  names.

Each scope is checked once, as far as the highest entry any reference
needs. Two scopes may use each other at different positions.

## What the caller must give

The target scope's ID, always. And, if the caller has one, a known head: a
position and a hash, from a receipt it kept or from anywhere but the
service being checked.

- With a known head, a history that ends before it, or has another entry
  at that position, is a mismatch.
- With none, the head is whatever the service answers, and the report says
  so under `trusts`. A service that shows this reader a shorter or a
  different history is then not found out.

## Results

| Result | When |
|---|---|
| `consistent` | Everything the mode checks holds, through the head, for the coverage and trusts stated. |
| `mismatch` | An entry is not what its bytes, its chain, its signature or its replay say; or a reference names another entry, incarnation or kind than its source scope has; or the history does not reach or match the known head. `at` names the entry. |
| `missing-dependency` | A source history cannot be read, or does not reach the entry a reference names, and no anchor names it. `at` names the entry that used it. |
| `incomplete` | A retained input is missing or is not the bytes its digest names; or a detached text is gone and no later entry redacts it; or a limit was reached. |
| `unsupported-definition` | The scope pins a platform definition, or a declaration that does not pass validation under the bounds given, or a declaration that needs a capability version the caller gave no rules for. `at` names the genesis. |

The check stops at the first finding. The report's coverage lists, for each
scope, the entries that were checked to their end, with every fact they
used shown.

## Limits

Everything a source returns is untrusted, so each limit is applied as a
reply arrives, before anything in it is kept.

| Limit | Unit | Default | When it is passed |
|---|---|---|---|
| `bytes` | Raw bytes of the source's replies, as read: pages and retained inputs | 256 MiB | The reply that would pass it is cancelled and not taken in. `incomplete`, with the coverage so far. |
| `entries` | Entries checked, over all scopes | 100,000 | `incomplete`. |
| `scopes` | Scopes whose history is read | 64 | `incomplete`. |
| `depth` | Foreign facts followed in a chain from the target | 16 | `incomplete`. |
| One page | Raw reply bytes, and entries | 4 MiB (`PAGE_REPLY_BYTES`); 200 (`PAGE_ENTRIES`) | The page is not taken in. The history cannot be read past it: `incomplete` for the target, `missing-dependency` for a source. |
| One retained input | Raw reply bytes | 4 MiB (`RETAINED_REPLY_BYTES`) | It is not taken in: `incomplete`, as a retained input that is missing. |
| One read | Seconds | 30 (`READ_SECONDS`) | The request is aborted, and the reader starts no read and keeps no chunk after that. A `fetch` that ignores the abort signal may keep its own buffers and its connection. A read error: `verify` rejects with `SourceError`, and there is no report. |

A page is kept only if it is the entries from the position asked, in
order. `httpSource` reads a body chunk by chunk and stops at the chunk that
passes what the read allows. A limit that stops the first read of the
target is a read error too: there is nothing to report on.

The first four defaults are in `LIMITS`. All are this package's choice and
temporary.

In replay mode an entry larger than `entryBytes` of the bounds given is a
`mismatch`: the runtime seals no such entry, so a history that holds one
was not written under those bounds. That is the entry size bound, and is
not the traversal's byte limit.

## What a replay takes on trust

A report lists these under `trusts`, each only when it applies:

- the service clock: each entry's time is taken as recorded;
- the head of the target's history, when no known head was given;
- each source history that was replayed, which is the service's answer;
- that each incarnation was minted once;
- that a provisional scope dispatched no held send before its confirmation;
- when each message was delivered;
- that each recorded grant was current, and the fact that issued it;
- each diagnosis's attempt log;
- each outcome's evidence, and that the outside write happened;
- each anchor, and the definition name retained with an anchored entry;
- that each scope runs under the bounds the replay was given;
- for each redacted text, that its bytes were the text its digest names
  and were within the bound of their field.

It also does not derive again whether an entry left room in the scope's
entry budget.

## The command

```
artroom-replay <service URL> <scope ID> [--mode integrity|replay]
    [--head <seq>:<hash>] [--anchor <scope>:<seq>:<hash>]... [--json]
```

The default mode is `replay`. It prints the report in plain English, or
with `--json` as `{ report, why }`.

| Exit code | Means |
|---|---|
| 0 | Consistent. |
| 1 | Not consistent: mismatch, missing dependency, incomplete or unsupported definition. |
| 2 | The command was not understood, or the target's history could not be read: it is not there, a read ran past its deadline, or a limit stopped the first read. |

The command sends no reader credential.

`src/bin.ts` is TypeScript, run by Node as it is, with no build step. Node
does that without a flag from 22.18.0 in the 22 line and from 23.6.0, by
its documentation, and the package's `engines` says exactly that range. It
was run here under Node 26.10.0 only; no other version was checked. It runs
from this workspace: Node does not strip types from a file under
`node_modules`.

## How to test

```
npm test --workspace @generalbusiness/artroom-replay
npm run typecheck --workspace @generalbusiness/artroom-replay
```

`test/world.ts` builds one good set of histories with derive's fixture
scopes: a desk and two tickets, with creation, confirmation and a
relationship update. `test/verify.test.ts` copies it and changes the copy,
one row for each way a history can fail.

That replay agrees with the runtime is shown in the scope package,
`packages/scope/test/replay.test.ts`: real scopes write histories in the
workerd pool, and the verifier reads them through the Worker's read routes.
The test lives there because the pool, the test Worker and its fixtures are
there, and so that no source file of this package imports the runtime.
