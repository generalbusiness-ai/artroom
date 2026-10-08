/**
 * The `artroom` command under Node: the arguments, the files of
 * `files.ts`, the runtime's `fetch`, and the command line of `line.ts`. A
 * command's lines go to standard output when it is done, and to standard
 * error otherwise; the exit code is the command's.
 */

import { configDir, fileStore } from "./files.ts";
import { nodeGit } from "./git.ts";
import { command } from "./line.ts";

/** The command under Node. Returns the exit code. */
export async function main(argv: readonly string[]): Promise<number> {
  const outcome = await command({ store: fileStore(configDir()), git: nodeGit() }, argv);
  (outcome.code === 0 ? process.stdout : process.stderr).write(`${outcome.lines.join("\n")}\n`);
  return outcome.code;
}
