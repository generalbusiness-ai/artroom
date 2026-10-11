import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import type { FieldValue, MemberRef, SignedIntent } from "@generalbusiness/artroom-contract";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import { canonicalize, definitionDigest, keyIdOfSecret, parseStrict } from "@generalbusiness/artroom-bytes";
import { judgeTimed, nextDue, owed, prepareRules, validateDefinition } from "@generalbusiness/artroom-derive";
import { evaluateRules, RULE_PROFILES } from "@generalbusiness/artroom-derive/rule";
import { founded, grantOf, keys, Ledger, on, t, valid, type Actor } from "@generalbusiness/artroom-derive/testing";
import { countingCommitments, countingCommitmentsClosure } from "./commitments.ts";
import { COUNTING_COMMITMENTS_DEFINITION } from "./commitments-pin.ts";

// Authored pure witnesses, not native enrollment/DO/transport/audio evidence.
// The real evaluator/judges/seal/fold use scripted current grants and memory.
const make = (target = 100) => {
  const s = founded(valid(validateDefinition(countingCommitments, PROPOSED_BOUNDS, RULE_PROFILES)), { opener: keys.rita.member, target });
  s.did(keys.rita, "initialize", { expected: { configuration: s.item(0).revision } });
  return s;
};
const board = (s: Ledger) => s.state.page("board", ["paused", "open", "finished"], null, 1).items[0]!;
const active = (s: Ledger) => s.state.page("participant", ["active"], null, 16).items
  .map(p => ({ id: p.id, member: p.parties["agent"] as FieldValue }));
const promise = (s: Ledger) => s.state.page("promise", ["pledged"], null, 1).items[0]!;
const claimFields = (s: Ledger, participant: number): Record<string, FieldValue> => ({ participant, basis: active(s),
  generation: board(s).values["generation"]!, serial: Number(board(s).values["serial"]) + 1, n: Number(board(s).values["lastNumber"]) + 1 });
const resolution = (s: Ledger, id = promise(s).id): Record<string, FieldValue> => {
  const v = s.item(id).values; return { generation: v["generation"]!, serial: v["serial"]!, n: v["n"]! };
};
function preparedIntent(s: Ledger, who: Actor, kind: string, fields: Record<string, FieldValue> = {}, item = board(s).id): SignedIntent {
  const also: Record<string, number> = {};
  if (["commit", "fulfill", "fail", "cancel"].includes(kind)) also["board"] = board(s).id;
  if (kind === "commit") also["participant"] = fields["participant"] as number;
  if (["initialize", "force-deactivate", "remove-participant"].includes(kind)) also["configuration"] = 0;
  const opening = kind === "initialize" || kind === "participate" || kind === "commit";
  return s.intent(who, kind, { ...(opening ? { expected: Object.fromEntries(Object.entries(also).map(([name, id]) => [name, s.item(id).revision])) } : on(s, item, also)), fields });
}
async function send(s: Ledger, signed: SignedIntent, who?: Actor) {
  const context = who ? s.context({ grants: [{ grant: grantOf(who, s.at, Object.values(countingCommitments.acts).map(a => a.grant)), current: true }] }) : s.context();
  const prepared = await evaluateRules(prepareRules(s.state, s.definition, { act: signed, context }));
  return s.submit(signed, { prepared, ...(who ? { grants: context.grants } : {}) });
}
const act = (s: Ledger, who: Actor, kind: string, fields: Record<string, FieldValue> = {}, item = board(s).id) => send(s, preparedIntent(s, who, kind, fields, item), who);
async function wrote(answer: ReturnType<typeof act>) { const result = await answer; expect(result.result, JSON.stringify(result)).toBe("write"); }
async function participate(s: Ledger, who: Actor) { await wrote(act(s, who, "participate")); return s.last.seq; }
async function activate(s: Ledger, who: Actor) { const id = await participate(s, who); await wrote(act(s, who, "activate", {}, id)); return id; }

const refold = (s: Ledger) => expect(s.replay().snapshot()).toBe(s.state.snapshot());

test("commitments declaration has a distinct exact canonical pin and finite own-item timer/settlement closure", () => {
  const checked = validateDefinition(countingCommitments, PROPOSED_BOUNDS, RULE_PROFILES);
  expect(checked.ok ? [] : checked.problems).toEqual([]);
  expect(countingCommitmentsClosure).toEqual([countingCommitments]);
  expect(Object.keys(countingCommitments.acts)).toHaveLength(14);
  const bytes = readFileSync(new URL("./commitments.json", import.meta.url));
  expect(bytes).toEqual(Buffer.from(canonicalize(countingCommitments) + "\n"));
  expect(parseStrict(bytes.toString("utf8"))).toEqual(countingCommitments);
  expect(definitionDigest(countingCommitments)).toBe(COUNTING_COMMITMENTS_DEFINITION);
  expect(COUNTING_COMMITMENTS_DEFINITION).not.toBe("sha256:435d9f5745048183d3cf0392ce909cd76909fd69ee368dfc57e142ba96af1d09");
  if (checked.ok) {
    expect(checked.definition.digest).toBe(COUNTING_COMMITMENTS_DEFINITION);
    expect(checked.definition.deadlines).toEqual({ board: { open: 1 }, promise: { pledged: 1 } });
    expect(checked.definition.pending["promise"]?.["pledged"]).toBeGreaterThanOrEqual(1);
    expect(checked.definition.clauseEntries).toBe(0);
  }
});

test("competing complete claims leave one pledge; fulfilled numbers, activity and anti-consecutive fairness refold", async () => {
  const s = make(3), a = await activate(s, keys.una), b = await activate(s, keys.vic), c = await activate(s, keys.paul);
  await wrote(act(s, keys.rita, "start"));
  expect(await act(s, keys.vic, "start")).toMatchObject({ result: "refused" }); // Broad scripted control grant is not controller ownership.
  const fields = claimFields(s, a);
  expect(await act(s, keys.una, "commit", { ...fields, basis: active(s).reverse() })).toMatchObject({ result: "refused" });
  expect(await act(s, keys.una, "commit", { ...fields, basis: active(s).map((p, i) => i === 0 ? { ...p, member: keys.rita.member } : p) })).toMatchObject({ result: "refused" });
  const winner = preparedIntent(s, keys.una, "commit", fields);
  const competitor = preparedIntent(s, keys.vic, "commit", claimFields(s, b));
  await wrote(send(s, winner));
  const held = promise(s), admitted = s.fact(held.id);
  expect(await send(s, competitor)).toMatchObject({ result: "refused", reason: "revision-moved" });
  expect(s.state.count("promise", "pledged")).toBe(1);
  expect([held.parties["agent"], held.refs["participant"], held.refs["admittedAt"], board(s).refs["pledge"], board(s).values["lastNumber"]]).toEqual([keys.una.member, a, held.id, held.id, 0]);
  expect(admitted.at).toEqual(s.at); // Full fact is derived from this sealed admission, not a JSON field.
  const d = await activate(s, keys.sam);
  expect(s.item(held.id).values["basis"]).toEqual(fields["basis"]); // New activity affects future claims, not this pledge.
  expect(await act(s, keys.una, "deactivate", {}, a)).toMatchObject({ result: "refused" });
  expect(await act(s, keys.rita, "force-deactivate", {}, a)).toMatchObject({ result: "refused" });
  const completion = preparedIntent(s, keys.una, "fulfill", resolution(s), held.id);
  expect(await act(s, keys.vic, "fulfill", resolution(s), held.id)).toMatchObject({ result: "refused" });
  await wrote(send(s, completion));
  expect(await send(s, completion)).toMatchObject({ result: "accepted-before" });
  expect([s.item(held.id).state, board(s).state, board(s).values["lastNumber"], board(s).parties["lastSpeaker"], board(s).refs["pledge"]]).toEqual(["fulfilled", "open", 1, keys.una.member, null]);
  expect(await act(s, keys.una, "commit", claimFields(s, a))).toMatchObject({ result: "refused" });
  await wrote(act(s, keys.una, "deactivate", {}, a));
  await wrote(act(s, keys.rita, "force-deactivate", {}, c));
  await wrote(act(s, keys.rita, "remove-participant", {}, c));
  await wrote(act(s, keys.sam, "deactivate", {}, d));
  await wrote(act(s, keys.vic, "commit", claimFields(s, b)));
  const second = promise(s).id; await wrote(act(s, keys.vic, "fulfill", resolution(s), second));
  // The only active participant can promise again without inventing a scheduler.
  await wrote(act(s, keys.vic, "commit", claimFields(s, b)));
  const third = promise(s).id; await wrote(act(s, keys.vic, "fulfill", resolution(s), third));
  expect([board(s).state, board(s).values["lastNumber"], board(s).refs["pledge"], board(s).values["until"]]).toEqual(["finished", 3, null, null]);
  expect(await act(s, keys.rita, "initialize", {}, 0)).toMatchObject({ result: "refused" });
  await wrote(act(s, keys.rita, "reset", { generation: 1 }));
  expect([board(s).state, board(s).values["generation"], board(s).values["serial"], board(s).values["lastNumber"], board(s).parties["lastSpeaker"], board(s).refs["lastFulfilledAt"]]).toEqual(["paused", 1, 0, 0, null, null]);
  expect(s.item(b).state).toBe("active"); expect(s.item(c).state).toBe("removed");
  expect(s.state.count("promise", "fulfilled")).toBe(3); refold(s);
});

test("failure, cancellation and paired board-first expiry fence old callbacks and retain separate obligations", async () => {
  const s = make(), a = await activate(s, keys.una), b = await activate(s, keys.vic);
  await wrote(act(s, keys.rita, "start")); await wrote(act(s, keys.una, "commit", claimFields(s, a)));
  const failed = promise(s).id, late = preparedIntent(s, keys.una, "fulfill", resolution(s), failed);
  await wrote(act(s, keys.una, "fail", { ...resolution(s), reason: "speech-uncertain" }, failed));
  expect([board(s).state, board(s).values["lastNumber"], s.item(failed).state, s.item(failed).values["reason"]]).toEqual(["paused", 0, "failed", "speech-uncertain"]);
  await wrote(act(s, keys.rita, "start")); await wrote(act(s, keys.vic, "commit", claimFields(s, b)));
  const cancelled = promise(s).id;
  expect(await send(s, late)).toMatchObject({ result: "refused" });
  expect(await act(s, keys.una, "cancel", resolution(s), cancelled)).toMatchObject({ result: "refused" });
  await wrote(act(s, keys.rita, "cancel", resolution(s), cancelled));
  await wrote(act(s, keys.rita, "start")); await wrote(act(s, keys.una, "commit", claimFields(s, a)));
  const expired = promise(s).id, deadline = s.item(expired).values["until"];
  expect(board(s).values["until"]).toBe(deadline);
  expect(owed(s.state, s.definition, s.last.input)).toBeGreaterThanOrEqual(3); // Both deadlines plus closing checkpoint; settlement may reserve more.
  s.now = t(30);
  const wrong = judgeTimed(s.state, s.definition, { item: expired, rule: "promise-expired", due: deadline as never }, s.context());
  expect(wrong).toEqual({ result: "dropped", failed: "next" }); // Negative input; never seal a fabricated reverse native history.
  const first = nextDue(s.state, s.definition, s.now)!;
  expect([first.item, first.rule]).toEqual([board(s).id, "commitment-expired"]);
  const boardExpiry = judgeTimed(s.state, s.definition, first, s.context());
  expect(boardExpiry.result).toBe("write"); if (boardExpiry.result !== "write") throw new Error("No board expiry");
  s.seal(boardExpiry.draft);
  expect([board(s).state, board(s).refs["pledge"], s.item(expired).state]).toEqual(["paused", null, "pledged"]);
  expect(await act(s, keys.rita, "start")).toMatchObject({ result: "due" });
  expect(await act(s, keys.vic, "commit", claimFields(s, b))).toMatchObject({ result: "due" });
  expect(s.drain().map(j => j.result)).toEqual(["write"]);
  expect([s.item(expired).state, board(s).state, board(s).values["lastNumber"]]).toEqual(["expired", "paused", 0]);
  await wrote(act(s, keys.una, "deactivate", {}, a)); await wrote(act(s, keys.una, "activate", {}, a));
  await wrote(act(s, keys.rita, "reset", { generation: 1 })); await wrote(act(s, keys.rita, "start"));
  await wrote(act(s, keys.una, "commit", claimFields(s, a)));
  expect(await act(s, keys.una, "fulfill", resolution(s, expired), expired)).toMatchObject({ result: "refused" });
  await wrote(act(s, keys.rita, "cancel", resolution(s), promise(s).id));
  await wrote(act(s, keys.rita, "start")); await wrote(act(s, keys.rita, "pause")); refold(s);
});

test("live participant cap and exact ownership survive removal, re-entry and non-controller requests", async () => {
  const s = make();
  const actors: Actor[] = Array.from({ length: 17 }, (_, i) => {
    const secret = new Uint8Array(32).fill(i + 20);
    return { secret, key: keyIdOfSecret(secret), member: { membership: keys.rita.member.membership, member: `@member${i}` as MemberRef["member"] }, principal: null };
  });
  const ids: number[] = [];
  for (const who of actors.slice(0, 16)) ids.push(await participate(s, who));
  expect(s.state.count("participant", "inactive")).toBe(16);
  expect(await act(s, actors[0]!, "participate")).toMatchObject({ result: "refused" });
  expect(await act(s, actors[16]!, "participate")).toMatchObject({ result: "refused", reason: "type-full" });
  expect(await act(s, actors[1]!, "activate", {}, ids[0]!)).toMatchObject({ result: "refused" });
  expect(await act(s, actors[1]!, "remove-participant", {}, ids[0]!)).toMatchObject({ result: "refused" });
  await wrote(act(s, actors[0]!, "activate", {}, ids[0]!));
  expect(await act(s, keys.rita, "remove-participant", {}, ids[0]!)).toMatchObject({ result: "refused" });
  await wrote(act(s, keys.rita, "force-deactivate", {}, ids[0]!));
  await wrote(act(s, keys.rita, "remove-participant", {}, ids[0]!));
  const again = await participate(s, actors[0]!);
  expect(again).not.toBe(ids[0]); expect(s.item(ids[0]!).state).toBe("removed");
  expect(s.state.count("participant", "inactive")).toBe(16);
  expect(await act(s, keys.vic, "reset", { generation: 1 })).toMatchObject({ result: "refused" });
  await wrote(act(s, keys.rita, "start")); // No active participant: open waits, without a promise.
  expect(s.state.count("promise", "pledged")).toBe(0);
  await wrote(act(s, keys.rita, "pause")); refold(s);
});
