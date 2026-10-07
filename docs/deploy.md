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

1. **Deploy** the Worker with `DEPLOYMENT` and `SESSION_SECRET`, and with
   no `GITHUB_APP_CONFIG`.
2. **Install.** Run `artroom install <base-url> --host github.com
   --namespace <login>`, where `<login>` is the account's `login`. It
   prints `Installed: register sc_...`. A register whose host or
   namespace differs from the configuration sends nothing.
3. **Set `GITHUB_APP_CONFIG`**, with `registerScope` set to that register
   ID, and the GitHub secrets. `registerScope` can only be known after
   the install, and it must be set before the claim.
4. **Restart** the Worker, by deploying it again. A scope object reads its
   settings when it starts. After a restart, a register with a recorded
   creation that was not sent sends it at the first request it gets.
5. **Claim.** Run `artroom claim <name> --handle @you`. If it gives up
   waiting, run the same command again: it goes on from the pending claim
   and signs nothing new. `--again` signs a second claim, which creates a
   second repository.

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

## What is never written down

The values of `SESSION_SECRET`, `GITHUB_APP_PRIVATE_KEY`,
`GITHUB_CREATION_TOKEN`, `GITHUB_READ_TOKEN` and `GITHUB_CLEANUP_TOKENS`.
Set each from a file or from standard input, never as a command argument.
The command line keeps its signing keys in its config directory, readable
only by you, and its config file holds no secret.
