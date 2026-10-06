import { describe, expect, test } from "vitest";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { Digest, Entry, Input, SignedIntent } from "@generalbusiness/artroom-contract";
import { factRefOf, intentDigest, newIncarnation, scopeIdOf, seedDigest } from "@generalbusiness/artroom-bytes";
import { clockOf, derivable, judgeDelivery, judgeGenesis, runnable, type OutcomeRule, type PlatformRule, type RuleGiven } from "@generalbusiness/artroom-derive";
import { Ledger, T0, deskDefinition, founded } from "@generalbusiness/artroom-derive/testing";
import { CREATION_ATTEMPTS, DIRECTORY, REGISTER, directoryIdOf, platform, register, registerRules, repositoryName } from "../src/index.ts";
import { Directory, Register, installing, paul, registerDefinition, registerPlatform, registerSeed, rita, una } from "./support-founding.ts";

// The plan's T43, for `platform:register@1` (authority note, section 12.1.1, and its table of marks, section 12.1.8).
test("the register definition validates whole with the platform option; every mark of the note's table has its rule, so the package's rules run it, and with any one missing they do not", () => {
  const valid = registerDefinition;
  expect([valid.underived, derivable(valid, null), register.capabilities, register.rules, register.receives, register.timed]).toEqual([[], true, [], {}, {}, {}]);
  // Section 12.1.1: two item types, the genesis `install` and the act `found`, and three kinds of operation.
  expect([Object.keys(register.items), register.genesis, Object.keys(register.acts), Object.keys(register.outcomes)])
    .toEqual([["register", "claim"], "install", ["install", "found"], ["create-repository", "revoke-credential", "delete-repository"]]);
  // No row of the register's data writes a send: the one `create` is the selecting outcome's (section 12.1).
  expect(Object.values(register.acts).flatMap((act) => act.sends)).toEqual([]);

  // The marks, by the rows of the note's table: rows 2 to 6, row r of revision 24, row c of the further marks, one for each kind of
  // operation, and rows k and v of revision 25: the send of the mark of `create-repository`, which the validator lists as a send, and the effect
  // mark in its clause `applied`.
  expect(valid.marks.map((m) => [m.place, m.path, m.code, m.row])).toEqual([
    [1, "acts.install.grant", "install", "P13"], [1, "acts.found.grant", "founding-policy", "P13"], [4, "acts.found.guards.0", "handle-form", "P27"],
    [5, "acts.found.effects.3", "founder-key", "P14"], [5, "acts.found.effects.4", "claim-seed", "P16"], [5, "acts.found.effects.5", "open-create-repository", "P16"],
    [7, "outcomes.create-repository", "create-repository", "P16"], [6, "outcomes.create-repository.send", "create-directory", "P16"], [5, "outcomes.create-repository.send.result.applied.0", "claim-active", "P16"],
    [7, "outcomes.revoke-credential", "revoke-credential", "P16"], [7, "outcomes.delete-repository", "delete-repository", "P16"],
  ]);
  // The whole-scope rule (the contract's section 6.1): a version that lacks a rule runs nothing. The package has a rule of the kind
  // of its place for every mark, so a register can be founded under the package's rules. Without any one of them it cannot.
  const { rules } = platform(REGISTER)!;
  expect([rules === registerRules, valid.marks.filter((mark) => !Object.hasOwn(rules, mark.code)).map((mark) => mark.code)]).toEqual([true, []]);
  expect([runnable(valid, rules), ...Object.keys(rules).map((lost) => runnable(valid, { ...rules, [lost]: undefined as never }))]).toEqual([true, ...Object.keys(rules).map(() => false)]);
});

// The plan's T50, the register's table: each rule of `platform:register@1` as a plain function, from its row of the note's table of
// marks (section 12.1.8, rows 2 to 6 and c). No scope, no port and no host: a rule is called with what a judge gives it.
describe("the rules of platform:register@1, each as a plain function (authority note, section 12.1.8)", () => {
  const keyed = new Register();
  const open = new Register("open", undefined);
  /** What a rule is given for a `found` of that signer at that register. */
  const given = (r: Register, who: typeof rita): RuleGiven => ({
    state: r.state, input: { type: "act", signed: r.intent(who, "found"), grant: null, presented: {} }, time: r.now, uses: [], own: r.own,
    resolved: { at: r.at, self: r.head.seq + 1, fields: {}, subjects: new Map(), signer: null, bounds: PROPOSED_BOUNDS }, observed: () => null, value: () => undefined, placed: () => undefined,
  });
  /** What the rule `install` is given: the genesis, with its seed and its founding intent. */
  const installed = (install: SignedIntent, cause = intentDigest(install.intent)): RuleGiven =>
    ({ ...given(keyed, paul), input: { type: "genesis", seed: registerSeed(install, { cause }), founding: install, source: null, n: null, message: null } });
  const run = (name: string, ...args: unknown[]): unknown => (registerRules[name] as PlatformRule & { run: (...args: unknown[]) => unknown }).run(...args);
  const PASS = { pass: true, member: null };
  const byRita = given(keyed, rita);
  const signed = (byRita.input as Extract<RuleGiven["input"], { type: "act" }>).signed;
  const seed = { v: 1, kind: "directory", definition: DIRECTORY, creator: keyed.at, cause: intentDigest(signed.intent), ordinal: 0 } as const;

  const rows: readonly (readonly [row: string, rule: string, args: readonly unknown[], expected: unknown])[] = [
    // Row 2: the intent whose digest is the seed's cause, and no other.
    ["2: the intent whose digest is the seed's cause passes, with no member", "install", [installed(installing(paul, "keys", []))], PASS],
    ["2: another intent than the seed's cause does not", "install", [installed(installing(paul, "keys", []), intentDigest(installing(una, "open", undefined).intent))], { pass: false }],
    // Row 3: the policy is `open`, or the signing key is one of `founders`.
    ["3: under `keys`, a founder's key passes, with no member", "founding-policy", [byRita], PASS],
    ["3: under `keys`, another key does not (case a)", "founding-policy", [given(keyed, una)], { pass: false }],
    ["3: under `open`, any key passes", "founding-policy", [given(open, una)], PASS],
    // Row 4: `founder` is the signing key, on the claim that the entry opens.
    ["4: the claim's founder is the signing key", "founder-key", [byRita], [{ effect: "value", item: keyed.head.seq + 1, slot: "founder", value: rita.key }]],
    // Row 5: `seed` is the digest of the directory's seed: this register as creator, and the founder's intent as cause.
    ["5: the claim's seed is the digest of the directory's seed", "claim-seed", [byRita], [{ effect: "value", item: keyed.head.seq + 1, slot: "seed", value: seedDigest(seed) }]],
    // Row 6: the operation, with 3 attempts, and its attempt 1.
    ["6: the operation and its first attempt", "open-create-repository", [byRita], [
      { effect: "operation", k: 0, owner: REGISTER, kind: "create-repository", attempts: 3 }, { effect: "attempt", operation: { k: 0 }, attempt: 1, result: "opened", selected: null },
    ]],
  ];
  for (const [row, rule, args, expected] of rows) test(`${rule}, row ${row}`, () => expect(run(rule, ...args)).toEqual(expected));

  test("the table has exactly the rules that are written: six at their places, the outcomes of the three kinds of operation, and the send of the first with the mark of its clause; only a creation selects, no read is decisive, and each allows another attempt", () => {
    expect(Object.entries(registerRules).map(([name, rule]) => [name, rule.place, "refusals" in rule ? rule.refusals : "most" in rule ? rule.most : null])).toEqual([
      ["install", "grant", []], ["founding-policy", "grant", []], ["handle-form", "guard", ["bad-handle"]], ["founder-key", "effect", 1], ["claim-seed", "effect", 1], ["open-create-repository", "effect", 2],
      ["create-repository", "outcome", null], ["create-directory", "send", null], ["claim-active", "effect", 3], ["revoke-credential", "outcome", null], ["delete-repository", "outcome", null],
    ]);
    const kinds = ["create-repository", "revoke-credential", "delete-repository"].map((kind) => (registerRules[kind] as { rules: OutcomeRule }).rules);
    expect(kinds.map((rules) => [rules.selects, rules.read, rules.retries("refused", null as never, null as never), rules.retries("unknown", null as never, null as never), rules.closure ?? 0, rules.most ?? null])).toEqual([
      // Section 12.1.1, `most`: 5 effects, which are one `value` and two operations with one attempt each. The two cleanups reserve 12 entries.
      [true, false, true, true, 12, { effects: 5, requests: 1, operations: 2 }], [false, false, true, true, 0, null], [false, false, true, true, 0, null],
    ]);
    expect(CREATION_ATTEMPTS).toBe(3);
  });
});

// The scope contract, section 7.1, "The register"; authority note, section 12.1, "Names, creation and activation".
test("a register is founded by an install intent, under its own definition and no other; it has no creator and is active from its genesis", () => {
  const r = new Register();
  const genesis = r.last.input as Extract<Input, { type: "genesis" }>;
  expect([r.at.kind, r.state.scope()!.status, genesis.seed.creator, genesis.kind, genesis.seed.definition, r.at.scope === scopeIdOf(genesis.seed), r.item(0).values])
    .toEqual(["register", "active", null, "install", REGISTER, true, { host: "git.example", namespace: "artroom", policy: "keys", founders: [rita.key] }]);

  const install = installing(paul, "keys", []);
  const found = (seed = registerSeed(install), founding = install, definition = registerDefinition, rules = registerPlatform) => {
    const s = new Ledger(definition);
    return judgeGenesis(s.state, definition, { name: scopeIdOf(seed), inc: newIncarnation(new Uint8Array(16).fill(7)), seed, founding }, { clock: clockOf(s.state, T0), bounds: PROPOSED_BOUNDS, facts: [], prepared: [], source: null, platform: rules }).result;
  };
  const byFound = installing(paul, "keys", [], "found");
  expect([
    found(),
    // A register is asked for by an `install`, and a `found` asks for none.
    found(registerSeed(byFound), byFound),
    // The register's definition founds a register, and no directory.
    found(registerSeed(install, { kind: "directory" })),
    // A register is founded under its own definition, and under no other.
    found(registerSeed(install, { definition: deskDefinition.digest }), install, deskDefinition),
    // No other kind of scope has no creator.
    found(registerSeed(install, { kind: "membership" })),
  ]).toEqual(["write", "refused", "source-unverified", "source-unverified", "source-unverified"]);
  // The first delivery's founding of a directory, by a `found` intent, stands as it was.
  expect(founded().at.kind).toBe("directory");
});

// Authority note, section 12.1.1: the row `found`, the cases a to d, and "The rule `create-repository`, whole" of the note's
// revision 25. Every entry is judged with the register's own rules.
test("a founding opens one claim and one creation of three attempts; a key outside the policy opens none; the same intent again opens nothing; the first confirmed creation is selected, sets the repository and sends the `create` of the directory, a later one opens its deletion, a returned credential opens its revocation, each cleanup's own answer settles its attempt, and an outcome whose body does not follow is refused", () => {
  const r = new Register();
  // Case a: a `found` by a key that is not in `founders`, under the policy `keys`.
  expect([r.found(una), r.state.count("claim", "pending")]).toMatchObject([{ result: "refused", reason: "unauthorized" }, 0]);
  // Section 12.1.1, the row `found`, and row r of the table of marks: a founding whose `founderHandle` is no handle is refused
  // `bad-field`, named `bad-handle`, by the register's own rule `handle-form`, and opens no claim.
  expect([r.found(rita, { founderHandle: "@Rita" }, "no handle"), r.found(rita, { founderHandle: "rita" }, "no at-sign"), r.state.count("claim", "pending")])
    .toMatchObject([{ result: "refused", reason: "bad-field", name: "bad-handle" }, { result: "refused", reason: "bad-field", name: "bad-handle" }, 0]);

  const signed = r.intent(rita, "found", { expected: { register: 1 }, fields: { branch: "main", founderHandle: "@rita", recoveryKey: paul.key } });
  expect(r.submit(signed, { platform: registerPlatform, grants: [] }).result).toBe("write");
  const claim = r.head.seq;
  // The claim is `pending`, with the intent's digest, the directory's seed digest, the signing key and the policy value used. No
  // grant judged the act, and the entry records none.
  const seed = { v: 1, kind: "directory", definition: DIRECTORY, creator: r.at, cause: intentDigest(signed.intent), ordinal: 0 } as const;
  expect([r.item(claim).state, r.item(claim).values, (r.last.input as Extract<Input, { type: "act" }>).authority, r.last.sends])
    .toEqual(["pending", { intent: intentDigest(signed.intent), seed: seedDigest(seed), founder: rita.key, policy: "keys", branch: "main", repository: null }, [], []]);
  const creation = `${claim}:0` as const;
  expect(r.state.operation(creation)).toMatchObject({ owner: REGISTER, kind: "create-repository", most: 3, attempts: [{ attempt: 1, outcomes: [] }], selected: null });
  // Case b: the same founding intent again, after its claim exists. Nothing is opened.
  expect([r.submit(signed, { platform: registerPlatform, grants: [] }), r.head.seq]).toMatchObject([{ result: "accepted-before", seq: claim }, claim]);

  // The attempt's own name: the 52 characters of the directory's scope ID after `sc_`, a hyphen and the attempt's number. The
  // scope ID is that of the seed whose digest the claim holds, so the name is a function of the claim and the number.
  const name = (attempt: number) => repositoryName(r.item(claim).values["seed"] as Digest, attempt);
  expect([name(2), directoryIdOf(seedDigest(seed))]).toEqual([`${scopeIdOf(seed).slice(3)}-2`, scopeIdOf(seed)]);

  // An outcome that does not follow is `bad-input`, and nothing is written: a body with another member or a missing one, a `name`
  // that is not the attempt's own, a text longer than 256 bytes, a basis `read`, and an `unknown` with no name.
  const head = r.head.seq;
  expect([
    r.outcome(creation, 1, "confirmed", { name: name(1), id: "r1", secret: "s" }), r.outcome(creation, 1, "confirmed", { name: name(1) }), r.outcome(creation, 1, "confirmed", { name: name(2), id: "r1" }),
    r.outcome(creation, 1, "confirmed", { name: name(1), id: "r".repeat(257) }), r.outcome(creation, 1, "confirmed", { name: name(1), id: "r1" }, "read"),
    r.outcome(creation, 1, "refused", { name: name(1) }), r.outcome(creation, 1, "refused", { name: name(1), nameExists: "yes" }), r.outcome(creation, 1, "unknown", null), r.outcome(creation, 1, "unknown", { name: name(2) }),
  ].map((judged) => [judged.result, "reason" in judged && judged.reason])).toEqual(Array.from({ length: 9 }, () => ["refused", "bad-input"]));
  expect(r.head.seq).toBe(head);

  // Case c: attempt 1 is `unknown`, with the body that the rule states for it, and attempt 2's own answer says created. It is
  // selected, sets the claim's `repository`, and opens the revocation of the credential that the answer returned.
  r.outcome(creation, 1, "unknown");
  expect(r.last.input).toMatchObject({ result: "unknown", evidence: { basis: "none", body: { name: name(1) } } });
  r.outcome(creation, 2, "confirmed", { name: name(2), id: "r2", credential: "c2" });
  const revocation = `${r.head.seq}:0` as const;
  expect(r.last.effects).toEqual([
    { effect: "attempt", operation: creation, attempt: 2, result: "confirmed", selected: true }, { effect: "value", item: claim, slot: "repository", value: { host: "git.example", namespace: "artroom", name: name(2), id: "r2" } },
    { effect: "operation", k: 0, owner: REGISTER, kind: "revoke-credential", attempts: 3 }, { effect: "attempt", operation: { k: 0 }, attempt: 1, result: "opened", selected: null },
  ]);
  // The selecting outcome sends the `create` of the directory at ordinal 0, by the rule `create-directory`. Its seed is the one whose
  // digest the claim holds, with the founder's intent as its cause. It names the `found` entry by its fact, as `claim`, and carries
  // the record that this outcome set, with the fields of the founding intent. It carries no signed intent.
  expect(r.last.sends).toEqual([{ n: 0, to: seed, message: { class: "request", type: "create", body: { fields: {
    claim: r.fact(claim), repository: { host: "git.example", namespace: "artroom", name: name(2), id: "r2" }, branch: "main", founderHandle: "@rita", recoveryKey: paul.key,
  } } } }]);
  // Case d: attempt 1's own answer arrives later, created. It is not selected, and opens its own deletion. The claim does not change.
  r.outcome(creation, 1, "confirmed", { name: name(1), id: "r1" });
  const deletion = `${r.head.seq}:0` as const;
  expect([r.state.operation(creation)!.selected, r.item(claim).values["repository"], r.last.effects.slice(0, 2), r.state.operation(revocation)!.kind, r.state.operation(deletion)!.kind]).toEqual([
    2, { host: "git.example", namespace: "artroom", name: name(2), id: "r2" },
    [{ effect: "attempt", operation: creation, attempt: 1, result: "confirmed", selected: false }, { effect: "operation", k: 0, owner: REGISTER, kind: "delete-repository", attempts: 3 }], "revoke-credential", "delete-repository",
  ]);
  // No other outcome sends the `create`: the claim has its repository.
  expect(r.last.sends).toEqual([]);

  // A second founding, refused at the host for its name: the outcome records the answer, opens the next attempt and derives nothing.
  const other = r.intent(rita, "found", { expected: { register: 1 }, fields: { branch: "main", founderHandle: "@rita", recoveryKey: paul.key }, idempotencyKey: "another founding" });
  expect(r.submit(other, { platform: registerPlatform, grants: [] }).result).toBe("write");
  const second = `${r.head.seq}:0` as const;
  const taken = repositoryName(r.item(r.head.seq).values["seed"] as Digest, 1);
  r.outcome(second, 1, "refused", { name: taken, nameExists: true });
  expect([r.last.effects, r.last.sends]).toEqual([[{ effect: "attempt", operation: second, attempt: 1, result: "refused", selected: null }, { effect: "attempt", operation: second, attempt: 2, result: "opened", selected: null }], []]);

  // The register's rules for the outcomes of the two cleanups (revision 25, the delta EP4). The body of every result is the one
  // member that the opening entry's body holds: the credential that attempt 2 returned, or the ID that attempt 1 gave. A read of the
  // host settles nothing, and a body with another member, with another value or with none is `bad-input`. A `refused` and an
  // `unknown` are each followed by the next attempt, to the three that the opening states, and no further. Nothing is derived.
  for (const [cleanup, body, other] of [[deletion, { id: "r1" }, { id: "r2" }], [revocation, { credential: "c2" }, { credential: "c1" }]] as const) {
    const before = r.head.seq;
    expect([r.outcome(cleanup, 1, "confirmed", body, "read"), r.outcome(cleanup, 1, "confirmed", other), r.outcome(cleanup, 1, "confirmed", { ...body, more: 1 }), r.outcome(cleanup, 1, "refused", {}), r.outcome(cleanup, 1, "unknown", null), r.head.seq])
      .toMatchObject([...Array.from({ length: 5 }, () => ({ result: "refused", reason: "bad-input" })), before]);
    r.outcome(cleanup, 1, "refused", body);
    r.outcome(cleanup, 2, "unknown");
    expect(r.last.input).toMatchObject({ result: "unknown", evidence: { basis: "none", body } });
    r.outcome(cleanup, 3, "refused", body);
    expect(r.entries.slice(before + 1).map(({ entry }) => [entry.effects.map((effect) => (effect.effect === "attempt" ? [effect.attempt, effect.result] : effect.effect)), entry.sends])).toEqual([
      [[[1, "refused"], [2, "opened"]], []], [[[2, "unknown"], [3, "opened"]], []], [[[3, "refused"]], []],
    ]);
    // The late answer of attempt 2 settles that attempt and no other.
    r.outcome(cleanup, 2, "confirmed", body);
    expect(r.state.operation(cleanup)).toMatchObject({ most: 3, selected: null, attempts: [{ outcomes: [{ result: "refused" }] }, { outcomes: [{ result: "unknown" }, { result: "confirmed" }] }, { outcomes: [{ result: "refused" }] }] });
  }
});

// Authority note, revision 25, section 12.1.1, "The effect mark `claim-active`", and case e; the scope contract's section 7.2. The
// directory is a `Directory` of test support, whose genesis the real judge wrote from the register's real outcome entry.
test("the directory's applied result runs the clause of the outcome's send: the claim is active, with the directory's reference and its genesis, and the register confirms; a result from another incarnation is a conflict, which changes nothing and confirms nothing", () => {
  const p = new Directory({ confirmed: false });
  const r = p.register;
  const claim = p.claim.seq;
  const sent = claim + 1;
  const result = p.last.sends[0]!;
  /** The delivery of a result of the `create`, from that genesis entry, as the register judges it with its own rules. */
  const recorded = (genesis: Entry) => judgeDelivery(r.state, registerDefinition, { to: result.to, from: factRefOf(genesis), n: 0, message: result.message },
    { clock: clockOf(r.state, r.now), bounds: r.bounds, facts: [], prepared: [], own: r.own, source: { entry: genesis, under: "platform:directory" }, origin: r.entries[sent]!.entry, platform: registerPlatform });
  expect([r.item(claim).state, r.item(claim).refs]).toEqual(["pending", { directory: null, genesis: null }]);

  const applied = recorded(p.last);
  if (applied.result !== "write") throw new Error(`the result was not recorded: ${JSON.stringify(applied)}`);
  // The clause is found by the kind of the outcome entry that sent the request. Its rule finds the claim from the result's `of`.
  expect([applied.draft.input, applied.draft.effects, applied.draft.sends]).toMatchObject([
    { type: "delivery", clause: "applied" },
    [{ effect: "state", item: claim, state: "active" }, { effect: "ref", item: claim, slot: "directory", to: p.at }, { effect: "ref", item: claim, slot: "genesis", to: p.fact(0) }],
    [{ n: 0, to: p.at, message: { class: "control", type: "confirm", genesis: p.fact(0) } }],
  ]);
  r.seal(applied.draft);
  expect([r.item(claim).state, r.item(claim).refs]).toEqual(["active", { directory: p.at, genesis: p.fact(0) }]);

  // Case e: the same creation answered `applied` by another incarnation of the directory's name, from a genesis MADE BY HAND. The
  // `conflict` clause has no effect, and no `confirm` is sent. The claim keeps the incarnation that it holds.
  const genesis = p.last.input as Extract<Input, { type: "genesis" }>;
  const other = { ...p.at, inc: newIncarnation(new Uint8Array(16).fill(99)) };
  const second = recorded({ ...p.last, at: other, input: { ...genesis, inc: other.inc } });
  expect(second.result === "write" && [second.draft.input, second.draft.effects, second.draft.sends]).toMatchObject([{ type: "delivery", clause: "conflict" }, [], []]);
  expect(r.item(claim).refs["directory"]).toEqual(p.at);
});
