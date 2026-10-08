# Deploying the scope Worker

This page says which settings and secrets the scope Worker takes, and in
what order to set them so that a claim creates its repository on GitHub.
Nothing in this repository deploys the Worker. The Worker's code is
`packages/scope/src/worker.ts`; its configuration is
`packages/scope/wrangler.jsonc`.

A deployment serves rooms of every definition version that its platform
package has shipped, each by the version that its genesis pinned
([scopes.md](scopes.md), "Definition versions").

## Settings and secrets

A setting is a plain value. A secret is stored by the host and is never
in this repository, in a command argument, in a log, in a scope's history
or in the command line's config.

| Name | Kind | What it is |
|---|---|---|
| `DEPLOYMENT` | setting | The deployment's name, 1 to 128 bytes. Every read session names it. |
| `SESSION_SECRET` | secret | At least 32 bytes from a cryptographic random source. It signs read sessions. Without it, or without `DEPLOYMENT`, no session is issued or accepted. Replacing it ends every session at once. |
| `GITHUB_APP_CONFIG` | setting | JSON with exactly the fields below. Without it, or if it is not valid, the Worker sends nothing to GitHub: attempts are recorded and wait. |
| `GITHUB_APP_PRIVATE_KEY` | secret | The GitHub App's private key, as PKCS #8 PEM (`BEGIN PRIVATE KEY`). GitHub gives a PKCS #1 key (`BEGIN RSA PRIVATE KEY`); convert it, with no passphrase. The Worker uses it to mint short-lived tokens that let a destination push. |
| `GITHUB_CREATION_TOKEN` | secret | The credential that creates a repository. See "The creation credential". Without it, a claim's creation is recorded and waits. |
| `GITHUB_READ_TOKEN` | secret | A token that reads the private repositories. Not needed when `publicReads` is true. |
| `GITHUB_CLEANUP_TOKENS` | secret | Optional. JSON: repository ID to `{ "name", "plaintext", "expiresAt" }`, each token limited to that one repository with Administration write. It deletes a repository that a creation made but the register did not select. Without it, such a deletion is recorded and waits. |

`GITHUB_APP_CONFIG` has exactly these fields:

| Field | Meaning |
|---|---|
| `issuer` | The App's client ID: the issuer of the App's signed requests. |
| `installationId` | The number of the App's installation on the account. |
| `account` | `{ "id", "login", "type" }` of that installation's account. `type` is `User` or `Organization`. `login` is where repositories are made. |
| `maxBytes` | The most bytes of Git objects that one push sends or one read takes. At least 32. |
| `registerScope` | The register's scope ID. Only that register's creations are sent. |
| `privateRepositories` | Whether new repositories are private. |
| `publicReads` | Whether the Worker reads repositories with no token. Must be false when `privateRepositories` is true. |
| `credentialIdentity` | Always `"adapter-attempt"`. |

## The order

The host setting pins the register's scope ID, so the setting must name
the register before its first claim. A register's ID is a function of its
install's signed intent, so the command line computes it before the
register exists. Plan first, then set the setting, then install:

1. **Deploy** the Worker with `DEPLOYMENT` and `SESSION_SECRET`.
2. **Plan.** Run `artroom install --plan <base-url> --host github.com
   --namespace <login>`, where `<login>` is the account's `login`. It
   founds nothing. It prints `Planned: register sc_...` and the seed's
   time, and keeps the plan in the config. The plan can be founded until
   that time, 14 minutes after the plan.
3. **Set `GITHUB_APP_CONFIG`**, with `registerScope` set to that register
   ID, and the GitHub secrets. A register whose host or namespace differs
   from the setting sends nothing.
4. **Install.** Run `artroom install --planned`. It checks that the plan
   still makes that ID, founds the register, and prints
   `Installed: register sc_..., ..., as planned.` A plan whose time is
   over is refused as `plan-expired`, and nothing is sent: plan again and
   set the new ID.
5. **Claim.** Run `artroom claim <name> --handle @you`. The register
   sends its creation at once. If the claim still gives up waiting, run
   the same command again: it goes on from the pending claim and signs
   nothing new. `--again` signs a second claim, which creates a second
   repository.

The same order holds for the hosting's own Git service, with `--host
artifacts`, `--namespace artroom-demo` and `ARTIFACTS_CONFIG`
([hosts.md](hosts.md)).

### The earlier order, and its wait

`artroom install <base-url> --host ... --namespace ...` with no plan
still works: it founds at once and prints the register ID, and the
setting is set after it. Then the register's object may have started
before the setting took effect. A claim's creation is then recorded and
not sent until the object sees the setting. Observed on 2026-10-07, that
took about two minutes each time, so the claim gave up waiting and had to
be run again.

Two things now shorten that wait. The Worker reads its host settings at
each call of its outside port, not once per object. And at each request,
an object that holds an attempt it could not send because its port
refused that kind sends it as soon as the port accepts it, once, with no
restart. A Worker whose setting changed is still a new version, and an
object running the earlier version may keep the earlier setting until it
restarts; a request that reaches it after the restart sends what it
recorded. Planning first avoids the wait.

## The creation credential

`GITHUB_CREATION_TOKEN` is one of:

- an installation token minted from the App with `administration: write`.
  It expires one hour after it is minted, so mint it just before the
  claim, and replace it and restart for a later claim;
- an operator's fine-grained token with Administration write on the
  organization.

For a `User` account the Worker creates the repository as that user, which
an installation token cannot do; use the user's own fine-grained token.

## Reads

When `publicReads` is true and the repositories are public, the Worker
reads them with no token, and `GITHUB_READ_TOKEN` is not needed.

## The page

The scope Worker serves the room's page at `/page/` from
`packages/scope/src/page-assets.ts`, which is committed and which the
page package's build writes (`docs/page.md`). Deploying the Worker
deploys the page; it needs no binding, setting or secret of its own.

## What is never written down

The values of `SESSION_SECRET`, `GITHUB_APP_PRIVATE_KEY`,
`GITHUB_CREATION_TOKEN`, `GITHUB_READ_TOKEN` and `GITHUB_CLEANUP_TOKENS`.
Set each from a file or from standard input, never as a command argument.
The command line keeps its signing keys in its config directory, readable
only by you, and its config file holds no secret.
