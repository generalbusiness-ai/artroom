/** Public capture observations in the producer's owner-only home. */
import { constants, closeSync, fstatSync, lstatSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { canonicalize, keyIdOfSecret, textDigest } from "@generalbusiness/artroom-bytes";
import type { Context } from "../../packages/cli/src/commands.ts";
import type { Room } from "./rehearse.ts";
import { captureBinding, type CaptureObservations } from "./capture-binding.ts";
export { captureBinding, observeCaptures, initializeCapture, type CaptureObservations } from "./capture-binding.ts";
export const CAPTURE_CONTEXT = "capture-observations.json";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const same = (a: unknown, b: unknown) => canonicalize(a) === canonicalize(b);
const stop = (): never => { throw new Error("Capture binding is missing, unsupported or inconsistent."); };

/** Local source association: Git head/tree, capture tool and locked dependency
 * bytes, plus changed/untracked relevant runtime source. No deployed identity
 * or remote semantic archive is inferred from this local snapshot. */
export function captureSource(): string {
  const git = (args: string[]) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
  const paths = new Set(["scripts/demo/rehearse.ts", "scripts/demo/capture-context.ts", "scripts/demo/capture-binding.ts", "scripts/demo-run.ts", "scripts/demo-captures.ts", "package.json", "package-lock.json"]);
  const changed = [...git(["diff", "--name-only", "HEAD", "--"]).split("\n"), ...git(["ls-files", "--others", "--exclude-standard"]).split("\n")];
  for (const path of changed) if (/^packages\/(cli|client|platform|scope|bytes|contract|derive|lanes)\/src\/.*\.(ts|json)$/.test(path)) paths.add(path);
  return canonicalize({ head: git(["rev-parse", "HEAD"]), tree: git(["rev-parse", "HEAD^{tree}"]), localCaptureAndChangedRuntime: textDigest(canonicalize([...paths].sort().map((path) => {
    const absolute = join(ROOT, path);
    if (!lstatSync(absolute).isFile()) return stop();
    return [path, readFileSync(absolute, "utf8")];
  }))) });
}

/** Local owner-home reads only: no supplied metadata pathname selects these files. */
export function ownerJson(homePath: string, file: "config.json" | typeof CAPTURE_CONTEXT): unknown {
  const dir = lstatSync(homePath);
  const uid = process.getuid?.();
  if (!dir.isDirectory() || dir.isSymbolicLink() || (dir.mode & 0o077) !== 0 || (uid !== undefined && dir.uid !== uid)) return stop();
  const fd = openSync(join(homePath, file), constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || (stat.mode & 0o077) !== 0 || (uid !== undefined && stat.uid !== uid) || stat.size > 4 * 1024 * 1024) return stop();
    return JSON.parse(readFileSync(fd, "utf8"));
  } finally { closeSync(fd); }
}

export async function keepCaptureObservations(homePath: string, ctx: Context, room: Room, births: CaptureObservations["births"]): Promise<void> {
  const config = await ctx.store.config();
  if (!config) return stop();
  if (!same(ownerJson(homePath, "config.json"), config)) return stop();
  const secret = await ctx.store.secret(config.key);
  if (!secret) return stop();
  const observed: CaptureObservations = { v: 1, source: captureSource(), service: config.service, config: textDigest(canonicalize(config)), actor: keyIdOfSecret(secret), births };
  captureBinding(config, observed, config.service, room, observed.source);
  writeFileSync(join(homePath, CAPTURE_CONTEXT), `${JSON.stringify(observed)}\n`, { flag: "wx", mode: 0o600 });
}
