/**
 * Review 744a018a: one installation owner, kept at the destination itself.
 *
 * `.git/artroom/owner.json` records who owns a repository's Artroom remote
 * and credential: a revision, the installation, its Room, lane and lease.
 * `artroom workspace` reserves it before its first await, so the Room,
 * lane and repository are fixed at the start, and installs only if it
 * still owns the destination at the end, whatever Room or command touched
 * it since. A release changes a destination only if its owner is
 * unchanged since the release was prepared. Unrelated repositories are
 * independent.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { FakeRoom } from "../../client/test/support/fake-room.ts";
import { invitationLink } from "../src/link.ts";
import { EXIT } from "../src/main.ts";
import { useHarness } from "./harness.ts";

const { h, cli, login, git } = useHarness();

const config = (home: string) => JSON.parse(readFileSync(join(home, "config.json"), "utf8"));
const roomOf = (home: string, id = h.room.id) => config(home).rooms[id];
const credential = (dir: string) => join(dir, ".git", "artroom", "credentials");
const owner = (dir: string) => JSON.parse(readFileSync(join(dir, ".git", "artroom", "owner.json"), "utf8"));

function repoAt(name: string): string {
  const dir = join(h.tmp, name);
  mkdirSync(dir, { recursive: true });
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "a@example.com");
  git(dir, "config", "user.name", "A");
  writeFileSync(join(dir, "README.md"), "hello\n");
  git(dir, "add", ".");
  git(dir, "commit", "-q", "-m", "first");
  return dir;
}

/** A fetch that holds the first response matching `when`, after the room has answered it, until released. */
function pauseAt(when: (url: string, body: string) => boolean) {
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

const atSession = () => pauseAt((url, body) => url.endsWith("/requests") && body.includes('"session"'));
const atLaneRead = (lane: string) => pauseAt((url) => url.includes(`/lanes/${lane}`));
const atToken = () => pauseAt((url, body) => url.endsWith("/requests") && body.includes('"workspace-token"'));

describe("the reservation is made before the first await", () => {
  test.each([
    ["the read session", (_x: string) => atSession()],
    ["the held-lane read", (x: string) => atLaneRead(x)],
    ["the token response", (_x: string) => atToken()],
  ])("an older workspace delayed at %s does not overwrite a newer workspace for another lane", async (_where, pauser) => {
    const home = join(h.tmp, "alice");
    const dir = repoAt("repo");
    await login(home, "@alice");
    await cli(home, ["claim", "src/**", "--goal", "x"], dir);
    const x = roomOf(home).lane as string;
    const pause = pauser(x);
    const old = cli(home, ["workspace"], dir, { fetch: pause.fetch });
    await pause.reached;
    await cli(home, ["claim", "lib/**", "--goal", "y"], dir);
    const y = roomOf(home).lane as string;
    expect((await cli(home, ["workspace"], dir)).code).toBe(EXIT.ok);
    const newer = { file: readFileSync(credential(dir), "utf8"), remote: git(dir, "remote", "get-url", "artroom"), mapping: roomOf(home).workspaces[y] };
    pause.release();
    const res = await old;
    expect(res.code).toBe(EXIT.failed);
    expect(res.out).toContain(`Did not install the workspace for lane ${x}`);
    expect(readFileSync(credential(dir), "utf8")).toBe(newer.file);
    expect(git(dir, "remote", "get-url", "artroom")).toBe(newer.remote);
    expect(roomOf(home).workspaces[y]).toEqual(newer.mapping);
    expect(roomOf(home).workspaces[x]).toBeUndefined();
    expect(roomOf(home).lane).toBe(y);
    expect(owner(dir)).toMatchObject({ state: "installed", lane: y, install: newer.mapping.install });
  });

  test("workspaces in unrelated repositories do not supersede each other", async () => {
    const home = join(h.tmp, "alice");
    const one = repoAt("one");
    const two = repoAt("two");
    await login(home, "@alice");
    await cli(home, ["claim", "src/**", "--goal", "x"], one);
    const x = roomOf(home).lane as string;
    const pause = atLaneRead(x);
    const first = cli(home, ["workspace"], one, { fetch: pause.fetch });
    await pause.reached;
    expect((await cli(home, ["workspace"], two)).code).toBe(EXIT.ok);
    pause.release();
    expect((await first).code).toBe(EXIT.ok);
    expect(owner(one)).toMatchObject({ state: "installed", lane: x });
    expect(owner(two)).toMatchObject({ state: "installed", lane: x });
    expect(owner(one).install).not.toBe(owner(two).install);
  });
});

describe("ownership is shared by every Room that writes the repository", () => {
  let other: FakeRoom;
  beforeEach(async () => {
    other = await FakeRoom.create({ name: "other/repo" });
    await other.start();
  });
  afterEach(() => other.stop());

  async function joinOther(home: string, dir: string): Promise<void> {
    const inv = await other.invite("@alice");
    expect((await cli(home, ["login", invitationLink(other.url, other.id, inv.invitation, inv.secret)], dir)).code).toBe(EXIT.ok);
  }

  test.each([
    ["the read session", () => atSession()],
    ["the token response", () => atToken()],
  ])("a workspace for Room A delayed at %s does not overwrite Room B's newer installation in the same repository", async (_where, pauser) => {
    const home = join(h.tmp, "alice");
    const dir = repoAt("repo");
    await login(home, "@alice");
    await cli(home, ["claim", "src/**", "--goal", "a"], dir);
    const pause = pauser();
    const old = cli(home, ["workspace"], dir, { fetch: pause.fetch });
    await pause.reached;
    await joinOther(home, dir);
    await cli(home, ["claim", "lib/**", "--goal", "b"], dir);
    expect((await cli(home, ["workspace"], dir)).code).toBe(EXIT.ok);
    const newer = { file: readFileSync(credential(dir), "utf8"), remote: git(dir, "remote", "get-url", "artroom") };
    pause.release();
    expect((await old).code).toBe(EXIT.failed);
    expect(readFileSync(credential(dir), "utf8")).toBe(newer.file);
    expect(git(dir, "remote", "get-url", "artroom")).toBe(newer.remote);
    expect(owner(dir).room).toBe(other.id);
    expect(roomOf(home, h.room.id).workspaces ?? {}).toEqual({});
  });

  test("a release in Room A leaves Room B's newer installation in the same repository alone", async () => {
    const home = join(h.tmp, "alice");
    const dir = repoAt("repo");
    await login(home, "@alice");
    await cli(home, ["claim", "src/**", "--goal", "a"], dir);
    expect((await cli(home, ["workspace"], dir)).code).toBe(EXIT.ok);
    await joinOther(home, dir);
    await cli(home, ["claim", "lib/**", "--goal", "b"], dir);
    expect((await cli(home, ["workspace"], dir)).code).toBe(EXIT.ok);
    const b = readFileSync(credential(dir), "utf8");
    const res = await cli(home, ["release", "--room", h.room.id], dir);
    expect(res.code).toBe(EXIT.ok);
    expect(readFileSync(credential(dir), "utf8")).toBe(b);
    expect(owner(dir).room).toBe(other.id);
    expect(existsSync(credential(dir))).toBe(true);
  });
});
