# Build a counter

In about 15 minutes you build a small app in which people take turns to
count up to a target. You say what the app keeps, what people can do and
the rules that must hold. Then you watch it accept some requests and
refuse others, each refusal with a reason. Everything runs in memory on
your computer: there is no server, account or browser.

## Before you start

You need Node.js 22.18 or later, which runs TypeScript files directly,
and npm. Some Node.js versions print a warning that this is
experimental. Make the project in an empty directory outside any
repository checkout:

```sh
mkdir my-counter
cd my-counter
npm init -y
npm pkg set type=module
npm install --save-exact @generalbusiness/dap-contract@0.1.0-dev.2 @generalbusiness/dap-derive@0.1.0-dev.2
```

You write two files: `definition.ts` describes the app, and `run.ts` runs
it.

This page ran on 15 October 2026 with Node.js 26.12.0, npm 11.20.0 and
both packages at `0.1.0-dev.2`. Every output block below is copied from
that run.

## Step 1: Describe the board and print it

The app keeps one board. The board has an owner, a target, the count so
far, and the person who spoke last. Starting the counter makes the board.

Create `definition.ts`:

```ts
import type { ActType, DeclaredDefinition, ItemType } from "@generalbusiness/dap-contract";

// Shapes used below: a slot that holds a person, and a number from 0 to 100.
const person = { required: false, fixed: false, list: false, author: false };
const number = { type: "int", min: 0, max: 100 } as const;

// The one board. `fixed` slots cannot change after the board is made.
const board: ItemType = {
	many: false, max: 1,
	states: { counting: { final: false } }, initial: "counting",
	parties: { owner: { ...person, required: true, fixed: true }, last: person },
	refs: {},
	values: {
		target: { fixed: true, required: true, of: number },
		count: { fixed: false, required: true, of: number, default: 0 },
	},
};

// Starting the counter makes the board. The person who starts it, the
// opener, owns it.
const start: ActType = {
	step: "open", on: "board", grant: "counter.start",
	also: {}, guards: [], sends: [], attention: [],
	fields: { opener: { type: "member", required: true }, target: { ...number, required: true } },
	effects: [
		{ party: { slot: "owner", from: { field: "opener" } } },
		{ value: { slot: "target", from: { field: "target" } } },
	],
};

export const counter: DeclaredDefinition = {
	format: "artroom-definition-1",
	name: "counter",
	profile: { name: "restricted", version: 1 },
	capabilities: [],
	genesis: "start",
	items: { board },
	acts: { start },
	receives: {},
	timed: {},
	rules: {},
};
```

Create `run.ts`. It checks the description, starts a counter in memory
with `@rita` as the owner and 3 as the target, and prints the board:

```ts
import { PROPOSED_BOUNDS } from "@generalbusiness/dap-contract";
import { prepareRules, validateDefinition } from "@generalbusiness/dap-derive";
import { evaluateRules, RULE_PROFILES } from "@generalbusiness/dap-derive/rule";
import { fields, founded, keys, on, valid, type Actor, type Over } from "@generalbusiness/dap-derive/testing";
import { counter } from "./definition.ts";

// Check the description. If it has problems, print them and stop.
const checked = validateDefinition(counter, PROPOSED_BOUNDS, RULE_PROFILES);
if (!checked.ok) {
	console.log(JSON.stringify(checked.problems, null, 2));
	process.exit(1);
}
console.log(`valid: ${checked.definition.digest}`);

// Start a counter in memory: @rita owns it and the target is 3.
const scope = founded(valid(checked), { opener: keys.rita.member, target: 3 });

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
test counter is called `founded`; the next release renames it to use the
word "create".

Run it:

```sh
node run.ts
```

You should see:

```
valid: sha256:be3ba613091e3bc586ac2e84d741cc88f7c671eb9a31d5bd0c422c0ad6211e6c
  item 0, board, counting: owner=@rita target=3 count=0
```

The first line is a fingerprint of your description. Change one
character and it changes. The board is item 0, in the state `counting`.

> **This is called…** The description is a **definition**, and the
> fingerprint is its **digest**. A thing the app keeps, such as the
> board, is an **item**. The object that holds the items and judges
> requests is a **scope**. A scope keeps the definition it started with
> for life.

## Step 2: Let people join

People join the counter before they count. Each person who joins gets a
player item. The rule: nobody joins twice.

Add this to `definition.ts`, above `export const counter`:

```ts
// One player for each person who joins, at most eight.
const player: ItemType = {
	many: true, max: 8,
	states: { joined: { final: false } }, initial: "joined",
	parties: { who: { ...person, required: true, fixed: true } },
	refs: {}, values: {},
};
const players = { type: "player", states: ["joined"] } as const;
const isSigner = { equals: { a: { slot: "who" }, b: { signer: true } } } as const;

// Joining makes a player for the person who signs. Nobody joins twice.
const join: ActType = {
	step: "open", on: "player", grant: "counter.play",
	also: {}, fields: {}, sends: [], attention: [],
	guards: [{ none: { ...players, where: [isSigner] }, reason: "already-joined" }],
	effects: [{ party: { slot: "who", from: { signer: true } } }],
};
```

In `counter`, change the `items` and `acts` lines:

```ts
	items: { board, player },
	acts: { start, join },
```

Add this to the end of `run.ts`. The `act` function signs a request as
one person, has the scope judge it, and prints the answer:

```ts
// Sign a request as `who`, have the scope judge it, and print the answer.
async function act(who: Actor, kind: string, over: Over = {}) {
	const signed = scope.intent(who, kind, over);
	const prepared = await evaluateRules(prepareRules(scope.state, scope.definition, { act: signed, context: scope.context() }));
	const answer = scope.submit(signed, { prepared });
	const said = answer.result === "write" ? "took effect"
		: answer.result === "refused" ? `refused, ${answer.name ?? answer.reason} (${answer.detail})`
		: answer.result;
	console.log(`${who.member.member} ${kind}: ${said}`);
	return signed;
}

await act(keys.una, "join");
await act(keys.vic, "join");
await act(keys.una, "join");
show(1);
show(2);
```

Run `node run.ts` again. You should see:

```
valid: sha256:316c7eb011abdaf7ce8df23d05e0b2d908f5374992d461d7fba96f6e264c6c8f
  item 0, board, counting: owner=@rita target=3 count=0
@una join: took effect
@vic join: took effect
@una join: refused, already-joined (guards.0)
  item 1, player, joined: who=@una
  item 2, player, joined: who=@vic
```

The scope runs from the start each time, so the earlier lines repeat.
The digest changed because the description changed. `@una`'s second join
is refused, and the answer names the rule that failed.

> **This is called…** Something a person can do, such as `join`, is an
> **act**. A rule that an act must pass is a **guard**. When an act
> passes, it **takes effect**: the scope writes it down. When it fails,
> the scope **refuses** it, names the reason and writes nothing.

## Step 3: Count

Now the players count. Three rules must hold:

- Only a player may count.
- Nobody counts twice in a row.
- Each number is one more than the last.

When the count reaches the target, the board is done and nothing can
change it again.

In `definition.ts`, change the `states` line of `board` to add the
`done` state:

```ts
	states: { counting: { final: false }, done: { final: true } }, initial: "counting",
```

Add the `say` act above `export const counter`:

```ts
// A player says the next number. When it is the target, the board is done.
const say: ActType = {
	step: "transition", on: "board", grant: "counter.play",
	also: {}, sends: [], attention: [],
	fields: { n: { ...number, required: true } },
	guards: [
		{ state: ["counting"] },
		{ some: { ...players, where: [isSigner] }, reason: "not-a-player" },
		{ notIn: ["last"], reason: "not-your-turn" },
		{ rule: "next-number", reason: "wrong-number" },
	],
	effects: [
		{ value: { slot: "count", from: { field: "n" } } },
		{ party: { slot: "last", from: { signer: true } } },
		{ state: "done", if: [{ equals: { a: { field: "n" }, b: { slot: "target" } } }] },
	],
};
```

In `counter`, change the `acts` and `rules` lines:

```ts
	acts: { start, join, say },
```

```ts
	rules: { "next-number": "fields.n = subjects.on.values.count + 1" },
```

The `next-number` rule does arithmetic, so it is a short expression
rather than a guard of its own.

Add this to the end of `run.ts`. `on(scope, 0)` names the board, item 0,
and the version of it that the signer last read:

```ts
const say = (who: Actor, n: number) => act(who, "say", { ...on(scope, 0), ...fields({ n }) });

await say(keys.paul, 1);
const first = await say(keys.una, 1);
await say(keys.una, 2);
await say(keys.vic, 3);
await say(keys.vic, 2);
await say(keys.una, 3);
show(0);
await say(keys.vic, 4);
```

Run `node run.ts` again. The first line shows a new digest. The new lines
at the end are:

```
@paul say: refused, not-a-player (guards.1)
@una say: took effect
@una say: refused, not-your-turn (guards.2)
@vic say: refused, wrong-number (guards.3)
@vic say: took effect
@una say: took effect
  item 0, board, done: owner=@rita last=@una target=3 count=3
@vic say: refused, final (item 0 is done)
```

`@paul` never joined. `@una` tried to speak twice in a row. `@vic` tried
to skip a number. When `@una` says 3, the board is `done`, and the scope
refuses anything more.

> **This is called…** `next-number` is a **rule expression**. `done` is
> a **final state**: no act can leave it. Who may sign what is set two
> ways: by guards such as `not-a-player`, and by the **action** that each
> act's `grant` names, such as `counter.play`. The test scope lets every
> key hold every action. [Build a lending library](build-a-lending-library.md)
> shows how to give some actions only to some people.

## Step 4: Read the history

The scope keeps every act that took effect, in order. Refused acts are
not in it.

Add this to the end of `run.ts`:

```ts
// The history: every act that took effect, in order.
for (const { entry } of scope.entries) {
	const input = entry.input;
	if (input.type === "genesis") console.log(`  ${entry.seq}: ${input.kind}`);
	if (input.type === "act") console.log(`  ${entry.seq}: ${input.authority[0].subject.member} ${input.signed.intent.kind} ${JSON.stringify(input.signed.intent.fields)}`);
}

// If a reply is lost, send the same signed request again. It is not counted twice.
console.log(`@una say 1, sent again: ${JSON.stringify(scope.submit(first))}`);

// Build the state again from the history alone, and compare.
const replayed = scope.replay();
console.log(`replay gives the same state: ${replayed.snapshot() === scope.state.snapshot()}`);
```

Run `node run.ts` again. The new lines at the end are:

```
  0: start
  1: @una join {}
  2: @vic join {}
  3: @una say {"n":1}
  4: @vic say {"n":2}
  5: @una say {"n":3}
@una say 1, sent again: {"result":"accepted-before","seq":3}
replay gives the same state: true
```

Six acts took effect. Each request carries a one-time key, so the scope
recognises a request it has already written and points to it: entry 3.
Building the state again from the six entries gives the same board and
players.

> **This is called…** The history is the scope's **journal**, and each
> line in it is an **entry**. Building the state again from the journal
> is **replay**. Anyone with the journal and the definition can replay
> it and check the result.

## Step 5: Turn it into a running app

So far the counter has run in one process, with test keys. To make it a
running dap app, you pin the definition's exact bytes, turn it on in a
room, and ask the room to start the counter. The room fills in `opener`
with whoever starts it, which is why the first act's field has that
name. Members then sign with their own keys from the command line, and
agents use tools named after your acts: `counter.join` and `counter.say`.
[Run your app](run-your-app.md) takes you through it with this
definition.

## What you just used, by its dap name

| What you did | The dap name |
|---|---|
| Described what the app keeps and what people can do | [Definition](manual/ten-terms.md#2-definition), pinned by its digest |
| The board and the players | [Items](manual/ten-terms.md#3-item), with states and slots |
| Held the items and judged each request | [Scope](manual/ten-terms.md#1-scope) |
| Start, join and say | [Acts](manual/ten-terms.md#4-act-and-action) |
| `counter.play`, named by each act's `grant` | [Action](manual/ten-terms.md#4-act-and-action) |
| The rules each act must pass | [Guards](write-an-application.md#put-each-invariant-where-it-lives) and [rule expressions](manual/ten-terms.md#8-rules) |
| "took effect" and "refused, …" | [Takes effect and refusal](manual/ten-terms.md#6-takes-effect-receipt-and-refusal) |
| The history | The [journal](manual/ten-terms.md#5-entry-and-journal) of entries |
| Built the state again from the history | [Replay](manual/ten-terms.md#10-replay) |

## Where to go next

- [Run your app](run-your-app.md): run this counter in a room, for
  people and agents.
- [Write an application](write-an-application.md): the reference for
  definitions, where each kind of rule belongs, and pins.
- [Build a lending library](build-a-lending-library.md): many things,
  each with its own life, and actions that only staff hold.
- [The Counter](../apps/counter): the full app, which also checks whose
  turn it is from the list of players.
