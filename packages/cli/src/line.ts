/**
 * A command line, read into one of the commands of `commands.ts`. It has
 * no state of a process, so a test runs the same lines as a person types.
 */

import { act, acts, claim, install, invite, join, log, show, verify, type Context, type Outcome } from "./commands.ts";

export const USAGE = [
  "Usage:",
  "  artroom install <base-url> [--host <git-host>] [--namespace <name>]",
  "  artroom claim <name> [--handle @you] [--branch main]",
  "  artroom invite <@member> --role <role> [--hours 24]",
  "  artroom join <link>",
  "  artroom acts [<scope>]",
  "  artroom act <kind> --on <scope> [--target <item>] [--set name=value ...]",
  "  artroom log <scope> [--limit n]",
  "  artroom show <scope>:<seq>",
  "  artroom verify <scope>",
  "A scope is a scope ID, or one of: register, directory, membership, rules, destination, inbox.",
].join("\n");

/** The words of a command line: the positional ones, and each `--name value`; `--set` may be given more than once. */
export function parse(argv: readonly string[]): { words: string[]; flags: Map<string, string[]> } | null {
  const words: string[] = [];
  const flags = new Map<string, string[]>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith("--")) {
      words.push(arg);
      continue;
    }
    const value = argv[++i];
    if (value === undefined) return null;
    flags.set(arg.slice(2), [...(flags.get(arg.slice(2)) ?? []), value]);
  }
  return { words, flags };
}

const KNOWN: Record<string, readonly string[]> = {
  install: ["host", "namespace"], claim: ["handle", "branch"], invite: ["role", "acts", "hours"], join: [], acts: [], act: ["on", "target", "set"], log: ["limit"], show: [], verify: [],
};

/** Runs one command line with the given context. */
export async function command(ctx: Context, argv: readonly string[]): Promise<Outcome> {
  const parsed = parse(argv);
  const [name, first, ...rest] = parsed?.words ?? [];
  if (!parsed || name === undefined || !(name in KNOWN)) return { code: 2, lines: [USAGE] };
  const unknown = [...parsed.flags.keys()].find((flag) => !KNOWN[name]!.includes(flag));
  if (unknown !== undefined || rest.length > 0) return { code: 2, lines: [unknown !== undefined ? `${name} takes no --${unknown}.` : `${name} takes one argument.`, USAGE] };
  const flag = (f: string) => parsed.flags.get(f)?.at(-1);
  const number = (f: string) => (flag(f) === undefined ? undefined : Number(flag(f)));
  const needs = (what: string): Outcome => ({ code: 2, lines: [`${name} needs ${what}.`, USAGE] });
  switch (name) {
    case "install": return first === undefined ? needs("a base URL") : install(ctx, first, { ...(flag("host") ? { host: flag("host")! } : {}), ...(flag("namespace") ? { namespace: flag("namespace")! } : {}) });
    case "claim": return first === undefined ? needs("a name") : claim(ctx, first, { ...(flag("handle") ? { handle: flag("handle")! } : {}), ...(flag("branch") ? { branch: flag("branch")! } : {}) });
    case "invite": return first === undefined ? needs("a member's handle") : invite(ctx, first, { ...(flag("role") ? { role: flag("role")! } : {}), ...(flag("acts") !== undefined ? { acts: flag("acts")! } : {}), ...(flag("hours") ? { hours: number("hours")! } : {}) });
    case "join": return first === undefined ? needs("a link") : join(ctx, first);
    case "acts": return acts(ctx, first);
    case "act": return first === undefined ? needs("an act kind") : act(ctx, first, { ...(flag("on") ? { on: flag("on")! } : {}), ...(flag("target") ? { target: number("target")! } : {}), set: parsed.flags.get("set") ?? [] });
    case "log": return log(ctx, first, { ...(flag("limit") ? { limit: number("limit")! } : {}) });
    case "show": return first === undefined ? needs("an entry") : show(ctx, first);
    default: return verify(ctx, first);
  }
}
