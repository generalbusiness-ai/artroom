import { describe, expect, test } from "vitest";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { Input, SignedIntent } from "@generalbusiness/artroom-contract";
import { intentDigest, newIncarnation, scopeIdOf, seedDigest } from "@generalbusiness/artroom-bytes";
import { clockOf, derivable, judgeGenesis, runnable, type OutcomeRule, type PlatformRule, type RuleGiven } from "@generalbusiness/artroom-derive";
import { Ledger, T0, deskDefinition, founded } from "@generalbusiness/artroom-derive/testing";
import { CREATION_ATTEMPTS, DIRECTORY, DIRECTORY_CLAUSES, REGISTER, platform, register, registerRules } from "../src/index.ts";
import { Register, installing, paul, registerDefinition, registerPlatform, registerSeed, registerStandIns, rita, una } from "./support-founding.ts";

// The plan's T43, for `platform:register@1` (authority note, revision 21, section 12.1.1, and its table of marks, section 12.1.8).
test("the register definition validates whole with the platform option; every mark of the note's table has its rule but one, `create-repository`, so the package's rules do not run it", () => {
  const valid = registerDefinition;
  expect([valid.underived, derivable(valid, null), register.capabilities, register.rules, register.receives, register.timed]).toEqual([[], true, [], {}, {}, {}]);
  // Section 12.1.1: two item types, the genesis `install` and the act `found`, and three kinds of operation.
  expect([Object.keys(register.items), register.genesis, Object.keys(register.acts), Object.keys(register.outcomes)])
    .toEqual([["register", "claim"], "install", ["install", "found"], ["create-repository", "revoke-credential", "delete-repository"]]);
  // No entry of the register's data sends a request: the one `create` is the selecting outcome's (section 12.1).
  expect(Object.values(register.acts).flatMap((act) => act.sends)).toEqual([]);

  // The marks, by the rows of the note's table: rows 2 to 6, row r of revision 24, and row c of the further marks, one for each kind of operation.
  expect(valid.marks.map((m) => [m.place, m.path, m.code, m.row])).toEqual([
    [1, "acts.install.grant", "install", "P13"], [1, "acts.found.grant", "founding-policy", "P13"], [4, "acts.found.guards.0", "handle-form", "P27"],
    [5, "acts.found.effects.3", "founder-key", "P14"], [5, "acts.found.effects.4", "claim-seed", "P16"], [5, "acts.found.effects.5", "open-create-repository", "P16"],
    [7, "outcomes.create-repository", "create-repository", "P16"], [7, "outcomes.revoke-credential", "revoke-credential", "P16"], [7, "outcomes.delete-repository", "delete-repository", "P16"],
  ]);
  // The one rule that waits on the I3 deltas' entry EJ1 is not written, and no other is missing. By the whole-scope rule (the
  // contract's section 6.1) a version that lacks a rule runs nothing: no register is founded under the package's rules. With the
  // STAND-IN of test support it can be run.
  const { rules } = platform(REGISTER)!;
  expect([rules === registerRules, valid.marks.filter((mark) => !Object.hasOwn(rules, mark.code)).map((mark) => mark.code)]).toEqual([true, ["create-repository"]]);
  expect([runnable(valid, rules), runnable(valid, { ...rules, ...registerStandIns })]).toEqual([false, true]);
  // The clauses of the directory's `create` are data, kept for the rule that will send it (section 12.1.1, the last row).
  expect(DIRECTORY_CLAUSES).toEqual({ applied: [{ state: "active" }, { ref: { slot: "directory", from: { sender: true } } }, { ref: { slot: "genesis", from: { source: "ref" } } }], refused: [], conflict: [] });
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

  test("the table has exactly the rules that are written: six at their places, and the outcomes of the two cleanups, which select nothing, take no read and allow another attempt", () => {
    expect(Object.entries(registerRules).map(([name, rule]) => [name, rule.place, "refusals" in rule ? rule.refusals : "most" in rule ? rule.most : null])).toEqual([
      ["install", "grant", []], ["founding-policy", "grant", []], ["handle-form", "guard", ["bad-handle"]], ["founder-key", "effect", 1], ["claim-seed", "effect", 1], ["open-create-repository", "effect", 2],
      ["revoke-credential", "outcome", null], ["delete-repository", "outcome", null],
    ]);
    for (const kind of ["revoke-credential", "delete-repository"]) {
      const { rules } = registerRules[kind] as { rules: OutcomeRule };
      expect([rules.selects, rules.read, rules.retries("refused", null as never, null as never), rules.retries("unknown", null as never, null as never), rules.derives, rules.closure]).toEqual([false, false, true, true, undefined, undefined]);
    }
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

// Authority note, section 12.1.1: the row `found`, and the cases a to d. The entries of `found` are judged with the register's own
// rules. The outcomes of `create-repository` are judged with a STAND-IN rule of test support, which shows the two cleanups being
// opened and nothing about the creation of a directory. The outcomes of the two cleanups are judged with the register's own rules.
test("a founding opens one claim and one creation of three attempts; a key outside the policy opens none; the same intent again opens nothing; each cleanup's own answer settles its attempt, and no read does", () => {
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

  // STAND-IN from here to the cleanups. Case c: attempt 1 is `unknown`, and attempt 2's own answer says created. Case d: attempt
  // 1's own answer arrives later. The first is selected, and the other opens its own deletion.
  r.outcome(creation, 1, "unknown");
  r.outcome(creation, 2, "confirmed", { name: "n2", id: "r2", credential: "c2" });
  const revocation = `${r.head.seq}:0` as const;
  r.outcome(creation, 1, "confirmed", { name: "n1", id: "r1" });
  const deletion = `${r.head.seq}:0` as const;
  expect([r.state.operation(creation)!.selected, r.item(claim).values["repository"], r.state.operation(revocation)!.kind, r.state.operation(deletion)!.kind])
    .toEqual([2, { host: "git.example", namespace: "artroom", name: "n2", id: "r2" }, "revoke-credential", "delete-repository"]);

  // The register's own rules, for the outcomes of the two cleanups. A read of the host settles nothing. A `refused` and an
  // `unknown` are each followed by the next attempt, to the three that the opening states, and no further. Nothing is derived.
  for (const cleanup of [deletion, revocation]) {
    const before = r.head.seq;
    expect([r.outcome(cleanup, 1, "confirmed", {}, "read"), r.head.seq]).toMatchObject([{ result: "refused", reason: "bad-input" }, before]);
    r.outcome(cleanup, 1, "refused", {});
    r.outcome(cleanup, 2, "unknown");
    r.outcome(cleanup, 3, "refused", {});
    expect(r.entries.slice(before + 1).map(({ entry }) => [entry.effects.map((effect) => (effect.effect === "attempt" ? [effect.attempt, effect.result] : effect.effect)), entry.sends])).toEqual([
      [[[1, "refused"], [2, "opened"]], []], [[[2, "unknown"], [3, "opened"]], []], [[[3, "refused"]], []],
    ]);
    // The late answer of attempt 2 settles that attempt and no other.
    r.outcome(cleanup, 2, "confirmed", {});
    expect(r.state.operation(cleanup)).toMatchObject({ most: 3, selected: null, attempts: [{ outcomes: [{ result: "refused" }] }, { outcomes: [{ result: "unknown" }, { result: "confirmed" }] }, { outcomes: [{ result: "refused" }] }] });
  }
});
