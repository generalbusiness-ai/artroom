import { describe, expect, test } from "vitest";
import type { FactRef, ScopeRef } from "@generalbusiness/dap-contract";
import { newIncarnation, scopeIdOf, textDigest } from "@generalbusiness/artroom-bytes";
import { effectiveFields, expectedOf, type ActLike } from "../src/index.ts";

const scopeOf = (cause: string) => scopeIdOf({ v: 1, kind: "lane", definition: "platform:issue@1", creator: null, cause: textDigest(cause), ordinal: 0 } as never);
const incOf = (n: number) => newIncarnation(new Uint8Array(16).fill(n));
const here = { scope: scopeOf("here"), inc: incOf(1), kind: "lane" } as ScopeRef;
const other = { scope: scopeOf("other"), inc: incOf(2) };
const fact = (at: Pick<ScopeRef, "scope" | "inc">, seq: number): FactRef => ({ at: { ...at, kind: "lane" }, seq, hash: `sha256:${"a".repeat(64)}` }) as FactRef;
const act = {
  step: "transition", on: "shelf", also: { selected: { item: "jar", by: "jarFact" } },
  fields: { jarFact: { type: "fact", kind: ["fill"], under: "pantry", required: true }, list: { type: "list", max: 2, of: { type: "fact", kind: ["fill"], under: "pantry" }, required: false } },
} as unknown as ActLike;
const items = [{ id: 0, type: "shelf", revision: 4 }, { id: 2, type: "jar", revision: 7 }] as never;

describe("the fields the scope will read, for an act's subjects", () => {
  // Invariant: a local fact, one of the target's scope and incarnation, is read as its seq, in a field and in a list, so it
  // selects the item it opened; a foreign fact with the same seq stays a fact and selects nothing; the given fields are untouched.
  test("a local fact as its seq; a foreign fact never a local item", () => {
    const given = { jarFact: fact(here, 2), list: [fact(here, 2), fact(other, 2)] };
    const effective = effectiveFields(act, given as never, here);
    expect(effective).toEqual({ jarFact: 2, list: [2, fact(other, 2)] });
    expect(given.jarFact).toEqual(fact(here, 2));
    expect(expectedOf(act, items, 0, effective)).toEqual({ on: 4, selected: 7 });
    // Another incarnation of the same scope is foreign.
    const foreign = effectiveFields(act, { jarFact: fact({ scope: here.scope, inc: incOf(3) }, 2) } as never, here);
    expect(expectedOf(act, items, 0, foreign)).toEqual({ on: 4 });
  });
});
