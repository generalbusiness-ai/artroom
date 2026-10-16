# Create rooms in the CLI and Page

Request `beb2bf650457bc56ca45626ecdc7857ce8b429d7`, promised by
`1bfac6d7de448d38706161576db02b8a2b915a07`. Planner order
`bb130d7bb5ccfdd2bd4526c21f9cd0648cde9300` starts this work when the minimal
rename lands. This isolated candidate starts from main
`b5d153498879a8e3efc13c87404b9778654e235b`, tree
`b082cbf59f0d305fa82ab84fb2357caa26d0e1eb`.

## Public commands and messages

`dap create` uses the existing `claim` workflow, its options, and its exact
saved requests. Usage, CLI guidance, retry commands, and docs/cli.md teach
`create`. Successful creation prints `Created`.

`dap found` uses that same workflow for one release. It prints:

```
Use dap create instead of dap found. The found alias remains for one release.
```

The existing `claim` command stays compatible with Page adapters, retained
workflows, and existing tests. There is one creation implementation.
Neither alias changes the signed act, custody record, deadline, or recovery.

The Page's eligibility refusal says `creation policy`. Page and CLI display
`creation-policy` for a refusal named `founding-policy`, and `initial-key`
for a refusal named `founding-key`. The received answer stays unchanged.
The room initialization banner says `creator` instead of `founder`.
Saved-step recovery names the `create` step in its explanation. Native
creation and enrollment checks still use their original names.

The Counter's authored production browser code has no creation wording to
replace. Its `not-found` strings are lookup-result codes in the fake preview
and test fixtures, not room creation names. No Counter source changes here.
No Jam application file or UI layout changes here.

## Recorded words that remain

The native act is still `found`. The register and membership retain
`founding-policy`, `founder-key`, `founding-key`, `founder`, `founders`,
`founderHandle`, `foundingKey`, and `foundingHandle`. The default recorded
handle `@founder` remains an identity value. Internal `found` variables that
hold search results remain. Literal records and user-authored content are
not rewritten by these display changes.

The recorded definitions and their explanation remain in these files:

- packages/platform/src/register.ts, directory.ts, membership.ts,
  destination.ts, destination-objects.ts, demo-register.ts, rules.ts,
  extents.ts, and index.ts.
- packages/contract/src/intent.ts, entry.ts, transport.ts, session.ts,
  result.ts, and read.ts. Some `found` matches are lookup terminology.
- docs/lanes-reference.md, scopes.md, protocol.md, pages.md, demo.md,
  public-sdk-release.md, testing.md, and manual/life-of-an-act.md.
- docs/cli.md distinguishes the public command from the recorded `found`
  act and explains the founder's existing membership authority.
- packages/cli/src/commands.ts and store.ts retain protocol names,
  recovery field names, and comments about the original signed requests.
- packages/page/src/claim.ts and main.ts retain internal recovery names
  and comments. data.ts retains its search-result variable `found`.
- Existing tests, historical notes, and plans retain recorded terms and
  their original evidence. The two selected CLI witness names now describe
  the new public command coverage.

This inventory comes from a static word census of those authored files.
Generated modules were not decoded or edited. Definition bytes, their
pinned digests, environment names, launcher paths, storage keys, and all
workspace package names are unchanged from the landed rename.

## Validation remains unrun

No runtime, import, dependency materialization, install, producer, test,
gate, browser, provider, publication, or filing command ran for this
candidate. The source is prepared for Root's review of the execution plan.
The committed Page module is unchanged and is stale for this candidate.
Counter source and generated assets remain unchanged; no new producer
correspondence or browser acceptance is claimed.

The existing native CLI recovery witness now begins with `create`, resumes
its same saved envelope through `found`, checks the alias notice, and still
checks no second enrollment or signing-key exposure. The existing native
CLI story now succeeds through `create`. These are real scope and read
boundaries with the tests' existing Git-host and scheduler stand-ins.

The existing Page join projection witness checks both displayed policy
names and preservation of the native refusal. Initialization and shell
sending witnesses keep their original behavior assertions with the revised
banner. No new heavy suite or parallel native fixture was added.

After Root reviews the source and execution plan, run the normal Page
producer once, the selected CLI recovery and story witnesses, the changed
Page join, initialization, and sending witnesses, their owning compiler
checks, and the ordinary gate once at the final source head. Preserve any
failed run before completing failed or unrun selections. The gate owns
unchanged Counter asset correspondence; no separate Counter regeneration
is justified by this source change alone.

Start's separate candidate overlaps CLI command dispatch and workflow,
Page claim, and CLI docs. Compose it after review against the actual
receiving main, preserve its cohort defaults and recovery checks, and
review the resulting source before running any producer. No Start change
is included or claimed here. Full checker review, requester ratification,
and normal landing under the original request remain due.

## Final delivery evidence

This section updates the preparation checkpoint above. Its unrun statements
remain a record of that earlier checkpoint, not the current result.

Root reviewed the source and inert execution plans before each release.
The owned dependency namespace was materialized once from the reviewed
3,882-file donor, with all 12 workspace links, six final dap names, and the
unchanged lock. No install ran. The normal Page producer ran once with exit
0 and its final guards passed. Root independently parsed the generated
module and matched the exact dist bytes before committing only that module
as `f80ae6f404733f7417d29e94c73cf4f3fc2e35c4`, tree
`c0f300c30fc10087dc08e906dcbb3bb57e304ee0`.

The resulting module SHA-256 is
`aa9d74d79c4da3decd9008bfa0ce224066e700321bf22a0f84e36a6b4853ab41`.
HTML is 25,162 bytes, SHA-256
`94589216e00f4605e78d2e936381eb49037c149b956c3da9c338d8595cd8073b`.
JavaScript is 581,584 bytes, SHA-256
`6ed44bc0e1766a30ad7d919729ab28ac33b1284e88f84b0dca4729edab448057`.

Original focused handle 1020 ended with exit 0. All eight owning compiler
roots passed. The five explicitly selected whole files ran exactly seven
cases, all passed, with no extra, missing, duplicate, or pending cases.
Its final Source, tool, dependency, and namespace guards passed. This
covers the CLI's create command, printing found alias, retained claim
compatibility, native recovery, and the changed Page projections. The
native hosts and scheduler retain their labelled stand-in boundaries.

Original ordinary gate handle 20497 ended with exit 1 at generated `f80`.
Whitespace and whole-repository typecheck phases passed. Vitest passed
1,037 cases, failed five, and retained two original skips. The Node and
Counter phases after Vitest were unrun because the command uses `&&`.
The gate's final Source and dependency guards passed. Its original result
and log hashes remain intact.

All five failures were in the existing demo rehearsal file. Its shot 3
expected `Claimed demo:` while the revised CLI printed `Created demo:`.
That mismatch prevented capture of the room's identities and stopped
later shots. The repair changed only three lines of
scripts/demo/rehearse.ts: the title is `Create the room`, the typed public
command is `dap create`, and the expected prefix is `Created`. Founder
actor roles and identity placeholders, native intents, and retained
compatibility remain unchanged.

The repair was committed as
`2786a88ca2005cb662f74b73e97f00eceaee4f5d`, tree
`4b515cef949e91777b115d46a0481f133ff556e1`. Root reviewed the repair and
completion plan before execution. This script is not a Page or Counter
production input. Their generated bytes remained exact, so no
producer repeated.

Bounded completion handle 29296 ended with exit 0 at repaired `2786`.
It ran only the five original failed native cases, all passed, with no
unexpected case and no recorder execution. Their existing 240,000 ms
whole-case deadlines were unchanged. The originally unrun Node checks
then passed all nine cases, and Counter checks passed all 55. Every phase
ended with exit 0, exact counts, and passed final guards. The original
1,037 passed cases, whole gate, typechecks, focused checks, and producers
were not repeated. The failed gate and successful completion are distinct
results; this is not a claim of one green gate at the repaired head.

The final delivery commit changes only this note relative to tested
`2786`. The public final-source proof compares every other tracked byte
with that tested head. No further checks are required for this note-only
commit under docs/testing.md. No deployed, browser, provider, or human
acceptance is claimed. Full checker review, requester ratification, and
normal landing under the original request remain due.

The checker evidence allowlist is under
`artroom-diagnostics/create-wording-execution-preparation/review-public/`.
It admits only five projected public proof files and the allowlist itself.
Paths and hashes inside those files identify preserved originals; they do
not authorize traversal into private logs, helpers, dependency seals, or
other referenced paths. The four execution projections are:

- producer.public.json: 2,392 bytes, SHA-256
  `fe2ea53a9890a29978e1a9f1db4847866cd163a05746544fe0d37cd511260263`.
- focused.public.json: 3,443 bytes, SHA-256
  `0954cbb87edfc1f6b47f72c793477beef17db02edbd23b3e970063b26c457a75`.
- gate.public.json: 2,298 bytes, SHA-256
  `290cad6b86e31aa3206709de76b18195f04c8d005859527ba7f33270d6be0ed7`.
- completion.public.json: 2,464 bytes, SHA-256
  `441518ae4a29e40434b7af9223ed75f535041fd254e690d6c124a04d393184b3`.

The fifth proof, final-source.public.json, records the final note-only
head, tree, and byte comparison. The allowlist pins its exact final hash.
