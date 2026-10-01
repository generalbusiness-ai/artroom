/**
 * The CLI test harness: a fake room per test (with the MCP Worker handler on
 * its MCP route), a temporary home, `cli()` that runs the command in process,
 * output normalization for snapshots, and a scan, after the file, of every
 * line printed for every credential any room issued (R-WS-4).
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeEach, expect } from "vitest";
import { connect } from "@generalbusiness/artroom-client";
import { createMcpFetch } from "@generalbusiness/artroom-mcp/worker";
import { FakeRoom } from "../../client/test/support/fake-room.ts";
import { invitationLink } from "../src/link.ts";
import { run, type Io } from "../src/main.ts";

export interface Result {
  code: number;
  out: string;
  err: string;
}

export function useHarness() {
  const h = { room: undefined as unknown as FakeRoom, tmp: "" };
  const transcript: string[] = [];
  const secrets: string[] = [];

  beforeEach(async () => {
    h.room = await FakeRoom.create();
    await h.room.start();
    const room = h.room;
    // The deployment's MCP Worker: a bearer handle on RoomWire (bearerAct, bearerRequest), null for a bad token.
    const mcp = createMcpFetch<unknown>({
      room: (_r, _e, bearer) => connect({ room: async () => room.wire() }, room.id, { kind: "bearer", token: bearer }).catch(() => null),
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
    const text = transcript.join("\n");
    for (const s of secrets) expect(text).not.toContain(s);
  });

  async function cli(home: string, argv: string[], cwd = h.tmp, extra: Partial<Io> = {}): Promise<Result> {
    const out: string[] = [];
    const err: string[] = [];
    const code = await run(argv, { out: (l) => out.push(l), err: (l) => err.push(l), env: { ARTROOM_HOME: home, HOME: home }, cwd, ...extra });
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

  function git(cwd: string, ...args: string[]): string {
    return execFileSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", HOME: h.tmp } }).trim();
  }

  function repo(): string {
    const dir = join(h.tmp, "repo");
    execFileSync("mkdir", ["-p", dir]);
    git(dir, "init", "-q", "-b", "main");
    git(dir, "config", "user.email", "a@example.com");
    git(dir, "config", "user.name", "A");
    writeFileSync(join(dir, "README.md"), "hello\n");
    git(dir, "add", ".");
    git(dir, "commit", "-q", "-m", "first");
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

  return { h, cli, norm, git, repo, link, login, mode };
}
