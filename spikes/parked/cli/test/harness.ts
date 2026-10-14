/**
 * The CLI test harness: a fake room per test (with the MCP Worker handler on
 * its MCP route), a temporary home, `cli()` that runs the command in process,
 * output normalization for snapshots, and a scan, after the file, of every
 * line printed for every credential any room issued (R-WS-4).
 *
 * Each `cli()` run makes one attempt at each request (`Io.retries` 0). The
 * client's own retries within a run, and the waits between them, are the
 * client package's subject (R-IDEM-6). Here a lost answer ends the run, and
 * the next run finishes the work from the journal.
 *
 * Git is real by default. A file whose subject is what artroom decides, not
 * what git does (which installation owns a repository's credential, what a
 * recovered act may change), asks for the stand-in: the handful of git
 * commands the CLI runs, answered from a small file in the repository's
 * `.git` directory. cli.test.ts and hygiene.test.ts keep real git.
 */

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, expect } from "vitest";
import { connect } from "@generalbusiness/artroom-client";
import { createMcpFetch } from "@generalbusiness/artroom-mcp/worker";
import { FakeRoom } from "../../client/test/support/fake-room.ts";
import { gitCommand, readOwner } from "../src/git.ts";
import { invitationLink } from "../src/link.ts";
import { run, type Io } from "../src/main.ts";

export interface Result {
  code: number;
  out: string;
  err: string;
}

/** A crash after the named durable step: the Io's step hook throws there. */
export const crashAt = (name: string) => ({
  step: (s: string) => {
    if (s === name) throw new Error(`interrupted after ${s}`);
  },
});

/** A fetch that holds the first response matching `when`, after the room has answered it, until released. */
export function pauseAt(when: (url: string, body: string) => boolean) {
  let release!: () => void;
  let arrived!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const reached = new Promise<void>((r) => (arrived = r));
  let paused = false;
  const hold: typeof fetch = async (input, init) => {
    const res = await fetch(input, init);
    if (!paused && when(String(input), typeof init?.body === "string" ? init.body : "")) {
      paused = true;
      arrived();
      await gate;
    }
    return res;
  };
  return { fetch: hold, reached, release };
}
/** Holds a workspace command at its first request to the room: the read session. */
export const atSession = () => pauseAt((url, body) => url.endsWith("/requests") && body.includes('"session"'));
/** Holds a workspace command at its last answer from the room: the workspace token. */
export const atToken = () => pauseAt((url, body) => url.endsWith("/requests") && body.includes('"workspace-token"'));

/** Where a repository's workspace credential is. */
export const credential = (dir: string) => join(dir, ".git", "artroom", "credentials");
/** The owner record of a repository's workspace. */
export const ownerOf = (dir: string) => readOwner(join(dir, ".git"));
/** The CLI's config file in `home`, as JSON. */
export const config = (home: string) => JSON.parse(readFileSync(join(home, "config.json"), "utf8"));

const realGit = gitCommand.run;

/** What the stand-in keeps for one repository, in `.git/stand-in.json`. */
interface StandIn {
  head: string;
  remotes: Record<string, string>;
  includes: string[];
}

let commits = 0;
const sha = () => (++commits).toString(16).padStart(40, "0");

/**
 * The git commands the CLI and these tests run, answered without git. As
 * git does, it prints what was asked for, and throws when there is nothing
 * to print or the directory is no repository.
 */
function standInGit(cwd: string, args: readonly string[]): string {
  const file = join(cwd, ".git", "stand-in.json");
  if (!existsSync(file)) throw new Error("fatal: not a git repository");
  const s = JSON.parse(readFileSync(file, "utf8")) as StandIn;
  const save = () => writeFileSync(file, JSON.stringify(s));
  const fail = (): never => {
    throw new Error(`git ${args.join(" ")}: nothing to print`);
  };
  const [a, b, c, d, e] = args;
  if (a === "rev-parse" && b === "--git-common-dir") return ".git";
  if (a === "rev-parse" && b === "HEAD") return s.head;
  if (a === "commit") return ((s.head = sha()), save(), "");
  if (a === "remote" && b === undefined) return Object.keys(s.remotes).join("\n");
  if (a === "remote" && b === "get-url") return s.remotes[c!] ?? fail();
  if (a === "remote" && (b === "add" || b === "set-url")) {
    if ((b === "add") === (s.remotes[c!] !== undefined)) fail();
    return ((s.remotes[c!] = d!), save(), "");
  }
  if (a === "config" && b === "--local" && c === "--get-all" && d === "include.path") return s.includes.length > 0 ? s.includes.join("\n") : fail();
  if (a === "config" && b === "--local" && c === "--add" && d === "include.path") return (s.includes.push(e!), save(), "");
  throw new Error(`The stand-in for git does not know: git ${args.join(" ")}`);
}

/** A real repository with one commit, made once for this process and copied for each test. */
let template: string | undefined;
function templateRepo(): string {
  if (template !== undefined) return template;
  const dir = mkdtempSync(join(tmpdir(), "artroom-cli-repo-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8", env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", HOME: dir } });
  git("init", "-q", "-b", "main");
  git("config", "user.email", "a@example.com");
  git("config", "user.name", "A");
  writeFileSync(join(dir, "README.md"), "hello\n");
  git("add", ".");
  git("commit", "-q", "-m", "first");
  process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
  return (template = dir);
}

export function useHarness(opts: { git?: "real" | "stand-in" } = {}) {
  const standIn = opts.git === "stand-in";
  const h = { room: undefined as unknown as FakeRoom, tmp: "" };
  const transcript: string[] = [];
  const secrets: string[] = [];

  beforeAll(() => {
    gitCommand.run = standIn ? standInGit : realGit;
  });
  beforeEach(async () => {
    h.room = await FakeRoom.create();
    await h.room.start();
    const room = h.room;
    // A workspace is ready at the first read after it was asked for, with no second poll of the fake room.
    room.workspaceDelay = 0;
    // The deployment's MCP Worker: a bearer handle on RoomWire (bearerAct, bearerRequest), null for a bad token.
    const mcp = createMcpFetch<unknown>({
      room: (_r, _e, bearer) => connect({ room: async () => room.wire() }, room.id, { kind: "bearer", token: bearer }).catch(() => null),
      // What the Room gives its endpoint for `tools/list`: the bearer's role and signed grant (R-API-14).
      caller: (_r, _e, bearer) => room.bearerCaller(bearer),
    });
    room.mcp = (request) => mcp(request, {});
    h.tmp = mkdtempSync(join(tmpdir(), "artroom-cli-"));
  });
  afterEach(async () => {
    secrets.push(...h.room.secrets());
    await h.room.stop();
    rmSync(h.tmp, { recursive: true, force: true });
  });
  afterAll(() => {
    gitCommand.run = realGit;
    const text = transcript.join("\n");
    for (const s of secrets) expect(text).not.toContain(s);
  });

  async function cli(home: string, argv: string[], cwd = h.tmp, extra: Partial<Io> = {}): Promise<Result> {
    const out: string[] = [];
    const err: string[] = [];
    const code = await run(argv, { out: (l) => out.push(l), err: (l) => err.push(l), env: { ARTROOM_HOME: home, HOME: home }, cwd, retries: 0, ...extra });
    transcript.push(...out, ...err);
    return { code, out: out.join("\n"), err: err.join("\n") };
  }

  /** Replaces values that change from run to run, so snapshots are stable. */
  function norm(text: string): string {
    return text
      .replaceAll(h.room.id, "room_ID")
      .replaceAll(h.room.url, "http://ROOM")
      .replaceAll(h.tmp, "TMP")
      .replace(/act_(\d+)_[0-9a-f]{8}/g, "act_$1_HASH")
      .replace(/key_[A-Za-z0-9_-]{43}/g, "key_ID")
      .replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z/g, "TIME")
      .replace(/\b[0-9a-f]{40}\b/g, "SHA")
      .replace(/\b[0-9a-f]{12}\b/g, "SHORT");
  }

  /** Runs git in `cwd`: real git, or the stand-in where this file asked for it. */
  function git(cwd: string, ...args: string[]): string {
    if (standIn) return standInGit(cwd, args);
    return execFileSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", HOME: h.tmp } }).trim();
  }

  /** A repository with one commit, in this test's temporary directory. */
  function repo(name = "repo"): string {
    const dir = join(h.tmp, name);
    if (standIn) {
      mkdirSync(join(dir, ".git"), { recursive: true });
      writeFileSync(join(dir, ".git", "stand-in.json"), JSON.stringify({ head: sha(), remotes: {}, includes: [] } satisfies StandIn));
    } else cpSync(templateRepo(), dir, { recursive: true });
    return dir;
  }

  async function link(handle: `@${string}`, opts: { role?: "member" | "agent"; custody?: "client" | "room" } = {}): Promise<string> {
    const { invitation, secret } = await h.room.invite(handle, opts);
    return invitationLink(h.room.url, h.room.id, invitation, secret);
  }

  async function login(home: string, handle: `@${string}`, role: "member" | "agent" = "member"): Promise<Result> {
    return cli(home, ["login", await link(handle, { role })]);
  }

  const mode = (path: string) => (statSync(path).mode & 0o777).toString(8);

  /** This room's part of the config in `home`. */
  const roomOf = (home: string, id: string = h.room.id) => config(home).rooms[id];
  /** The acts of `kind` the room has recorded. */
  const acts = (kind: string) => h.room.entries.filter((e) => e.entry.type === "act" && (e.entry.act.envelope.kind as string) === kind);
  /** How many requests reached `route`. */
  const calls = (route: string) => h.room.requests.filter((r) => r.route === route).length;
  /** The journal entries `home` holds for this room. */
  const journal = (home: string) => {
    const dir = join(home, "journal", h.room.id);
    return existsSync(dir) ? readdirSync(dir) : [];
  };

  return { h, cli, norm, git, repo, link, login, mode, roomOf, acts, calls, journal };
}
