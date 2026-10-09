import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import type { FieldValue, SignedIntent } from "@generalbusiness/artroom-contract";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import { definitionDigest, parseStrict } from "@generalbusiness/artroom-bytes";
import { prepareRules, validateDefinition } from "@generalbusiness/artroom-derive";
import { evaluateRules, RULE_PROFILES } from "@generalbusiness/artroom-derive/rule";
import { founded, keys, Ledger, on, t, valid, type Actor } from "@generalbusiness/artroom-derive/testing";
import { counting, countingClosure } from "./definition.ts";
import { COUNTING_DEFINITION } from "./pin.ts";

// Real validator, expression evaluator, judge and fold. Ledger supplies scripted
// current grants: this is not enrollment, DO commits, transport recovery or audio.
const make = (target = 100): Ledger => {
  const s = founded(valid(validateDefinition(counting, PROPOSED_BOUNDS, RULE_PROFILES)), { opener: keys.rita.member, target });
  s.did(keys.rita, "initialize", { expected: { configuration: s.item(0).revision } });
  return s;
};
const board = (s: Ledger) => s.state.page("board", ["paused", "running", "finished"], null, 1).items[0]!;
const basis = (s: Ledger, except?: number) => s.state.page("participant", ["joined"], null, 8).items
  .filter(p => p.id !== except).map(p => ({ id: p.id, member: p.parties["agent"] as FieldValue }));
async function send(s: Ledger, signed: SignedIntent) {
  const prepared = await evaluateRules(prepareRules(s.state, s.definition, { act: signed, context: s.context() }));
  return s.submit(signed, { prepared });
}
async function act(s: Ledger, who: Actor, kind: string, fields: Record<string, FieldValue> = {}, item = board(s).id) {
  const also:Record<string,number> = kind === "leave" || kind === "cancel-turn" ? { board: board(s).id } : {};
  if (typeof fields["next"] === "number") also["next"] = fields["next"];
  return send(s, s.intent(who, kind, { ...(kind === "join" ? {} : on(s, item, also)), fields }));
}
async function joined(s: Ledger, who: Actor): Promise<number> {
  expect((await act(s, who, "join", {}, 0)).result).toBe("write");
  return s.last.seq;
}
function startFields(s: Ledger, next: number): Record<string, FieldValue> {
  return { n: Number(board(s).values["lastNumber"]) + 1,
    nextSerial: Number(board(s).values["serial"]) + 1, basis: basis(s), next };
}
function spokenFields(s: Ledger, next: number): Record<string, FieldValue> {
  const b = board(s).values;
  const n = Number(b["number"]), target = Number(b["target"]);
  return { generation: b["generation"]!, serial: b["serial"]!, n,
    nextN: Math.min(n + 1, target), nextSerial: Number(b["serial"]) + 1, basis: basis(s), next };
}
function leaveFields(s: Ledger, item: number, next?: number): Record<string, FieldValue> {
  const b = board(s).values;
  return { generation: b["generation"]!, serial: b["serial"]!,
    nextSerial: Number(b["serial"]) + 1, basis: basis(s, item), replace: basis(s, item).length > 0, ...(next === undefined ? {} : { next }) };
}
const wrote = async (outcome: ReturnType<typeof act>) => { const result = await outcome; expect(result.result, JSON.stringify(result)).toBe("write"); };

test("the complete closure validates with actual rule grammar and canonical definition bytes", () => {
  expect(countingClosure).toEqual([counting]);
  const checked = validateDefinition(counting, PROPOSED_BOUNDS, RULE_PROFILES);
  expect(checked.ok ? [] : checked.problems).toEqual([]);
  expect(parseStrict(readFileSync(new URL("./definition.json", import.meta.url), "utf8").trimEnd())).toEqual(counting);
  if (checked.ok) expect(checked.definition.digest).toBe(COUNTING_DEFINITION);
  expect(definitionDigest(counting)).toBe(COUNTING_DEFINITION);
});

test("three then four members follow native join order; exact reports preserve sequence and reject stale or forged successors", async () => {
  const s = make(5), a = await joined(s, keys.una), b = await joined(s, keys.vic), c = await joined(s, keys.paul);
  expect(s.grants().some(p => p.current && p.grant.key === keys.vic.key && p.grant.actions.includes("counting.control"))).toBe(true);
  expect(await act(s, keys.vic, "start", startFields(s, a))).toMatchObject({result:"refused",reason:"guard-failed"});
  expect(await act(s, keys.una, "join")).toMatchObject({result:"refused",reason:"guard-failed"});
  expect(basis(s).map(p => p.id)).toEqual([a, b, c]);
  await wrote(act(s, keys.rita, "start", startFields(s, a)));
  const first = s.intent(keys.una, "spoken", { ...on(s, board(s).id,{next:b}), fields: spokenFields(s, b) });
  expect((await send(s, s.intent(keys.vic, "spoken", { ...on(s, board(s).id,{next:b}), fields: spokenFields(s, b) }))).result).toBe("refused");
  expect((await send(s, first)).result).toBe("write");
  expect(board(s).values["lastNumber"]).toBe(1);
  expect((await send(s, first)).result).toBe("accepted-before");
  const stale = { ...first.intent.fields };
  expect((await act(s, keys.una, "spoken", stale)).result).toBe("refused");
  const heldTurn = { basis: board(s).values["basis"], number: board(s).values["number"], serial: board(s).values["serial"], speaker: board(s).parties["speaker"] };
  const d = await joined(s, keys.sam);
  expect({ basis: board(s).values["basis"], number: board(s).values["number"], serial: board(s).values["serial"], speaker: board(s).parties["speaker"] }).toEqual(heldTurn);
  const good = spokenFields(s, c);
  const forgedMembers = basis(s).map((row, i) => i === 0 ? { ...row, member: keys.rita.member } : row);
  expect(await act(s, keys.vic, "spoken", { ...good, basis: forgedMembers })).toMatchObject({result:"refused",reason:"guard-failed"});
  expect((await act(s, keys.vic, "spoken", { ...good, basis: basis(s).reverse(), next: b })).result).toBe("refused");
  expect((await act(s, keys.vic, "spoken", { ...good, n: 3 })).result).toBe("refused");
  await wrote(act(s, keys.vic, "spoken", good));
  await wrote(act(s, keys.paul, "spoken", spokenFields(s, d)));
  await wrote(act(s, keys.sam, "spoken", spokenFields(s, a)));
  await wrote(act(s, keys.una, "spoken", spokenFields(s, a)));
  expect([board(s).state, board(s).values["lastNumber"], board(s).parties["lastSpeaker"]]).toEqual(["finished", 5, keys.una.member]);
  expect([board(s).parties["speaker"], board(s).values["basis"], board(s).values["number"]]).toEqual([null, null, null]);
  expect(s.entries.filter(e => e.entry.input.type === "act" && e.entry.input.signed.intent.kind === "spoken")
    .map(e => e.entry.input.type === "act" ? e.entry.input.signed.intent.fields["n"] : null)).toEqual([1, 2, 3, 4, 5]);
  expect(s.replay().snapshot()).toBe(s.state.snapshot());
});

test("departures cancel only the current turn, preserve the same number, and empty next binding pauses safely", async () => {
  const s = make(), a = await joined(s, keys.una), b = await joined(s, keys.vic), c = await joined(s, keys.paul);
  const d = await joined(s, keys.sam);
  await wrote(act(s, keys.rita, "start", startFields(s, a)));
  await wrote(act(s, keys.una, "spoken", spokenFields(s, b)));
  const old = spokenFields(s, c), serial = board(s).values["serial"];
  await wrote(act(s, keys.paul, "leave", leaveFields(s, c, b), c));
  expect([board(s).values["lastNumber"], board(s).values["number"], board(s).values["serial"], board(s).parties["speaker"]]).toEqual([1, 2, serial, keys.vic.member]);
  // With lastNumber=1 and remaining [a,d], index 1 selects d, not a.
  expect((await act(s, keys.vic, "leave", leaveFields(s, b, a), b)).result).toBe("refused");
  await wrote(act(s, keys.vic, "leave", leaveFields(s, b, d), b));
  expect([board(s).values["lastNumber"], board(s).values["number"], board(s).parties["speaker"]]).toEqual([1, 2, keys.sam.member]);
  expect((await act(s, keys.vic, "spoken", old)).result).toBe("refused");
  expect(s.grants().some(p => p.current && p.grant.key === keys.vic.key && p.grant.actions.includes("counting.control"))).toBe(true);
  expect(await act(s, keys.vic, "cancel-turn", { ...leaveFields(s, d, a), reason: "disconnect" }, d)).toMatchObject({result:"refused",reason:"guard-failed"});
  await wrote(act(s, keys.rita, "cancel-turn", { ...leaveFields(s, d, a), reason: "disconnect" }, d));
  expect([board(s).values["number"], board(s).parties["speaker"]]).toEqual([2, keys.una.member]);
  await wrote(act(s, keys.una, "leave", leaveFields(s, a), a));
  expect([board(s).state, board(s).values["lastNumber"], board(s).parties["speaker"], basis(s)]).toEqual(["paused", 1, null, []]);
  const one = await joined(s, keys.una);
  await wrote(act(s, keys.rita, "start", startFields(s, one)));
  await wrote(act(s, keys.una, "leave", leaveFields(s, one), one));
  expect([board(s).state, board(s).values["basis"], board(s).values["until"]]).toEqual(["paused", null, null]);
  expect((await act(s, keys.rita, "start", { n: 1, nextSerial: 20, basis: [] })).result).toBe("refused");
  expect(s.replay().snapshot()).toBe(s.state.snapshot());
});

test("the same completion can correct a known roster refusal; pause, reset and expiry fence late reports", async () => {
  const s = make(), a = await joined(s, keys.una), b = await joined(s, keys.vic);
  await wrote(act(s, keys.rita, "start", startFields(s, a)));
  const completed = spokenFields(s, b);
  const c = await joined(s, keys.paul);
  expect((await act(s, keys.una, "spoken", completed)).result).toBe("refused");
  const corrected = { ...spokenFields(s, b), generation: completed["generation"]!, serial: completed["serial"]!, n: completed["n"]! };
  await wrote(act(s, keys.una, "spoken", corrected));
  expect(board(s).values["lastNumber"]).toBe(1);
  const late = spokenFields(s, c);
  await wrote(act(s, keys.rita, "pause", { nextSerial: Number(board(s).values["serial"]) + 1 }));
  await wrote(act(s, keys.rita, "start", startFields(s, b)));
  expect((await act(s, keys.vic, "spoken", late)).result).toBe("refused");
  expect(s.grants().some(p => p.current && p.grant.key === keys.vic.key && p.grant.actions.includes("counting.control"))).toBe(true);
  expect(await act(s, keys.vic, "reset", { generation: 1 })).toMatchObject({result:"refused",reason:"guard-failed"});
  await wrote(act(s, keys.rita, "reset", { generation: 1 }));
  await wrote(act(s, keys.rita, "start", startFields(s, a)));
  expect((await act(s, keys.una, "spoken", corrected)).result).toBe("refused");
  const expired = spokenFields(s, b);
  s.now = t(15);
  expect((await act(s, keys.una, "spoken", expired)).result).toBe("due");
  expect(s.drain().map(j => j.result)).toEqual(["write"]);
  expect([board(s).state, board(s).values["lastNumber"], board(s).parties["speaker"]]).toEqual(["paused", 0, null]);
  const restored = s.replay();
  expect(restored.snapshot()).toBe(s.state.snapshot());
  expect((await act(s, keys.una, "spoken", expired)).result).toBe("refused");
});
