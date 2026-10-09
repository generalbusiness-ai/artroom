import { expect, test } from "vitest";
import type { DeclaredDefinition, PlatformDefinition, Seed } from "@generalbusiness/artroom-contract";
import { definitionDigest } from "@generalbusiness/artroom-bytes";
import type { PlatformRule, RuleGiven } from "@generalbusiness/artroom-derive";
import { d } from "@generalbusiness/artroom-derive/testing";
import { APPLICATION_COHORT, FIRST_ACTIONS_OF, NEWEST, ROLE_LISTS, ROLE_TABLE_OF, VERSIONS, directorySeed, platform, versionOf, type Role } from "../src/index.ts";
import { rita } from "./support-founding.ts";

// The planner's decision of 2026-10-07: a changed definition carries a new version; a scope pins its version at its genesis and is
// judged and replayed by it for as long as it exists. Supporting application cohort pins require explicit selection. Plain functions: the rules are called with what a judge would give them, and no scope is run.

/** The digest of each version's data, in the definition's own domain. Version 1 matches actual main1eed91aa, including gate1 definition-byte places. */
const DIGESTS: Readonly<Record<string, string>> = {
  "platform:register@5": "sha256:4f85c4f4ad35ffc3580cba3fc3ec17f29b59cfc9ccb9eee84b7ad355125926d6",
  "platform:directory@5": "sha256:db86423258d5de0df43956187460d5ade0d3e878371c24d89c33ecd51c2b1bd5",
  "platform:membership@4": "sha256:78b3f59009f78030f88d3444187c0c7deb40c296b7f07b18d5e86a161222f831",
  "platform:rules@3": "sha256:e9ed7ebe04bf66f1dd7c2b39a43d55b5e3b71317d5e3e3cf1a96dd16b2804ed5",
  "platform:inbox@1": "sha256:2d4fb56155ddc0cf02bfc75ac89a261c35aeb3069771e4a51429319ccd204748",
  "platform:register@1": "sha256:4f85c4f4ad35ffc3580cba3fc3ec17f29b59cfc9ccb9eee84b7ad355125926d6",
  "platform:register@2": "sha256:4f85c4f4ad35ffc3580cba3fc3ec17f29b59cfc9ccb9eee84b7ad355125926d6",
  "platform:register@3": "sha256:4f85c4f4ad35ffc3580cba3fc3ec17f29b59cfc9ccb9eee84b7ad355125926d6",
  "platform:directory@1": "sha256:5463d69af0b876502c25e643160ae71cbcbafa55608082486cd9893969d9197b",
  "platform:directory@2": "sha256:053ec528406d1de077992d80f405f846940fb3c2c44f9206263e18329e1d58f6",
  "platform:directory@3": "sha256:053ec528406d1de077992d80f405f846940fb3c2c44f9206263e18329e1d58f6",
  "platform:membership@1": "sha256:78b3f59009f78030f88d3444187c0c7deb40c296b7f07b18d5e86a161222f831",
  "platform:membership@2": "sha256:78b3f59009f78030f88d3444187c0c7deb40c296b7f07b18d5e86a161222f831",
  "platform:rules@1": "sha256:84f2d2e583932e1b8d3cf565216e6c4ea14b004b65e69077e84d7d24aa727471",
  "platform:rules@2": "sha256:84f2d2e583932e1b8d3cf565216e6c4ea14b004b65e69077e84d7d24aa727471",
  "platform:destination@1": "sha256:8876db18e301991a2d8d936191598998c9b1ec9aef5ed71e4e75d08651327743",
  "platform:destination@2": "sha256:2caf58557aaf561be0696ee232f4b333d0cfb68962caec710989bc0f3ddfacc1",
  "platform:destination@3": "sha256:f73f9a4177b8a5e129a0b0e57378f7f0cae3c1dbf5f26bd8761402208e110cf3",
};

test("every shipped version resolves to its own data, pinned by digest, and version 1 of each is the data that main shipped; no other version resolves; default founding keeps the existing cohort", () => {
  expect(Object.fromEntries(Object.entries(VERSIONS).map(([named, supplied]) => [named, definitionDigest(supplied.data as unknown as DeclaredDefinition)]))).toEqual(DIGESTS);
  for (const named of Object.keys(DIGESTS)) expect(platform(named)).toBe(VERSIONS[named]);
  expect(["platform:destination@4", "platform:destination@0", "platform:destination@02", "platform:destination", "platform:task@1", "toString"].map(platform)).toEqual(Array(6).fill(null));
  // The explicit application pins do not replace the existing default cohort.
  const supporting = new Set<string>([APPLICATION_COHORT.register, APPLICATION_COHORT.directory, APPLICATION_COHORT.membership, APPLICATION_COHORT.rules]);
  const highest = Object.keys(VERSIONS).filter((named) => !supporting.has(named)).reduce<Record<string, number>>((most, named) => ({ ...most, [named.slice(0, named.lastIndexOf("@"))]: Math.max(most[named.slice(0, named.lastIndexOf("@"))] ?? 0, versionOf(named as PlatformDefinition)) }), {});
  expect(Object.fromEntries(Object.entries(NEWEST).map(([name, named]) => [name, versionOf(named)]))).toEqual(highest);
  // Version 2 adds the act `read-token` and its operation `mint-read` to the destination, and nothing to version 1.
  const [one, two] = [platform("platform:destination@1")!, platform("platform:destination@2")!];
  expect([Object.hasOwn(one.data.acts, "read-token"), Object.hasOwn(one.data.outcomes, "mint-read"), Object.hasOwn(one.rules, "mint-read"), Object.hasOwn(one.rules, "open-read-token")]).toEqual([false, false, false, false]);
  expect([Object.hasOwn(two.data.acts, "read-token"), Object.hasOwn(two.data.outcomes, "mint-read"), Object.hasOwn(two.rules, "mint-read"), Object.hasOwn(two.rules, "open-read-token")]).toEqual([true, true, true, true]);
});

/** What a rule is given in the genesis of a scope under that version, or in a later entry whose own entry 0 is that genesis. */
const genesisOf = (definition: PlatformDefinition): Seed => ({ v: 1, kind: "register", definition, creator: null, cause: d("c"), ordinal: 0 });
const inGenesis = (definition: PlatformDefinition): RuleGiven => ({ input: { type: "genesis", seed: genesisOf(definition) }, resolved: { self: 0 } } as unknown as RuleGiven);

test("a rule reads its own version from the scope's genesis: the register of each version seeds the directory of the same version, and membership of each version writes its own first lists, with destination.read-token only at version 2", () => {
  const signed = { intent: { v: 1, to: null, actor: rita.key, kind: "found", fields: {} } };
  const at = { kind: "register", scope: `sc_${"r".repeat(51)}a`, inc: `in_${"r".repeat(25)}a` };
  const found = (definition: PlatformDefinition) => ({ input: { type: "act", signed }, own: (seq: number) => (seq === 0 ? { entry: { input: { type: "genesis", seed: genesisOf(definition) } } } : null), resolved: { at } }) as unknown as RuleGiven;
  expect((["platform:register@1", "platform:register@2", "platform:register@3"] as const).map((named) => directorySeed(found(named)).definition)).toEqual(["platform:directory@1", "platform:directory@2", "platform:directory@3"]);

  const roleTable = (platform("platform:membership@1")!.rules["role-table"] as Extract<PlatformRule, { place: "effect" }>);
  const lists = (named: PlatformDefinition) => Object.fromEntries((roleTable.run(inGenesis(named)) as unknown as readonly { slot: string; value: string[] }[]).map((effect) => [effect.slot, effect.value]));
  const [one, two] = [lists("platform:membership@1"), lists("platform:membership@2")];
  expect(Object.values(one).some((list) => list.includes("destination.read-token"))).toBe(false);
  expect(Object.values(two).every((list) => list.at(-1) === "destination.read-token")).toBe(true);
  expect(Object.fromEntries(Object.entries(two).map(([slot, list]) => [slot, list.slice(0, -1)]))).toEqual(one);
  // Each version's first lists are its table, row for row (section 3.2, "The table, counted").
  for (const named of ["platform:membership@1", "platform:membership@2"]) {
    for (const role of Object.keys(ROLE_LISTS) as Role[]) {
      expect([...FIRST_ACTIONS_OF[named]![role]].sort()).toEqual(ROLE_TABLE_OF[named]!.flatMap(([actions, roles]) => (roles.includes(role) ? actions : [])).sort());
    }
  }
});
