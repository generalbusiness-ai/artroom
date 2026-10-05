import { defineConfig } from "vitest/config";

/**
 * Every package's vitest suite as one run (`npm test` at the root): one
 * vitest process instead of one per package and runtime. Each project keeps
 * its package's own config, and they run one after another, so a project's
 * worker settings are its own.
 */
let order = 0;
const project = (name: string, dir: string, config: string) => ({ extends: `./packages/${dir}/${config}`, test: { name, root: `./packages/${dir}`, sequence: { groupOrder: order++ } } });

export default defineConfig({
  test: {
    projects: [
      project("bytes", "bytes", "vitest.config.ts"),
      project("derive", "derive", "vitest.config.ts"),
      project("scope", "scope", "vitest.config.ts"),
    ],
  },
});
