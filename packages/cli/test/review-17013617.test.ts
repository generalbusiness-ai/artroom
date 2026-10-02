/**
 * Review 17013617, CLI findings.
 *
 * - P2: a journaled signed act goes straight back to the room. Getting its
 *   receipt needs no new read session, signature or lane read, so it
 *   survives a retired or revoked key and a failing session or genesis
 *   read (R-IDEM-2). The room-ID check still applies.
 * - P2: the act journal moves from `prepared` to `answered`, and is removed
 *   only after the local steps (config, workspace credential) are durable.
 *   An interruption or failed write after the room's answer is finished by
 *   the same command, with no preflight and no second act.
 */

import { mkdirSync, readFileSync, rmdirSync, rmSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import { connect } from "@generalbusiness/artroom-client";
import { Store } from "../src/config.ts";
import { EXIT } from "../src/main.ts";
import { useHarness } from "./harness.ts";

const { h, cli, login, repo } = useHarness();

const config = (home: string) => JSON.parse(readFileSync(join(home, "config.json"), "utf8"));
const acts = (kind: string) => h.room.entries.filter((e) => e.entry.type === "act" && e.entry.act.envelope.kind === kind);
const calls = (route: string) => h.room.requests.filter((r) => r.route === route).length;
const journal = (home: string) => {
  const dir = join(home, "journal", h.room.id);
  return existsSync(dir) ? readdirSync(dir) : [];
};
const crashAt = (name: string) => ({
  step: (s: string) => {
    if (s === name) throw new Error(`interrupted after ${s}`);
  },
});
const NONRETRYABLE = (code: string) => ({ name: "ArtroomError", code, message: "no", retryable: false });

async function revokeKey(home: string, reason: "retired" | "compromised"): Promise<void> {
  const admin = await connect({ room: async () => h.room.wire() }, h.room.id, { kind: "key", signer: h.room.admin.signer });
  await admin.roster({ op: "revoke-key", key: config(home).rooms[h.room.id].key, reason });
}

describe("P2: a journaled signed act needs no new authority to get its receipt", () => {
  test.each(["retired", "compromised"] as const)("after the key is %s and sessions end, the same command returns the original claim", async (reason) => {
    const home = join(h.tmp, "alice");
    await login(home, "@alice");
    const argv = ["claim", "src/**", "--goal", "g", "--idempotency-key", "kept-1"];
    h.room.faults.push({ route: "POST /acts", kind: "drop", times: 4 });
    expect((await cli(home, argv)).code).toBe(EXIT.failed);
    const original = acts("claim")[0]!;
    await revokeKey(home, reason);
    h.room.endSessions();
    const sessions = calls("/requests");
    const retry = await cli(home, [...argv, "--json"]);
    expect(retry.code).toBe(EXIT.ok);
    expect(JSON.parse(retry.out)).toMatchObject({ kind: "claim", seq: original.seq });
    expect(calls("/requests")).toBe(sessions); // no new session was asked for
    expect(acts("claim")).toHaveLength(1);
    expect(config(home).rooms[h.room.id].lane).toBe(JSON.parse(retry.out).lane);
    expect(journal(home)).toEqual([]);
  });

  test("a failing session request and a failing genesis read do not block the receipt", async () => {
    const home = join(h.tmp, "alice");
    await login(home, "@alice");
    const argv = ["claim", "src/**", "--goal", "g", "--idempotency-key", "kept-2"];
    h.room.faults.push({ route: "POST /acts", kind: "drop", times: 4 });
    await cli(home, argv);
    h.room.endSessions();
    h.room.faults.push({ route: "POST /requests", kind: "status", status: 503, body: NONRETRYABLE("unavailable"), times: 5 });
    h.room.faults.push({ route: "GET /log", kind: "status", status: 503, body: NONRETRYABLE("unavailable"), times: 5 });
    expect((await cli(home, argv)).code).toBe(EXIT.ok);
    expect(acts("claim")).toHaveLength(1);
  });

  test("a recorded refusal whose answer was lost is returned again, with its entry", async () => {
    const home = join(h.tmp, "alice");
    await login(home, "@alice");
    await cli(home, ["claim", "src/**", "--goal", "g"]);
    const argv = ["propose", "-m", "s", "--head", "a".repeat(40), "--expect", "5", "--idempotency-key", "kept-3"];
    h.room.faults.push({ route: "POST /acts", kind: "drop", times: 4 });
    expect((await cli(home, argv)).code).toBe(EXIT.failed);
    const recorded = h.room.entries.filter((e) => e.entry.type === "refusal");
    expect(recorded).toHaveLength(1);
    await revokeKey(home, "retired");
    const retry = await cli(home, [...argv, "--json"]);
    expect(retry.code).toBe(EXIT.refused);
    expect(JSON.parse(retry.out)).toMatchObject({ rule: "generation-moved", act: `act_${recorded[0]!.seq}_${recorded[0]!.hash.slice(7, 15)}` });
    expect(h.room.entries.filter((e) => e.entry.type === "refusal")).toHaveLength(1);
  });

  test("an envelope signed for another room is refused before anything is sent", async () => {
    const home = join(h.tmp, "alice");
    await login(home, "@alice");
    const argv = ["claim", "src/**", "--goal", "g", "--idempotency-key", "kept-4"];
    h.room.faults.push({ route: "POST /acts", kind: "drop", times: 4 });
    await cli(home, argv);
    const path = join(home, "journal", h.room.id, "act-kept-4.json");
    const entry = JSON.parse(readFileSync(path, "utf8"));
    entry.prepared.signed.envelope.room = "room_ffffffffffffffffffffffffffffffff";
    writeFileSync(path, JSON.stringify(entry));
    const before = calls("/acts");
    const res = await cli(home, argv);
    expect(res.code).toBe(EXIT.failed);
    expect(res.err).toMatch(/signed for another room/);
    expect(calls("/acts")).toBe(before);
  });
});

describe("P2: the act journal outlives the local steps after the room's answer", () => {
  async function readyToLand(): Promise<{ home: string; lane: string }> {
    const home = join(h.tmp, "alice");
    const bob = join(h.tmp, "bob");
    await login(home, "@alice");
    await login(bob, "@bob");
    await cli(home, ["claim", "src/**", "--goal", "g"]);
    await cli(home, ["propose", "-m", "s", "--head", "a".repeat(40)]);
    const lane = config(home).rooms[h.room.id].lane as string;
    await cli(bob, ["review", `${lane}#1`, "--approve", "--scope", "src/**", "-m", "ok"]);
    h.room.landingPaused = true;
    return { home, lane };
  }

  async function finishesLanding(home: string, lane: string, argv: string[]): Promise<void> {
    h.room.expire(lane as never); // no preflight may stand between the answer and the local steps
    const again = await cli(home, argv);
    expect(again.code).toBe(EXIT.ok);
    expect(acts("land")).toHaveLength(1);
    expect(config(home).rooms[h.room.id].landing.op).toMatch(/^op_land_\d+$/);
    expect(journal(home)).toEqual([]);
    h.room.landingPaused = false;
    expect((await cli(home, ["wait"])).code).toBe(EXIT.ok);
  }

  test.each(["act-answered", "config-written"])("land interrupted after %s is finished by the same command; wait then follows it", async (step) => {
    const { home, lane } = await readyToLand();
    const argv = ["land", "--idempotency-key", `land-${step}`];
    const first = await cli(home, argv, h.tmp, crashAt(step));
    expect(first.code).toBe(EXIT.failed);
    expect(first.err).toContain(`--idempotency-key land-${step}`);
    await finishesLanding(home, lane, argv);
  });

  test("a failed config write after the land was admitted keeps the answer; the same command finishes it", async () => {
    const { home, lane } = await readyToLand();
    const argv = ["land", "--idempotency-key", "land-disk"];
    const spy = vi.spyOn(Store.prototype, "write").mockImplementationOnce(() => {
      throw new Error("disk full");
    });
    const first = await cli(home, argv);
    spy.mockRestore();
    expect(first.code).toBe(EXIT.failed);
    expect(first.err).toContain("disk full");
    expect(first.err).toContain("--idempotency-key land-disk");
    await finishesLanding(home, lane, argv);
  });

  test("a claim interrupted after the answer records its lane when finished, with one claim", async () => {
    const home = join(h.tmp, "alice");
    await login(home, "@alice");
    const argv = ["claim", "src/**", "--goal", "g", "--idempotency-key", "claim-1"];
    expect((await cli(home, argv, h.tmp, crashAt("act-answered"))).code).toBe(EXIT.failed);
    expect(config(home).rooms[h.room.id].lane).toBeUndefined();
    expect((await cli(home, argv)).code).toBe(EXIT.ok);
    expect(config(home).rooms[h.room.id].lane).toBe(`act_${acts("claim")[0]!.seq}_${acts("claim")[0]!.hash.slice(7, 15)}`);
    expect(acts("claim")).toHaveLength(1);
  });

  test.each(["act-answered", "credential-removed", "config-written"])("release interrupted after %s finishes: credential gone, lane forgotten, one release", async (step) => {
    const home = join(h.tmp, "alice");
    const dir = repo();
    await login(home, "@alice");
    await cli(home, ["claim", "src/**", "--goal", "g"], dir);
    await cli(home, ["workspace"], dir);
    const argv = ["release", "-m", "bye", "--idempotency-key", `rel-${step}`];
    expect((await cli(home, argv, dir, crashAt(step))).code).toBe(EXIT.failed);
    expect((await cli(home, argv, dir)).code).toBe(EXIT.ok);
    expect(existsSync(join(dir, ".git", "artroom", "credentials"))).toBe(false);
    expect(config(home).rooms[h.room.id].lane).toBeUndefined();
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
    const cred = join(dir, ".git", "artroom", "credentials");
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

  test("a bearer act whose answer was kept finishes from it, even after the token is revoked", async () => {
    const home = join(h.tmp, "agent");
    const { invitation, secret } = await h.room.invite("@builder", { role: "agent", custody: "room" });
    const { invitationLink } = await import("../src/link.ts");
    expect((await cli(home, ["redeem", invitationLink(h.room.url, h.room.id, invitation, secret)])).code).toBe(EXIT.ok);
    const argv = ["claim", "docs/**", "--goal", "g", "--idempotency-key", "bearer-1"];
    expect((await cli(home, argv, h.tmp, crashAt("act-answered"))).code).toBe(EXIT.failed);
    for (const d of h.room.delegations.values()) h.room.revokeDelegation(d.id);
    expect((await cli(home, argv)).code).toBe(EXIT.ok);
    expect(config(home).rooms[h.room.id].lane).toBe(`act_${acts("claim")[0]!.seq}_${acts("claim")[0]!.hash.slice(7, 15)}`);
    expect(journal(home)).toEqual([]);
  });
});
