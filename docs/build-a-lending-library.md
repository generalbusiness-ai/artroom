# Build a lending library

In this tutorial we build the lending library's definition on dap and
watch each act take effect. Members donate things to the library, borrow
them and return them, and staff remove a thing that is lost or broken.
By the last step the definition is the same one the
[lending library](../examples/lending) runs: its digest matches the
library's pin.

[Build a counter](build-a-counter.md) teaches guards that compare lists
and rules that check arithmetic. This tutorial teaches the other half of
most applications:

- many items of one type, each with its own life;
- states, and acts that move an item from one state to another;
- a final state that no act can leave;
- bounded text fields;
- grants, which decide who may sign which act.

We write the definition in four steps. After each step we run it in a
scope held in memory, sign acts as test members, and print what the scope
recorded. No service, deployment or browser is involved.

## Before you start

This page ran with Node.js 26.11.1, npm 11.20.0, and all six published SDK
packages at `0.1.0-dev.2`.
Create an empty directory outside a repository checkout:

```sh
mkdir my-library
cd my-library
npm init -y
npm pkg set type=module
npm install --save-exact @generalbusiness/dap-contract@0.1.0-dev.2 @generalbusiness/dap-bytes@0.1.0-dev.2 @generalbusiness/dap-client@0.1.0-dev.2 @generalbusiness/dap-derive@0.1.0-dev.2 @generalbusiness/dap-platform@0.1.0-dev.2 @generalbusiness/dap-replay@0.1.0-dev.2
```

We write two TypeScript files in this directory. Node runs them directly;
the framework imports resolve to compiled JavaScript in the installed
packages.

The tutorial uses `@generalbusiness/dap-derive/testing`, an in-memory test
scope with fixed keys. That fixture judges, seals and folds entries as a
real scope does. Until step 4 it allows every test key to take every
action, so each refusal before then comes from the definition. In step 4
we present grants ourselves, as a room's membership would. The fixture
does not establish native membership or hosted authority.

The observed run installed the packages from npm in a new directory
outside any checkout, on 14 October 2026. All four `node run.ts` commands
exited 0. Steps 1 and 2 show the complete output. Steps 3 and 4 show the
new lines at the end.

## Step 1: declare the library and create the scope

Every scope starts with a genesis act. Ours is `establish`. It opens the
one `library` item and records the member who founded it.

Create `definition.ts`:

```ts
import type { ActType, DeclaredDefinition, ItemType } from "@generalbusiness/dap-contract";

const person = { fixed: false, required: false, list: false, author: false };

const library: ItemType = {
	many: false, max: 1,
	states: { open: { final: false } }, initial: "open",
	parties: { founder: { ...person, fixed: true, required: true } },
	refs: {},
	values: {},
};

const establish: ActType = {
	step: "open", on: "library", grant: "lending.establish",
	also: {}, guards: [], sends: [], attention: [],
	fields: { opener: { type: "member", required: true } },
	effects: [{ party: { slot: "founder", from: { field: "opener" } } }],
};

export const lending: DeclaredDefinition = {
	format: "artroom-definition-1",
	name: "lending",
	profile: { name: "restricted", version: 1 },
	capabilities: [],
	genesis: "establish",
	items: { library },
	acts: { establish },
	receives: {},
	timed: {},
	rules: {},
};
```

`many: false, max: 1` means there is exactly one library. Its `founder`
slot is a party: it holds a member. `fixed: true` means nothing can change
the slot after the item opens.

Now create `run.ts`. It validates the definition, creates a scope with
`@rita` as the founder, and prints the library item:

```ts
import { PROPOSED_BOUNDS } from "@generalbusiness/dap-contract";
import { validateDefinition } from "@generalbusiness/dap-derive";
import { RULE_PROFILES } from "@generalbusiness/dap-derive/rule";
import { founded, keys, valid } from "@generalbusiness/dap-derive/testing";
import { lending } from "./definition.ts";

const checked = validateDefinition(lending, PROPOSED_BOUNDS, RULE_PROFILES);
if (!checked.ok) {
	console.log(JSON.stringify(checked.problems, null, 2));
	process.exit(1);
}
console.log(`valid: ${checked.definition.digest}`);

const scope = founded(valid(checked), { opener: keys.rita.member });

// Print one item: its type, its state and the slots that hold something.
function show(id: number) {
	const item = scope.item(id);
	const slots = [
		...Object.entries(item.parties).filter(([, m]) => m).map(([slot, m]) => `${slot}=${m!.member}`),
		...Object.entries(item.values).filter(([, v]) => v !== null).map(([slot, v]) => `${slot}=${JSON.stringify(v)}`),
	];
	console.log(`  item ${id}, ${item.type}, ${item.state}: ${slots.join(" ")}`);
}

show(0);
```

Run it from your tutorial directory:

```sh
node run.ts
```

You should see:

```
valid: sha256:e4150c41dcd7606dbed753582319eefabfb4cced0723af3822069ba57350aa19
  item 0, library, open: founder=@rita
```

The first line is the definition's digest. A scope pins that digest at
genesis and is judged by that definition for life.

## Step 2: let members donate things

A library holds many things. We add a `thing` item type, with
`many: true` and a limit of 64 live things, and a `donate` act that opens
one. A thing has a name of up to 80 characters and a description of up to
1000. The donor is whoever signs the act.

Add these declarations to `definition.ts`, above
`export const lending`:

```ts
const text = (max: number) => ({ type: "text", max } as const);

const thing: ItemType = {
	many: true, max: 64,
	states: { available: { final: false } }, initial: "available",
	parties: { donor: { ...person, fixed: true, required: true } },
	refs: {},
	values: {
		name: { fixed: true, required: true, of: text(80) },
		description: { fixed: true, required: true, of: text(1000) },
	},
};

const donate: ActType = {
	step: "open", on: "thing", grant: "lending.member",
	also: {}, guards: [], sends: [], attention: [],
	fields: {
		name: { ...text(80), required: true },
		description: { ...text(1000), required: true },
	},
	effects: [
		{ party: { slot: "donor", from: { signer: true } } },
		{ value: { slot: "name", from: { field: "name" } } },
		{ value: { slot: "description", from: { field: "description" } } },
	],
};
```

Then add the new item type and act to `lending`:

```ts
	items: { library, thing },
	acts: { establish, donate },
```

The act's `grant` names the action a signer must hold:
`lending.member`. Step 4 uses it.

In `run.ts`, change the testing import to bring in more helpers:

```ts
import { fields, founded, keys, on, valid, type Actor, type Over } from "@generalbusiness/dap-derive/testing";
```

Add an `act` helper and three donations to the end of `run.ts`. The
helper signs an intent, judges it, and writes the entry if the act takes
effect:

```ts

// Sign an act, judge it, and write the entry if it takes effect.
function act(who: Actor, kind: string, over: Over = {}) {
	const judgment = scope.act(who, kind, over);
	const reason = judgment.result === "refused" ? ` (${judgment.reason}, ${judgment.detail})` : "";
	console.log(`${who.member.member} ${kind}: ${judgment.result}${reason}`);
}

act(keys.rita, "donate", fields({ name: "Big pot", description: "A heavy copper pot. Holds eight litres." }));
act(keys.una, "donate", fields({ name: "A pot whose name is far too long to fit on the little label of the shelf where it sits", description: "Small." }));
act(keys.una, "donate", fields({ name: "Small pot", description: "Born when the big pot was with me." }));
show(1);
show(2);
```

Run the same command again. You should see:

```
valid: sha256:243fc67d132e9d16fd0161259051e0ed5d8e2ebdacc1dfb13c6b62d7530945a9
  item 0, library, open: founder=@rita
@rita donate: write
@una donate: refused (bad-field, name is not a value of its type)
@una donate: write
  item 1, thing, available: donor=@rita name="Big pot" description="A heavy copper pot. Holds eight litres."
  item 2, thing, available: donor=@una name="Small pot" description="Born when the big pot was with me."
```

`write` means the act took effect and the scope wrote its entry. The
second donation is refused because its name has 86 characters, more than
the 80 the field allows. A refused act writes nothing, so the small pot
is item 2. Each thing starts in the type's `initial` state, `available`.

The scope checks a field's type and length, not its meaning. It records
the description in the member's own words.

## Step 3: borrow and return

A thing moves between two states: `available` and `lent`. A `transition`
act changes the state of an item that already exists. Its guards say
which states it may start from.

In `definition.ts`, replace the `states` and `parties` lines of `thing`
with these. They add the `lent` state and a `borrower` slot that can
change:

```ts
	states: { available: { final: false }, lent: { final: false } }, initial: "available",
	parties: {
		donor: { ...person, fixed: true, required: true },
		borrower: person,
	},
```

Add the two acts above `export const lending`. `return` is a reserved
word in JavaScript, so the constant is called `giveBack`; the act's name
is still `return`:

```ts
const borrow: ActType = {
	step: "transition", on: "thing", grant: "lending.member",
	also: {}, fields: {}, sends: [], attention: [],
	guards: [{ state: ["available"] }],
	effects: [{ state: "lent" }, { party: { slot: "borrower", from: { signer: true } } }],
};

const giveBack: ActType = {
	step: "transition", on: "thing", grant: "lending.member",
	also: {}, fields: {}, sends: [], attention: [],
	guards: [{ state: ["lent"] }],
	effects: [{ state: "available" }, { party: { slot: "borrower", from: null } }],
};
```

Then change the `acts` line of `lending`:

```ts
	acts: { establish, donate, borrow, return: giveBack },
```

Add a borrow, a second borrow and a return to the end of `run.ts`.
`on(scope, 1)` names item 1, the big pot, and the revision that the
signer read:

```ts

act(keys.una, "borrow", on(scope, 1));
show(1);
act(keys.vic, "borrow", on(scope, 1));
act(keys.vic, "return", on(scope, 1));
show(1);
```

Run the command again. The first line now shows the digest
`sha256:3cbca1f954087ddf2d78f5de6c19e0db2545bf7139bf687f7223e8aaa93f9499`.
The new lines at the end are:

```
@una borrow: write
  item 1, thing, lent: donor=@rita borrower=@una name="Big pot" description="A heavy copper pot. Holds eight litres."
@vic borrow: refused (guard-failed, guards.0)
@vic return: write
  item 1, thing, available: donor=@rita name="Big pot" description="A heavy copper pot. Holds eight litres."
```

`@vic`'s borrow is refused by guard 0, which requires the pot to be
`available`. It is `lent`. `@vic` can still return it: the `return` act
has no guard on who signs it. This is a choice in the library's design.
A neighbour who finds the pot on the doorstep can bring it back for the
borrower. The return clears the `borrower` slot.

## Step 4: let staff remove a thing

Some things are lost or broken. Staff remove them with `cancel`, which
records a reason and moves the thing to `gone`. `gone` is a final state:
the scope refuses every act on an item in a final state.

In `definition.ts`, replace the `states` line of `thing`:

```ts
	states: { available: { final: false }, lent: { final: false }, gone: { final: true } }, initial: "available",
```

Add a `reason` value to `thing`, after `description`:

```ts
		reason: { fixed: false, required: false, of: text(280) },
```

Add the act above `export const lending`. Its grant is `lending.staff`,
not `lending.member`:

```ts
const cancel: ActType = {
	step: "transition", on: "thing", grant: "lending.staff",
	also: {}, sends: [], attention: [],
	fields: { reason: { ...text(280), required: true } },
	guards: [{ state: ["available", "lent"] }],
	effects: [
		{ state: "gone" },
		{ value: { slot: "reason", from: { field: "reason" } } },
		{ party: { slot: "borrower", from: null } },
	],
};
```

Then change the `acts` line of `lending`:

```ts
	acts: { establish, donate, borrow, return: giveBack, cancel },
```

So far the fixture has let every key take every action. A real room
grants actions to roles in its membership scope. In the deployed library
the `admin` role holds `lending.member` and `lending.staff`, and the
`member` role holds `lending.member`. We now present those grants
ourselves.

In `run.ts`, add `grantOf` to the testing import:

```ts
import { fields, founded, grantOf, keys, on, valid, type Actor, type Over } from "@generalbusiness/dap-derive/testing";
```

Add this function above the `act` helper:

```ts

// The roles a room would grant: @rita is staff and a member; @una and @vic are members.
function room() {
	const roles = (who: Actor) => who === keys.rita ? ["lending.member", "lending.staff"] : ["lending.member"];
	return { grants: [keys.rita, keys.una, keys.vic].map((who) => ({ grant: grantOf(who, scope.at, roles(who)), current: true })) };
}
```

In the `act` helper, change the first line so that every act is judged
with those grants:

```ts
	const judgment = scope.act(who, kind, over, room());
```

Add the end of the story to `run.ts`. `@una` borrows the big pot again
and says it died. Then the script folds the record again from the start
and compares the state:

```ts

act(keys.una, "borrow", on(scope, 1));
act(keys.una, "cancel", { ...on(scope, 1), ...fields({ reason: "The pot died." }) });
act(keys.rita, "cancel", { ...on(scope, 1), ...fields({ reason: "@una says the pot died." }) });
show(1);
act(keys.una, "return", on(scope, 1));

const replayed = scope.replay();
console.log(`${scope.entries.length} entries; replay gives the same state: ${replayed.snapshot() === scope.state.snapshot()}`);
```

Run the command again. The first line now shows the digest
`sha256:439cd20ea9e0b72294d091d3bdcfe13de8c1f31d5685c40bc7bd2754860784ff`.
The new lines at the end are:

```
@una borrow: write
@una cancel: refused (unauthorized, no current grant of lending.staff to this key in this scope)
@rita cancel: write
  item 1, thing, gone: donor=@rita name="Big pot" description="A heavy copper pot. Holds eight litres." reason="@una says the pot died."
@una return: refused (final, item 1 is gone)
7 entries; replay gives the same state: true
```

`@una` holds `lending.member` but not `lending.staff`, so the scope
refuses the cancel as `unauthorized`. `@rita` is staff, and the
pot is `gone`, with the reason recorded and the borrower cleared. The
return is refused because `gone` is final.

The earlier acts in the script still take effect, because `@rita`, `@una`
and `@vic` all hold `lending.member`.

The digest on the first line is the digest in
[examples/lending/pin.ts](../examples/lending/pin.ts). You have written
the lending library's definition. The canonical bytes do not depend on
the order of keys in the source, so this file and
[the library's own](../examples/lending/definition.ts) give the same pin.

The last line shows that folding the seven entries again gives the same
state. That is what a verifier does with a real scope's history.

## Where to go next

- [The lending library](../examples/lending) runs this definition in a
  room: its member interface, joining by invitation, and kept requests.
  Its source and tests belong to a repository checkout, not the published
  SDK packages.
- [Write an application](write-an-application.md) shows how to place
  invariants in guards, grants and rules, then validate and pin a
  definition of your own.
- [Build a counter](build-a-counter.md) uses guards that compare lists
  and rules in the restricted rule language.
- [Scopes](scopes.md) lists every form a definition can use.
