# Git hosts

Artroom keeps each claimed repository at a Git host. This page says which
hosts the scope Worker can use, what each one needs, what a person sees as
the repository's remote, and what is not built yet.

## How a register chooses its host

The operator names the host when installing the register:

```
artroom install <base-url> --host artifacts --namespace artroom-demo
artroom install <base-url> --host github.com --namespace <organization>
```

The register records `host` and `namespace` and never changes them. Every
repository that the register creates for a claim is at that host and in
that namespace. The directory and the destination copy the same record,
`{ host, namespace, name, id }`.

The Worker builds one outside port for each host that it is configured
for, and sends each host operation to the port of the host that the
scope's own history records. A deployment can serve both hosts at once. A
register whose host is neither, or a host that is not configured, gets no
outside port: its operations stay recorded and unsent.

Each port also checks its own authority. Its setting pins one register
scope ID. Only that register, and the destinations born of that register's
claims, can use the host. Another register on the same host and namespace
gets nothing.

## The hosting's own Git service (host `artifacts`)

This is the host of the demo: "creation only on Artroom". The Worker
reaches the hosting's own Git service through its binding, and needs no
outside credential.

What it needs:

- The binding `ARTIFACTS` in `packages/scope/wrangler.jsonc`, for the
  namespace `artroom-demo`.
- One setting, the variable `ARTIFACTS_CONFIG`. It is nonsecret JSON with
  exactly these fields:

  | Field | Value |
  |---|---|
  | `registerScope` | The register's scope ID, from `artroom install`. |
  | `namespace` | `artroom-demo`, the binding's namespace. |
  | `host` | The service's hostname, as it appears in its remote URLs. |
  | `maxBytes` | The most bytes one Git transfer may hold, at least 32. |
  | `credentialIdentity` | `adapter-attempt`. |

  A missing, malformed or extra field turns the port off.
  A namespace other than `artroom-demo` also turns it off before any service
  call; the binding supplies that one namespace.

What it does:

- **Creation.** One create for the claim's own name, which is
  `repositoryName(seed, attempt)`. The service answers with one write
  token. The port revokes that token at once. If the revocation is not
  confirmed, the outcome names the token by a local handle,
  `creation:<name>`, and the register owes a `revoke-credential`
  operation. The token's plaintext is kept privately in the register's
  storage until that revocation is confirmed. It is never in a history.
  A cleanup handle is reported only when that exact plaintext is durably
  held. If custody and immediate revocation both fail, the result is unknown.
  The creation's reported remote must match the configured host, namespace
  and name before any creation metadata is confirmed.
- **Refusals.** A taken name is a refusal with `nameExists: true`. Other
  errors that the service states changed nothing are refusals with
  `nameExists: false`. Any other failure is no answer: the outcome stays
  unknown, and the register's rules decide whether another attempt
  follows. No request is sent twice.
- **Deletion.** One delete, by the exact name that the creation answered.
  The repository's ID is its name.
- **Writes.** A destination requests one write token for each write, with
  a 900-second TTL, and records its expiry as the service reports it. The
  one push goes through the same receive-pack client and checks as GitHub's.
- **Member read tokens.** A member mint requests the granted lifetime once.
  Its reply must explicitly state read scope and a valid reported ISO
  expiry; the port does not derive an expiry from the requested lifetime.
- **Reads.** Each read requests a read token with a 120-second TTL and
  revokes it after the read. Token replies must state the requested scope
  and a valid ISO expiry; no expiry is inferred from the TTL. A failed
  revocation remains unconfirmed, and the service's reported expiry is
  its assertion. The port checks that the service reports the expected
  remote URL for the name before it reads.

What a person sees as the remote:

```
https://<host>/git/artroom-demo/<name>.git
```

`<host>` is the setting's `host`. `<name>` is the repository's name. The
register's `create-repository` outcome entry, the directory's genesis and
the destination's branch item each record it as `{ host: "artifacts",
namespace: "artroom-demo", name, id }`. `artroom show <scope>:<seq>`
prints an entry's effects, where the reader is allowed to read that
entry. The name is 52 lowercase base32 letters, a hyphen, and the attempt
number, which is 1 unless an earlier attempt failed.

The repository is private: a clone needs a read token. The member-token
client and provider boundaries are prepared, as described below. The
shipped destination `@1` does not support this command's minting flow.

## GitHub (host `github.com`)

GitHub stays as a second, linked host. Its provider also has the prepared
repository-restricted member-token boundary.

What it needs:

- The variable `GITHUB_APP_CONFIG`: the App's issuer, installation ID and
  account, `maxBytes`, the pinned `registerScope`, the repository
  visibility and read choices, and `credentialIdentity`.
- The App's private key, `GITHUB_APP_PRIVATE_KEY`.
- Two tokens: `GITHUB_CREATION_TOKEN`, which creates repositories, and
  `GITHUB_READ_TOKEN`, which reads private repositories.
- Optionally `GITHUB_CLEANUP_TOKENS`, which enables deletion.

`packages/scope/src/github-wiring.ts` states each field and check.

The remote is `https://github.com/<organization>/<name>.git`.

## How a member reads the repository

The `artroom clone` integration is prepared, pending explicitly shipped
platform versions, membership actions and observation code, and host
routing that preserves old rooms. The current destination `@1` and unknown
catalog versions refuse `read-token` and `mint-read`. Component tests with
scripted histories do not prove a room-issued token or a successful clone.
Full receipt/fact validation and successful orchestration witnesses remain
part of the later integration review.

In the prepared flow, the member signs the destination's `read-token` act,
with requested hours from 1 to 24. That signed act authorizes one
`mint-read` operation. A session authorizes the one-time retrieval of its
caller's plaintext, after strict membership-reference preparation and a
check that the session's key signed the recorded act. It does not authorize
minting. The outcome records a nonsecret handle and the provider's reported
expiry; the plaintext stays in private custody until it is taken once,
strictly before that expiry.

The hosting's own service requests a read token through
`createToken("read", hours * 3600)`. GitHub verifies the named repository's
stable ID before requesting an installation token restricted to that ID
with contents read. It returns GitHub's actual expiry; the requested hours
do not set GitHub's installation-token lifetime. Neither provider retries
a lost mint automatically.

The outcome wait lasts at most 120 seconds, with at most 120 polls of
64 entries, keeping its next-entry cursor between polls. It reports the accepted act,
operation, scanned entries and next entry if it stops. The accepted mint
may still finish; inspect `artroom show <scope>:<act sequence>` and
`artroom log destination`. Stopping the wait does not revoke a token or
retrieve its plaintext. These are client wait limits, not a token deadline.

A successful prepared flow then runs `git clone`, passing its Authorization
header through Git's environment configuration. The runner puts no token
in arguments or a file it writes. It trusts the installed Git program,
its inherited environment, system/global/local configuration and terminal
output. The header is global `http.extraHeader`, not limited to a URL;
Git configuration can rewrite URLs or change proxy and redirect behavior.
The runner does not sandbox those choices, suppress Git output, or promise
that Git or a configured helper will never disclose the header. Run this
command only with Git, configuration and environment you trust.

`artroom remote` reads and prints the recorded repository's URL form.

## What is not built

- A command that gives `git fetch` or `git pull` a token in an existing
  clone. The prepared clone flow requests a new token each time.
- A sweep of read tokens that were minted and never read. Each ends at
  its end; its plaintext stays in custody until it is read or the read is
  refused at its end.
- Public repositories on the hosting's own Git service.
- A fork for each lane. Each destination has the one repository.
- A sweep for a repository whose creation answer was lost. Its outcome
  stays unknown, the next attempt uses a new name, and the earlier
  repository and its write token are not cleaned up.
