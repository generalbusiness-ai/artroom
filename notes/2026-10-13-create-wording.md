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
