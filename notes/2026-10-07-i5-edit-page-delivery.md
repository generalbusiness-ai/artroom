# I5: edit a page, a one-file change judged and published by the room

Branch `claude/edit-page-command-lane-kwzyx4` (the brief's `i5-edit-page`;
this session may push only under the `claude/` name), from
`origin/planner/i5-demo-host` at `5de2b85`. Written 2026-10-07 by a builder
working alone in a cloud container, with no workroom, no deployment
credentials and no network beyond GitHub and the npm registry. Plan 024,
gate 2 in its smallest form; plan 025, section 2, "edit a page"; design
request R5, the small case. Nothing here is deployed.

Each claim is labelled: **[code]** read from code, **[run]** confirmed by a
run in this container, **[inferred]** inferred and not run.

## 1. What is built

**A. The command and the lane.**

- `artroom edit <path> --file <local file> [--title <text>]`
  (`packages/cli/src/commands.ts`, `edit`) **[code]**. It reads the change
  definition that the rules scope holds active, and its bytes, which the
  rules scope retains under the kind `definition`; signs the directory's
  `open-pr` with those bytes beside it; waits for the lane; signs
  `ask-rules` and waits for the rules; signs `propose-file` on the
  destination's head; then merges and waits for the room's answer, and
  prints the commit and the page's address.
- `artroom merge <change>`: `merge` of the current version, naming its
  selected reports, and the wait until the merge is published, refused or
  aborted. A change that waits is merged later with it **[code]**.
- `artroom act ... --value <file>`: a file's text beside the intent, for a
  value place. Without it no person could activate a lane definition or
  open a lane from the command line, because both acts read the
  definition's bytes at a value place **[code]**.
- The lane: one new act, `propose-file`, in `change` and in the demo
  profile `change-demo` (marked "i5 edit" in `change.ts`). The lane had no
  act whose entry carries a file's bytes: `propose-manifest` names a commit
  that a person's hold workspace wrote. Its fields are `base`, `path`,
  `digest`, `size` and `content`; it opens the one version of the change,
  signed by the proposal's author, with `complete` true. The manifest gains
  the slots `path`, `digest` and `size`, and its `integration` and `tree`
  become optional **[code]**. No other row changed. New digests: `change`
  `sha256:3f0389ba...` (59,715 bytes), `change-demo` `sha256:d86c64ae...`
  (43,130 bytes); `issue` and `issue-demo` unchanged **[run: `pin.mjs`]**.

**B. The destination publishes from the lane's entries.**

- `packages/platform/src/destination-objects.ts`: `editPath`, the rules of a
  path that a published tree may hold; `editObjects`, the blob, each tree
  from the root to the file's folder written again, and the commit, on the
  base's objects; `editCommit`, the commit, whose time is that of the entry
  that reserved the publication **[code]**.
- The destination takes a manifest of kind `propose-file`
  (`destination.ts`, `MANIFEST`). The rule `judge` reads the file from the
  manifest's entry that `reserve` retained (`fileOf`), refuses a bad path
  as `path-invalid`, an eighth reason beside the note's seven, checks the
  bytes against their digest and size and the changed set against the
  path (`integration-invalid` otherwise), and reserves the commit that it
  derives from the host's tree (`reservation.ts`, `destination.ts`)
  **[code]**.
- The port (`packages/scope/src/destination-host.ts`): for a one-file
  manifest's `judge` it reads the base's closure from the provider, writes
  the file with `editObjects`, and answers the shared inspection
  (`inspectGit`) of those objects; for its push it builds the same objects
  again and sends them with the base's closure through the provider's
  `send`. Nothing in it is a provider's: both providers' `send` is
  `sendOnce` **[code]**.

**C. Tests**, each passed alone in this container **[run]**:

| Test title (abridged) | Shows | Control that distinguishes |
|---|---|---|
| `lanes/test/edit.scope.test.ts`, "on the hosting's own Git service: found a room; edit README.md ... and the destination replays consistent" | Install, claim, rules published and the demo change definition activated through the command; `edit README.md` published on rita's own merge in an extent that asks no approval; the host holds the new commit, one parent, the founding head, tree `README.md`; the site route's answer has the rendered file, and had `not-found` before; a second edit replaces it; paul, a maintainer, edits `AGENTS.md`: refused `rules-not-met:rules`, nothing pushed, then published after rita's approval for the rules extent; `../outside.md` refused `path-invalid` with no push; a file that is not UTF-8 is not signed; the destination's history replays `consistent`; no token in any history; the publications are `published`, `published`, `not-reserved` (`rules-not-met:rules`), `published`, `not-reserved` (`path-invalid`) | By hand: the port pushing the integration's objects as for any change instead of building the edit's: both tests fail by assertion, the merge never ends **[run, before the test moved from `packages/cli/test` to `packages/lanes/test` with no change to its body]** |
| The same, "on GitHub" | The same story through `github-wiring.ts` and GitHub's provider | The same hand control **[run]** |
| `platform/test/edit.test.ts`, "Git sha1 / sha256 reads an edit's objects as the published tree with one file written ..." | Real local Git: `hash-object` gives each ID, `fsck --strict` passes, the tree equals Git's own `write-tree` for the same index, the file's content, one parent; a folder, a link or a file on the way gives no objects | Unsorted tree rows: `fsck` fails, `DISTINGUISHES` **[run]** |
| `edit.test.ts`, "editPath gives the segments ..." | The path rules | |
| `edit.test.ts`, "the judgment of a one-file manifest ..." | `path-invalid` before what the evidence lacks, after `out-of-date`; bytes, changed set and parent checks; reserved with the derived commit | Path check removed: `DISTINGUISHES`; digest and size check removed: `DISTINGUISHES` **[run, `scripts/control.mjs`]** |
| `cli/test/story.scope.test.ts` (existing) | Now passes: see section 6 | |

**D.** `docs/cli.md` (`edit`, `merge`, `--value`, limits), a section of
`docs/pages.md`, the digests of `docs/lanes.md`, one paragraph of
`docs/testing.md`, and the regenerated `docs/lanes-reference.md`.

## 2. The live procedure

On the deployment, with a room claimed on the hosting's own Git service
(or GitHub), from a checkout of this branch:

1. As the admin, publish the rules, for example the first extents with no
   approval for `source`:
   `artroom act publish --on rules --target 0 --set approvals=0 --set ownerMayReview=false --set checks=[] --set labels=[] --set extents='<JSON of firstExtents({ approvals: 0, checks: [] })>'`.
2. Activate the demo change definition:
   `artroom act activate --on rules --set digest=sha256:d86c64ae0a570165660a6eb4d75153b8c2f59c9cdaec2ecc789e2c38524a17a2 --set name=change --value packages/lanes/definitions/change-demo.json`.
3. `artroom edit README.md --file README.md`. Expect `Proposed ...`,
   `Published: commit <id> ...` and `Page: <base-url>/site/<directory>/HEAD/README.md`;
   open the page; `git ls-remote` with a read token (`artroom clone`) shows
   the commit on the branch.
4. Edit it again with other text: the page changes; the new commit's
   parent is the old one.
5. As a maintainer, `artroom edit AGENTS.md --file AGENTS.md`: expect
   `Not published: ... rules-not-met:rules`. As the admin,
   `artroom act review-verdict --on <change> --set manifest=<version> --set verdict=approve --set extent=rules`;
   then, as the maintainer, `artroom merge <change>`: published.
6. `artroom edit ../x.md --file README.md`: `path-invalid`, nothing pushed.

A running deployment must take a Worker built from this branch: the
platform data of the destination changed (section 5) **[inferred]**.

## 3. Stand-ins and limits

- **The Git hosts** in the end-to-end test are stand-ins (`OwnGit`, `Hub`,
  in `packages/scope/test/hosts.ts`):
  refs and objects in maps, each pushed pack decoded with the git package's
  `decodePack`, each read served with every object. The ports, providers,
  inspection, pack building and the site route are the production code
  **[code]**. Real Git checks the edit's objects in the platform test
  **[run]**; no real host received them.
- **The scheduler** is the test's `pause`, which runs the drivers and
  dispatchers, as in the other command-line stories **[code]**.
- **Text only.** The bytes ride in the signed intent as a text field of at
  most 64 KiB, UTF-8 only; `edit` refuses anything else before signing
  **[code]**. See gap 1.
- **No checks on a one-file version.** It has no tree in the lane, so
  `request-check` cannot copy one, and a room whose rules require a check
  cannot publish an edit **[inferred from `change.ts`; not run]**.
- **One version per change.** `propose-file` opens the only manifest;
  another edit opens another change **[code]**.
- **Who merges.** `merge` needs `change.merge`: admins and maintainers. A
  member's `edit` is proposed, refused `unauthorized` at the merge, and
  waits for someone who holds it **[code: `membership.ts` role lists]**.
- **The tree is the port's statement.** The rule checks the base, the
  bytes and that the changed set is the path alone, and derives the commit
  from the host's tree; it cannot recompute the tree, as it cannot for any
  integration **[code]**.
- `artroom verify` cannot replay a lane or a destination that names one: it
  carries no capability code (`unsupported definition ... git-read@1`)
  **[run]**. The test replays the destination with the production
  capability code, as `wiring.scope.test.ts` does **[run]**.

## 4. Gate

See the end of this note, written after the run.

## 5. What is owed

1. **Gap: bytes by digest from a lane.** The brief asked for a source entry
   carrying the bytes "through the bytes package". A declared definition
   can state no value place (`packages/derive/src/validate/fields.ts`:
   "Only platform data states one, so an act of a declared definition has
   none"), and a detached text cannot be sent to the destination: the
   validator refused `merge` sending one with `redactable-read`, "reads a
   detached text, which only a message to a lane carries" (contract,
   section 6.2) **[run]**. So the bytes are a plain text field, digested
   with the bytes package's `digestBytes`. Binary files and files over
   64 KiB need a contract form: a value place for a declared definition, or
   a detached text to a platform scope. The contract's owner decides.
2. **The lane forms' owner** must adopt or replace the "i5 edit" rows; the
   **authority note's owner** the reason `path-invalid` and the
   destination's one-file reading and commit (`editCommit`'s identity and
   message are this source's).
3. **Platform data changed in place.** `platform:destination@1` now names
   `propose-file` among its manifest kinds, under the same name and
   version. A deployed destination running the older data refuses such a
   `reserve` **[inferred]**; the authority note's owner decides whether
   this is a new version.
4. `artroom verify` needs the lane capability code to replay lanes
   (section 3). The command line would need the derive package's code as a
   dependency; I did not add one.
5. Required checks on a one-file version (section 3).
6. **T36** of `packages/checkers/test/runner.test.ts` fails in this
   container's Git (the brief; section 4) **[run]**; untouched.

## 6. Decisions followed

- The command is `artroom edit <path> --file <local file> [--title <text>]`;
  it opens a change on the room's change lane with a one-file manifest
  (path, digest, size) and the bytes in its entry, so the room, not the
  person, writes the repository; it waits for the publication and prints
  the new commit; the page route then serves the file **[run]**.
- Judged as the lane scenarios judge a change: the real rules scope's
  extents through the real destination; an open extent merges on the
  merger's own act (rules with no approval for `source`); a controlled
  extent waits for the controller **[run]**.
- On merge the destination pushes a commit whose tree is the published
  tree with that file written, through the provider's `send` with the
  receipt as today, on both hosts the same way **[run]**.
- A second edit of the same path replaces it; a path outside the published
  tree's rules is refused by name, `path-invalid` **[run]**.
- One new act kind, `propose-file`, because the lane had none whose entry
  carries a file (section 1A) **[code]**.
- **The refusal of `story.scope.test.ts`.** Since the lane wiring stated a
  value place on the directory's `definition` field, a digest with no
  bytes beside it is refused `bad-field` before any guard, as the contract
  refuses a place without its value; and with the bytes beside it, a
  definition the rules scope never activated is refused
  `guard-failed (not-activated)`. Both answers are right for their inputs.
  The test's act had no way to send bytes, so its input changed under it.
  I fixed the test, not the command: it now sends a made-up value's bytes
  with `--value` under that value's digest and expects `not-activated`, and
  keeps the digest with no bytes, expecting `bad-field` **[run]**. (A first
  version named the demo issue definition; the gate's layering script
  refuses a command-line test that names the lanes package.)
- Plain English, no product named in documents but GitHub and "the hosting's
  own Git service"; nothing deployed.
