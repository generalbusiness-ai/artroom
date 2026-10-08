# Deploying the scope Worker

This page says which settings and secrets the scope Worker takes, and in
what order to set them so that a claim creates its repository on GitHub,
the secondary host in the re-cut demo plan. The ARTIFACTS install path is
the separate host-adapter delivery.
Nothing in this repository deploys the Worker. The Worker's code is
`packages/scope/src/worker.ts`; its configuration is
`packages/scope/wrangler.jsonc`.

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

The host setting pins the register's exact scope ID. Plan first so the
setting can be in place before the register starts:

1. **Deploy** the Worker with `DEPLOYMENT` and `SESSION_SECRET`.
2. **Plan.** Run `artroom install --plan <base-url> --host github.com
   --namespace <login>`, where `<login>` is the account's login. It signs
   and saves the original install intent, prints the register ID and
   deadline, and submits nothing.
3. **Set `GITHUB_APP_CONFIG`**, with `registerScope` set to that exact
   planned ID, and the GitHub secrets. Changing the install envelope,
   including nonce or deadline, changes the pin. A register whose host
   or namespace differs from the setting sends nothing.
4. **Install.** Run `artroom install --planned` before the printed deadline.
   A never-attempted expired plan sends nothing. An attempted plan cannot
   be silently replaced: after an uncertain reply or config save, retry
   this command with the original plan. The server may acknowledge the
   same accepted founding after expiry; an expired unaccepted founding
   remains refused. The original plan and native receipt stay retained
   as `service-acknowledged`, not independently verified genesis bytes.
5. **Claim.** Run `artroom claim <name> --handle @you` within the initial
   bootstrap read window. If an accepted claim's enrollment is interrupted,
   repeat the command: it preserves saved signatures and deadlines. `--again`
   deliberately signs a second claim, which may create another repository
   while an earlier unknown claim can still take effect.

For the hosting's own Git service use `--host artifacts --namespace
artroom-demo` and `ARTIFACTS_CONFIG` ([hosts.md](hosts.md)).

Identity recovery after expiry does not yet guarantee a usable fresh claim.
The current client still needs the register summary to build a new found
intent. A code-backed expected-state context is proposed separately; the
retained native receipt does not establish historical executable
correspondence or authorize that summary read. Do not refresh the original
intent or assume a current grant from recovered identity.

Plain `artroom install <base-url>` still founds immediately. If its host
setting is configured afterwards, an already-running register may retain
the previous setting until restart. The planner's 7 October own-host run
observed about two minutes before the object restarted; its first claim
reached the 120-read limit and resumed without a second found. That is an
observed delay, not a guaranteed restart bound. Planning first avoids this
ordering problem without promising a live deployment or immediate restart.

Keep `DEPLOYMENT` configured on every source deployment and secret update.
When the configuration file omits existing plain variables, Wrangler deploy
needs `--keep-vars` to preserve them. Verify session issuance rather than
assuming a stored session secret is sufficient: both bindings are required.
The recorded builder run initially returned `sessions-unavailable` and
succeeded after both bindings were restored through stdin.

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
