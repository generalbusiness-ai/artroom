# Run dap in 10 minutes

Deploy dap on your own Cloudflare account, create a room, and give another
device an invitation. The scope Worker serves both the API and the room page.

**Measured run:** on 13 October 2026, a fresh deployment produced an invitation
in 31.235 seconds and accepted a guest in 35.481 seconds from the start of the
clone. Login was already complete, and an operator helper entered the
configuration. The guest used an independent browser profile with its own key.
These times do not measure human typing, login, or a second physical device.
The [delivery note](../notes/implementation/2026-10-13-self-host-delivery.md) records the exact
source, commands, results, and remaining cleanup task. Run notes at each step
identify command variations and steps that were not exercised. The commands
below use the current application paths; the delivery note retains the
original run's exact source and commands.

## Deploy a room

You need Git, Node 26, and a Cloudflare account that supports Workers,
Durable Objects with SQLite storage, and Cloudflare Artifacts. Use an account
where you can deploy Workers. The commands use pinned Wrangler 4.147.0;
no global installation or Wrangler dependency in this checkout is needed.

1. Clone the source and install its locked dependencies.

   ```sh
   git clone https://github.com/generalbusiness-ai/dap.git
   cd dap
   npm ci
   ```

   **Run note:** `npm ci` passed. The clone used `--no-checkout`, an explicit
   destination, and a detached checkout of the recorded source commit. The
   unpinned clone above and optional asset rebuild below were not exercised.

   `npm ci` reports the installed packages. The room assets are committed in
   `apps/room/page/assets.ts`. If you change the page source, rebuild
   them with `node apps/room/page/scripts/assets.mjs` before deployment.

2. Log in to Cloudflare from the room application.

   ```sh
   cd apps/room
   npx -y wrangler@4.147.0 login
   npx -y wrangler@4.147.0 whoami
   cd ../..
   ```

   **Run note:** login was a prerequisite and was not run in the timed sequence.
   A separate pinned `whoami --account <account-id> --json` check validated the
   existing OAuth login. The plain `whoami` command above was not exercised.

   Login opens your browser. `whoami` lists your account and its ID.
   Keep that ID for the Artifacts hostname below.

3. Choose an unused Worker name and a new Artifacts namespace, such as
   `dap-my-room`. Edit `apps/room/wrangler.jsonc`: set `name` to that
   Worker name, set the `artifacts` entry's `namespace` to your namespace,
   and add the following top-level plain variables with your chosen values.

   ```json
   "vars": {
       "ARTIFACTS_NAMESPACE": "dap-my-room"
   }
   ```

   **Run note:** the helper entered this configuration for a fresh Worker and
   namespace after complete inventory checks. Manual configuration entry was
   not timed. Deployment created the new storage namespace.

   Keep the `SCOPES` binding and the `v1` SQLite migration. Deployment creates
   a separate Durable Object namespace for the new Worker. The first room's
   repository creates the Artifacts namespace automatically in your account.
   You do not need a namespace-create command. See Cloudflare's
   [namespace guide](https://developers.cloudflare.com/artifacts/concepts/namespaces/).
   The entry's `remote: true` makes local Wrangler development use the live
   Artifacts binding. It is not a second deployment or an access credential.

4. Deploy, then send the deployment identity and a generated session secret
   directly into Wrangler's stdin.

   ```sh
   npm run deploy:scope
   cd apps/room
   node --input-type=module -e 'import { randomBytes } from "node:crypto"; process.stdout.write(JSON.stringify({DEPLOYMENT:"dap-my-room",SESSION_SECRET:randomBytes(32).toString("base64url")}));' | npx -y wrangler@4.147.0 secret bulk
   cd ../..
   ```

   **Run note:** `npm run deploy:scope` and pinned `secret bulk` passed.
   The helper generated the values in memory and sent them through stdin.
   The shell generator pipeline above was not executed verbatim.

   Deployment prints the Worker's `https://<name>.<subdomain>.workers.dev`
   address and version ID. Secret storage reports success without printing
   the secret. `DEPLOYMENT` is a nonsecret identity stored through the same
   stdin operation; it retains that meaning even though Wrangler uses a secret
   binding. Both bindings are required for sessions.

5. Keep this room's signing keys in a new private directory. Substitute the
   deployed address and your namespace in the plan command.

   ```sh
   export DAP_HOME="$(mktemp -d)"
   node packages/cli/bin/dap.js install --plan https://<name>.<subdomain>.workers.dev --host artifacts --namespace dap-my-room
   ```

   **Run note:** the plan command passed with the deployed address and namespace.
   The helper created a private key directory. The `mktemp` line above was not
   exercised.

   The source launcher is the `dap` command. The plan prints `Planned: register sc_...`, its definition,
   and its deadline. It creates nothing. Finish the next two steps before
   that deadline, 14 minutes after the plan.

6. Add `ARTIFACTS_CONFIG` to the same file's `vars`. Use the register ID
   printed by the plan, your namespace, and your account's Artifacts hostname.
   This setting contains no secret.

   ```json
   "ARTIFACTS_CONFIG": "{\"registerScope\":\"sc_<planned-id>\",\"namespace\":\"dap-my-room\",\"host\":\"<account-id>.artifacts.cloudflare.net\",\"maxBytes\":10485760,\"credentialIdentity\":\"adapter-attempt\"}"
   ```

   ```sh
   npm run deploy:scope
   node packages/cli/bin/dap.js install --planned
   node packages/cli/bin/dap.js claim first-room --handle @owner
   ```

   **Run note:** the second deployment, `install --planned`, and
   `claim first-room --handle @owner` passed on the recorded source. No recovery
   command was needed. Any later replacement of `claim` with a different command
   needs its own verification. The original timing does not cover that change.

   Install prints `Installed: register sc_..., ... as planned.` Claim prints
   the room's directory and membership references after it creates the Git
   repository and enrolls the owner. Keep `DAP_HOME` for later commands.
   If claim gives up waiting, repeat the same command without `--again`.
   Preserve an uncertain install's original plan and run `install --planned`.
   An expired deadline does not authorize replacing an attempted request.

7. Invite the person using the second device.

   ```sh
   node packages/cli/bin/dap.js invite @guest --role member
   ```

   **Run note:** the invitation command passed. Native evidence verified the
   owner's administrator role and the distinct guest key's active membership,
   including the full membership reference and incarnation. The independent
   browser-profile join was automated. A physical second-device run remains
   unrun.

   The command prints the invitation ID and an `artroom-invite:...` link.
   This link holds an invitation secret. Share it privately with that person;
   do not include it in logs, screenshots, or a delivery note. On the second
   device, open `https://<name>.<subdomain>.workers.dev/page/`, choose
   **Invitation link**, and paste it. The page creates that device's key,
   joins automatically, and opens the room. If enrollment is unresolved,
   use **Check status** to read
   the original request. A new device has its own key;
   do not copy the owner's key to it.

## Use GitHub instead

**Run status:** this alternative was not exercised in this rehearsal.

Use `--host github.com --namespace <account-login>` when planning. Configure
and authorize the GitHub App before installation. Follow the
[GitHub deployment order](deploy.md#the-order) and the
[GitHub host requirements](hosts.md#github-host-githubcom).
GitHub needs separate repository-creation credentials; an Artifacts binding
needs no external Git credential.

## Run the Counter

**Run status:** Counter setup and enrollment were not exercised in this rehearsal.

The same scope Worker serves `/counting/`. A second Worker is optional if
its data needs a separate namespace. Deploying its page alone does not create
or authorize the Counting application. Follow
[Counter setup](../apps/counter/browser/startup.md) for the explicit
Counting cohort, native factory, membership grants, and device enrollment.

## Run the lending library

**Run status:** the library was not exercised in this rehearsal. Its own
[runbook](../examples/lending/runbook.md) ran on the project's library
deployment on 14 October 2026.

The same scope Worker serves the library's member interface at
`/lending/`. The library needs a room of the `application-publication`
cohort, which the room above is not: plan it with `install --plan ...
--cohort application-publication`. The project gives the library its own Worker and Artifacts
namespace ([its deployment](deploy.md#the-lending-librarys-deployment)).
Follow the [runbook](../examples/lending/runbook.md) to activate the
definition, establish the library, give the roles their actions, and
invite members with `dap invite --keep`.

## Deploy the homepage

Edit `homepage/wrangler.jsonc`: choose a new Worker name and remove `routes`
for a `workers.dev` address. A custom domain is optional and must be yours.

```sh
npm run build:home
npm run deploy:home
```

**Run note:** both npm commands passed for a separate disposable homepage
Worker. Ten anonymous readbacks matched the built bytes, MIME types, and cache
headers, including this guide's homepage link. Custom-domain setup and changes
to application links were not exercised. This was not the project's existing
homepage deployment.

The command prints the homepage address. Its application links still point
at the project's demos; change those links before building to use your own
room, library and Counter addresses.

## Remove the test deployment

Delete the exact repository names from your new Artifacts namespace first.
List their names, then delete each one with the pinned Wrangler CLI:

```sh
cd apps/room
npx -y wrangler@4.147.0 artifacts repos list --namespace dap-my-room
npx -y wrangler@4.147.0 artifacts repos delete <repository-name> --namespace dap-my-room
cd ../..
```

**Run note:** a complete API inventory identified the single owned repository.
Pinned Wrangler deleted it with the added `--force` flag, and a complete API
inventory then confirmed no repositories remained. All nine observed tokens
were already revoked, with none active. The CLI list command and interactive
delete form above were not exercised. A later inventory returned HTTP 403;
its cause and the namespace's current visibility remain unknown.

Deleting a Worker does not by itself prove its Durable Object storage was
removed. For this disposable deployment, create a replacement entry point:

```sh
printf '%s\n' 'export default { fetch() { return new Response("Removed", {status: 410}); } };' > apps/room/cleanup-worker.mjs
```

In `apps/room/wrangler.jsonc`, change `main` to `cleanup-worker.mjs`,
remove `durable_objects`, and append this migration after `v1`:

```json
{ "tag": "v2-remove-self-host", "deleted_classes": ["DeployedScope"] }
```

This replacement exports no Durable Object class. Deploy the deletion
migration, then delete the Worker:

```sh
npm run deploy:scope
cd apps/room
npx -y wrangler@4.147.0 delete
cd ../..
```

**Run note:** the helper wrote `selfhost-cleanup-worker.mjs`, removed the unused
Artifacts binding and plain variables as well as the Durable Object binding,
and deployed the deletion migration with `npm run deploy:scope`. A complete
storage inventory confirmed the owned namespace was absent. The shell `printf`
line and interactive Wrangler `delete` above were not executed verbatim.
The Worker was removed through Cloudflare's nonforced service-delete API,
followed by a complete Worker inventory that confirmed its absence.

The deletion migration removes the class's objects and their data. See
[Cloudflare's delete migration](https://developers.cloudflare.com/durable-objects/reference/durable-object-class-migrations-legacy/#delete-migration).
Apply this only to the disposable deployment. Do not reuse its configuration
for an existing room.

Pinned Wrangler exposes Artifacts namespace list and get commands but no
namespace deletion command. Cloudflare's published Artifacts REST reference
also lists no namespace deletion route
([Artifacts REST API](https://developers.cloudflare.com/artifacts/api/rest-api/#namespaces)). Removing the repositories leaves a
namespace that was last confirmed empty after repository deletion. Namespace
removal is **unsupported and unrun**. A later listing returned HTTP 403, so the
current namespace state is unknown. A supported Cloudflare operation is still
needed. The test deployment has not been fully cleaned up.

**Run note:** the disposable homepage Worker was also removed through the
nonforced service-delete API, and a complete inventory confirmed its absence.
The homepage CLI deletion below remains unrun. Private keys, browser state,
and original requests were retained with the evidence rather than deleted.

If you deployed a homepage Worker, run pinned Wrangler `delete` from
`homepage/` with its disposable configuration. Remove the private
`DAP_HOME` directory when you no longer need its keys or original requests.
