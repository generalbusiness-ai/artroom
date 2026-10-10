/**
 * A command line, read into one of the commands of `commands.ts`. It has
 * no state of a process, so a test runs the same lines as a person types.
 */

import { act, acts, claim, clone, edit, install, installPlanned, invite, issueAssign, issueClose, issueComment, issueOpen, issues, join, log, merge, planInstall, propose, remote, show, verify, type Context, type InstallCohort, type Outcome } from "./commands.ts";

export const USAGE = [
  "Usage:",
  "  artroom install <base-url> [--host <git-host>] [--namespace <name>] [--cohort application|counting-commitments]",
  "  artroom install --plan <base-url> [--host <git-host>] [--namespace <name>] [--cohort application|counting-commitments]",
  "  artroom install --planned [--cohort application|counting-commitments]",
  "  artroom claim <name> [--handle @you] [--branch main] [--again]",
  "  artroom invite <@member> --role <role> [--hours 24]",
  "  artroom join <link>",
  "  artroom acts [<scope>]",
  "  artroom act <kind> --on <scope> [--target <item>] [--set name=value ...] [--value <file> ...]",
  "  artroom log <scope> [--limit n]",
  "  artroom show <scope>:<seq>",
  "  artroom verify <scope>",
  "  artroom verify --all",
  "  artroom remote",
  "  artroom clone [<directory>] [--hours 1]",
  "  artroom edit <path> --file <local file> [--title <text>] [--closes <issue>]",
  "  artroom propose <branch> [--title <text>]",
  "  artroom merge <change> [--closes <issue>]",
  "  artroom issue open --title <text> [--body <text>]",
  "  artroom issue comment <issue> <text>",
  "  artroom issue assign <issue> <@member>",
  "  artroom issue close <issue>",
  "  artroom issues",
  "A scope is a scope ID, or one of: register, directory, membership, rules, destination, inbox.",
  "An issue is its number, as artroom issues lists it, or its lane's scope ID.",
].join("\n");

/** The flags that take no value. */
const SWITCHES: ReadonlySet<string> = new Set(["again", "all", "plan", "planned"]);

/** The words of a command line: the positional ones, each `--name value`, and each switch; `--set` may be given more than once. */
export function parse(argv: readonly string[]): { words: string[]; flags: Map<string, string[]> } | null {
  const words: string[] = [];
  const flags = new Map<string, string[]>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith("--")) {
      words.push(arg);
      continue;
    }
    if (SWITCHES.has(arg.slice(2))) {
      flags.set(arg.slice(2), ["true"]);
      continue;
    }
    const value = argv[++i];
    if (value === undefined) return null;
    flags.set(arg.slice(2), [...(flags.get(arg.slice(2)) ?? []), value]);
  }
  return { words, flags };
}

const KNOWN: Record<string, readonly string[]> = {
  install: ["host", "namespace", "plan", "planned", "cohort"], claim: ["handle", "branch", "again"], invite: ["role", "acts", "hours"], join: [], acts: [], act: ["on", "target", "set", "value"], log: ["limit"], show: [], verify: ["all"], remote: [], clone: ["hours"], edit: ["file", "title", "closes"], propose: ["title"], merge: ["closes"], issue: ["title", "body"], issues: [],
};

/** Runs one command line with the given context. */
export async function command(ctx: Context, argv: readonly string[]): Promise<Outcome> {
  const parsed = parse(argv);
  const [name, first, ...rest] = parsed?.words ?? [];
  if (!parsed || name === undefined || !(name in KNOWN)) return { code: 2, lines: [USAGE] };
  const unknown = [...parsed.flags.keys()].find((flag) => !KNOWN[name]!.includes(flag));
  if (name === "issue") return unknown !== undefined ? { code: 2, lines: [`issue takes no --${unknown}.`, USAGE] } : issue(ctx, first, rest, parsed.flags);
  if (unknown !== undefined || rest.length > 0) return { code: 2, lines: [unknown !== undefined ? `${name} takes no --${unknown}.` : `${name} takes one argument.`, USAGE] };
  const flag = (f: string) => parsed.flags.get(f)?.at(-1);
  const number = (f: string) => (flag(f) === undefined ? undefined : Number(flag(f)));
  const needs = (what: string): Outcome => ({ code: 2, lines: [`${name} needs ${what}.`, USAGE] });
  switch (name) {
    case "install": {
      const cohorts = parsed.flags.get("cohort");
      if (cohorts && (cohorts.length !== 1 || (cohorts[0] !== "application" && cohorts[0] !== "counting-commitments"))) return { code: 2, lines: ["--cohort takes exactly one value: application or counting-commitments.", USAGE] };
      const cohort = cohorts?.[0] as InstallCohort | undefined;
      const host = flag("host"), namespace = flag("namespace");
      const where = { ...((cohort ? host !== undefined : !!host) ? { host: host! } : {}), ...((cohort ? namespace !== undefined : !!namespace) ? { namespace: namespace! } : {}), ...(cohort ? { cohort } : {}) };
      if (flag("planned")) return first !== undefined || flag("plan") || flag("host") !== undefined || flag("namespace") !== undefined ? { code: 2, lines: ["install --planned takes no base URL, host or namespace: the original plan holds them.", USAGE] } : installPlanned(ctx, cohort ? { cohort } : {});
      if (first === undefined) return needs("a base URL");
      return flag("plan") ? planInstall(ctx, first, where) : install(ctx, first, where);
    }
    case "claim": return first === undefined ? needs("a name") : claim(ctx, first, { ...(flag("handle") ? { handle: flag("handle")! } : {}), ...(flag("branch") ? { branch: flag("branch")! } : {}), ...(flag("again") ? { again: true } : {}) });
    case "invite": return first === undefined ? needs("a member's handle") : invite(ctx, first, { ...(flag("role") ? { role: flag("role")! } : {}), ...(flag("acts") !== undefined ? { acts: flag("acts")! } : {}), ...(flag("hours") ? { hours: number("hours")! } : {}) });
    case "join": return first === undefined ? needs("a link") : join(ctx, first);
    case "acts": return acts(ctx, first);
    case "act": return first === undefined ? needs("an act kind") : act(ctx, first, { ...(flag("on") ? { on: flag("on")! } : {}), ...(flag("target") ? { target: number("target")! } : {}), set: parsed.flags.get("set") ?? [], value: parsed.flags.get("value") ?? [] });
    case "log": return log(ctx, first, { ...(flag("limit") ? { limit: number("limit")! } : {}) });
    case "show": return first === undefined ? needs("an entry") : show(ctx, first);
    case "remote": return first === undefined ? remote(ctx) : { code: 2, lines: ["remote takes no argument.", USAGE] };
    case "clone": return clone(ctx, first, { ...(flag("hours") ? { hours: number("hours")! } : {}) });
    case "edit": return first === undefined ? needs("a path in the repository") : edit(ctx, first, { ...(flag("file") !== undefined ? { file: flag("file")! } : {}), ...(flag("title") !== undefined ? { title: flag("title")! } : {}), ...(flag("closes") !== undefined ? { closes: flag("closes")! } : {}) });
    case "propose": return first === undefined ? needs("a local branch") : propose(ctx, first, { ...(flag("title") !== undefined ? { title: flag("title")! } : {}) });
    case "merge": return first === undefined ? needs("a change") : merge(ctx, first, { ...(flag("closes") !== undefined ? { closes: flag("closes")! } : {}) });
    case "issues": return first === undefined ? issues(ctx) : { code: 2, lines: ["issues takes no argument.", USAGE] };
    default: return verify(ctx, first, { ...(flag("all") ? { all: true } : {}) });
  }
}

/** `artroom issue open|comment|assign|close`: the words after `issue`, and its flags. Only `open` takes flags. */
function issue(ctx: Context, sub: string | undefined, words: readonly string[], flags: Map<string, string[]>): Promise<Outcome> | Outcome {
  const wrong = (what: string): Outcome => ({ code: 2, lines: [what, USAGE] });
  const flag = (f: string) => flags.get(f)?.at(-1);
  if (sub !== "open" && flags.size > 0) return wrong("Only issue open takes flags.");
  switch (sub) {
    case "open": return words.length > 0 ? wrong("issue open takes no argument: give the title with --title.") : issueOpen(ctx, { ...(flag("title") !== undefined ? { title: flag("title")! } : {}), ...(flag("body") !== undefined ? { body: flag("body")! } : {}) });
    case "comment": return words.length === 2 ? issueComment(ctx, words[0]!, words[1]!) : wrong("issue comment needs an issue and a text.");
    case "assign": return words.length === 2 ? issueAssign(ctx, words[0]!, words[1]!) : wrong("issue assign needs an issue and a member's handle.");
    case "close": return words.length === 1 ? issueClose(ctx, words[0]!) : wrong("issue close needs an issue.");
    default: return wrong("issue takes one of: open, comment, assign, close.");
  }
}
