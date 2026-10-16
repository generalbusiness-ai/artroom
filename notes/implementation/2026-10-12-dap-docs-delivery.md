# dap documentation head: delivery note

Documentation writer, 12 October 2026. Plan 028, step 3. Branch
`request/dap-docs-head`, based on main `d309b6b9`. The head commit is
named in the reply that delivers this note. The planner's three
additions of 12 October (the positioning sentence, the word list, and
the word rules) are applied.

## Pages written, with their modes

| Page | Mode | What changed |
|---|---|---|
| `README.md` | explanation | New. Positioning sentence, what dap is, the actor model in one paragraph, the three applications, where to read next. |
| `docs/what-is-dap.md` | explanation | Rewritten from the old overview: positioning sentence, framework, actor model, applications, how you take part today. The review flow is on the room's pages. |
| `docs/architecture.md` | explanation | Rewritten: scopes and definitions, acts, entries and receipts, derivation, composition and delivery, authority observations, the three places the record lives, then today's deployment. |
| `docs/build-a-counter.md` | tutorial | New. Builds a smaller Counter definition in five steps and runs each one. |
| `docs/write-an-application.md` | how-to | The how-to parts of the old start page: item types, acts, invariants, validation, pins, scenarios, and creating a scope under a definition. The walkthrough is gone. |
| `docs/manual/ten-terms.md` | explanation | Rewritten as the framework word list: scope, definition, act, entry, commitment, hold, plan and concern, rules, destination, replay. Keeps its path and its source-and-acceptance section. |
| `apps/room/docs/room-terms.md` | explanation | New. The room's terms (room, member, lane, issue, change, review, check, land) and what replaced proposal, policy and attention queue. |
| `docs/README.md` | index | Reordered: the framework, then dap-room, dap-counter and dap-jam, then operating guides. Within each group: learn, understand, do, look up. |
| `examples/counting/README.md` | explanation | New opening that says the Counter is an application built on dap and links to the framework pages. The existing content stays below. |
| `docs/lanes.md` | pointer | New. A short pointer to the moved lanes guide. See open question 3. |
| `scripts/check-doc-links.mjs` | script | New. The link checker. |

Product name, and the planner's word rules, only: `docs/scopes.md`,
`docs/cli.md` ("The dap command"), `docs/pages.md`, `docs/manual/record.md`,
`docs/manual/life-of-an-act.md`, and the moved room pages. Verb-phrase
titles and the product name: `docs/deploy.md` ("Deploy the scope Worker"),
`docs/demo.md` ("Rehearse the demo"), `docs/release.md` ("Release the
packages"), `docs/public-sdk-release.md` ("Produce the public SDK"),
`docs/hosts.md` ("Configure a Git host") and `docs/testing.md` ("Test
dap"). `docs/protocol.md` and `docs/policy-pack.md` stay marked inactive
and change only the product name. `docs/lanes-reference.md` is generated
and is unchanged.

## Moves

Each move is a `git mv` in a commit with no other change, `9fff951` and
`fc26139`, so history follows.

| Old path | New path |
|---|---|
| `docs/manual/what-is-artroom.md` | `docs/what-is-dap.md` |
| `docs/manual/architecture.md` | `docs/architecture.md` |
| `docs/start.md` | `docs/write-an-application.md` |
| `docs/manual/roles-and-membership.md` | `apps/room/docs/roles-and-membership.md` |
| `docs/manual/reviewing.md` | `apps/room/docs/reviewing.md` |
| `docs/manual/landing.md` | `apps/room/docs/landing.md` |
| `docs/manual/contribute.md` | `apps/room/docs/contribute.md` |
| `docs/manual/first-change.md` | `apps/room/docs/first-change.md` |
| `docs/manual/ledger.md` | `apps/room/docs/ledger.md` |
| `docs/lanes.md` | `apps/room/docs/lanes.md` |
| `docs/page.md` | `apps/room/docs/page.md` |

`docs/manual/ten-terms.md`, `docs/manual/record.md` and
`docs/manual/life-of-an-act.md` stay in `docs/manual/`.

## Names

Package names use the plan's new names: `@generalbusiness/dap-contract`,
`dap-bytes`, `dap-derive`, `dap-scope`, `dap-client`, `dap-replay`,
`dap-git`, `dap-checkers`, `dap-cli`, `dap-room` (for the old
`artroom-platform`) and `dap-room-page`. The command is `dap`, in commands
and in transcribed output. These keep the name artroom because they are
source values at this base: Worker names and hosts, `ARTROOM_HOME` and the
config directory, the default namespace `artroom` and `artroom-demo`,
byte-domain tags such as `artroom-definition-1`, `refs/artroom/...`,
`artroom-invite:` links, the `artroom-page` storage key, `ArtroomError`,
and the `artroom-replay` command (open question 1). The inactive pages
keep the earlier model's package names, which have no new names in the
plan.

## What I ran, and what is labelled as not run

Ran, with `node` v22.22.0 in this checkout after `npm ci`:

- Every code block and every output in `docs/build-a-counter.md`. The
  page was generated from the same files that were run, stage by stage,
  and each output block is the captured output. The final stage also ran
  `examples/counting/definition.ts` through the validator: its digest
  equals the pin `sha256:435d9f57...`. The Counter's tests passed: 2 files,
  8 tests.
- The validation command and the pin and reference commands in
  `docs/write-an-application.md`. Both printed what the page shows. The pin
  script now prints six definitions (the page shows all six), and no
  generated file changed.
- `scripts/check-doc-links.mjs`, and the gate below.

Labelled on the page as not run:

- `docs/build-a-counter.md`: the deployed Counter page, its speech, and
  acts signed by enrolled keys against a hosted scope.
- `docs/write-an-application.md`: both paths in "Create a scope under the
  definition" (activating a lane definition, and `establish-application`).
- `docs/what-is-dap.md`, `docs/architecture.md`, `docs/manual/ten-terms.md`
  and `apps/room/docs/room-terms.md` claim no run.
- The room's moved pages keep their existing UNRUN banners and
  qualifications unchanged.

## Link check

```sh
node scripts/check-doc-links.mjs
```

Result at the head: `239 relative links checked, 0 broken.` Exit 0.

The script reads every Markdown file in the repository except
`node_modules`, `.git`, `notes/`, and every `test/` directory, whose
Markdown files are fixtures. It also skips `plans/` and `spikes/parked/` by
default: both are history that this head may not edit, and they hold 70
broken links (`node scripts/check-doc-links.mjs --history`). At main
`d309b6b9`, the same script reports 6 broken links outside history and 76
with `--history`. So this head fixes the 6 and leaves the history alone.

## Gate

`npm run gate`, run once at `21ea303` (the head before the final
Markdown-only commit), with `/usr/bin/time` installed:

```
head 21ea30365280d26b878387aabf2fecd2a3aee1b8  tree a0825311a33143e46b25fdb5779c2ab4dcf0d97c  changed files 0
install    exit 0  elapsed    6.5 s  cpu    9.0 s
whitespace exit 0  elapsed    0.0 s  cpu    0.0 s
typecheck  exit 0  elapsed   21.4 s  cpu   66.0 s
test       exit 1  elapsed  430.5 s  cpu  505.8 s
 Test Files  2 failed | 181 passed | 1 skipped (184)
      Tests  4 failed | 1034 passed | 2 skipped (1040)
     Errors  1 error
```

The gate failed. The four failing tests are all in `packages/checkers`,
and each one's runner checkout returns `checkout-failed` under the
container's git 2.43.0:

- T36 in `test/runner.test.ts`, the expected failure;
- two more in `test/runner.test.ts`: "reservation objects produce a
  private exact two-file Git checkout..." and "the runner fetches only the
  named reservation ref...";
- one in `test/reservation-record.test.ts`: "the same recorded Scope
  reservation is imported, staged under its exact ref...".

The brief named only T36. To check that the other three are not this
head's, I ran only those two test files on a clean worktree of
`origin/main` `d309b6b9`: the same 4 tests failed and 5 passed. This head
changes no code. Outside Markdown it adds only
`scripts/check-doc-links.mjs`, which no test runs.

The one error is an unhandled `EPIPE` from
`packages/git/test/support/host.ts:80`, reported against
`packages/git/test/http.test.ts` ("Web smart HTTP initializes and deletes
exact refs on local Git..."). That test's own result is not among the
failures. I did not run it again. Because Vitest failed, the chained Node
checks in `npm test` (the repository cases and the Counter browser
cases) did not run.

The final commit changes Markdown only: two sentences in
`docs/architecture.md` and `docs/what-is-dap.md`, and this note.

## Words: what remains

The forbidden words and phrases ("admission", "ordering", em-dashes,
"services at software scale" and close variants, comparison statements,
hosted sign-up or "Start a room" as available) do not appear in any page
this head changed, with two exceptions that follow the brief's rule for
inactive pages: `docs/protocol.md` (62 "admission", 58 forms of "admit",
28 em-dashes, 68 forms of "found") and `docs/release.md` and
`docs/policy-pack.md` (one form of "admit" each). Those pages change only
the product name.

Two uses stay on purpose. `apps/room/docs/ledger.md` row 24 is a planned
page titled "Moving from pull requests", about GitHub's pull requests,
not the room's changes. Commands in the tutorial name `npm` and `vitest`
because the reader runs them.

Pages this head did not touch that still contain "admission", "found" in
any form, or "pull request", with counts. The "found" count includes the
past tense of "find" and code names such as `found`, so it overcounts the
verb.

```sh
for f in $(git ls-files '*.md' | grep -v -E '^(notes|plans|parked)/'); do
	git diff --quiet origin/main -- "$f" 2>/dev/null || continue
	c1=$(grep -c -i -E '\badmission\b' "$f"); c2=$(grep -c -i -E '\bfound(s|ed|ing)?\b' "$f"); c3=$(grep -c -i 'pull request' "$f")
	[ $((c1+c2+c3)) -gt 0 ] && echo "$f admission:$c1 found:$c2 pull-request:$c3"
done
```

| Page | admission | found | pull request |
|---|---|---|---|
| `docs/lanes-reference.md` (generated) | 0 | 1 | 0 |
| `examples/counting/browser/design/implementation.md` | 2 | 0 | 0 |
| `examples/counting/commitments-README.md` | 3 | 0 | 0 |
| `packages/bytes/README.md` | 0 | 3 | 0 |
| `packages/client/README.md` | 0 | 6 | 0 |
| `packages/contract/README.md` | 0 | 1 | 0 |
| `packages/derive/README.md` | 6 | 5 | 0 |
| `packages/git/test/fixtures/own-host/README.md` | 0 | 1 | 0 |
| `packages/lanes/README.md` | 0 | 3 | 0 |
| `packages/page/test/screenshots/README.md` | 2 | 0 | 0 |
| `packages/page/test/screenshots/claim/README.md` | 1 | 2 | 0 |
| `packages/page/test/screenshots/label/README.md` | 0 | 1 | 0 |
| `packages/platform/README.md` | 0 | 1 | 0 |
| `packages/replay/README.md` | 1 | 5 | 0 |
| `packages/scope/README.md` | 2 | 34 | 0 |

## Jam README text

The planner applies this as the opening paragraph of the jam repository's
`README.md`. Its links name the dap repository's `main` branch, so they
resolve once this head lands.

> dap-jam is an application built on
> [dap](https://github.com/generalbusiness-ai/dap), a programmable
> coordination fabric for people and agents. Musicians improvise together
> in a room: the record holds themes, interpretations, instrument claims
> and patterns, and a live layer plays the patterns. dap is a framework
> for collaborative applications based on an event-sourced actor model. A
> scope is an actor that holds an ordered record and judges signed acts
> against its definition, and an application is a set of definitions.
> Read [What is dap?](https://github.com/generalbusiness-ai/dap/blob/main/docs/what-is-dap.md)
> and [The architecture of a dap application](https://github.com/generalbusiness-ai/dap/blob/main/docs/architecture.md)
> for the framework, and [Write an application](https://github.com/generalbusiness-ai/dap/blob/main/docs/write-an-application.md)
> for how its definitions are declared. The jam's page is deployed.
> Recording its musical acts in native dap scopes is later work.

## Open questions for the planner

1. **The replay command's name.** The plan names the `dap` command but
   not the replay binary. The pages keep `artroom-replay`, as
   `packages/replay/package.json` has it. If the rename head renames it,
   `docs/scopes.md` and `docs/public-sdk-release.md` need the new name.
2. **Where `lanes` lives in `dap-room`.** `apps/room/docs/lanes.md`
   still imports `issue` from `@generalbusiness/artroom-lanes`, because
   the plan says only that lanes become "part of dap-room" and gives no
   export path. The rename head should state the import.
3. **The `docs/lanes.md` pointer.** `packages/lanes/scripts/reference.mjs`
   writes the link `lanes.md` into the generated `docs/lanes-reference.md`,
   and `packages/lanes/README.md` links to `../../docs/lanes.md`. This
   head may not change either, so `docs/lanes.md` stays as a pointer.
   Remove it when the generator and that README name
   `apps/room/docs/lanes.md`. `plans/025-2026-10-06-current-manual-inventory.md`
   also links to `docs/lanes.md` and resolves through the pointer.
4. **Product names in how-to and reference pages.** The new pages name
   no product but GitHub and Cloudflare's parts, except the commands a
   reader runs. The existing how-to and reference pages still name
   tools their commands need (Node, npm, wrangler and others). Changing
   them goes beyond a product-name change, so this head leaves them.
5. **Rules scope versus named rules.** The word list gives "rules" one
   meaning, the rules scope, and calls a definition's named expressions
   "rule guards". `docs/scopes.md` and the how-to still say "named rules"
   for those expressions, as the source does. Decide whether the word
   list should name both.
6. **The ledger.** `apps/room/docs/ledger.md` rows 01, 04 and 44 describe
   the review of the earlier versions of What is dap, the ten terms and
   the architecture page. Those pages are now rewritten, and each says
   that review of the new version is owed. The ledger itself changed only
   in names and links.

## Revision 1, 12 October 2026

The checker reviewed the branch at `52180d64` and asked for five changes.
They are on the same branch, on top of `52180d64`, with no rebase. The
gate was not run again.

1. **Names in transition.** `docs/README.md` has a new section, "Names in
   transition". It says that the pages use the final names, that at this
   commit the command is `artroom` and the packages are
   `@generalbusiness/artroom-*`, with a table read from each
   `packages/*/package.json`, and that the rename lands as its own change.
   It also names what keeps its current form: `artroom-replay`, the
   `@generalbusiness/artroom-lanes` import and the source values. Each page
   with runnable commands or imports in the new names links that section
   once, just before its first command: `docs/cli.md`, `docs/demo.md`,
   `docs/deploy.md`, `docs/hosts.md`, `docs/pages.md`, `docs/scopes.md`,
   `docs/testing.md`, `docs/write-an-application.md`, and in
   `apps/room/docs/` `first-change.md`, `landing.md`, `lanes.md`,
   `page.md`, `reviewing.md` and `roles-and-membership.md`. No code was
   renamed.
2. **Activation file path.** The command in `docs/write-an-application.md`
   now reads `--value packages/lanes/definitions/change-demo.json`, run
   from the repository root, because the command line reads the file at
   the path given. Not run: it needs a deployed room. The page already
   labels both creation paths as not run.
3. **Heading anchors.** `scripts/check-doc-links.mjs` now blanks fenced
   code for both jobs, but strips inline code only where it reads links.
   Headings keep their inline-code text without the backticks before the
   slug, so "The hosting's own Git service (host `artifacts`)" gives
   `#the-hostings-own-git-service-host-artifacts`, and the lane reference's
   "`issue`" gives `#issue`. The witness is a self-test mode:

   ```sh
   node scripts/check-doc-links.mjs --self-test
   ```

   It checks a fixture with a heading that holds inline code, three
   repeated headings, a heading inside a fence and a heading with a
   command in code. It reads no other file. Result: `self-test passed:
   host-artifacts, notes, notes-1, notes-2, use-dap-verify---all`, exit 0,
   0.05 seconds.
4. **The derivation boundary.** `docs/architecture.md` no longer says "and
   nothing else". It says that replay does not call the runtime, that
   both use the same derivation code, `dap-derive`, on the types of
   `dap-contract`, and that replay also depends on the stored entries and
   retained inputs it reads.
5. **Two repairs.** `docs/deploy.md` now links
   [The page](../../apps/room/docs/page.md) where it named `docs/page.md`.
   `docs/cli.md` spells the merge command `dap merge`, as the rest of the
   page does, and the page links the transition section.

Also: the caution that deleting a token's plaintext does not prove that
the provider revoked the token is back. It is in `docs/hosts.md`, in the
paragraph on how the hosting's own Git service keeps creation tokens, and
in the deployment section of `docs/architecture.md`, which links there.
One more "founding" in `docs/scopes.md` now reads "first commit".

Link check, rerun at the revision head:

```sh
node scripts/check-doc-links.mjs
```

Result: `256 relative links checked, 0 broken.` Exit 0.

The search for the forbidden words on the pages this revision changed
finds no "admission", "admit", "ordering", em-dash, "software scale",
"Start a room" or "pull request". "found" appears only as `not-found`,
as "not found" in an exit-code list, in test file names such as
`founding-real.test.ts`, and in the quoted README sentence that the
destination writes ("Founded by <handle> through the room ...").

## Revision 2, 12 October 2026

The checker's second review (report `ee490c5d`) asked for one change,
made by the planner on the same branch:

- **Room glossary, both forms of a version.** `apps/room/docs/room-terms.md`
  no longer says that every version of a change is a selection of reports
  with an integration commit. It describes the two forms the change
  definition permits: the one-file version that `propose-file` opens (path,
  digest and size; the destination supplies the integration commit and the
  tree) and the report version that `propose-manifest` opens. It also
  separates the words the page shows from the native item names: the
  definition keeps `proposal` for the change item and `manifest` for a
  version (`packages/lanes/src/change.ts`).

Link check rerun at this head: `node scripts/check-doc-links.mjs`.

Filing note: the whole 33-path set is published once more at this head so that the review binds one head.

Revision 3, 12 October 2026, 16:35: the branch is merged with main cf22cdc5 so that docs/deploy.md carries the landed homepage section (checker report cb479790); no other page content changes.
