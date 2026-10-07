# I5: the hosting's own Git service as a register's host, delivery

2026-10-07. Branch `claude/artifacts-host-adapter-pxbx8y` (built locally
as `i5-own-host`), on top of `claude/i5-claim-live-delivery-mvst61` at
`09c390c9`, whose history is unchanged. Built alone in a cloud container
with no binding, no deployment credentials and no workroom, so no gitseq
request was opened or updated; the planner owes that.

Labels: **[code]** read from code, **[run]** confirmed by a run in this
container, **[inferred]** not checked.

## 1 What is built

Source, in `packages/scope/src`:

- `artifacts-host.ts`: `ArtifactsProvider`, which implements
  `RegisterProvider` and `DestinationProvider` over structural types of the
  binding (`ArtifactsNamespace`, `ArtifactsRepository`), declared in the
  scope package. No Workers type is imported. [code]
- `artifacts-wiring.ts`: `artifactsOutside(given, sql, env, fetch?)`, and
  `ARTIFACTS_HOST = "artifacts"`. [code]
- `host-wiring.ts`: `destinationBirth`, `hostBound`, `recordedHost` and
  `credentialHandle`, moved out of `github-wiring.ts` so both wirings use
  the same functions. The GitHub wiring calls them with its old digest
  domain and error text. [code]
- `github-host.ts`: the GitHub provider's push checks are now the
  exported `sendOnce`, which both providers call. [code]
- `worker.ts`: `outsideOf(given, sql, env, fetch?)` builds one wiring for
  each configured host and routes every call by `recordedHost`.
  `DeployedScope` uses it when either `GITHUB_APP_CONFIG` or
  `ARTIFACTS_CONFIG` is set. [code]
- `wrangler.jsonc`: the `artifacts` binding entry (`ARTIFACTS`,
  namespace `artroom-demo`, `remote: true`) and comments naming every
  host setting, with no values. [code]

Documents: `docs/hosts.md` (new), one sentence each in `docs/cli.md` and
`docs/scopes.md`.

The command line is unchanged. `artroom install <base-url> --host
artifacts --namespace artroom-demo` already records that host and
namespace (`packages/cli/src/line.ts`, `install` in `commands.ts`) [code].
No one-line change can show the remote URL: the command line does not know
the service's hostname, which only the Worker's setting holds [code].

Tests, all in the `scope` project, all passed [run]:

`packages/scope/test/artifacts-host.test.ts`, scripted binding and
scripted smart-HTTP replies:

1. "scripted binding: a creation revokes its write token at once or
   reports it owed; a refusal is the answer; delete names the exact
   repository"
2. "scripted smart HTTP: ref, format and objects read with a read token
   minted for the read and revoked after, at the service's own remote"
3. "scripted mint and send: one write token with the service's expiry,
   one push with it, refused and not-sent distinct, revoke at the
   recorded repository"

`packages/scope/test/artifacts-wiring.test.ts`, scripted binding with
real register judgments in memory and a test object's SQLite:

4. "explicit configuration creates the claim's exact name through the
   scripted binding, revokes its write token at once, and records host
   artifacts with no secret"
5. "a creation token whose revocation fails is owed: the register opens
   revoke-credential, and its send revokes the held token"
6. "a taken name is a refusal that says so, an unknown failure is no
   answer, and neither is sent twice"
7. "absent or malformed configuration, or a missing binding, gives
   NO_OUTSIDE and sends nothing"
8. "each wiring serves only its own recorded host, and the Worker's
   outside routes each register by its recorded host"

The GitHub tests (`github-host`, `github-wiring`, `github-founding`) pass
unchanged after the move [run].

Controls, each with `node scripts/control.mjs ... -- packages/scope
<file>` [run]:

| Change | Result |
|---|---|
| Never treat the creation token as revoked (`if (revoked)` to `if (false)`) | distinguishes, test 4 |
| Route every scope to the GitHub wiring | distinguishes, test 8 |
| Drop the host from `hostBound`'s register check | distinguishes, test 8 |
| Drop the check of the service's reported remote | distinguishes, test 2 |
| Treat a stated code without `numericCode` as a refusal | distinguishes, test 1 |
| Accept a binding with no `delete` | distinguishes, test 7 |
| Keep the plaintext after an owed revocation is confirmed | distinguishes, test 5 |
| Do not revoke a read token after the read | distinguishes, test 2 |
| Delete when the ID is not the name | distinguishes, test 1 |
| Route an unknown host to the first configured wiring | survives |

The surviving control is expected: each wiring also checks its pinned
register and host, so the routing's own `NO_OUTSIDE` for an unknown host
changes no outcome. The routing comment says so. [run, code]

## 2 The live procedure for the local colleague

I could not run the binding. These steps are what the code needs [code];
the order of the steps is [inferred].

1. Check that the namespace `artroom-demo` exists on the account the
   Worker deploys to. The binding entry in `packages/scope/wrangler.jsonc`
   names it.
2. Deploy the scope Worker as before (`SESSION_SECRET`, `DEPLOYMENT`),
   with the new binding and no `ARTIFACTS_CONFIG` yet. Nothing is sent to
   any host.
3. Install the register on the new host:

   ```
   artroom install <base-url> --host artifacts --namespace artroom-demo
   ```

   It prints `Installed: register sc_...`. Keep that ID.
4. Set the variable `ARTIFACTS_CONFIG` to exactly these five fields, and
   deploy again:

   ```json
   {"registerScope":"sc_<from step 3>","namespace":"artroom-demo","host":"<service hostname>","maxBytes":8388608,"credentialIdentity":"adapter-attempt"}
   ```

   `host` is the hostname in the remote URLs that the binding's `info()`
   reports: the same value as `ARTIFACTS_HOST` in
   `parked/room/wrangler.jsonc` when the account is the same. A remote URL
   that is not `https://<host>/git/artroom-demo/<name>.git` makes every read
   fail, by design. `maxBytes` is the most bytes one Git transfer may hold;
   8 MiB is a suggestion, not a measured need. An object reads its setting
   when it starts; a deploy restarts objects [inferred].
5. Claim:

   ```
   artroom claim demo
   ```

   It should end with `Claimed demo: directory ..., membership ..., rules
   ..., destination ...; each created and confirmed.`

What to look for:

- In the namespace `artroom-demo`: one new repository, named 52 lowercase
  base32 letters, a hyphen and `1`. Its creation token should be revoked
  (the binding's `listTokens()` lists it as `revoked`).
- In the register: the `create-repository` outcome with body `{ name, id }`
  and no `credential`. A `credential: "creation:<name>"` means the
  immediate revocation did not confirm, and a `revoke-credential`
  operation is owed; it should then confirm on its own.
- In the destination: its branch item records `repository: { host:
  "artifacts", namespace: "artroom-demo", name, id }` with `id` equal to
  `name` [code]. The first head and the receipt should then be pushed
  [inferred, from docs/testing.md's account of `founding-real.test.ts`].
- At the remote, with a read token from the service:
  `git -c http.extraHeader="Authorization: Bearer <token>" ls-remote
  https://<host>/git/artroom-demo/<name>.git` should list
  `refs/heads/main` [inferred: the header form is the parked room's,
  `parked/git/src/first-commit.ts`].
- Signs of trouble: the claim waits and the register's operation stays
  `pending` with nothing sent (the setting is missing or malformed, or the
  register ID is not the pinned one); a `refused` with `nameExists: true`
  (the name was taken); `unknown` outcomes (any error the service did not
  state changed nothing).

## 3 Stand-ins and limits

- Every answer of the service in the tests is scripted: a binding double
  and a scripted `fetch`. No repository or token was created, and no real
  smart-HTTP endpoint was reached. [run]
- The register's judgments in the wiring tests are real; the destination
  in tests 4 and 8 is the scripted birth that `github-wiring.test.ts`
  also uses. No destination mint or write ran through `DestinationHost` for
  this host. The provider's mint, send and revoke ran directly. [run]
- Error shape: a refusal is an error with a `code` among `ALREADY_EXISTS`,
  `INVALID_INPUT`, `INVALID_REPO_NAME`, `INVALID_TTL` and `NOT_FOUND`, and
  a numeric `numericCode`. This is the parked rule
  (`parked/git/src/safe-errors.ts`) [code]; the current service was not
  asked [inferred].
- `ttl` is in seconds [inferred, from the parked in-memory double]. Write
  tokens are asked for 900 seconds, read tokens for 120.
- The expiry is the instant the service reports. A number is read as
  milliseconds and a string as an instant; it is recorded in the
  contract's time text (`2026-10-07T13:15:00.000Z` becomes
  `2026-10-07T13:15:00Z`). [code]
- The remote URL form `https://<host>/git/<namespace>/<name>.git` is from
  earlier live output recorded in `notes/2026-10-04-23-spike-journey.md`
  [code]. The `Bearer` header is from `parked/git/src/first-commit.ts`
  [code]; whether the service accepts it today is [inferred].
- The repository's ID is its name: the binding's create answer gives
  `name`, `remote` and `token`, and no other identifier. [code, parked
  types]
- The creation's credential in an outcome is a local handle,
  `creation:<name>`, not the service's token ID: the create answer does not
  give that ID. The register's rule comment calls the member "the host's ID
  of a credential, and never its secret"; the handle is not secret, but it
  is not the host's ID. [code]
- No read recovery for this host. Each read mints and revokes a read
  token, so repeating a read is not free of mutation. A read whose
  outcome is lost stays unknown, and the destination's rules decide. [code]
- A read token whose revocation fails stays live until its 2-minute
  expiry. [code]
- If the process stops between the create and the revocation of its
  token, or the create's answer is lost, the outcome is unknown, the next
  attempt uses a new name, and the earlier repository and its token are
  not cleaned up. Deleting a repository deletes its tokens [code, parked
  types]; nothing here does it.
- The push goes through `SmartHttpGit` with the live check
  `allowed()` just before the POST, as the GitHub provider's does.
  Neither provider uses `packages/git/src/gateway.ts` [code].
- If the service's clock runs ahead of the scope's, a write token can end
  at the service before the scope's custody says it has. A refused
  advertisement then reads as not sent; a refused POST stays unknown.
  [code, inferred for the clock]

## 4 Gate

One run of `npm run gate` at head `937da772615125be815afced75a8e77802cf8379`,
tree `b870b1a1f64cd33831bb0df9084c7f333527e2a0`, in this cloud container,
after `npm ci`, with nothing else running [run]:

| Step | Exit | Elapsed | CPU |
|---|---|---|---|
| install | 0 | 4.6 s | 6.0 s |
| whitespace | 0 | 0.0 s | 0.0 s |
| typecheck | 0 | 12.0 s | 37.2 s |
| test | 1 | 64.0 s | 108.0 s |

Vitest: 101 files, 765 tests, 764 passed, 1 failed. The failure is T36 of
`packages/checkers/test/runner.test.ts`, the known failure caused by the
container's git; this branch does not touch it. Vitest also reported one
unhandled error, `write EPIPE` from `packages/git/test/support/host.ts:80`
during `packages/git/test/http.test.ts`, which this branch does not touch.
That one file, run once alone afterwards, passed 2 of 2 with no error.
Because vitest failed, the gate did not reach `scripts/active-source.test.mjs`;
run alone, it passed 6 of 6 (0.36 s elapsed) [run].

This note is the only commit after that head. It changes documents only;
source and tests are unchanged.

## 5 What is owed

- The live run of section 2, by the local colleague.
- A gitseq request for this work, and its result.
- A decision on the register's credential member: accept a local handle,
  as the destination already does with `credentialIdentity:
  "adapter-attempt"`, or change the rule's comment. The text today:
  "`credential` is the host's ID of a credential, and never its secret."
  (`packages/platform/src/register.ts`, the rule `create-repository`).
- A decision on read recovery for this host (section 3).
- A sweep for a repository whose creation answer was lost.
- A clone command that gets a read token from the room; public
  repositories; a fork for each lane (`docs/hosts.md`, "What is not
  built").
- `notes/.keep-i5-own-host`, the empty file of the push check, can be
  removed at landing.

## 6 Decisions followed

- Hugh, 2026-10-07 08:55 Eastern, recorded by the planner: the demo's
  repositories live on the hosting's own Git service, through the
  `ARTIFACTS` binding, with no outside credential; GitHub stays as a second
  host; a register names its host at install; the Worker routes by the
  register's recorded host; the GitHub adapter does not change in
  behaviour.
- The brief: share `bound` and `destinationBirth` rather than copy them;
  never retry a mutation; a refusal is the answer; an unknown outcome stays
  unknown; nothing deployed; no change to `signed-reads.ts`, `reads.ts`,
  `object.ts`, `operations.ts`, the claim command or `docs/deploy.md`.
- `docs/testing.md`: tests at the cheapest boundary, stand-ins labelled,
  one control or two per guard, one gate run at the end.
