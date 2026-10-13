# Self-host rehearsal: room joined, namespace removal still owed

The guide's room flow completed on a fresh deployment. From the start of the
clone, the invitation was ready in 31.235 seconds and the guest joined in
35.481 seconds. Login was already complete. An operator helper entered the
configuration and used an independent browser profile for the guest. These
times do not measure human typing, login, or a second physical device.

The rehearsal used commit `a3130052f9ecfc866460af28f05268ecb9a2a25a`
and tree `77e66b0d9a5f8663440ce806ff470d892ef028f3`, with Node 26.11.1,
locked npm dependencies, and pinned Wrangler 4.147.0. The closed ledger contains
38 process phases, including source guards. Every row exited zero without a
signal, timeout, output overflow, or spawn failure. An earlier summary said 39;
the closed ledger supports 38. Exact command arrays, original terminal results,
and proof hashes are retained in the
[command evidence map](/Users/hughpyle/play/artroom-diagnostics/self-host-final-prose-draft/command-evidence-map.public.json).

Both literal `npm run deploy:scope` commands passed. The source launcher planned
the register, installed that plan, claimed `first-room` for `@owner`, and invited
`@guest` as a member. Native evidence verified the owner's administrator role,
the guest's distinct key, the full membership reference and incarnation, and the
accepted enrollment receipt. The invitation is omitted: its length was 859
bytes. The session secret used 32 random bytes, and the deployment identity was
33 bytes. Secret values and private keys remain private.

The disposable scope Worker was `artroom-selfhost-check-20261013-a`. Its
configured version was `c92e64fc-3113-4950-a0d3-4f5128840c14`.
The separate disposable homepage Worker added `-home` to that name. Literal
`npm run build:home` and `npm run deploy:home` both exited zero. Version
`72f26c78-ce94-47da-bfbc-ef6973d61e5a` received all traffic. Ten anonymous
readbacks matched built bytes, MIME types, and cache headers, including the
homepage link to the self-host guide. This did not update the existing project
homepage or configure a custom domain.

Cleanup preserved each original stop and completed only the missing phases:

| Original run | Result and qualification |
| --- | --- |
| Repository cleanup, 19912 | Terminal 1 after the owned repository was deleted and a complete inventory showed none remaining. Nine tokens were already revoked, with none active. An overly strict references-schema check stopped storage and Worker removal before mutation. |
| First continuation, 34010 | Terminal 1 before mutation: a fresh Artifacts inventory returned HTTP 403, code 10004. The cause remains unknown. This is not evidence of namespace absence. |
| Homepage removal, 98868 | Terminal 0. Nonforced service deletion and complete Worker inventory confirmed the disposable homepage Worker absent. |
| Storage removal, 6771 | Terminal 1 after the literal deletion-migration deployment succeeded. A complete inventory confirmed the owned Durable Object namespace absent. The next references GET had no retained response. A repeated exclusive output filename is a static explanation for the stop, not an observed provider result. Worker deletion had not been dispatched. |
| Final Worker removal, 31584 | Terminal 0. Fresh version, storage-absence, references, and tails checks passed. Nonforced service deletion and a complete inventory confirmed the scope Worker absent. No deployment or repository deletion was repeated. |

The repository, Durable Object namespace, scope Worker, and disposable homepage
Worker were removed. Empty Artifacts namespace removal is unsupported and
**unrun**. Its last successful inventory was empty; a later inventory returned
403, so its current visibility is unknown. Full cleanup is not claimed. Private
keys, browser state, original requests, and proofs were retained.

The owning checks on the recorded source passed: six Artifacts-wiring cases,
one homepage-link case, and 263 local document links with none broken. The
composed Source checks and its one ordinary gate are recorded below.
GitHub deployment, Counter enrollment, optional page rebuild, physical-device
join, and the displayed interactive Worker-deletion commands remain unrun in
this rehearsal. Per-step guide notes distinguish executed commands from manual
shell and configuration variations.

The delivery source incorporates the later Create, MCP, and Names changes
from main commit `765c4eb9f7ef280e9f7b1ff245eb8736b35b4ffb`, together with
the checked Start candidate `4ce2095359707ef8888b95a566c6f33391968112`.
That candidate is not yet approved or landed. This Source union has a closed
gate result, but the original self-host runtime rehearsal has not been repeated.
Its correspondence with actual main must be checked before landing. The guide
retains the tested `claim` command. Current CLI documentation presents
`dap create` and retains `claim` as an alias. The recorded rehearsal executed
`claim`, not `create`. If step 6 changes to `create`, that spelling must retain
an unrun label until verified. Shared dispatch in the current source is not
a new runtime result. The original
measurement proves the recorded source only. The production homepage guide
link still needs its final normal build, deployment, and readback.

## Checks on the composed Source

The composed Source is commit `02dc32df5565ddb41e4552c01453b71e5cd7608d`,
tree `0e60a71c27f336cd37300c11ac6cc3496d571d91`. This union retains the
checked Start candidate's routing, generated Page, CLI story, and rehearsal
files. Start approval and landing are still pending. Before self-host landing,
correspondence with actual main must be checked again.

The selective cache control completed with terminal zero (44977). Its single
baseline case passed. Removing the independently declared namespace from the
Worker's cache key made that same case fail by an assertion: the cached port
still accepted work after the namespace changed. The source was restored,
and all final guards passed. The changed-document link check completed with
terminal zero: 250 relative links checked, none broken.

The original dependency copy (24225) stopped incomplete. Its partial namespace
was preserved. A separate completion (39803) changed only the private lock
stamp, then verified 5,498 files, 31 links, 534 private directories, thirteen
workspace links, and 27 export targets. No package installation, namespace
recopy, or deletion occurred. The current checks used that namespace with
1,508 tracked Source files and the pinned npm closure of 2,413 entries,
including 1,944 files.

The one ordinary gate for this self-host union completed with terminal zero
(38645), and its final Source and dependency guards passed. Whitespace,
typecheck, and test phases each exited zero. Installation was skipped.
Vitest recorded 1,141 passes and three skips out of 1,144 cases. The Node
checks passed ten cases, and Counter passed 55. The observed elapsed time was
129.617180 seconds. The same run's outer timer reported 129.6 seconds real,
180.52 seconds user, and 33.69 seconds system time. These are measurements
of one gate, not a sum of separately run phases. No self-host gate was run
on the earlier Source.

The room timing, guest enrollment, homepage readbacks, and cleanup results
above belong to the original rehearsal Source. They do not show that this
Start union has passed those runtime paths. The guide keeps the tested `claim`
alias. A replacement `create` spelling, manual shell variations, and physical
second-device use remain unrun in that recorded rehearsal.

The project's existing homepage still needs the guide-link build, deployment,
and readback after Source approval and landing. The disposable homepage
rehearsal does not fulfill that duty. Empty Artifacts namespace removal remains
unsupported and unrun; later HTTP 403 visibility has an unknown cause.
This delivery does not claim that the full original request is closed.
