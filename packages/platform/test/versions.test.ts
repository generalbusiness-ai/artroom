import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { PROPOSED_BOUNDS, type DeclaredDefinition, type PlatformDefinition, type Seed } from "@generalbusiness/artroom-contract";
import { definitionDigest, entryHash, intentDigest, signIntent, utf8 } from "@generalbusiness/artroom-bytes";
import { outcomeValueDomains, PROFILES, runnable, validateDefinition, type Own, type PlatformRule, type RuleGiven } from "@generalbusiness/artroom-derive";
import { keys, d } from "@generalbusiness/artroom-derive/testing";
import { definitions, NEWEST, VERSIONS, platform, ROLE_LISTS, DIRECTORY, REGISTER, MEMBERSHIP, DESTINATION, RULES_SCOPE } from "../src/index.ts";
import { RULES } from "../src/rules.ts";
import { directorySeed } from "../src/future-2/register.ts";
import { directorySeed as nativeDirectorySeed } from "../src/register.ts";
import { foundingObjects } from "../src/future-2/destination-objects.ts";
import { foundingObjects as nativeFounding } from "../src/destination-objects.ts";
import { foundingOf } from "../src/future-2/destination.ts";
import { Branch } from "./support-destination.ts";
import { Roster, rita } from "./support.ts";

// Invariant: native source093's data, executable module bytes and defaults
// survive adding exact future entries; newest/classification never resolve an
// unknown version or silently supply @2 for a native @1 pin.
test("the exact catalog preserves native source and data identity and refuses unknown names independently of newest", () => {
  const archive = JSON.parse(readFileSync(new URL("./fixtures/native-093-source.json", import.meta.url), "utf8")) as { source: string; modules: Record<string, string> };
  expect(archive.source).toBe("0938010b54e27d436ea1feb92dce6e843ac7bf54");
  for (const [file, digest] of Object.entries(archive.modules)) expect(createHash("sha256").update(readFileSync(new URL(`../src/${file}`, import.meta.url))).digest("hex"), file).toBe(digest);
  expect([REGISTER, DIRECTORY, MEMBERSHIP, RULES_SCOPE, DESTINATION]).toEqual(["platform:register@1", "platform:directory@1", "platform:membership@1", "platform:rules@1", "platform:destination@1"]);
  for (const [name, data] of Object.entries(definitions)) {
    const native = platform(`${name}@1`)!;
    expect(native.data).toBe(data);
    expect(native.rules).toBe(RULES[name as keyof typeof RULES]);
  }
  expect(["platform:destination@3", "platform:membership@99", "platform:directory@02", "platform:register", "toString"].map(platform)).toEqual(Array(5).fill(null));
  expect(NEWEST["platform:register"]).toBe("platform:register@2");
  const one = platform("platform:destination@1")!;
  const two = platform("platform:destination@2")!;
  expect([one.data.acts["read-token"], one.rules["mint-read"]]).toEqual([undefined, undefined]);
  expect(two.data.acts["read-token"]).toMatchObject({ on: "branch", grant: "destination.read-token", fields: { hours: { min: 1, max: 24 } } });
  for (const [named, supplied] of Object.entries(VERSIONS)) {
    const checked = validateDefinition(JSON.parse(JSON.stringify(supplied.data)), PROPOSED_BOUNDS, PROFILES, { platform: true, outcomeValues: outcomeValueDomains(supplied.data, supplied.rules) });
    expect(checked.ok, named).toBe(true);
    if (!checked.ok) continue;
    expect(runnable(checked.definition, supplied.rules)).toBe(true);
  }
  // These current Gate1 byte places are preserved in both future and native
  // data; restoring donor's original-main @1 would lose them.
  expect(platform("platform:directory@1")!.data.acts["open-pr"]!.fields["definition"]).toHaveProperty("value");
  expect(platform("platform:directory@2")!.data.acts["open-pr"]!.fields["definition"]).toHaveProperty("value");
  expect(platform("platform:rules@1")!.data.acts["activate"]!.fields["digest"]).toHaveProperty("value");
  expect(platform("platform:rules@2")!.data.acts["activate"]!.fields["digest"]).toHaveProperty("value");
});

// STAND-INS: the rule input's seed/own genesis and creator are scripted; Roster
// is the documented in-memory native membership below a made-up office. This
// shows pure catalog/rule/observation behavior, not @2 runtime authority.
test("pinned future rules choose their own siblings and grants without reinterpreting native observations or founding bytes", () => {
  const seed = (named: PlatformDefinition): Seed => ({ v: 1, kind: named.startsWith("platform:membership@") ? "membership" : "register", definition: named, creator: null, cause: d("c"), ordinal: 0 });
  const inGenesis = (named: PlatformDefinition) => ({ input: { type: "genesis", seed: seed(named) }, resolved: { self: 0 } }) as unknown as RuleGiven;
  const signed = signIntent({ v: 1, to: null, actor: keys.rita.key, kind: "found", on: null, expected: {}, fields: {}, idempotencyKey: "source-pin", notAfter: "2026-10-08T12:00:00Z" }, keys.rita.secret);
  const at = { kind: "register", scope: `sc_${"r".repeat(51)}a`, inc: `in_${"r".repeat(25)}a` };
  const given = (named: PlatformDefinition) => ({ input: { type: "act", signed }, own: (seq: number) => seq === 0 ? { entry: { input: { type: "genesis", seed: seed(named) } } } : null, resolved: { at } }) as unknown as RuleGiven;
  expect(nativeDirectorySeed(given("platform:register@1")).definition).toBe("platform:directory@1");
  expect(directorySeed(given("platform:register@2")).definition).toBe("platform:directory@2");
  expect(directorySeed(given("platform:register@2")).cause).toBe(intentDigest(signed.intent));
  const lists = (named: PlatformDefinition) => {
    const rule = platform(named)!.rules["role-table"] as Extract<PlatformRule, { place: "effect" }>;
    return Object.fromEntries((rule.run(inGenesis(named)) as unknown as readonly { slot: string; value: string[] }[]).map((effect) => [effect.slot, effect.value]));
  };
  const old = lists("platform:membership@1");
  const next = lists("platform:membership@2");
  expect(Object.values(old).every((actions) => !actions.includes("destination.read-token"))).toBe(true);
  for (const slot of Object.values(ROLE_LISTS)) expect(next[slot]).toEqual([...old[slot]!, "destination.read-token"]);
  // Equal declarative bytes do not imply equal executable/observation identity.
  expect(definitionDigest(platform("platform:membership@1")!.data as unknown as DeclaredDefinition)).toBe(definitionDigest(platform("platform:membership@2")!.data as unknown as DeclaredDefinition));
  const roster = new Roster().seated();
  expect(platform("platform:membership@1")!.observed!(roster.state, { of: roster.at, key: rita.key })).toHaveProperty("definition", "platform:membership@1");
  expect(platform("platform:membership@2")!.observed!(roster.state, { of: roster.at, key: rita.key })).toHaveProperty("definition", "platform:membership@2");
  const claim = { at: roster.at, seq: 0, hash: d("a") };
  const scope = `sc_${"g".repeat(51)}a` as const;
  const time = "2026-10-03T02:40:00Z" as const;
  expect(foundingObjects("sha1", scope, time, claim)).toEqual(nativeFounding("sha1", scope, time, claim));
  const readme = { name: "demo", handle: "@rita", directory: scope };
  const future = foundingObjects("sha1", scope, time, claim, readme);
  expect(future.objects.find((object) => object.kind === "blob")!.body).toEqual(utf8(`# demo\n\nFounded by @rita through the room ${scope}.\n`));
  expect(future.commit).not.toBe(nativeFounding("sha1", scope, time, claim).commit);
  // Script only the own-genesis pin and README fields at the pure helper
  // boundary; no future scope admission is claimed.
  const branch = new Branch(false);
  const original = branch.own(0)!.entry;
  const input = original.input;
  if (input.type !== "genesis") return expect.fail("fixture genesis is required");
  const page = () => ({ ...branch.state.page("branch", ["empty", "ready"], null, 1), items: [{ ...branch.branch, values: { ...branch.branch.values, founderHandle: "@rita" } }] });
  const own = (named: PlatformDefinition): Own => (seq) => {
    if (seq !== 0) return branch.own(seq);
    const entry = { ...original, input: { ...input, seed: { ...input.seed, definition: named } } };
    return { entry, hash: entryHash(entry) };
  };
  const empty = foundingOf({ page }, own("platform:destination@1"), "sha1");
  expect(empty.objects.some((object) => object.kind === "blob")).toBe(false);
  const named = foundingOf({ page }, own("platform:destination@2"), "sha1");
  expect(named.objects.find((object) => object.kind === "blob")!.body).toEqual(utf8(`# demo\n\nFounded by @rita through the room ${branch.bureau.at.scope}.\n`));
  expect(() => foundingOf({ page }, own("platform:destination@99"), "sha1")).toThrow("unsupported destination founding version");
  expect(() => foundingOf({ page }, own("platform:register@2"), "sha1")).toThrow("unsupported destination founding version");
});

// Invariant: modifying a caller's wrapper cannot replace catalog code on the
// next lookup, while native shared data/rules retain their original identity.
test("each exact lookup has an independent wrapper and exposed catalog wrappers cannot poison subsequent selection", () => {
  const first = platform("platform:membership@1")!;
  const rules = first.rules;
  Object.assign(first, { rules: {} });
  const next = platform("platform:membership@1")!;
  expect(next).not.toBe(first);
  expect(next.rules).toBe(rules);
  expect(next.data).toBe(definitions["platform:membership"]);
  expect(Reflect.set(VERSIONS["platform:membership@1"]!, "rules", {})).toBe(false);
  expect(platform("platform:membership@1")!.rules).toBe(rules);
});
