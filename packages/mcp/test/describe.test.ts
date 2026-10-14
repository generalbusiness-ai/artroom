import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { definitionDigest } from "@generalbusiness/artroom-bytes";
import { change, issueDemo } from "@generalbusiness/dap-lanes";
import { lane as deriveLane } from "@generalbusiness/dap-derive/testing";
import { countingCommitments } from "../../../apps/counter/commitments.ts";
import { counting } from "../../../apps/counter/definition.ts";
import type { ScopeId } from "@generalbusiness/dap-contract";
import { DESCRIPTION_CHARS, actTool, bindingsOf, describeAct, describedOf, generationOf, guardSentences, inline, listed, WORDS, type ActLike, type DefinitionLike, type Held, type Inventory } from "../src/index.ts";
import { ACTIVE_DEMO, MEMBERSHIP, declared, demoInventory, heldOf, lane, standingOf } from "./support/catalogue.ts";

const DOC = readFileSync(new URL("../../../docs/mcp.md", import.meta.url), "utf8");

/** The description that `tools/list` sends for the binding of `kind` under `definition`, for a caller of `role`. */
function sent(inventory: Inventory, definition: string, kind: string): string {
  const binding = bindingsOf(inventory, WORDS).find((b) => b.definition === definition && b.kind === kind)!;
  return actTool(binding, inventory, "default").description;
}
/** The demo room with more scopes, for a role that also holds `more` actions. */
const room = (extra: Parameters<typeof heldOf>[], role: string, more: string[] = []): Inventory => {
  const base = demoInventory(role);
  const standing = standingOf(role) as Extract<ReturnType<typeof standingOf>, { known: true }>;
  return { ...base, scopes: [...base.scopes, ...extra.map((args) => heldOf(...args))], standing: { [MEMBERSHIP]: { ...standing, actions: [...standing.actions, ...more] } } };
};

// Five worked examples, as tools/list sends them: the first three are plan 031's, section 4; the last two are the Counter's
// participate and commit under counting-commitments, the definition the Counter page runs. docs/mcp.md shows each, verbatim.
export const EXAMPLES: Record<string, () => string> = {
  "issue.comment": () => sent(demoInventory("member"), "issue", "comment"),
  "lane.take-hold": () => sent(room([["sc_fixture", "root", definitionDigest(deriveLane), declared(deriveLane)]], "member", ["hold"]), "lane", "take-hold"),
  "issue.create": () => sent(demoInventory("admin"), "platform:directory", "open-issue"),
  "counting-commitments.participate": () => sent(room([["sc_counter", "root", definitionDigest(countingCommitments), declared(countingCommitments)]], "member", ["counting.participate"]), "counting-commitments", "participate"),
  "counting-commitments.commit": () => sent(room([["sc_counter", "root", definitionDigest(countingCommitments), declared(countingCommitments)]], "member", ["counting.commit"]), "counting-commitments", "commit"),
};

describe("descriptions are derived from the whole declaration", () => {
  // Invariant: each worked example is the description tools/list sends, and docs/mcp.md shows it exactly as sent.
  test("the five worked examples, as sent and as docs/mcp.md shows them", () => {
    expect(EXAMPLES["issue.comment"]!()).toBe("comment: opens a comment; needs issue.comment, which your role (member) holds. Fields: body (required): text up to 65536 bytes, kept apart from the entry: give the text itself, or its digest with the text in texts. replyTo: the ID of a comment item on this scope. mentions: a list of up to 16, each a member, as @handle. No guards.");
    expect(EXAMPLES["lane.take-hold"]!()).toBe("take-hold: opens a hold; needs hold, which your role (member) holds. Fields: commitment (required): the ID of a commitment item on this scope. Guards: the commitment is accepted; you are the commitment's performer; no hold is held where the hold's under equals the act's commitment.");
    expect(EXAMPLES["issue.create"]!()).toBe(`open-issue: opens a lane; needs issue.open, which your role (admin) holds. Fields: definition (required): the digest of a value in the definition domain, up to 262144 bytes, with its bytes in values or read from the rules scope; choices from the rules scope: change ${ACTIVE_DEMO[0]!.digest}, issue ${ACTIVE_DEMO[1]!.digest}. title (required): text up to 256 bytes. body: text up to 65536 bytes, kept apart from the entry: give the text itself, or its digest with the text in texts. conditions (required): a list of up to 16, each text up to 4096 bytes. Guards: the definition is active in the rules scope, and its bytes and the definitions it names are at hand (not-activated, unsupported-definition).`);
    expect(EXAMPLES["counting-commitments.participate"]!()).toBe("participate: opens a participant; needs counting.participate, which your role (member) holds. Fields: none. Guards: no participant is inactive or active where the participant's agent equals you.");
    // The rule guard does not fit in the description: the pointer names it, and the complete text holds the expression verbatim.
    expect(EXAMPLES["counting-commitments.commit"]!()).toMatch(/Guards 8 to 8 of 8 are left out; see inspect with describe: "commit"\.$/);
    const commit = declared(countingCommitments).acts["commit"]!;
    expect(describeAct(declared(countingCommitments), "commit", commit, { standing: "unknown" }, { pinned: definitionDigest(countingCommitments) }, { definition: "counting-commitments", kind: "commit", declaration: "sha256:x", digests: [] }, "").complete)
      .toContain(`- the rule commit-plan holds: ${countingCommitments.rules["commit-plan"]}`);
    for (const [name, render] of Object.entries(EXAMPLES)) expect(DOC, `docs/mcp.md shows ${name} as sent`).toContain(render());
  });

  // Invariant: every guard form, operand and part of the contract has a sentence; none renders as raw JSON.
  test("every guard form and operand of the contract renders as a sentence", () => {
    const operands = [{ field: "f" }, { presented: "p", part: "seq" }, { slot: "s" }, { slot: "s", of: "also.x" }, { element: "e.m" }, { element: "e" }, { item: "also.x" }, { signer: true }, { sender: true },
      { source: { field: "g" } }, { update: "state" }, { result: "reason" }, { scope: true }, { intent: true }, { none: true }, { const: 3 },
      { field: "f", part: { opened: "t" } }, { field: "f", part: { set: { item: { item: "on" }, slot: "s" } } }, { field: "f", part: { carried: "c" } }, { field: "f", part: { of: "kind", then: "seq" } }];
    const range = { type: "t", states: ["a"], where: [{ equals: { a: { slot: "s" }, b: { field: "f" } } }], except: ["also.x"] };
    const guards = [
      { state: ["a", "b"] }, { signer: ["owner"], of: "also.x" }, { notIn: ["authors"] }, { set: "s" }, { unset: "s" },
      ...operands.map((o) => ({ equals: { a: o, b: { field: "f" } } })), { differs: { a: { field: "f" }, b: { none: true } } },
      { some: range }, { none: range }, { count: { ...range, min: 1, max: { field: "n" } } }, { every: { list: "l", states: ["a"] } },
      { fact: { field: "f" } }, { fact: { presented: "p" } }, { fact: { element: "e" } }, { before: { slot: "s" } }, { after: { slot: "s" } }, { rule: "r" },
      { each: { list: { field: "l" }, as: "e", where: [{ differs: { a: { element: "e.m" }, b: { none: true } } }], guards: [{ state: ["a"] }] } },
      { has: { list: { field: "l" }, as: "e", where: [{ equals: { a: { element: "e.m" }, b: { signer: true } } }], guards: [{ set: "s" }] } },
      { anyOf: [[{ state: ["a"] }], [{ unset: "s" }]] }, { distinct: { list: { field: "l" }, as: "e", key: { element: "e.m" } } },
      { sameSet: { list: { field: "l" }, as: "e", key: { element: "e.id" }, items: range, match: [{ equals: { a: { slot: "s" }, b: { element: "e.m" } } }], ordered: true } },
      { capability: { name: "hold", guard: "staged", with: { a: { field: "f" }, b: { each: { field: "l" }, as: "e", value: { element: "e.m" } }, c: { items: range, slot: "s" } } } },
      { ifPresent: true, reason: "named", equals: { a: { field: "f" }, b: { const: "x" } } },
    ];
    const act: ActLike = { step: "transition", on: "t", grant: "g", also: { x: { item: "t", by: "f" } }, fields: { f: { type: "text", max: 9, required: true } }, presents: { p: { kind: ["k"], under: "d", required: false } }, guards, effects: [{ state: "b" }] };
    const definition: DefinitionLike = { name: "every-form", genesis: "g0", items: { t: {} }, acts: { a: act }, rules: { r: "true" } };
    const sentences = guardSentences(definition, act, { pinned: "sha256:x" });
    const texts = sentences.map(inline);
    expect(texts.length).toBe(guards.length);
    for (const text of texts) expect(text).not.toContain("the form {");
    expect(texts.at(-1)).toBe("the act's f equals \"x\", when it is given (named)");
    // A form the contract does not have renders as its JSON, marked: the totality test above would see it.
    expect(inline(guardSentences(definition, { ...act, guards: [{ unknownForm: 1 }] }, { pinned: "sha256:x" })[0]!)).toBe('the form {"unknownForm":1}');
  });

  // Invariant: a description over 1,000 characters keeps whole guard sentences only, and names the guards it left out, by their
  // positions and their names, pointing at the complete text.
  test("a long description names the guards it left out and points at inspect describe", () => {
    const binding = bindingsOf(demoInventory("admin"), WORDS).find((b) => b.kind === "merge")!;
    const description = actTool(binding, demoInventory("admin"), "default").description;
    expect(description.length).toBeLessThanOrEqual(DESCRIPTION_CHARS);
    expect(description).toMatch(/Guards 8 to 10 of 10 are left out \(named: required-check-not-passed, reports-not-selected\); see inspect with describe: "merge"\.$/);
    // Every sentence it kept is whole: each is one of the complete text's sentences.
    const kept = description.slice(description.indexOf("Guards: ") + 8, description.indexOf(". Guards 8")).split("; ");
    const complete = describeAct(binding.holder, "merge", binding.act, { standing: "holds", role: "admin" }, { pinned: binding.pinned }, binding, "").guards.map(inline);
    expect(kept).toEqual(complete.slice(0, 7));
  });

  // Invariant: the act tools listed for a role are those whose action its role holds, and those a rule decides.
  test("a member is listed fewer act tools than an admin, and none it does not hold", () => {
    const counts = Object.fromEntries(["admin", "maintainer", "member", "agent"].map((role) => [role, bindingsOf(demoInventory(role), WORDS).filter((b) => listed(b, demoInventory(role))).length]));
    expect(counts["admin"]).toBeGreaterThan(counts["member"]!);
    const member = demoInventory("member");
    for (const b of bindingsOf(member, WORDS).filter((x) => listed(x, member))) {
      if (typeof b.act.grant === "string") expect(standingOf("member").known && (standingOf("member") as { actions: readonly string[] }).actions).toContain(b.act.grant);
    }
    expect(lane(9, issueDemo).definition.name).toBe("issue");
  });

  // Invariant: a description speaks for one meaning: two definitions whose act and item rows match but whose rule body or
  // profile differs are two declarations, each tool's text holds its own rule body, and the names, the texts and the generation
  // do not depend on the order of the scopes.
  test("same rows, a different rule body or profile: two tools, each with its own meaning", () => {
    const relaxed = { ...counting, rules: { ...counting.rules, "spoken-plan": "true" } };
    const profiled = { ...counting, profile: { name: "restricted", version: 2 } };
    const roots: Parameters<typeof heldOf>[] = [["sc_c1", "root", definitionDigest(counting), declared(counting)], ["sc_c2", "root", definitionDigest(relaxed), declared(relaxed)]];
    const inventoryOf = (order: Parameters<typeof heldOf>[]) => room(order, "member", ["counting.spoken", "counting.join"]);
    const spoken = (inv: Inventory) => bindingsOf(inv, WORDS).filter((b) => b.definition === "counting" && b.kind === "spoken");
    const [a, b] = spoken(inventoryOf(roots));
    expect([spoken(inventoryOf(roots)).length, a!.name.startsWith("counting.spoken@"), b!.name.startsWith("counting.spoken@")]).toEqual([2, true, true]);
    const texts = spoken(inventoryOf(roots)).map((x) => describedOf(x, inventoryOf(roots), "default").complete);
    expect(texts.filter((t) => t.includes(`the rule spoken-plan holds: ${counting.rules["spoken-plan"]}`))).toHaveLength(1);
    expect(texts.filter((t) => t.includes("the rule spoken-plan holds: true"))).toHaveLength(1);
    // join names no rule: one tool serves both digests.
    expect(bindingsOf(inventoryOf(roots), WORDS).filter((x) => x.kind === "join" && x.definition === "counting").map((x) => x.digests.length)).toEqual([2]);
    // A profile is part of the meaning too.
    const withProfile = inventoryOf([roots[0]!, ["sc_c3", "root", definitionDigest(profiled), declared(profiled)]]);
    expect(bindingsOf(withProfile, WORDS).filter((x) => x.kind === "join" && x.definition === "counting")).toHaveLength(2);
    // Reordering the scopes changes no name, no text and no generation.
    const sent = (inv: Inventory) => bindingsOf(inv, WORDS).filter((x) => listed(x, inv)).map((x) => [x.name, actTool(x, inv, "default").description]);
    const options = { mode: "default" as const, tools: null, words: WORDS };
    const [forward, backward] = [inventoryOf(roots), inventoryOf([...roots].reverse())];
    expect(sent(backward)).toEqual(sent(forward));
    expect(generationOf(bindingsOf(backward, WORDS), backward, options)).toBe(generationOf(bindingsOf(forward, WORDS), forward, options));
  });

  // Invariant: what a tool says of authority and inputs is complete and true: with the standing unknown on some memberships of
  // its scopes, the tool is listed and never said to be held; presented facts are closed properties of the input schema, required
  // as the act declares; and a capability's item range keeps its exception.
  test("partly unknown standing, presented facts in the schema, and a capability's exception", () => {
    const inventory = room([["sc_g1", "root", definitionDigest(counting), declared(counting), "sc_unknown_membership" as never]], "member", ["counting.join"]);
    const join = bindingsOf(inventory, WORDS).find((x) => x.definition === "counting" && x.kind === "join")!;
    const mixed: Inventory = { ...inventory, scopes: [...inventory.scopes, heldOf("sc_g2", "root", definitionDigest(counting), declared(counting))] };
    const both = bindingsOf(mixed, WORDS).find((x) => x.definition === "counting" && x.kind === "join")!;
    expect([listed(join, inventory), listed(both, mixed)]).toEqual([true, true]);
    const text = actTool(both, mixed, "default").description;
    expect(text).toContain("your standing is unknown on some scopes of this kind");
    expect(text).not.toMatch(/holds/);
    // change's propose-manifest presents an optional pin.
    const changeInventory = room([["sc_ch", "lane", definitionDigest(change), declared(change)]], "member", ["change.propose"]);
    const manifest = bindingsOf(changeInventory, WORDS).find((x) => x.definition === "change" && x.kind === "propose-manifest")!;
    const presented = (actTool(manifest, changeInventory, "default").inputSchema["properties"] as Record<string, Record<string, unknown>>)["presented"]!;
    expect([presented["additionalProperties"], presented["required"], Object.keys(presented["properties"] as object)]).toEqual([false, [], ["pin"]]);
    const pin = (presented["properties"] as Record<string, Record<string, unknown>>)["pin"]!;
    expect([pin["required"], pin["additionalProperties"], pin["description"]]).toEqual([["at", "seq", "hash"], false, "an entry of kind hold@1:check under issue; optional"]);
    const required: ActLike = { ...manifest.act, presents: { pin: { kind: ["k"], under: "d", required: true } } };
    const schema = actTool({ ...manifest, act: required }, changeInventory, "default").inputSchema;
    expect([(schema["required"] as string[]).includes("presented"), ((schema["properties"] as Record<string, Record<string, unknown>>)["presented"]!["required"])]).toEqual([true, ["pin"]]);
    // A capability argument over an item range keeps the range's exception.
    const range = { type: "t", states: ["a"], except: ["also.x"] };
    const act: ActLike = { step: "transition", on: "t", grant: "g", also: { x: { item: "t", by: "f" } }, fields: { f: { type: "text", max: 9, required: true } }, guards: [{ capability: { name: "hold", guard: "staged", with: { c: { items: range, slot: "s" } } } }], effects: [] };
    expect(inline(guardSentences({ name: "x", genesis: "g0", items: { t: {} }, acts: { a: act } }, act, { pinned: "sha256:x" })[0]!)).toMatch(/the s of each t that is a, except /);
  });

  // Invariant: a tool served across memberships with different roles names each membership's role in the order of the
  // memberships' scope IDs, so reordering the scopes changes neither the text nor the generation.
  test("two memberships with different roles, reordered: the same text and generation", () => {
    const base = demoInventory("admin");
    const m2 = "sc_aaaamembershipsecond" as ScopeId;
    const roots: Held[] = [heldOf("sc_r1", "root", definitionDigest(counting), declared(counting)), heldOf("sc_r2", "root", definitionDigest(counting), declared(counting), m2)];
    const standing = { [MEMBERSHIP]: { ...(standingOf("admin") as object), actions: ["counting.join"] }, [m2]: { ...(standingOf("member") as object), actions: ["counting.join"] } } as unknown as Inventory["standing"];
    const inv = (order: Held[]): Inventory => ({ ...base, scopes: [...base.scopes, ...order], standing });
    const text = (i: Inventory) => actTool(bindingsOf(i, WORDS).find((b) => b.definition === "counting" && b.kind === "join")!, i, "default").description;
    const options = { mode: "default" as const, tools: null, words: WORDS };
    const [forward, backward] = [inv(roots), inv([...roots].reverse())];
    expect(text(forward)).toBe(text(backward));
    expect(text(forward)).toContain(`which your role (member on ${m2}, admin on ${MEMBERSHIP}) holds`);
    expect(generationOf(bindingsOf(backward, WORDS), backward, options)).toBe(generationOf(bindingsOf(forward, WORDS), forward, options));
  });
});
