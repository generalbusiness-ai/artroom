# GitHub demo runner delivery

Request `42ad54c2` adds the linked GitHub host to the existing rehearsal
and replaces shot 13's old install lines with an observed two-step
install. All 26 shots are retained. No Page or UI implementation changes.

## Source and observed run

The live run used source `705cb8d739357d6f16617770ae8302fef744677d`,
with the same application, script and test bytes as the focused producer
head `620497ce`. The intervening merge preserved the landed documents.
The service was `https://artroom-scope.inguz.workers.dev`; the planner
confirmed deployment version `ed97eb81`, whose package tree is the
accepted I5 source. This is planner deployment attribution, not a new
independent deployment-image audit.

The run started on 2026-10-08 at `23:45:20.994Z`, using Node `v26.10.0`,
host `github.com` and namespace `generalbusiness-ai`. Root started the
runner once, waited at its pin prompt, then pressed Enter only after the
planner's durable `df6f43f7` assertion confirmed the exact register was
pinned and the other fields and secrets were preserved. The operator
pause was 234 seconds. The runner itself does not inspect the setting.

The process exited 0. Every one of the 26 shots matched, including the
two-step install, repository creation, member read token and clone,
source publication, named controlled-file refusal, controller approval
and publication, bad-path refusal, twelve scope histories and HTTP Site
and Page reads. Refused commands deliberately exit 1; their named
outcomes match the script. No shot was skipped. The rounded per-shot
seconds sum to 357.7, including the operator pause; that sum is not an
independently measured whole-process elapsed or CPU figure.

The exact runner transcript is retained unchanged in
[2026-10-08-demo-github-transcript.md](2026-10-08-demo-github-transcript.md):
25,547 bytes, SHA-256
`92961819619a561f7f66475d754ffb87e5e7733338ebbea62ed25765994f7e69`.
Root read all shot bodies and the expected/observed table. The first
wide table display was clipped; its missing passages were read again in
bounded displays. All invitation strings in this transcript retain the
runner's abbreviated form. Actor keys, private config directories and
capture state are not copied into the repository.

The observed repository is
`generalbusiness-ai/6odmdk3z7ln3rpyrnu66t2ts7mgqv4rtlupshkjsts2adkwdcxra-1`.
At the clone's initial history read it had founding commit `220e521`.
The run then published source commit `800f34199fe011dd9c52ec7f49400521a48a93fa`
and approved controlled-file commit `b6935ea30e96f805319885f3945c5a55c292f713`.
The one-commit description is valid before those later publications.
The runner leaves the repository in place. Cleanup and deployment
credential expiry remain operator duties.

## What changed

- The pin prompt names `GITHUB_APP_CONFIG.registerScope` or
  `ARTIFACTS_CONFIG.registerScope`, according to the selected host.
- Enter records operator confirmation, not a false inspection claim.
  `--setting-set` only skips the pause; it does not reuse an earlier plan
  or prove that a fresh register is already pinned.
- The existing real-scope rehearsal witness covers both production
  host wirings with labelled `Hub` and `OwnGit` stand-ins. It retains
  all 26 shots, identity-stop and secret-withholding controls. GitHub's
  fixture also records the member's `contents:read` token request.
- Shot 13's commands and output now come from this actual GitHub run.
  The earlier own-host scenes retain their original source and run.

## Producer verification

The affected producer checks include both host rehearsals and the issue
scenario: three tests passed, with one opt-in recorder skipped. The
existing edit scenarios separately passed two tests. Script types and
whitespace passed. The initial dependency-link view gave inconsistent
test module resolution; replacing only ignored dependency links with
local workspace links corrected it without a package install or
manifest/lockfile change. An over-specific write-token count in the test
was replaced with the actual invariant: the initial write/read order and
one member read mint. The final gate below covers the composed source.

One final `npm run gate` ran at clean source
`b332e519a9d69e1918391140b0c446a91ed2e229`, tree
`35e801ef843c8297a1f6314a15b0a67f89fba7e6`. The command exited 0:
845 Vitest tests passed, two opt-in recorders were skipped, and all six
active-source checks passed. The gate performed its normal locked
`npm ci` because the previous installation stamp did not match this
lockfile. It changed no manifest, lockfile or tracked source.

| Phase | Exit | Elapsed seconds | CPU seconds |
|---|---|---:|---:|
| Locked install | 0 | 12.1 | 4.6 |
| Whitespace | 0 | 0.0 | 0.0 |
| Types | 0 | 6.9 | 15.7 |
| Tests and active-source checks | 0 | 69.9 | 100.5 |

These are the gate's printed phase costs, not a separately measured
whole-process elapsed figure. It ran on Hugh's macOS machine with the
manifest/checker implementation work active in another worktree. The
dependency installation was renewed; no cold-cache claim is made.

**The exit and tally are qualified by an uncaught runtime diagnostic.**
The raw test log reports `Cannot perform I/O on behalf of a different
Durable Object`, I/O type `RefcountedCanceler`, in Vitest's
`abortContextSignal` / `abortIfTimeout` / `rejectTimeoutError` path.
No test or object owner is identified. This resembles a previously held
timeout-abort family, but this run proves neither the same cause nor a
fix, physical drain or clean runtime. The diagnostic is retained despite
exit 0. No timeout, skip or warning was suppressed, and no whole suite
was repeated to obtain a different log. Planner disposition was requested
in `d2fa6fdd` before final Source filing or landing.

Planner accepted this diagnostic risk for this filing and landing in
`66861d6304cbd61075531db928353049f2fba7c2`. That is the current
owner judgment; it does not identify the cause. Request `45405ec5`
separately requires isolated test localization and a demonstrated fix.
The locked install also reported six vulnerabilities (one low, five high)
and four packages with install scripts outside `allowScripts`. These
are retained tool warnings, without an advisory, reachability or
exploitability assessment. No dependency fix or script approval was made.

The gate output is `/tmp/artroom-demo-github-gate.log`, SHA-256
`d831634f081f10c577c4f636f5decf307a280cae61b67c9b7e296408c4195025`.
Raw phase logs are in
`/var/folders/2x/wylr59t17ds36l1l7ng25y7w0000gn/T/tmp.vb9gDv4HYN`.
Root read the complete test and type logs. The test log's SHA-256 is
`0220af8dc642324e4a0e5612b043874490e8234664071fb4eae34d4aca60aabe`;
the type log's is
`b05ed3728460487c42438640e0ac5e1f38c1944c2c38137be5294ffcecabf447`.
This later delivery-note update changes documentation only; source and
test identity remain equal to the gated head. Independent full
source/evidence review and normal landing remain owed.

## Limits

The live run demonstrates this configured GitHub-backed story. It does
not establish general installation authorization, provider reliability,
credential cleanup, required checks, full native import/history,
cross-device or browser rendering, musical behavior, accessibility,
capacity or whole-product acceptance. Twelve consistent histories mean
the reached histories reported in the transcript, not every possible
history. HTTP 200/title checks are not a browser walkthrough. The pinned
register and later service acknowledgment retain their separate
provenance. No UI rebuild, model, microphone, audio or new cloud coding
session was run.
