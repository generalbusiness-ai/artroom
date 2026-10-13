import { expect, test } from "vitest";
import { PROPOSED_BOUNDS, type Entry, type Summary } from "@generalbusiness/dap-contract";
import { validateDefinition } from "@generalbusiness/dap-derive";
import { RULE_PROFILES } from "@generalbusiness/dap-derive/rule";
import { founded, grantOf, keys, valid, type Ledger } from "@generalbusiness/dap-derive/testing";
import { lending } from "../definition.ts";
import { actsFor, lendingView, propose, refusalWords } from "./model.ts";

// The summary here is made by hand from the fold's own state (a STAND-IN for the scope's read).
const read = (s: Ledger): { summary: Summary; at: { seq: number; hash: string }; entries: Entry[] } => ({
  summary: { scope: s.at, items: s.state.page("thing", ["available", "lent"], null, 64).items } as unknown as Summary,
  at: { seq: s.last.seq, hash: s.entries.at(-1)!.hash },
  entries: s.entries.map((sealed) => sealed.entry),
});
const make = () => {
  const s = founded(valid(validateDefinition(lending, PROPOSED_BOUNDS, RULE_PROFILES)), { opener: keys.rita.member });
  const grants = { grants: [keys.rita, keys.una].map((who) => ({ grant: grantOf(who, s.at, ["lending.member", "lending.staff"]), current: true })) };
  const send = (who: typeof keys.rita, view: ReturnType<typeof lendingView>, ...asked: Parameters<typeof propose> extends [unknown, ...infer rest] ? rest : never) => {
    const proposed = propose(view, ...asked);
    if (!proposed.ok) throw new Error(proposed.reason);
    const { kind, on, expected, fields: given } = proposed.proposal;
    return s.act(who, kind, { on, expected, fields: given }, grants);
  };
  return { s, send, view: () => { const { summary, at, entries } = read(s); return lendingView(summary, at, entries); } };
};

test("the view lists every thing in order, live from the summary and gone from the record, and each proposal is the act the scope accepts", () => {
  const { s, send, view } = make();
  expect(send(keys.rita, view(), "donate", { name: " Big pot ", description: "Copper." }).result).toBe("write");
  expect(send(keys.una, view(), "donate", { name: "Small pot", description: "Baby born when the big pot was with me" }).result).toBe("write");
  const [big, small] = view().things;
  expect([big!.name, big!.state, big!.donor, actsFor(big!)]).toEqual(["Big pot", "available", "@rita", ["borrow", "cancel"]]);
  expect(send(keys.una, view(), "borrow", { thing: big!.id }).result).toBe("write");
  expect(view().things[0]).toMatchObject({ state: "lent", borrower: "@una" });
  expect(actsFor(view().things[0]!)).toEqual(["return", "cancel"]);
  expect(send(keys.rita, view(), "cancel", { thing: big!.id, reason: "Nasruddin says the pot died" }).result).toBe("write");
  const after = view();
  expect(after.things.map((thing) => [thing.id, thing.state, thing.revision === null])).toEqual([[big!.id, "gone", true], [small!.id, "available", false]]);
  expect(after.things[0]).toMatchObject({ reason: "Nasruddin says the pot died", borrower: null });
  expect(actsFor(after.things[0]!)).toEqual([]);
  expect(after.record).toEqual({ scope: s.at.scope, incarnation: s.at.inc, seq: s.last.seq, hash: s.entries.at(-1)!.hash });
  expect(after.behind).toBe(false);
  // A record read that stops before the summary's head is marked as behind.
  const { summary, at, entries } = read(s);
  expect(lendingView(summary, at, entries.slice(0, -1)).behind).toBe(true);
});

test("a proposal the view already rules out signs nothing, and a stale one is refused by the scope with words a member can act on", () => {
  const { send, view } = make();
  for (const [asked, reason] of [
    [["donate", { name: " ", description: "x" }], "Give the thing a name."],
    [["donate", { name: "n".repeat(81), description: "x" }], "The name is too long: at most 80 bytes."],
    [["donate", { name: "é".repeat(41), description: "x" }], "The name is too long: at most 80 bytes."],
    [["borrow", { thing: 99 }], "That thing is not in the library."],
  ] as const) expect(propose(view(), ...(asked as unknown as [never, never]))).toEqual({ ok: false, reason });
  expect(send(keys.rita, view(), "donate", { name: "Ladle", description: "Steel." }).result).toBe("write");
  const stale = view(), ladle = stale.things[0]!.id;
  expect(propose(stale, "return", { thing: ladle })).toEqual({ ok: false, reason: "That thing is not lent." });
  expect(propose(stale, "cancel", { thing: ladle, reason: "" })).toEqual({ ok: false, reason: "Say why the thing is gone." });
  expect(send(keys.una, stale, "borrow", { thing: ladle }).result).toBe("write");
  // Two members saw the ladle on the shelf. The second borrow is the scope's to refuse.
  const second = send(keys.rita, stale, "borrow", { thing: ladle });
  expect(second).toMatchObject({ result: "refused", reason: "revision-moved" });
  expect(refusalWords("borrow", "revision-moved")).toBe("Someone changed that thing first. Look again, then decide. (revision-moved)");
  expect(propose(view(), "borrow", { thing: ladle })).toEqual({ ok: false, reason: "That thing is already lent." });
  expect(refusalWords("cancel", "unauthorized")).toBe("Only staff can cancel a thing. (unauthorized)");
  expect(refusalWords("donate", "type-full")).toContain("64 things");
  expect(refusalWords("borrow", "something-new")).toBe("The library refused. (something-new)");
});
