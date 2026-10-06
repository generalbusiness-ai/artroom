import { expect, test } from "vitest";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { Digest, FieldValue, PlatformData, PlatformDefinition, Request, Seed } from "@generalbusiness/artroom-contract";
import { canonicalize, factRefOf, intentDigest, newIncarnation, scopeIdOf, signIntent, textDigest, utf8 } from "@generalbusiness/artroom-bytes";
import { MemoryState, applyEntry, checkpointOf, clockOf, judgeCheckpoint, judgeDelivery, judgeGenesis, owed, ownersOf, stateDigest, validateDefinition } from "@generalbusiness/artroom-derive";
import { Ledger, T0, arriving, forged, keys, otherLane, t, valid } from "@generalbusiness/artroom-derive/testing";
import { MemorySource, verify } from "../src/index.ts";
import type { Rules, StateView } from "@generalbusiness/artroom-derive";
import type { MemoryScope } from "../src/index.ts";
import { register, registerRules } from "../../platform/src/index.ts";
import { Register, registerPlatform } from "../../platform/test/support-founding.ts";
import { served } from "./world.ts";

test("replay admission counts the actual register's legacy cleanup closure and preserves scripted external reservations", async () => {
  // The actual register data and rules judge and fold both entries in memory,
  // under the register's install and founding-policy authority over test keys.
  // The signed intents are test inputs; no host runs or answers. These small
  // replay budgets are controlled test inputs, not production capacity claims.
  const scope = new Register();
  expect(scope.found(keys.rita).result).toBe("write");
  expect([scope.last.seq, scope.state.outstanding().outcomes]).toEqual([1, [{ owner: registerPlatform.named, kind: "create-repository", entries: 6, unsent: 1 }]]);
  // This legacy kind has no counted attempts in its data. Six possible
  // outcomes each reserve the owner's 12-entry cleanup closure and the
  // kind's two-entry directory request, plus one closing checkpoint:
  // 6 * (1 + 12 + 2) + 1 = 91 reserved; two written entries make 93.
  expect(register.outcomes["create-repository"]!.attempts).toBeUndefined();
  expect([owed(scope.state, scope.definition, scope.last.input), owed(scope.state, scope.definition, scope.last.input, ownersOf(scope.definition, registerPlatform, null))]).toEqual([19, 91]);
  const source = new MemorySource([served(scope, [scope])]);
  const options = { mode: "replay" as const, scope: scope.at.scope, platform: () => ({ data: register, rules: registerRules }) };
  for (const budget of [21, 92]) {
    const tight = await verify(source, { ...options, bounds: { ...PROPOSED_BOUNDS, scopeEntries: budget } });
    expect([tight.report.result, tight.report.at?.seq, tight.why]).toEqual(["mismatch", 1, "the taking or new-work entry exceeds the budget of used plus reserved entries"]);
  }
  const enough = await verify(source, { ...options, bounds: { ...PROPOSED_BOUNDS, scopeEntries: 93 } });
  expect([enough.report.result, enough.why]).toEqual(["consistent", null]);

  // SCRIPTED external owner reservation: four entries while any operation is
  // pending. It stands in for capability records; no external owner runs.
  const owners = { rules: () => null, reserves: (view: StateView) => view.outstanding().outcomes.length ? 4 : 0 };
  const externalTight = await verify(source, { ...options, owners, bounds: { ...PROPOSED_BOUNDS, scopeEntries: 93 } });
  expect([externalTight.report.result, externalTight.report.at?.seq]).toEqual(["mismatch", 1]);
  const externalEnough = await verify(source, { ...options, owners, bounds: { ...PROPOSED_BOUNDS, scopeEntries: 97 } });
  expect([externalEnough.report.result, externalEnough.why]).toEqual(["consistent", null]);
});

/**
 * Made-up platform data. The receiver's entries are judged, including its
 * founding and the refused bound decision. The sender's entries are
 * stand-ins written by hand, retained and anchored. The real holder ledger
 * funds the decision, and the real verifier derives its draw again.
 */
const NAMED = "platform:task@2" as PlatformDefinition;
const form = { also: {}, fields: {}, guards: [], effects: [], sends: [], attention: [] };
const DATA: PlatformData = {
  format: "artroom-definition-1", name: "platform:task", profile: { name: "restricted", version: 1 }, capabilities: [], genesis: "found",
  items: {
    board: { many: false, max: 1, initial: "open", states: { open: { final: false } }, parties: { opener: { fixed: true, required: true, list: false, author: false } }, refs: {}, values: {} },
    job: { many: false, max: 1, initial: "open", states: { open: { final: false } }, parties: {}, refs: { owner: { fixed: false, required: true, to: { type: "scope", kind: "lane" } } }, values: {}, holds: { decisions: { stop: 1 } } },
  },
  acts: { found: { ...form, step: "open", on: "board", grant: "found", fields: { opener: { type: "member", required: true } }, effects: [{ party: { slot: "opener", from: { field: "opener" } } }] } },
  receives: {
    start: { ...form, class: "tell", message: "start", from: { kind: "lane" }, opens: "job", effects: [{ ref: { slot: "owner", from: { sender: true } } }] },
    stop: { ...form, class: "tell", message: "stop", from: { kind: "lane" }, opens: null, also: { job: { item: "job", one: true } }, bound: { of: "also.job", where: [{ equals: { a: { sender: true }, b: { slot: "owner", of: "also.job" } } }] }, guards: [{ of: "also.job", equals: { a: { const: true }, b: { const: false } }, reason: "not-ready" }] },
  },
  outcomes: {}, rules: {}, timed: {},
};

class Deciding extends Ledger {
  readonly foreign: ReturnType<typeof forged>[] = [];
  readonly texts = new Map<Digest, string>();
  readonly sizes = (digest: Digest) => { const text = this.texts.get(digest); return text === undefined ? undefined : utf8(text).length; };
  override get foldOptions() { return { ...super.foldOptions, platform: { named: NAMED, rules: this.rules }, texts: this.sizes }; }
  constructor(readonly data: PlatformData = DATA, readonly rules: Rules = {}, memo?: string) {
    super(valid(validateDefinition(data, PROPOSED_BOUNDS, undefined, { platform: true })));
    if (memo !== undefined) this.texts.set(textDigest(memo), memo);
    const founding = signIntent({ v: 1, to: null, actor: keys.rita.key, kind: "found", on: null, expected: {}, fields: { opener: keys.rita.member, ...(memo === undefined ? {} : { memo: textDigest(memo) }) }, idempotencyKey: "decisions", notAfter: t(60) }, keys.rita.secret);
    const seed: Seed = { v: 1, kind: "directory", definition: NAMED, creator: null, cause: intentDigest(founding.intent), ordinal: 0 };
    const judged = judgeGenesis(this.state, this.definition, { name: scopeIdOf(seed), inc: newIncarnation(new Uint8Array(16).fill(6)), seed, founding }, { clock: clockOf(this.state, T0), bounds: PROPOSED_BOUNDS, facts: [], prepared: [], source: null, platform: { named: NAMED, rules: this.rules }, texts: this.sizes });
    if (judged.result !== "write") throw new Error(JSON.stringify(judged));
    this.seal(judged.draft);
  }
  delivery(message: string, fields: Record<string, FieldValue> = {}) {
    const request: Request = { class: "request", type: "tell", body: { message, fields } };
    const source = forged(otherLane, this.foreign.length + 1, { type: "checkpoint", through: 0, state: this.definition.digest }, [{ n: 0, to: this.at, message: request }]);
    this.foreign.push(source);
    const arrival = { to: this.at, from: factRefOf(source.entry), n: 0, message: request };
    const judged = judgeDelivery(this.state, this.definition, arrival, { ...arriving(this, arrival, source), platform: { named: NAMED, rules: this.rules }, texts: this.sizes });
    if (judged.result !== "write") throw new Error(JSON.stringify(judged));
    const entry = this.seal(judged.draft);
    return { entry, draft: judged.draft, total: this.entries.length + owed(this.state, this.definition, entry.input) };
  }
  served(): MemoryScope {
    return { scope: this.at, entries: this.entries.map(({ entry, hash }) => ({ seq: entry.seq, hash, bytes: canonicalize(entry) })), retained: [...this.entries.flatMap(({ entry }) => entry.uses.map((use) => ({ kind: "entry" as const, digest: use.content, bytes: canonicalize(this.foreign.find((copy) => factRefOf(copy.entry).hash === use.fact.hash)!.entry), under: "lane" }))), ...[...this.texts].map(([digest, text]) => ({ kind: "text" as const, digest, bytes: canonicalize(text) }))] };
  }
  anchors() { return this.foreign.map(({ entry }) => { const fact = factRefOf(entry); return { scope: fact.at.scope, seq: fact.seq, hash: fact.hash }; }); }
}

test("a bound refusal consumes a real holder decision at a full scope; replay derives the count and enforces the taking reservation", async () => {
  const scope = new Deciding();
  const taking = scope.delivery("start");
  expect([taking.total, scope.state.holder(taking.entry.seq)]).toEqual([4, { decisions: { stop: 1 } }]);
  const stopping = scope.delivery("stop");
  expect([stopping.total, stopping.draft.settles, stopping.entry.effects, scope.state.holder(taking.entry.seq)]).toEqual([4, true, [], null]);
  const source = new MemorySource([scope.served()]);
  const options = { mode: "replay" as const, scope: scope.at.scope, anchors: scope.anchors(), platform: () => ({ data: DATA, rules: {} }) };
  const good = await verify(source, { ...options, bounds: { ...PROPOSED_BOUNDS, scopeEntries: 4 } });
  expect([good.report.result, good.why]).toEqual(["consistent", null]);
  const tooSmall = await verify(source, { ...options, bounds: { ...PROPOSED_BOUNDS, scopeEntries: 3 } });
  expect([tooSmall.report.result, tooSmall.report.at?.seq]).toEqual(["mismatch", taking.entry.seq]);
});

test("replay and a closing checkpoint preserve the early field refusal and draw a late coded bad-field bound refusal", async () => {
  const data = structuredClone(DATA);
  data.receives["stop"]!.fields = { ...data.receives["stop"]!.fields, amount: { type: "int", min: 0, max: 1, required: true } };
  data.receives["stop"]!.guards = [{ code: "decline", row: "P15" }];
  let guards = 0;
  const rules: Rules = { decline: { place: "guard", refusals: ["late"], run: () => { guards++; return { holds: false, name: "late", code: "bad-field" }; } } };
  const scope = new Deciding(data, rules);
  const taking = scope.delivery("start");
  const early = scope.delivery("stop", { amount: "wrong" });
  expect([early.draft.bound, early.draft.settles, scope.state.holder(taking.entry.seq), early.total, guards]).toEqual([undefined, false, { decisions: { stop: 1 } }, 5, 0]);
  const late = scope.delivery("stop", { amount: 0 });
  expect([late.draft.bound, late.draft.settles, scope.state.holder(taking.entry.seq), late.total, guards]).toEqual([{ item: taking.entry.seq, message: "stop" }, true, null, 5, 1]);
  const checkpoint = judgeCheckpoint(scope.state, scope.definition, checkpointOf(scope.state), { clock: clockOf(scope.state, T0), bounds: PROPOSED_BOUNDS });
  if (checkpoint.result !== "write") throw new Error(JSON.stringify(checkpoint));
  scope.seal(checkpoint.draft);
  const replay = await verify(new MemorySource([scope.served()]), { mode: "replay", scope: scope.at.scope, anchors: scope.anchors(), bounds: { ...PROPOSED_BOUNDS, scopeEntries: 5 }, platform: () => ({ data, rules }) });
  expect([replay.report.result, replay.why, guards]).toEqual(["consistent", null, 2]);
});

/** A larger founding field really holds the text before the smaller stop field reads it. Every receiver entry is judged. */
function redacted(text: string, decision: "bare" | "named" | "other" | "applied" | "invalid" | "spent" | "known" = "bare") {
  const data = structuredClone(DATA);
  const memo = { type: "text", max: 16, detached: true } as const;
  data.items["board"]!.values["memo"] = { fixed: false, required: true, of: memo };
  data.items["job"]!.values["amount"] = { fixed: false, required: true, default: 0, of: { type: "int", min: 0, max: 1 } };
  data.acts["found"]!.fields = { ...data.acts["found"]!.fields, memo: { ...memo, required: true } };
  data.acts["found"]!.effects = [...data.acts["found"]!.effects, { value: { slot: "memo", from: { field: "memo" } } }];
  data.acts["redact"] = { ...form, step: "transition", on: "board", grant: "redact", guards: [{ state: ["open"] }], effects: [{ redact: { slot: "memo" } }] };
  if (decision === "known") data.items["job"]!.holds = { decisions: { stop: 2 } };
  data.receives["stop"]!.fields = { note: { type: "text", max: 2, detached: true, required: true }, reject: { type: "bool", required: true } };
  data.receives["stop"]!.guards = decision === "named" ? [{ code: "decline", row: "P15" }] : decision === "other" ? [{ of: "also.job", equals: { a: { const: true }, b: { const: false } } }] : [];
  data.receives["stop"]!.effects = [{ code: "effect", row: "P15" }];
  const rules: Rules = {
    decline: { place: "guard", refusals: ["late"], run: () => ({ holds: false, name: "late", code: "bad-field" }) },
    effect: { place: "effect", most: 1, run: ({ resolved }) => resolved.fields["reject"] === true ? [{ effect: "value", item: resolved.subjects.get("also.job")!.id, slot: "amount", value: "wrong" }] : [] },
  };
  const scope = new Deciding(data, rules, text);
  const taking = scope.delivery("start");
  if (decision === "spent" || decision === "known") scope.delivery("stop", { note: textDigest(text), reject: false });
  const deciding = scope.delivery("stop", { note: textDigest(text), reject: decision === "invalid" ? "wrong" : decision !== "applied" });
  const count = scope.state.holder(taking.entry.seq);
  const tombstone = scope.did(keys.rita, "redact", { on: 0, expected: { on: scope.item(0).revision } });
  expect(tombstone.effects).toEqual([{ effect: "redact", item: 0, slot: "memo", texts: [textDigest(text)] }]);
  scope.texts.delete(textDigest(text));
  const checkpoint = judgeCheckpoint(scope.state, scope.definition, checkpointOf(scope.state), { clock: clockOf(scope.state, T0), bounds: PROPOSED_BOUNDS });
  if (checkpoint.result !== "write") throw new Error(JSON.stringify(checkpoint));
  scope.seal(checkpoint.draft);
  return { scope, deciding, taking, tombstone, count, options: { mode: "replay" as const, scope: scope.at.scope, anchors: scope.anchors(), grants: "as-recorded" as const, platform: () => ({ data, rules }) } };
}

test("erased text leaves the early size refusal and late effect refusal with the same bare code unproven; replay and cold folding stop before the draw", async () => {
  for (const [text, bound] of [["long", false], ["ok", true]] as const) {
    const { scope, deciding, taking, count, options } = redacted(text);
    expect([deciding.entry.input, deciding.draft.bound, count]).toEqual([expect.objectContaining({ decision: "refused", reason: { code: "bad-field" } }), bound ? { item: taking.entry.seq, message: "stop" } : undefined, bound ? null : { decisions: { stop: 1 } }]);
    const replay = await verify(new MemorySource([scope.served()]), options);
    expect([replay.report.result, replay.report.at?.seq, replay.report.coverage.find((coverage) => coverage.scope.scope === scope.at.scope)?.through]).toEqual(["incomplete", deciding.entry.seq, deciding.entry.seq - 1]);
    expect(replay.why).toContain("binding and draw are unproven");
    const cold = new MemoryState();
    const inputs = { ...scope.foldOptions, texts: () => null };
    for (const { entry, hash } of scope.entries.slice(0, deciding.entry.seq)) applyEntry(cold, scope.definition, entry, hash, inputs);
    const before = stateDigest(cold.all());
    expect(() => applyEntry(cold, scope.definition, deciding.entry, scope.entries[deciding.entry.seq]!.hash, inputs)).toThrow("binding and draw are unproven");
    expect([stateDigest(cold.all()), cold.scope()!.head.seq]).toEqual([before, deciding.entry.seq - 1]);
  }
});

test("ordinary redacted replay keeps applied, named-guard, definitive early-field and zero-remaining-count cases derivable", async () => {
  for (const decision of ["applied", "named", "other", "invalid", "spent", "known"] as const) {
    const { scope, options, count } = redacted("ok", decision);
    const replay = await verify(new MemorySource([scope.served()]), options);
    expect([replay.report.result, replay.why, replay.report.coverage.find((coverage) => coverage.scope.scope === scope.at.scope)?.through, count]).toEqual(["consistent", null, scope.head.seq, decision === "invalid" ? { decisions: { stop: 1 } } : null]);
    expect(replay.report.redacted.length).toBeGreaterThan(0);
  }
});
