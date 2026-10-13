# Run dap in 10 minutes

Deploy dap on your own Cloudflare account, create a room, and give another
device an invitation. The scope Worker serves both the API and the room page.

**Run status:** this procedure has not yet been run against a fresh account
namespace. All commands and expected output below are unrun. The ten-minute
measurement and second-device result remain to be recorded before delivery.

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

   `npm ci` reports the installed packages. The room assets are committed in
   `packages/scope/src/page-assets.ts`. If you change the page source, rebuild
   them with `node packages/page/scripts/assets.mjs` before deployment.

2. Log in to Cloudflare from the scope package.

   ```sh
   cd packages/scope
   npx -y wrangler@4.147.0 login
   npx -y wrangler@4.147.0 whoami
   cd ../..
   ```

   Login opens your browser. `whoami` lists your account and its ID.
   Keep that ID for the Artifacts hostname below.

3. Choose an unused Worker name and a new Artifacts namespace, such as
   `dap-my-room`. Edit `packages/scope/wrangler.jsonc`: set `name` to that
   Worker name, set the `artifacts` entry's `namespace` to your namespace,
   and add the following top-level plain variables with your chosen values.

   ```json
   "vars": {
       "ARTIFACTS_NAMESPACE": "dap-my-room"
   }
   ```

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
   cd packages/scope
   node --input-type=module -e 'import { randomBytes } from "node:crypto"; process.stdout.write(JSON.stringify({DEPLOYMENT:"dap-my-room",SESSION_SECRET:randomBytes(32).toString("base64url")}));' | npx -y wrangler@4.147.0 secret bulk
   cd ../..
   ```

   Deployment prints the Worker's `https://<name>.<subdomain>.workers.dev`
   address and version ID. Secret storage reports success without printing
   the secret. `DEPLOYMENT` is a nonsecret identity stored through the same
   stdin operation; it retains that meaning even though Wrangler uses a secret
   binding. Both bindings are required for sessions.

5. Keep this room's signing keys in a new private directory. Substitute the
   deployed address and your namespace in the plan command.

   ```sh
   export ARTROOM_HOME="$(mktemp -d)"
   node packages/cli/bin/artroom.js install --plan https://<name>.<subdomain>.workers.dev --host artifacts --namespace dap-my-room
   ```

   The source launcher is the `dap` command. Its physical filename remains
   `artroom.js`. The plan prints `Planned: register sc_...`, its definition,
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
   node packages/cli/bin/artroom.js install --planned
   node packages/cli/bin/artroom.js claim first-room --handle @owner
   ```

   Install prints `Installed: register sc_..., ... as planned.` Claim prints
   the room's directory and membership references after it creates the Git
   repository and enrolls the owner. Keep `ARTROOM_HOME` for later commands.
   If claim gives up waiting, repeat the same command without `--again`.
   Preserve an uncertain install's original plan and run `install --planned`.
   An expired deadline does not authorize replacing an attempted request.

7. Invite the person using the second device.

   ```sh
   node packages/cli/bin/artroom.js invite @guest --role member
   ```

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

Use `--host github.com --namespace <account-login>` when planning. Configure
and authorize the GitHub App before installation. Follow the
[GitHub deployment order](deploy.md#the-order) and the
[GitHub host requirements](hosts.md#github-host-githubcom).
GitHub needs separate repository-creation credentials; an Artifacts binding
needs no external Git credential.

## Run the Counter

The same scope Worker serves `/counting/`. A second Worker is optional if
its data needs a separate namespace. Deploying its page alone does not create
or authorize the Counting application. Follow
[Counter setup](../examples/counting/browser/startup.md) for the explicit
Counting cohort, native factory, membership grants, and device enrollment.

## Deploy the homepage

Edit `homepage/wrangler.jsonc`: choose a new Worker name and remove `routes`
for a `workers.dev` address. A custom domain is optional and must be yours.

```sh
npm run build:home
npm run deploy:home
```

The command prints the homepage address. Its application links still point
at the project's demos; change those links before building to use your own
room and Counter addresses.

## Remove the test deployment

Delete the exact repository names from your new Artifacts namespace first.
List their names, then delete each one with the pinned Wrangler CLI:

```sh
cd packages/scope
npx -y wrangler@4.147.0 artifacts repos list --namespace dap-my-room
npx -y wrangler@4.147.0 artifacts repos delete <repository-name> --namespace dap-my-room
cd ../..
```

Deleting a Worker does not by itself prove its Durable Object storage was
removed. For this disposable deployment, create a replacement entry point:

```sh
printf '%s\n' 'export default { fetch() { return new Response("Removed", {status: 410}); } };' > packages/scope/cleanup-worker.mjs
```

In `packages/scope/wrangler.jsonc`, change `main` to `cleanup-worker.mjs`,
remove `durable_objects`, and append this migration after `v1`:

```json
{ "tag": "v2-remove-self-host", "deleted_classes": ["DeployedScope"] }
```

This replacement exports no Durable Object class. Deploy the deletion
migration, then delete the Worker:

```sh
npm run deploy:scope
cd packages/scope
npx -y wrangler@4.147.0 delete
cd ../..
```

The deletion migration removes the class's objects and their data. See
[Cloudflare's delete migration](https://developers.cloudflare.com/durable-objects/reference/durable-object-class-migrations-legacy/#delete-migration).
Apply this only to the disposable deployment. Do not reuse its configuration
for an existing room.

Pinned Wrangler exposes Artifacts namespace list and get commands but no
namespace deletion command. Cloudflare's published Artifacts REST reference
also lists no namespace deletion route
([Artifacts REST API](https://developers.cloudflare.com/artifacts/api/rest-api/#namespaces)). Removing the repositories leaves an
empty namespace; namespace removal remains unrun and requires a supported
Cloudflare operation. No namespace deletion is claimed by this guide.

If you deployed a homepage Worker, run pinned Wrangler `delete` from
`homepage/` with its disposable configuration. Remove the private
`ARTROOM_HOME` directory when you no longer need its keys or original requests.
