import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { definitionDigest } from "@generalbusiness/artroom-bytes";
import { issueDemo } from "@generalbusiness/artroom-lanes";
import { lane as deriveLane } from "@generalbusiness/artroom-derive/testing";
import { counting } from "../../../examples/counting/definition.ts";
import { DESCRIPTION_CHARS, actTool, bindingsOf, describeAct, guardSentences, inline, listed, WORDS, type ActLike, type DefinitionLike, type Inventory } from "../src/index.ts";
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

// The five worked examples of plan 031, section 4, as tools/list sends them. docs/mcp.md shows each, verbatim.
export const EXAMPLES: Record<string, () => string> = {
  "issue.comment": () => sent(demoInventory("member"), "issue", "comment"),
  "lane.take-hold": () => sent(room([["sc_fixture", "root", definitionDigest(deriveLane), declared(deriveLane)]], "member", ["hold"]), "lane", "take-hold"),
  "issue.create": () => sent(demoInventory("admin"), "platform:directory", "open-issue"),
  "counting.join": () => sent(room([["sc_counter", "root", definitionDigest(counting), declared(counting)]], "member", ["counting.join"]), "counting", "join"),
  "counting.spoken": () => sent(room([["sc_counter", "root", definitionDigest(counting), declared(counting)]], "member", ["counting.spoken"]), "counting", "spoken"),
};

describe("descriptions are derived from the whole declaration", () => {
  // Invariant: each worked example of section 4 is the description tools/list sends, and docs/mcp.md shows it exactly as sent.
  test("the five worked examples, as sent and as docs/mcp.md shows them", () => {
    expect(EXAMPLES["issue.comment"]!()).toBe("comment: opens a comment; needs issue.comment, which your role (member) holds. Fields: body (required): text up to 65536 bytes, kept apart from the entry: give the text itself, or its digest with the text in texts. replyTo: the ID of a comment item on this scope. mentions: a list of up to 16, each a member, as @handle. No guards.");
    expect(EXAMPLES["lane.take-hold"]!()).toBe("take-hold: opens a hold; needs hold, which your role (member) holds. Fields: commitment (required): the ID of a commitment item on this scope. Guards: the commitment is accepted; you are the commitment's performer; no hold is held where the hold's under equals the act's commitment.");
    expect(EXAMPLES["issue.create"]!()).toBe(`open-issue: opens a lane; needs issue.open, which your role (admin) holds. Fields: definition (required): the digest of a value in the definition domain, up to 262144 bytes, with its bytes in values or read from the rules scope; choices from the rules scope: change ${ACTIVE_DEMO[0]!.digest}, issue ${ACTIVE_DEMO[1]!.digest}. title (required): text up to 256 bytes. body: text up to 65536 bytes, kept apart from the entry: give the text itself, or its digest with the text in texts. conditions (required): a list of up to 16, each text up to 4096 bytes. Guards: the definition is active in the rules scope, and its bytes and the definitions it names are at hand (not-activated, unsupported-definition).`);
    expect(EXAMPLES["counting.join"]!()).toBe("join: opens a participant; needs counting.join, which your role (member) holds. Fields: none. Guards: between 0 and 7 participants are joined; no participant is joined where the participant's agent equals you.");
    // The rule guard does not fit in the description: the pointer names it, and the complete text holds the expression verbatim.
    expect(EXAMPLES["counting.spoken"]!()).toMatch(/Guards 6 to 6 of 6 are left out; see inspect with describe: "spoken"\.$/);
    const spoken = declared(counting).acts["spoken"]!;
    expect(describeAct(declared(counting), "spoken", spoken, { standing: "unknown" }, { pinned: definitionDigest(counting) }, { definition: "counting", kind: "spoken", declaration: "sha256:x", digests: [] }, "").complete)
      .toContain(`- the rule spoken-plan holds: ${counting.rules["spoken-plan"]}`);
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
});
