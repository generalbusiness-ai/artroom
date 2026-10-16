# Build a lending library

In about 15 minutes you build the core of a lending library for
kitchenware and tools. Members donate things, borrow them and return
them. Staff remove a thing that is lost or broken. You watch the library
accept some requests and refuse others, each refusal with a reason.
Everything runs in memory on your computer: there is no server, account
or browser.

This page stands alone. If you have done [Build a counter](build-a-counter.md),
the first step will look familiar.

## Before you start

You need Node.js 22.18 or later, which runs TypeScript files directly,
and npm. Some Node.js versions print a warning that this is
experimental. Make the project in an empty directory outside any
repository checkout:

```sh
mkdir my-library
cd my-library
npm init -y
npm pkg set type=module
npm install --save-exact @generalbusiness/dap-contract@0.1.0-dev.2 @generalbusiness/dap-derive@0.1.0-dev.2
```

You write two files: `definition.ts` describes the library, and `run.ts`
runs it.

This page ran on 15 October 2026 with Node.js 26.12.0, npm 11.20.0 and
both packages at `0.1.0-dev.2`. Every output block below is copied from
that run.

## Step 1: Describe the library and print it

The app keeps one library, which records who set it up.

Create `definition.ts`:

```ts
import type { ActType, DeclaredDefinition, ItemType } from "@generalbusiness/dap-contract";

// A slot that holds a person. `fixed` slots cannot change once set.
const person = { fixed: false, required: false, list: false, author: false };

// The one library, and the person who set it up.
const library: ItemType = {
	many: false, max: 1,
	states: { open: { final: false } }, initial: "open",
	parties: { founder: { ...person, fixed: true, required: true } },
	refs: {},
	values: {},
};

// Setting up the library makes it.
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

Create `run.ts`. It checks the description, sets up a library in memory
with `@rita` as its founder, and prints the library:

```ts
import { PROPOSED_BOUNDS } from "@generalbusiness/dap-contract";
import { validateDefinition } from "@generalbusiness/dap-derive";
import { RULE_PROFILES } from "@generalbusiness/dap-derive/rule";
import { fields, founded, grantOf, keys, on, valid, type Actor, type Over } from "@generalbusiness/dap-derive/testing";
import { lending } from "./definition.ts";

// Check the description. If it has problems, print them and stop.
const checked = validateDefinition(lending, PROPOSED_BOUNDS, RULE_PROFILES);
if (!checked.ok) {
	console.log(JSON.stringify(checked.problems, null, 2));
	process.exit(1);
}
console.log(`valid: ${checked.definition.digest}`);

// Set up a library in memory, founded by @rita.
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

`keys` holds five test people, each with a signing key: `@rita`, `@una`,
`@vic`, `@paul` and `@sam`. In this release the function that makes a
test library is called `founded`; the next release renames it to use the
word "create".

Run it:

```sh
node run.ts
```

You should see:

```
valid: sha256:e4150c41dcd7606dbed753582319eefabfb4cced0723af3822069ba57350aa19
  item 0, library, open: founder=@rita
```

The first line is a fingerprint of your description. Change one
character and it changes.

> **This is called…** The description is a **definition**, and the
> fingerprint is its **digest**. A thing the app keeps is an **item**.
> The object that holds the items and judges requests is a **scope**.

## Step 2: Let members donate things

A library holds many things. Each thing has a donor, a name of at most
80 bytes and a description of at most 1000. The donor is whoever signs
the donation.

Add this to `definition.ts`, above `export const lending`:

```ts
const text = (max: number) => ({ type: "text", max } as const);

// Many things, at most 64 at a time. A new thing is available.
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

// Donating makes a thing. The signer is its donor.
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

In `lending`, change the `items` and `acts` lines:

```ts
	items: { library, thing },
	acts: { establish, donate },
```

Add this to the end of `run.ts`. The `act` function signs a request as
one person, has the scope judge it, and prints the answer:

```ts
// Sign a request as `who`, have the scope judge it, and print the answer.
function act(who: Actor, kind: string, over: Over = {}) {
	const answer = scope.act(who, kind, over);
	const said = answer.result === "write" ? "took effect"
		: answer.result === "refused" ? `refused, ${answer.reason} (${answer.detail})`
		: answer.result;
	console.log(`${who.member.member} ${kind}: ${said}`);
}

act(keys.rita, "donate", fields({ name: "Big pot", description: "A heavy copper pot. Holds eight litres." }));
act(keys.una, "donate", fields({ name: "A pot whose name is far too long to fit on the little label of the shelf where it sits", description: "Small." }));
act(keys.una, "donate", fields({ name: "Small pot", description: "Born when the big pot was with me." }));
show(1);
show(2);
```

Run `node run.ts` again. You should see:

```
valid: sha256:243fc67d132e9d16fd0161259051e0ed5d8e2ebdacc1dfb13c6b62d7530945a9
  item 0, library, open: founder=@rita
@rita donate: took effect
@una donate: refused, bad-field (name is not a value of its type)
@una donate: took effect
  item 1, thing, available: donor=@rita name="Big pot" description="A heavy copper pot. Holds eight litres."
  item 2, thing, available: donor=@una name="Small pot" description="Born when the big pot was with me."
```

The scope runs from the start each time, so the earlier lines repeat.
The second donation is refused: its name is 86 bytes, more than 80. A
refused request changes nothing, so the small pot is item 2. The scope
checks a field's type and length, not its meaning.

> **This is called…** Something a person can do, such as `donate`, is an
> **act**. When an act passes every check, it **takes effect**: the
> scope writes it down. When it fails, the scope **refuses** it, names
> the reason and writes nothing.

## Step 3: Borrow and return

A thing is either available or lent. Borrowing moves it from available
to lent and records the borrower. Returning moves it back. The rule: you
can borrow only a thing that is available.

In `definition.ts`, change the `states` line of `thing`, and replace its
`parties` line with these lines:

```ts
	states: { available: { final: false }, lent: { final: false } }, initial: "available",
	parties: {
		donor: { ...person, fixed: true, required: true },
		borrower: person,
	},
```

Add the two acts above `export const lending`. `return` is a reserved
word in JavaScript, so the constant is called `giveBack`; the act is
still called `return`:

```ts
// Borrow an available thing. The signer becomes its borrower.
const borrow: ActType = {
	step: "transition", on: "thing", grant: "lending.member",
	also: {}, fields: {}, sends: [], attention: [],
	guards: [{ state: ["available"] }],
	effects: [{ state: "lent" }, { party: { slot: "borrower", from: { signer: true } } }],
};

// Return a lent thing. Anyone may bring it back.
const giveBack: ActType = {
	step: "transition", on: "thing", grant: "lending.member",
	also: {}, fields: {}, sends: [], attention: [],
	guards: [{ state: ["lent"] }],
	effects: [{ state: "available" }, { party: { slot: "borrower", from: null } }],
};
```

In `lending`, change the `acts` line:

```ts
	acts: { establish, donate, borrow, return: giveBack },
```

Add this to the end of `run.ts`. `on(scope, 1)` names item 1, the big
pot, and the version of it that the signer last read:

```ts
act(keys.una, "borrow", on(scope, 1));
show(1);
act(keys.vic, "borrow", on(scope, 1));
act(keys.vic, "return", on(scope, 1));
show(1);
```

Run `node run.ts` again. The first line shows a new digest. The new lines
at the end are:

```
@una borrow: took effect
  item 1, thing, lent: donor=@rita borrower=@una name="Big pot" description="A heavy copper pot. Holds eight litres."
@vic borrow: refused, guard-failed (guards.0)
@vic return: took effect
  item 1, thing, available: donor=@rita name="Big pot" description="A heavy copper pot. Holds eight litres."
```

`@vic` cannot borrow the pot, because `@una` has it. `@vic` can still
return it: this library lets a neighbour who finds the pot on the
doorstep bring it back.

> **This is called…** `available` and `lent` are **states** of the
> thing. A rule that an act must pass, such as "the thing is available",
> is a **guard**. `guards.0` names the first guard of `borrow`.

## Step 4: Let only staff remove a thing

Some things get lost or broken. Staff remove them with `cancel`, which
records a reason and moves the thing to `gone`. Nothing can bring back a
thing that is gone.

So far the test library has let everyone do everything. Now we say who
is allowed: `@rita` is staff and a member; `@una` and `@vic` are
members.

In `definition.ts`, change the `states` line of `thing` to add `gone`:

```ts
	states: { available: { final: false }, lent: { final: false }, gone: { final: true } }, initial: "available",
```

Add a `reason` line to the `values` of `thing`, after `description`:

```ts
		reason: { fixed: false, required: false, of: text(280) },
```

Add the act above `export const lending`. It needs `lending.staff`, not
`lending.member`:

```ts
// Staff remove a thing that is lost or broken, with a reason.
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

In `lending`, change the `acts` line:

```ts
	acts: { establish, donate, borrow, return: giveBack, cancel },
```

In `run.ts`, add this function above the `act` function. It says what
each person is allowed to do, as a real library's membership would:

```ts
// Who is allowed what: @rita is staff and a member; @una and @vic are members.
function room() {
	const allowed = (who: Actor) => who === keys.rita ? ["lending.member", "lending.staff"] : ["lending.member"];
	return { grants: [keys.rita, keys.una, keys.vic].map((who) => ({ grant: grantOf(who, scope.at, allowed(who)), current: true })) };
}
```

In the `act` function, change the first line so that every request is
judged with those permissions:

```ts
	const answer = scope.act(who, kind, over, room());
```

Add the end of the story to `run.ts`. `@una` borrows the big pot again
and it breaks:

```ts
act(keys.una, "borrow", on(scope, 1));
act(keys.una, "cancel", { ...on(scope, 1), ...fields({ reason: "The pot died." }) });
act(keys.rita, "cancel", { ...on(scope, 1), ...fields({ reason: "@una says the pot died." }) });
show(1);
act(keys.una, "return", on(scope, 1));

// Build the state again from the history alone, and compare.
const replayed = scope.replay();
console.log(`${scope.entries.length} entries; replay gives the same state: ${replayed.snapshot() === scope.state.snapshot()}`);
```

Run `node run.ts` again. The first line shows the digest
`sha256:439cd20ea9e0b72294d091d3bdcfe13de8c1f31d5685c40bc7bd2754860784ff`.
The new lines at the end are:

```
@una borrow: took effect
@una cancel: refused, unauthorized (no current grant of lending.staff to this key in this scope)
@rita cancel: took effect
  item 1, thing, gone: donor=@rita name="Big pot" description="A heavy copper pot. Holds eight litres." reason="@una says the pot died."
@una return: refused, final (item 1 is gone)
7 entries; replay gives the same state: true
```

`@una` is a member but not staff, so the cancel is refused. `@rita` is
staff: the pot is gone, with the reason, and nobody holds it. The return
is refused because nothing can leave `gone`. The earlier acts still take
effect, because all three people are members.

The last line counts what the library wrote down: the setup and six acts.
Refused requests are not in it. Building the state again from those seven
entries gives the same library.

That digest is the pin of the lending library's
[first definition](https://github.com/generalbusiness-ai/dap/blob/dedcb14b1d9483bfde3064f5bc09756b34b99f8d/examples/lending/definition.ts),
which its rehearsal room runs. The digest does not depend on the order
of keys in the source, so you have written that definition.

> **This is called…** `lending.member` and `lending.staff` are
> **actions**. Each act's `grant` names the action its signer must hold.
> A room gives actions to roles, and roles to members. `gone` is a
> **final state**. The list of entries is the scope's **journal**, and
> building the state again from it is **replay**.

## Step 5: Turn it into a running app

So far the library has run in one process, with test keys and
permissions you made up. In a running dap app, a room gives the actions
to roles, and each member signs with their own key. You pin the
definition's exact bytes, turn it on in the room, and ask the room to
create the library; the room fills in `opener` with you. This exact
definition ran that way on a deployed service on 14 October 2026.
[Run your app](run-your-app.md) takes you through it.

## What you just used, by its dap name

| What you did | The dap name |
|---|---|
| Described what the library keeps and what people can do | [Definition](manual/ten-terms.md#2-definition), pinned by its digest |
| The library and its things | [Items](manual/ten-terms.md#3-item), with states and slots |
| Held the items and judged each request | [Scope](manual/ten-terms.md#1-scope) |
| Donate, borrow, return and cancel | [Acts](manual/ten-terms.md#4-act-and-action) |
| Who is allowed: `lending.member`, `lending.staff` | [Actions](manual/ten-terms.md#4-act-and-action), given by grants |
| "Only an available thing can be borrowed" | A [guard](write-an-application.md#put-each-invariant-where-it-lives) |
| `gone`, which nothing can leave | A final [state](manual/ten-terms.md#3-item) |
| "took effect" and "refused, …" | [Takes effect and refusal](manual/ten-terms.md#6-takes-effect-receipt-and-refusal) |
| What the library wrote down | The [journal](manual/ten-terms.md#5-entry-and-journal) of entries |
| Built the state again from the history | [Replay](manual/ten-terms.md#10-replay) |

## Where to go next

- [Run your app](run-your-app.md): run this library in a room, for
  people and agents.
- [Write an application](write-an-application.md): the reference for
  definitions, where each kind of rule belongs, and pins.
- [The lending library](../examples/lending): the full app. Its current
  definition also publishes a page for each thing to the room's Git
  repository, through the room's
  [destination](manual/ten-terms.md#9-destination);
  [Publish a file from an act](write-an-application.md#publish-a-file-from-an-act)
  shows how.
- [Build a counter](build-a-counter.md): rules that do arithmetic, and
  the same request sent twice.
