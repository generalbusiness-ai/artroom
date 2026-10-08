# Gate 1 GitHub live witness

Producer `f8a56f1c`, request `225da894`. Builder's observed run on
2026-10-07, from gated source `dfaa5395023f09adc71c8587dca3d74b65a86d0c`.
The delivery note states scope, failed observations and remaining work.
This is the secondary GitHub component under planner decision `97821ea7`.

## Commands and results

The source CLI's installed tsx 4.21.0 loader ran on Node 26.10.0. Keys were
generated and kept in the owner-only local demo directory. This operator is
builder's stand-in for a person; the `@hugh` member label is no human sign-off.

```sh
ARTROOM_HOME=/Users/hughpyle/.config/artroom/demo-public-2026-10-07-builder \
  packages/cli/bin/artroom.js install https://artroom-scope.inguz.workers.dev \
  --host github.com --namespace generalbusiness-ai
# exit 0; whole-command wall 1.385 s
# Installed register sc_fcwgzdw47nyyxwkw4dtduajmpaccfgayqne7l4xghvbu3z7llzta.

# Explicitly configure GitHub App, creation/read bootstrap credentials and
# that exact register pin through stdin, then restart by deploying source.
# The operator helper is /tmp/artroom-builder-gate1-provision.sh.
# Creation uses the hourly Administration installation token, not the later
# durable fine-grained token. Destination mints remain repository-ID scoped.
# Provision exit 0, wall 8.807 s; no secret value in output or arguments.

cd /tmp
npx --yes wrangler@4.147.0 deploy --keep-vars \
  --config /Users/hughpyle/play/artroom-worktrees/demo-git-host/packages/scope/wrangler.jsonc
# exit 0; wall 6.271 s; source version a6bff5d3-f02e-41de-a4ba-08041327b6e4
# 1367.46 KiB uploaded, gzip 320.92; startup 13 ms.

ARTROOM_HOME=/Users/hughpyle/.config/artroom/demo-public-2026-10-07-builder \
  /Users/hughpyle/play/artroom-worktrees/demo-git-host/packages/cli/bin/artroom.js \
  claim demo-public-2026-10-07 --handle @hugh
# exit 0; wall 7.474 s; directory, membership, rules, destination and inbox
# created and confirmed, founder seated and first key active.

GIT_TERMINAL_PROMPT=0 git -c credential.helper= -c core.askPass= clone \
  https://github.com/generalbusiness-ai/cxcmwjzukjktomk7tvfibx4ugq33fvdtocg2edvkqvdea5pqt4ta-1.git \
  /tmp/artroom-builder-public-clone-20261007
# exit 0, without a credential; HEAD e2c5bf4ebb323e8ed0be71256e776c16a614123b
# Found this repository.
```

An anonymous REST GET confirmed repository ID `1408775530`, `private:false`,
default branch `main`, creation time `2026-10-07T12:47:50Z`. Its Git host is
real; no outside reply, object pack, provider clock or scheduler was scripted.
The published object is the platform's founding commit, as decision
`72ccc867` permits. Native source-lane publication remains Gate 2 work.

## Read session and verifier

The initial session probe returned `sessions-unavailable`. Builder restored
both SESSION_SECRET and DEPLOYMENT through stdin from the local handoff.
The next probe issued a real session for membership
`sc_mlcssejwqoa7ql7rluu4uz7yllddsndw5r47zmoztejehyqskzta`, incarnation
`in_bzj6hhzehvjwlwysifmmzu63qi`, member `@hugh`. It printed claims only,
never the credential. Final binding-only version:
`866e3534-b9c4-4278-b070-c71499efa2a1`, retaining the deployed source.

With that session, `show membership:0` succeeded. `verify membership`
exited 1 with `missing dependency`, naming register entry 2. Its coverage
was no entry. `verify destination` under the session exited 1 with
`forbidden`; destination records only a membership ID. Earlier signed-read
verification exited 1 because a retained foreign entry was forbidden.
No complete or consistent authenticated replay is claimed. Those read
extensions belong to the cloud work of `6b6c6400`.

## Raw evidence

All under `/tmp/artroom-builder-public-`:
`install.log`, `provision.log`, `deploy.log`, `claim.log`, `acts.log`,
`clone.log`, `session-probe.log`, `session-after-bindings.log`,
`show-membership-session.log`, `verify.log`, `verify-session.log`,
`verify-membership-session.log` and `deployments.log`.

The earlier private planner run is attributed in `5526c111`, not substituted
for this run. The hosting service's own ARTIFACTS adapter and its live
evidence remain owed for the re-cut Gate 1. No registry release, old-spike
change, fresh-person walkthrough, source approval or landing is claimed.
