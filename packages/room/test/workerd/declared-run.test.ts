/**
 * The declared run (docs/protocol.md section 33.6; request fd6f00b6,
 * condition 3; reduced under request ecbc722a).
 *
 * Some of the room's existing tests, run a second time, with every room
 * under the code-review `v2` declarations and the harness's four fixture
 * conversions (vocabulary.ts). The tests themselves are unchanged.
 *
 * The run was once the whole workerd suite. It is now this file, because
 * the Room dispatches by step and both vocabularies run the same step
 * handlers: under a `v2` document only admission steps 1, 4, 4a and 5,
 * grants, sessions, check jobs, recovery and what a thread records differ.
 * declared-fd6f00b6.test.ts tests those directly. What this run adds is
 * that the code-review application, as its own tests state it, still works
 * through the declarations. `WITNESSES` names the tests and gives the
 * reason for each group. No other test runs under `v2`.
 */

import { beforeEach, describe, expect, it } from "vitest";
import type { RunnerTestSuite } from "vitest";
import { applied, runDeclared } from "./vocabulary.ts";

// Before the witness files are loaded: they found their rooms under the vocabulary in force when they run.
runDeclared();

interface Witness {
  readonly file: string;
  /**
   * The tests of the file that run here: those whose name, with its describe titles, matches. The rest are skipped
   * here, and run as written in their own file. The files belong to other requests and their titles may change, so
   * if nothing matches, the whole file runs.
   */
  readonly only: RegExp;
  readonly shows: string;
  readonly load: () => Promise<unknown>;
}

const WITNESSES: readonly Witness[] = [
  {
    file: "acts.test.ts",
    only: /R-LANE|R-PROP-1, R-PROP-2|R-ADMIN|R-LAND-7: reservation|policy activation during preparation|builds the same bytes at reservation/,
    shows:
      "the steps open, take and release, renewal and expiry, and a version with its pin, reached through the declared kinds claim, release and propose (conversion 1); the steps review and land with the landing engine, reservation, an activation while a landing is prepared, and configuration recovery through recover (conversion 2)",
    load: () => import("./acts.test.ts"),
  },
  {
    file: "obligations.cases.ts",
    only: /R-OBL-3|R-OBL-5|R-LAND-1|R-REV-3/,
    shows: "review and check obligations and revoked evidence, with a v2 checker configuration and the check act it names (conversion 3)",
    load: () => import("./obligations.cases.ts"),
  },
  {
    file: "roster.cases.ts",
    only: /R-GEN-4|R-ADM-3b|R-ADM-4|R-ADM-5|MCP redemption/,
    shows: "the roster op table in a v2 room, and delegations and a room-custody session as signed maps (conversion 4)",
    load: () => import("./roster.cases.ts"),
  },
];

/** Every test below a suite: its ID, and its name with the describe titles above it. */
function testsOf(suite: Readonly<RunnerTestSuite>, above = ""): [id: string, name: string][] {
  return suite.tasks.flatMap((t) => (t.type === "suite" ? testsOf(t, `${above}${t.name} > `) : [[t.id, `${above}${t.name}`] as [string, string]]));
}

const ran: Record<string, number> = {};

for (const w of WITNESSES) {
  const title = `under the code-review v2 declarations, ${w.file}: ${w.shows}`;
  describe(title, async () => {
    let chosen: Set<string> | undefined;
    beforeEach(({ task, skip }) => {
      if (!chosen) {
        let top = task.suite!;
        while (top.name !== title) top = top.suite!;
        const all = testsOf(top);
        const matching = all.filter(([, name]) => w.only.test(name));
        chosen = new Set((matching.length > 0 ? matching : all).map(([id]) => id));
      }
      if (!chosen.has(task.id)) skip();
      ran[w.file] = (ran[w.file] ?? 0) + 1;
    });
    await w.load();
  });
}

describe("the declared run itself", () => {
  it("ran tests of every witness file under v2 documents, and applied each of the four conversions", () => {
    for (const w of WITNESSES) expect(ran[w.file] ?? 0, w.file).toBeGreaterThan(0);
    for (const [conversion, tests] of Object.entries(applied)) expect(tests, conversion).toBeGreaterThan(0);
  });
});
