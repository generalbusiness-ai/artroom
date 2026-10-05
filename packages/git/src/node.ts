/**
 * `Exec` for Node: one child process by `execFile`, with an argument array
 * and no shell. The environment is exactly what the caller states, with this
 * process's `PATH` so that `git` is found. Node only: nothing in the
 * package's main entry imports it.
 */

import { execFile } from "node:child_process";
import type { Exec } from "./program.ts";

export const nodeExec: Exec = (argv, opts) =>
  new Promise((resolve) => {
    const [file, ...args] = argv;
    const child = execFile(file!, args, { env: { ...opts.env, PATH: process.env["PATH"] ?? "/usr/bin:/bin" }, timeout: opts.timeoutMs, killSignal: "SIGKILL", encoding: "buffer", maxBuffer: 1 << 30 }, (error, stdout, stderr) => {
      const code = error === null ? 0 : typeof error.code === "number" ? error.code : -1;
      resolve({ code, stdout: new Uint8Array(stdout), stderr: new Uint8Array(stderr), timedOut: error !== null && error.killed === true });
    });
    child.stdin?.on("error", () => undefined);   // a child that exits before it reads
    child.stdin?.end(opts.stdin === undefined ? undefined : Buffer.from(opts.stdin));
  });
