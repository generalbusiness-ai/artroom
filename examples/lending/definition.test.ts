import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { PROPOSED_BOUNDS } from "@generalbusiness/dap-contract";
import { canonicalize, definitionDigest, parseStrict } from "@generalbusiness/artroom-bytes";
import { validateDefinition } from "@generalbusiness/dap-derive";
import { RULE_PROFILES } from "@generalbusiness/dap-derive/rule";
import { grantOf, keys, type Ledger } from "@generalbusiness/dap-derive/testing";
import { lending, lendingClosure } from "./definition.ts";
import { LENDING_DEFINITION } from "./pin.ts";
import { destination, donation, make, over, submit } from "./test-support.ts";
const room = (s: Ledger) => ({ grants: [keys.rita, keys.una, keys.vic].map((who) => ({ grant: grantOf(who, s.at, who === keys.rita ? ["lending.member", "lending.staff"] : ["lending.member"]), current: true })) });
const wrote = (j: Awaited<ReturnType<typeof submit>>) => expect(j.result, JSON.stringify(j)).toBe("write");
const donate = async (s: Ledger, who: typeof keys.rita, name: string, description = "Copper.") => { wrote(await submit(s, who, "donate", donation(s, name, description), room(s))); return s.last.seq; };
const act = (s: Ledger, who: typeof keys.rita, kind: string, id: number, fields = {}) => submit(s, who, kind, over(s, id, fields), room(s));

test("the publication declaration is its canonical bytes and pin, with one bounded tell per nongenesis act and no capability", () => {
 const checked = validateDefinition(lending, PROPOSED_BOUNDS, RULE_PROFILES);
 expect(checked.ok ? [] : checked.problems).toEqual([]);
 expect(lendingClosure).toEqual([lending]);
 const bytes = readFileSync(new URL("./definition.json", import.meta.url));
 expect(bytes).toEqual(Buffer.from(canonicalize(lending) + "\n")); expect(parseStrict(bytes.toString("utf8"))).toEqual(lending);
 expect(definitionDigest(lending)).toBe(LENDING_DEFINITION);
 expect([lending.capabilities, lending.receives, lending.timed]).toEqual([[], {}, {}]);
 expect(Object.values(lending.acts).map(a => a.sends.length)).toEqual([0, 1, 1, 1, 1, 1]);
});

test("Nasruddin and the pot: nine steps, two refusals, every accepted act sends its stored page, and the record refolds", async () => {
 const s = make(), libraryRevision = s.item(0).revision;
 expect(s.item(0).refs["destination"]).toEqual(destination);
 const big = await donate(s, keys.rita, "Big pot", "A heavy copper pot. Holds eight litres.");
 const path = s.item(big).values["page"];
 wrote(await act(s, keys.una, "borrow", big));
 expect(s.item(big)).toMatchObject({ state: "lent", parties: { borrower: keys.una.member } });
 expect(await act(s, keys.vic, "borrow", big)).toMatchObject({ result: "refused", reason: "guard-failed" });
 wrote(await act(s, keys.una, "return", big));
 expect(s.item(big).parties["borrower"]).toBeNull();
 const small = await donate(s, keys.una, "Small pot", "Baby born when the big pot was with me");
 wrote(await act(s, keys.una, "borrow", big));
 expect(await act(s, keys.una, "cancel", big, { reason: "The pot died" })).toMatchObject({ result: "refused", reason: "unauthorized" });
 wrote(await act(s, keys.rita, "cancel", big, { reason: "Nasruddin says the pot died" }));
 expect(s.item(big)).toMatchObject({ state: "gone", values: { reason: "Nasruddin says the pot died", page: path } });
 const fresh = await donate(s, keys.rita, "New big pot");
 expect(s.state.page("thing", ["available", "lent", "gone"], null, 64).items.map(x => [x.id, x.state])).toEqual([[big, "gone"], [small, "available"], [fresh, "available"]]);
 expect(s.entries.map(({entry}) => entry.input.type === "act" ? entry.input.signed.intent.kind : entry.input.type)).toEqual(["genesis", "donate", "borrow", "return", "donate", "borrow", "cancel", "donate"]);
 for (const {entry} of s.entries.slice(1)) expect(entry.sends).toHaveLength(1);
 expect(s.item(0).revision).toBe(libraryRevision);
 expect(s.replay().snapshot()).toBe(s.state.snapshot());
});

test("shelf paths belong to one thing forever, publication repairs a gone thing without changing it, and oversized content is refused", async () => {
 const s = make(), fixed = "shelf/0123456789abcdef.md";
 for (const page of ["README.md", "shelf/../x.md", "shelf/x.txt"]) expect(await submit(s, keys.rita, "donate", donation(s, "Pot", "Copper", page))).toMatchObject({result:"refused",reason:"guard-failed"});
 wrote(await submit(s, keys.rita, "donate", donation(s, "Pot", "Copper", fixed))); const id = s.last.seq;
 expect(await submit(s, keys.una, "donate", donation(s, "Other", "Copper", fixed))).toMatchObject({result:"refused",reason:"guard-failed"});
 wrote(await act(s, keys.una, "borrow", id)); wrote(await act(s, keys.vic, "return", id)); wrote(await act(s, keys.rita, "cancel", id, {reason:"Lost"}));
 for (const kind of ["borrow", "return", "cancel"]) expect(await act(s, keys.rita, kind, id, {reason:"Again"})).toMatchObject({result:"refused"});
 expect(await submit(s, keys.una, "donate", donation(s, "Other", "Copper", fixed))).toMatchObject({result:"refused",reason:"guard-failed"});
 const before = [s.item(0), s.item(id)];
 wrote(await submit(s, keys.una, "publish", {on:0, expected:{on:s.item(0).revision, thing:s.item(id).revision}, fields:{thing:id,content:"Corrected gone page"}}, room(s)));
 expect([s.item(0), s.item(id)]).toEqual(before);
 expect(s.last.sends[0]).toMatchObject({to:destination,message:{class:"request",type:"tell",body:{message:"publish-file",fields:{path:fixed,content:"Corrected gone page"}}}});
 expect(await submit(s, keys.una, "publish", {on:0, expected:{on:s.item(0).revision, thing:s.item(id).revision}, fields:{thing:id,content:"x".repeat(4097)}}, room(s))).toMatchObject({result:"refused",reason:"bad-field"});
 expect(s.replay().snapshot()).toBe(s.state.snapshot());
});

test("64 live things and bounded text: cancellation frees capacity while the gone page remains owned", async () => {
 const s=make();
 for (const [name, description] of [["n".repeat(81),"d"],["n","d".repeat(1001)]]) expect(await submit(s,keys.rita,"donate",donation(s,name!,description!))).toMatchObject({result:"refused",reason:"bad-field"});
 const first=await donate(s,keys.rita,"n".repeat(80),"d".repeat(1000));
 expect(await act(s,keys.rita,"cancel",first,{reason:"r".repeat(281)})).toMatchObject({result:"refused",reason:"bad-field"});
 for(let n=2;n<=64;n++) await donate(s,keys.una,`Thing ${n}`);
 expect(await submit(s,keys.una,"donate",donation(s,"Thing65","Too many"))).toMatchObject({result:"refused",reason:"type-full"});
 wrote(await act(s,keys.rita,"cancel",first,{reason:"r".repeat(280)})); await donate(s,keys.una,"Thing65");
 expect(s.state.count("thing","available")).toBe(64); expect(s.state.count("thing","gone")).toBe(1);
});
