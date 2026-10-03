/**
 * The journal: every act, login and redemption is written down before it
 * goes out, and removed only when every local step is done. A command that
 * fails part way is finished by running it again. It sends the same signed
 * bytes, or nothing, and never rebuilds the request from changed state
 * (R-IDEM-2).
 *
 * Each group pins the defects one review found: f47a509c (P3, P4, P5),
 * 17013617, 80d3710c and f30be7f6 (E5.2), and amendment 2 (R-CRED-10).
 *
 * A lost answer here is one dropped reply and one attempt (see the harness):
 * the run fails, and the next run finishes the work from the journal.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import { connect } from "@generalbusiness/artroom-client";
import { Store } from "../src/config.ts";
import { invitationLink } from "../src/link.ts";
import { EXIT, run } from "../src/main.ts";
import { config, crashAt, credential, useHarness } from "./harness.ts";

const { h, cli, git, repo, link, login, norm, roomOf, acts, calls, journal } = useHarness({ git: "stand-in" });

const joins = () => h.room.entries.filter((e) => e.entry.type === "act" && (e.entry.act.envelope.body as { op?: string }).op === "join");
const idOf = (e: { seq: number; hash: string }) => `act_${e.seq}_${e.hash.slice(7, 15)}`;
/** An answer from the room that says nothing was recorded and it must not be asked again in this run. */
const NO_RETRY = { name: "ArtroomError", code: "unavailable", message: "The room is restarting.", retryable: false };

const admin = () => connect({ room: async () => h.room.wire() }, h.room.id, { kind: "key", signer: h.room.admin.signer });

async function revokeKey(home: string, reason: "retired" | "compromised"): Promise<void> {
  await (await admin()).roster({ op: "revoke-key", key: roomOf(home).key, reason });
}

/**
 * Lets the landing run to its end before anyone waits for it. The fake room moves a landing one state at each read,
 * and a reader that waits is asked again every 20 ms. The admin reads it here instead, so a test whose subject is
 * which operation the CLI follows, not how long it waits, finds the landing finished at its first read.
 */
async function landingRuns(home: string): Promise<void> {
  h.room.landingPaused = false;
  const op = { id: roomOf(home).landing.op, kind: "land" } as const;
  const room = await admin();
  for (let i = 0; i < 8 && (await room.op(op)).state !== "landed"; i++);
}

/** Alice's lane is proposed and approved by Bob: the next `land` is admitted. */
async function readyToLand(): Promise<{ alice: string; lane: string }> {
  const alice = join(h.tmp, "alice");
  const bob = join(h.tmp, "bob");
  await login(alice, "@alice");
  await login(bob, "@bob");
  await cli(alice, ["claim", "src/**", "--goal", "g"]);
  await cli(alice, ["propose", "-m", "s", "--head", "a".repeat(40)]);
  const lane = roomOf(alice).lane as string;
  expect((await cli(bob, ["review", `${lane}#1`, "--approve", "--scope", "src/**", "-m", "ok"])).code).toBe(EXIT.ok);
  return { alice, lane };
}

describe("login and redeem finish locally before forgetting how to resume (review f47a509c, P3)", () => {
  test("a failure after the join keeps the journal; the same command finishes with the same key and one join", async () => {
    const alice = join(h.tmp, "alice");
    const invite = await link("@alice");
    h.room.faults.push({ route: "GET /log", kind: "status", status: 503, body: NO_RETRY });
    const first = await cli(alice, ["login", invite]);
    expect(first.code).toBe(EXIT.failed);
    expect(norm(first.err)).toMatchSnapshot("login unfinished");
    expect(existsSync(join(alice, "config.json"))).toBe(false);
    const [entry] = journal(alice);
    const key = JSON.parse(readFileSync(join(alice, "journal", h.room.id, entry!), "utf8")).key;
    const second = await cli(alice, ["login", invite]);
    expect(second.code).toBe(EXIT.ok);
    expect(joins()).toHaveLength(1);
    expect(calls("/redeem")).toBe(1); // the join was not sent again: its result was journaled
    expect(config(alice).rooms[h.room.id].key).toBe(key);
    expect(JSON.parse(readFileSync(join(alice, "keys", `${h.room.id}.json`), "utf8")).key).toBe(key);
    expect(journal(alice)).toEqual([]);
    const third = await cli(alice, ["login", invite]);
    expect(third.code).toBe(EXIT.ok);
    expect(third.out).toMatch(/^Already joined acme\/web as @alice/);
    expect(calls("/redeem")).toBe(1);
  });

  test("login interrupted after each local step in turn is finished by the same command, with one key and one join", async () => {
    const home = join(h.tmp, "alice");
    const invite = await link("@alice");
    for (const step of ["login-journaled", "joined", "key-saved", "config-written"]) expect((await cli(home, ["login", invite], h.tmp, crashAt(step))).code, step).toBe(EXIT.failed);
    const last = await cli(home, ["login", invite]);
    expect(last.code).toBe(EXIT.ok);
    expect(joins()).toHaveLength(1);
    expect(calls("/redeem")).toBe(1);
    const key = roomOf(home).key;
    expect(h.room.keys.get(key)?.member).toBe("@alice");
    expect(journal(home)).toEqual([]);
  });

  test("redeem interrupted after each local step in turn is finished without a second redemption", async () => {
    const home = join(h.tmp, "agent");
    const invite = await link("@builder", { role: "agent", custody: "room" });
    for (const step of ["redeemed", "bearer-saved", "config-written"]) expect((await cli(home, ["redeem", invite], h.tmp, crashAt(step))).code, step).toBe(EXIT.failed);
    const last = await cli(home, ["redeem", invite]);
    expect(last.code).toBe(EXIT.ok);
    expect(calls("/redeem")).toBe(1);
    expect(readFileSync(join(home, "bearers", h.room.id), "utf8").trim()).toBe(h.room.exposure.bearers[0]);
    expect(roomOf(home).custody).toBe("room");
    expect(journal(home)).toEqual([]);
    expect(last.out + last.err).not.toContain(h.room.exposure.bearers[0]!);
  });

  test("a redemption that may have reached the room is never sent again, whatever happened after", async () => {
    const home = join(h.tmp, "agent");
    const invite = await link("@builder", { role: "agent", custody: "room" });
    expect((await cli(home, ["redeem", invite], h.tmp, crashAt("redeem-journaled"))).code).toBe(EXIT.failed);
    const again = await cli(home, ["redeem", invite]);
    expect(again.code).toBe(EXIT.failed);
    expect(again.err).toMatch(/Do not retry this invitation/);
    expect(calls("/redeem")).toBe(0);

    const other = join(h.tmp, "other");
    const invite2 = await link("@helper", { role: "agent", custody: "room" });
    h.room.faults.push({ route: "POST /redeem", kind: "drop" });
    expect((await cli(other, ["redeem", invite2])).code).toBe(EXIT.failed);
    expect((await cli(other, ["redeem", invite2])).code).toBe(EXIT.failed);
    expect(calls("/redeem")).toBe(1);
  });

  test("a redemption the room refused is forgotten, so a corrected link can be redeemed", async () => {
    const home = join(h.tmp, "agent");
    const { invitation, secret } = await h.room.invite("@builder", { role: "agent", custody: "room" });
    const bad = await cli(home, ["redeem", invitationLink(h.room.url, h.room.id, invitation, `${secret}x`)]);
    expect(bad.code).toBe(EXIT.refused);
    expect(journal(home)).toEqual([]);
    expect((await cli(home, ["redeem", invitationLink(h.room.url, h.room.id, invitation, secret)])).code).toBe(EXIT.ok);
  });
});

describe("a retried act is the act first sent (review f47a509c, P4)", () => {
  test("a lost success response, then a separate run after HEAD, the lane and the lease changed, returns the original proposal", async () => {
    const alice = join(h.tmp, "alice");
    const dir = repo();
    await login(alice, "@alice");
    expect((await cli(alice, ["claim", "src/**", "--goal", "g"], dir)).code).toBe(EXIT.ok);
    const first = git(dir, "rev-parse", "HEAD");
    h.room.faults.push({ route: "POST /acts", kind: "drop" });
    const lost = await cli(alice, ["propose", "-m", "One."], dir);
    expect(lost.code).toBe(EXIT.failed);
    const key = /--idempotency-key ([A-Za-z0-9_-]+)/.exec(lost.err)![1]!;
    expect(norm(lost.err.replace(key, "KEY"))).toMatchSnapshot("propose lost");
    expect(acts("propose")).toHaveLength(1); // recorded on the first attempt

    // Everything the act was built from changes: a new commit, and the lease expires.
    writeFileSync(join(dir, "README.md"), "changed\n");
    git(dir, "commit", "-q", "-am", "second");
    h.room.expire(config(alice).rooms[h.room.id].lane);

    const again = await cli(alice, ["propose", "-m", "One.", "--idempotency-key", key, "--json"], dir);
    expect(again.code).toBe(EXIT.ok);
    expect(JSON.parse(again.out)).toMatchObject({ kind: "propose", generation: 1, head: first });
    expect(acts("propose")).toHaveLength(1);
    expect(journal(alice)).toEqual([]);
  });

  test("a journaled key used with another command is a usage error, and --json errors name the key", async () => {
    const alice = join(h.tmp, "alice");
    await login(alice, "@alice");
    h.room.faults.push({ route: "POST /acts", kind: "drop" });
    const lost = await cli(alice, ["claim", "src/**", "--goal", "g", "--json"]);
    expect(lost.code).toBe(EXIT.failed);
    const key = JSON.parse(lost.out).idempotencyKey as string;
    expect(key).toMatch(/^[A-Za-z0-9_-]{22}$/);
    const wrong = await cli(alice, ["renew", "--idempotency-key", key]);
    expect(wrong.code).toBe(EXIT.usage);
    expect(wrong.err).toMatch(/belongs to an unfinished artroom claim/);
    expect((await cli(alice, ["claim", "src/**", "--goal", "g", "--idempotency-key", key])).code).toBe(EXIT.ok);
    expect(acts("claim")).toHaveLength(1);
  });

  test("a room that says to try again now is asked again in the same run: the CLI leaves the client's own retries on", async () => {
    const alice = join(h.tmp, "alice");
    await login(alice, "@alice");
    const busy = { name: "ArtroomError", code: "unavailable", message: "busy", retryable: true, retryAfterMs: 0 };
    h.room.faults.push({ route: "POST /acts", kind: "status", status: 503, body: busy, times: 2 });
    const before = calls("/acts");
    // The command as the real entry point runs it: no test setting for retries.
    const code = await run(["claim", "src/**", "--goal", "g"], { out: () => {}, err: () => {}, env: { ARTROOM_HOME: alice, HOME: alice }, cwd: h.tmp });
    expect(code).toBe(EXIT.ok);
    expect(calls("/acts")).toBe(before + 3);
    expect(acts("claim")).toHaveLength(1);
  });
});

describe("a journaled signed act needs no new authority to get its receipt (review 17013617)", () => {
  test("after the key is revoked as compromised and sessions end, the same command returns the original claim", async () => {
    const home = join(h.tmp, "alice");
    await login(home, "@alice");
    const argv = ["claim", "src/**", "--goal", "g", "--idempotency-key", "kept-1"];
    h.room.faults.push({ route: "POST /acts", kind: "drop" });
    expect((await cli(home, argv)).code).toBe(EXIT.failed);
    const original = acts("claim")[0]!;
    await revokeKey(home, "compromised");
    h.room.endSessions();
    const sessions = calls("/requests");
    const retry = await cli(home, [...argv, "--json"]);
    expect(retry.code).toBe(EXIT.ok);
    expect(JSON.parse(retry.out)).toMatchObject({ kind: "claim", seq: original.seq });
    expect(calls("/requests")).toBe(sessions); // no new session was asked for
    expect(acts("claim")).toHaveLength(1);
    expect(roomOf(home).lane).toBe(JSON.parse(retry.out).lane);
    expect(journal(home)).toEqual([]);
  });

  test("a failing session request and a failing genesis read do not block the receipt", async () => {
    const home = join(h.tmp, "alice");
    await login(home, "@alice");
    const argv = ["claim", "src/**", "--goal", "g", "--idempotency-key", "kept-2"];
    h.room.faults.push({ route: "POST /acts", kind: "drop" });
    await cli(home, argv);
    h.room.endSessions();
    h.room.faults.push({ route: "POST /requests", kind: "status", status: 503, body: NO_RETRY, times: 5 });
    h.room.faults.push({ route: "GET /log", kind: "status", status: 503, body: NO_RETRY, times: 5 });
    expect((await cli(home, argv)).code).toBe(EXIT.ok);
    expect(acts("claim")).toHaveLength(1);
  });

  test("a recorded refusal whose answer was lost is returned again, with its entry", async () => {
    const home = join(h.tmp, "alice");
    await login(home, "@alice");
    await cli(home, ["claim", "src/**", "--goal", "g"]);
    const argv = ["propose", "-m", "s", "--head", "a".repeat(40), "--expect", "5", "--idempotency-key", "kept-3"];
    h.room.faults.push({ route: "POST /acts", kind: "drop" });
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
    h.room.faults.push({ route: "POST /acts", kind: "drop" });
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

describe("the act journal outlives the local steps after the room's answer (review 17013617)", () => {
  async function finishesLanding(home: string, lane: string, argv: string[]): Promise<void> {
    h.room.expire(lane as never); // no preflight may stand between the answer and the local steps
    const again = await cli(home, argv);
    expect(again.code).toBe(EXIT.ok);
    expect(acts("land")).toHaveLength(1);
    expect(roomOf(home).landing.op).toMatch(/^op_land_\d+$/);
    expect(journal(home)).toEqual([]);
    await landingRuns(home);
    expect((await cli(home, ["wait"])).code).toBe(EXIT.ok);
  }

  test("land interrupted after each local step in turn is finished by the same command; wait then follows it", async () => {
    const { alice, lane } = await readyToLand();
    h.room.landingPaused = true;
    const argv = ["land", "--idempotency-key", "land-steps"];
    for (const step of ["act-answered", "config-written"]) {
      const res = await cli(alice, argv, h.tmp, crashAt(step));
      expect(res.code, step).toBe(EXIT.failed);
      expect(res.err, step).toContain("--idempotency-key land-steps");
    }
    await finishesLanding(alice, lane, argv);
  });

  test("a failed config write after the land was admitted keeps the answer; the same command finishes it", async () => {
    const { alice: home, lane } = await readyToLand();
    h.room.landingPaused = true;
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
    expect(roomOf(home).lane).toBeUndefined();
    expect((await cli(home, argv)).code).toBe(EXIT.ok);
    expect(roomOf(home).lane).toBe(`act_${acts("claim")[0]!.seq}_${acts("claim")[0]!.hash.slice(7, 15)}`);
    expect(acts("claim")).toHaveLength(1);
  });

  test("a bearer act whose answer was kept finishes from it, even after the token is revoked", async () => {
    const home = join(h.tmp, "agent");
    expect((await cli(home, ["redeem", await link("@builder", { role: "agent", custody: "room" })])).code).toBe(EXIT.ok);
    const argv = ["claim", "docs/**", "--goal", "g", "--idempotency-key", "bearer-1"];
    expect((await cli(home, argv, h.tmp, crashAt("act-answered"))).code).toBe(EXIT.failed);
    for (const d of h.room.delegations.values()) h.room.revokeDelegation(d.id);
    expect((await cli(home, argv)).code).toBe(EXIT.ok);
    expect(roomOf(home).lane).toBe(`act_${acts("claim")[0]!.seq}_${acts("claim")[0]!.hash.slice(7, 15)}`);
    expect(journal(home)).toEqual([]);
  });

  test("a bearer act with no answer kept is not resent after its token is revoked; the CLI says so and forgets it (R-CRED-10)", async () => {
    const agent = join(h.tmp, "agent");
    await cli(agent, ["redeem", await link("@builder", { role: "agent", custody: "room" })]);
    h.room.faults.push({ route: "POST /mcp", kind: "drop" });
    const lost = await cli(agent, ["claim", "src/**", "--goal", "g"]);
    expect(lost.code).toBe(EXIT.failed);
    const key = /--idempotency-key ([A-Za-z0-9_-]+)/.exec(lost.err)![1]!;
    expect(roomOf(agent).custody).toBe("room");
    for (const d of h.room.delegations.values()) h.room.revokeDelegation(d.id);
    const again = await cli(agent, ["claim", "src/**", "--goal", "g", "--idempotency-key", key]);
    expect(again.code).toBe(EXIT.failed);
    expect(again.err).toMatch(/^Error \(unauthenticated\): The bearer token is no longer valid, so 1 unfinished act\(s\) cannot be sent again/);
    expect(again.err).not.toMatch(/--idempotency-key/);
    expect(journal(agent)).toEqual([]);
  });
});

describe("the landing follow-up waits on the operation already started (review f47a509c, P5)", () => {
  test("land without --wait starts once; artroom wait follows that operation to the end", async () => {
    const { alice } = await readyToLand();
    const start = await cli(alice, ["land"]);
    expect(start.code).toBe(EXIT.ok);
    expect(norm(start.out)).toMatchSnapshot("land started");
    const done = await cli(alice, ["wait"]);
    expect(done.code).toBe(EXIT.ok);
    expect(norm(done.out)).toMatchSnapshot("wait landed");
    expect(acts("land")).toHaveLength(1);
    expect(roomOf(alice).landing).toBeUndefined();
    expect((await cli(alice, ["wait"])).code).toBe(EXIT.usage); // nothing left to follow
  });

  test("a wait that runs out names the same operation, and the next wait finishes it", async () => {
    const { alice } = await readyToLand();
    h.room.landingPaused = true;
    const out = await cli(alice, ["land", "--wait", "--timeout", "0"]);
    expect(out.code).toBe(EXIT.failed);
    expect(norm(out.out)).toMatchSnapshot("wait timed out");
    const op = /artroom wait (op_land_\d+)/.exec(out.out)![1]!;
    await landingRuns(alice);
    const done = await cli(alice, ["wait", op]);
    expect(done.code).toBe(EXIT.ok);
    expect(acts("land")).toHaveLength(1);
  });

  test.each(["retryable", "failed"] as const)("a %s landing ends the wait with exit 1, and only then suggests a new land", async (outcome) => {
    const { alice } = await readyToLand();
    h.room.landingPaused = true;
    await cli(alice, ["land"]);
    const op = roomOf(alice).landing.op as string;
    h.room.finishLanding(op, outcome);
    const res = await cli(alice, ["wait"]);
    expect(res.code).toBe(EXIT.failed);
    expect(norm(res.out)).toMatchSnapshot(`wait ${outcome}`);
    expect(roomOf(alice).landing).toBeUndefined();
    expect(acts("land")).toHaveLength(1);
  });
});

describe("a recovered claim or landing changes a selection only if its revision is unchanged (reviews 80d3710c, f7c79158)", () => {
  test("X, then an interrupted claim of Y, then Z, then X again: recovering Y keeps X", async () => {
    const home = join(h.tmp, "alice");
    await login(home, "@alice");
    await cli(home, ["claim", "x/**", "--goal", "x"]);
    const x = roomOf(home).lane as string;
    const claimY = ["claim", "y/**", "--goal", "y", "--idempotency-key", "claim-y"];
    expect((await cli(home, claimY, h.tmp, crashAt("act-answered"))).code).toBe(EXIT.failed);
    await cli(home, ["claim", "z/**", "--goal", "z"]);
    expect((await cli(home, ["claim", "x/**", "--lane", x])).code).toBe(EXIT.ok);
    expect(roomOf(home).lane).toBe(x); // the same value the Y claim expected, but a newer revision

    const again = await cli(home, claimY);
    expect(again.code).toBe(EXIT.ok);
    const y = idOf(acts("claim").find((e) => (e.entry.type === "act" ? (e.entry.act.envelope.body as { goal?: string }).goal === "y" : false))!);
    expect(again.out).toContain(`Kept lane ${x} selected: the selection changed after this claim was sent. To work on ${y}, pass --lane ${y}.`);
    expect(roomOf(home).lane).toBe(x);
  });

  test("a recovery interrupted after its own config write does not treat its own change as newer work", async () => {
    const home = join(h.tmp, "alice");
    await login(home, "@alice");
    const claim = ["claim", "src/**", "--goal", "g", "--idempotency-key", "claim-self"];
    expect((await cli(home, claim, h.tmp, crashAt("act-answered"))).code).toBe(EXIT.failed);
    expect((await cli(home, claim, h.tmp, crashAt("config-written"))).code).toBe(EXIT.failed);
    const rev = roomOf(home).laneRev;
    const again = await cli(home, claim);
    expect(again.code).toBe(EXIT.ok);
    expect(again.out).not.toContain("Kept lane");
    expect(roomOf(home).lane).toBe(idOf(acts("claim")[0]!));
    expect(roomOf(home).laneRev).toBe(rev); // applied once
  });

  test("a wait that finishes the followed landing is a local change too: a landing recovered after it is not followed", async () => {
    const { alice: home } = await readyToLand();
    h.room.landingPaused = true;
    expect((await cli(home, ["land"])).code).toBe(EXIT.ok);
    const first = roomOf(home).landing.op as string;
    h.room.finishLanding(first, "retryable");
    // A new attempt, prepared while the first landing is still followed; its answer is kept, the local step is not done.
    const land = ["land", "--idempotency-key", "land-2"];
    expect((await cli(home, land, h.tmp, crashAt("act-answered"))).code).toBe(EXIT.failed);
    // Meanwhile `wait` sees the first landing finish, and stops following it.
    expect((await cli(home, ["wait"])).code).toBe(EXIT.failed);
    expect(roomOf(home).landing).toBeUndefined();
    const again = await cli(home, land);
    expect(again.code).toBe(EXIT.ok);
    expect(again.out).toMatch(/Kept following no landing: that changed after this landing started\. To follow this one: artroom wait op_land_\d+/);
    expect(roomOf(home).landing).toBeUndefined();
    expect(acts("land")).toHaveLength(2);
  });
});

describe("older config and journal files are decoded conservatively; newer ones are refused (review f30be7f6, E5.2)", () => {
  const configPath = (home: string) => join(home, "config.json");

  function rewriteEntry(home: string, key: string, change: (e: Record<string, unknown>) => Record<string, unknown>): void {
    const path = join(home, "journal", h.room.id, `act-${key}.json`);
    writeFileSync(path, JSON.stringify(change(JSON.parse(readFileSync(path, "utf8")))));
  }

  test("the exact revision-4 answered release-lane entry returns its kept receipt, changes nothing local, and names the manual steps", async () => {
    const home = join(h.tmp, "alice");
    const dir = repo("repo");
    await login(home, "@alice");
    await cli(home, ["claim", "src/**", "--goal", "x"], dir);
    const x = roomOf(home).lane as string;
    await cli(home, ["workspace"], dir);
    expect((await cli(home, ["release", "--idempotency-key", "rel-v1"], dir, crashAt("act-answered"))).code).toBe(EXIT.failed);
    // As revision 4 wrote it: schema 1, state answered with its receipt, and a lane-and-path intent.
    rewriteEntry(home, "rel-v1", (e) => ({ ...e, v: 1, local: { kind: "release-lane", lane: x, credential: credential(dir) } }));
    const before = calls("/acts");
    const res = await cli(home, ["release", "--idempotency-key", "rel-v1"], dir);
    expect(res.code).toBe(EXIT.ok);
    expect(res.out).toContain(`Released lane ${x}`);
    expect(res.out).toContain("Manual local step: This release was recorded by an older artroom, so its local cleanup was not done.");
    expect(res.out).toContain(`Manual local step: If ${credential(dir)} still holds lane ${x}'s credential, remove it by hand.`);
    expect(calls("/acts")).toBe(before);
    expect(existsSync(credential(dir))).toBe(true);
    expect(roomOf(home).lane).toBe(x);
    expect(acts("release")).toHaveLength(1);
  });

  test.each([
    ["a revision-2 prepared claim with no state or intent", (e: Record<string, unknown>) => ({ v: 1, type: e["type"], id: e["id"], room: e["room"], command: e["command"], prepared: e["prepared"] })],
    ["a revision-4 prepared claim with a value-based intent", (e: Record<string, unknown>) => ({ ...e, v: 1, local: { kind: "select-lane", expect: null } })],
  ])("%s is resent unchanged, and its lane is not selected", async (_what, toV1) => {
    const home = join(h.tmp, "alice");
    await login(home, "@alice");
    h.room.faults.push({ route: "POST /acts", kind: "drop" });
    expect((await cli(home, ["claim", "src/**", "--goal", "g", "--idempotency-key", "claim-v1"])).code).toBe(EXIT.failed);
    rewriteEntry(home, "claim-v1", toV1);
    const res = await cli(home, ["claim", "src/**", "--goal", "g", "--idempotency-key", "claim-v1"]);
    expect(res.code).toBe(EXIT.ok);
    expect(res.out).toMatch(/Manual local step: This claim was recorded by an older artroom/);
    expect(roomOf(home).lane).toBeUndefined();
    expect(acts("claim")).toHaveLength(1);
  });

  test("a schema-1 config with a path-only mapping and an old marker: release removes nothing it cannot prove, and says so", async () => {
    const home = join(h.tmp, "alice");
    const dir = repo("repo");
    await login(home, "@alice");
    await cli(home, ["claim", "src/**", "--goal", "x"], dir);
    const x = roomOf(home).lane as string;
    await cli(home, ["workspace"], dir);
    const c = config(home);
    delete c.v;
    const r = c.rooms[h.room.id];
    r.workspaces = { [x]: credential(dir) };
    delete r.workspaceRev;
    delete r.workspaceBy;
    writeFileSync(configPath(home), JSON.stringify(c));
    const text = readFileSync(credential(dir), "utf8").split("\n");
    text[0] = `# artroom workspace credential for lane ${x}, lease 1.`;
    writeFileSync(credential(dir), text.join("\n"));
    const res = await cli(home, ["release"], dir);
    expect(res.code).toBe(EXIT.ok);
    expect(res.out).toContain(`Manual local step: ${credential(dir)} was set up by an older artroom for lane ${x}. If it still holds this lane's credential, remove it by hand.`);
    expect(existsSync(credential(dir))).toBe(true);
    expect(config(home).v).toBe(4);
  });

  test("a claim interrupted after each local step in turn while migrating a schema-1 config is finished by the same command", async () => {
    const home = join(h.tmp, "alice");
    await login(home, "@alice");
    const c = config(home);
    delete c.v;
    writeFileSync(configPath(home), JSON.stringify(c));
    const argv = ["claim", "src/**", "--goal", "g", "--idempotency-key", "mig-steps"];
    for (const step of ["act-answered", "config-written"]) expect((await cli(home, argv, h.tmp, crashAt(step))).code, step).toBe(EXIT.failed);
    expect((await cli(home, argv)).code).toBe(EXIT.ok);
    expect(config(home).v).toBe(4);
    expect(roomOf(home).lane).toMatch(/^act_/);
    expect(roomOf(home).laneRev).toBe(1);
    expect(acts("claim")).toHaveLength(1);
  });

  test("a config or journal entry from a newer schema is refused, and nothing is sent", async () => {
    const home = join(h.tmp, "alice");
    await login(home, "@alice");
    h.room.faults.push({ route: "POST /acts", kind: "drop" });
    await cli(home, ["claim", "src/**", "--goal", "g", "--idempotency-key", "future"]);
    rewriteEntry(home, "future", (e) => ({ ...e, v: 5 }));
    const before = calls("/acts");
    const entry = await cli(home, ["claim", "src/**", "--goal", "g", "--idempotency-key", "future"]);
    expect(entry.code).toBe(EXIT.failed);
    expect(entry.err).toMatch(/was written by a newer artroom \(schema 5; this one reads 1 to 4\)\. Update artroom/);
    expect(calls("/acts")).toBe(before);
    const c = config(home);
    writeFileSync(configPath(home), JSON.stringify({ ...c, v: 99 }));
    const conf = await cli(home, ["attention"]);
    expect(conf.code).toBe(EXIT.failed);
    expect(conf.err).toMatch(/config\.json was written by a newer artroom \(schema 99/);
  });
});
