/**
 * Review 80d3710c, P2: local recovery is fenced by revision and by lease
 * identity, not by lane ID or value equality.
 *
 * - The selected lane and the followed landing carry a revision that every
 *   local change bumps, even back to an earlier value, and the act that made
 *   the last change (`laneBy`, `landingBy`). A prepared act records the
 *   revision it expects; recovery applies only if it is unchanged, and does
 *   nothing twice.
 * - A release records the lease it releases and the credential installation
 *   made for that lease. Recovery removes that installation only, never a
 *   newer lease's credential for the same lane, and never its mapping.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { EXIT } from "../src/main.ts";
import { useHarness } from "./harness.ts";

const { h, cli, login, git } = useHarness();

const config = (home: string) => JSON.parse(readFileSync(join(home, "config.json"), "utf8"));
const room = (home: string) => config(home).rooms[h.room.id];
const acts = (kind: string) => h.room.entries.filter((e) => e.entry.type === "act" && e.entry.act.envelope.kind === kind);
const idOf = (e: { seq: number; hash: string }) => `act_${e.seq}_${e.hash.slice(7, 15)}`;
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
const credential = (dir: string) => join(dir, ".git", "artroom", "credentials");

describe("a release is bound to the lease it released", () => {
  test.each([[[] as string[]], [["credential-removed"]], [["config-written"]]])(
    "repro 1: an older release of lane X, recovered after X was reclaimed with a new lease and workspace, keeps both (recovery interrupted at %j first)",
    async (interruptions) => {
      const home = join(h.tmp, "alice");
      const dir = repoAt("repo");
      await login(home, "@alice");
      await cli(home, ["claim", "src/**", "--goal", "x"], dir);
      const x = room(home).lane as string;
      await cli(home, ["workspace"], dir);
      expect(room(home).workspaces[x].lease).toBe(1);
      const release = ["release", "--idempotency-key", "rel-old"];
      expect((await cli(home, release, dir, crashAt("act-answered"))).code).toBe(EXIT.failed);

      // Take the same lane back: a new lease, and a new workspace installation for it.
      expect((await cli(home, ["claim", "src/**", "--lane", x], dir)).code).toBe(EXIT.ok);
      expect((await cli(home, ["workspace"], dir)).code).toBe(EXIT.ok);
      const lease2 = room(home).workspaces[x];
      expect(lease2.lease).toBeGreaterThan(1);
      const lease2Credential = readFileSync(credential(dir), "utf8");

      for (const step of interruptions) expect((await cli(home, release, dir, crashAt(step))).code).toBe(EXIT.failed);
      const again = await cli(home, release, dir);
      expect(again.code).toBe(EXIT.ok);
      expect(readFileSync(credential(dir), "utf8")).toBe(lease2Credential);
      expect(room(home).lane).toBe(x);
      expect(room(home).workspaces[x]).toEqual(lease2);
      if (interruptions.length === 0) {
        expect(again.out).toContain(`Left the workspace credential at ${credential(dir)}: a newer workspace installed it.`);
        expect(again.out).toContain(`Kept lane ${x} selected: it was selected again after this release of lease 1 was sent.`);
      }
      expect(acts("release")).toHaveLength(1);
      expect(h.room.lanes.get(x as never)?.holder).toBe("@alice"); // the newer lease is still active
    },
  );

  test("the released lease's own credential is still removed when nothing newer replaced it", async () => {
    const home = join(h.tmp, "alice");
    const dir = repoAt("repo");
    await login(home, "@alice");
    await cli(home, ["claim", "src/**", "--goal", "x"], dir);
    await cli(home, ["workspace"], dir);
    const release = ["release", "--idempotency-key", "rel-own"];
    expect((await cli(home, release, dir, crashAt("act-answered"))).code).toBe(EXIT.failed);
    expect((await cli(home, release, h.tmp)).code).toBe(EXIT.ok); // from another directory
    expect(existsSync(credential(dir))).toBe(false);
    expect(room(home).lane).toBeUndefined();
    expect(room(home).workspaces).toEqual({});
  });
});

describe("selections are fenced by revision, not by value", () => {
  test("repro 2: X, then an interrupted claim of Y, then Z, then X again: recovering Y keeps X", async () => {
    const home = join(h.tmp, "alice");
    await login(home, "@alice");
    await cli(home, ["claim", "x/**", "--goal", "x"]);
    const x = room(home).lane as string;
    const claimY = ["claim", "y/**", "--goal", "y", "--idempotency-key", "claim-y"];
    expect((await cli(home, claimY, h.tmp, crashAt("act-answered"))).code).toBe(EXIT.failed);
    await cli(home, ["claim", "z/**", "--goal", "z"]);
    expect((await cli(home, ["claim", "x/**", "--lane", x])).code).toBe(EXIT.ok);
    expect(room(home).lane).toBe(x); // the same value the Y claim expected, but a newer revision

    const again = await cli(home, claimY);
    expect(again.code).toBe(EXIT.ok);
    const y = idOf(acts("claim").find((e) => (e.entry.type === "act" ? (e.entry.act.envelope.body as { goal?: string }).goal === "y" : false))!);
    expect(again.out).toContain(`Kept lane ${x} selected: the selection changed after this claim was sent. To work on ${y}, pass --lane ${y}.`);
    expect(room(home).lane).toBe(x);
  });

  test("a recovery interrupted after its own config write does not treat its own change as newer work", async () => {
    const home = join(h.tmp, "alice");
    await login(home, "@alice");
    const claim = ["claim", "src/**", "--goal", "g", "--idempotency-key", "claim-self"];
    expect((await cli(home, claim, h.tmp, crashAt("act-answered"))).code).toBe(EXIT.failed);
    expect((await cli(home, claim, h.tmp, crashAt("config-written"))).code).toBe(EXIT.failed);
    const rev = room(home).laneRev;
    const again = await cli(home, claim);
    expect(again.code).toBe(EXIT.ok);
    expect(again.out).not.toContain("Kept lane");
    expect(room(home).lane).toBe(idOf(acts("claim")[0]!));
    expect(room(home).laneRev).toBe(rev); // applied once
  });

  test("a wait that finishes the followed landing is a local change too: a landing recovered after it is not followed", async () => {
    const home = join(h.tmp, "alice");
    const bob = join(h.tmp, "bob");
    await login(home, "@alice");
    await login(bob, "@bob");
    await cli(home, ["claim", "src/**", "--goal", "g"]);
    await cli(home, ["propose", "-m", "s", "--head", "a".repeat(40)]);
    await cli(bob, ["review", `${room(home).lane}#1`, "--approve", "--scope", "src/**", "-m", "ok"]);
    h.room.landingPaused = true;
    expect((await cli(home, ["land"])).code).toBe(EXIT.ok);
    const first = room(home).landing.op as string;
    h.room.finishLanding(first, "retryable");
    // A new attempt, prepared while the first landing is still followed; its answer is kept, the local step is not done.
    const land = ["land", "--idempotency-key", "land-2"];
    expect((await cli(home, land, h.tmp, crashAt("act-answered"))).code).toBe(EXIT.failed);
    // Meanwhile `wait` sees the first landing finish, and stops following it.
    expect((await cli(home, ["wait"])).code).toBe(EXIT.failed);
    expect(room(home).landing).toBeUndefined();
    const again = await cli(home, land);
    expect(again.code).toBe(EXIT.ok);
    expect(again.out).toMatch(/Kept following no landing: that changed after this landing started\. To follow this one: artroom wait op_land_\d+/);
    expect(room(home).landing).toBeUndefined();
    expect(acts("land")).toHaveLength(2);
  });
});
