import { expect, test } from "vitest";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import { overMax, runnable, validateDefinition, type StateView } from "@generalbusiness/artroom-derive";
import { RULE_PROFILES } from "@generalbusiness/artroom-derive/rule";
import { APPLICATION_COHORT, COUNTING_COHORT, DIRECTORY_OF, FIRST_ACTIONS_OF, NEWEST, SIBLINGS_OF, membership, platform } from "../src/index.ts";

// Actual platform data/common admission function; counts are a SCRIPTED state.
// This proves no native transaction, concurrent admission, expiry or session.
test("explicit Counting cohort uses bounded native live rows while preserving old data, defaults and separate domain grants", () => {
  expect(COUNTING_COHORT).toEqual({ register: "platform:register@6", directory: "platform:directory@6", membership: "platform:membership@5", rules: "platform:rules@3", destination: "platform:destination@2", inbox: "platform:inbox@1" });
  expect(DIRECTORY_OF[COUNTING_COHORT.register]).toBe(COUNTING_COHORT.directory);
  expect(SIBLINGS_OF[COUNTING_COHORT.directory]).toEqual({ membership: COUNTING_COHORT.membership, rules: COUNTING_COHORT.rules, destination: COUNTING_COHORT.destination });
  expect(NEWEST).toEqual({ "platform:register": "platform:register@3", "platform:directory": "platform:directory@3", "platform:membership": "platform:membership@2", "platform:rules": "platform:rules@2", "platform:destination": "platform:destination@3", "platform:inbox": "platform:inbox@1" });
  for (const pin of ["platform:membership@1", "platform:membership@2", APPLICATION_COHORT.membership]) {
    expect(platform(pin)!.data).toBe(membership);
    expect([platform(pin)!.data.items["member"]!.max, platform(pin)!.data.items["key"]!.max]).toEqual([10000, 10000]);
  }
  for (const [role, actions] of Object.entries(FIRST_ACTIONS_OF[COUNTING_COHORT.membership]!)) {
    expect(actions).toEqual(FIRST_ACTIONS_OF[APPLICATION_COHORT.membership]![role as keyof typeof FIRST_ACTIONS_OF[string]]);
    expect(actions.some(action => action.startsWith("counting."))).toBe(false);
  }
  for (const pin of Object.values(COUNTING_COHORT)) {
    const supplied = platform(pin)!;
    const checked = validateDefinition(supplied.data, PROPOSED_BOUNDS, RULE_PROFILES, { platform: true });
    expect(checked.ok ? [] : checked.problems, pin).toEqual([]);
    if (checked.ok) expect(runnable(checked.definition, supplied.rules), pin).toBe(true);
  }
  const checked = validateDefinition(platform(COUNTING_COHORT.membership)!.data, PROPOSED_BOUNDS, RULE_PROFILES, { platform: true });
  if (!checked.ok) return expect.fail("the complete new membership must validate before checking admission");
  const counts: Record<string, Record<string, number>> = {
    member: { invited: 14, active: 1, removed: 500, lapsed: 500 },
    key: { invited: 30, active: 1, retired: 500, compromised: 500, lapsed: 500 },
  };
  const view = { count: (type: string, state: string) => counts[type]?.[state] ?? 0 } as StateView;
  expect([overMax(view, checked.definition, "member", "invited"), overMax(view, checked.definition, "member", "active"), overMax(view, checked.definition, "key", "invited"), overMax(view, checked.definition, "key", "active")]).toEqual([null, null, null, null]);
  counts["member"]!["invited"] = counts["member"]!["invited"]! + 1;
  counts["key"]!["invited"] = counts["key"]!["invited"]! + 1;
  expect([overMax(view, checked.definition, "member", "invited"), overMax(view, checked.definition, "member", "active"), overMax(view, checked.definition, "key", "invited"), overMax(view, checked.definition, "key", "active")].every(Boolean)).toBe(true);
  counts["member"]!["invited"] = counts["member"]!["invited"]! - 1; counts["member"]!["lapsed"] = counts["member"]!["lapsed"]! + 1;
  counts["key"]!["invited"] = counts["key"]!["invited"]! - 1; counts["key"]!["lapsed"] = counts["key"]!["lapsed"]! + 1;
  expect([overMax(view, checked.definition, "member", "invited"), overMax(view, checked.definition, "key", "active")]).toEqual([null, null]);
});
