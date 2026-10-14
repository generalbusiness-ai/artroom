import { expect, test } from "vitest";
import { canonicalize, definitionDigest, intentDigest } from "@generalbusiness/artroom-bytes";
import { PROPOSED_BOUNDS, type DeclaredDefinition, type MemberRef } from "@generalbusiness/dap-contract";
import { runnable, validateDefinition, type RuleGiven } from "@generalbusiness/dap-derive";
import { RULE_PROFILES } from "@generalbusiness/dap-derive/rule";
import { Directory, rita } from "./support-founding.ts";
import { definitionClosure } from "../src/definition-input.ts";
import { APPLICATION_COHORT, FILE_PUBLICATION_COHORT, APPLICATION_VALUES_BYTES, FIRST_ACTIONS_OF, NEWEST, applicationValues, applicationPublicationValues, directoryRules8, DIRECTORY_OF, SIBLINGS_OF, platform } from "../src/index.ts";

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

// Pure factory policy witness: these full refs are scripted, not a native birth proof.
test("publication factory reserves destination, injects the recorded full reference only into the exact schema, and keeps legacy values unchanged", () => {
  const destination = { kind: "destination", scope: `sc_${"b".repeat(51)}a`, inc: `in_${"b".repeat(25)}a` } as const;
  const declared: DeclaredDefinition = { ...declaration, acts: { ...declaration.acts, establish: { ...declaration.acts["establish"]!,
    fields: { ...declaration.acts["establish"]!.fields, destination: { type: "scope", kind: "destination", required: true } } } } };
  expect(applicationPublicationValues('{"target":7}', declared, opener, PROPOSED_BOUNDS, destination)).toEqual({ opener, target: 7, destination });
  expect(applicationValues(canonicalize({ target: 7, destination }), declared, opener, PROPOSED_BOUNDS)).toEqual({ opener, target: 7, destination });
  for (const definition of [declaration, declared]) {
    expect(applicationPublicationValues(canonicalize({ target: 7, destination }), definition, opener, PROPOSED_BOUNDS, destination)).toBeNull();
  }
  expect(applicationPublicationValues('{"target":7}', declaration, opener, PROPOSED_BOUNDS, null)).toEqual(applicationValues('{"target":7}', declaration, opener, PROPOSED_BOUNDS));
  expect(applicationPublicationValues('{"target":7}', declared, opener, PROPOSED_BOUNDS, null)).toBeNull();
  const wrong: DeclaredDefinition = { ...declared, acts: { ...declared.acts, establish: { ...declared.acts["establish"]!, fields: { ...declared.acts["establish"]!.fields, destination: { type: "scope", kind: "directory", required: false } } } } };
  expect(applicationPublicationValues('{"target":7}', wrong, opener, PROPOSED_BOUNDS, destination)).toBeNull();
  expect(DIRECTORY_OF[FILE_PUBLICATION_COHORT.register]).toBe(FILE_PUBLICATION_COHORT.directory);
  expect(SIBLINGS_OF[FILE_PUBLICATION_COHORT.directory]).toEqual({ membership: "platform:membership@4", rules: "platform:rules@3", destination: "platform:destination@4" });
  expect(DIRECTORY_OF[APPLICATION_COHORT.register]).toBe(APPLICATION_COHORT.directory);
  expect(SIBLINGS_OF[APPLICATION_COHORT.directory]?.destination).toBe("platform:destination@2");
  for (const named of [FILE_PUBLICATION_COHORT.register, FILE_PUBLICATION_COHORT.directory]) {
    const supplied = platform(named)!;
    const checked = validateDefinition(supplied.data, PROPOSED_BOUNDS, RULE_PROFILES, { platform: true });
    expect(checked.ok, named).toBe(true);
    if (checked.ok) expect(runnable(checked.definition, supplied.rules), named).toBe(true);
  }
});

// Directory support judges the parent rows in memory; its child genesis entries
// are scripted. This witnesses the actual F1 callback, not a complete native birth.
test("publication creation uses its recorded destination and preserves signed cause and full creator lineage", () => {
  const parent = new Directory();
  const declared: DeclaredDefinition = { ...declaration, acts: { ...declaration.acts, establish: { ...declaration.acts["establish"]!, fields: { ...declaration.acts["establish"]!.fields, destination: { type: "scope", kind: "destination", required: true } } } } };
  const definition = definitionDigest(declared);
  const fields = { definition, values: '{"target":7}', execution: "recorded-do" };
  const signed = parent.intent(rita, "establish-application", { fields });
  const membership = parent.children.membership!;
  const given = { state: parent.state, input: { type: "act", signed }, placed: () => declared,
    resolved: { at: parent.at, fields, bounds: PROPOSED_BOUNDS, signer: { member: { membership, member: "@rita" } } } } as unknown as RuleGiven;
  const rule = directoryRules8["create-application"]!;
  if (rule.place !== "send") throw new Error("factory creation must be a send rule");
  expect(rule.run(given)).toEqual({ to: { v: 1, kind: "lane", definition, creator: parent.at, cause: intentDigest(signed.intent), ordinal: 0 },
    message: { class: "request", type: "create", body: { fields: { target: 7, opener: { membership, member: "@rita" }, destination: parent.children.destination }, directory: parent.at, membership, creationContext: { v: 1 } } } });
});
