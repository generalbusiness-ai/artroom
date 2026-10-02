/**
 * Review f47a509c, CLI findings.
 *
 * - P1: no credential reaches the CLI's output, from the client or from a
 *   room that echoes one in an ordinary answer (R-WS-4).
 * - P3: login and redeem keep their journal entry until every local step is
 *   done, and running the same command again finishes them: the same key
 *   and the same join; a one-time redemption is never sent twice.
 * - P4: an act is journaled, prepared and signed, before it is sent; the
 *   same `--idempotency-key` later sends it again unchanged, with no
 *   preflight reads, even after HEAD, the lane or the lease changed
 *   (R-IDEM-2).
 * - P5: `artroom wait` follows the landing that `land` started; it never
 *   submits another `land`.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { EXIT } from "../src/main.ts";
import { useHarness } from "./harness.ts";

const { h, cli, git, repo, link, login, norm } = useHarness();

const acts = (kind: string) => h.room.entries.filter((e) => e.entry.type === "act" && e.entry.act.envelope.kind === kind);
const joins = () => h.room.entries.filter((e) => e.entry.type === "act" && (e.entry.act.envelope.body as { op?: string }).op === "join");
const calls = (route: string) => h.room.requests.filter((r) => r.route === route).length;
const journal = (home: string) => {
  const dir = join(home, "journal", h.room.id);
  return existsSync(dir) ? readdirSync(dir) : [];
};
const config = (home: string) => JSON.parse(readFileSync(join(home, "config.json"), "utf8"));
const NONRETRYABLE_503 = { name: "ArtroomError", code: "unavailable", message: "The room is restarting.", retryable: false };

/** A crash after the named durable step: the Io's step hook throws there. */
const crashAt = (name: string) => ({
  step: (s: string) => {
    if (s === name) throw new Error(`interrupted after ${s}`);
  },
});

describe("P1: credentials never reach the output", () => {
  test("a bearer echoed in an error, at connection or later, is redacted", async () => {
    const agent = join(h.tmp, "agent");
    expect((await cli(agent, ["redeem", await link("@builder", { role: "agent", custody: "room" })])).code).toBe(EXIT.ok);
    const [bearer] = h.room.exposure.bearers;
    const echo = { name: "ArtroomError", code: "forbidden", message: `token ${bearer} refused`, retryable: false };
    h.room.faults.push({ route: "GET /log", kind: "status", status: 403, body: echo });
    const first = await cli(agent, ["attention"]);
    expect(first.code).toBe(EXIT.failed);
    expect(first.err).toContain("[redacted]");
    h.room.faults.push({ route: "GET /attention", kind: "status", status: 403, body: echo });
    const later = await cli(agent, ["attention", "--json"]);
    expect(later.out).toContain("[redacted]");
    expect(first.out + first.err + later.out + later.err).not.toContain(bearer!);
  });

  test("a room that echoes the bearer inside an ordinary answer is scrubbed by the CLI itself", async () => {
    const agent = join(h.tmp, "agent");
    await cli(agent, ["redeem", await link("@builder", { role: "agent", custody: "room" })]);
    const [bearer] = h.room.exposure.bearers;
    h.room.attentionItems.push({ to: "@builder", item: { why: "policy", rule: "r", act: "act_1_00000000", text: `your token is ${bearer}`, id: "x", seq: 1, open: true } });
    const res = await cli(agent, ["attention"]);
    expect(res.out).toContain("your token is [redacted]");
    expect(res.out).not.toContain(bearer!);
  });
});

describe("P3: login and redeem finish locally before forgetting how to resume", () => {
  test("a failure after the join keeps the journal; the same command finishes with the same key and one join", async () => {
    const alice = join(h.tmp, "alice");
    const invite = await link("@alice");
    h.room.faults.push({ route: "GET /log", kind: "status", status: 503, body: NONRETRYABLE_503 });
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

  test.each(["login-journaled", "joined", "key-saved", "config-written"])("login interrupted after %s is finished by the same command, with one key and one join", async (step) => {
    const home = join(h.tmp, "alice");
    const invite = await link("@alice");
    const first = await cli(home, ["login", invite], h.tmp, crashAt(step));
    expect(first.code).toBe(EXIT.failed);
    const second = await cli(home, ["login", invite]);
    expect(second.code).toBe(EXIT.ok);
    expect(joins()).toHaveLength(1);
    const key = config(home).rooms[h.room.id].key;
    expect(h.room.keys.get(key)?.member).toBe("@alice");
    expect(journal(home)).toEqual([]);
  });

  test.each(["redeemed", "bearer-saved", "config-written"])("redeem interrupted after %s is finished without a second redemption", async (step) => {
    const home = join(h.tmp, "agent");
    const invite = await link("@builder", { role: "agent", custody: "room" });
    expect((await cli(home, ["redeem", invite], h.tmp, crashAt(step))).code).toBe(EXIT.failed);
    const second = await cli(home, ["redeem", invite]);
    expect(second.code).toBe(EXIT.ok);
    expect(calls("/redeem")).toBe(1);
    expect(readFileSync(join(home, "bearers", h.room.id), "utf8").trim()).toBe(h.room.exposure.bearers[0]);
    expect(config(home).rooms[h.room.id].custody).toBe("room");
    expect(journal(home)).toEqual([]);
    expect(second.out + second.err).not.toContain(h.room.exposure.bearers[0]!);
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
    const { invitationLink } = await import("../src/link.ts");
    const bad = await cli(home, ["redeem", invitationLink(h.room.url, h.room.id, invitation, `${secret}x`)]);
    expect(bad.code).toBe(EXIT.refused);
    expect(journal(home)).toEqual([]);
    expect((await cli(home, ["redeem", invitationLink(h.room.url, h.room.id, invitation, secret)])).code).toBe(EXIT.ok);
  });
});

describe("P4: a retried act is the act first sent", () => {
  test("a lost success response, then a separate run after HEAD, the lane and the lease changed, returns the original proposal", async () => {
    const alice = join(h.tmp, "alice");
    const dir = repo();
    await login(alice, "@alice");
    expect((await cli(alice, ["claim", "src/**", "--goal", "g"], dir)).code).toBe(EXIT.ok);
    const first = git(dir, "rev-parse", "HEAD");
    h.room.faults.push({ route: "POST /acts", kind: "drop", times: 4 });
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
    h.room.faults.push({ route: "POST /acts", kind: "drop", times: 4 });
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
});

describe("P5: the landing follow-up waits on the operation already started", () => {
  async function ready(): Promise<{ alice: string; lane: string }> {
    const alice = join(h.tmp, "alice");
    const bob = join(h.tmp, "bob");
    await login(alice, "@alice");
    await login(bob, "@bob");
    await cli(alice, ["claim", "src/**", "--goal", "g"]);
    await cli(alice, ["propose", "-m", "s", "--head", "a".repeat(40)]);
    const lane = config(alice).rooms[h.room.id].lane as string;
    expect((await cli(bob, ["review", `${lane}#1`, "--approve", "--scope", "src/**", "-m", "ok"])).code).toBe(EXIT.ok);
    return { alice, lane };
  }

  test("land without --wait starts once; artroom wait follows that operation to the end", async () => {
    const { alice } = await ready();
    const start = await cli(alice, ["land"]);
    expect(start.code).toBe(EXIT.ok);
    expect(norm(start.out)).toMatchSnapshot("land started");
    const done = await cli(alice, ["wait"]);
    expect(done.code).toBe(EXIT.ok);
    expect(norm(done.out)).toMatchSnapshot("wait landed");
    expect(acts("land")).toHaveLength(1);
    expect(config(alice).rooms[h.room.id].landing).toBeUndefined();
    expect((await cli(alice, ["wait"])).code).toBe(EXIT.usage); // nothing left to follow
  });

  test("a wait that runs out names the same operation, and the next wait finishes it", async () => {
    const { alice } = await ready();
    h.room.landingPaused = true;
    const out = await cli(alice, ["land", "--wait", "--timeout", "1"]);
    expect(out.code).toBe(EXIT.failed);
    expect(norm(out.out)).toMatchSnapshot("wait timed out");
    const op = /artroom wait (op_land_\d+)/.exec(out.out)![1]!;
    h.room.landingPaused = false;
    const done = await cli(alice, ["wait", op]);
    expect(done.code).toBe(EXIT.ok);
    expect(acts("land")).toHaveLength(1);
  });

  test.each(["retryable", "failed"] as const)("a %s landing ends the wait with exit 1, and only then suggests a new land", async (outcome) => {
    const { alice } = await ready();
    h.room.landingPaused = true;
    await cli(alice, ["land"]);
    const op = config(alice).rooms[h.room.id].landing.op as string;
    h.room.finishLanding(op, outcome);
    const res = await cli(alice, ["wait"]);
    expect(res.code).toBe(EXIT.failed);
    expect(norm(res.out)).toMatchSnapshot(`wait ${outcome}`);
    expect(config(alice).rooms[h.room.id].landing).toBeUndefined();
    expect(acts("land")).toHaveLength(1);
  });
});

describe("amendment 2 in the CLI: R-CRED-10 and R-CRED-11", () => {
  test("after its token is revoked, an unfinished bearer act is not resent; the CLI says so and forgets it", async () => {
    const agent = join(h.tmp, "agent");
    await cli(agent, ["redeem", await link("@builder", { role: "agent", custody: "room" })]);
    h.room.faults.push({ route: "POST /mcp", kind: "drop", times: 4 });
    const lost = await cli(agent, ["claim", "src/**", "--goal", "g"]);
    expect(lost.code).toBe(EXIT.failed);
    const key = /--idempotency-key ([A-Za-z0-9_-]+)/.exec(lost.err)![1]!;
    const delegation = config(agent).rooms[h.room.id];
    expect(delegation.custody).toBe("room");
    for (const d of h.room.delegations.values()) h.room.revokeDelegation(d.id);
    const again = await cli(agent, ["claim", "src/**", "--goal", "g", "--idempotency-key", key]);
    expect(again.code).toBe(EXIT.failed);
    expect(again.err).toMatch(/^Error \(unauthenticated\): The bearer token is no longer valid, so 1 unfinished act\(s\) cannot be sent again/);
    expect(again.err).not.toMatch(/--idempotency-key/);
    expect(journal(agent)).toEqual([]);
  });

  test("a link with the secret in the query instead of the fragment is refused (R-CRED-11)", async () => {
    const { invitation, secret } = await h.room.invite("@alice");
    const res = await cli(join(h.tmp, "x"), ["login", `${h.room.url}/rooms/${h.room.id}/join?i=${invitation}&s=${secret}`]);
    expect(res.code).toBe(EXIT.usage);
    expect(h.room.requests.filter((r) => r.route === "/redeem")).toHaveLength(0);
  });

  test("a link with a path prefix uses the origin and the prefix as the endpoint (R-CRED-11)", async () => {
    const { parseInvitation } = await import("../src/link.ts");
    const out = parseInvitation(`https://example.com/artroom/rooms/${h.room.id}/join#i=act_3_0c1d2e3f&s=${"A".repeat(43)}`);
    expect(out).toMatchObject({ url: "https://example.com/artroom", room: h.room.id, invitation: "act_3_0c1d2e3f" });
  });
});
