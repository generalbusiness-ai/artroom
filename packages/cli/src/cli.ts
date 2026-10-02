/** The process entry point: wires `run()` to this process. */

import { run } from "./main.ts";

export async function main(argv: readonly string[]): Promise<number> {
  return run(argv, {
    out: (line) => process.stdout.write(`${line}\n`),
    err: (line) => process.stderr.write(`${line}\n`),
    env: process.env,
    cwd: process.cwd(),
  });
}
