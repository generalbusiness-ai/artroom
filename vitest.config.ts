import { defineConfig } from "vitest/config";

/**
 * Every package's vitest suite as one run (`npm test` at the root): one
 * vitest process instead of one per package and runtime. Each project keeps
 * its package's own config, and they run one after another, so a project's
 * worker settings are its own. Two packages are not listed here and run
 * after it: git, whose tests use Node's own test runner, and ui, which pins
 * a later vitest.
 */
let order = 0;
const project = (name: string, dir: string, config: string) => ({ extends: `./packages/${dir}/${config}`, test: { name, root: `./packages/${dir}`, sequence: { groupOrder: order++ } } });

export default defineConfig({
  test: {
    projects: [
      project("policy", "policy", "vitest.config.ts"),
      project("policy-workerd", "policy", "vitest.workers.config.ts"),
      project("client", "client", "vitest.config.ts"),
      project("client-workerd", "client", "vitest.workers.config.ts"),
      project("log", "log", "vitest.config.ts"),
      project("log-workerd", "log", "vitest.workers.config.ts"),
      project("room-node", "room", "vitest.node.config.ts"),
      project("room-workerd", "room", "vitest.workers.config.ts"),
      project("room-declared", "room", "vitest.declared.config.ts"),
      project("checkers", "checkers", "vitest.config.ts"),
      project("mcp", "mcp", "vitest.config.ts"),
      project("cli", "cli", "vitest.config.ts"),
    ],
  },
});
