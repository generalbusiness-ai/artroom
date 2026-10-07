# I5 live operations: delivery

Branch `claude/i5-live-ops-delivery-ttb16z`. The brief named the local
branch `i5-live-ops`; this session may push only under the name above,
so the work is there. It starts at
`origin/claude/i5-claim-live-delivery-mvst61` (head `09c390c9`), whose
history is unchanged. Nothing is deployed, and nothing was run against
GitHub.

Each claim is labelled: **[code]** read from code, **[run]** confirmed by a
run in this container, **[inferred]** neither.

## 1. What is built

Four defects were seen on the deployment this morning. Each has a change
and a test here.

| Defect | Change | Test, by title | File |
|---|---|---|---|
| (1) A register restarted with new settings did not send the creation it had recorded | A scope object's first call after it starts runs one pass of the operations driver, if an attempt is recorded with no time to look at it next | "an attempt recorded while the outside port refused is sent after a restart with a port that accepts, at the first call, which is a read: no commit and no alarm come before it, and it is sent exactly once" | `packages/scope/test/operations.test.ts` |
| (2) `claim` had no resume | A pending claim in the config; a later `claim` goes on from it; `--again` signs a new one | "a claim that gives up waiting is kept as pending; --again signs a new one; after the settings change and a restart, a second run goes on from the pending claim with no further found, and the config never holds a secret" | `packages/cli/test/claim.scope.test.ts` (new) |
| (3) `verify` was incomplete on every scope | Reads of entries by the cause chain, for a signed read and for a membership's session at the register; a signed read of a retained input; `verify` falls back to a signed read where a session is refused | "after the claim, the claim's key reads the register's outcome entry, its record of the directory and the retained inputs they name, and the retained inputs of the directory's genesis; the install's key and a key that signed only another claim are refused them; the replay of the directory over these reads is consistent" | `packages/scope/test/signed-reads.test.ts` |
| | | "a session of the founded membership reads the register's genesis, the claim, its outcome and its record of the directory, and the retained inputs they name; not another founder's entries, not the register's summary or items, and with no session nothing" | same |
| | | "a cause chain is followed through at most four causes: ... an outcome leads to the act that opened its operation, in its own scope only; a delivery leads to the entry that sent it, within the same bound; ..." (extended; made by hand, labelled) | same |
| | | "the claim's key reads the summary, the genesis and every entry of the directory the claim caused, and of membership, the rules scope and the destination ..." (was: the genesis only) | same |
| | | "install, claim by signed reads, ... log and show read the histories back, and verify reports each of the six consistent over the live read surface; a key of another register reads none of it" | `packages/cli/test/story.scope.test.ts` |
| | | "a transport with signed reads signs summary, history, entry, log and retained with their arguments ..." | `packages/client/test/signed-read.test.ts` |
| (4) No deploy document | `docs/deploy.md` | none: a document | |

What each test shows [run]:

- **B, the restart.** A port that refuses leaves the attempt recorded, with
  no alarm. The port then accepts and the object restarts. The first call
  is a read of the operation. The request reaches the port with the head
  unchanged, so no commit came first. After the answer, another restart,
  a driver pass and the alarm send nothing more.
- **A, signed reads.** On a register with two founders, rita and vic, each
  of whom claims: rita's history is `[0, 1, 2, 3]`, vic's `[0, 4, 5, 6]`,
  and the install key's `[0]`. Entry 2 (rita's creation outcome) is 200
  for rita and 403 for vic and the install key. The register retains each
  directory's genesis; rita reads hers (200) and not vic's, and vic the
  reverse. Rita reads both inputs that her directory's genesis retains
  (her claim and its outcome); vic reads neither. The replay of rita's
  directory over her signed reads of the log and of retained inputs is
  `consistent`.
- **A, the session.** Rita takes her seat and first key and gets a session
  from membership. At the register that session reads the history
  `[0, 1, 2, 3]`, entry 2 and her directory's retained genesis (200), and
  not entry 5 or vic's directory's genesis (403). The register's summary
  and its `claim` items are 403, and so is the history with no header.
- **C, the claim.** The register's Git host stand-in sends nothing at
  first. `claim` gives up after 3 reads, with the line naming the resume
  and `--again`. The config then holds `claim: { register, intent,
  handle }` and no repository. `--again` adds a second `found` and a new
  pending digest. The host then accepts and the register restarts. The
  next `claim demo` signs nothing: the register still holds 2 `found`
  acts, each creation was sent once, the directory is the second claim's,
  and the config holds the repository and no pending claim. At each step
  the config holds neither key's secret.
- **D, the story.** With una's session, `verify membership` is
  consistent, and `log` of the register works. With rita's session,
  `verify` of the register, directory, membership, rules scope,
  destination and inbox each report consistent. A key of another
  register gets `Cannot read the history of <register>: forbidden.` from
  `log`, and `... cannot be read: forbidden` with exit 1 from `verify`.
  The story no longer uses the test readers for its verify runs.

Controls [run]. With `scripts/control.mjs`, each "distinguishes":

| Change applied | Tests that failed by an assertion |
|---|---|
| No restart pass (`parked(...).length < 0`) | B |
| No read of an entry by its chain (`leads` removed from `#mine`) | A: the claim's key test, the outcome-entry test |
| `CHAIN_STEPS` 3 (membership's entry 1 needs 4) | A: the claim's key test |
| A register session reads any entry with a root | A: the session test |
| A limited reader reads any retained input | A: the outcome-entry test, the session test |

By hand, for the root project's story and claim tests (change the line,
run `npx vitest run --project scope <name>`, restore):

| Change applied | What failed |
|---|---|
| `claim` never finds a pending claim | C: the second run waited on a third claim and gave up (assertion) |
| No read of an entry by its chain | D: a verify reported `incomplete` (assertion) |
| Before `verify` fell back to a signed read | D: `verify directory` by rita's session reported a missing dependency: the rules scope refused the session (assertion; seen while building) |

## 2. The rules as implemented

**The cause chain of an entry** [code: `packages/scope/src/signed-reads.ts`,
`rootOf` and `Chains`]. From an entry, one cause at a time, until an entry
that has a signer, which is the root:

- an outcome: the entry of the same scope that opened its operation;
- a diagnosis: the entry of the same scope whose send it diagnoses;
- a delivery: the entry that sent it, which the delivery retains;
- a child's genesis: as before, the source genesis whose seed digest is
  the cause, or the act among its retained entries whose intent digest is
  the cause;
- anything else, and an outcome or a diagnosis of another scope, has no
  root.

At most four causes. The root is the signer, its time, its scope and its
position. Each entry is read from the scope's own entries, then its
retained entries, then by the resolver, and must be the entry the fact
names. On the founding, the longest chain is four: membership's,
the rules scope's and the destination's entry 1, through the directory's
entry that the child's confirmation wrote, the child's genesis and the
directory's genesis, to the claim [run: probe of the histories].

**Signed reads** [code: `checkSignedRead`, `Reads.#mine`, `Reads.retained`].
Admission is unchanged: the key signed an entry of the scope within the
window, or the root of the genesis's chain. Then the key reads the
genesis, its own entries, every entry whose root it signed at a time no
earlier than the reading less `intentLifetimeSeconds` (900 seconds), and
a retained input whose digest appears as a JSON string in such an entry.
A signed read may now name `retained`, with the digest as its argument;
an argument is at most 128 characters [code: `SIGNED_READS`, `ARG_CHARS`;
the contract's `SignedReadName`]. The client signs `retained` in
`signedReads` and `signedLogReader` [code].

**A session at the register** [code: `sessions.ts`, `chainedSession`;
`Readers.chained`]. A session that the register's readers port refuses
(the register records no membership) is checked again with the register
in place of the membership reference: MAC, deployment, clock and end. The
read must be `history`, `entry`, `log` or `retained`, and in the
session's reads. The register finds the claim for that membership scope:
a delivery from a directory's genesis retains that genesis, and its sends
name the membership scope's seed; the claim is that genesis's root
[code: `Chains.#memberships`]. The session then reads the genesis, the
entries whose root is that claim, and the inputs they name.

**When roots are found** [code: `object.ts`, `#rooted`]. Before a signed
read of any of the five reads, and before any read by a text reader at a
register, the object finds the roots of the entries that are new since it
last looked, and keeps them in memory. A chain that cannot be read now
stops there, and the next read goes on.

**The restart pass** [code: `object.ts`, `#first`]. The object's first
call, if that call runs no pass of its own, starts one pass of the
operations driver when the store holds an attempt with no outcome and no
time to be looked at next. The caller does not wait for it. A call that
commits, the driver's own call and the alarm run a pass anyway. The sent
mark is unchanged: an attempt marked sent is never sent again.

**The claim** [code: `commands.ts`, `claim`; `store.ts`, `PendingClaim`].
Before it submits, `claim` saves `{ register, intent, handle }`. A refusal
or an unavailable answer removes it; a lost reply keeps it. A later
`claim` with a pending claim for the same register and no repository
reads the register's summary once (its answer is not used), then waits
for the directory whose seed is computed from the pending digest. `--again`
signs a new `found` and replaces the pending claim. Success removes it.

**Verify** [code: `commands.ts`, `sessionFirst`]. With a session, each read
goes with the session; a read refused `forbidden` goes again as a signed
read by the caller's key. With no session, signed reads only, as before.

## 3. Gate

One run, `npm run gate`, at head `feafc2df10b36b7cd1d8e026b21a4bf2937343f9`,
tree `385882292ac53ea00a917be0ac2201079fe639fb`, on this container: 4
CPUs, load average 0.14 before the run, dependencies installed and the
test files compiled by earlier runs. [run]

| Step | Exit | Elapsed | CPU |
|---|---|---|---|
| install | 0 | 4.7 s | 6.0 s |
| whitespace | 0 | 0.0 s | 0.0 s |
| typecheck | 0 | 11.5 s | 36.0 s |
| test | 1 | 63.0 s | 99.7 s |

Vitest: 100 files, 1 failed and 99 passed; 761 tests, 1 failed and 760
passed; 2 errors. The failed test is T36 of
`packages/checkers/test/runner.test.ts`, untouched here: the known failure
of this container's git. The 2 errors are uncaught `write EPIPE` in
`packages/git/test/support/host.ts`, while `packages/git/test/http.test.ts`
and `http-read.test.ts` ran; no file of `packages/git` differs from the
base branch. The log also holds the uncaught "Cannot perform I/O on behalf
of a different Durable Object" that earlier notes report; it failed no
test. The gate stops after the test step, so I ran
`node --test scripts/active-source.test.mjs` alone: 6 passed. [run]

The commit after the gate run adds this note and removes the empty marker
`notes/.keep-i5-live-ops`. It changes documents only; source and tests are
unchanged from tree `38588229`.

## 4. What is owed

1. **The founder's window.** Until the seat, the founder reads the new
   scopes by signed reads only, and those last 900 seconds after the
   claim. A claim whose creation takes longer gives up, and a resumed
   claim after that cannot read the directory either, so it gives up
   again. The restart pass makes the creation prompt once the settings
   are right, but nothing lets a founder go on after the window. [code]
   Gap, not built.
2. **The rules scope refuses a session until its first act** (it records
   membership's ID with no incarnation, `founding-real.test.ts`). `verify`
   falls back to a signed read there, which lasts the founder's window
   only. After it, `verify rules` by the founder is refused until the
   rules scope's first act. [code; inferred for the time after the window]
3. **What "names" means for a retained input.** An entry names an input
   when the input's digest appears as a JSON string anywhere in the
   entry's bytes. That includes the fields of a signer's own act: a key
   that writes a digest it already knows into its act's field reads the
   input under that digest, if the scope retains one. [code] Exact
   enumeration of the places a digest may stand was not built.
4. **Cost.** A retained read by a limited reader scans every entry of the
   scope. Each object finds the root of every entry once per start, at
   its first limited read. No bound beyond the scope's own is set. [code]
5. **The session at the register compares the membership scope's ID**,
   not its incarnation: a seed names no incarnation. It reads nothing
   until the register has recorded the directory's confirmation. [code]
6. **The entry window is not tested apart from admission.** In every test
   the key is admitted by the same claim that is the entries' root, so the
   two windows coincide. [code]
7. **The restart pass needs a call.** A register that no one calls after a
   restart still waits. `claim` on resume reads the register first for
   this reason, and `docs/deploy.md` says to claim after the restart.
   [code]
8. **The creation token's hour.** An installation token used after it
   expires gives no answer; the attempt's outcome is then `unknown`, and
   whether a later attempt follows is the register's rule. Not run against
   GitHub. [inferred]
9. **`docs/deploy.md` was not tried on a deployment.** Its GitHub claims
   (the token kinds; that a `User` account's repository is created as the
   user, which an installation token cannot do) come from the brief and
   from the endpoints in `packages/git/src/github.ts`. [code; inferred for
   GitHub's behaviour]
10. **The page and other clients** are not changed. A client that signs
    the old four reads still works: the scope accepts a superset. [code]
11. **Commits between the first and the last** are not each green: the
    read rule's commit changes what the story expects, which the verify
    commit restores. The gate ran at the head only. [code]
12. **The gate's two EPIPE errors** in the `git` tests, not seen in the
    earlier notes, were not looked into. [run]

## 5. Decisions followed

- Reads by cause chain, extended from scopes to entries: the chain of an
  outcome to its operation's origin, of a creation to its cause, of a
  send to its origin; four steps; the window at the root; the retained
  inputs those entries carry; a membership's session at the register by
  the claim that caused its directory. Everything else stays forbidden.
  [code, run]
- After a restart, the first turn runs one pass if an attempt is
  recorded and unsent; nothing is sent twice. [code, run]
- `claim` resumes from a pending claim saved before the submit, and signs
  a second `found` only with `--again`. [code, run]
- My readings:
  - a diagnosis is a send's cause too (its diagnosed send's entry);
  - "carries" is "names by digest", read as above (section 4, item 3);
  - a session at the register reads entries and inputs, not the summary
    or items, since those show every founder's claims;
  - "first turn" is the first call of a public method or the alarm; a
    call that runs a pass itself starts no second one, and `release` and
    `serving`, which read no scope state, start none;
  - `verify` falls back to a signed read on `forbidden`, so that a scope
    that does not accept the session yet is still read. [code]
