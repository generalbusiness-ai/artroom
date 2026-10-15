import { defineConfig } from "vitest/config";

/**
 * Every package's vitest suite as one run (`npm test` at the root): one
 * vitest process instead of one per package and runtime. Each project keeps
 * its package's own config. The projects that run in Node are one group and
 * run at the same time. The `scope` project runs after them, by itself: it
 * has one worker, and vitest lets projects share a group only when their
 * worker counts agree. Run one after another, the Node projects took about
 * half a second longer (5.1 seconds against 4.5 for the whole run; observed,
 * three runs each, on a shared machine with 18 cores).
 *
 * The lane scenarios on real scopes, `apps/room/lanes/test/*.scope.test.ts`,
 * run here inside the `scope` project: the same Worker, loaded once. A
 * second project in the Workers runtime pool historically added 0.7 seconds to this run,
 * and the files in the one project add 0.2 (observed, three runs each, on a
 * shared machine). The scope package does not name them: this file does.
 * `apps/room/lanes/vitest.scope.config.ts` runs them alone, in a Worker of
 * the lanes package's own, with the same classes. The command line's story,
 * `packages/cli/test/*.scope.test.ts`, and the page's story,
 * `apps/room/page/test/*.scope.test.ts`, and the MCP server's stories,
 * `packages/mcp/test/*.scope.test.ts`, run here the same way, and have no
 * Worker of their own.
 *
 * The post-sent local-denial witness has its own `scope-denial` Worker
 * runtime after `scope`. This isolates the observed unsafe-abort interaction
 * with later Operations tests; each witness still runs once in this process.
 */
const project = (name: string, dir: string, config: string, group: number, more: string[] = [], options: object = {}) =>
  ({ extends: `./${dir}/${config}`, test: { name, root: `./${dir}`, ...(more.length > 0 ? { include: ["test/**/*.test.ts", ...more] } : {}), sequence: { groupOrder: group }, ...options } });

export default defineConfig({
  test: {
    projects: [
      project("bytes", "packages/bytes", "vitest.config.ts", 0),
      project("derive", "packages/derive", "vitest.config.ts", 0),
      project("platform", "packages/platform", "vitest.config.ts", 0),
      project("git", "packages/git", "vitest.config.ts", 0),
      project("checkers", "packages/checkers", "vitest.config.ts", 0),
      project("replay", "packages/replay", "vitest.config.ts", 0),
      project("client", "packages/client", "vitest.config.ts", 0),
      project("scope", "packages/scope", "vitest.worker.config.ts", 1, ["../../apps/room/lanes/test/**/*.scope.test.ts", "../cli/test/**/*.scope.test.ts", "../../apps/room/page/test/**/*.scope.test.ts", "../mcp/test/**/*.scope.test.ts", "../../apps/counter/test/counting-route.test.ts"], {
        // The page's recorder for its screenshots runs only when asked: `PAGE_RECORD=1` (apps/room/page/test/screens.mjs). So does
        // the demo runner's recorder for its captures: `DEMO_RECORD=1` (scripts/demo-captures.ts --recorded).
        provide: { pageRecord: process.env["PAGE_RECORD"] === "1", demoRecord: process.env["DEMO_RECORD"] === "1" },
      }),
      project("scope-denial", "packages/scope", "vitest.denial.config.ts", 2),
      project("lanes", "apps/room/lanes", "vitest.config.ts", 0),
      project("cli", "packages/cli", "vitest.config.ts", 0),
      project("page", "apps/room/page", "vitest.config.ts", 0),
      project("mcp", "packages/mcp", "vitest.config.ts", 0),
      {
        extends: "./apps/counter/vitest.config.ts",
        test: { name: "counting", root: "./apps/counter", sequence: { groupOrder: 0 } },
      },
      {
        extends: "./examples/lending/vitest.config.ts",
        test: { name: "lending", root: "./examples/lending", sequence: { groupOrder: 0 } },
      },
    ],
  },
});
