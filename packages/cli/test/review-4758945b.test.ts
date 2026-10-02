/**
 * Review 4758945b.
 *
 * - P2: the installed credential's record and a workspace's reservation
 *   are separate. A failed or superseded reservation never erases the
 *   evidence a release needs, and a release removes exactly a credential
 *   whose file names one of its lane's own installations, without
 *   cancelling a newer reservation or touching another Room's credential.
 * - P2: installed workspaces from schema 2 and 3 are upgraded with their
 *   mappings as evidence. A release removes such a credential only when
 *   the file's installation mark proves it is the mapped installation, and
 *   otherwise prints the manual step and keeps the duty.
 * - P2: the destination lock names its holder (process, host, token). Age
 *   is never evidence; only a holder provably dead on this host is
 *   recovered, a lock is removed only by its own token, and the holder
 *   checks it still holds the lock before writing.
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { FakeRoom } from "../../client/test/support/fake-room.ts";
import { lockWait, readOwner, withDestination } from "../src/git.ts";
import { invitationLink } from "../src/link.ts";
import { EXIT } from "../src/main.ts";
import { useHarness } from "./harness.ts";

const { h, cli, login, git } = useHarness();

const configPath = (home: string) => join(home, "config.json");
const config = (home: string) => JSON.parse(readFileSync(configPath(home), "utf8"));
const roomOf = (home: string, id = h.room.id) => config(home).rooms[id];
const credential = (dir: string) => join(dir, ".git", "artroom", "credentials");
const ownerOf = (dir: string) => readOwner(join(dir, ".git"));
const crashAt = (name: string) => ({
  step: (s: string) => {
    if (s === name) throw new Error(`interrupted after ${s}`);
  },
});

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
const atToken = () => pauseAt((url, body) => url.endsWith("/requests") && body.includes('"workspace-token"'));

/** Lane X claimed and its workspace installed in `dir`; returns X. */
async function installed(home: string, dir: string, goal = "x", scope = "src/**"): Promise<string> {
  await cli(home, ["claim", scope, "--goal", goal], dir);
  const lane = roomOf(home).lane as string;
  expect((await cli(home, ["workspace"], dir)).code).toBe(EXIT.ok);
  return lane;
}

describe("P2: the installed credential's record is separate from reservations", () => {
  test("failed before the token: a later lane's failed reservation does not stop the release of the installed lane", async () => {
    const home = join(h.tmp, "alice");
    const dir = repoAt("repo");
    await login(home, "@alice");
    const x = await installed(home, dir);
    await cli(home, ["claim", "lib/**", "--goal", "y"], dir);
    const offline: typeof fetch = async (input, init) => {
      if (String(input).includes("/lanes/")) throw new Error("offline before the held-lane read");
      return fetch(input, init);
    };
    expect((await cli(home, ["workspace"], dir, { fetch: offline })).code).toBe(EXIT.failed);
    const res = await cli(home, ["release", "--lane", x], dir);
    expect(res.code).toBe(EXIT.ok);
    expect(res.out).toContain(`Removed the workspace credential for lane ${x}, lease 1, from ${credential(dir)}.`);
    expect(existsSync(credential(dir))).toBe(false);
    expect(roomOf(home).workspaces[x]).toBeUndefined();
    expect(ownerOf(dir).installed).toBeUndefined();
    expect(ownerOf(dir).reservation?.lane).toBe(roomOf(home).lane); // lane Y's reservation is not cancelled
  });

  test("failed install: a reservation that recorded its installation and stopped before writing leaves the installed lane removable", async () => {
    const home = join(h.tmp, "alice");
    const dir = repoAt("repo");
    await login(home, "@alice");
    const x = await installed(home, dir);
    await cli(home, ["claim", "lib/**", "--goal", "y"], dir);
    const y = roomOf(home).lane as string;
    expect((await cli(home, ["workspace"], dir, crashAt("workspace-installing"))).code).toBe(EXIT.failed);
    expect(ownerOf(dir).installing?.lane).toBe(y);
    expect(readFileSync(credential(dir), "utf8")).toContain(`lane ${x},`);
    expect((await cli(home, ["release", "--lane", x], dir)).code).toBe(EXIT.ok);
    expect(existsSync(credential(dir))).toBe(false);
    expect(ownerOf(dir).installing?.lane).toBe(y); // another lane's evidence is kept
    // Y's own release clears Y's evidence, and removes nothing it does not own.
    expect((await cli(home, ["release", "--lane", y], dir)).code).toBe(EXIT.ok);
    expect(ownerOf(dir).installing).toBeUndefined();
  });

  test("delayed retry: a release of lane X while lane Y's workspace waits for its token lets Y install afterwards", async () => {
    const home = join(h.tmp, "alice");
    const dir = repoAt("repo");
    await login(home, "@alice");
    const x = await installed(home, dir);
    await cli(home, ["claim", "lib/**", "--goal", "y"], dir);
    const y = roomOf(home).lane as string;
    const pause = atToken();
    const later = cli(home, ["workspace"], dir, { fetch: pause.fetch });
    await pause.reached;
    expect((await cli(home, ["release", "--lane", x], dir)).code).toBe(EXIT.ok);
    expect(existsSync(credential(dir))).toBe(false);
    pause.release();
    expect((await later).code).toBe(EXIT.ok);
    expect(readFileSync(credential(dir), "utf8")).toContain(`lane ${y},`);
    expect(ownerOf(dir).installed?.lane).toBe(y);
  });

  test("a recovered release does not cancel a newer reservation for the same lane", async () => {
    const home = join(h.tmp, "alice");
    const dir = repoAt("repo");
    await login(home, "@alice");
    const x = await installed(home, dir);
    const release = ["release", "--idempotency-key", "rel-old"];
    expect((await cli(home, release, dir, crashAt("act-answered"))).code).toBe(EXIT.failed);
    expect((await cli(home, ["claim", "src/**", "--lane", x], dir)).code).toBe(EXIT.ok);
    const pause = atToken();
    const newer = cli(home, ["workspace"], dir, { fetch: pause.fetch });
    await pause.reached;
    expect((await cli(home, release, dir)).code).toBe(EXIT.ok);
    expect(ownerOf(dir).reservation?.lane).toBe(x);
    pause.release();
    expect((await newer).code).toBe(EXIT.ok);
    expect(ownerOf(dir).installed).toMatchObject({ lane: x, lease: 2 });
  });
});

describe("P2: schema-2 installed workspaces are upgraded with their evidence", () => {
  /** Rewrites the config as schema 2 wrote it: a room-level workspace revision, no destinations, no owner record. */
  function asSchema2(home: string, dir: string): void {
    const c = config(home);
    const r = c.rooms[h.room.id];
    c.v = 2;
    delete r.destinations;
    r.workspaceRev = 2;
    r.workspaceBy = Object.values(r.workspaces as Record<string, { install: string }>)[0]!.install;
    writeFileSync(configPath(home), JSON.stringify(c));
    rmSync(join(dir, ".git", "artroom", "owner.json")); // schema 2 had no owner record
  }

  test("a fresh release after the upgrade removes the mapped credential, proved by its installation mark, and says so", async () => {
    const home = join(h.tmp, "alice");
    const dir = repoAt("repo");
    await login(home, "@alice");
    const x = await installed(home, dir);
    asSchema2(home, dir);
    const res = await cli(home, ["release"], dir);
    expect(res.code).toBe(EXIT.ok);
    expect(res.out).toContain(`Removed the workspace credential for lane ${x}, lease 1, from ${credential(dir)}.`);
    expect(existsSync(credential(dir))).toBe(false);
    expect(roomOf(home).workspaces[x]).toBeUndefined();
    expect(config(home).v).toBe(4);
  });

  test("a schema-2 mapping whose file has no installation mark keeps the file and the mapping, and names the manual step", async () => {
    const home = join(h.tmp, "alice");
    const dir = repoAt("repo");
    await login(home, "@alice");
    const x = await installed(home, dir);
    asSchema2(home, dir);
    const text = readFileSync(credential(dir), "utf8").split("\n");
    text[0] = `# artroom workspace credential for lane ${x}, lease 1.`; // an older mark, with no installation ID
    writeFileSync(credential(dir), text.join("\n"));
    const res = await cli(home, ["release"], dir);
    expect(res.code).toBe(EXIT.ok);
    expect(res.out).toContain(`Manual local step: ${credential(dir)} has no installation mark artroom can read. If it still holds lane ${x}'s credential, remove it by hand.`);
    expect(existsSync(credential(dir))).toBe(true);
    expect(roomOf(home).workspaces[x]).toBeDefined(); // the duty is kept
  });

  test("a schema-2 mapping whose file another Room has since replaced: the newer credential is left, and the duty is done", async () => {
    const other = await FakeRoom.create({ name: "other/repo" });
    await other.start();
    try {
      const home = join(h.tmp, "alice");
      const dir = repoAt("repo");
      await login(home, "@alice");
      const x = await installed(home, dir);
      asSchema2(home, dir);
      const inv = await other.invite("@alice");
      await cli(home, ["login", invitationLink(other.url, other.id, inv.invitation, inv.secret)], dir);
      await cli(home, ["claim", "lib/**", "--goal", "b"], dir);
      expect((await cli(home, ["workspace"], dir)).code).toBe(EXIT.ok);
      const b = readFileSync(credential(dir), "utf8");
      const res = await cli(home, ["release", "--room", h.room.id, "--lane", x], dir);
      expect(res.code).toBe(EXIT.ok);
      expect(res.out).toContain(`Left the workspace credential at ${credential(dir)}: a newer workspace installed it.`);
      expect(readFileSync(credential(dir), "utf8")).toBe(b);
      expect(roomOf(home).workspaces[x]).toBeUndefined();
    } finally {
      await other.stop();
    }
  });

  test("an older journal's release, recovered after another Room replaced the credential, changes nothing and names the manual steps", async () => {
    const other = await FakeRoom.create({ name: "other/repo" });
    await other.start();
    try {
      const home = join(h.tmp, "alice");
      const dir = repoAt("repo");
      await login(home, "@alice");
      const x = await installed(home, dir);
      expect((await cli(home, ["release", "--idempotency-key", "rel-v3"], dir, crashAt("act-answered"))).code).toBe(EXIT.failed);
      // As schema 3 wrote it: owner revisions per destination, not the installations owned.
      const path = join(home, "journal", h.room.id, "act-rel-v3.json");
      const e = JSON.parse(readFileSync(path, "utf8"));
      e.v = 3;
      e.local = { kind: "release-lane", lane: x, lease: 1, destinations: [{ dir: join(dir, ".git"), rev: 2 }], laneRev: 1, landingRev: 0 };
      writeFileSync(path, JSON.stringify(e));
      const inv = await other.invite("@alice");
      await cli(home, ["login", invitationLink(other.url, other.id, inv.invitation, inv.secret)], dir);
      await cli(home, ["claim", "lib/**", "--goal", "b"], dir);
      expect((await cli(home, ["workspace"], dir)).code).toBe(EXIT.ok);
      const b = readFileSync(credential(dir), "utf8");
      const res = await cli(home, ["release", "--room", h.room.id, "--idempotency-key", "rel-v3"], dir);
      expect(res.code).toBe(EXIT.ok);
      expect(res.out).toContain("Manual local step: This release was recorded by an older artroom, so its local cleanup was not done.");
      expect(res.out).toContain(`Manual local step: If ${join(dir, ".git")}/artroom/credentials still holds lane ${x}'s credential, remove it by hand.`);
      expect(readFileSync(credential(dir), "utf8")).toBe(b);
    } finally {
      await other.stop();
    }
  });
});

describe("P2: the destination lock", () => {
  const gitTs = new URL("../src/git.ts", import.meta.url).href;
  function child(body: string) {
    const code = `import { withDestination } from ${JSON.stringify(gitTs)}; ${body}`;
    const p = spawn(process.execPath, ["--input-type=module", "-e", code], { stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    p.stderr.on("data", (c: Buffer) => (err += c.toString()));
    const exited = new Promise<number | null>((r) => p.on("exit", r));
    return { exited, err: () => err, pid: p.pid! };
  }
  const lockPath = (dir: string) => join(dir, "artroom", "owner.lock");
  const sleepSync = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

  test("an old lock held by a live command is never taken: the other process waits, then writes after it", async () => {
    const dir = join(repoAt("repo"), ".git");
    let other: ReturnType<typeof child> | undefined;
    const mine = withDestination(dir, (o) => {
      const past = new Date(Date.now() - 31_000);
      utimesSync(lockPath(dir), past, past); // older than any expiry: age must not matter
      other = child(`withDestination(${JSON.stringify(dir)}, (o) => ({ ...o, rev: o.rev + 1, installed: { install: "newer", room: "B", lane: "B" } }));`);
      sleepSync(800); // the other process is running, and must be waiting
      expect(readOwner(dir).rev).toBe(o.rev);
      return { ...o, rev: o.rev + 1, installed: { install: "older", room: "A", lane: "A" } };
    });
    expect(await other!.exited).toBe(0);
    const final = readOwner(dir);
    expect(final.installed?.install).toBe("newer");
    expect(final.rev).toBe(mine.rev + 1); // it read this command's write
    expect(existsSync(lockPath(dir))).toBe(false);
  });

  test("a holder that crashed is recovered: its process is gone on this host", async () => {
    const dir = join(repoAt("repo"), ".git");
    const crashed = child(`withDestination(${JSON.stringify(dir)}, () => process.exit(7));`);
    expect(await crashed.exited).toBe(7);
    expect(JSON.parse(readFileSync(lockPath(dir), "utf8")).pid).toBe(crashed.pid);
    const next = withDestination(dir, (o) => ({ ...o, rev: o.rev + 1 }));
    expect(next.rev).toBe(1);
    expect(existsSync(lockPath(dir))).toBe(false);
  });

  test("a live holder in another process is waited for, and named, never removed", async () => {
    const dir = join(repoAt("repo"), ".git");
    const holder = child(`withDestination(${JSON.stringify(dir)}, () => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500); return undefined; });`);
    for (let i = 0; i < 200 && !existsSync(lockPath(dir)); i++) await new Promise((r) => setTimeout(r, 10));
    const saved = lockWait.ms;
    lockWait.ms = 200;
    try {
      expect(() => withDestination(dir, (o) => ({ ...o, rev: o.rev + 1 }))).toThrow(`held by another artroom command (process ${holder.pid})`);
    } finally {
      lockWait.ms = saved;
    }
    expect(existsSync(lockPath(dir))).toBe(true);
    expect(await holder.exited).toBe(0);
    expect(readOwner(dir).rev).toBe(0);
  });

  test("a holder that lost its lock writes nothing, and never removes the lock that replaced it", () => {
    const dir = join(repoAt("repo"), ".git");
    const successor = { pid: process.pid, host: hostname(), token: "successor" };
    expect(() =>
      withDestination(dir, (o) => {
        writeFileSync(lockPath(dir), JSON.stringify(successor)); // as if another holder now held it
        return { ...o, rev: o.rev + 1 };
      }),
    ).toThrow(/Lost the lock/);
    expect(readOwner(dir).rev).toBe(0);
    expect(JSON.parse(readFileSync(lockPath(dir), "utf8")).token).toBe("successor");
  });

  test("a lock from another host, or a recovery left by a crashed recoverer, is named for the user, not removed", () => {
    const dir = join(repoAt("repo"), ".git");
    mkdirSync(join(dir, "artroom"), { recursive: true });
    writeFileSync(lockPath(dir), JSON.stringify({ pid: 1, host: "elsewhere.example", token: "t" }));
    const saved = lockWait.ms;
    lockWait.ms = 100;
    try {
      expect(() => withDestination(dir, () => undefined)).toThrow(/held by a process on elsewhere\.example\. If that command has stopped, remove the file by hand/);
      expect(existsSync(lockPath(dir))).toBe(true);
      // A dead holder on this host, but a recovery file from a recoverer that also died.
      writeFileSync(lockPath(dir), JSON.stringify({ pid: 999_999, host: hostname(), token: "dead" }));
      writeFileSync(join(dir, "artroom", "owner.lock.break"), JSON.stringify({ pid: 999_998, host: hostname(), token: "dead-too" }));
      expect(() => withDestination(dir, () => undefined)).toThrow(/stopped while recovering a lock\. Remove that file by hand/);
      expect(existsSync(lockPath(dir))).toBe(true);
    } finally {
      lockWait.ms = saved;
    }
  });
});
