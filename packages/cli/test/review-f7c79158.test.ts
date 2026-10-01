/**
 * Review f7c79158, P2: a recovered act changes only the local state it
 * owns. Before it is sent, each act records its local change and the state
 * it expects (`LocalIntent`). Recovery still returns the room's receipt, but
 * it never overwrites a newer lane selection or landing, and it removes
 * only the credential written for the released lane, wherever the command
 * runs. Workspace credentials name their lane on their first line.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { EXIT } from "../src/main.ts";
import { useHarness } from "./harness.ts";

const { h, cli, login, git } = useHarness();

const config = (home: string) => JSON.parse(readFileSync(join(home, "config.json"), "utf8"));
const acts = (kind: string) => h.room.entries.filter((e) => e.entry.type === "act" && e.entry.act.envelope.kind === kind);
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
const laneOf = (home: string) => config(home).rooms[h.room.id].lane as string;

describe("release recovers its receipt without touching newer work", () => {
  test("repro 1: an older release, recovered after a newer lane's workspace replaced its credential, keeps that credential and selection", async () => {
    const home = join(h.tmp, "alice");
    const dir = repoAt("repo");
    await login(home, "@alice");
    await cli(home, ["claim", "src/**", "--goal", "x"], dir);
    const x = laneOf(home);
    await cli(home, ["workspace"], dir);
    const release = ["release", "--lane", x, "--idempotency-key", "rel-x"];
    expect((await cli(home, release, dir, crashAt("act-answered"))).code).toBe(EXIT.failed);

    await cli(home, ["claim", "lib/**", "--goal", "y"], dir);
    const y = laneOf(home);
    expect((await cli(home, ["workspace"], dir)).code).toBe(EXIT.ok);
    const yCredential = readFileSync(credential(dir), "utf8");

    const again = await cli(home, release, dir);
    expect(again.code).toBe(EXIT.ok);
    expect(again.out).toContain(`Left the workspace credential at ${credential(dir)}: it now belongs to another lane.`);
    expect(readFileSync(credential(dir), "utf8")).toBe(yCredential);
    expect(laneOf(home)).toBe(y);
    expect(config(home).rooms[h.room.id].workspaces[y]).toBe(credential(dir));
    expect(config(home).rooms[h.room.id].workspaces[x]).toBeUndefined();
    expect(acts("release")).toHaveLength(1);
  });

  test("recovery from another directory removes the released lane's own credential, and only that", async () => {
    const home = join(h.tmp, "alice");
    const dir = repoAt("repo");
    const elsewhere = repoAt("other");
    await login(home, "@alice");
    await cli(home, ["claim", "src/**", "--goal", "x"], dir);
    await cli(home, ["workspace"], dir);
    // A credential in the other repository that is not this lane's: release must leave it.
    mkdirSync(join(elsewhere, ".git", "artroom"), { recursive: true });
    writeFileSync(credential(elsewhere), "# artroom workspace credential for lane act_99_00000000, lease 1.\n");
    const release = ["release", "--idempotency-key", "rel-away"];
    expect((await cli(home, release, dir, crashAt("act-answered"))).code).toBe(EXIT.failed);
    const again = await cli(home, release, elsewhere);
    expect(again.code).toBe(EXIT.ok);
    expect(existsSync(credential(dir))).toBe(false);
    expect(existsSync(credential(elsewhere))).toBe(true);
    expect(config(home).rooms[h.room.id].lane).toBeUndefined();
  });
});

describe("claim and land recover their receipts without replacing newer selections", () => {
  test("repro 2: an older claim, recovered after a newer claim finished, keeps the newer lane selected and says so", async () => {
    const home = join(h.tmp, "alice");
    await login(home, "@alice");
    const older = ["claim", "src/**", "--goal", "a", "--idempotency-key", "claim-a"];
    expect((await cli(home, older, h.tmp, crashAt("act-answered"))).code).toBe(EXIT.failed);
    expect((await cli(home, ["claim", "lib/**", "--goal", "b"])).code).toBe(EXIT.ok);
    const b = laneOf(home);
    const again = await cli(home, older);
    expect(again.code).toBe(EXIT.ok);
    const a = `act_${acts("claim")[0]!.seq}_${acts("claim")[0]!.hash.slice(7, 15)}`;
    expect(again.out).toContain(`Claimed lane ${a}`);
    expect(again.out).toContain(`Kept lane ${b} selected: it was chosen after this claim was sent. To work on ${a}, pass --lane ${a}.`);
    expect(laneOf(home)).toBe(b);
    expect(acts("claim")).toHaveLength(2);
  });

  test("an older landing, recovered after a newer one is followed, keeps following the newer one", async () => {
    const home = join(h.tmp, "alice");
    const bob = join(h.tmp, "bob");
    await login(home, "@alice");
    await login(bob, "@bob");
    await cli(home, ["claim", "src/**", "--goal", "g"]);
    await cli(home, ["propose", "-m", "s", "--head", "a".repeat(40)]);
    await cli(bob, ["review", `${laneOf(home)}#1`, "--approve", "--scope", "src/**", "-m", "ok"]);
    h.room.landingPaused = true;
    const land = ["land", "--idempotency-key", "land-old"];
    expect((await cli(home, land, h.tmp, crashAt("act-answered"))).code).toBe(EXIT.failed);
    // A newer landing is followed meanwhile (here written directly, as another lane's land would).
    const c = config(home);
    c.rooms[h.room.id].landing = { op: "op_land_999", lane: "act_999_00000000" };
    writeFileSync(join(home, "config.json"), JSON.stringify(c));
    const again = await cli(home, land);
    expect(again.code).toBe(EXIT.ok);
    expect(again.out).toMatch(/Kept following landing op_land_999: it started after this one\. To follow this one: artroom wait op_land_\d+/);
    expect(config(home).rooms[h.room.id].landing.op).toBe("op_land_999");
    expect(acts("land")).toHaveLength(1);
  });
});
