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

What it does:

- **Creation.** One create for the claim's own name, which is
  `repositoryName(seed, attempt)`. The service answers with one write
  token. The port revokes that token at once. If the revocation is not
  confirmed, the outcome names the token by a local handle,
  `creation:<name>`, and the register owes a `revoke-credential`
  operation. The token's plaintext is kept privately in the register's
  storage until that revocation is confirmed. It is never in a history.
- **Refusals.** A taken name is a refusal with `nameExists: true`. Other
  errors that the service states changed nothing are refusals with
  `nameExists: false`. Any other failure is no answer: the outcome stays
  unknown, and the register's rules decide whether another attempt
  follows. No request is sent twice.
- **Deletion.** One delete, by the exact name that the creation answered.
  The repository's ID is its name.
- **Writes.** A destination mints one write token for each write, for 15
  minutes, and records its expiry as the service reports it. The one push
  goes through the same receive-pack client and checks as GitHub's.
- **Reads.** Each read mints a read token for 2 minutes and revokes it
  after the read. The port checks that the service reports the expected
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

The repository is private: a clone needs a read token. `artroom clone`
gets one for the member who runs it (below).

## GitHub (host `github.com`)

GitHub stays as a second, linked host. Its port is unchanged.

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

On either host a member runs `artroom clone`. It signs the destination's
`read-token` act, which any active member may sign, with a lifetime from
1 to 24 hours. The destination opens one host operation, `mint-read`. On
the hosting's own Git service the port mints a read token for the
repository through the binding, `createToken("read", hours * 3600)`. On
GitHub it mints an installation token restricted to the repository's ID
with contents read; GitHub fixes its lifetime at one hour. The outcome
records the token by a nonsecret handle and its end, never the token. The
token goes to the destination's private custody, as a write token does,
and the credential route gives it once to the session of the key that
signed the act, before its end. The command then runs `git clone` with
the token in an `Authorization` header that git reads from its
environment. `artroom remote` prints the repository's remote URL in the
host's form.

## What is not built

- A command that gives `git fetch` or `git pull` a token in an existing
  clone. Each `artroom clone` gets a new token.
- A sweep of read tokens that were minted and never read. Each ends at
  its end; its plaintext stays in custody until it is read or the read is
  refused at its end.
- Public repositories on the hosting's own Git service.
- A fork for each lane. Each destination has the one repository.
- A sweep for a repository whose creation answer was lost. Its outcome
  stays unknown, the next attempt uses a new name, and the earlier
  repository and its write token are not cleaned up.
