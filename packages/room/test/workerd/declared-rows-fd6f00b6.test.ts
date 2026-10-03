/**
 * Declared acts stage 2, condition 5 (request fd6f00b6): the declared path
 * writes no more rows per act than the legacy path.
 *
 * The same session runs in a room under a `v1` document and in one under the
 * code-review `v2` declarations. A write spy on each Room object only (as in
 * idle-writes-3da1d82b.test.ts) adds every SQL statement's `rowsWritten`,
 * which SQLite reports as Cloudflare bills them: the table row and each
 * index row the write touches (measure/README.md). For each act it counts
 * the act's admission alone, and the act with the alarm work it causes (its
 * pin, preview, landing and log publication), up to a settled alarm.
 *
 * The figures are printed as a table (`[rows]` lines) for plans/README.md.
 * No Cloudflare account is used: this is the local SQLite count, not the
 * billing datasets of measure/rows.mjs.
 */

import { describe, expect, it } from "vitest";
import { runInDurableObject } from "cloudflare:test";
import type { Claim, LaneId, PolicyDocument, RosterRecord } from "@generalbusiness/artroom-contract";
import { policy, requireReview } from "@generalbusiness/artroom-policy";
import type { Room } from "../../src/index.ts";
import { act, bindingIn, declaredRoom, v2 } from "./declared-support.ts";
import { b64url, Client, clock, day, DECLARED, digestBytes, expectOk, iso, makeRoom, newKeyPair, pushChange, randomBytes, tick, type TestRoom } from "./support.ts";

interface Writes {
  rows: number;
}

/** Count this Room object's rows written, by the cursor's `rowsWritten`, from now on. */
async function spy(r: TestRoom): Promise<Writes> {
  const w: Writes = { rows: 0 };
  await runInDurableObject(r.stub as unknown as DurableObjectStub<Room>, (room: Room, state: DurableObjectState) => {
    const sql = room.core.sql as { all: (q: string, ...b: unknown[]) => unknown[] };
    sql.all = (q, ...b) => {
      const c = state.storage.sql.exec(q, ...(b as SqlStorageValue[]));
      const rows = c.toArray();
      w.rows += c.rowsWritten;
      return rows;
    };
  });
  return w;
}

type Measured = Record<string, { act: number; settled: number }>;

/** One session of acts. `declared` signs declared kinds under their active bindings; platform kinds are v: 1 in both. */
async function session(r: TestRoom, declared: boolean): Promise<Measured> {
  const bindingOf = async (kind: string) => (declared ? await bindingIn(r, kind) : null);
  const run = async <T>(c: Client, kind: string, target: unknown, body: unknown): Promise<T> =>
    expectOk(await act(r, c, kind, target, body, { binding: kind === "roster" || kind === "renew" ? null : await bindingOf(kind) })) as T;
  const w = await spy(r);
  const out: Measured = {};
  const measure = async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
    await tick(r, 2);
    const before = w.rows;
    const result = await fn();
    const acted = w.rows;
    await tick(r, 3);
    out[name] = { act: acted - before, settled: w.rows - before };
    return result;
  };
  const secret = randomBytes(32);
  const inv = await measure("invite (roster)", () =>
    run<RosterRecord>(r.admin, "roster", null, { op: "invite", member: "@bob", role: "member", custody: "client", expiresAt: iso(clock.now + day), secretHash: digestBytes(secret) }),
  );
  const bob = new Client(r, newKeyPair());
  await measure("join (roster)", () => run(bob, "roster", null, { op: "join", invitation: inv.id, secret: b64url(secret) }));
  const c = await measure("claim (open)", () => run<Claim>(bob, "claim", null, { goal: "work", scope: ["src/**"] }));
  const head = pushChange(r, c.lane as LaneId, { "src/app.ts": "v2" });
  await measure("propose (version), with its pin and preview", () => run(bob, "propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "s" }));
  await measure("note (comment)", () => run(r.admin, "note", { act: c.id }, { text: "a note" }));
  await measure("review", () => run(r.admin, "review", { lane: c.lane, generation: 1 }, { head, verdict: "approve", scope: ["src/**"], text: "ok" }));
  await measure("land, with its landing", () => run(bob, "land", { lane: c.lane, generation: 1 }, { lease: 1, head }));
  const c2 = await measure("claim (open), a second thread", () => run<Claim>(bob, "claim", null, { goal: "more", scope: ["docs/**"] }));
  await measure("renew", () => run(bob, "renew", { lane: c2.lane }, { lease: 1 }));
  await measure("release", () => run(bob, "release", { lane: c2.lane }, { lease: 1 }));
  await measure("claim (take over)", () => run(r.admin, "claim", { lane: c2.lane }, { scope: ["docs/**"], expectedGeneration: 0 }));
  const k = newKeyPair();
  const acts = declared ? { claim: (await bindingOf("claim"))!, note: (await bindingOf("note"))! } : null;
  await measure("delegate (roster)", () =>
    run(r.admin, "roster", null, acts ? { op: "delegate", to: k.key, kinds: ["renew"], acts, lanes: "*", expiresAt: iso(clock.now + day) } : { op: "delegate", to: k.key, kinds: ["renew", "claim", "note"], lanes: "*", expiresAt: iso(clock.now + day) }),
  );
  await measure("configuration-recovery open", () =>
    declared ? run(r.admin, "recover", null, { op: "open", goal: "repair", scope: [".artroom/policy.json"] }) : run(r.admin, "claim", null, { goal: "repair", scope: [".artroom/policy.json"], purpose: "config-recovery" }),
  );
  return out;
}

describe.skipIf(DECLARED)("condition 5: rows written per act, legacy and declared (request fd6f00b6)", () => {
  it("the declared path writes no row more than the legacy path for any act, admission alone or with its alarm work", async () => {
    const reviewed = policy(requireReview({ paths: "src/**", from: "role:admin", id: "rv" }));
    const legacy = await session(await makeRoom({ policy: reviewed }), false);
    const declared = await session(await declaredRoom(v2(() => {}, reviewed as PolicyDocument)), true);
    console.log("[rows] | Act | Legacy: admission | Declared: admission | Legacy: with its alarm work | Declared: with its alarm work |");
    for (const name of Object.keys(legacy)) {
      const l = legacy[name]!;
      const d = declared[name]!;
      console.log(`[rows] | ${name} | ${l.act} | ${d.act} | ${l.settled} | ${d.settled} |`);
    }
    for (const name of Object.keys(legacy)) {
      expect(declared[name]!.act, `${name}, admission`).toBeLessThanOrEqual(legacy[name]!.act);
      expect(declared[name]!.settled, `${name}, with its alarm work`).toBeLessThanOrEqual(legacy[name]!.settled);
    }
  });
});
