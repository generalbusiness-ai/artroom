/**
 * Lane L's transfer bound (`cohort-too-large`, lane B follow-up revision 2):
 * the Room publishes a smaller cohort, stored with its exact commit before
 * any remote write, and stops with a surfaced error when one entry is still
 * too large. Through the real publisher and log remote, over the fakes.
 */

import { describe, expect, it } from "vitest";
import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import type { Claim, LogEntry } from "@generalbusiness/artroom-contract";
import { verifyLog } from "@generalbusiness/artroom-log";
import type { Room } from "../../src/index.ts";
import { call, failure, makeRoom, type TestRoom } from "./support.ts";

const inDO = <T>(r: TestRoom, fn: (room: Room) => T | Promise<T>) => runInDurableObject(r.stub as unknown as DurableObjectStub<Room>, fn);
const entries = async (r: TestRoom): Promise<LogEntry[]> => [...(await r.admin.read({ q: "log", req: { limit: 500 } })).acts];
const published = async (r: TestRoom) => (await r.admin.read({ q: "log" })).publishedThrough;
const stored = (r: TestRoom) => inDO(r, (room) => room.core.pendingPublication());
/** Plain prose, so the secret scan has nothing to find. */
const prose = (n: number) => Array.from({ length: n }, (_, i) => `line ${i} of a long note about the plan.`).join(" ");

/** A room whose log holds `notes` notes of about `size` characters each after its claim. */
async function busyRoom(notes: number, size: number) {
  const r = await makeRoom();
  const c = await r.admin.ok<Claim>("claim", null, { goal: "g", scope: ["src/**"] });
  for (let i = 0; i < notes; i++) await r.admin.ok("note", { act: c.id }, { text: prose(size / 40) });
  return { r, c };
}

describe("a cohort larger than one push", () => {
  it("is shrunk and published; the published log verifies; the rest follows once the bound allows", async () => {
    const { r } = await busyRoom(12, 2_000);
    const head = (await entries(r)).at(-1)!.seq;
    r.world.logTransfer = { objects: 100_000, bytes: 16_000 };
    const p = await call<{ through: number; commit: string }>(r.stub.publishLog());
    expect(p.through).toBeLessThan(head);
    expect(p.through).toBeGreaterThan(0);
    expect(await published(r)).toBe(p.through);
    expect(r.world.log.ref).toBe(p.commit);
    const report = await verifyLog(r.world.artifacts.canonicalRepo());
    expect(report).toMatchObject({ ok: true, failures: [], verifiedThrough: p.through, publishedThrough: p.through });
    // Without the bound (a new instance opens its publisher with it) the remainder publishes, from the shrunken commit.
    r.world.logTransfer = null;
    await evictDurableObject(r.stub);
    const rest = await call<{ through: number; commit: string }>(r.stub.publishLog());
    expect(rest.through).toBe(head + 1);
    expect(r.world.artifacts.parents(rest.commit as never)).toEqual([p.commit]);
    expect(await verifyLog(r.world.artifacts.canonicalRepo())).toMatchObject({ ok: true, failures: [] });
  });

  it("the smaller cohort is stored with its exact commit before any remote write, and a restart resumes it, not the larger one", async () => {
    const { r } = await busyRoom(12, 2_000);
    r.world.logTransfer = { objects: 100_000, bytes: 16_000 };
    // The smaller cohort's push applies, and its answer and the read-back are lost.
    r.world.log.faults.lostPushReply = 1;
    r.world.log.faults.lostReadReply = 1;
    expect((await failure(r.stub.publishLog())).code).toBe("unavailable");
    const pending = (await stored(r))!;
    const head = (await entries(r)).at(-1)!.seq;
    expect(pending.through).toBeLessThan(head);
    expect(r.world.log.ref).toBe(pending.expected);
    await evictDurableObject(r.stub);
    expect(await stored(r)).toMatchObject({ through: pending.through, expected: pending.expected });
    expect(await call(r.stub.publishLog())).toEqual({ through: pending.through, commit: pending.expected });
    expect(await published(r)).toBe(pending.through);
    expect(await verifyLog(r.world.artifacts.canonicalRepo())).toMatchObject({ ok: true, failures: [] });
  });

  it("one entry still too large is a surfaced publication error: nothing is skipped, nothing is pushed, the admins are told", async () => {
    const r = await makeRoom();
    const c = await r.admin.ok<Claim>("claim", null, { goal: "g", scope: ["src/**"] });
    await call(r.stub.publishLog());
    // The next entry alone is larger than one push may carry.
    const big = await r.admin.ok("note", { act: c.id }, { text: prose(400) });
    r.world.logTransfer = { objects: 100_000, bytes: 8_000 };
    await evictDurableObject(r.stub);
    // The cohort shrinks to the entries before the large one (the first publication's checkpoint), which publish.
    const first = await call<{ through: number }>(r.stub.publishLog());
    expect(first.through).toBe(big.seq - 1);
    const pushes = r.world.log.pushes;
    expect((await failure(r.stub.publishLog())).code).toBe("unavailable");
    expect((await failure(r.stub.publishLog())).code).toBe("unavailable");
    expect(await published(r)).toBe(big.seq - 1);
    expect(r.world.log.pushes).toBe(pushes);
    expect(await stored(r)).toMatchObject({ through: big.seq });
    expect(await inDO(r, (room) => room.core.sql.all("SELECT v FROM meta WHERE k = 'publication_error'")[0]?.["v"])).toBe("cohort-too-large");
    const att = await r.admin.read({ q: "attention", page: { limit: 500 } });
    const told = att.items.filter((i) => i.why === "publication-unresolved");
    expect(told.length).toBe(1);
    expect((told[0] as unknown as { text: string }).text).toMatch(new RegExp(`Entry ${big.seq} .*more than one push`));
    // The entry is published, not skipped, once the bound allows it.
    r.world.logTransfer = null;
    await evictDurableObject(r.stub);
    const p = await call<{ through: number }>(r.stub.publishLog());
    expect(p.through).toBeGreaterThanOrEqual(big.seq);
    expect(await verifyLog(r.world.artifacts.canonicalRepo())).toMatchObject({ ok: true, failures: [] });
  });
});
