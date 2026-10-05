import { defineConfig } from "vitest/config";

/**
 * Every package's vitest suite as one run (`npm test` at the root): one
 * vitest process instead of one per package and runtime. Each project keeps
 * its package's own config, and they run one after another, so a project's
 * worker settings are its own.
 *
 * The lane scenarios on real scopes, `packages/lanes/test/*.scope.test.ts`,
 * run here inside the `scope` project: the same Worker, loaded once. A
 * second project in the Workers runtime pool added 0.7 seconds to this run,
 * and the files in the one project add 0.2 (observed, three runs each, on a
 * shared machine). The scope package does not name them: this file does.
 * `packages/lanes/vitest.scope.config.ts` runs them alone, in a Worker of
 * the lanes package's own, with the same classes.
 */
let order = 0;
const project = (name: string, dir: string, config: string, more: string[] = []) =>
  ({ extends: `./packages/${dir}/${config}`, test: { name, root: `./packages/${dir}`, ...(more.length > 0 ? { include: ["test/**/*.test.ts", ...more] } : {}), sequence: { groupOrder: order++ } } });

export default defineConfig({
  test: {
    projects: [
      project("bytes", "bytes", "vitest.config.ts"),
      project("derive", "derive", "vitest.config.ts"),
      project("platform", "platform", "vitest.config.ts"),
      project("replay", "replay", "vitest.config.ts"),
      project("client", "client", "vitest.config.ts"),
      project("scope", "scope", "vitest.config.ts", ["../lanes/test/**/*.scope.test.ts"]),
      project("lanes", "lanes", "vitest.config.ts"),
    ],
  },
});
