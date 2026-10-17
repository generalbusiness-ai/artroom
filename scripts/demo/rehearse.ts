/**
 * The rehearsal of the demo script's middle (notes/reports/2026-10-07-demo-script-draft.md, shots 3 to 12, in the order of the 23:00
 * sprint report's observed run): each shot is one command line, run by the command line's own function `command` with the
 * person's `Context`, or one read of `git log` or of a page. Each shot states the exit code and the lines it expects; the
 * rehearsal records what was printed, how long it took and whether it matches.
 *
 * It runs in any runtime: `scripts/demo-run.ts` gives it Node's files, `git` and `fetch` against a deployment, and
 * `apps/room/lanes/test/demo.scope.test.ts` gives it the test Worker's routes on real scopes, with the stand-ins that test names.
 *
 * A secret is never in what it records: an invitation link is cut to its first letters wherever a line or a typed command holds
 * one, and nothing else that it prints holds a secret (a read token is never printed by `dap clone`; a key is printed by its ID).
 */

import { b64url, digestBytes, entryHash, canonicalize, intentDigest, isPlatformDefinition, isReceipt, isScopeId, isScopeRef, isSignedIntentShape, keyIdOfSecret, platformName, scopeIdOf, timeOf, utf8, verifySignedIntent } from "@generalbusiness/artroom-bytes";
import { ScopeHandle, httpTransport, requestSession, secretSigner, sessionRequest, signedReads } from "@generalbusiness/artroom-client";
import { command, type Context, type Outcome } from "@generalbusiness/dap-cli";
import { DEMO_DIGESTS, MANIFEST_DIGESTS, changeDemo, changeDemo3, issueDemo } from "@generalbusiness/dap-lanes";
import { firstExtents, platform } from "@generalbusiness/dap-platform";

/** The three people of the script, each with a fresh config directory. Hardware identity is not verified. */
export type Person = "founder" | "member" | "maintainer";
export const HANDLES: Readonly<Record<Person, string>> = { "founder": "@hugh", member: "@una", maintainer: "@paul" };

/** The local files the people's commands read, by the names they type. */
export const FILES: Readonly<Record<string, Uint8Array>> = {
  "issue-demo.json": utf8(canonicalize(issueDemo)),
  "change-demo.json": utf8(canonicalize(changeDemo)),
  "change-demo3.json": utf8(canonicalize(changeDemo3)),
  "start.md": utf8("# Getting started\n\nClone the room, then edit a page.\n"),
  "concurrent.md": utf8("# Concurrent edit\n\nA second change, proposed again after the head advances.\n"),
  "agents.md": utf8("# Agents\n\nAsk before you push.\n"),
};

/** One page as a reader's browser gets it. */
export interface Fetched { status: number; type: string; body: string }

/** What the rehearsal runs on. A deployment's is `demo-run.ts`; the test Worker's is the test's. */
export interface Stage {
  /** The scope service's base URL, the Git host and the namespace, as `dap install` takes them. */
  service: string;
  host: string;
  namespace: string;
  /** The name of the room that the founder claims. */
  name: string;
  /** A fresh context for one person, whose `read` gives the bytes of `FILES` by name. Called once for each person. */
  person(who: Person): Context | Promise<Context>;
  /** The operator pins the planned register in the Git host's setting. Resolves when it is set; the answer is a note for the transcript. */
  pin(register: string): Promise<string>;
  /** A plain GET, as a browser reads a page. */
  get(url: string): Promise<Fetched>;
  /** `git -C <directory> log --oneline`, in the member's working directory. */
  log(directory: string): Promise<Outcome>;
  /** Opt in to the two-text-file manifest sequence after shot 16. */
  manifest?: boolean;
  /** Prepare and commit a local branch in the member's clone; returned lines record the Git operations, not Artroom acts. */
  prepareBranch?(branch: string, files: readonly { path: string; bytes: Uint8Array }[]): Promise<Outcome>;
  /** The wall clock, in milliseconds. The default is `Date.now`. */
  now?(): number;
  /** A monotonic millisecond clock for test injection; production uses `performance.now()`. */
  monotonic?(): number;
  /** Before a runnable shot starts, its secrets cut. Awaited before any command or read and before its timer. */
  beforeShot?(shot: NextShot): Promise<void>;
  /** Told each shot as it ends, its secrets cut: for a person who watches the run. */
  told?(shot: Taken): void;
}

/** What is about to run. Invitation links remain cut on the recording screen. */
export interface NextShot { n: number; title: string; scene: string; who: string; typed: string }

/** Runner-local elapsed time, not a native fact or server-only latency. */
export interface StaleRefusalTiming {
  milliseconds: number;
  at: string;
  service: string;
  host: string;
  method: "performance.now()" | "injected monotonic clock";
}

/** What one shot did. */
export interface Taken {
  n: number;
  title: string;
  /** The shot of the demo script that this shot shows. */
  scene: string;
  who: string;
  /** When it started, in ISO form. */
  at: string;
  /** The command as typed, after the prompt, its secrets cut. */
  typed: string;
  code: number;
  /** The lines printed, its secrets cut. */
  lines: string[];
  seconds: number;
  /** Only the stale merge command, excluding the fresh proposal and publication. */
  staleRefusal?: StaleRefusalTiming;
  expected: { code: number; lines: string[] };
  match: boolean;
  /** Why the shot does not match, or null. */
  why: string | null;
  /** What happened between this shot and the next that no command printed, such as the operator's setting. */
  note: string | null;
}

/** The ids of the room, for `demo-captures.ts`. No secret. */
export interface Room {
  service: string;
  register?: string;
  directory?: string;
  membership?: string;
  rules?: string;
  destination?: string;
  issue?: string;
  published?: string;
  controlled?: string;
  stale?: string;
  reproposed?: string;
  refused?: string;
}

export interface Rehearsal { shots: Taken[]; room: Room; ok: boolean }

/** The values a shot's lines named, by the name of their place in the expected lines; a later shot types them. */
export type CapturedValues = Record<string, string>;

class Missing extends Error {}

/** A shot: who runs what, and the exit code and lines it expects. */
interface Shot {
  title: string;
  scene: string;
  who: Person;
  /** The command as typed: a `dap` command line, `git ...`, or `GET <url>`. */
  typed(v: CapturedValues): string[];
  expect: { code: number; lines: (v: CapturedValues) => string[] };
  /** After the shot ends: what the stage does that no command prints. */
  after?(v: CapturedValues, stage: Stage): Promise<string>;
}

const slash = (service: string) => service.replace(/\/+$/, "");
const bytes = (name: string) => FILES[name]!.length;
export const INSTALL_ACKNOWLEDGEMENT = "Service-acknowledged identity recovery. The original plan and receipt are retained for later history verification.";

/** The setting the operator must pin before the planned install. */
export const registerSetting = (host: string): string => host === "github.com" ? "GITHUB_APP_CONFIG.registerScope"
  : host === "artifacts" ? "ARTIFACTS_CONFIG.registerScope" : "registerScope in the Git host's setting";

/**
 * The shots. An expected line is a template: `<name>` stands for any text without a space and keeps it under that name,
 * `<...>` stands for any text, and `{name}` is a value an earlier line kept. A typed command names kept values the same way.
 */
function shots(stage: Stage): Shot[] {
  const service = slash(stage.service);
  const site = (path: string) => `${service}/site/{directory}/HEAD/${path}`;
  const took = (scope: string) => `Took effect: entry {${scope}}:<seq>, hash <hash>.`;
  const page = (title: string, shows: string | null) => [`HTTP 200, text/html; charset=utf-8`, `Title: ${title}`, ...(shows ? [`Shows: "${shows}"`] : [])];
  const list: Shot[] = [
    {
      title: "Plan the install", scene: "3", who: "founder",
      typed: () => ["dap", "install", "--plan", stage.service, "--host", stage.host, "--namespace", stage.namespace],
      expect: { code: 0, lines: () => [
        `Planned: register <register>, under <registerDefinition>, on host ${stage.host}, namespace ${stage.namespace}. The seed's time is <until>.`,
        "Set registerScope to {register} in the Worker's host setting, then run dap install --planned before {until}.",
      ] },
      after: (v, s) => s.pin(v["register"]!),
    },
    {
      title: "Install as planned", scene: "3", who: "founder",
      typed: () => ["dap", "install", "--planned"],
      expect: { code: 0, lines: () => ["Installed: register {register}, under {registerDefinition}, as planned.", INSTALL_ACKNOWLEDGEMENT] },
    },
    {
      title: "Create the room", scene: "3", who: "founder",
      typed: () => ["dap", "create", stage.name, "--handle", HANDLES["founder"]],
      expect: { code: 0, lines: () => [
        `Created ${stage.name}: directory <directory>, membership <membership>, rules <rules>, destination <destination>; each created and confirmed.`,
        "Definitions: <...>.",
        `You are ${HANDLES["founder"]}, an admin, on key {operatorKey}; your inbox is <founderInbox>.`,
      ] },
    },
    {
      title: "Publish the rules", scene: "6, recording-day checklist", who: "founder",
      typed: () => ["dap", "act", "publish", "--on", "rules", "--target", "0", "--set", "approvals=0", "--set", "ownerMayReview=false", "--set", "checks=[]", "--set", "labels=[]", "--set", `extents=${JSON.stringify(firstExtents({ approvals: 0, checks: [] }))}`],
      expect: { code: 0, lines: () => [took("rules")] },
    },
    {
      title: "Activate the issue definition", scene: "6, recording-day checklist", who: "founder",
      typed: () => ["dap", "act", "activate", "--on", "rules", "--set", `digest=${DEMO_DIGESTS.issue}`, "--set", "name=issue", "--value", "issue-demo.json"],
      expect: { code: 0, lines: () => [took("rules")] },
    },
    {
      title: "Activate the change definition", scene: "6, recording-day checklist", who: "founder",
      typed: () => ["dap", "act", "activate", "--on", "rules", "--set", `digest=${DEMO_DIGESTS.change}`, "--set", "name=change", "--value", "change-demo.json"],
      expect: { code: 0, lines: () => [took("rules")] },
    },
    {
      title: "Invite a member", scene: "4", who: "founder",
      typed: () => ["dap", "invite", HANDLES.member, "--role", "member"],
      expect: { code: 0, lines: () => [`Invited ${HANDLES.member} as member: invitation {membership}:<seq>, until <until>.`, `Link for ${HANDLES.member} only (it holds the invitation's secret): <memberLink>`] },
    },
    {
      title: "The member joins", scene: "5", who: "member",
      typed: (v) => ["dap", "join", need(v, "memberLink")],
      expect: { code: 0, lines: () => [`Joined as ${HANDLES.member} on key <memberKey>.`, "Your inbox: <memberInbox>."] },
    },
    {
      title: "Invite a maintainer", scene: "4", who: "founder",
      typed: () => ["dap", "invite", HANDLES.maintainer, "--role", "maintainer"],
      expect: { code: 0, lines: () => [`Invited ${HANDLES.maintainer} as maintainer: invitation {membership}:<seq>, until <until>.`, `Link for ${HANDLES.maintainer} only (it holds the invitation's secret): <maintainerLink>`] },
    },
    {
      title: "The maintainer joins", scene: "5", who: "maintainer",
      typed: (v) => ["dap", "join", need(v, "maintainerLink")],
      expect: { code: 0, lines: () => [`Joined as ${HANDLES.maintainer} on key <maintainerKey>.`, "Your inbox: <maintainerInbox>."] },
    },
    {
      title: "Clone by the room's token", scene: "6", who: "member",
      typed: () => ["dap", "clone", "site"],
      expect: { code: 0, lines: () => ["Read token: {destination}:<seq>, until <until>.", "Remote URL: <remote>", "Cloned into site."] },
    },
    {
      title: "The clone's history", scene: "6", who: "member",
      typed: () => ["git", "-C", "site", "log", "--oneline"],
      expect: { code: 0, lines: () => ["<founding> <...>Found this repository."] },
    },
    {
      title: "Open an issue", scene: "8 (the issue it closes)", who: "member",
      typed: () => ["dap", "issue", "open", "--title", "Add a getting-started page", "--body", "A page that says how to clone and edit."],
      expect: { code: 0, lines: () => ["Opened issue #1: Add a getting-started page. Its lane is <issue>."] },
    },
    {
      title: "Comment on it", scene: "8", who: "maintainer",
      typed: () => ["dap", "issue", "comment", "1", "I will take this."],
      expect: { code: 0, lines: () => ["Commented: entry {issue}:<seq>, hash <hash>."] },
    },
    {
      title: "Assign it", scene: "8", who: "founder",
      typed: () => ["dap", "issue", "assign", "1", HANDLES.maintainer],
      expect: { code: 0, lines: () => ["Assigned: entry {issue}:<seq>, hash <hash>."] },
    },
    {
      title: "Edit a page in an open folder, closing the issue", scene: "8", who: "maintainer",
      typed: () => ["dap", "edit", "guide/start.md", "--file", "start.md", "--closes", "1"],
      expect: { code: 0, lines: () => [
        `Proposed guide/start.md (${bytes("start.md")} bytes) as change <published>, version <publishedVersion>.`,
        "Linked: when it is published, the change {published} closes issue #1 ({issue}).",
        "Published: commit <publishedCommit>, by the merge {published}:<seq>.",
        `Page: ${site("guide/start.md")}`,
      ] },
    },
    {
      title: "Edit in a controlled folder: refused by name", scene: "10", who: "maintainer",
      typed: () => ["dap", "edit", "AGENTS.md", "--file", "agents.md"],
      expect: { code: 1, lines: () => [
        `Proposed AGENTS.md (${bytes("agents.md")} bytes) as change <controlled>, version <controlledVersion>.`,
        "Not published: the merge {controlled}:<seq> is refused, rules-not-met:rules. The change {controlled} stays open at version {controlledVersion}. When it may be merged, run: dap merge {controlled}",
      ] },
    },
    {
      title: "The rules scope's controller approves", scene: "11", who: "founder",
      typed: (v) => ["dap", "act", "review-verdict", "--on", need(v, "controlled"), "--set", `manifest=${need(v, "controlledVersion")}`, "--set", "verdict=approve", "--set", "extent=rules"],
      expect: { code: 0, lines: () => [took("controlled")] },
    },
    {
      title: "Merge: it publishes", scene: "11, both changes admitted before publication", who: "maintainer",
      typed: (v) => ["prepare-concurrent-and-merge", need(v, "publishedCommit"), need(v, "controlled")],
      expect: { code: 0, lines: () => [
        "Proposal base: {publishedCommit}.",
        "$ dap act open-pr <...>", "Took effect: entry {directory}:<staleOpening>, hash <staleOpeningHash>.", "Exit 0.",
        "Opened change: <stale>.",
        "$ dap act ask-rules <...>", "Took effect: entry {stale}:<seq>, hash <hash>.", "Exit 0.",
        "$ dap act propose-file <...>", "Took effect: entry {stale}:<staleVersion>, hash <hash>.", "Exit 0.",
        "$ dap merge {controlled}", "Published: commit <controlledCommit>, by the merge {controlled}:<seq>.",
        `Page: ${site("AGENTS.md")}`, "Exit 0.",
      ] },
    },
    {
      title: "A stale change is refused, then re-proposed as a new change", scene: "concurrency, freeze route", who: "maintainer",
      typed: (v) => ["stale-reproposal", need(v, "publishedCommit"), need(v, "controlledCommit")],
      // Development expectation from the production CLI format; live-host
      // observation remains required before these lines are filed as observed.
      expect: { code: 0, lines: () => [
        "Old base: {publishedCommit}; new base: {controlledCommit}.",
        "$ dap merge {stale}",
        "Not published: the merge {stale}:<seq> is refused, out-of-date. The change {stale} stays open at version {staleVersion}. When it may be merged, run: dap merge {stale}", "Exit 1.",
        "$ dap edit guide/concurrent.md --file concurrent.md",
        `Proposed guide/concurrent.md (${bytes("concurrent.md")} bytes) as change <reproposed>, version <reproposedVersion>.`,
        "Published: commit <reproposedCommit>, by the merge {reproposed}:<seq>.",
        `Page: ${site("guide/concurrent.md")}`, "Exit 0.",
      ] },
    },
    {
      title: "The bad path: refused by name", scene: "10 (the bad path of the 19:50 run)", who: "maintainer",
      typed: () => ["dap", "edit", "../outside.md", "--file", "start.md"],
      expect: { code: 1, lines: () => [
        `Proposed ../outside.md (${bytes("start.md")} bytes) as change <refused>, version <refusedVersion>.`,
        "Not published: the merge {refused}:<seq> is refused, path-invalid. The change {refused} stays open at version {refusedVersion}. When it may be merged, run: dap merge {refused}",
      ] },
    },
    {
      title: "The issues: closed by the merge", scene: "8", who: "member",
      typed: () => ["dap", "issues"],
      expect: { code: 0, lines: () => [`#1  closed (completed)  Add a getting-started page; assigned to ${HANDLES.maintainer}; lane {issue}`, "1 issues, 0 open."] },
    },
    {
      title: "The verifier, every scope", scene: "12", who: "member",
      typed: () => ["dap", "verify", "--all"],
      expect: { code: 0, lines: (v) => [
        ...[["register", "register"], ["directory", "directory"], ["membership", "membership"], ["rules", "rules"], ["destination", "destination"], ["lane", "issue"], ["lane", "published"], ["lane", "controlled"], ["lane", "stale"], ["lane", "reproposed"], ["lane", "refused"], ["inbox", "founderInbox"], ["inbox", "memberInbox"], ["inbox", "maintainerInbox"]]
          .flatMap(([kind, name]) => [`${kind} {${name}}, entry <seq>: consistent.`, ...(kind === "destination" && v["registerDefinition"] === "platform:register@3" ? ["Cleanup status: destination {destination}, entry <seq>: no reservation is recorded as cleanup-owed."] : [])]),
        "All consistent: 14 scopes.",
      ] },
    },
    {
      title: "The site's front page", scene: "7", who: "member",
      typed: () => ["GET", site("")],
      expect: { code: 0, lines: () => page("<...>", null) },
    },
    {
      title: "The page published by the edit", scene: "9", who: "member",
      typed: () => ["GET", site("guide/start.md")],
      expect: { code: 0, lines: () => page("Getting started", "Clone the room, then edit a page.") },
    },
    {
      title: "The page published after the approval", scene: "11", who: "member",
      typed: () => ["GET", site("AGENTS.md")],
      expect: { code: 0, lines: () => page("Agents", "Ask before you push.") },
    },
    {
      title: "The room's page", scene: "the story page", who: "member",
      typed: () => ["GET", `${service}/page/`],
      expect: { code: 0, lines: () => page("dap - workroom", null) },
    },
  ];
  if (stage.manifest) {
    const activate: Shot = ({
      title: "Activate the manifest-list change definition",
      scene: "after 16, manifest extension", who: "founder",
      typed: () => ["dap", "act", "activate", "--on", "rules", "--set", `digest=${MANIFEST_DIGESTS.demo}`, "--set", "name=change", "--value", "change-demo3.json"],
      expect: { code: 0, lines: () => [took("rules")] },
    });
    const prepare = (branch: string): Shot => ({
      title: `Prepare the committed two-text-file branch ${branch}`, scene: "after 16, local Git preparation", who: "member",
      typed: () => ["prepare-branch", branch],
      expect: { code: 0, lines: () => [`Prepared local Git branch ${branch} with 2 text files.`, "<...>"] },
    });
    list.splice(16, 0, activate, prepare("two-pages"), {
      title: "Propose a two-text-file branch: published", scene: "after 16, dap propose", who: "maintainer",
      typed: () => ["dap", "propose", "two-pages"],
      expect: { code: 0, lines: () => ["Proposed 2 files as change <manifestPublished>, version <manifestVersion>.", "Published: commit <manifestCommit>, by the merge {manifestPublished}:<seq>."] },
    }, prepare("two-controlled"), {
      title: "Propose a controlled two-text-file branch: refused by name", scene: "after 16, dap propose control", who: "maintainer",
      typed: () => ["dap", "propose", "two-controlled"],
      expect: { code: 1, lines: () => ["Proposed 2 files as change <manifestRefused>, version <manifestRefusedVersion>.", "Not published: the merge {manifestRefused}:<seq> is refused, rules-not-met:rules. The change {manifestRefused} stays open at version {manifestRefusedVersion}. When it may be merged, run: dap merge {manifestRefused}"] },
    });
    const merged = list.find((shot) => shot.title === "Merge: it publishes")!;
    merged.typed = (v) => ["prepare-concurrent-and-merge", need(v, "manifestCommit"), need(v, "controlled")];
    const concurrency = list.find(shot => shot.title === "A stale change is refused, then re-proposed as a new change")!;
    concurrency.typed = (v) => ["stale-reproposal", need(v, "manifestCommit"), need(v, "controlledCommit")];
    const concurrencyLines = concurrency.expect.lines;
    concurrency.expect.lines = (v) => concurrencyLines(v).map(line => line.replace("{publishedCommit}", "{manifestCommit}"));
    const mergeLines = merged.expect.lines;
    merged.expect.lines = (v) => {
      const lines = mergeLines(v).map(line => line.replace("{publishedCommit}", "{manifestCommit}"));
      lines[9] = "Took effect: entry {stale}:<staleSource>, hash <hash>.";
      lines.splice(11, 0, "$ dap act propose-manifest <...>", "Took effect: entry {stale}:<staleVersion>, hash <hash>.", "Exit 0.");
      lines.splice(lines.length - 2, 1); // The manifest-list merge has no legacy Page line.
      return lines;
    };
    const verify = list.find((shot) => shot.title === "The verifier, every scope")!;
    const before = verify.expect.lines;
    verify.expect.lines = (v) => {
      const lines = before(v);
      const afterPublished = lines.findIndex((line) => line.startsWith("lane {published},")) + 1;
      return [...lines.slice(0, afterPublished), "lane {manifestPublished}, entry <seq>: consistent.", "lane {manifestRefused}, entry <seq>: consistent.", ...lines.slice(afterPublished, -1), "All consistent: 16 scopes."];
    };
  }
  return list;
}

/** The preparation's exact text sources. Git commits these; Artroom proposes their committed bytes. */
export const branchFiles = (branch: string): readonly { path: string; bytes: Uint8Array }[] => branch === "two-pages" ? [
  { path: "guide/branch-one.md", bytes: utf8("# Branch one\n\nThe first text file proposed from a committed branch.\n") },
  { path: "guide/branch-two.md", bytes: utf8("# Branch two\n\nThe second text file belongs to the same change.\n") },
] : [
  { path: "AGENTS.md", bytes: utf8("# Agents\n\nA controlled branch needs the rules controller.\n") },
  { path: "guide/controlled.md", bytes: utf8("# Controlled branch\n\nThis second text file must not publish alone.\n") },
];

function need(v: CapturedValues, name: string): string {
  const value = v[name];
  if (value === undefined) throw new Missing(`no earlier shot printed ${name}`);
  return value;
}

/** The typed words with each `{name}` filled from the values kept so far. */
const filled = (words: readonly string[], v: CapturedValues): string[] => words.map((word) => word.replace(/\{([A-Za-z]+)\}/g, (_, name: string) => need(v, name)));

const escaped = (text: string) => text.replace(/[.*+?^$(){}|[\]\\]/g, "\\$&");

/** One expected line as a pattern: each `<name>` a kept group, `<...>` any text, `{name}` the kept value. */
function pattern(template: string, v: CapturedValues, named: Set<string>): RegExp {
  let source = "";
  for (const part of template.split(/(<[A-Za-z]+>|<\.\.\.>|\{[A-Za-z]+\})/)) {
    if (part === "<...>") source += "[\\s\\S]*?";
    else if (/^<[A-Za-z]+>$/.test(part)) {
      const name = part.slice(1, -1);
      source += named.has(name) ? `\\k<${name}>` : `(?<${name}>\\S+?)`;
      named.add(name);
    } else if (/^\{[A-Za-z]+\}$/.test(part)) source += escaped(need(v, part.slice(1, -1)));
    else source += escaped(part);
  }
  return new RegExp(`^${source}$`);
}

/** Whether the outcome is the one expected: the exit code, then each line in order. The values it names are kept in `v`. */
export function judged(expected: { code: number; lines: readonly string[] }, outcome: Outcome, v: CapturedValues): string | null {
  if (outcome.code !== expected.code) return `exit ${outcome.code}, where ${expected.code} is expected`;
  if (outcome.lines.length !== expected.lines.length) return `${outcome.lines.length} lines, where ${expected.lines.length} are expected`;
  const kept: CapturedValues = {};
  for (let i = 0; i < expected.lines.length; i++) {
    let matched: RegExpExecArray | null;
    try {
      matched = pattern(expected.lines[i]!, { ...v, ...kept }, new Set()).exec(outcome.lines[i]!);
    } catch (error) {
      if (error instanceof Missing) return `line ${i + 1}: ${error.message}`;
      throw error;
    }
    if (!matched) return `line ${i + 1} is not "${expected.lines[i]}"`;
    Object.assign(kept, matched.groups ?? {});
  }
  Object.assign(v, kept);
  return null;
}

/** A line or a typed command with every invitation link cut to its first eight letters: the link holds the invitation's secret. */
export function withheld(text: string): string {
  return text.replace(/artroom-invite:(\S{0,8})\S*/g, "artroom-invite:$1... (cut: the link holds a secret)");
}

/** A page's status, type, title, and whether it shows the text expected. */
function seen(page: Fetched, shows: string | null): Outcome {
  const title = /<title>([^<]*)<\/title>/.exec(page.body)?.[1] ?? null;
  const text = page.body.replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  return {
    code: page.status === 200 ? 0 : 1,
    lines: [`HTTP ${page.status}, ${page.type}`, ...(title !== null ? [`Title: ${title}`] : []), ...(shows === null ? [] : [text.includes(shows) ? `Shows: "${shows}"` : `Does not show: "${shows}"`])],
  };
}

/** Local correspondence to the plan produced by the reviewed command. A
 * retained acknowledgement is configured-service evidence, not independent
 * genesis proof or permission for later operations. */
export async function plannedOperator(ctx: Context, stage: Pick<Stage, "service" | "host" | "namespace">, register: string, definition: string, installed: boolean): Promise<string | null> {
  const config = await ctx.store.config();
  const raw = config?.plan as unknown;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const plan = raw as Record<string, unknown>;
  const creation = plan["founding"];
  if (!config || config.key !== "operator" || config.service !== stage.service || plan["service"] !== stage.service
    || plan["register"] !== register || !isScopeId(register) || plan["definition"] !== definition
    || !isPlatformDefinition(definition) || platformName(definition) !== "platform:register" || platform(definition) === null
    || !isSignedIntentShape(creation) || !verifySignedIntent(creation) || creation.intent.kind !== "install" || creation.intent.to !== null
    || creation.intent.on !== null || Object.keys(creation.intent.expected).length !== 0
    || creation.intent.fields["host"] !== stage.host || creation.intent.fields["namespace"] !== stage.namespace
    || scopeIdOf({ v: 1, kind: "register", definition, creator: null, cause: intentDigest(creation.intent), ordinal: 0 }) !== register) return null;
  const secret = await ctx.store.secret(config.key);
  if (!(secret instanceof Uint8Array) || secret.length !== 32 || keyIdOfSecret(secret) !== creation.intent.actor) return null;
  if (installed) {
    const rawAcknowledgement = plan["acknowledged"];
    if (!rawAcknowledgement || typeof rawAcknowledgement !== "object" || Array.isArray(rawAcknowledgement)) return null;
    const acknowledgement = rawAcknowledgement as Record<string, unknown>;
    const receipt = acknowledgement["receipt"];
    if (acknowledgement["status"] !== "service-acknowledged" || acknowledgement["service"] !== stage.service || !isReceipt(receipt)
      || receipt.definition !== definition || receipt.intent !== intentDigest(creation.intent) || receipt.fact.at.scope !== register
      || receipt.fact.at.kind !== "register" || receipt.fact.seq !== 0 || !isScopeRef(config.register) || canonicalize(config.register) !== canonicalize(receipt.fact.at)) return null;
  }
  return creation.intent.actor;
}

/** The freeze route uses existing generic acts and a normal fresh-head edit.
 * Each command is recorded with its actual exit. A mismatch stops this
 * composite before another mutation; no unknown request is retried. */
export async function prepareConcurrentAndMerge(ctx: Context, oldBase: string, controlled: string, expected: { code: number; lines: string[] }, v: CapturedValues, manifest: boolean): Promise<Outcome> {
  const lines = [`Proposal base: ${oldBase}.`];
  const failure = (reason = "required result did not match"): Outcome => ({ code: 1, lines: [...lines, `Composite stopped: ${reason}. No mutation was retried.`] });
  if (!/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(oldBase) || !isScopeId(controlled)) return failure();
  const config = await ctx.store.config();
  if (!config?.repository) return failure();
  const secret = await ctx.store.secret(config.key);
  if (!secret) return failure();
  const now = ctx.now?.() ?? Date.now();
  const session = await requestSession(config.service, config.repository.membership.scope, sessionRequest(config.repository.membership, secret, timeOf(now + 60_000), b64url(crypto.getRandomValues(new Uint8Array(16)))), ctx.fetch ? { fetch: ctx.fetch } : {});
  if (!session.ok) return failure();
  const transport = signedReads(httpTransport(config.service, ctx.fetch ? { fetch: ctx.fetch } : {}), secretSigner(secret), ctx.now ? { now: ctx.now } : {});
  const handle = (scope: string) => new ScopeHandle(transport, scope as never, session.session.reader());
  const run = async (args: string[], code: number, start: number, end: number) => {
    const result = await command(ctx, args);
    lines.push(`$ dap ${args.map(quoted).join(" ")}`, ...result.lines, `Exit ${result.code}.`);
    return judged({ code, lines: expected.lines.slice(start, end) }, result, v) === null;
  };
  const definition = manifest ? MANIFEST_DIGESTS.demo : DEMO_DIGESTS.change;
  if (!await run(["act", "open-pr", "--on", "directory", "--set", `definition=${definition}`, "--set", "title=Concurrent edit on the previous head", "--set", "draft=false", "--value", manifest ? "change-demo3.json" : "change-demo.json"], 0, 2, 3)) return failure();
  const opening = await handle(config.repository.directory.scope).entry(Number(v["staleOpening"]));
  if (!opening.ok || !entryHash(opening.value.entry).startsWith(v["staleOpeningHash"]!) || opening.value.entry.input.type !== "act" || opening.value.entry.input.signed.intent.kind !== "open-pr") return failure("opening entry did not match");
  const seed = opening.value.entry.sends.find((send) => "kind" in send.to && send.to.kind === "lane")?.to;
  if (!seed || !("definition" in seed) || seed.definition !== definition) return failure("opened lane seed did not match");
  v["stale"] = scopeIdOf(seed);
  lines.push(`Opened change: ${v["stale"]}.`);
  const ready = async (scope: string, predicate: (summary: Awaited<ReturnType<ScopeHandle["summary"]>>) => boolean) => {
    for (let i = 0; i < (ctx.tries ?? 120); i++) {
      if (predicate(await handle(scope).summary())) return true;
      if (ctx.pause) await ctx.pause([config.repository!.directory.scope, scope as `sc_${string}`, config.repository!.rules]);
      else await new Promise(resolve => setTimeout(resolve, 250));
    }
    return false;
  };
  if (!await ready(v["stale"], read => read.ok && read.value.items.some(item => item.type === "proposal"))) return failure();
  if (!await run(["act", "ask-rules", "--on", v["stale"], "--target", "0"], 0, 6, 7)) return failure();
  if (!await ready(v["stale"], read => read.ok && read.value.items.some(item => item.type === "rules" && typeof item.values["revision"] === "number"))) return failure();
  if (!await run(["act", "propose-file", "--on", v["stale"], "--set", `base=${oldBase}`, "--set", "path=guide/concurrent.md", "--set", `digest=${digestBytes(FILES["concurrent.md"]!)}`, "--set", `size=${bytes("concurrent.md")}`, "--set", `content=${new TextDecoder().decode(FILES["concurrent.md"])}`], 0, 9, 10)) return failure();
  if (manifest) {
    const source = await handle(v["stale"]).entry(Number(v["staleSource"]));
    if (!source.ok || source.value.entry.input.type !== "act" || source.value.entry.input.signed.intent.kind !== "propose-file") return failure();
    const entry = { at: source.value.entry.at, seq: source.value.entry.seq, hash: entryHash(source.value.entry) };
    if (!await run(["act", "propose-manifest", "--on", v["stale"], "--set", `base=${oldBase}`, "--set", `files=${JSON.stringify([{ path: "guide/concurrent.md", entry, digest: digestBytes(FILES["concurrent.md"]!) }])}`], 0, 12, 13)) return failure();
  }
  const offset = manifest ? 3 : 0;
  if (!await run(["merge", controlled], 0, 12 + offset, expected.lines.length - 1)) return failure();
  return { code: 0, lines };
}

/** Merge the already-admitted loser, then open a distinct fresh-head change. */
export async function staleReproposal(ctx: Context, oldBase: string, newBase: string, expected: { code: number; lines: string[] }, v: CapturedValues, monotonic: () => number, now: () => number, measured: (milliseconds: number, at: string) => void): Promise<Outcome> {
  const lines = [`Old base: ${oldBase}; new base: ${newBase}.`];
  const failure = (): Outcome => ({ code: 1, lines: [...lines, "Composite stopped: required result did not match. No mutation was retried."] });
  if (!/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(oldBase) || !/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(newBase) || oldBase === newBase || !isScopeId(v["stale"])) return failure();
  const run = async (args: string[], code: number, start: number, end: number) => {
    const result = await command(ctx, args);
    lines.push(`$ dap ${args.map(quoted).join(" ")}`, ...result.lines, `Exit ${result.code}.`);
    return judged({ code, lines: expected.lines.slice(start, end) }, result, v) === null;
  };
  // Start immediately before the CLI invocation and stop immediately when it
  // returns. Formatting, judging and the subsequent fresh edit are outside it.
  const at = new Date(now()).toISOString();
  const started = monotonic();
  const refused = await command(ctx, ["merge", v["stale"]]);
  const milliseconds = monotonic() - started;
  lines.push(`$ dap merge ${v["stale"]}`, ...refused.lines, `Exit ${refused.code}.`);
  if (judged({ code: 1, lines: expected.lines.slice(2, 3) }, refused, v) !== null) return failure();
  measured(milliseconds, at);
  if (!await run(["edit", "guide/concurrent.md", "--file", "concurrent.md"], 0, 5, expected.lines.length - 1)) return failure();
  if (!isScopeId(v["reproposed"]) || v["reproposed"] === v["stale"]) return failure();
  return { code: 0, lines };
}

/** Runs every shot in order, each as the person it names, and keeps going after a shot that does not match while it can. */
export async function rehearse(stage: Stage): Promise<Rehearsal> {
  const now = () => (stage.now ? stage.now() : Date.now());
  const people: Partial<Record<Person, Context>> = {};
  const personOf = async (who: Person) => (people[who] ??= await stage.person(who));
  const v: CapturedValues = {};
  const taken: Taken[] = [];
  const list = shots(stage);
  let identityStop: string | null = null;
  for (const [i, shot] of list.entries()) {
    const expected = { code: shot.expect.code, lines: shot.expect.lines(v) };
    const base = { n: i + 1, title: shot.title, scene: shot.scene, who: `${shot.who} (${HANDLES[shot.who]})`, expected };
    let words: string[];
    try {
      if (identityStop !== null) throw new Missing(identityStop);
      words = filled(shot.typed(v), v);
    } catch (error) {
      if (!(error instanceof Missing)) throw error;
      const skipped: Taken = { ...base, at: new Date(now()).toISOString(), typed: "(not run)", code: -1, lines: [], seconds: 0, match: false, why: `not run: ${error.message}`, note: null };
      taken.push(skipped);
      stage.told?.(skipped);
      continue;
    }
    const typed = withheld(words.map(quoted).join(" "));
    await stage.beforeShot?.({ n: base.n, title: base.title, scene: base.scene, who: base.who, typed });
    const started = now();
    let outcome: Outcome;
    let staleRefusal: StaleRefusalTiming | undefined;
    const shows = expected.lines.find((line) => line.startsWith("Shows: \""))?.slice(8, -1) ?? null;
    if (words[0] === "GET") outcome = seen(await stage.get(words[1]!), shows);
    else if (words[0] === "prepare-concurrent-and-merge") outcome = await prepareConcurrentAndMerge(await personOf(shot.who), words[1]!, words[2]!, expected, v, stage.manifest ?? false);
    else if (words[0] === "stale-reproposal") outcome = await staleReproposal(await personOf(shot.who), words[1]!, words[2]!, expected, v, () => stage.monotonic ? stage.monotonic() : performance.now(), now, (milliseconds, at) => {
      staleRefusal = { milliseconds, at, service: stage.service, host: stage.host, method: stage.monotonic ? "injected monotonic clock" : "performance.now()" };
    });
    else if (words[0] === "prepare-branch") outcome = stage.prepareBranch ? await stage.prepareBranch(words[1]!, branchFiles(words[1]!)) : { code: 1, lines: ["No local Git branch preparation is configured."] };
    else if (words[0] === "git") outcome = await stage.log(words[2]!);
    else outcome = await command(await personOf(shot.who), words.slice(1));
    let why = judged(expected, outcome, v);
    if (i === 0 || i === 1) {
      const key = why === null ? await plannedOperator(await personOf(shot.who), stage, v["register"]!, v["registerDefinition"]!, i === 1) : null;
      if (key === null || (v["operatorKey"] !== undefined && v["operatorKey"] !== key)) {
        identityStop = "planned install identity is missing or inconsistent";
        why ??= identityStop;
      } else v["operatorKey"] = key;
    }
    // Ordinary output mismatches remain diagnostic and may continue. A newly
    // captured scope identity cannot drive another person's command or hook
    // when the producer did not return the complete expected result.
    const names = ["register", "directory", "membership", "rules", "destination", "issue", "published", "controlled", "refused", "manifestPublished", "manifestRefused", "stale", "reproposed"]
      .filter((name) => expected.lines.some((line) => line.includes(`<${name}>`)));
    if (names.length > 0) {
      const config = await (await personOf(shot.who)).store.config();
      const r = config?.repository;
      const mismatch = names.some((name) => !isScopeId(v[name]))
        || (names.includes("register") && v["register"] !== config?.plan?.register)
        || (names.includes("directory") && (!r || v["directory"] !== r.directory.scope || v["membership"] !== r.membership.scope || v["rules"] !== r.rules || v["destination"] !== r.destination));
      if (why !== null || mismatch) {
        identityStop = "captured scope identity is missing or inconsistent";
        why ??= identityStop;
      }
    }
    const note = shot.after && why === null ? await shot.after(v, stage) : null;
    const done: Taken = {
      ...base, at: new Date(started).toISOString(), typed, code: outcome.code, lines: outcome.lines.map(withheld),
      seconds: Math.round((now() - started) / 100) / 10, match: why === null, why, note,
      ...(staleRefusal ? { staleRefusal } : {}),
    };
    taken.push(done);
    stage.told?.(done);
  }
  const room: Room = { service: slash(stage.service) };
  for (const name of ["register", "directory", "membership", "rules", "destination", "issue", "published", "controlled", "stale", "reproposed", "refused"] as const) if (v[name] !== undefined) room[name] = v[name];
  return { shots: taken, room, ok: taken.every((shot) => shot.match) };
}

/** A word as a person types it in a shell: quoted when it holds a space or a character the shell reads. */
function quoted(word: string): string {
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(word) ? word : `'${word.replace(/'/g, "'\\''")}'`;
}

const cell = (lines: readonly string[]) => lines.map((line) => line.replace(/\|/g, "\\|").replace(/</g, "&lt;").replace(/\r?\n/g, "<br>")).join("<br>") || "(nothing)";

/** The transcript: for each shot, its time, the command as typed, the lines printed, the seconds taken and whether they match; then the table. */
export function transcript(rehearsal: Rehearsal, heading: { service: string; host: string; namespace: string; started: string; how: string }): string {
  const failed = rehearsal.shots.filter((shot) => !shot.match);
  const out = [
    "# Demo rehearsal transcript",
    "",
    `Base URL ${heading.service}, host ${heading.host}, namespace ${heading.namespace}. Started ${heading.started}. ${heading.how}`,
    "",
    rehearsal.ok ? `Result: all ${rehearsal.shots.length} shots printed what the script expects.` : `Result: ${failed.length} of ${rehearsal.shots.length} shots did not print what the script expects: ${failed.map((shot) => shot.n).join(", ")}.`,
    "",
    "Invitation links are cut to their first eight letters; nothing else printed holds a secret.",
    "",
  ];
  for (const shot of rehearsal.shots) {
    out.push(
      `## Shot ${shot.n}. ${shot.title}`,
      "",
      `Script shot ${shot.scene}. As the ${shot.who}, at ${shot.at}, ${shot.seconds} seconds.`,
      "",
      "```text",
      `$ ${shot.typed}`,
      ...shot.lines,
      "```",
      "",
      shot.code >= 0 ? `Exit ${shot.code}. ${shot.match ? "Matches the expected lines." : `Does not match: ${shot.why}.`}` : `Not run: ${shot.why}.`,
      "",
      ...(shot.staleRefusal ? [`Runner-local stale merge refusal: ${shot.staleRefusal.milliseconds} ms, measured with ${shot.staleRefusal.method} from command invocation to its expected out-of-date return. Date ${shot.staleRefusal.at}; service ${shot.staleRefusal.service}; Git host ${shot.staleRefusal.host}. Includes CLI and round-trip waiting; excludes the fresh proposal and publication. This is not server-only latency or a native history fact.`, ""] : []),
      ...(shot.note ? [shot.note, ""] : []),
    );
  }
  out.push(
    "## Expected and observed",
    "",
    "In an expected line, `<name>` is any text without a space, `<...>` any text, and `{name}` the value an earlier line printed.",
    "",
    "| Shot | Expected | Observed | Match |",
    "|---|---|---|---|",
    ...rehearsal.shots.map((shot) => `| ${shot.n}. ${shot.title} | exit ${shot.expected.code}<br>${cell(shot.expected.lines)} | ${shot.code >= 0 ? `exit ${shot.code}<br>${cell(shot.lines)}` : "not run"} | ${shot.match ? "yes" : "no"} |`),
    "",
  );
  return out.join("\n");
}
