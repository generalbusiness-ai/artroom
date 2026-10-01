/**
 * The `artroom` command against the fake room: snapshot tests of its plain
 * output, exit codes (0 done, 1 failed, 2 usage, 3 refused), --json, key
 * and token files written 0600, git set up without the token appearing in
 * any output (R-WS-4), and resumable login after a lost response (R-IDEM-2).
 */

import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, statSync, existsSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { connect } from "@generalbusiness/artroom-client";
import { createMcpFetch } from "@generalbusiness/artroom-mcp/worker";
import { FakeRoom } from "../../client/test/support/fake-room.ts";
import { invitationLink } from "../src/link.ts";
import { EXIT, run } from "../src/main.ts";

let room: FakeRoom;
let tmp: string;
const transcript: string[] = [];

beforeEach(async () => {
  room = await FakeRoom.create();
  await room.start();
  room.mcp = (request) =>
    createMcpFetch<unknown>({
      async room(_r, _e, bearer) {
        const s = await room.bearerSession(bearer);
        return s ? connect({ room: async () => room.wire() }, room.id, { kind: "delegation", signer: s.signer, as: s.delegation }) : null;
      },
    })(request, {});
  tmp = mkdtempSync(join(tmpdir(), "artroom-cli-"));
});
afterEach(async () => {
  await room.stop();
  rmSync(tmp, { recursive: true, force: true });
});

/** Every line any command printed, in any test, for the final leak scan. */
const allSecrets: string[] = [];
afterAll(() => {
  const text = transcript.join("\n");
  for (const s of allSecrets) expect(text).not.toContain(s);
});
beforeAll(() => {
  transcript.length = 0;
});
afterEach(() => {
  allSecrets.push(...room.secrets());
});

interface Result {
  code: number;
  out: string;
  err: string;
}

async function cli(home: string, argv: string[], cwd = tmp): Promise<Result> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(argv, { out: (l) => out.push(l), err: (l) => err.push(l), env: { ARTROOM_HOME: home, HOME: home }, cwd });
  transcript.push(...out, ...err);
  return { code, out: out.join("\n"), err: err.join("\n") };
}

/** Replaces values that change from run to run, so snapshots are stable. */
function norm(text: string): string {
  return text
    .replaceAll(room.id, "room_ID")
    .replaceAll(room.url, "http://ROOM")
    .replaceAll(tmp, "TMP")
    .replace(/act_(\d+)_[0-9a-f]{8}/g, "act_$1_HASH")
    .replace(/key_[A-Za-z0-9_-]{43}/g, "key_ID")
    .replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z/g, "TIME")
    .replace(/\b[0-9a-f]{40}\b/g, "SHA")
    .replace(/\b[0-9a-f]{12}\b/g, "SHORT");
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", HOME: tmp } }).trim();
}

function repo(): string {
  const dir = join(tmp, "repo");
  execFileSync("mkdir", ["-p", dir]);
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "a@example.com");
  git(dir, "config", "user.name", "A");
  writeFileSync(join(dir, "README.md"), "hello\n");
  git(dir, "add", ".");
  git(dir, "commit", "-q", "-m", "first");
  return dir;
}

async function login(home: string, handle: `@${string}`, role: "member" | "agent" = "member"): Promise<Result> {
  const { invitation, secret } = await room.invite(handle, { role });
  return cli(home, ["login", invitationLink(room.url, room.id, invitation, secret)]);
}

const mode = (path: string) => (statSync(path).mode & 0o777).toString(8);

describe("the loop, as a person types it", () => {
  test("login, claim, workspace, propose, land refused, review, land --wait, attention, explain, log, release", async () => {
    const alice = join(tmp, "alice");
    const bob = join(tmp, "bob");
    const dir = repo();

    const joined = await login(alice, "@alice");
    expect(joined.code).toBe(EXIT.ok);
    expect(norm(joined.out)).toMatchSnapshot("login");
    expect(mode(join(alice, "keys", `${room.id}.json`))).toBe("600");
    expect(mode(join(alice, "keys"))).toBe("700");
    expect(mode(join(alice, "config.json"))).toBe("600");
    expect(existsSync(join(alice, "keys", `${room.id}.pending.json`))).toBe(false);

    const claim = await cli(alice, ["claim", "src/**", "--goal", "Rate-limit login"], dir);
    expect(claim.code).toBe(EXIT.ok);
    expect(norm(claim.out)).toMatchSnapshot("claim");

    const ws = await cli(alice, ["workspace"], dir);
    expect(ws.code).toBe(EXIT.ok);
    expect(norm(ws.out)).toMatchSnapshot("workspace");
    const [token] = room.exposure.grants;
    const remote = git(dir, "remote", "get-url", "artroom");
    // Git itself reads the header through the include; the token is in the 0600 file only.
    expect(git(dir, "config", "--get", `http.${remote}.extraheader`)).toBe(`Authorization: Bearer ${token}`);
    expect(readFileSync(join(dir, ".git", "config"), "utf8")).not.toContain(token!);
    expect(mode(join(dir, ".git", "artroom", "credentials"))).toBe("600");

    expect((await login(bob, "@bob")).code).toBe(EXIT.ok);
    writeFileSync(join(dir, "README.md"), "hello, world\n");
    git(dir, "commit", "-q", "-am", "second");
    const propose = await cli(alice, ["propose", "-m", "Adds a token bucket to /api/login."], dir);
    expect(propose.code).toBe(EXIT.ok);
    expect(norm(propose.out)).toMatchSnapshot("propose");

    const early = await cli(alice, ["land"], dir);
    expect(early.code).toBe(EXIT.refused);
    expect(early.out).toBe("");
    expect(norm(early.err)).toMatchSnapshot("land refused");

    const todo = await cli(bob, ["attention"]);
    expect(norm(todo.out)).toMatchSnapshot("bob attention");
    const lane = /act_\d+_[0-9a-f]{8}/.exec(claim.out)![0];
    const review = await cli(bob, ["review", `${lane}#1`, "--approve", "--scope", "src/**", "-m", "Limits look right."]);
    expect(review.code).toBe(EXIT.ok);
    expect(norm(review.out)).toMatchSnapshot("review");

    const landed = await cli(alice, ["land", "--wait"], dir);
    expect(landed.code).toBe(EXIT.ok);
    expect(norm(landed.out)).toMatchSnapshot("land --wait");

    expect(norm((await cli(alice, ["attention"])).out)).toMatchSnapshot("alice attention");
    const refusalAct = /Recorded as (act_\d+_[0-9a-f]{8})/.exec(early.err)![1]!;
    expect(norm((await cli(alice, ["explain", refusalAct])).out)).toMatchSnapshot("explain");
    expect(norm((await cli(alice, ["log", "--after", "8", "--limit", "4"])).out)).toMatchSnapshot("log");

    const released = await cli(alice, ["release", "-m", "Landed; nothing left."], dir);
    expect(released.code).toBe(EXIT.ok);
    expect(norm(released.out)).toMatchSnapshot("release");
    expect(existsSync(join(dir, ".git", "artroom", "credentials"))).toBe(false);
  });

  test("--json prints the record, and a refusal as JSON with exit code 3", async () => {
    const alice = join(tmp, "alice");
    await login(alice, "@alice");
    const claim = await cli(alice, ["claim", "src/**", "--goal", "g", "--json"]);
    expect(JSON.parse(claim.out)).toMatchObject({ kind: "claim", scope: ["src/**"], lease: { generation: 1 } });
    const stale = await cli(alice, ["propose", "-m", "s", "--head", "a".repeat(40), "--expect", "4", "--json"]);
    expect(stale.code).toBe(EXIT.refused);
    expect(JSON.parse(stale.out)).toMatchObject({ refused: true, rule: "generation-moved", current: { generation: 0 } });
    expect(stale.err).toBe("");
  });

  test("a refusal prints rule, reason and fix on stderr with exit code 3", async () => {
    const alice = join(tmp, "alice");
    await login(alice, "@alice");
    await cli(alice, ["claim", "src/**", "--goal", "g"]);
    const stale = await cli(alice, ["propose", "-m", "s", "--head", "a".repeat(40), "--expect", "4"]);
    expect(stale.code).toBe(EXIT.refused);
    expect(norm(stale.err)).toMatchSnapshot("generation-moved");
  });
});

describe("joining", () => {
  test("a refused login leaves no key behind", async () => {
    const alice = join(tmp, "alice");
    const { invitation, secret } = await room.invite("@alice");
    const res = await cli(alice, ["login", invitationLink(room.url, room.id, invitation, `${secret}x`)]);
    expect(res.code).toBe(EXIT.refused);
    expect(norm(res.err)).toMatchSnapshot("login refused");
    expect(existsSync(join(alice, "keys", `${room.id}.json`))).toBe(false);
    expect(existsSync(join(alice, "keys", `${room.id}.pending.json`))).toBe(false);
  });

  test("a lost login response is finished by running the same command again, joining once", async () => {
    const alice = join(tmp, "alice");
    const { invitation, secret } = await room.invite("@alice");
    const link = invitationLink(room.url, room.id, invitation, secret);
    room.faults.push({ route: "POST /redeem", kind: "drop", times: 4 });
    const first = await cli(alice, ["login", link]);
    expect(first.code).toBe(EXIT.failed);
    expect(norm(first.err)).toMatchSnapshot("login lost");
    const second = await cli(alice, ["login", link]);
    expect(second.code).toBe(EXIT.ok);
    const joins = room.entries.filter((e) => e.entry.type === "act" && (e.entry.act.envelope.body as { op?: string }).op === "join");
    expect(joins).toHaveLength(1);
    expect((await cli(alice, ["attention"])).code).toBe(EXIT.ok);
  });

  test("a link with a missing secret is a usage error", async () => {
    const res = await cli(join(tmp, "x"), ["login", `${room.url}/rooms/${room.id}/join#i=act_1_00000000`]);
    expect(res.code).toBe(EXIT.usage);
    expect(res.err).toMatch(/Copy the whole link/);
  });

  test("redeem saves the bearer 0600, never prints it, and the agent can then act through MCP", async () => {
    const agent = join(tmp, "agent");
    const { invitation, secret } = await room.invite("@builder", { role: "agent", custody: "room" });
    const res = await cli(agent, ["redeem", invitationLink(room.url, room.id, invitation, secret)]);
    expect(res.code).toBe(EXIT.ok);
    expect(norm(res.out)).toMatchSnapshot("redeem");
    const [bearer] = room.exposure.bearers;
    expect(readFileSync(join(agent, "bearers", room.id), "utf8").trim()).toBe(bearer);
    expect(mode(join(agent, "bearers", room.id))).toBe("600");
    expect(res.out + res.err).not.toContain(bearer!);
    const claim = await cli(agent, ["claim", "docs/**", "--goal", "Fix typos"]);
    expect(claim.code).toBe(EXIT.ok);
    expect(claim.out).toMatch(/^Claimed lane act_/);
  });

  test("a lost redemption says what to do, and saves nothing", async () => {
    const agent = join(tmp, "agent");
    const { invitation, secret } = await room.invite("@builder", { role: "agent", custody: "room" });
    room.faults.push({ route: "POST /redeem", kind: "drop" });
    const res = await cli(agent, ["redeem", invitationLink(room.url, room.id, invitation, secret)]);
    expect(res.code).toBe(EXIT.failed);
    expect(norm(res.err)).toMatchSnapshot("redeem lost");
    expect(existsSync(join(agent, "bearers", room.id))).toBe(false);
  });
});

describe("usage and agents", () => {
  test("usage errors exit 2 and say what to do", async () => {
    const home = join(tmp, "h");
    expect((await cli(home, ["frobnicate"])).code).toBe(EXIT.usage);
    const noRoom = await cli(home, ["claim", "src/**", "--goal", "g"]);
    expect(noRoom.code).toBe(EXIT.usage);
    expect(noRoom.err).toMatch(/artroom login/);
    const bad = await cli(home, ["land", "--bogus"]);
    expect(bad.code).toBe(EXIT.usage);
    expect(bad.err).toMatch(/Unknown option '--bogus'/);
  });

  test("agents-md prints a block under 30 lines that teaches the loop", async () => {
    const alice = join(tmp, "alice");
    await login(alice, "@alice");
    const res = await cli(alice, ["agents-md"]);
    expect(res.code).toBe(EXIT.ok);
    const lines = res.out.split("\n");
    expect(lines.length).toBeLessThan(30);
    expect(res.out).toMatchSnapshot("agents-md");
    for (const step of ["claim", "workspace", "propose", "attention", "land", "release", "idempotency-key", "fix"]) expect(res.out).toContain(step);
  });

  test("artroom mcp serves the ten tools over stdio from the real bin", async () => {
    const alice = join(tmp, "alice");
    await login(alice, "@alice");
    const child = spawn(process.execPath, [join(import.meta.dirname, "..", "bin", "artroom.js"), "mcp"], {
      env: { ...process.env, ARTROOM_HOME: alice },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let buffer = "";
    const replies = new Map<number, any>();
    child.stdout.on("data", (c: Buffer) => {
      buffer += c.toString();
      for (let nl = buffer.indexOf("\n"); nl >= 0; nl = buffer.indexOf("\n")) {
        const msg = JSON.parse(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
        if (msg.id !== undefined) replies.set(msg.id, msg);
      }
    });
    const send = async (id: number, method: string, params: unknown = {}) => {
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
      for (let i = 0; i < 1000 && !replies.has(id); i++) await new Promise((r) => setTimeout(r, 10));
      return replies.get(id);
    };
    const init = await send(1, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } });
    expect(init.result.serverInfo.name).toBe("artroom");
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
    const list = await send(2, "tools/list");
    expect(list.result.tools.map((t: { name: string }) => t.name).sort()).toEqual(
      ["attention", "claim", "explain", "land", "note", "propose", "release", "renew", "review", "workspace"],
    );
    const claim = await send(3, "tools/call", { name: "claim", arguments: { goal: "g", scope: ["src/**"] } });
    expect(claim.result.structuredContent.by).toMatchObject({ via: "member", member: "@alice" });
    child.stdin.end();
    const code = await new Promise<number | null>((resolve) => child.on("exit", resolve));
    expect(code).toBe(0);
  });
});
