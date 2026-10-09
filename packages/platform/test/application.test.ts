import { expect, test } from "vitest";
import { canonicalize, definitionDigest } from "@generalbusiness/artroom-bytes";
import { PROPOSED_BOUNDS, type DeclaredDefinition, type MemberRef } from "@generalbusiness/artroom-contract";
import { runnable, validateDefinition, type RuleGiven } from "@generalbusiness/artroom-derive";
import { RULE_PROFILES } from "@generalbusiness/artroom-derive/rule";
import { definitionClosure } from "../src/definition-input.ts";
import { APPLICATION_COHORT, APPLICATION_VALUES_BYTES, FIRST_ACTIONS_OF, NEWEST, applicationValues, platform } from "../src/index.ts";

// Made-up declaration: a pure schema and version-boundary witness, no native authority or creation claim.
const declaration: DeclaredDefinition = {
  format: "artroom-definition-1", name: "small-application", profile: { name: "restricted", version: 1 },
  capabilities: [], genesis: "establish",
  items: { configuration: { many: false, max: 1, initial: "ready", states: { ready: { final: false } },
    parties: { controller: { fixed: true, required: true, list: false, author: false } }, refs: {},
    values: { target: { fixed: true, required: true, of: { type: "int", min: 1, max: 100 } } } } },
  acts: { establish: { step: "open", on: "configuration", grant: "small.establish", also: {},
    fields: { opener: { type: "member", required: true }, target: { type: "int", min: 1, max: 100, required: true },
      note: { type: "text", max: APPLICATION_VALUES_BYTES, required: false },
      peer: { type: "member", required: false },
      membership: { type: "member", required: false } },
    guards: [], effects: [{ party: { slot: "controller", from: { field: "opener" } } }, { value: { slot: "target", from: { field: "target" } } }], sends: [], attention: [] } },
  receives: {}, timed: {}, rules: { supported: "true" },
};
const opener: MemberRef = { membership: { kind: "membership", scope: `sc_${"a".repeat(51)}a`, inc: `in_${"a".repeat(25)}a` }, member: "@admin" };

test("supporting cohort validates with actual embedded rules, grants establishment only to admin, and leaves the existing default pins unchanged", () => {
  expect(validateDefinition(declaration, PROPOSED_BOUNDS, RULE_PROFILES).ok).toBe(true);
  for (const named of Object.values(APPLICATION_COHORT)) {
    const supplied = platform(named)!;
    const checked = validateDefinition(supplied.data, PROPOSED_BOUNDS, RULE_PROFILES, { platform: true });
    expect(checked.ok, named).toBe(true);
    if (checked.ok) expect(runnable(checked.definition, supplied.rules), named).toBe(true);
  }
  expect(NEWEST).toEqual({ "platform:register": "platform:register@3", "platform:directory": "platform:directory@3", "platform:membership": "platform:membership@2", "platform:rules": "platform:rules@2", "platform:destination": "platform:destination@3", "platform:inbox": "platform:inbox@1" });
  for (const [role, actions] of Object.entries(FIRST_ACTIONS_OF[APPLICATION_COHORT.membership]!)) {
    expect(actions).toEqual([...FIRST_ACTIONS_OF["platform:membership@2"]![role as keyof typeof FIRST_ACTIONS_OF[string]], ...(role === "admin" ? ["application.establish"] : [])]);
  }
  expect(definitionDigest(platform("platform:membership@2")!.data as unknown as DeclaredDefinition)).toBe(definitionDigest(platform(APPLICATION_COHORT.membership)!.data as unknown as DeclaredDefinition));
});

test("genesis values reject caller authority and schema errors, and apply the final canonical byte cap after inserting the trusted opener", () => {
  expect(applicationValues('{"target":7}', declaration, opener, PROPOSED_BOUNDS)).toEqual({ opener, target: 7 });
  expect(applicationValues(canonicalize({ target: 7, peer: opener }), declaration, opener, PROPOSED_BOUNDS)).toEqual({ opener, target: 7, peer: opener });
  expect(applicationValues(canonicalize({ target: 7, membership: opener }), declaration, opener, PROPOSED_BOUNDS)).toEqual({ opener, target: 7, membership: opener });
  for (const value of [{ target: 0 }, {}, { target: 7, extra: true }, { target: 7, opener }, { target: 7, directory: opener.membership }]) {
    expect(applicationValues(canonicalize(value), declaration, opener, PROPOSED_BOUNDS)).toBeNull();
  }
  expect(applicationValues('{ "target":7}', declaration, opener, PROPOSED_BOUNDS)).toBeNull();
  const final = { opener, target: 7, note: "" };
  const remaining = APPLICATION_VALUES_BYTES - new TextEncoder().encode(canonicalize(final)).length;
  expect(applicationValues(canonicalize({ target: 7, note: "x".repeat(remaining) }), declaration, opener, PROPOSED_BOUNDS)).not.toBeNull();
  expect(applicationValues(canonicalize({ target: 7, note: "x".repeat(remaining + 1) }), declaration, opener, PROPOSED_BOUNDS)).toBeNull();
});


// The placed reader here is a pure test double for already matched native
// bytes. This checks closure policy only; the real SQL/field matching witness
// belongs to application-establish.test.ts.
test("complete static closure requires unique exact declared places; missing bindings, unused bindings, duplicate bindings and mismatched bytes cannot be complete", () => {
  const child = { ...declaration, name: "small-child" }, childDigest = definitionDigest(child);
  const root: DeclaredDefinition = { ...declaration, acts: { ...declaration.acts, establish: { ...declaration.acts["establish"]!,
    sends: [{ create: { kind: "lane", definition: childDigest, fields: { opener: { field: "opener" }, target: { field: "target" } }, result: {} } }] } } };
  const rootDigest = definitionDigest(root);
  const given = (fields: Record<string, unknown>, placed: Record<string, unknown>) => ({ resolved: { bounds: PROPOSED_BOUNDS, fields }, placed: (name: string) => placed[name] }) as unknown as RuleGiven;
  expect(definitionClosure(given({ definition: rootDigest, dependency1: childDigest }, { definition: root, dependency1: child }), "definition").result).toBe("ready");
  expect(definitionClosure(given({ definition: rootDigest }, { definition: root }), "definition").result).toBe("unavailable");
  expect(definitionClosure(given({ definition: rootDigest, dependency1: childDigest, dependency2: childDigest }, { definition: root, dependency1: child }), "definition").result).toBe("unsupported");
  expect(definitionClosure(given({ definition: childDigest, dependency1: rootDigest }, { definition: child, dependency1: root }), "definition").result).toBe("unsupported");
  expect(definitionClosure(given({ definition: rootDigest, dependency1: childDigest }, { definition: root, dependency1: declaration }), "definition").result).toBe("unsupported");
});
