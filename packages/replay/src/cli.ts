/**
 * The replay command (scope contract, sections 9.5 and 11.4): read one
 * scope's history from a scope service, check it, and print the report.
 *
 *   artroom-replay <service URL> <scope ID> [--mode integrity|replay]
 *       [--head <seq>:<hash>] [--anchor <scope>:<seq>:<hash>]... [--json]
 *
 * Exit codes: 0, the history is consistent; 1, it is not (mismatch, missing
 * dependency, incomplete or unsupported definition); 2, the command was not
 * understood, or the target's history could not be read.
 *
 * `main` reads no process state, so it runs wherever `fetch` does. `bin.ts`
 * is its entry under Node.
 */

import type { Head, Report } from "@generalbusiness/artroom-contract";
import { isDigest, isScopeId, positionOf } from "@generalbusiness/artroom-bytes";
import { render } from "./report.ts";
import { httpSource, type Fetch } from "./source.ts";
import { SourceError, verify, type Anchor } from "./verify.ts";

export const USAGE = "usage: artroom-replay <service URL> <scope ID> [--mode integrity|replay] [--head <seq>:<hash>] [--anchor <scope>:<seq>:<hash>]... [--json]";

/** Where the command writes, and the `fetch` it reads with. */
export interface Io { out(text: string): void; err(text: string): void; fetch?: Fetch }

export async function main(argv: readonly string[], io: Io): Promise<number> {
  const usage = (what: string): number => {
    io.err(`${what}\n${USAGE}`);
    return 2;
  };
  const positional: string[] = [];
  const anchors: Anchor[] = [];
  let mode: Report["mode"] = "replay";
  let head: Head | undefined;
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--json") json = true;
    else if (arg === "--mode" || arg === "--head" || arg === "--anchor") {
      const value = argv[++i];
      if (value === undefined) return usage(`${arg} needs a value`);
      if (arg === "--mode") {
        if (value !== "integrity" && value !== "replay") return usage("the mode is integrity or replay");
        mode = value;
      } else {
        // A digest holds a colon, so the hash is everything after the position.
        const parts = value.split(":");
        const hash = parts.slice(arg === "--head" ? 1 : 2).join(":");
        const seq = positionOf(parts[arg === "--head" ? 0 : 1]);
        if (seq === null || !isDigest(hash)) return usage(`${arg} is not a position and a hash`);
        if (arg === "--head") head = { seq, hash };
        else if (isScopeId(parts[0])) anchors.push({ scope: parts[0], seq, hash });
        else return usage("an anchor names a scope ID first");
      }
    } else if (arg.startsWith("--")) return usage(`unknown option ${arg}`);
    else positional.push(arg);
  }
  const [service, scope] = positional;
  if (positional.length !== 2 || service === undefined || !/^https?:\/\//.test(service)) return usage("give the service URL and the scope ID");
  if (!isScopeId(scope)) return usage("the second argument is not a scope ID");

  try {
    const source = httpSource(service, io.fetch ? { fetch: io.fetch } : {});
    const { report, why } = await verify(source, { mode, scope, head, anchors });
    io.out(json ? JSON.stringify({ report, why }, null, 2) : render(report, why));
    return report.result === "consistent" ? 0 : 1;
  } catch (error) {
    if (!(error instanceof SourceError)) throw error;
    io.err(`read error: ${error.message}`);
    return 2;
  }
}
