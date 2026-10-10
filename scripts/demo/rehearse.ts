/**
 * The rehearsal of the demo script's middle (notes/2026-10-07-demo-script-draft.md, shots 3 to 12, in the order of the 23:00
 * sprint report's observed run): each shot is one command line, run by the command line's own function `command` with the
 * person's `Context`, or one read of `git log` or of a page. Each shot states the exit code and the lines it expects; the
 * rehearsal records what was printed, how long it took and whether it matches.
 *
 * It runs in any runtime: `scripts/demo-run.ts` gives it Node's files, `git` and `fetch` against a deployment, and
 * `packages/lanes/test/demo.scope.test.ts` gives it the test Worker's routes on real scopes, with the stand-ins that test names.
 *
 * A secret is never in what it records: an invitation link is cut to its first letters wherever a line or a typed command holds
 * one, and nothing else that it prints holds a secret (a read token is never printed by `artroom clone`; a key is printed by its ID).
 */

import { canonicalize, intentDigest, isPlatformDefinition, isReceipt, isScopeId, isScopeRef, isSignedIntentShape, keyIdOfSecret, platformName, scopeIdOf, utf8, verifySignedIntent } from "@generalbusiness/artroom-bytes";
import { command, type Context, type Outcome } from "@generalbusiness/artroom-cli";
import { DEMO_DIGESTS, MANIFEST_DIGESTS, changeDemo, changeDemo3, issueDemo } from "@generalbusiness/artroom-lanes";
import { firstExtents, platform } from "@generalbusiness/artroom-platform";

/** The three people of the script, each with a fresh config directory. Hardware identity is not verified. */
export type Person = "founder" | "member" | "maintainer";
export const HANDLES: Readonly<Record<Person, string>> = { founder: "@hugh", member: "@una", maintainer: "@paul" };

/** The local files the people's commands read, by the names they type. */
export const FILES: Readonly<Record<string, Uint8Array>> = {
  "issue-demo.json": utf8(canonicalize(issueDemo)),
  "change-demo.json": utf8(canonicalize(changeDemo)),
  "change-demo3.json": utf8(canonicalize(changeDemo3)),
  "start.md": utf8("# Getting started\n\nClone the room, then edit a page.\n"),
  "agents.md": utf8("# Agents\n\nAsk before you push.\n"),
};

/** One page as a reader's browser gets it. */
export interface Fetched { status: number; type: string; body: string }

/** What the rehearsal runs on. A deployment's is `demo-run.ts`; the test Worker's is the test's. */
export interface Stage {
  /** The scope service's base URL, the Git host and the namespace, as `artroom install` takes them. */
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
  /** Before a runnable shot starts, its secrets cut. Awaited before any command or read and before its timer. */
  beforeShot?(shot: NextShot): Promise<void>;
  /** Told each shot as it ends, its secrets cut: for a person who watches the run. */
  told?(shot: Taken): void;
}

/** What is about to run. Invitation links remain cut on the recording screen. */
export interface NextShot { n: number; title: string; scene: string; who: string; typed: string }

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
  refused?: string;
}

export interface Rehearsal { shots: Taken[]; room: Room; ok: boolean }

/** The values a shot's lines named, by the name of their place in the expected lines; a later shot types them. */
type Found = Record<string, string>;

class Missing extends Error {}

/** A shot: who runs what, and the exit code and lines it expects. */
interface Shot {
  title: string;
  scene: string;
  who: Person;
  /** The command as typed: an `artroom` command line, `git ...`, or `GET <url>`. */
  typed(v: Found): string[];
  expect: { code: number; lines: (v: Found) => string[] };
  /** After the shot ends: what the stage does that no command prints. */
  after?(v: Found, stage: Stage): Promise<string>;
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
      typed: () => ["artroom", "install", "--plan", stage.service, "--host", stage.host, "--namespace", stage.namespace],
      expect: { code: 0, lines: () => [
        `Planned: register <register>, under <registerDefinition>, on host ${stage.host}, namespace ${stage.namespace}. The seed's time is <until>.`,
        "Set registerScope to {register} in the Worker's host setting, then run artroom install --planned before {until}.",
      ] },
      after: (v, s) => s.pin(v["register"]!),
    },
    {
      title: "Install as planned", scene: "3", who: "founder",
      typed: () => ["artroom", "install", "--planned"],
      expect: { code: 0, lines: () => ["Installed: register {register}, under {registerDefinition}, as planned.", INSTALL_ACKNOWLEDGEMENT] },
    },
    {
      title: "Claim the room", scene: "3", who: "founder",
      typed: () => ["artroom", "claim", stage.name, "--handle", HANDLES.founder],
      expect: { code: 0, lines: () => [
        `Claimed ${stage.name}: directory <directory>, membership <membership>, rules <rules>, destination <destination>; each created and confirmed.`,
        "Definitions: <...>.",
        `You are ${HANDLES.founder}, an admin, on key {operatorKey}; your inbox is <founderInbox>.`,
      ] },
    },
    {
      title: "Publish the rules", scene: "6, recording-day checklist", who: "founder",
      typed: () => ["artroom", "act", "publish", "--on", "rules", "--target", "0", "--set", "approvals=0", "--set", "ownerMayReview=false", "--set", "checks=[]", "--set", "labels=[]", "--set", `extents=${JSON.stringify(firstExtents({ approvals: 0, checks: [] }))}`],
      expect: { code: 0, lines: () => [took("rules")] },
    },
    {
      title: "Activate the issue definition", scene: "6, recording-day checklist", who: "founder",
      typed: () => ["artroom", "act", "activate", "--on", "rules", "--set", `digest=${DEMO_DIGESTS.issue}`, "--set", "name=issue", "--value", "issue-demo.json"],
      expect: { code: 0, lines: () => [took("rules")] },
    },
    {
      title: "Activate the change definition", scene: "6, recording-day checklist", who: "founder",
      typed: () => ["artroom", "act", "activate", "--on", "rules", "--set", `digest=${DEMO_DIGESTS.change}`, "--set", "name=change", "--value", "change-demo.json"],
      expect: { code: 0, lines: () => [took("rules")] },
    },
    {
      title: "Invite a member", scene: "4", who: "founder",
      typed: () => ["artroom", "invite", HANDLES.member, "--role", "member"],
      expect: { code: 0, lines: () => [`Invited ${HANDLES.member} as member: invitation {membership}:<seq>, until <until>.`, `Link for ${HANDLES.member} only (it holds the invitation's secret): <memberLink>`] },
    },
    {
      title: "The member joins", scene: "5", who: "member",
      typed: (v) => ["artroom", "join", need(v, "memberLink")],
      expect: { code: 0, lines: () => [`Joined as ${HANDLES.member} on key <memberKey>.`, "Your inbox: <memberInbox>."] },
    },
    {
      title: "Invite a maintainer", scene: "4", who: "founder",
      typed: () => ["artroom", "invite", HANDLES.maintainer, "--role", "maintainer"],
      expect: { code: 0, lines: () => [`Invited ${HANDLES.maintainer} as maintainer: invitation {membership}:<seq>, until <until>.`, `Link for ${HANDLES.maintainer} only (it holds the invitation's secret): <maintainerLink>`] },
    },
    {
      title: "The maintainer joins", scene: "5", who: "maintainer",
      typed: (v) => ["artroom", "join", need(v, "maintainerLink")],
      expect: { code: 0, lines: () => [`Joined as ${HANDLES.maintainer} on key <maintainerKey>.`, "Your inbox: <maintainerInbox>."] },
    },
    {
      title: "Clone by the room's token", scene: "6", who: "member",
      typed: () => ["artroom", "clone", "site"],
      expect: { code: 0, lines: () => ["Read token: {destination}:<seq>, until <until>.", "Remote URL: <remote>", "Cloned into site."] },
    },
    {
      title: "The clone's history", scene: "6", who: "member",
      typed: () => ["git", "-C", "site", "log", "--oneline"],
      expect: { code: 0, lines: () => ["<founding> <...>Found this repository."] },
    },
    {
      title: "Open an issue", scene: "8 (the issue it closes)", who: "member",
      typed: () => ["artroom", "issue", "open", "--title", "Add a getting-started page", "--body", "A page that says how to clone and edit."],
      expect: { code: 0, lines: () => ["Opened issue #1: Add a getting-started page. Its lane is <issue>."] },
    },
    {
      title: "Comment on it", scene: "8", who: "maintainer",
      typed: () => ["artroom", "issue", "comment", "1", "I will take this."],
      expect: { code: 0, lines: () => ["Commented: entry {issue}:<seq>, hash <hash>."] },
    },
    {
      title: "Assign it", scene: "8", who: "founder",
      typed: () => ["artroom", "issue", "assign", "1", HANDLES.maintainer],
      expect: { code: 0, lines: () => ["Assigned: entry {issue}:<seq>, hash <hash>."] },
    },
    {
      title: "Edit a page in an open folder, closing the issue", scene: "8", who: "maintainer",
      typed: () => ["artroom", "edit", "guide/start.md", "--file", "start.md", "--closes", "1"],
      expect: { code: 0, lines: () => [
        `Proposed guide/start.md (${bytes("start.md")} bytes) as change <published>, version <publishedVersion>.`,
        "Linked: when it is published, the change {published} closes issue #1 ({issue}).",
        "Published: commit <publishedCommit>, by the merge {published}:<seq>.",
        `Page: ${site("guide/start.md")}`,
      ] },
    },
    {
      title: "Edit in a controlled folder: refused by name", scene: "10", who: "maintainer",
      typed: () => ["artroom", "edit", "AGENTS.md", "--file", "agents.md"],
      expect: { code: 1, lines: () => [
        `Proposed AGENTS.md (${bytes("agents.md")} bytes) as change <controlled>, version <controlledVersion>.`,
        "Not published: the merge {controlled}:<seq> is refused, rules-not-met:rules. The change {controlled} stays open at version {controlledVersion}. When it may be merged, run: artroom merge {controlled}",
      ] },
    },
    {
      title: "The rules scope's controller approves", scene: "11", who: "founder",
      typed: (v) => ["artroom", "act", "review-verdict", "--on", need(v, "controlled"), "--set", `manifest=${need(v, "controlledVersion")}`, "--set", "verdict=approve", "--set", "extent=rules"],
      expect: { code: 0, lines: () => [took("controlled")] },
    },
    {
      title: "Merge: it publishes", scene: "11", who: "maintainer",
      typed: (v) => ["artroom", "merge", need(v, "controlled")],
      expect: { code: 0, lines: () => ["Published: commit <controlledCommit>, by the merge {controlled}:<seq>.", `Page: ${site("AGENTS.md")}`] },
    },
    {
      title: "The bad path: refused by name", scene: "10 (the bad path of the 19:50 run)", who: "maintainer",
      typed: () => ["artroom", "edit", "../outside.md", "--file", "start.md"],
      expect: { code: 1, lines: () => [
        `Proposed ../outside.md (${bytes("start.md")} bytes) as change <refused>, version <refusedVersion>.`,
        "Not published: the merge {refused}:<seq> is refused, path-invalid. The change {refused} stays open at version {refusedVersion}. When it may be merged, run: artroom merge {refused}",
      ] },
    },
    {
      title: "The issues: closed by the merge", scene: "8", who: "member",
      typed: () => ["artroom", "issues"],
      expect: { code: 0, lines: () => [`#1  closed (completed)  Add a getting-started page; assigned to ${HANDLES.maintainer}; lane {issue}`, "1 issues, 0 open."] },
    },
    {
      title: "The verifier, every scope", scene: "12", who: "member",
      typed: () => ["artroom", "verify", "--all"],
      expect: { code: 0, lines: (v) => [
        ...[["register", "register"], ["directory", "directory"], ["membership", "membership"], ["rules", "rules"], ["destination", "destination"], ["lane", "issue"], ["lane", "published"], ["lane", "controlled"], ["lane", "refused"], ["inbox", "founderInbox"], ["inbox", "memberInbox"], ["inbox", "maintainerInbox"]]
          .flatMap(([kind, name]) => [`${kind} {${name}}, entry <seq>: consistent.`, ...(kind === "destination" && v["registerDefinition"] === "platform:register@3" ? ["Cleanup status: destination {destination}, entry <seq>: no reservation is recorded as cleanup-owed."] : [])]),
        "All consistent: 12 scopes.",
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
      expect: { code: 0, lines: () => page("Artroom", null) },
    },
  ];
  if (stage.manifest) {
    const activate: Shot = ({
      title: "Activate the manifest-list change definition",
      scene: "after 16, manifest extension", who: "founder",
      typed: () => ["artroom", "act", "activate", "--on", "rules", "--set", `digest=${MANIFEST_DIGESTS.demo}`, "--set", "name=change", "--value", "change-demo3.json"],
      expect: { code: 0, lines: () => [took("rules")] },
    });
    const prepare = (branch: string): Shot => ({
      title: `Prepare the committed two-text-file branch ${branch}`, scene: "after 16, local Git preparation", who: "member",
      typed: () => ["prepare-branch", branch],
      expect: { code: 0, lines: () => [`Prepared local Git branch ${branch} with 2 text files.`, "<...>"] },
    });
    list.splice(16, 0, activate, prepare("two-pages"), {
      title: "Propose a two-text-file branch: published", scene: "after 16, artroom propose", who: "maintainer",
      typed: () => ["artroom", "propose", "two-pages"],
      expect: { code: 0, lines: () => ["Proposed 2 files as change <manifestPublished>, version <manifestVersion>.", "Published: commit <manifestCommit>, by the merge {manifestPublished}:<seq>."] },
    }, prepare("two-controlled"), {
      title: "Propose a controlled two-text-file branch: refused by name", scene: "after 16, artroom propose control", who: "maintainer",
      typed: () => ["artroom", "propose", "two-controlled"],
      expect: { code: 1, lines: () => ["Proposed 2 files as change <manifestRefused>, version <manifestRefusedVersion>.", "Not published: the merge {manifestRefused}:<seq> is refused, rules-not-met:rules. The change {manifestRefused} stays open at version {manifestRefusedVersion}. When it may be merged, run: artroom merge {manifestRefused}"] },
    });
    const merged = list.find((shot) => shot.title === "Merge: it publishes")!;
    merged.expect.lines = () => ["Published: commit <controlledCommit>, by the merge {controlled}:<seq>."];
    const verify = list.find((shot) => shot.title === "The verifier, every scope")!;
    const before = verify.expect.lines;
    verify.expect.lines = (v) => {
      const lines = before(v);
      const afterPublished = lines.findIndex((line) => line.startsWith("lane {published},")) + 1;
      return [...lines.slice(0, afterPublished), "lane {manifestPublished}, entry <seq>: consistent.", "lane {manifestRefused}, entry <seq>: consistent.", ...lines.slice(afterPublished, -1), "All consistent: 14 scopes."];
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

function need(v: Found, name: string): string {
  const value = v[name];
  if (value === undefined) throw new Missing(`no earlier shot printed ${name}`);
  return value;
}

/** The typed words with each `{name}` filled from the values kept so far. */
const filled = (words: readonly string[], v: Found): string[] => words.map((word) => word.replace(/\{([A-Za-z]+)\}/g, (_, name: string) => need(v, name)));

const escaped = (text: string) => text.replace(/[.*+?^$(){}|[\]\\]/g, "\\$&");

/** One expected line as a pattern: each `<name>` a kept group, `<...>` any text, `{name}` the kept value. */
function pattern(template: string, v: Found, named: Set<string>): RegExp {
  let source = "";
  for (const part of template.split(/(<[A-Za-z]+>|<\.\.\.>|\{[A-Za-z]+\})/)) {
    if (part === "<...>") source += ".*?";
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
export function judged(expected: { code: number; lines: readonly string[] }, outcome: Outcome, v: Found): string | null {
  if (outcome.code !== expected.code) return `exit ${outcome.code}, where ${expected.code} is expected`;
  if (outcome.lines.length !== expected.lines.length) return `${outcome.lines.length} lines, where ${expected.lines.length} are expected`;
  const kept: Found = {};
  for (let i = 0; i < expected.lines.length; i++) {
    let found: RegExpExecArray | null;
    try {
      found = pattern(expected.lines[i]!, { ...v, ...kept }, new Set()).exec(outcome.lines[i]!);
    } catch (error) {
      if (error instanceof Missing) return `line ${i + 1}: ${error.message}`;
      throw error;
    }
    if (!found) return `line ${i + 1} is not "${expected.lines[i]}"`;
    Object.assign(kept, found.groups ?? {});
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
  const founding = plan["founding"];
  if (!config || config.key !== "operator" || config.service !== stage.service || plan["service"] !== stage.service
    || plan["register"] !== register || !isScopeId(register) || plan["definition"] !== definition
    || !isPlatformDefinition(definition) || platformName(definition) !== "platform:register" || platform(definition) === null
    || !isSignedIntentShape(founding) || !verifySignedIntent(founding) || founding.intent.kind !== "install" || founding.intent.to !== null
    || founding.intent.on !== null || Object.keys(founding.intent.expected).length !== 0
    || founding.intent.fields["host"] !== stage.host || founding.intent.fields["namespace"] !== stage.namespace
    || scopeIdOf({ v: 1, kind: "register", definition, creator: null, cause: intentDigest(founding.intent), ordinal: 0 }) !== register) return null;
  const secret = await ctx.store.secret(config.key);
  if (!(secret instanceof Uint8Array) || secret.length !== 32 || keyIdOfSecret(secret) !== founding.intent.actor) return null;
  if (installed) {
    const rawAcknowledgement = plan["acknowledged"];
    if (!rawAcknowledgement || typeof rawAcknowledgement !== "object" || Array.isArray(rawAcknowledgement)) return null;
    const acknowledgement = rawAcknowledgement as Record<string, unknown>;
    const receipt = acknowledgement["receipt"];
    if (acknowledgement["status"] !== "service-acknowledged" || acknowledgement["service"] !== stage.service || !isReceipt(receipt)
      || receipt.definition !== definition || receipt.intent !== intentDigest(founding.intent) || receipt.fact.at.scope !== register
      || receipt.fact.at.kind !== "register" || receipt.fact.seq !== 0 || !isScopeRef(config.register) || canonicalize(config.register) !== canonicalize(receipt.fact.at)) return null;
  }
  return founding.intent.actor;
}

/** Runs every shot in order, each as the person it names, and keeps going after a shot that does not match while it can. */
export async function rehearse(stage: Stage): Promise<Rehearsal> {
  const now = () => (stage.now ? stage.now() : Date.now());
  const people: Partial<Record<Person, Context>> = {};
  const personOf = async (who: Person) => (people[who] ??= await stage.person(who));
  const v: Found = {};
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
    const shows = expected.lines.find((line) => line.startsWith("Shows: \""))?.slice(8, -1) ?? null;
    if (words[0] === "GET") outcome = seen(await stage.get(words[1]!), shows);
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
    const names = ["register", "directory", "membership", "rules", "destination", "issue", "published", "controlled", "refused", "manifestPublished", "manifestRefused"]
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
    };
    taken.push(done);
    stage.told?.(done);
  }
  const room: Room = { service: slash(stage.service) };
  for (const name of ["register", "directory", "membership", "rules", "destination", "issue", "published", "controlled", "refused"] as const) if (v[name] !== undefined) room[name] = v[name];
  return { shots: taken, room, ok: taken.every((shot) => shot.match) };
}

/** A word as a person types it in a shell: quoted when it holds a space or a character the shell reads. */
function quoted(word: string): string {
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(word) ? word : `'${word.replace(/'/g, "'\\''")}'`;
}

const cell = (lines: readonly string[]) => lines.map((line) => line.replace(/\|/g, "\\|").replace(/</g, "&lt;")).join("<br>") || "(nothing)";

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
