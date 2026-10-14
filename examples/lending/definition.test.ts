import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { PROPOSED_BOUNDS } from "@generalbusiness/dap-contract";
import { canonicalize, definitionDigest, parseStrict } from "@generalbusiness/artroom-bytes";
import { validateDefinition } from "@generalbusiness/dap-derive";
import { RULE_PROFILES } from "@generalbusiness/dap-derive/rule";
import { fields, founded, grantOf, keys, on, valid, type Actor, type Ledger } from "@generalbusiness/dap-derive/testing";
import { lending, lendingClosure } from "./definition.ts";
import { LENDING_DEFINITION } from "./pin.ts";

// Pure witnesses: the real validator, judges, seal and fold, in memory.
// Grants are scripted (a STAND-IN for membership); no scope object, session or page runs here.
const neighbour = keys.rita, nasruddin = keys.una, passerby = keys.vic;
const make = () => founded(valid(validateDefinition(lending, PROPOSED_BOUNDS, RULE_PROFILES)), { opener: neighbour.member });
/** The grants the room gives: the neighbour is staff and a member, everyone else a member. */
const room = (s: Ledger) => ({ grants: [neighbour, nasruddin, passerby].map((who) => ({
  grant: grantOf(who, s.at, who === neighbour ? ["lending.member", "lending.staff"] : ["lending.member"]), current: true })) });
const donate = (s: Ledger, who: Actor, name: string, description: string): number => {
  const judgment = s.act(who, "donate", fields({ name, description }), room(s));
  expect(judgment.result, JSON.stringify(judgment)).toBe("write");
  return s.last.seq;
};
const act = (s: Ledger, who: Actor, kind: string, thing: number, given: Record<string, string> = {}) =>
  s.act(who, kind, { ...on(s, thing), fields: given }, room(s));
const wrote = (judgment: ReturnType<typeof act>) => expect(judgment.result, JSON.stringify(judgment)).toBe("write");
const refold = (s: Ledger) => expect(s.replay().snapshot()).toBe(s.state.snapshot());

test("the lending declaration is exactly its canonical bytes and pin, and uses no rule, send, handler, deadline or capability", () => {
  const checked = validateDefinition(lending, PROPOSED_BOUNDS, RULE_PROFILES);
  expect(checked.ok ? [] : checked.problems).toEqual([]);
  expect(lendingClosure).toEqual([lending]);
  const bytes = readFileSync(new URL("./definition.json", import.meta.url));
  expect(bytes).toEqual(Buffer.from(canonicalize(lending) + "\n"));
  expect(parseStrict(bytes.toString("utf8"))).toEqual(lending);
  expect(definitionDigest(lending)).toBe(LENDING_DEFINITION);
  if (checked.ok) expect(checked.definition.digest).toBe(LENDING_DEFINITION);
  expect([lending.capabilities, lending.receives, lending.timed, lending.rules]).toEqual([[], {}, {}, {}]);
  expect(Object.values(lending.acts).flatMap((a) => a.sends)).toEqual([]);
});

test("Nasruddin and the pot: nine steps, two refusals, and the record refolds to the same state", () => {
  const s = make();
  expect(s.item(0)).toMatchObject({ type: "library", state: "open", parties: { founder: neighbour.member } });

  // 1 to 3: the neighbour donates the big pot; Nasruddin borrows it and returns it.
  const big = donate(s, neighbour, "Big pot", "A heavy copper pot. Holds eight litres.");
  wrote(act(s, nasruddin, "borrow", big));
  expect(s.item(big)).toMatchObject({ state: "lent", parties: { donor: neighbour.member, borrower: nasruddin.member } });
  // A second borrow of a lent thing is refused by its guard.
  expect(act(s, passerby, "borrow", big)).toMatchObject({ result: "refused", reason: "guard-failed" });
  wrote(act(s, nasruddin, "return", big));
  expect(s.item(big).state).toBe("available");
  expect(s.item(big).parties["borrower"]).toBeNull();

  // 4: the small pot is not a thing in the library. No item has that name, so a return has nothing to name.
  const things = () => s.state.page("thing", ["available", "lent", "gone"], null, 64).items;
  expect(things().map((thing) => thing.values["name"])).toEqual(["Big pot"]);

  // 5: Nasruddin donates it, in his own words. The scope does not judge the description.
  const small = donate(s, nasruddin, "Small pot", "Baby born when the big pot was with me");
  expect(s.item(small)).toMatchObject({ state: "available", parties: { donor: nasruddin.member },
    values: { name: "Small pot", description: "Baby born when the big pot was with me" } });

  // 6 to 8: he borrows the big pot again and says it died. Only staff cancel.
  wrote(act(s, nasruddin, "borrow", big));
  const before = s.state.snapshot();
  expect(act(s, nasruddin, "cancel", big, { reason: "The pot died" })).toMatchObject({ result: "refused", reason: "unauthorized" });
  expect(s.state.snapshot()).toBe(before);
  wrote(act(s, neighbour, "cancel", big, { reason: "Nasruddin says the pot died" }));
  expect(s.item(big)).toMatchObject({ state: "gone", values: { reason: "Nasruddin says the pot died" } });
  expect(s.item(big).parties["borrower"]).toBeNull();
  expect(s.last.input).toMatchObject({ type: "act", signed: { intent: { actor: neighbour.key, kind: "cancel", fields: { reason: "Nasruddin says the pot died" } } } });

  // 9: the shelf is replenished.
  const fresh = donate(s, neighbour, "New big pot", "Copper, eight litres.");
  expect(things().map((thing) => [thing.id, thing.state])).toEqual([[big, "gone"], [small, "available"], [fresh, "available"]]);
  // A refused act wrote no entry: the journal is the genesis and the seven acts that took effect.
  expect(s.entries.map(({ entry }) => entry.input.type === "act" ? entry.input.signed.intent.kind : entry.input.type))
    .toEqual(["genesis", "donate", "borrow", "return", "donate", "borrow", "cancel", "donate"]);
  refold(s);
});

test("anyone may return a lent thing, and no act changes a thing that is gone", () => {
  const s = make();
  const ladle = donate(s, neighbour, "Ladle", "Steel.");
  // Only a lent thing can be returned.
  expect(act(s, nasruddin, "return", ladle)).toMatchObject({ result: "refused", reason: "guard-failed" });
  wrote(act(s, nasruddin, "borrow", ladle));
  wrote(act(s, passerby, "return", ladle));
  expect(s.item(ladle).state).toBe("available");
  // A member may borrow what they donated; staff may cancel a thing on the shelf.
  wrote(act(s, neighbour, "borrow", ladle));
  wrote(act(s, neighbour, "return", ladle));
  wrote(act(s, neighbour, "cancel", ladle, { reason: "Lost" }));
  const gone = s.state.snapshot();
  for (const [who, kind, given] of [[nasruddin, "borrow", {}], [nasruddin, "return", {}], [neighbour, "cancel", { reason: "Again" }]] as const)
    expect(act(s, who, kind, ladle, given)).toMatchObject({ result: "refused" });
  expect(s.state.snapshot()).toBe(gone);
  refold(s);
});

test("the library holds 64 live things: the 65th donation is refused until a thing is cancelled", () => {
  const s = make();
  const first = donate(s, neighbour, "Thing 1", "One of many.");
  for (let n = 2; n <= 64; n++) donate(s, nasruddin, `Thing ${n}`, "One of many.");
  const full = s.state.snapshot();
  expect(s.act(nasruddin, "donate", fields({ name: "Thing 65", description: "One too many." }), room(s))).toMatchObject({ result: "refused", reason: "type-full" });
  expect(s.state.snapshot()).toBe(full);
  wrote(act(s, neighbour, "cancel", first, { reason: "Broken" }));
  donate(s, nasruddin, "Thing 65", "Room again.");
  expect(s.state.count("thing", "available")).toBe(64);
  expect(s.state.count("thing", "gone")).toBe(1);
});

test("a name, a description and a reason are bounded text", () => {
  const s = make();
  const refused = (name: string, description: string) =>
    expect(s.act(nasruddin, "donate", fields({ name, description }), room(s))).toMatchObject({ result: "refused", reason: "bad-field" });
  refused("n".repeat(81), "A description.");
  refused("A name", "d".repeat(1001));
  const pot = donate(s, nasruddin, "n".repeat(80), "d".repeat(1000));
  expect(act(s, neighbour, "cancel", pot, { reason: "r".repeat(281) })).toMatchObject({ result: "refused", reason: "bad-field" });
  wrote(act(s, neighbour, "cancel", pot, { reason: "r".repeat(280) }));
});
