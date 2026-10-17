import { describe, expect, test } from "vitest";
import type { Digest, Entry, FactRef, FieldValue, Observation, OperationId } from "@generalbusiness/dap-contract";
import { derivable, grantFrom, runnable } from "@generalbusiness/dap-derive";
import { keys, T0, t, type Actor } from "@generalbusiness/dap-derive/testing";
import { digestBytes, entryHash, factRefOf, keyIdOfSecret, newIncarnation, utf8 } from "@generalbusiness/artroom-bytes";
import { DESTINATION_5, destination5, destination6, destinationReceipt, destinationRules5, destinationRules6, readFor, revokedToken } from "../src/destination.ts";
import { NEWEST, platform } from "../src/index.ts";
import { handMade, keyObserved, MEMBERSHIP, retained, HEAD } from "./support-destination.ts";
import { publicationJourney } from "./support-publication-journey.ts";

// Actual validator, judges and fold, in memory. The creator and source
// lane, membership/rules answers and Git replies remain scripted stand-ins.
// No SQLite runtime, restart, driver, provider or token issuance is claimed.
describe.each([[DESTINATION_5, destination5, destinationRules5], ["platform:destination@6", destination6, destinationRules6]] as const)("standing policy under %s", (named, data, rules) => {
const journey = publicationJourney(data, named, rules);
const token = { token: "d1-scripted-token", ends: t(600) };
const observed = (over: Partial<Observation> = {}) => [retained(keyObserved(keys.rita, T0, over), 1)];
const observe = (over: Partial<Observation> = {}) => ({ observed: observed(over), observing: { membership: MEMBERSHIP } });
const opened = (ledger: ReturnType<typeof journey.make>) => ledger.last.effects.filter(effect => effect.effect === "operation");
const openingId = (ledger: ReturnType<typeof journey.make>, kind: string): OperationId => `${ledger.head.seq}:${opened(ledger).find(effect => effect.kind === kind)!.k}`;

test("D1 validates and runs under an explicit pin while existing default founding stays @3", () => {
  expect(derivable(journey.definition, null)).toBe(true);
  expect(runnable(journey.definition, journey.platform.rules)).toBe(true);
  expect(platform(named)?.data).toBe(data);
  expect(NEWEST["platform:destination"]).toBe("platform:destination@3");
  expect(Object.keys(destination5.items["publication"]!.values)).toHaveLength(12);
});

test("an active current reservation signer installs the confirmed push credential", () => {
  const ledger = journey.make(), { publication, mint } = journey.reserve(ledger);
  expect(ledger.item(publication.id).values["passes"]).toMatchObject({ base: { merger: { key: keys.rita.key }, approvals: [] }, checks: [] });
  journey.answer(ledger, mint, token, observe());
  expect(ledger.item(publication.id)).toMatchObject({ state: "publishing", values: { token: mint } });
  expect(ledger.last.input).toMatchObject({ type: "outcome", observed: [{ observation: { key: keys.rita.key } }] });
  expect(opened(ledger)).toEqual([]);
});

test("an inactive signer aborts, revokes this mint and opens one deciding read without installing the credential", () => {
  const ledger = journey.make(), { publication, push, mint } = journey.reserve(ledger);
  journey.answer(ledger, mint, token, observe({ keyState: "compromised" }));
  expect(ledger.item(publication.id)).toMatchObject({ state: "reserved", values: { aborting: true, token: null } });
  expect(opened(ledger).map(effect => [effect.kind, effect.for])).toEqual([["revoke", publication.id], ["read", publication.id]]);
  const revoke = ledger.state.operation(`${ledger.head.seq}:0`)!, read = ledger.state.operation(`${ledger.head.seq}:1`)!;
  expect(revokedToken(ledger.state, ledger.own, revoke)).toBe(token.token);
  expect(readFor(ledger.state, ledger.own, read)).toEqual(ledger.item(publication.id));
  expect(readFor(ledger.state, ledger.own, { ...read, for: 0 })).toBeNull();
  expect(readFor(ledger.state, ledger.own, { ...read, attempts: [{ attempt: 2, opened: ledger.head.seq, outcomes: [] }] })).toBeNull();
  const changedOwn = (change: (entry: Entry) => void) => (seq: number) => {
    const got = ledger.own(seq); if (!got) return null;
    const entry = structuredClone(got.entry); if (seq === ledger.head.seq) change(entry);
    return { entry, hash: entryHash(entry) };
  };
  // Tampered own-record fixtures; neither is a native admissible history.
  expect(readFor(ledger.state, changedOwn(entry => { if (entry.input.type === "outcome") entry.input.operation = push; }), read)).toBeNull();
  expect(readFor(ledger.state, changedOwn(entry => { if (entry.input.type === "outcome") entry.input.attempt = 2; }), read)).toBeNull();
  expect(readFor(ledger.state, changedOwn(entry => { entry.at = { ...entry.at, inc: newIncarnation(new Uint8Array(16).fill(91)) }; }), read)).toBeNull();
  journey.answer(ledger, read.id as OperationId, { seen: publication.values["integration"]! });
  expect(ledger.item(publication.id).state).toBe("published");
});

test("missing, unknown, stale, reused and wrong-incarnation standing leave the confirmed mint unwritten", () => {
  const cases = [
    {}, observe({ keyState: "unknown" }), observe({ at: t(-11) }),
    { ...observe(), observed: observed().map(use => ({ ...use, use: "reused" as const, prior: { seq: 0, hash: use.observation.head.hash } })) },
    observe({ of: { ...MEMBERSHIP, inc: newIncarnation(new Uint8Array(16).fill(99)) } }),
    observe({ controllerActive: true }),
  ];
  for (const hand of cases) {
    const ledger = journey.make(), { publication, mint } = journey.reserve(ledger), before = ledger.head;
    const judgment = journey.offer(ledger, mint, token, hand);
    expect(judgment.result, JSON.stringify(hand)).not.toBe("write");
    expect(ledger.head).toEqual(before);
    expect(ledger.item(publication.id)).toMatchObject({ state: "reserved", values: { token: null } });
    expect(ledger.state.operation(mint)?.attempts[0]?.outcomes).toEqual([]);
  }
});

test("a mint for an already decided push or a receipt needs no D1 membership read", () => {
  const ledger = journey.make(), { publication, push, mint } = journey.reserve(ledger);
  journey.answer(ledger, push, { send: "accepted", seen: "f".repeat(40) });
  expect(ledger.item(publication.id).state).toBe("unresolved");
  journey.answer(ledger, mint, token);
  expect(opened(ledger).map(effect => effect.kind)).toEqual(["revoke"]);
  expect(ledger.last.input).not.toHaveProperty("observed");

  const other = journey.make(), next = journey.reserve(other);
  journey.answer(other, next.push, { send: "accepted", seen: next.publication.values["integration"]! });
  const receiptMint = `${other.head.seq}:1` as OperationId;
  journey.answer(other, receiptMint, token);
  expect(other.last.input).not.toHaveProperty("observed");
  expect(opened(other)).toEqual([]);
});

test("automatic file publication keeps its separate inherited mint journey without D1 key reads", () => {
  const ledger = journey.make();
  expect(journey.file(ledger).result).toBe("write");
  journey.answer(ledger, `${ledger.head.seq}:0`, { head: HEAD, present: true, tree: "d".repeat(40) });
  const publication = ledger.state.page("file-publication", ["reserved"], null, 1).items[0]!;
  const mint = `${ledger.head.seq}:1` as OperationId;
  journey.answer(ledger, mint, token);
  expect(ledger.item(publication.id)).toMatchObject({ state: "publishing", values: { token: mint } });
  expect(ledger.last.input).not.toHaveProperty("observed");
});

function checked(ledger: ReturnType<typeof journey.make>, reserved: ReturnType<typeof journey.reserve>, name: string, configuration: Digest, who: Actor, earlier?: FactRef) {
  const job = handMade(reserved.manifest.at, "request-check", [], keys.rita, { manifest: reserved.manifest.seq, name, configuration }, seq => [{ effect: "value", item: seq, slot: "tree", value: reserved.publication.values["tree"]! }]);
  journey.tell(ledger, "check-fence", { operation: factRefOf(reserved.merge) as unknown as FieldValue, job: factRefOf(job) as unknown as FieldValue, name, ...(earlier ? { earlier: earlier as unknown as FieldValue } : {}) }, [reserved.merge, job]);
  const result = handMade(reserved.manifest.at, "check", [], who, { job: job.seq, tree: reserved.publication.values["tree"]!, configuration, outcome: "passed" }, () => [{ effect: "state", item: job.seq, state: "passed" }]);
  if (result.input.type !== "act") throw Error("Scripted result is an act");
  result.input.authority = [grantFrom(retained(keyObserved(who, T0, { actions: ["change.check"] }), 10))];
  journey.tell(ledger, "checked", { operation: factRefOf(reserved.merge) as unknown as FieldValue, job: factRefOf(job) as unknown as FieldValue, result: factRefOf(result) as unknown as FieldValue }, [reserved.merge, job, result]);
  const judge = `${ledger.head.seq}:0` as OperationId;
  journey.answer(ledger, judge, { readAt: T0, current: true, job: factRefOf(job) as unknown as FieldValue, result: factRefOf(result) as unknown as FieldValue }, {
    observed: [retained(keyObserved(who, T0), 100 + ledger.head.seq)], observing: { membership: MEMBERSHIP },
  });
  return { job, result };
}

test("the actual post-reservation checker signer is refreshed at push mint, beyond the reservation's original observations", () => {
  const configuration = digestBytes(utf8("D1 scripted checker configuration"));
  const ledger = journey.make(), reserved = journey.reserve(ledger, { list: true, checks: [{ name: "unit", checker: keys.una.member.member, configuration, required: true }] });
  const { publication } = reserved;
  expect(ledger.state.operation(reserved.push)?.kind).toBe("reservation-stage");
  journey.answer(ledger, reserved.mint, token); // stage: deliberately exempt
  expect(ledger.last.input).not.toHaveProperty("observed");
  journey.answer(ledger, reserved.push, { send: "accepted", seen: publication.values["integration"]!, tree: publication.values["tree"]! });
  expect(opened(ledger).some(effect => effect.kind === "push")).toBe(false);
  const { result } = checked(ledger, reserved, "unit", configuration, keys.una);
  const mint = `${ledger.head.seq}:1` as OperationId;
  expect(ledger.state.operation(mint)?.kind).toBe("mint");
  expect(ledger.item(publication.id).values["passes"]).toMatchObject({ checks: [{ name: "unit", passed: true, proof: { key: keys.una.key, result: factRefOf(result), decided: ledger.head.seq } }] });
  journey.answer(ledger, mint, token, { observed: [retained(keyObserved(keys.rita, T0), 12), retained(keyObserved(keys.una, T0, { keyState: "retired" }), 13)], observing: { membership: MEMBERSHIP } });
  expect(ledger.item(publication.id).values["aborting"]).toBe(true);
  expect(ledger.item(publication.id).values["token"]).toBeNull();
  expect(ledger.last.input).toMatchObject({ observed: [{ observation: { key: keys.rita.key } }, { observation: { key: keys.una.key, keyState: "retired" } }] });
});

test("fencing an accepted current check removes its old signer until the replacement passes", () => {
  const configuration = digestBytes(utf8("D1 replacement checker configuration"));
  const ledger = journey.make(), reserved = journey.reserve(ledger, { list: true, checks: ["unit", "lint"].map(name => ({ name, checker: keys.una.member.member, configuration, required: true })) });
  journey.answer(ledger, reserved.mint, token);
  journey.answer(ledger, reserved.push, { send: "accepted", seen: reserved.publication.values["integration"]!, tree: reserved.publication.values["tree"]! });
  const first = checked(ledger, reserved, "unit", configuration, keys.una);
  const secret = new Uint8Array(32).fill(77), replacement: Actor = { ...keys.una, secret, key: keyIdOfSecret(secret) };
  checked(ledger, reserved, "unit", configuration, replacement, factRefOf(first.job));
  checked(ledger, reserved, "lint", configuration, replacement);
  expect(opened(ledger).map(effect => effect.kind), JSON.stringify({ effects: ledger.last.effects, publication: ledger.item(reserved.publication.id) })).toEqual(["push", "mint"]);
  const mint = `${ledger.head.seq}:1` as OperationId;
  journey.answer(ledger, mint, token, { observed: [retained(keyObserved(keys.rita, T0), 12), retained(keyObserved(replacement, T0), 13)], observing: { membership: MEMBERSHIP } });
  expect(ledger.item(reserved.publication.id).state).toBe("publishing");
  expect(ledger.last.input).toMatchObject({ observed: [{ observation: { key: keys.rita.key } }, { observation: { key: replacement.key } }] });
});

test.each(["relay-first", "gate-first"] as const)("%s opens only one abort read and revokes the one confirmed mint", order => {
  const ledger = journey.make(), { publication, mint } = journey.reserve(ledger);
  if (order === "relay-first") journey.compromised(ledger);
  journey.answer(ledger, mint, token, observe({ keyState: "compromised" }));
  if (order === "relay-first") expect(ledger.last.input).not.toHaveProperty("observed");
  if (order === "gate-first") journey.compromised(ledger);
  const operations = ledger.state.all().operations.filter(operation => operation.for === publication.id);
  expect(operations.filter(operation => operation.kind === "read")).toHaveLength(1);
  const revokes = operations.filter(operation => operation.kind === "revoke");
  expect(revokes).toHaveLength(1);
  expect(revokedToken(ledger.state, ledger.own, revokes[0]!)).toBe(token.token);
  expect(ledger.item(publication.id)).toMatchObject({ state: "reserved", values: { aborting: true, token: null } });
});

test("first-head and reservation-delete mints ignore inactive D1 standing and keep their inherited authority journeys", () => {
  const first = journey.make(false, false);
  const mint = first.state.all().operations.find(operation => operation.kind === "mint")!;
  journey.answer(first, mint.id, token, observe({ keyState: "compromised" }));
  expect(first.last.input).not.toHaveProperty("observed");
  expect(first.item(0).values["token"]).toBe(mint.id);

  const ledger = journey.make(), reserved = journey.reserve(ledger, { list: true });
  journey.answer(ledger, reserved.mint, token);
  journey.answer(ledger, reserved.push, { send: "accepted", seen: reserved.publication.values["integration"]!, tree: reserved.publication.values["tree"]! });
  const push = openingId(ledger, "push"), pushMint = openingId(ledger, "mint");
  journey.answer(ledger, pushMint, token, observe());
  journey.answer(ledger, push, { send: "accepted", seen: reserved.publication.values["integration"]! });
  const receiptSeq = ledger.head.seq;
  const receipt = openingId(ledger, "receipt"), receiptMint = openingId(ledger, "mint");
  journey.answer(ledger, receiptMint, token, observe({ keyState: "compromised" }));
  expect(ledger.last.input).not.toHaveProperty("observed");
  journey.answer(ledger, receipt, { send: "accepted", seen: destinationReceipt(ledger.state, ledger.own, ledger.item(receiptSeq), "sha1").commit });
  const deletionMint = openingId(ledger, "mint");
  expect(ledger.state.operation(openingId(ledger, "reservation-delete"))?.kind).toBe("reservation-delete");
  journey.answer(ledger, deletionMint, token, observe({ keyState: "compromised" }));
  expect(ledger.last.input).not.toHaveProperty("observed");
  expect(ledger.item(reserved.publication.id).values["token"]).toBe(deletionMint);
});

test("unreadable native own reservation provenance leaves mint undecided before any fresh key can make it active", () => {
  const ledger = journey.make(), { mint } = journey.reserve(ledger), before = ledger.head;
  expect(journey.offer(ledger, mint, token, { ...observe(), own: () => null }).result).not.toBe("write");
  expect(ledger.head).toEqual(before);
  expect(ledger.state.operation(mint)?.attempts[0]?.outcomes).toEqual([]);
});

test("a counted approving verdict joins the merger in the fresh mint gate", () => {
  const ledger = journey.make(), { publication, mint } = journey.reserve(ledger, { approver: keys.una });
  expect(ledger.item(publication.id).values["passes"]).toMatchObject({ base: { approvals: [{ key: keys.una.key }] } });
  journey.answer(ledger, mint, token, { observed: [retained(keyObserved(keys.rita, T0), 10), retained(keyObserved(keys.una, T0, { keyState: "retired" }), 11)], observing: { membership: MEMBERSHIP } });
  expect(ledger.item(publication.id)).toMatchObject({ state: "reserved", values: { aborting: true, token: null } });
});

test.each([8, 9])("%i accepted checker keys plus the merger produce a complete nine-key gate or an unwritten ten-key mint", count => {
  const configuration = digestBytes(utf8("D1 bounded complete checker set"));
  const checks = Array.from({ length: count }, (_, n) => ({ name: `check-${n}`, configuration, checker: keys.una.member.member, required: true }));
  const ledger = journey.make(), reserved = journey.reserve(ledger, { list: true, checks });
  journey.answer(ledger, reserved.mint, token);
  journey.answer(ledger, reserved.push, { send: "accepted", seen: reserved.publication.values["integration"]!, tree: reserved.publication.values["tree"]! });
  const signers = checks.map((check, n) => {
    const secret = new Uint8Array(32).fill(100 + n), who: Actor = { ...keys.una, secret, key: keyIdOfSecret(secret) };
    checked(ledger, reserved, check.name, configuration, who);
    return who;
  });
  const mint = openingId(ledger, "mint"), before = ledger.head;
  const judgment = journey.offer(ledger, mint, token, { observed: [keys.rita, ...signers].map((who, n) => retained(keyObserved(who, T0), 1000 + n)), observing: { membership: MEMBERSHIP } });
  if (count === 8) {
    expect(judgment.result).toBe("write");
    expect(ledger.item(reserved.publication.id).state).toBe("publishing");
    expect(ledger.last.input).toMatchObject({ observed: [keys.rita, ...signers].map(who => ({ observation: { key: who.key } })) });
  } else {
    expect(judgment.result).not.toBe("write");
    expect(ledger.head).toEqual(before);
    expect(ledger.state.operation(mint)?.attempts[0]?.outcomes).toEqual([]);
    expect(ledger.item(reserved.publication.id)).toMatchObject({ state: "reserved", values: { aborting: false, token: null } });
  }
});

});
