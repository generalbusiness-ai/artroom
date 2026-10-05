#!/usr/bin/env node
/** The `artroom-replay` command under Node, which runs this file as it is. Everything else is in `cli.ts`. */

import { main } from "./cli.ts";

/** The little of Node's `process` this file uses. */
declare const process: { argv: string[]; exitCode: number | undefined; stdout: { write(text: string): unknown }; stderr: { write(text: string): unknown } };

try {
  process.exitCode = await main(process.argv.slice(2), { out: (text) => process.stdout.write(`${text}\n`), err: (text) => process.stderr.write(`${text}\n`) });
} catch (error) {
  process.stderr.write(`read error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
}
