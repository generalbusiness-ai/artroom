/**
 * The `git` program under Node, for `clone`: one run with the arguments
 * given, its own output to the person's terminal, and the environment of
 * this process with the configuration that the command adds. A secret goes
 * only in that added environment, which git reads as configuration
 * (`GIT_CONFIG_COUNT`, `GIT_CONFIG_KEY_n`, `GIT_CONFIG_VALUE_n`): it is in no
 * argument or a config file written by this runner. The child program
 * controls its own output; it inherits the terminal streams. The installed
 * program, ambient environment and Git configuration are trusted, including
 * URL rewrites, proxies, redirects and helpers. This is not a sandbox for
 * the global http.extraHeader supplied by clone. No git on the
 * `PATH`: the answer is null.
 */

import { spawn } from "node:child_process";
import type { Git } from "./commands.ts";

export function nodeGit(program = "git"): Git {
  return {
    run: (args, env) => new Promise((resolve) => {
      const child = spawn(program, [...args], { env: { ...process.env, ...env }, stdio: ["ignore", "inherit", "inherit"] });
      child.on("error", (error: NodeJS.ErrnoException) => resolve(error.code === "ENOENT" ? null : 1));
      child.on("close", (code) => resolve(code ?? 1));
    }),
  };
}
