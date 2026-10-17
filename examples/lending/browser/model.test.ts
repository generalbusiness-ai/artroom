import { expect, test } from "vitest";
import { type Entry, type Summary } from "@generalbusiness/dap-contract";
import { grantOf, keys, type Ledger } from "@generalbusiness/dap-derive/testing";
import { donation, make as makeLedger, submit } from "../test-support.ts";
import { actsFor, journalRows, lendingView, memberForKey, membershipActions, offeredActs, propose, refusalWords } from "./model.ts";

// A STAND-IN for a complete authenticated membership summary, not a native authority observation.
const roster = (role: "member" | "admin"): Summary => ({
  scope: keys.rita.member.membership,
  items: [
    { id: 0, type: "roster", state: "open", values: { memberActions: ["lending.member"], adminActions: ["lending.member", "lending.staff"] } },
    { id: 1, type: "member", state: "active", values: { handle: "@rita", role, kind: "person" }, parties: { member: keys.rita.member }, refs: {} },
    { id: 2, type: "key", state: "active", values: { id: keys.rita.key }, refs: { member: 1 } },
  ],
} as unknown as Summary);

// The summary here is made by hand from the fold's own state (a STAND-IN for the scope's read).
const read = (s: Ledger): { summary: Summary; at: { seq: number; hash: string }; entries: Entry[] } => ({
  summary: { scope: s.at, items: [s.item(0), ...s.state.page("thing", ["available", "lent"], null, 64).items] } as unknown as Summary,
  at: { seq: s.last.seq, hash: s.entries.at(-1)!.hash },
  entries: s.entries.map((sealed) => sealed.entry),
});
const make = () => {
  const s = makeLedger();
  const grants = { grants: [keys.rita, keys.una].map((who) => ({ grant: grantOf(who, s.at, ["lending.member", "lending.staff"]), current: true })) };
  const send = (who: typeof keys.rita, view: ReturnType<typeof lendingView>, kind: Parameters<typeof propose>[1], input: Parameters<typeof propose>[2] = {}) => {
    const proposed = propose(view, kind, input, who.member.member, () => new Uint8Array([0,0,0,0,0,0,0,s.entries.length]));
    if (!proposed.ok) throw new Error(proposed.reason);
    const { on, expected, fields: given } = proposed.proposal;
    return submit(s, who, kind, { on, expected, fields: given }, grants);
  };
  return { s, send, view: () => { const { summary, at, entries } = read(s); return lendingView(summary, at, entries); } };
};

test("the view lists every thing in order, live from the summary and gone from the record, and each proposal is the act the scope accepts", async () => {
  const { s, send, view } = make();
  expect((await send(keys.rita, view(), "donate", { name: " Big pot ", description: "Copper." })).result).toBe("write");
  expect((await send(keys.una, view(), "donate", { name: "Small pot", description: "Baby born when the big pot was with me" })).result).toBe("write");
  const [big, small] = view().things;
  const ordinary = membershipActions(roster("member"), keys.rita.member, keys.rita.key);
  const staff = membershipActions(roster("admin"), keys.rita.member, keys.rita.key);
  expect(ordinary).toEqual(["lending.member"]);
  expect(staff).toEqual(["lending.member", "lending.staff"]);
  expect(memberForKey(roster("member"), keys.rita.key)).toEqual(keys.rita.member);
  expect(memberForKey(roster("admin"), keys.una.key)).toBeNull();
  const original = roster("member");
  const contradictory = { ...original, items: original.items.map((item, i) => i === 1 ? { ...item, values: { ...item.values, handle: "@not-rita" } } : item) };
  expect(memberForKey(contradictory, keys.rita.key)).toBeNull();
  const ambiguous = { ...original, items: [...original.items, structuredClone(original.items[2]!)] };
  expect(memberForKey(ambiguous, keys.rita.key)).toBeNull();
  const unknown = [null, membershipActions(roster("admin"), keys.una.member, keys.una.key)];
  expect(unknown).toEqual([null, null]);
  for (const state of ["available", "lent"] as const) {
    const thing = { ...big!, state };
    expect(offeredActs(thing, ordinary)).toEqual([state === "available" ? "borrow" : "return", "publish"]);
    expect(offeredActs(thing, staff)).toEqual([state === "available" ? "borrow" : "return", "cancel", "publish"]);
    for (const actions of unknown) expect(offeredActs(thing, actions)).not.toContain("cancel");
  }
  expect([big!.name, big!.state, big!.donor, actsFor(big!)]).toEqual(["Big pot", "available", "@rita", ["borrow", "cancel", "publish"]]);
  expect((await send(keys.una, view(), "borrow", { thing: big!.id })).result).toBe("write");
  expect(view().things[0]).toMatchObject({ state: "lent", borrower: "@una" });
  expect(actsFor(view().things[0]!)).toEqual(["return", "cancel", "publish"]);
  expect((await send(keys.una, view(), "return", { thing: big!.id })).result).toBe("write");
  expect((await send(keys.una, view(), "borrow", { thing: big!.id })).result).toBe("write");
  expect((await send(keys.rita, view(), "cancel", { thing: big!.id, reason: "Nasruddin says the pot died" })).result).toBe("write");
  const after = view();
  expect(after.things.map((thing) => [thing.id, thing.state, thing.state === "gone"])).toEqual([[big!.id, "gone", true], [small!.id, "available", false]]);
  expect(after.things[0]).toMatchObject({ reason: "Nasruddin says the pot died", borrower: null });
  expect(actsFor(after.things[0]!)).toEqual(["publish"]);
  expect(offeredActs(after.things[0]!, staff)).toEqual(["publish"]);
  expect(after.record).toEqual({ scope: s.at.scope, incarnation: s.at.inc, seq: s.last.seq, hash: s.entries.at(-1)!.hash });
  expect(after.behind).toBe(false);
  expect((await send(keys.rita, after, "publish", { thing: big!.id })).result).toBe("write");
  const retained = read(s).entries;
  const beforeLabels = JSON.stringify(retained);
  const rows = journalRows(retained);
  expect(rows.filter((row) => ["borrow", "return", "cancel", "publish"].includes(row.kind)).map((row) => row.what)).toEqual([
    `Big pot (thing ${big!.id})`, `Big pot (thing ${big!.id})`, `Big pot (thing ${big!.id})`,
    `Big pot (thing ${big!.id}): Nasruddin says the pot died`, `Big pot (thing ${big!.id})`,
  ]);
  expect(rows.find((row) => row.kind === "cancel")).toMatchObject({ signer: "@rita" });
  // A partial journal cannot supply the donation name; keep the ID explicit.
  expect(journalRows(retained.slice(-2)).map((row) => row.what)).toEqual([
    `Unknown thing ${big!.id}: Nasruddin says the pot died`, `Unknown thing ${big!.id}`,
  ]);
  expect(JSON.stringify(retained)).toBe(beforeLabels);

  // A record read that stops before the summary's head is marked as behind.
  const { summary, at, entries } = read(s);
  expect(lendingView(summary, at, entries.slice(0, -1)).behind).toBe(true);
});

test("a proposal the view already rules out signs nothing, and a stale one is refused by the scope with words a member can act on", async () => {
  const { send, view } = make();
  for (const [asked, reason] of [
    [["donate", { name: " ", description: "x" }], "Give the thing a name."],
    [["donate", { name: "n".repeat(81), description: "x" }], "The name is too long: at most 80 bytes."],
    [["donate", { name: "é".repeat(41), description: "x" }], "The name is too long: at most 80 bytes."],
    [["borrow", { thing: 99 }], "That thing is not in the library."],
  ] as const) expect(propose(view(), ...(asked as unknown as [never, never]))).toEqual({ ok: false, reason });
  expect((await send(keys.rita, view(), "donate", { name: "Ladle", description: "Steel." })).result).toBe("write");
  const stale = view(), ladle = stale.things[0]!.id;
  expect(propose(stale, "return", { thing: ladle })).toEqual({ ok: false, reason: "That thing is not lent." });
  expect(propose(stale, "cancel", { thing: ladle, reason: "" })).toEqual({ ok: false, reason: "Say why the thing is gone." });
  expect((await send(keys.una, stale, "borrow", { thing: ladle })).result).toBe("write");
  // Two members saw the ladle on the shelf. The second borrow is the scope's to refuse.
  const second = await send(keys.rita, stale, "borrow", { thing: ladle });
  expect(second).toMatchObject({ result: "refused", reason: "revision-moved" });
  expect(refusalWords("borrow", "revision-moved")).toBe("Someone changed that thing first. Look again, then decide. (revision-moved)");
  expect(propose(view(), "borrow", { thing: ladle })).toEqual({ ok: false, reason: "That thing is already lent." });
  expect(refusalWords("cancel", "unauthorized")).toBe("Only staff can cancel a thing. (unauthorized)");
  expect(refusalWords("donate", "type-full")).toContain("64 things");
  expect(refusalWords("borrow", "something-new")).toBe("The library refused. (something-new)");
});

// The signed text describes the state after the act, but only names known Scope/incarnation metadata.
test("publish repairs a gone page on the library with the retained thing revision; page generation occurs once for donation", async () => {
 const {s,send,view}=make();
 expect((await send(keys.rita,view(),"donate",{name:"Sieve",description:"Fine mesh"})).result).toBe("write");
 const id=view().things[0]!.id;
 const borrowing=propose(view(),"borrow",{thing:id},"@una");
 expect(borrowing.ok && borrowing.proposal.fields["content"]).toContain("Status: lent to \\@una");
 expect((await send(keys.rita,view(),"cancel",{thing:id,reason:"Lost"})).result).toBe("write");
 const gone=view().things[0]!, proposed=propose(view(),"publish",{thing:id});
 expect(proposed.ok && proposed.proposal).toMatchObject({on:0,expected:{on:1,thing:gone.revision},fields:{thing:id}});
 expect((await send(keys.una,view(),"publish",{thing:id})).result).toBe("write");
 expect(view().things[0]).toEqual(gone);
 let draws=0; const p=propose(view(),"donate",{name:"New",description:"Thing"},"@rita",()=>{draws++;return new Uint8Array([1,2,3,4,5,6,7,8]);});
 expect(draws).toBe(1); expect(p.ok && p.proposal.fields).toMatchObject({page:"shelf/0102030405060708.md"});
 expect(p.ok && p.proposal.fields["content"]).not.toMatch(/entry [0-9]|hash sha256/);
 expect(s.item(0).revision).toBe(1);
});

// The declaration accepts empty text; the browser's authoring validator rejects it.
test("a retained donation with an empty name remains known in the journal", async () => {
  const { s, send, view } = make();
  expect(propose(view(), "donate", { name: "", description: "Copper." })).toEqual({ ok: false, reason: "Give the thing a name." });
  const grants = { grants: [keys.rita, keys.una].map((who) => ({ grant: grantOf(who, s.at, ["lending.member", "lending.staff"]), current: true })) };
  expect((await submit(s, keys.rita, "donate", donation(s, "", "Copper."), grants)).result).toBe("write");
  const thing = view().things[0]!;
  expect(thing.name).toBe("");
  expect((await send(keys.una, view(), "borrow", { thing: thing.id })).result).toBe("write");
  const retained = read(s).entries, unchanged = JSON.stringify(retained);
  expect(journalRows(retained).at(-1)?.what).toBe(`Unnamed (thing ${thing.id})`);
  expect(journalRows(retained.slice(-1)).at(-1)?.what).toBe(`Unknown thing ${thing.id}`);
  expect(JSON.stringify(retained)).toBe(unchanged);
});
