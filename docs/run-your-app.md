# Run your app

In [Build a counter](build-a-counter.md) your app ran in memory, with
test keys, and everyone was allowed to do everything. This page runs the
same definition as a real app: on a service you deploy, in a room that
says who is allowed to do what, with people who sign from their own
devices and agents that take part through tools.

**Not yet run: written from the current commands; it will be run and
recorded when deployments resume.** Only step 2 ran for this page, on
15 October 2026. The lending library's first definition went through the
same path on a deployed service on 14 October 2026, as its
[runbook](../examples/lending/runbook.md#the-rehearsal-run-14-october-2026)
records.

## What you need

You need the `my-counter` directory from the tutorial, a Cloudflare
account that can deploy Workers, and a checkout of the dap repository;
[Run dap in 10 minutes](self-host.md) lists the details. On this page,
`dap` means `node packages/cli/bin/dap.js`, run from the root of the
checkout. The command is not published to a registry yet.

Your app has no browser page yet. The Counter and lending library pages are
built into the service, and a page for an app of your own is not. Members
use the `dap` command, and agents use the MCP tools. A local development
host and installable app packages are planned; see
[Self-contained applications](../notes/2026-10-15-self-contained-applications.md).

## Step 1: Deploy the service

Follow steps 1 to 4 of [Run dap in 10 minutes](self-host.md): clone,
log in, configure and deploy. Stop before step 5. You now have a
service at `https://<name>.<subdomain>.workers.dev`.

## Step 2: Pin the definition

The service needs your definition as exact bytes, and the digest that
names them. A scope keeps that digest for life.

In `my-counter`, install the bytes package and create `pin.ts`:

```sh
npm install --save-exact @generalbusiness/dap-bytes@0.1.0-dev.2
```

```ts
import { writeFileSync } from "node:fs";
import { PROPOSED_BOUNDS } from "@generalbusiness/dap-contract";
import { canonicalize } from "@generalbusiness/dap-bytes";
import { validateDefinition } from "@generalbusiness/dap-derive";
import { RULE_PROFILES } from "@generalbusiness/dap-derive/rule";
import { counter } from "./definition.ts";

const checked = validateDefinition(counter, PROPOSED_BOUNDS, RULE_PROFILES);
if (!checked.ok) {
	console.log(JSON.stringify(checked.problems, null, 2));
	process.exit(1);
}

// The canonical bytes, with no newline at the end: the digest covers exactly these.
const bytes = canonicalize(counter);
writeFileSync("counter.json", bytes);
console.log(`counter.json: ${Buffer.byteLength(bytes)} bytes`);
console.log(`digest: ${checked.definition.digest}`);
```

Run `node pin.ts`. If your definition matches the tutorial's, you see:

```
counter.json: 2135 bytes
digest: sha256:33b7f840f37aad8f023813eb639ebf42b720f0dc635bfe17b4322522d1f7f942
```

Keep `counter.json` exactly as written. Do not open it in an editor that
adds a newline at the end: one extra byte gives a different digest, and
the service refuses the file. The commands below use this digest; use
your own if you changed the definition.

## Step 3: Create a room for apps

A room holds the members, their roles and the rules. An app needs a room
of the `application` kind. From the checkout:

```sh
export DAP_HOME="$(mktemp -d)"
dap install --plan https://<name>.<subdomain>.workers.dev --cohort application --host artifacts --namespace dap-my-room
```

The plan lasts 14 minutes; finish this step within that time. Do step 6
of [Run dap in 10 minutes](self-host.md), with two
changes: add `--cohort application` to `install --planned`, and use
`create` in place of `claim`:

```sh
dap install --planned --cohort application
dap create my-room --handle @rita
```

You are `@rita`, the room's first admin. Keep `DAP_HOME`: it holds your
signing key.

## Step 4: Turn the definition on

The room's rules list the definitions it allows. As an admin, add yours.
Change `~/my-counter` to wherever your directory is:

```sh
dap act activate --on rules --set digest=sha256:33b7f840f37aad8f023813eb639ebf42b720f0dc635bfe17b4322522d1f7f942 --set name=counter --value ~/my-counter/counter.json
```

## Step 5: Start the counter

Ask the room to create the counter from that definition. This signs the
counter's first act, `start`. The room fills in `opener` with you, so
you own the board; you give the target:

```sh
dap act establish-application --on directory --set definition=sha256:33b7f840f37aad8f023813eb639ebf42b720f0dc635bfe17b4322522d1f7f942 --set 'values={"target":3}' --set execution=recorded-do --value ~/my-counter/counter.json
```

`values` must be compact JSON with its keys in order, exactly as shown.
If the answer is lost, do not run the command again: a second run would
create a second counter. Read the directory's journal first, with
`dap log directory`.

The counter is a new scope with its own ID, `sc_...`. The command line
does not list apps yet: find the entry that records the creation in
`dap log directory` and read it with `dap show directory:<entry>`, or ask
an agent's `room` tool. Below, `$COUNTER` stands for that ID.

## Step 6: Say who may do what

`join` and `say` both need the action `counter.play`. Being a member of
the room does not give it. Give it to each role that should play.

`set-actions` replaces a role's whole list, so start from the current
list and add to it. In a new room, the lists are in membership's first
entry: `dap show membership:0`. Then, for example:

```sh
dap act set-actions --on membership --target 0 --set role=member --set 'actions=[...the member list..., "counter.play"]'
dap act set-actions --on membership --target 0 --set role=admin --set 'actions=[...the admin list..., "counter.play"]'
```

A change of actions may not take effect at once: scopes reuse what
membership told them for a short time.

## Step 7: Invite people

`dap invite` prints a link that holds a secret. Send it to `@una` only.
`@una` runs `dap join` on their own computer, from a checkout, with a
new empty `DAP_HOME`:

```sh
dap invite @una --role member --keep    # you
dap join artroom-invite:...             # @una
```

## Step 8: Use it

Each person signs with their own key. From the command line:

```sh
dap act join --on $COUNTER
dap act say --on $COUNTER --target 0 --set n=1
```

`--target 0` names the board, item 0. Each command prints `Took effect:`
with the entry it wrote, or `Refused:` with the reason. If `@una` says a
second number in a row, the answer names the guard you wrote:
`not-your-turn`. To read the history and check it:

```sh
dap log $COUNTER
dap verify $COUNTER
```

For an agent, run `dap mcp` with the agent's own `DAP_HOME`. Give the
agent a seat the same way, with an invitation and `dap join`.
[Creating an agent](mcp.md#creating-an-agent-the-controllers-recipe)
describes a seat that records who controls the agent. The server reads
the room and makes one tool for each act your definition declares:
`counter.join` and `counter.say`. A call to `counter.say` looks like
this:

```json
{ "target": "<the counter's sc_ ID>", "on": 0, "fields": { "n": 2 }, "idempotencyKey": "say-2" }
```

The answer is `accepted` or `refused`, with the same reasons. If the
answer is lost, make the same call again, with the same
`idempotencyKey`: the scope does not count it twice.

## The lending library

The same steps run the library you wrote in
[Build a lending library](build-a-lending-library.md). In `pin.ts`,
import `lending` in place of `counter` and write `lending.json`; the
digest is
`sha256:439cd20ea9e0b72294d091d3bdcfe13de8c1f31d5685c40bc7bd2754860784ff`.
Its only first-act field is `opener`, so `values` is `{}`. Give
`lending.member` to the member and admin roles, and `lending.staff` to
admin only.

## Where to go next

- [Write an application](write-an-application.md): the reference for
  definitions, where each kind of rule belongs, and pins.
- [The dap command](cli.md), [MCP](mcp.md) and
  [the ten terms](manual/ten-terms.md): every command, tool and word.
