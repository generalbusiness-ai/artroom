# I5: definition versions, and a founding README, delivery

2026-10-07. Branch `claude/definition-versions-readme-to67yk` (the name
this session may push; the brief's local name was
`i5-definition-versions`), on top of `origin/planner/i5-demo-host` at
`5de2b850`, whose history is unchanged. Built alone in a cloud container
with no binding, no deployment credentials and no workroom, so no gitseq
request was opened or updated; the planner owes that. Nothing was
deployed.

Labels: **[code]** read from code, **[run]** confirmed by a run in this
container, **[inferred]** not checked.

## 1 What is built

**Versions.** Every platform definition that changed today has a version
2, and version 1 of every definition is again what `origin/main` shipped.
`platform(name)` resolves any shipped version from one table, `VERSIONS`
in `packages/platform/src/index.ts`; `NEWEST` names the version a new scope
is founded on [code]. A rule that must state its own version (the owner of
an operation that it opens, or the definition of a scope that it creates)
reads it from the scope's genesis (`packages/platform/src/versions.ts`,
`pinnedBy`) [code]. A room's versions follow from its register: register
@1 creates directory @1, which creates membership, rules and destination
@1; @2 does the same at @2 (`DIRECTORY_OF`, `SIBLINGS_OF`) [code].

The scope package compares a definition by name and takes the version
from the scope's genesis in the register and destination hosts, the host
wiring for GitHub and for the hosting own Git service, read sessions, the
namespace's observation answer, membership's own standing and the site
host [code]. The replay package needed no change: it already resolves the
version that a genesis pins through `platform` [code]. The command line:
`install` founds the newest register and prints its version; `claim` reads
the register's version, founds the directory that version creates, and
prints `Definitions: ...` of the room; an invitation link names
membership's version, and `join` reads its act from that version [code,
run].

**The founding README.** The founding commit of `platform:destination@2`
writes one file, `README.md`: `# <repository name>`, a blank line, and
`Founded by <handle> through the room <directory id>.` The directory @2
sends the founder's handle in its creation of the destination, and the
destination @2 keeps it in `branch.founderHandle`. Version 1 keeps the
empty tree (`foundingOf`, `foundingObjects`) [code, run].

Tests, by title; each passed in the gate run of section 4 [run]:

| Test (file) | Shows | Control that distinguishes [run] |
|---|---|---|
| "every shipped version resolves to its own data, pinned by digest, and version 1 of each is the data that main shipped; ..." (`platform/test/versions.test.ts`) | The digest of each version's data. The six digests of version 1 equal those of `origin/main`'s data, computed from a copy of main's source in this container before the copy was removed [run]. No other version resolves. Only @2 of the destination has `read-token` and `mint-read`. | The pins themselves. |
| "a rule reads its own version from the scope's genesis: the register of each version seeds the directory of the same version, and membership of each version writes its own first lists, ..." (same file) | Register @1 seeds directory @1, @2 seeds @2; membership @1 writes main's first lists, @2 the same lists plus `destination.read-token`; each version's lists match its table. | Register @1 mapped to directory @2: fails by assertion, DISTINGUISHES. Membership @1 given @2's lists: DISTINGUISHES. |
| "Git gives version 2's founding commit with one file, README.md, ...; its ID is stable, and version 1's stays the empty tree" (`platform/test/destination-objects.test.ts`) | On a real local repository: the @2 tree lists only `README.md`, with the heading and the sentence; @1's tree is `4b825dc6`, the empty tree. Both commit IDs are pinned (sha1: @1 `2de22fdd`, @2 `fd320962`), and another name, handle or directory gives another commit. | The pins. |
| "a register founded on platform:register@1 founds its whole room on version 1; its first head is the empty tree; read-token is refused by name and writes nothing; a grant read from membership states version 1; every history replays consistent, and replays with mismatch when version 1 is judged by version 2's code" (`scope/test/versions.test.ts`) | On real scopes with the code that ships @2: all six scopes (register, directory, membership, rules, destination, inbox) are @1; the first head is the empty tree; `read-token` is refused `unknown-act` and nothing is written; a rules `publish` retains membership's answer stating `platform:membership@1`; all six histories replay `consistent`. | In the test: a verifier that judges @1 by @2's code reports membership `mismatch`, which is the finding of 14:22. Code control: membership @1 answering as @2 fails by assertion, DISTINGUISHES. |
| "a member mints a read token and reads it once; ..." (`scope/test/read-token.test.ts`, unchanged) | Now founds at @2, so it is the witness that a room at @2 accepts `read-token`. | Its own controls. |
| The founding witnesses `founding-real`, `github-founding`, `destination-host` and the lanes room fixture | Found at @2 and expect the README commit as the first head, computed from the repository's name, `@rita` and the directory's ID, not from `foundingOf`. | The commit ID differs from @1's (pinned above). |
| The command line's story and `claim.scope.test.ts` | Found at @2 and expect the printed versions. | Section 6, the refusal. |

One control was **inconclusive**: making `foundingOf` write a README at @1
threw, because an @1 branch holds no handle; a thrown error shows nothing
[run].

## 2 The version table

| Definition | @1 (as on main) | @2 changes |
|---|---|---|
| `platform:register` | Install, found, create the repository, create the directory. | Same data and rules; creates `platform:directory@2`. |
| `platform:directory` | Creates membership, rules, destination at @1; `open-issue` and `open-pr` take `definition` as a digest with no stated place for its bytes. | Creates them at @2 and sends `founderHandle` to the destination; `definition` states its value place (commit `c6fe198` of the lane wiring), so an act without the bytes is refused `bad-field`. |
| `platform:membership` | The role table and first lists of main. | Same data; one table row and each first list end with `destination.read-token` (commit `41cef11`). Its answers state `@2`. |
| `platform:rules` | `activate` takes `digest` with no stated place. | `digest` states its value place (commit `c6fe198`). Answers state `@2`. |
| `platform:destination` | No `read-token`; founding commit with the empty tree. | The act `read-token`, the kind `mint-read` and their two rules (commit `41cef11`); the genesis takes `founderHandle`; the founding commit holds `README.md`. |
| `platform:inbox` | Unchanged. | No version 2. Its mismatch in the finding came from membership's answers, which @1 now gives again [inferred from the code]. |

Lane definitions are pinned by digest, not by a platform version, and are
not touched [code].

## 3 The live procedure for the local colleague

1. Gate this branch and deploy the scope Worker as before
   (`docs/deploy.md`). No new binding, setting or secret. [code]
2. **The 09:56 and 14:19 rooms** (their IDs are the planner's, named in the
   successor of the clone delivery note). For each, with the config
   directory that claimed it: `artroom verify directory`, `membership`,
   `rules`, `destination` and the inbox. Expected: each `consistent`.
   `artroom clone` there is refused with `Refused: unknown-act`, and
   nothing is written: the @1 destination has no `read-token`. [run in the
   test Worker for a room founded at @1; inferred for the deployment]
3. **A fresh room with a README.** The deployment's register was founded
   at @1, so it keeps founding @1 rooms: a claim on it gives no README.
   This is the gap of section 5.1. With the planner's choice made there,
   in a new config directory: `artroom install <base-url> ...` prints
   `under platform:register@2`; set the host setting's `registerScope` to
   the new ID and restart (`docs/deploy.md`, "The order"); then `artroom
   claim demo-readme --handle @hugh` prints `Definitions:
   platform:directory@2, platform:membership@2, platform:rules@2,
   platform:destination@2.` Once the first head is written, the room's
   site page and `artroom clone` show `README.md` with `# <name>` and
   `Founded by @hugh through the room sc_....` [run in the test Worker up
   to the first head; inferred for the page and the deployment]

## 4 Gate

Machine: this container, 4 CPUs, Linux, load average 1.5 at the start,
warm caches. `npm run gate` was invoked twice. The first, at `fcadca1`,
ended at the typecheck: two type errors in new test expectations, fixed in
`0309616`. The second, at `0309616851354ca3d6042a54aab6c105c4f57405`,
tree `d7d1ad2e75d6bce53de9be39b66385f7f13acb47`, observed once:

| Step | Exit | Elapsed | CPU |
|---|---|---|---|
| install | skipped (lock file unchanged) | | |
| whitespace | 0 | 0.0 s | 0.0 s |
| typecheck | 0 | 10.9 s | 34.8 s |
| test | 1 | 105.2 s | 144.9 s |
| whole gate (`time`) | 1 | 116.3 s | 180.0 s (153.1 user, 26.9 system) |

- vitest: 112 files, 111 passed and 1 failed; 797 tests, 796 passed and 1
  failed. The failure is T36 of `packages/checkers/test/runner.test.ts`,
  untouched, which the brief names as failing because of the container's
  git. [run]
- vitest reported 2 unhandled errors, `write EPIPE` at
  `packages/git/test/support/host.ts:80`. This branch does not change
  `packages/git`; the clone note reports the same. [run]
- Because vitest exited 1 the gate skipped its last step; I ran
  `scripts/active-source.test.mjs` alone at that head: 6 tests, 6 passed.
  [run]
- Before the change, at the base, the `scope` project had 1 failure (the
  story test) and the platform, replay and cli projects none. [run]

This note is a document-only commit after that run; the source and tests
are those of tree `d7d1ad2e`.

## 5 What is owed

1. **One register per deployment.** "A new room is founded on the newest"
   needs a register at @2, because register @1 creates directory @1 for as
   long as it exists. The deployment's host setting names one register:
   `docs/deploy.md`, "`registerScope` | The register's scope ID. Only that
   register's creations are sent." Moving it to a new @2 register stops
   the host operations of the rooms claimed through the old one
   (`destinationBirth` checks the claim's register against
   `registerScope`) [code]. I built no second route. The planner decides:
   accept that the 09:56 and 14:19 rooms lose host writes, or let the
   setting name more than one register.
2. The production host wiring for an @1 destination (the `bound` check
   with the scope's own version) is source only: the @1 room test drives
   its founding through the test's stand-in wiring, not
   `github-wiring.ts` or `artifacts-wiring.ts` [code].
3. The command line has no way to send a definition's bytes beside an
   intent, so at @2 `act open-issue` and `act open-pr` always answer
   `bad-field`. Opening a lane from the command line needs that [run].
4. `notes/.keep-i5-definition-versions` is the empty push check of the
   brief; delete it at landing if it is not wanted.
5. The gitseq request for this work.

## 6 Decisions followed

- The planner's decisions, not reopened: @1 restored to main's content
  (checked by digest), today's changes as @2, every version served,
  versions read from the genesis, new rooms at the newest, `install` and
  `claim` print them; README at @2 only, with no secret.
- **The story's refusal, settled.** At the base the story expected
  `guard-failed (not-activated)` and got `bad-field`. `bad-field` is right
  for a room at @2: the field states a value place and the command sends
  no value, and the contract refuses a stated place without its value
  (section 6.2, revision 19). `not-activated` is right at @1, which states
  no place. The test now expects `bad-field` for that act, and shows a
  refusal by name with `add-member` and a handle that is no handle,
  `Refused: bad-field (bad-handle)`; both write nothing [run].
- `read-token` on an @1 room is refused `unknown-act`, the scope's own
  answer; the command adds no check of its own [run].
- The register got a version 2 although its data did not change, because
  the version of the directory it creates is part of its meaning [code].

## 7. Combined candidate: membership pin check

2026-10-08, T3 of the one expanded candidate under45/c878. Planner owner
`605bc3ba199d27944369bf3f4fbb5bf2b73fd6d1`, read in full, confirms this was
a CHECK, not a requirement for unequal data hashes. Both membership@1 and@2
retain the exact declaration digest
`sha256:78b3f59009f78030f88d3444187c0c7deb40c296b7f07b18d5e86a161222f831`.
No pin, version or source rule was changed to make them differ.

The catalog supplies the same declaration data with separate version-named
standing wrappers. Membership's role-table rule selects FIRST_ACTIONS_OF from
its actual genesis pin; @2 adds destination.read-token to every first role
list, while @1 does not. Namespace observation and session issuance select
standing using the actual pinned name. Equal data digests do not establish
identical executable meaning or historical admission correspondence.

One focused batch ran on source
`06467a1ead72c63518a05aa18a32967d7d922ba3`, tree
`9da1fa8eab09f082a19253d26e7ee63c7ec126d4`: three files, four tests passed
(2.07 seconds). The platform versions file checks both exact equal pins and
version-selected first lists as plain functions. The scope versions file
checks a real freshly founded@1 room, its@1 standing retained by a dependent
rules act and consistent replay; deliberately substituting@2 code gives a
mismatch. The existing read-token file supplies the real freshly founded@2
membership/session/destination-standing path and replay, with explicitly
scripted Git hosts. These are distinct proofs; the declaration test alone
is not an actual@2 standing witness.

Full-reference boundaries were read in the current source. Session issuance
checks the actual scope/kind/incarnation; final preparation compares the
resolved reference with the complete authenticated claims and checkSession
checks the complete reference. Initial recorded-incarnation lookup may be
nullable and directory resolution trusts the configured directory summary.
Root confirmed this exact landed-main boundary was preserved. This check does
not claim complete historical directory-birth, original bundle/admission or
mixed-era legacy compatibility proof. Those broader obligations remain.

Commands, run once without a gate:

```sh
./node_modules/.bin/vitest run --project platform --project scope packages/platform/test/versions.test.ts packages/scope/test/versions.test.ts packages/scope/test/read-token.test.ts
npm run typecheck --workspace @generalbusiness/artroom-platform
```

Platform source/test typechecks passed. Source was clean at batch start; only
Root's expanded-delivery note was untracked. The recorded relevant source and
witness hashes stayed unchanged through the run; before/after records and
original outputs are in `/tmp/artroom-expanded-membership-pin-evidence`.
No source/witness edit, extra suite, new matrix, cloud call or historical
complete-proof claim was made. The one final integrated gate belongs to Root.

Original focused output SHA-256: a30cd7d2a6a075a80c00f223d5d4ac21f8f034c7719a9ddc862ac0700edce02a.
Original type output SHA-256: 7164e781f55f730d5b11f99c10513168239de3ff338d0315651cb93b32fe3130.
