/**
 * The three checkers (plan section 5; lane G).
 *
 * - `TestsChecker`: `npm ci`, then `npm test`. Passes only if both exit 0.
 * - `TypesChecker`: `npm ci`, then `tsc --noEmit` from the repository's own
 *   dependencies (`npx --no-install`, so nothing unpinned is fetched).
 * - `LlmReviewer`: reads the change, asks a model for findings, and records
 *   an advisory check and a note. See llm.ts.
 *
 * Each is labelled machine-run in its detail. Each subclass only says what to
 * run; `Checker` does binding, checkout, signing and submission.
 */

import type { CheckJob, CheckOutcome } from "@generalbusiness/artroom-contract";
import { Checker } from "./checker.ts";
import { step } from "./runner.ts";

/** `npm ci`, refused without a lockfile, so the install is exactly what the commit pins. */
async function install(ws: Parameters<typeof step>[0]): Promise<CheckOutcome | null> {
  const lock = await ws.runner.exec(["test", "-f", `${ws.dir}/package-lock.json`], { env: ws.env });
  if (lock.exitCode !== 0) return { ok: false, detail: "No package-lock.json: npm ci needs one, so nothing ran." };
  const ci = await step(ws, ["npm", "ci", "--no-audit", "--no-fund"]);
  if (!ci.ok) return { ok: false, detail: `npm ci failed (exit ${ci.exitCode}):\n${ci.tail}` };
  return null;
}

export abstract class TestsChecker<Env = unknown> extends Checker<Env> {
  readonly name: string = "tests";
  readonly volatile = false;
  readonly label = "It ran `npm ci`, then `npm test`, in an isolated runner.";

  async run(job: CheckJob): Promise<CheckOutcome> {
    const ws = this.workspace(job);
    const failed = await install(ws);
    if (failed) return failed;
    const t = await step(ws, ["npm", "test"]);
    return { ok: t.ok, detail: `npm test exited ${t.exitCode}.\n${t.tail}` };
  }
}

export abstract class TypesChecker<Env = unknown> extends Checker<Env> {
  readonly name: string = "types";
  readonly volatile = false;
  readonly label = "It ran `npm ci`, then `tsc --noEmit` from the repository's own TypeScript, in an isolated runner.";

  async run(job: CheckJob): Promise<CheckOutcome> {
    const ws = this.workspace(job);
    const failed = await install(ws);
    if (failed) return failed;
    const t = await step(ws, ["npx", "--no-install", "tsc", "--noEmit"]);
    return { ok: t.ok, detail: `tsc --noEmit exited ${t.exitCode}.\n${t.tail}` };
  }
}
