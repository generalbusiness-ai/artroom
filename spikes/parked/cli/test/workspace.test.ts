/**
 * `artroom workspace` and `artroom release`: which installation owns a
 * repository's Artroom remote and credential, and what a release may remove.
 *
 * `.git/artroom/owner.json` records, for one repository, the installation
 * whose credential is in the file (`installed`), the installations that
 * recorded themselves before replacing the file and are not yet settled
 * (`pending`), and the latest workspace command to reserve the destination
 * (`reservation`). `artroom workspace` reserves before its first await and
 * installs only if it still owns the destination at the end, for the lease
 * it asked for. A release removes exactly a credential whose file names one
 * of its lane's own installations, recorded before the release was sent.
 *
 * Each group pins the defects one review found: 744a018a, f30be7f6 (E5.1),
 * 4758945b, 7040317d, c033fb54, 80d3710c, f7c79158 and 17013617.
 *
 * Git here is the harness's stand-in: these tests are about artroom's own
 * records and files. cli.test.ts and hygiene.test.ts run the same commands
 * against real git.
 */

import { existsSync, mkdirSync, readFileSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { FakeRoom } from "../../client/test/support/fake-room.ts";
import { readOwner } from "../src/git.ts";
import { invitationLink } from "../src/link.ts";
import { EXIT } from "../src/main.ts";
import { atSession, atToken, config, crashAt, credential, ownerOf, pauseAt, useHarness } from "./harness.ts";

const { h, cli, login, git, repo, roomOf, acts, journal } = useHarness({ git: "stand-in" });

const configPath = (home: string) => join(home, "config.json");

/** Lane X claimed and its workspace installed in `dir`; returns X. */
async function installed(home: string, dir: string, goal = "x", scope = "src/**"): Promise<string> {
  await cli(home, ["claim", scope, "--goal", goal], dir);
  const lane = roomOf(home).lane as string;
  expect((await cli(home, ["workspace"], dir)).code).toBe(EXIT.ok);
  return lane;
}

/**
 * Runs `workspace` so that its credential is written but its mapping is
 * never saved: the config file is in the way when the mapping is written.
 * The installation is then only in `pending`.
 */
async function writtenButUnmapped(home: string, dir: string): Promise<void> {
  const path = configPath(home);
  let saved = "";
  const res = await cli(home, ["workspace"], dir, {
    step(s) {
      if (s === "workspace-installing") {
        saved = readFileSync(path, "utf8");
        rmSync(path);
        mkdirSync(path);
      }
    },
  });
  expect(res.code).toBe(EXIT.failed);
  rmSync(path, { recursive: true });
  writeFileSync(path, saved);
}

/** Removes the credential's first line, its installation mark, keeping a working git credential. */
function unmark(dir: string): string {
  const bytes = readFileSync(credential(dir), "utf8").split("\n").slice(1).join("\n");
  writeFileSync(credential(dir), bytes);
  return bytes;
}
const MANUAL = /Manual local step: .*credentials has no installation mark artroom can read\. If it still holds lane act_\d+_[0-9a-f]{8}'s credential, remove it by hand\./;

describe("the reservation is made before the first await, and checked at the last (review 744a018a)", () => {
  test.each([
    ["the read session, its first request,", () => atSession()],
    ["the workspace token, its last answer,", () => atToken()],
  ])("an older workspace delayed at %s does not overwrite a newer workspace for another lane", async (_where, pauser) => {
    const home = join(h.tmp, "alice");
    const dir = repo("repo");
    await login(home, "@alice");
    await cli(home, ["claim", "src/**", "--goal", "x"], dir);
    const x = roomOf(home).lane as string;
    const pause = pauser();
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
    expect(ownerOf(dir).installed).toMatchObject({ lane: y, install: newer.mapping.install });
  });

  test("workspaces in unrelated repositories do not supersede each other", async () => {
    const home = join(h.tmp, "alice");
    const one = repo("one");
    const two = repo("two");
    await login(home, "@alice");
    await cli(home, ["claim", "src/**", "--goal", "x"], one);
    const x = roomOf(home).lane as string;
    const pause = pauseAt((url) => url.includes(`/lanes/${x}`));
    const first = cli(home, ["workspace"], one, { fetch: pause.fetch });
    await pause.reached;
    expect((await cli(home, ["workspace"], two)).code).toBe(EXIT.ok);
    pause.release();
    expect((await first).code).toBe(EXIT.ok);
    expect(ownerOf(one).installed).toMatchObject({ lane: x });
    expect(ownerOf(two).installed).toMatchObject({ lane: x });
    expect(ownerOf(one).installed!.install).not.toBe(ownerOf(two).installed!.install);
  });
});

describe("ownership is shared by every Room that writes the repository (review 744a018a)", () => {
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

  test("a workspace for Room A delayed at the token response does not overwrite Room B's newer installation in the same repository", async () => {
    const home = join(h.tmp, "alice");
    const dir = repo("repo");
    await login(home, "@alice");
    await cli(home, ["claim", "src/**", "--goal", "a"], dir);
    const pause = atToken();
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
    expect(ownerOf(dir).installed?.room).toBe(other.id);
    expect(roomOf(home, h.room.id).workspaces ?? {}).toEqual({});
  });

  test("a release in Room A leaves Room B's newer installation in the same repository alone", async () => {
    const home = join(h.tmp, "alice");
    const dir = repo("repo");
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
    expect(ownerOf(dir).installed?.room).toBe(other.id);
    expect(existsSync(credential(dir))).toBe(true);
  });
});

describe("a workspace installs only while its reservation still owns the destination, and only for its lease (review f30be7f6, E5.1)", () => {
  test("same lane: a lease-1 response that arrives after release, reclaim and a lease-2 workspace installs nothing", async () => {
    const home = join(h.tmp, "alice");
    const dir = repo("repo");
    await login(home, "@alice");
    await cli(home, ["claim", "src/**", "--goal", "x"], dir);
    const x = roomOf(home).lane as string;
    const pause = atToken();
    const old = cli(home, ["workspace"], dir, { fetch: pause.fetch });
    await pause.reached;
    expect((await cli(home, ["release"], dir)).code).toBe(EXIT.ok);
    expect((await cli(home, ["claim", "src/**", "--lane", x], dir)).code).toBe(EXIT.ok);
    expect((await cli(home, ["workspace"], dir)).code).toBe(EXIT.ok);
    const newer = { file: readFileSync(credential(dir), "utf8"), mapping: roomOf(home).workspaces[x] };
    expect(newer.mapping.lease).toBe(2);
    pause.release();
    const res = await old;
    expect(res.code).toBe(EXIT.failed);
    expect(res.out).toContain(`Did not install the workspace for lane ${x}, lease 1: a newer workspace or release for this repository happened`);
    expect(readFileSync(credential(dir), "utf8")).toBe(newer.file);
    expect(roomOf(home).workspaces[x]).toEqual(newer.mapping);
    expect(roomOf(home).lane).toBe(x);
  });

  test("two overlapping workspaces: the one started last owns the installation, whichever answer arrives first", async () => {
    const home = join(h.tmp, "alice");
    const dir = repo("repo");
    await login(home, "@alice");
    await cli(home, ["claim", "src/**", "--goal", "x"], dir);
    const first = atToken();
    const a = cli(home, ["workspace"], dir, { fetch: first.fetch });
    await first.reached;
    const second = atToken();
    const b = cli(home, ["workspace"], dir, { fetch: second.fetch });
    await second.reached;
    first.release(); // the earlier-started workspace answers first
    expect((await a).code).toBe(EXIT.failed);
    expect(existsSync(credential(dir))).toBe(false);
    second.release();
    expect((await b).code).toBe(EXIT.ok);
    const mapping = roomOf(home).workspaces[roomOf(home).lane];
    expect(readFileSync(credential(dir), "utf8")).toContain(`installation ${mapping.install}.`);
  });

  test("a release while the workspace is being prepared: the revoked token is never installed", async () => {
    const home = join(h.tmp, "alice");
    const dir = repo("repo");
    await login(home, "@alice");
    await cli(home, ["claim", "src/**", "--goal", "x"], dir);
    const pause = atToken();
    const old = cli(home, ["workspace"], dir, { fetch: pause.fetch });
    await pause.reached;
    expect((await cli(home, ["release"], dir)).code).toBe(EXIT.ok);
    pause.release();
    expect((await old).code).toBe(EXIT.failed);
    expect(existsSync(credential(dir))).toBe(false);
    expect(roomOf(home).workspaces ?? {}).toEqual({});
  });

  test("a failed installation leaves nothing a later workspace or release mistakes for its own", async () => {
    const home = join(h.tmp, "alice");
    const dir = repo("repo");
    await login(home, "@alice");
    await cli(home, ["claim", "src/**", "--goal", "x"], dir);
    // Interrupted after the installation is recorded, before the credential is written: no file yet.
    expect((await cli(home, ["workspace"], dir, crashAt("workspace-installing"))).code).toBe(EXIT.failed);
    expect(existsSync(credential(dir))).toBe(false);
    // The credential cannot be written at all: a directory is in its way.
    mkdirSync(credential(dir), { recursive: true });
    expect((await cli(home, ["workspace"], dir)).code).toBe(EXIT.failed);
    rmdirSync(credential(dir));
    // A clean installation replaces both, and a release removes exactly it.
    expect((await cli(home, ["workspace"], dir)).code).toBe(EXIT.ok);
    const mapping = roomOf(home).workspaces[roomOf(home).lane];
    expect(readFileSync(credential(dir), "utf8")).toContain(`installation ${mapping.install}.`);
    expect((await cli(home, ["release"], dir)).code).toBe(EXIT.ok);
    expect(existsSync(credential(dir))).toBe(false);
  });
});

describe("the installed credential's record is separate from reservations (review 4758945b)", () => {
  test("failed before the token: a later lane's failed reservation does not stop the release of the installed lane", async () => {
    const home = join(h.tmp, "alice");
    const dir = repo("repo");
    await login(home, "@alice");
    const x = await installed(home, dir);
    await cli(home, ["claim", "lib/**", "--goal", "y"], dir);
    const offline: typeof fetch = async (input, init) => {
      if (String(input).includes("/lanes/")) throw new Error("offline before the held-lane read");
      return fetch(input, init);
    };
    expect((await cli(home, ["workspace"], dir, { fetch: offline })).code).toBe(EXIT.failed);
    expect(ownerOf(dir).installed?.lane).toBe(x); // the failed reservation left the installed record alone
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
    const dir = repo("repo");
    await login(home, "@alice");
    const x = await installed(home, dir);
    await cli(home, ["claim", "lib/**", "--goal", "y"], dir);
    const y = roomOf(home).lane as string;
    expect((await cli(home, ["workspace"], dir, crashAt("workspace-installing"))).code).toBe(EXIT.failed);
    expect(ownerOf(dir).pending?.map((p) => p.lane)).toEqual([y]);
    expect(readFileSync(credential(dir), "utf8")).toContain(`lane ${x},`);
    expect((await cli(home, ["release", "--lane", x], dir)).code).toBe(EXIT.ok);
    expect(existsSync(credential(dir))).toBe(false);
    expect(ownerOf(dir).pending?.map((p) => p.lane)).toEqual([y]); // another lane's evidence is kept
    // Y's own release clears Y's evidence, and removes nothing it does not own.
    expect((await cli(home, ["release", "--lane", y], dir)).code).toBe(EXIT.ok);
    expect(ownerOf(dir).pending).toBeUndefined();
  });

  test("delayed retry: a release of lane X while lane Y's workspace waits for its token lets Y install afterwards", async () => {
    const home = join(h.tmp, "alice");
    const dir = repo("repo");
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
    const dir = repo("repo");
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

describe("installed workspaces from schema 2 and 3 are upgraded with their evidence (review 4758945b)", () => {
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
    const dir = repo("repo");
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
    const dir = repo("repo");
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
      const dir = repo("repo");
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
      const dir = repo("repo");
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

describe("unsettled installations stay plural until the file proves them settled (review 7040317d)", () => {
  test("lanes: Y writes but is never mapped, then Z stops before writing; releasing Y removes Y's credential", async () => {
    const home = join(h.tmp, "alice");
    const dir = repo();
    await login(home, "@alice");
    await cli(home, ["claim", "src/**", "--goal", "x"], dir);
    expect((await cli(home, ["workspace"], dir)).code).toBe(EXIT.ok);
    await cli(home, ["claim", "lib/**", "--goal", "y"], dir);
    const y = config(home).rooms[h.room.id].lane as string;
    await writtenButUnmapped(home, dir);
    expect(config(home).rooms[h.room.id].workspaces[y]).toBeUndefined();
    const yInstall = ownerOf(dir).pending![0]!.install;
    expect(readFileSync(credential(dir), "utf8")).toContain(`installation ${yInstall}.`);

    await cli(home, ["claim", "test/**", "--goal", "z"], dir);
    const z = config(home).rooms[h.room.id].lane as string;
    expect((await cli(home, ["workspace"], dir, crashAt("workspace-installing"))).code).toBe(EXIT.failed);
    expect(ownerOf(dir).pending!.map((p) => p.lane)).toEqual([y, z]); // Y's evidence was not dropped

    const res = await cli(home, ["release", "--lane", y], dir);
    expect(res.code).toBe(EXIT.ok);
    expect(res.out).toContain(`Removed the workspace credential for lane ${y}, lease 1, from ${credential(dir)}.`);
    expect(existsSync(credential(dir))).toBe(false);
    expect(ownerOf(dir).pending!.map((p) => p.lane)).toEqual([z]);
  });

  test("Rooms: Y in Room A writes but is never mapped, then Room B's Z stops before writing; Room A's release removes Y", async () => {
    const other = await FakeRoom.create({ name: "other/repo" });
    await other.start();
    try {
      const home = join(h.tmp, "alice");
      const dir = repo();
      await login(home, "@alice");
      await cli(home, ["claim", "lib/**", "--goal", "y"], dir);
      const y = config(home).rooms[h.room.id].lane as string;
      await writtenButUnmapped(home, dir);
      const inv = await other.invite("@alice");
      await cli(home, ["login", invitationLink(other.url, other.id, inv.invitation, inv.secret)], dir);
      await cli(home, ["claim", "test/**", "--goal", "z"], dir);
      expect((await cli(home, ["workspace"], dir, crashAt("workspace-installing"))).code).toBe(EXIT.failed);
      expect(ownerOf(dir).pending!.map((p) => p.room)).toEqual([h.room.id, other.id]);
      const res = await cli(home, ["release", "--room", h.room.id, "--lane", y], dir);
      expect(res.code).toBe(EXIT.ok);
      expect(existsSync(credential(dir))).toBe(false);
      expect(ownerOf(dir).pending!.map((p) => p.room)).toEqual([other.id]);
    } finally {
      await other.stop();
    }
  });

  test("an owner record written with the single installing slot of version 2 keeps that party as pending", () => {
    const dir = join(repo(), ".git");
    mkdirSync(join(dir, "artroom"), { recursive: true });
    const y = { install: "y-install", room: h.room.id, lane: "act_5_00000000", lease: 1 };
    writeFileSync(join(dir, "artroom", "owner.json"), JSON.stringify({ v: 2, rev: 4, installing: y }));
    expect(readOwner(dir)).toEqual({ v: 3, rev: 4, pending: [y] });
  });

  test("a completed later installation settles the earlier ones; the successor's file is then left by Y's release", async () => {
    const home = join(h.tmp, "alice");
    const dir = repo();
    await login(home, "@alice");
    await cli(home, ["claim", "lib/**", "--goal", "y"], dir);
    const y = config(home).rooms[h.room.id].lane as string;
    await writtenButUnmapped(home, dir);
    await cli(home, ["claim", "test/**", "--goal", "z"], dir);
    expect((await cli(home, ["workspace"], dir)).code).toBe(EXIT.ok);
    const z = readFileSync(credential(dir), "utf8");
    expect(ownerOf(dir).pending).toBeUndefined();
    expect((await cli(home, ["release", "--lane", y], dir)).code).toBe(EXIT.ok);
    expect(readFileSync(credential(dir), "utf8")).toBe(z);
  });
});

describe("an unreadable mark keeps the cleanup duty (review c033fb54)", () => {
  test("unmapped pending: the release names the manual step and keeps the pending entry; the file is untouched", async () => {
    const home = join(h.tmp, "alice");
    const dir = repo();
    await login(home, "@alice");
    await cli(home, ["claim", "lib/**", "--goal", "y"], dir);
    const y = config(home).rooms[h.room.id].lane as string;
    await writtenButUnmapped(home, dir);
    expect(config(home).rooms[h.room.id].workspaces?.[y]).toBeUndefined();
    const bytes = unmark(dir);
    const res = await cli(home, ["release", "--lane", y], dir);
    expect(res.code).toBe(EXIT.ok);
    expect(res.out).toMatch(MANUAL);
    expect(readFileSync(credential(dir), "utf8")).toBe(bytes);
    expect(ownerOf(dir).pending?.map((p) => p.lane)).toEqual([y]); // the only evidence of the duty is kept
  });

  test("installed and mapped: the release keeps both the installed record and the mapping", async () => {
    const home = join(h.tmp, "alice");
    const dir = repo();
    await login(home, "@alice");
    await cli(home, ["claim", "src/**", "--goal", "x"], dir);
    const x = config(home).rooms[h.room.id].lane as string;
    expect((await cli(home, ["workspace"], dir)).code).toBe(EXIT.ok);
    unmark(dir);
    const res = await cli(home, ["release"], dir);
    expect(res.code).toBe(EXIT.ok);
    expect(res.out).toMatch(MANUAL);
    expect(existsSync(credential(dir))).toBe(true);
    expect(ownerOf(dir).installed?.lane).toBe(x);
    expect(config(home).rooms[h.room.id].workspaces[x]).toBeDefined();
  });

  test("interrupted and retried: the duty is kept until the user removes the file, and then settled", async () => {
    const home = join(h.tmp, "alice");
    const dir = repo();
    await login(home, "@alice");
    await cli(home, ["claim", "lib/**", "--goal", "y"], dir);
    const y = config(home).rooms[h.room.id].lane as string;
    await writtenButUnmapped(home, dir);
    unmark(dir);
    const release = ["release", "--lane", y, "--idempotency-key", "rel-unmarked"];
    expect((await cli(home, release, dir, crashAt("credential-removed"))).code).toBe(EXIT.failed);
    expect(ownerOf(dir).pending?.map((p) => p.lane)).toEqual([y]);
    // The user follows the manual step; the same command then finishes, and the duty is settled.
    rmSync(credential(dir));
    expect((await cli(home, release, dir)).code).toBe(EXIT.ok);
    expect(ownerOf(dir).pending).toBeUndefined();
  });

  test("the reservation is cancelled independently, and a successor's completed installation settles the kept duty", async () => {
    const home = join(h.tmp, "alice");
    const dir = repo();
    await login(home, "@alice");
    await cli(home, ["claim", "lib/**", "--goal", "y"], dir);
    const y = config(home).rooms[h.room.id].lane as string;
    // Y's workspace stops after reserving, so its reservation is still there; the file's mark is then unreadable.
    await writtenButUnmapped(home, dir);
    expect((await cli(home, ["workspace"], dir, crashAt("workspace-reserved"))).code).toBe(EXIT.failed);
    expect(ownerOf(dir).reservation?.lane).toBe(y);
    unmark(dir);
    expect((await cli(home, ["release", "--lane", y], dir)).code).toBe(EXIT.ok);
    expect(ownerOf(dir).reservation).toBeUndefined();
    expect(ownerOf(dir).pending?.map((p) => p.lane)).toEqual([y]);
    // A later lane's completed installation replaces the file: every earlier duty is then provably settled.
    await cli(home, ["claim", "test/**", "--goal", "z"], dir);
    const z = config(home).rooms[h.room.id].lane as string;
    expect((await cli(home, ["workspace"], dir)).code).toBe(EXIT.ok);
    expect(ownerOf(dir).pending).toBeUndefined();
    expect(ownerOf(dir).installed?.lane).toBe(z);
    expect(readFileSync(credential(dir), "utf8")).toContain(`lane ${z},`);
  });
});

describe("a release is bound to the lease it released, and removes only its own credential (reviews 80d3710c, f7c79158, 17013617)", () => {
  test.each([[[] as string[]], [["credential-removed", "config-written"]]])(
    "an older release of lane X, recovered after X was reclaimed with a new lease and workspace, keeps both (recovery interrupted after %j first)",
    async (interruptions) => {
      const home = join(h.tmp, "alice");
      const dir = repo("repo");
      await login(home, "@alice");
      await cli(home, ["claim", "src/**", "--goal", "x"], dir);
      const x = roomOf(home).lane as string;
      await cli(home, ["workspace"], dir);
      expect(roomOf(home).workspaces[x].lease).toBe(1);
      const release = ["release", "--idempotency-key", "rel-old"];
      expect((await cli(home, release, dir, crashAt("act-answered"))).code).toBe(EXIT.failed);

      // Take the same lane back: a new lease, and a new workspace installation for it.
      expect((await cli(home, ["claim", "src/**", "--lane", x], dir)).code).toBe(EXIT.ok);
      expect((await cli(home, ["workspace"], dir)).code).toBe(EXIT.ok);
      const lease2 = roomOf(home).workspaces[x];
      expect(lease2.lease).toBeGreaterThan(1);
      const lease2Credential = readFileSync(credential(dir), "utf8");

      for (const step of interruptions) expect((await cli(home, release, dir, crashAt(step))).code).toBe(EXIT.failed);
      const again = await cli(home, release, dir);
      expect(again.code).toBe(EXIT.ok);
      expect(readFileSync(credential(dir), "utf8")).toBe(lease2Credential);
      expect(roomOf(home).lane).toBe(x);
      expect(roomOf(home).workspaces[x]).toEqual(lease2);
      if (interruptions.length === 0) {
        expect(again.out).toContain(`Left the workspace credential at ${credential(dir)}: a newer workspace installed it.`);
        expect(again.out).toContain(`Kept lane ${x} selected: it was selected again after this release of lease 1 was sent.`);
      }
      expect(acts("release")).toHaveLength(1);
      expect(h.room.lanes.get(x as never)?.holder).toBe("@alice"); // the newer lease is still active
    },
  );

  test("an older release, recovered after a newer lane's workspace replaced its credential, keeps that credential and selection", async () => {
    const home = join(h.tmp, "alice");
    const dir = repo("repo");
    await login(home, "@alice");
    await cli(home, ["claim", "src/**", "--goal", "x"], dir);
    const x = roomOf(home).lane;
    await cli(home, ["workspace"], dir);
    const release = ["release", "--lane", x, "--idempotency-key", "rel-x"];
    expect((await cli(home, release, dir, crashAt("act-answered"))).code).toBe(EXIT.failed);

    await cli(home, ["claim", "lib/**", "--goal", "y"], dir);
    const y = roomOf(home).lane;
    expect((await cli(home, ["workspace"], dir)).code).toBe(EXIT.ok);
    const yCredential = readFileSync(credential(dir), "utf8");

    const again = await cli(home, release, dir);
    expect(again.code).toBe(EXIT.ok);
    expect(again.out).toContain(`Left the workspace credential at ${credential(dir)}: a newer workspace installed it.`);
    expect(readFileSync(credential(dir), "utf8")).toBe(yCredential);
    expect(roomOf(home).lane).toBe(y);
    expect(config(home).rooms[h.room.id].workspaces[y].file).toBe(credential(dir));
    expect(config(home).rooms[h.room.id].workspaces[x]).toBeUndefined();
    expect(acts("release")).toHaveLength(1);
  });

  test("recovery from another directory removes the released lane's own credential, and only that", async () => {
    const home = join(h.tmp, "alice");
    const dir = repo("repo");
    const elsewhere = repo("other");
    await login(home, "@alice");
    await cli(home, ["claim", "src/**", "--goal", "x"], dir);
    await cli(home, ["workspace"], dir);
    // A credential in the other repository that is not this lane's: release must leave it.
    mkdirSync(join(elsewhere, ".git", "artroom"), { recursive: true });
    writeFileSync(credential(elsewhere), "# artroom workspace credential for lane act_99_00000000, lease 1, installation other.\n");
    const release = ["release", "--idempotency-key", "rel-away"];
    expect((await cli(home, release, dir, crashAt("act-answered"))).code).toBe(EXIT.failed);
    const again = await cli(home, release, elsewhere);
    expect(again.code).toBe(EXIT.ok);
    expect(existsSync(credential(dir))).toBe(false);
    expect(existsSync(credential(elsewhere))).toBe(true);
    expect(roomOf(home).lane).toBeUndefined();
    expect(roomOf(home).workspaces).toEqual({});
  });

  test("a release interrupted after each local step in turn is finished by the same command: credential gone, lane forgotten, one release", async () => {
    const home = join(h.tmp, "alice");
    const dir = repo();
    await login(home, "@alice");
    await installed(home, dir);
    const argv = ["release", "-m", "bye", "--idempotency-key", "rel-steps"];
    for (const step of ["act-answered", "credential-removed", "config-written"]) expect((await cli(home, argv, dir, crashAt(step))).code, step).toBe(EXIT.failed);
    expect((await cli(home, argv, dir)).code).toBe(EXIT.ok);
    expect(existsSync(credential(dir))).toBe(false);
    expect(roomOf(home).lane).toBeUndefined();
    expect(acts("release")).toHaveLength(1);
    expect(journal(home)).toEqual([]);
  });

  test("release whose credential removal fails keeps the answer until removal succeeds", async () => {
    const home = join(h.tmp, "alice");
    const dir = repo();
    await login(home, "@alice");
    await cli(home, ["claim", "src/**", "--goal", "g"], dir);
    await cli(home, ["workspace"], dir);
    // The recorded credential path now cannot be read or removed as a file: the local step throws.
    const cred = credential(dir);
    rmSync(cred);
    mkdirSync(cred, { recursive: true });
    const argv = ["release", "--idempotency-key", "rel-disk"];
    const first = await cli(home, argv, dir);
    expect(first.code).toBe(EXIT.failed);
    expect(first.err).toContain("--idempotency-key rel-disk");
    expect(config(home).rooms[h.room.id].lane).toBeDefined();
    rmdirSync(cred);
    expect((await cli(home, argv, dir)).code).toBe(EXIT.ok);
    expect(config(home).rooms[h.room.id].lane).toBeUndefined();
    expect(acts("release")).toHaveLength(1);
  });
});
