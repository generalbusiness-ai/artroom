# Plan 029: a fork for each hold

Planner, 11 October 2026, 14:00 Eastern. Direction from Hugh, recorded in
planner request `06089f04`: build a detailed plan for the forks work on
Cloudflare Artifacts. This plan is a document. It names the builder
requests to file, with the witness that accepts each, and says which items
fit before the freeze and which follow the submission.

Public wording in this plan and in everything it commissions: name
Cloudflare Artifacts at the first mention, then Artifacts, and name the
operations of its binding.

## What is true on main today (`2614a82a`)

- Each destination has one repository. "A fork for each lane" is listed
  as not built in `docs/hosts.md`.
- The capability `hold@1` (`packages/derive/src/hold.ts`) already derives
  the records of a hold's workspace: the operation kinds `stage`, `check`,
  `fork`, `head`, `mint`, `revoke`, `delete` and `deletion`, each with an
  attempt bound, and the token records of a hold. A token's use ends when
  the hold ends, the hold's epoch passes 1, or its instance is past
  (`useEnded`). The production ports record these operations and send
  none of them to a host: no fork and no token exists at a real host.
- The destination port for Artifacts
  (`packages/scope/src/artifacts-host.ts`) performs create, delete,
  revoke, one write token per push with a 900-second TTL, one read token
  per read with a 120-second TTL, and `inspect`, which reads the
  destination's repository over smart HTTP with a read token to produce
  the judge evidence (head, tree, first parent, ancestors of the selected
  reports' commits).
- The reservation judge (`packages/platform/src/reservation.ts`) decides
  from that evidence: check 1, the manifest's base is the head just read;
  check 2, the integration commit's tree is the named tree, its first
  parent is the base, and each selected report's commit is its ancestor;
  checks 3 and 4 on the merger's authority and the statement.
- The binding offers, on a repository handle, `fork(name,
  {defaultBranchOnly, readOnly})`, `createToken(scope, ttl)`, `revokeToken`,
  `info`, and the reads `log`, `readCommit`, `readTree`, `readBlob` and
  `readFile`. A repository reports a `forking` status while a fork is
  being made, and the service emits a forked event and a push event. The
  push event carries no pusher identity. Tokens are scoped to one
  repository. There is no server-side merge, diff or cross-repository
  fetch.
- Known limits: pricing per operation (10,000 included per month) and per
  gigabyte-month across all repositories; 2,000 Git requests per 10
  seconds per repository. Whether a fork's storage is counted in full is
  not documented.

## The rule that holds everything

Every fork is tied to one hold, and every hold ends. A fork is created by
the entry that opens a hold's workspace and is deleted by the entry that
ends the hold or takes its commitment to a final state, whichever comes
first. A fork whose creation answer was lost is owed a deletion by name,
as a repository whose creation answer was lost is today. Nothing lives
forever, and no token is ever minted for the destination's repository on
a performer's behalf.

## 0. The cost measurement, first

Before any design lands, one measurement on a scratch repository in the
demo namespace, never on the demo host's own repositories:

1. Create a repository of the demo's size (the rehearsal room's
   repository, about a dozen commits), fork it once with
   `defaultBranchOnly: true`, poll `info` until the status leaves
   `forking`, and record the wall time to ready as observed.
2. Count the binding operations the fork consumed, from the metrics the
   hosting reports, before and after.
3. Record the storage the metrics report for the namespace before and
   after, and say whether the fork's bytes appear in full, in part, or not
   at all.
4. Mint one write token scoped to the fork, push one commit, read its
   `log` and `readCommit` through the binding, revoke the token, delete
   the fork. Record each operation's answer shape and time.
5. Delete the scratch repository.

Witness: a note on main, `notes/2026-10-1x-fork-cost-measurement.md`, with
each number labelled by how it was taken (observed run, metrics read, or
sum of steps), the commands, and the limits still unknown after the run.
Estimated builder time: two hours. This fits before the freeze and is the
only builder work in this plan that does.

Limits that stay unknown after it: the per-gigabyte-month charge for a
fork over a month; whether `forking` can fail after a successful call and
how it is reported; whether a fork of a fork is allowed; the ceiling on
forks per repository or per namespace; the read-token count a report
verification costs under the 2,000 per 10 seconds limit when many
performers report at once.

## 1. A fork per hold

When a performer takes a hold under an accepted commitment, the
destination forks the repository and mints a write token scoped to the
fork, with the hold's lifetime. The performer never holds a token to the
destination.

Mapping of the `hold@1` records to host operations:

| `hold@1` kind | On Artifacts | On GitHub |
|---|---|---|
| `fork` | `repository.fork(<destination name>-h<hold id>-<attempt>, {defaultBranchOnly: true, readOnly: false})`; the outcome records `{host, namespace, name, id}` and the time `info` reported the status left `forking` | A repository fork by the App into the organization, named the same way. Where the installation cannot fork, the hold gets no workspace at the host: the outcome records `fork: none`, the performer pushes to a repository of their own, and the report names that repository with the commit (item 2 reads it by the App's read of the named repository). No branch on the destination's repository and no token to it, ever: the governing rule has no exception |
| `mint` | `fork.createToken("write", seconds until the hold ends)`; the outcome records the handle and the end the service reported, never the token; plaintext to the hold's custody, given once to the holder's session | An installation token restricted to the fork's ID with contents write; GitHub fixes one hour, so a hold longer than an hour gets a new mint at each epoch, recorded as a new `mint` attempt |
| `head` | `fork.info()` and `log` of its default branch | The fork's default branch head by the App |
| `revoke` | `fork.revokeToken(plaintext)` at hold end or epoch change; unconfirmed revocation leaves the token's custody and a handle, as creation does today | Installation tokens expire; the record notes the end |
| `delete`, `deletion` | Delete the fork by its exact name when the hold ends or the commitment reaches a final state; three attempts; a lost answer leaves an owed deletion by name | Delete the fork or the branch the same way |

Cleanup: the entry that ends a hold (`hold-end`, `release-hold`, or the
platform entry that takes the commitment to a final state) opens
`revoke` and `delete` operations. A fork whose creation answer was lost is
recorded as unknown with its intended name; the next attempt uses the
next attempt number, and the earlier name is owed a deletion, swept by a
timed rule in the destination that retries owed deletions.

Events: the forked event confirms creation when the creation answer was
lost. The push event carries no pusher identity. The fork is therefore
evidence of authorized custody, not proof of who pushed: a push to fork F
is recorded as "a push under hold H's custody in epoch E", and the record
never says "pushed by the holder". Trust assumptions, recorded here and in
the outcome entries: the host restricts writes to a fork to the holders
of tokens scoped to it; the destination gives the token's plaintext once,
to the session of the key that took the hold; a push by anyone else means
the token left that session, which the record cannot distinguish from
the holder's own push. Nothing is derived from a push event that the
fork's own `log` cannot confirm. Witness for the boundary: a scenario in
which a push to a fork whose hold has ended, or whose epoch has passed,
opens no report and leaves the hold's record unchanged, and a push within
the hold is recorded under custody wording; the independent reader
replays both.

Builder requests to file, after the submission:

- 1a. Hold operations sent by the production port on the hosting's own Git
  service: fork, mint, head, revoke, delete. Witness: the lane scenario
  that takes a hold runs against the real binding in a scratch namespace,
  and the destination's record shows the fork's name, the token's handle
  and end, and the deletion, with `docs/hosts.md` updated to remove the
  "not built" line.
- 1b. The GitHub mapping, with the fork-or-branch choice recorded in the
  outcome. Witness: the same scenario on the GitHub rehearsal register.
- 1c. The owed-deletion sweep. Witness: a scenario in which the creation
  answer is dropped by the stand-in host and the sweep deletes by name on
  the next tick.

## 2. Reports read from the performer's fork

A report names a commit and a tree. Today the destination verifies the
manifest's selected reports by reading the destination's own repository,
which the performer pushed to; with forks, the performer pushes only to
the fork, and the destination reads the fork through the binding (`log`,
`readCommit`) to confirm the report's commit exists there with the named
tree and the hold's base as an ancestor. Report traffic never touches the
destination repository's per-repository request budget.

Ancestry evidence the reservation judge needs: for each selected report,
the fork name it was read from, the commit, its tree, and the base commit
of the hold at the time of the report. Check 2 then asks that the
integration commit's first parent is the head and each report's commit
is an ancestor of the integration commit in the staging fork (item 3).
Replay keeps this as it keeps judge evidence today: the recorded
evidence is a digest of the read, bounded by `DESTINATION_CHANGED_SET`,
and the independent reader re-reads the fork while it exists and the
destination's repository after the fork is deleted, where the
integration commit carries the report commits as ancestors.

Builder request to file, after the submission:

- 2a. `inspect` over a fork for report verification, with the fork name in
  the recorded evidence. Witness: a report pushed to a fork is accepted,
  the same report named against the destination's repository is refused
  `evidence-invalid`, and `artroom verify` replays both.

## 3. The integrator's staging fork

The integration commit is composed in a fork taken under the integrator's
own hold, the required check runs there, and publication is one push of
exactly the tested commit to the destination. The destination's write
token exists only for that push, minted and revoked around it as today.
Check 1 (base is the head) and check 2 (tree, first parent, ancestors)
are read from the staging fork before the push and from the destination
after it; both reads must agree or the publication is refused
`integration-invalid`.

Builder request to file, after the submission:

- 3a. Staging fork for the integration commit and the check job. Witness:
  the 26-shot rehearsal passes with the integrator's hold opening a fork,
  the check job's tree read from the fork, and the destination receiving
  one push.

## 4. A repository per application instance

For the general-purpose story: a Counter or a jam session publishes its
record to a fork of a template repository, one repository per instance,
taken under a hold that ends with the session. This gives every
application instance a Git remote that anyone can clone and replay, and
keeps the template unchanged. Later item; it reuses items 1 and 2 with no
new host operation. Builder request to file after items 1 to 3 land.

## Out of scope

Any textual or three-way merge. Recombination stays a selection of
accepted reports, composed into one integration commit by the integrator
in the staging fork.

## What fits before the freeze

| Item | Before the freeze | After the submission |
|---|---|---|
| 0. Cost measurement | Yes, on a scratch repository, two hours | |
| 1. Fork per hold | | 1a, 1b, 1c |
| 2. Reports from the fork | | 2a |
| 3. Staging fork | | 3a |
| 4. Repository per instance | | after 1 to 3 |

The freeze is Monday 12 October 2026 at 23:00 Eastern. Today, 11 October,
is a Sunday; plan 028 and the first text of this plan named the weekday
wrong. Hugh's "Monday" and the request's "2026-10-12" are the same day.
Nothing in this plan but the measurement is before it.

## Order

The measurement first, after the practice script and before the rename
head only if the builder has an idle hour; otherwise after the
submission, first. Then 1a, 2a, 3a, 1b, 1c, 4. Each lands as its own
reviewed head with the witness named above, and the checker's order
stays as the sprint reports set it.
