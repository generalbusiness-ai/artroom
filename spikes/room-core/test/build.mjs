// Bundles src/profile.ts and src/room.ts for Node tests into test/.build/.
// `cloudflare:workers` is replaced by a minimal DurableObject base class.
// In the "fault" build, ./glob throws a TypeError for the pattern
// "__inject_fault__": a test-only way to raise an unexpected host fault.
import { build } from "esbuild";

const workersStub = {
  name: "workers-stub",
  setup(b) {
    b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: "workers", namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }", loader: "js" }));
  },
};
const faultyGlob = {
  name: "faulty-glob",
  setup(b) {
    b.onResolve({ filter: /^\.\/glob$/ }, (a) => ({ path: a.resolveDir + "/glob.ts", namespace: "faulty" }));
    b.onLoad({ filter: /.*/, namespace: "faulty" }, async (a) => {
      const { readFile } = await import("node:fs/promises");
      const src = await readFile(a.path, "utf8");
      return {
        loader: "ts",
        resolveDir: a.path.replace(/\/[^/]+$/, ""),
        contents: src.replace("export function glob(path: string, pattern: string): boolean {",
          'export function glob(path: string, pattern: string): boolean {\n  if (pattern === "__inject_fault__") throw new TypeError("injected host fault");'),
      };
    });
  },
};
const common = { bundle: true, platform: "node", format: "esm", external: ["jsonata"], logLevel: "warning" };
await build({ ...common, entryPoints: ["src/profile.ts"], outfile: "test/.build/profile.mjs" });
await build({ ...common, entryPoints: ["src/room.ts"], outfile: "test/.build/room.mjs", plugins: [workersStub] });
await build({ ...common, entryPoints: ["src/room.ts"], outfile: "test/.build/room-fault.mjs", plugins: [workersStub, faultyGlob] });
