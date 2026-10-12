# Build a counter

In this tutorial we build a small counter application on dap and watch
each act take effect. The counter has a controller who sets a target,
participants who join, and a board that hands the turn from one
participant to the next until the count reaches its target. It is a
smaller version of the Counter in [examples/counting](../examples/counting).

We write the definition in four steps. After each step we run it in a
scope held in memory, sign acts as test members, and print what the scope
recorded. No service, deployment or browser is involved.

## Before you start

You need a checkout of this repository with its dependencies installed,
and the `node` command at version 22 or later. This page was run with
`node` v22.22.0 at main `d309b6b9`.

From the repository root, install the dependencies and make a directory
for the tutorial:

```sh
npm ci
mkdir my-counter
```

The tutorial imports the framework packages by their paths in this
checkout, so it needs no package install of its own. It also uses the
in-memory scope from `packages/derive/test/fixtures.ts`. That fixture
judges, seals and folds entries the way the runtime's commit does, and it
gives every test key every grant. So every refusal you see in this
tutorial comes from the definition's own guards.

## Step 1: declare the configuration and found the scope

Every scope starts with a genesis act. Ours is `establish`. It opens the
one `configuration` item, which holds the controller and the target.

Create `my-counter/definition.ts`:

```ts
import type { ActType, DeclaredDefinition, ItemType } from "../packages/contract/src/index.ts";

const count = { type: "int", min: 1, max: 100 } as const;
const person = { required: false, fixed: false, list: false, author: false };

const configuration: ItemType = {
	many: false, max: 1,
	states: { ready: { final: false } }, initial: "ready",
	parties: { controller: { ...person, required: true, fixed: true } },
	refs: {},
	values: { target: { fixed: true, required: true, of: count } },
};

const establish: ActType = {
	step: "open", on: "configuration", grant: "counter.establish",
	also: {}, guards: [], sends: [], attention: [],
	fields: {
		opener: { type: "member", required: true },
		target: { ...count, required: true },
	},
	effects: [
		{ party: { slot: "controller", from: { field: "opener" } } },
		{ value: { slot: "target", from: { field: "target" } } },
	],
};

export const counter: DeclaredDefinition = {
	format: "artroom-definition-1",
	name: "counter",
	profile: { name: "restricted", version: 1 },
	capabilities: [],
	genesis: "establish",
	items: { configuration },
	acts: { establish },
	receives: {},
	timed: {},
	rules: {},
};
```

The configuration item has one state, `ready`. Its `controller` slot is a
party: it holds a member. The `fixed: true` flags mean that nothing can
change those slots after the item opens. The act's two effects copy the
signed fields into those slots.

Now create `my-counter/run.ts`. It validates the definition, founds a
scope with `@rita` as the controller and a target of 3, and prints the
configuration item:

```ts
import { PROPOSED_BOUNDS } from "../packages/contract/src/index.ts";
import { prepareRules, validateDefinition } from "../packages/derive/src/index.ts";
import { evaluateRules, RULE_PROFILES } from "../packages/derive/src/rule/index.ts";
import { founded, keys, on, valid, type Actor, type Over } from "../packages/derive/test/fixtures.ts";
import { counter } from "./definition.ts";

const checked = validateDefinition(counter, PROPOSED_BOUNDS, RULE_PROFILES);
if (!checked.ok) {
	console.log(JSON.stringify(checked.problems, null, 2));
	process.exit(1);
}
console.log(`valid: ${checked.definition.digest}`);

const scope = founded(valid(checked), { opener: keys.rita.member, target: 3 });

// Print one item: its type, its state and the slots that hold something.
function show(id: number) {
	const item = scope.item(id);
	const slots = [
		...Object.entries(item.parties).filter(([, m]) => m).map(([slot, m]) => `${slot}=${m!.member}`),
		...Object.entries(item.values).filter(([, v]) => v !== null)
			.map(([slot, v]) => `${slot}=${JSON.stringify(v, (key, x) => key === "member" ? x.member : x)}`),
	];
	console.log(`  item ${id}, ${item.type}, ${item.state}: ${slots.join(" ")}`);
}

show(0);
```

Run it from the repository root:

```sh
node --experimental-transform-types --disable-warning=ExperimentalWarning my-counter/run.ts
```

You should see:

```
valid: sha256:5e5920090685d2c61ddd10ee5a7e5637f13c11ea85e48294e9bb6a85e848044e
  item 0, configuration, ready: controller=@rita target=3
```

The first line is the definition's digest. A scope pins that digest at
genesis and is judged by that definition for life. Item 0 is the
configuration, opened by the genesis entry.

## Step 2: let participants join

Next we add a `participant` item for each member who joins, and a `join`
act. The act has two guards. The first allows at most eight participants.
The second refuses a signer who has already joined.

Add these declarations to `my-counter/definition.ts`, above
`export const counter`:

```ts
const joined = { type: "participant", states: ["joined"], except: [] } as const;

const participant: ItemType = {
	many: true, max: 8,
	states: { joined: { final: false } }, initial: "joined",
	parties: { agent: { ...person, required: true, fixed: true } },
	refs: {},
	values: {},
};

const join: ActType = {
	step: "open", on: "participant", grant: "counter.join",
	also: {}, fields: {}, sends: [], attention: [],
	guards: [
		{ count: { ...joined, max: 7 } },
		{ none: { ...joined, where: [{ equals: { a: { slot: "agent" }, b: { signer: true } } }] } },
	],
	effects: [{ party: { slot: "agent", from: { signer: true } } }],
};
```

Then add the new item type and act to `counter`:

```ts
	items: { configuration, participant },
	acts: { establish, join },
```

Add an `act` helper and three joins to the end of `my-counter/run.ts`.
The helper signs an intent, evaluates the act's rules, judges it, and
writes the entry if the act takes effect:

```ts
// Sign an act, evaluate its rules, judge it, and write the entry if it takes effect.
async function act(who: Actor, kind: string, over: Over = {}) {
	const signed = scope.intent(who, kind, over);
	const context = scope.context();
	const prepared = await evaluateRules(prepareRules(scope.state, scope.definition, { act: signed, context }));
	const judgment = scope.submit(signed, { prepared });
	const reason = judgment.result === "refused" ? ` (${judgment.reason}, ${judgment.detail})` : "";
	console.log(`${who.member.member} ${kind}: ${judgment.result}${reason}`);
}

await act(keys.una, "join");
await act(keys.vic, "join");
await act(keys.una, "join");
show(1);
show(2);
```

Run the same command again. You should see:

```
valid: sha256:1a9565645b890ced4de65761cb7a4cc25ba114a964350f9b26a2a0c7920b0d6b
  item 0, configuration, ready: controller=@rita target=3
@una join: write
@vic join: write
@una join: refused (guard-failed, guards.1)
  item 1, participant, joined: agent=@una
  item 2, participant, joined: agent=@vic
```

`write` means the act took effect and the scope wrote its entry. `@una`'s
second join is refused. `guards.1` names the guard that failed: the
second one, which finds that `@una` has already joined.

## Step 3: open the board

The board holds the count. The controller opens it with `initialize`,
which copies the controller and the target from the configuration. The
board also has slots for the turn: the `speaker`, the `number` to say,
and the `basis`, which lists the participants the turn was issued
against.

Add these declarations above `export const counter`:

```ts
const serial = { type: "int", min: 0, max: 1000000 } as const;
const participantId = { type: "item", of: "participant" } as const;
const basis = {
	type: "list", max: 8,
	of: { type: "record", of: {
		id: { ...participantId, required: true },
		member: { type: "member", required: true },
	} },
} as const;

const board: ItemType = {
	many: false, max: 1,
	states: { paused: { final: false }, running: { final: false }, finished: { final: false } },
	initial: "paused",
	parties: { controller: { ...person, required: true, fixed: true }, speaker: person },
	refs: {},
	values: {
		target: { fixed: true, required: true, of: count },
		lastNumber: { fixed: false, required: true, of: { type: "int", min: 0, max: 100 }, default: 0 },
		serial: { fixed: false, required: true, of: serial, default: 0 },
		number: { fixed: false, required: false, of: count },
		basis: { fixed: false, required: false, of: basis },
	},
};

const initialize: ActType = {
	step: "open", on: "board", grant: "counter.control",
	also: { configuration: { item: "configuration", one: true } },
	fields: {}, sends: [], attention: [],
	guards: [
		{ of: "also.configuration", state: ["ready"] },
		{ of: "also.configuration", signer: ["controller"] },
	],
	effects: [
		{ party: { slot: "controller", from: { slot: "controller", of: "also.configuration" } } },
		{ value: { slot: "target", from: { slot: "target", of: "also.configuration" } } },
	],
};
```

Add the board and the act to `counter`:

```ts
	items: { configuration, participant, board },
	acts: { establish, join, initialize },
```

Add two attempts to initialize to the end of `my-counter/run.ts`, the
first by `@vic`, who is not the controller:

```ts
await act(keys.vic, "initialize", { expected: { configuration: scope.item(0).revision } });
await act(keys.rita, "initialize", { expected: { configuration: scope.item(0).revision } });
show(3);
```

The `expected` member names the revision of the configuration item that
the signer read. If the item had changed since, the scope would refuse
the act. Run the command again. The new lines at the end are:

```
@vic initialize: refused (guard-failed, guards.1)
@rita initialize: write
  item 3, board, paused: controller=@rita target=3 lastNumber=0 serial=0
```

`@vic` is refused by the guard that requires the configuration's
controller to sign. The board is item 3, `paused`, with the target copied
from the configuration.

## Step 4: start the count

Two acts make the count run. The controller signs `start`, and the
participant whose turn it is signs `spoken`. Each act carries the full
roster as its `basis` and names the participant who speaks next.

The client proposes those values and the scope checks every one. The
`roster` guard requires the basis to list exactly the joined participants,
in the order they joined. The named rules check the arithmetic: the
number is one more than the last, the serial moves by one, and `next` is
the participant whose place in the roster matches the number. A client
cannot skip a participant, repeat a number or speak out of turn.

Change the first line of `my-counter/definition.ts` to import two more
types:

```ts
import type { ActType, DeclaredDefinition, EffectForm, Guard, ItemType } from "../packages/contract/src/index.ts";
```

Add these declarations above `export const counter`:

```ts
// The basis lists every joined participant, in join order, each with its member.
const roster: Guard = { sameSet: {
	list: { field: "basis" }, as: "p", key: { element: "p.id" }, items: joined,
	match: [{ equals: { a: { slot: "agent" }, b: { element: "p.member" } } }],
	ordered: true,
} };
const done: Guard = { equals: { a: { field: "n" }, b: { slot: "target" } } };

// Give the turn to the participant that `next` names, unless the count is done.
const issue = (number: string, unless?: Guard[]): EffectForm[] => [
	{ party: { slot: "speaker", from: { slot: "agent", of: "also.next" } } },
	{ value: { slot: "basis", from: { field: "basis" } } },
	{ value: { slot: "number", from: { field: number } } },
].map((effect) => unless ? { ...effect, unless } : effect);

// Clear the turn when the count reaches its target.
const clear: EffectForm[] = [
	{ party: { slot: "speaker", from: null }, if: [done] },
	{ value: { slot: "basis", from: null }, if: [done] },
	{ value: { slot: "number", from: null }, if: [done] },
];

const turnFields = {
	nextSerial: { ...serial, min: 1, required: true },
	basis: { ...basis, required: true },
	next: { ...participantId, required: true },
};

const start: ActType = {
	step: "transition", on: "board", grant: "counter.control",
	also: { next: { item: "participant", by: "next" } },
	fields: { n: { ...count, required: true }, ...turnFields },
	sends: [], attention: [],
	guards: [
		{ state: ["paused"] },
		{ signer: ["controller"] },
		{ of: "also.next", state: ["joined"] },
		roster,
		{ rule: "start-plan" },
	],
	effects: [
		{ state: "running" },
		{ value: { slot: "serial", from: { field: "nextSerial" } } },
		...issue("n"),
	],
};

const spoken: ActType = {
	step: "transition", on: "board", grant: "counter.spoken",
	also: { next: { item: "participant", by: "next" } },
	fields: {
		serial: { ...serial, min: 1, required: true },
		n: { ...count, required: true },
		nextN: { ...count, required: true },
		...turnFields,
	},
	sends: [], attention: [],
	guards: [
		{ state: ["running"] },
		{ signer: ["speaker"] },
		{ of: "also.next", state: ["joined"] },
		roster,
		{ rule: "spoken-plan" },
	],
	effects: [
		{ value: { slot: "lastNumber", from: { field: "n" } } },
		{ value: { slot: "serial", from: { field: "nextSerial" } } },
		{ state: "finished", if: [done] },
		...issue("nextN", [done]),
		...clear,
	],
};

const rules = {
	"start-plan": "($v := subjects.on.values; $b := fields.basis; $c := $count($b); $i := (fields.n - 1) % $c; $c > 0 and fields.n = $v.lastNumber + 1 and fields.n <= $v.target and fields.nextSerial = $v.serial + 1 and fields.next = $b[$i].id)",
	"spoken-plan": "($v := subjects.on.values; $b := fields.basis; $c := $count($b); $i := (fields.nextN - 1) % $c; $c > 0 and fields.serial = $v.serial and fields.n = $v.number and fields.n = $v.lastNumber + 1 and fields.nextSerial = $v.serial + 1 and fields.nextN = (fields.n = $v.target ? $v.target : fields.n + 1) and fields.next = $b[$i].id)",
};
```

Add the acts and the rules to `counter`:

```ts
	items: { configuration, participant, board },
	acts: { establish, join, initialize, start, spoken },
	receives: {},
	timed: {},
	rules,
```

Add a first `start` by `@vic`, then one by `@rita`, to the end of
`my-counter/run.ts`:

```ts
const roster = () => scope.state.page("participant", ["joined"], null, 8).items
	.map((p) => ({ id: p.id, member: p.parties["agent"]! }));
const first = { n: 1, nextSerial: 1, basis: roster(), next: 1 };

await act(keys.vic, "start", { ...on(scope, 3, { next: 1 }), fields: first });
await act(keys.rita, "start", { ...on(scope, 3, { next: 1 }), fields: first });
show(3);
```

Run the command again. The first line now shows the definition's new
digest, `sha256:761d5a92b407842fd304f9e9a4f448811a36bf6f3c9989b046e1e38eb8e7514a`. The new lines at the end
are:

```
@vic start: refused (guard-failed, guards.1)
@rita start: write
  item 3, board, running: controller=@rita speaker=@una target=3 lastNumber=0 serial=1 number=1 basis=[{"id":1,"member":"@una"},{"id":2,"member":"@vic"}]
```

`@vic` is refused because only the board's controller may start the
count. The board is `running`. `@una` joined first, so `@una` has the
turn and the number 1.

## Step 5: speak the numbers

Add a `spoken` helper and four reports to the end of `my-counter/run.ts`.
The first report comes from `@vic`, out of turn. Then the three turns go
`@una`, `@vic`, `@una`. Last, the script folds the record again from the
start and compares the state:

```ts
// Report the number on the board and pass the turn to `next`.
async function spoken(who: Actor, next: number) {
	const b = scope.item(3).values;
	const n = Number(b["number"]);
	await act(who, "spoken", { ...on(scope, 3, { next }), fields: {
		serial: b["serial"]!, n, nextN: Math.min(n + 1, Number(b["target"])),
		nextSerial: Number(b["serial"]) + 1, basis: roster(), next,
	} });
}

await spoken(keys.vic, 2);
await spoken(keys.una, 2);
show(3);
await spoken(keys.vic, 1);
await spoken(keys.una, 1);
show(3);

const replayed = scope.replay();
console.log(`${scope.entries.length} entries; replay gives the same state: ${replayed.snapshot() === scope.state.snapshot()}`);
```

Run the command again. The new lines at the end are:

```
@vic spoken: refused (guard-failed, guards.1)
@una spoken: write
  item 3, board, running: controller=@rita speaker=@vic target=3 lastNumber=1 serial=2 number=2 basis=[{"id":1,"member":"@una"},{"id":2,"member":"@vic"}]
@vic spoken: write
@una spoken: write
  item 3, board, finished: controller=@rita target=3 lastNumber=3 serial=4
8 entries; replay gives the same state: true
```

`@vic`'s report is refused because the speaker slot holds `@una`. Each
report that takes effect moves the turn. When `@una` says 3, the target,
the board becomes `finished` and its turn slots are cleared.

The last line shows that folding the eight entries again gives the same
state. That is what a verifier does with a real scope's history.

## Step 6: compare with the full Counter

The Counter in `examples/counting` uses the same parts and adds more:
`leave`, `cancel-turn`, `pause` and `reset` acts, a `generation` that
fences late reports after a reset, and a timed rule that pauses the board
when a speaker takes longer than 15 seconds. Its definition is pinned in
`examples/counting/pin.ts`.

Create `my-counter/full.ts` to validate that definition and compare its
digest with the pin:

```ts
import { PROPOSED_BOUNDS } from "../packages/contract/src/index.ts";
import { validateDefinition } from "../packages/derive/src/index.ts";
import { RULE_PROFILES } from "../packages/derive/src/rule/index.ts";
import { counting } from "../examples/counting/definition.ts";
import { COUNTING_DEFINITION } from "../examples/counting/pin.ts";

const checked = validateDefinition(counting, PROPOSED_BOUNDS, RULE_PROFILES);
console.log(checked.ok ? `valid: ${checked.definition.digest}` : checked.problems);
console.log(`pinned: ${COUNTING_DEFINITION}`);
console.log(`acts: ${Object.keys(counting.acts).join(", ")}`);
```

Run it:

```sh
node --experimental-transform-types --disable-warning=ExperimentalWarning my-counter/full.ts
```

You should see:

```
valid: sha256:435d9f5745048183d3cf0392ce909cd76909fd69ee368dfc57e142ba96af1d09
pinned: sha256:435d9f5745048183d3cf0392ce909cd76909fd69ee368dfc57e142ba96af1d09
acts: establish, initialize, join, leave, cancel-turn, start, pause, reset, spoken
```

The Counter's own tests run its acts against the same in-memory scope.
Run them:

```sh
node node_modules/vitest/vitest.mjs run --project counting
```

You should see both test files pass:

```
 Test Files  2 passed (2)
      Tests  8 passed (8)
```

The second file tests the successor definition, `counting-commitments`,
which the deployed Counter page uses. Not run here: the deployed page,
its speech, and acts signed by enrolled keys against a hosted scope.
[examples/counting/browser/startup.md](../examples/counting/browser/startup.md)
describes that setup.

When you are done, delete the `my-counter` directory.

## Where to go next

- [Write an application](write-an-application.md) shows how to declare,
  validate and pin a definition of your own.
- [The architecture of a dap application](architecture.md) explains what
  the runtime does around each act you signed here.
- [Scopes](scopes.md) lists every form a definition can use.
