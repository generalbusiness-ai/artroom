import { expect, test } from "vitest";
import type { Evidence, FieldValue, OperationId, Request, ScopeRef, Seed } from "@generalbusiness/dap-contract";
import { PROPOSED_BOUNDS } from "@generalbusiness/dap-contract";
import { canonicalize, digestBytes, factRefOf, intentDigest, newIncarnation, scopeIdOf, utf8 } from "@generalbusiness/artroom-bytes";
import { clockOf, contentStates, judgeDelivery, judgeGenesis, PROFILES, settleOutcome, validateDefinition, valueDigest, type Judgment, type PlatformRules } from "@generalbusiness/dap-derive";
import { d, keys, Ledger, T0 } from "@generalbusiness/dap-derive/testing";
import { destination4, destinationRules4 } from "../src/destination.ts";
import { firstExtents } from "../src/extents.ts";
import { rulesScope } from "../src/rules-scope.ts";
import { fetched, handMade, HEAD, keyObserved, MEMBERSHIP, retained, rulesObserved, RULES } from "./support-destination.ts";

// Real destination4 validator, judges, seal and fold in memory. Creator,
// source histories, membership/rules observations and host replies are
// explicitly SCRIPTED. No Native birth/driver/provider/publication is claimed.
const checked = validateDefinition(destination4, PROPOSED_BOUNDS, PROFILES, { platform: true });
if (!checked.ok) throw Error(JSON.stringify(checked.problems));
const definition = checked.definition, platform: PlatformRules = { named: "platform:destination@4", rules: destinationRules4 };
const ref = (kind: ScopeRef["kind"], mark: string): ScopeRef => ({ kind, scope: scopeIdOf({ v: 1, kind, definition: d("e"), creator: null, cause: d(mark), ordinal: 0 }), inc: newIncarnation(new Uint8Array(16).fill(8)) });
const directory = ref("directory", "d"), app = ref("lane", "a"), change = ref("lane", "b"), register = ref("register", "c");
const claim = handMade(register, "found");
const write = (ledger: Ledger, judgment: Judgment) => { expect(judgment.result, JSON.stringify(judgment)).toBe("write"); if (judgment.result !== "write") throw Error("Not written"); ledger.seal(judgment.draft); };
class BoundsBranch extends Ledger { override get foldOptions() { return { ...super.foldOptions, platform }; } }
function make() {
  const ledger = new BoundsBranch(definition, "platform:destination");
  const source = handMade(directory, "create-destination");
  if (source.input.type !== "act") throw Error("Scripted source is an act");
  const seed: Seed = { v: 1, kind: "destination", definition: "platform:destination@4", creator: directory, cause: intentDigest(source.input.signed.intent), ordinal: 0 };
  const message: Request = { class: "request", type: "create", body: { kind: "establish", fields: { repository: { host: "git.example", namespace: "public-test", name: "bounds", id: "1" }, branch: "main", import: true,
    claim: factRefOf(claim) as unknown as FieldValue, directory: directory as ScopeRef & FieldValue, membership: MEMBERSHIP.scope, rules: RULES.scope, founderHandle: "@rita" } } };
  const original = { ...source, sends: [{ n: 0, to: seed, message }] };
  const asked = { name: scopeIdOf(seed), inc: newIncarnation(new Uint8Array(16).fill(21)), to: seed, from: factRefOf(original), n: 0, message };
  write(ledger, judgeGenesis(ledger.state, definition, asked, { clock: clockOf(ledger.state, T0), bounds: PROPOSED_BOUNDS, facts: [fetched(claim, "platform:register")], prepared: [], source: { entry: original, under: "platform:directory" }, platform }));
  const control: Request | { class: "control"; type: "confirm"; genesis: ReturnType<typeof factRefOf> } = { class: "control", type: "confirm", genesis: ledger.fact(0) };
  const returned = ledger.last.sends.find(send => send.message.class === "result");
  if (!returned || returned.message.class !== "result") throw Error("The judged genesis returned its original result");
  const confirmation = { ...handMade(directory, "confirm-destination", [{ n: 0, to: ledger.at, message: control }]),
    input: { type: "delivery", from: ledger.fact(0), n: returned.n, message: returned.message, clause: "applied" } as const };
  write(ledger, judgeDelivery(ledger.state, definition, { to: ledger.at, from: factRefOf(confirmation), n: 0, message: control }, { clock: clockOf(ledger.state, T0), bounds: PROPOSED_BOUNDS, facts: [], prepared: [], source: { entry: confirmation, under: "platform:directory" }, own: ledger.own, platform }));
  const adopt = ledger.act(keys.rita, "adopt-head", { on: 0, expected: { on: ledger.item(0).revision }, fields: { commit: HEAD, why: "SCRIPTED host base for bounds" } }, { platform });
  expect(adopt.result).toBe("write");
  answer(ledger, `${ledger.head.seq}:0`, { seen: HEAD });
  return ledger;
}
function answer(ledger: Ledger, operation: OperationId, body: Evidence["body"], hand: Partial<Parameters<typeof settleOutcome>[3]> = {}) {
  const judgment = settleOutcome(ledger.state, definition, { type: "outcome", operation, attempt: 1, result: "confirmed", evidence: { basis: "own-answer", body } }, { clock: clockOf(ledger.state, T0), bounds: PROPOSED_BOUNDS, own: ledger.own, facts: ledger.foldOptions.facts, platform, ...hand });
  expect(judgment.result, JSON.stringify(judgment)).toBe("write"); if (judgment.result !== "write") throw Error("Not written"); ledger.seal(judgment.draft);
}
function file(ledger: Ledger, content = "# Pot\n") {
  const message: Request = { class: "request", type: "tell", body: { message: "publish-file", fields: { path: "shelf/pot.md", content } } };
  const source = handMade(app, "donate", [{ n: 0, to: ledger.at, message }]);
  ledger.remember([fetched(source, "lending")]);
  const judgment = judgeDelivery(ledger.state, definition, { to: ledger.at, from: factRefOf(source), n: 0, message }, { clock: clockOf(ledger.state, T0), bounds: PROPOSED_BOUNDS, facts: [], prepared: [], own: ledger.own, source: { entry: source, under: "lending" }, platform });
  if (judgment.result === "write") ledger.seal(judgment.draft);
  return judgment;
}
function changeReceipt(ledger: Ledger) {
  const content = "# Change\n", manifest = handMade(change, "propose-file", [], keys.rita, { path: "change.md", content, size: utf8(content).length, digest: digestBytes(utf8(content)), base: HEAD });
  const message: Request = { class: "request", type: "tell", body: { message: "reserve", fields: { operation: { self: true }, manifest: factRefOf(manifest) as unknown as FieldValue, verdicts: [], jobs: [], links: [], reports: [] } } };
  const merge = handMade(change, "merge", [{ n: 0, to: ledger.at, message }], keys.rita, { manifest: manifest.seq });
  const facts = [fetched(manifest, "change"), fetched(merge, "change")]; ledger.remember(facts);
  write(ledger, judgeDelivery(ledger.state, definition, { to: ledger.at, from: factRefOf(merge), n: 0, message }, { clock: clockOf(ledger.state, T0), bounds: PROPOSED_BOUNDS, facts, prepared: [], own: ledger.own, source: { entry: merge, under: "change" }, platform }));
  const judge = `${ledger.head.seq}:0` as OperationId;
  const rules = rulesObserved(T0, { approvals: 0 });
  if (rules.content.asked !== "rules") throw Error("Scripted rules observation");
  const extents = firstExtents(rules.content);
  const observed = [retained({ ...rules, content: { ...rules.content, extents: valueDigest("artroom-rules-extents-1", extents), singleControllerException: false } }, 1), retained(keyObserved(keys.rita, T0), 2),
    retained({ subject: "holders", of: MEMBERSHIP, head: { seq: 412, hash: d("4") }, action: "rules.publish", count: 2, holders: [keys.rita.member.member], definition: "platform:membership@1", at: T0 }, 3)];
  const changes = { paths: ["change.md"], links: [], unreadable: 0 };
  answer(ledger, judge, { head: HEAD, present: true, tree: "d".repeat(40), firstParent: HEAD, ancestors: [], changes: valueDigest("artroom-changed-set-1", changes) }, { facts, observed, values: [canonicalize(extents), canonicalize(changes)], observing: { membership: { ...MEMBERSHIP, inc: null }, rules: { ...RULES, inc: null }, content: () => contentStates(rulesScope) } });
  const publication = ledger.state.page("publication", ["reserved"], null, 1).items[0]!;
  answer(ledger, `${ledger.head.seq}:0`, { send: "accepted", seen: publication.values["integration"]! });
  expect(ledger.state.count("receipt", "owed")).toBe(1);
}

test("change and file receipts share the 64/65 admission boundary while final file rows leave item capacity available", () => {
  const ledger = make(); changeReceipt(ledger);
  for (let n = 0; n < 63; n++) {
    expect(file(ledger).result).toBe("write");
    answer(ledger, `${ledger.head.seq}:0`, { head: ledger.item(0).values["head"]!, present: false, tree: null });
  }
  expect(ledger.state.count("receipt", "owed")).toBe(64);
  expect(ledger.state.count("file-publication", "aborted")).toBe(63);
  expect(file(ledger).result).toBe("write");
  answer(ledger, `${ledger.head.seq}:0`, { head: ledger.item(0).values["head"]!, present: false, tree: null });
  expect(ledger.state.count("receipt", "owed")).toBe(65);
  const before = ledger.state.snapshot(), rejected = file(ledger);
  expect(rejected.result).toBe("write");
  if (rejected.result !== "write") throw Error("Refusal is recorded");
  expect(rejected.draft.input).toMatchObject({ type: "delivery", decision: "refused", reason: { code: "guard-failed", name: "receipts-owed" } });
  expect(ledger.state.count("receipt", "owed")).toBe(65);
  expect(ledger.state.count("file-publication", "queued")).toBe(0);
  expect(ledger.state.snapshot()).not.toBe(before); // Only the refusal advances the record.
});

test("publish-file accepts 65536 UTF-8 bytes and rejects the next byte before opening a file row", () => {
  const ledger = make();
  expect(file(ledger, "x".repeat(65536)).result).toBe("write");
  expect(ledger.state.count("file-publication", "queued")).toBe(1);
  const rejected = file(ledger, "x".repeat(65537));
  expect(rejected.result).toBe("write");
  if (rejected.result !== "write") throw Error("Refusal is recorded");
  expect(rejected.draft.input).toMatchObject({ type: "delivery", decision: "refused", reason: { code: "bad-field" } });
  expect(ledger.state.count("file-publication", "queued")).toBe(1);
});
