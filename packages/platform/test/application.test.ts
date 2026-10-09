import { expect, test } from "vitest";
import { canonicalize, definitionDigest } from "@generalbusiness/artroom-bytes";
import { PROPOSED_BOUNDS, type DeclaredDefinition, type MemberRef } from "@generalbusiness/artroom-contract";
import { runnable, validateDefinition } from "@generalbusiness/artroom-derive";
import { RULE_PROFILES } from "@generalbusiness/artroom-derive/rule";
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
      note: { type: "text", max: APPLICATION_VALUES_BYTES, required: false } },
    guards: [], effects: [{ party: { slot: "controller", from: { field: "opener" } } }, { value: { slot: "target", from: { field: "target" } } }], sends: [], attention: [] } },
  receives: {}, timed: {}, rules: { supported: "true" },
};
const opener: MemberRef = { membership: { kind: "membership", scope: `sc_${"a".repeat(51)}a`, inc: `in_${"a".repeat(25)}a` }, member: "@admin" };

test("supporting cohort validates with actual embedded rules, grants establishment only to admin, and leaves all default legacy pins unchanged", () => {
  expect(validateDefinition(declaration, PROPOSED_BOUNDS, RULE_PROFILES).ok).toBe(true);
  for (const named of Object.values(APPLICATION_COHORT)) {
    const supplied = platform(named)!;
    const checked = validateDefinition(supplied.data, PROPOSED_BOUNDS, RULE_PROFILES, { platform: true });
    expect(checked.ok, named).toBe(true);
    if (checked.ok) expect(runnable(checked.definition, supplied.rules), named).toBe(true);
  }
  expect(NEWEST).toEqual({ "platform:register": "platform:register@2", "platform:directory": "platform:directory@2", "platform:membership": "platform:membership@2", "platform:rules": "platform:rules@2", "platform:destination": "platform:destination@2", "platform:inbox": "platform:inbox@1" });
  for (const [role, actions] of Object.entries(FIRST_ACTIONS_OF[APPLICATION_COHORT.membership]!)) {
    expect(actions).toEqual([...FIRST_ACTIONS_OF["platform:membership@2"]![role as keyof typeof FIRST_ACTIONS_OF[string]], ...(role === "admin" ? ["application.establish"] : [])]);
  }
  expect(definitionDigest(platform("platform:membership@2")!.data as unknown as DeclaredDefinition)).toBe(definitionDigest(platform(APPLICATION_COHORT.membership)!.data as unknown as DeclaredDefinition));
});

test("genesis values reject caller authority and schema errors, and apply the final canonical byte cap after inserting the trusted opener", () => {
  expect(applicationValues('{"target":7}', declaration, opener, PROPOSED_BOUNDS)).toEqual({ opener, target: 7 });
  for (const value of [{ target: 0 }, {}, { target: 7, extra: true }, { target: 7, opener }, { target: 7, membership: opener.membership }]) {
    expect(applicationValues(canonicalize(value), declaration, opener, PROPOSED_BOUNDS)).toBeNull();
  }
  expect(applicationValues('{ "target":7}', declaration, opener, PROPOSED_BOUNDS)).toBeNull();
  const final = { opener, target: 7, note: "" };
  const remaining = APPLICATION_VALUES_BYTES - new TextEncoder().encode(canonicalize(final)).length;
  expect(applicationValues(canonicalize({ target: 7, note: "x".repeat(remaining) }), declaration, opener, PROPOSED_BOUNDS)).not.toBeNull();
  expect(applicationValues(canonicalize({ target: 7, note: "x".repeat(remaining + 1) }), declaration, opener, PROPOSED_BOUNDS)).toBeNull();
});
