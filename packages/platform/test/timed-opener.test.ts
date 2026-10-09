import { expect, test } from "vitest";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import { platform } from "../src/index.ts";
import { board } from "../../derive/test/fixtures-f.ts";
import { validateDefinition } from "@generalbusiness/artroom-derive";
const destination3 = platform("platform:destination@3")!.data;

// The platform opener is constant and bounded. An untrusted declared definition
// cannot authorize outside work by supplying a timed operation list.
test("timed cleanup is platform-only and refuses different kinds, oversized attempts or callback fields", () => {
  expect(validateDefinition(destination3, PROPOSED_BOUNDS, undefined, { platform: true }).ok).toBe(true);
  const refused = validateDefinition({ ...board, timed: { "job-deadline": { ...board.timed["job-deadline"]!, opens: destination3.timed["publication-checks-deadline"]!.opens } } }, PROPOSED_BOUNDS);
  expect(refused.ok).toBe(false);
  if (!refused.ok) expect(refused.problems.some((problem) => problem.path === "timed.job-deadline.opens"), JSON.stringify(refused.problems)).toBe(true);
  const missingKind = structuredClone(destination3);
  delete missingKind.outcomes["reservation-delete"];
  expect(validateDefinition(missingKind, PROPOSED_BOUNDS, undefined, { platform: true }).ok).toBe(false);
  for (const opens of [[{ kind: "push", attempts: 3 }, { kind: "mint", attempts: 1 }], [{ kind: "reservation-delete", attempts: 4 }, { kind: "mint", attempts: 1 }], [{ kind: "reservation-delete", attempts: 3, callback: "run" }, { kind: "mint", attempts: 1 }]]) {
    const wrong = structuredClone(destination3);
    wrong.timed["publication-checks-deadline"] = { ...wrong.timed["publication-checks-deadline"]!, opens } as never;
    expect(validateDefinition(wrong, PROPOSED_BOUNDS, undefined, { platform: true }).ok).toBe(false);
  }
});
