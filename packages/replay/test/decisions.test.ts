import { expect, test } from "vitest";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { FieldValue, PlatformData, PlatformDefinition, Request, Seed } from "@generalbusiness/artroom-contract";
import { canonicalize, factRefOf, intentDigest, newIncarnation, scopeIdOf, signIntent } from "@generalbusiness/artroom-bytes";
import { checkpointOf, clockOf, judgeCheckpoint, judgeDelivery, judgeGenesis, owed, validateDefinition } from "@generalbusiness/artroom-derive";
import { Ledger, T0, arriving, forged, keys, otherLane, t, valid } from "@generalbusiness/artroom-derive/testing";
import { MemorySource, verify } from "../src/index.ts";
import type { Rules } from "@generalbusiness/artroom-derive";
import type { MemoryScope } from "../src/index.ts";

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
  constructor(readonly data: PlatformData = DATA, readonly rules: Rules = {}) {
    super(valid(validateDefinition(data, PROPOSED_BOUNDS, undefined, { platform: true })));
    const founding = signIntent({ v: 1, to: null, actor: keys.rita.key, kind: "found", on: null, expected: {}, fields: { opener: keys.rita.member }, idempotencyKey: "decisions", notAfter: t(60) }, keys.rita.secret);
    const seed: Seed = { v: 1, kind: "directory", definition: NAMED, creator: null, cause: intentDigest(founding.intent), ordinal: 0 };
    const judged = judgeGenesis(this.state, this.definition, { name: scopeIdOf(seed), inc: newIncarnation(new Uint8Array(16).fill(6)), seed, founding }, { clock: clockOf(this.state, T0), bounds: PROPOSED_BOUNDS, facts: [], prepared: [], source: null, platform: { named: NAMED, rules: this.rules } });
    if (judged.result !== "write") throw new Error(JSON.stringify(judged));
    this.seal(judged.draft);
  }
  delivery(message: string, fields: Record<string, FieldValue> = {}) {
    const request: Request = { class: "request", type: "tell", body: { message, fields } };
    const source = forged(otherLane, this.foreign.length + 1, { type: "checkpoint", through: 0, state: this.definition.digest }, [{ n: 0, to: this.at, message: request }]);
    this.foreign.push(source);
    const arrival = { to: this.at, from: factRefOf(source.entry), n: 0, message: request };
    const judged = judgeDelivery(this.state, this.definition, arrival, { ...arriving(this, arrival, source), platform: { named: NAMED, rules: this.rules } });
    if (judged.result !== "write") throw new Error(JSON.stringify(judged));
    const entry = this.seal(judged.draft);
    return { entry, draft: judged.draft, total: this.entries.length + owed(this.state, this.definition, entry.input) };
  }
  served(): MemoryScope {
    return { scope: this.at, entries: this.entries.map(({ entry, hash }) => ({ seq: entry.seq, hash, bytes: canonicalize(entry) })), retained: this.entries.flatMap(({ entry }) => entry.uses.map((use) => ({ kind: "entry" as const, digest: use.content, bytes: canonicalize(this.foreign.find((copy) => factRefOf(copy.entry).hash === use.fact.hash)!.entry), under: "lane" }))) };
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
