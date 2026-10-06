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
 * The lane scenarios on real scopes, `packages/lanes/test/*.scope.test.ts`,
 * run here inside the `scope` project: the same Worker, loaded once. A
 * second project in the Workers runtime pool added 0.7 seconds to this run,
 * and the files in the one project add 0.2 (observed, three runs each, on a
 * shared machine). The scope package does not name them: this file does.
 * `packages/lanes/vitest.scope.config.ts` runs them alone, in a Worker of
 * the lanes package's own, with the same classes.
 */
const project = (name: string, dir: string, config: string, group: number, more: string[] = []) =>
  ({ extends: `./packages/${dir}/${config}`, test: { name, root: `./packages/${dir}`, ...(more.length > 0 ? { include: ["test/**/*.test.ts", ...more] } : {}), sequence: { groupOrder: group } } });

export default defineConfig({
  test: {
    projects: [
      project("bytes", "bytes", "vitest.config.ts", 0),
      project("derive", "derive", "vitest.config.ts", 0),
      project("platform", "platform", "vitest.config.ts", 0),
      project("git", "git", "vitest.config.ts", 0),
      project("checkers", "checkers", "vitest.config.ts", 0),
      project("replay", "replay", "vitest.config.ts", 0),
      project("client", "client", "vitest.config.ts", 0),
      project("scope", "scope", "vitest.config.ts", 1, ["../lanes/test/**/*.scope.test.ts"]),
      project("lanes", "lanes", "vitest.config.ts", 0),
    ],
  },
});
