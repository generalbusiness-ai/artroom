# @generalbusiness/artroom-replay

Independent checks of an Artroom scope's history: an integrity check, and a
full replay of the scope and of the scopes it used. It prints a report that
states its mode, its target, what it covered and what it took on trust.

The scope and replay contract is the authority, in its sections 9.3 to 9.5.
Where the contract was silent,
`notes/2026-10-04-i1-contract-deltas.md` records what was implemented, in
its section "Replay".

This package does not import the scope runtime. A replay derives each entry
again with the judges and the fold of `@generalbusiness/artroom-derive`,
which are pure functions. The turn, the store and transport are not here.
It runs under Node and under Workers.

## What it exports

| Module | Holds |
|---|---|
| `source` | `HistorySource`: what a verifier reads. `page(scope, from)`: a page of a scope's entries, each as its canonical bytes with the hash the source gives for it. `retained(scope, kind, digest)`: one retained input. `httpSource(service, options?)`: a source over a scope service's read routes. `MemorySource`: a source over histories in memory. `hashOfBytes`. |
| `verify` | `verify(source, options)`: a `Verification`, which is the report and, in words, what was found. `Options`: the mode, the target scope ID, a known head, anchors, limits and bounds. `LIMITS`, `TRUSTS`, `SourceError`. |
| `report` | `Report`, the contract's type, and `render(report, why?)`: the report in plain English. |
| `cli` | `main(argv, io)`: the command, with no process state. `src/bin.ts` runs it under Node. |

## Two modes

**Integrity** checks, for the target scope only:

- each entry's bytes hash to the hash the source gives for it, and are
  canonical JSON in the shape of an entry;
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
| `incomplete` | A retained input is missing or is not the bytes its digest names; or a limit was reached. |
| `unsupported-definition` | The scope pins a platform definition, or a declaration that does not pass validation under the bounds given. |

The check stops at the first finding. The report's coverage lists, for each
scope, the entries that were checked to their end, with every fact they
used shown.

Limits: scopes read, entries read, bytes read and the depth of a chain of
foreign facts. The defaults are in `LIMITS`.

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
- that each scope runs under the bounds the replay was given.

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
| 2 | The command was not understood, or the target's history could not be read. |

The command sends no reader credential.

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
