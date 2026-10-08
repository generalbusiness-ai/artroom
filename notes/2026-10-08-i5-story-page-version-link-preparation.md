# Story page version link preparation

Request `91bd9bf008a8ab0b875cf62fd7c313510023e249`, promise `6e92b2a5`;
planner finding `3dff`. Prepared on invitation repair
`e1c509e02de7c4eff4ab2510e673b2f6dba87c9f`, without importing the later
navigation branch or changing the site route.

The Version screen used `Manifest.file.page`, an address built with mutable
`HEAD`, even for an unpublished invalid `../outside.md` proposal. It now
shows no rendered Version link. Invalid paths use the existing `editPath`
validator; unpublished versions say so. A published version shows the full
recorded publication commit as text and says its rendering is not yet
available. Separate "Latest published site" navigation retains `HEAD`.
The prior invitation draft repair is unchanged.

The recorded content commit is `Merge.commit`, read from the lane's merge
item, whose published update names the destination's published content
commit. It is not the manifest's integration field. The current page's
`Publication` type holds id, state, reason and operation attempts; it holds
no receipt selector. The destination's receipt is a separate item, and
`receiptObjects` constructs a separate parentless commit containing
`receipt.json`. Neither its commit nor a successful receipt operation is
substituted for the content commit.

An immutable rendered link cannot work on this branch. `commitOf` in
`packages/scope/src/site/route.ts` resolves only `HEAD` or named branches
and tags. A raw commit segment is looked up as a branch/tag name. The page
therefore does not manufacture a raw-commit URL or extend access policy.
A working publication-eligible immutable selector remains the existing
site owner's integration obligation, including its receipt/authority proof.

The focused `test/version-view.mjs` browser witness bundles the actual view
module and supplies views made by hand. It checks the refused invalid
path, an unpublished version, and a published version: no Version anchor,
full recorded content commit, and a separate latest-site address. No
scope or provider runs, and every possible network request is aborted.
The control reinstates the old HEAD anchor and fails the invalid-path
anchor assertion. This is UI/source evidence, not a live render, publication
proof or fresh-person browser workflow.

The screenshot script now follows latest-site navigation, and its recorder
also retains the latest site's root response. Existing committed images
are historical and were not retaken; they are not evidence of this repair.
Page typecheck, generated-assets parity and the focused browser witness are
the component checks. The repository gate and independent source review
remain obligations of the selected integrated candidate.

Retained component check outputs (all on this preparation):

- `/tmp/artroom-story-page-version-view.log`: one DOM script passed, with
  three views made by hand (invalid, unpublished, published).
- `/tmp/artroom-story-page-version-control.log`: the one old-anchor control
  failed the expected invalid-path assertion (one anchor instead of zero),
  then restored the view source.
- `/tmp/artroom-story-page-version-build.log`: the canonical page build
  wrote the generated Worker module.
- `/tmp/artroom-story-page-version-typecheck.log`: all three page TypeScript
  configurations passed.
- `/tmp/artroom-story-page-version-assets.log`: one file, one parity test
  passed; recorded duration 86 ms.
- `/tmp/artroom-story-page-settings-preserved.log`: the existing invitation
  DOM script passed with its scripted HTTP replies.

The recorder, story scenario and screenshot script were not run in this
preparation. Their edits only keep future capture navigation consistent
with the UI; no new scene, image or live-provider evidence is claimed.
