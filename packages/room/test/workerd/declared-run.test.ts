/**
 * The declared run (docs/protocol.md section 33.6; request fd6f00b6,
 * condition 3; reduced under request ecbc722a).
 *
 * A few of the room's existing test files, loaded a second time, with every
 * room under the code-review `v2` declarations and the harness's four
 * fixture conversions (vocabulary.ts). The tests themselves are unchanged.
 *
 * The run was once the whole workerd suite. It is now this file, because
 * the Room dispatches by step and both vocabularies run the same step
 * handlers: under a `v2` document only admission steps 1, 4, 4a and 5,
 * grants, sessions, check jobs, recovery and what a thread records differ.
 * declared-fd6f00b6.test.ts tests those directly. What this run adds is
 * that the code-review application, as its own tests state it, still works
 * through the declarations: `WITNESSES` gives the reason for each file.
 *
 * What this run no longer shows is in its report (plans/README.md): no
 * other test file is run under `v2`.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { applied, runDeclared } from "./vocabulary.ts";

// Before the witness files are loaded: they found their rooms under the vocabulary in force when they run.
runDeclared();

const WITNESSES: readonly { file: string; shows: string; load: () => Promise<unknown> }[] = [
  {
    file: "lanes.test.ts",
    shows: "the steps open, take, version and release, and renew, leases and workspaces, reached through the declared kinds claim, propose and release",
    load: () => import("./lanes.test.ts"),
  },
  {
    file: "landing.test.ts",
    shows: "the steps review and land and the landing engine, an activation of a v2 document by a landing, and configuration recovery through recover (conversion 2)",
    load: () => import("./landing.test.ts"),
  },
  {
    file: "obligations.test.ts",
    shows: "review and check obligations, evidence and carrying, with a v2 checker configuration and the check act it names (conversion 3)",
    load: () => import("./obligations.test.ts"),
  },
  {
    file: "roster.test.ts",
    shows: "the roster op table in a v2 room, and delegations and room-custody sessions as signed maps (conversion 4)",
    load: () => import("./roster.test.ts"),
  },
];

const ran: Record<string, number> = {};

for (const w of WITNESSES)
  describe(`under the code-review v2 declarations, ${w.file}: ${w.shows}`, async () => {
    beforeEach(() => void (ran[w.file] = (ran[w.file] ?? 0) + 1));
    await w.load();
  });

describe("the declared run itself", () => {
  it("ran tests of every witness file under v2 documents, and applied each of the four conversions", () => {
    for (const w of WITNESSES) expect(ran[w.file] ?? 0, w.file).toBeGreaterThan(0);
    for (const [conversion, tests] of Object.entries(applied)) expect(tests, conversion).toBeGreaterThan(0);
  });
});
