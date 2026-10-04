/**
 * Review 95323c2b, finding P2. Two integrations can share one filtered
 * snapshot commit: it is a function of the files, the checker and the digest
 * (R-CARRY-15). The checker's reproduction asserted that a fresh check on the
 * second integration was refused through the first one's mapping; each test
 * here asserts the correct outcome. A check counts for the canonical
 * integration fixed at its admission, from its own land operation, never for
 * whichever mapping a lookup by snapshot commit returns.
 */

import { describe, expect, it } from "vitest";
import { runInDurableObject } from "cloudflare:test";
import type { Check, CheckerConfig, Claim, Landing, LandOp, PolicyDocument, Proposal, Sha } from "@generalbusiness/artroom-contract";
import { policy, requireCheck } from "@generalbusiness/artroom-policy/helpers";
import type { Room } from "../../src/index.ts";
import { digestJson } from "../../src/crypto.ts";
import { evidenceByAct } from "../../src/model.ts";
import { obligationsFor } from "../../src/obligations.ts";
import { addMember, clock, expectRefusal, iso, makeRoom, pushChange, tick, type Client, type TestRoom } from "./support.ts";

const inDO = <T>(r: TestRoom, fn: (room: Room) => T | Promise<T>) => runInDurableObject(r.stub as unknown as DurableObjectStub<Room>, fn);
const op = async (r: TestRoom, id: string) => (await r.admin.read({ q: "op", op: id as never })) as LandOp & { integration?: string; waiting?: string[] };
const RUNNER = `sha256:${"0".repeat(64)}` as const;
const volatileCfg: CheckerConfig = { format: "artroom-checker-v1", inputs: ["src/**"], volatile: true, timeoutSeconds: 60 };
/** Pins the runner every test check states, so its checks can carry (R-CARRY-14). */
const stableCfg: CheckerConfig = { ...volatileCfg, volatile: false, runner: RUNNER };

type Row = Record<string, unknown>;
interface Landed {
  readonly lane: string;
  readonly opId: string;
  readonly integration: string;
  readonly rec: Row;
}

async function room(cfg: CheckerConfig, rules: PolicyDocument["rules"] = []) {
  const base = policy(requireCheck("unit", { paths: "src/**", by: "@ci", id: "unit-tests" }));
  const r = await makeRoom({
    policy: { ...base, rules: [...base.rules, ...rules] },
    files: { ".artroom/checkers/unit.json": JSON.stringify(cfg), "package.json": "{}" },
  });
  return { r, alice: await addMember(r, "@alice", "member"), bob: await addMember(r, "@bob", "member"), ci: await addMember(r, "@ci", "checker") };
}

/** Claim, propose and land; the room prepares the integration and records its snapshot commit. */
async function landing(r: TestRoom, who: Client, scope: string[], changes: Record<string, string>): Promise<Landed> {
  const c = await who.ok<Claim>("claim", null, { goal: "work", scope });
  const head = pushChange(r, c.lane, changes);
  await who.ok<Proposal>("propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "change" });
  const l = await who.ok<Landing>("land", { lane: c.lane, generation: 1 }, { lease: 1, head });
  await tick(r);
  const integration = (await op(r, l.op.id)).integration!;
  const rows = await inDO(r, (rm) => rm.core.sql.all("SELECT * FROM check_snapshots WHERE integration = ?", integration));
  expect(rows).toHaveLength(1);
  return { lane: c.lane, opId: l.op.id, integration, rec: rows[0]! };
}

/**
 * The reviewer's layout: both landings change src/app.ts to v2; the second also changes docs/a.md, outside the
 * checker's inputs. Their canonical integrations differ; their snapshot commits are the same commit.
 */
async function twoLandings(cfg: CheckerConfig) {
  const t = await room(cfg);
  const first = await landing(t.r, t.alice, ["src/**"], { "src/app.ts": "v2" });
  const second = await landing(t.r, t.bob, ["src/**", "docs/**"], { "src/app.ts": "v2", "docs/a.md": "second integration" });
  expect(second.integration).not.toBe(first.integration);
  expect(second.rec["commit_sha"]).toBe(first.rec["commit_sha"]);
  return { ...t, first, second };
}

/** A check naming the recorded snapshot commit, with its digest and paths, as lane G signs it from a job. */
function snapshotCheck(cfg: CheckerConfig, rec: Row, landOp: string | undefined, extra: Record<string, unknown> = {}) {
  return {
    obligation: "obl_unit-tests",
    check: "unit",
    integration: rec["commit_sha"],
    input: { kind: "filtered", snapshot: rec["digest"], paths: JSON.parse(rec["paths"] as string) },
    config: digestJson(cfg),
    runner: RUNNER,
    volatile: cfg.volatile,
    ok: true,
    detail: "Fresh run",
    ...(landOp ? { landOp } : {}),
    ...extra,
  };
}

const statusOn = (r: TestRoom, lane: string, integration: string) =>
  inDO(r, (rm) => {
    const p = rm.core.activePolicy();
    return obligationsFor(rm.core.sql, lane, 1, { doc: p.doc, checkers: p.checkers, integration: integration as Sha })[0]!;
  });

const canonicalOf = (r: TestRoom, act: string) => inDO(r, (rm) => evidenceByAct(rm.core.sql, act)!.canonical);

describe("review 95323c2b P2: a shared snapshot commit is not a reverse key to a canonical integration", () => {
  it("fresh volatile checks on two integrations with the same snapshot commit: each is admitted, counts for its own landing's integration only, and both land", async () => {
    const { r, ci, first, second } = await twoLandings(volatileCfg);
    // Both mappings are recorded: the snapshot commit is shared, not rewritten.
    const commit = second.rec["commit_sha"] as string;
    const rows = await inDO(r, (rm) => rm.core.sql.all("SELECT integration FROM check_snapshots WHERE commit_sha = ? ORDER BY rowid", commit));
    expect(rows.map((x) => x["integration"])).toEqual([first.integration, second.integration]);
    // The check the reviewer saw refused: the second landing's own job, naming its own recorded snapshot. A lookup by
    // the commit finds the first integration's row first.
    const c2 = await ci.ok<Check>("check", { lane: second.lane, generation: 1 }, snapshotCheck(volatileCfg, second.rec, second.opId));
    expect(await canonicalOf(r, c2.id)).toBe(second.integration);
    expect((await statusOn(r, second.lane, second.integration)).state).toBe("met");
    expect((await statusOn(r, second.lane, first.integration)).state).toBe("open");
    await tick(r, 3);
    expect(await op(r, second.opId)).toMatchObject({ state: "landed", integration: second.integration });
    // The first landing, re-prepared on the new main if main moved; its src snapshot is the same commit again.
    const now = await op(r, first.opId);
    expect(now).toMatchObject({ state: "preparing", waiting: ["obl_unit-tests"] });
    const rec = await inDO(r, (rm) => rm.core.sql.all("SELECT * FROM check_snapshots WHERE integration = ?", now.integration!)[0]!);
    expect(rec["commit_sha"]).toBe(commit);
    const c1 = await ci.ok<Check>("check", { lane: first.lane, generation: 1 }, snapshotCheck(volatileCfg, rec, first.opId));
    expect(await canonicalOf(r, c1.id)).toBe(now.integration);
    expect((await statusOn(r, first.lane, now.integration!)).state).toBe("met");
    await tick(r, 3);
    expect(await op(r, first.opId)).toMatchObject({ state: "landed", integration: now.integration });
  });

  it("without landOp, a check naming the shared snapshot commit binds the one integration this generation has", async () => {
    const { r, ci, second } = await twoLandings(volatileCfg);
    const c2 = await ci.ok<Check>("check", { lane: second.lane, generation: 1 }, snapshotCheck(volatileCfg, second.rec, undefined));
    expect(await canonicalOf(r, c2.id)).toBe(second.integration);
    await tick(r, 3);
    expect(await op(r, second.opId)).toMatchObject({ state: "landed" });
  });

  it("a failing check on the second integration fails the second landing with check-failed", async () => {
    const { r, ci, second } = await twoLandings(volatileCfg);
    const failed = await ci.ok<Check>("check", { lane: second.lane, generation: 1 }, snapshotCheck(volatileCfg, second.rec, second.opId, { ok: false, detail: "1 failed" }));
    await tick(r, 2);
    expect(await op(r, second.opId)).toMatchObject({ state: "failed", reason: { code: "check-failed", check: failed.id } });
  });

  it("wrong job or operation: another lane's land operation, an unknown operation, or another lane's integration is check-binding, and nothing is recorded", async () => {
    const { r, ci, first, second } = await twoLandings(volatileCfg);
    // The shared snapshot commit, naming the other landing's operation, from either side.
    const a = expectRefusal(await ci.act("check", { lane: second.lane, generation: 1 }, snapshotCheck(volatileCfg, second.rec, first.opId)), "check-binding");
    expect(a.reason).toMatch(/not an active or landed landing of this generation/);
    expectRefusal(await ci.act("check", { lane: first.lane, generation: 1 }, snapshotCheck(volatileCfg, first.rec, second.opId)), "check-binding");
    // An operation that does not exist.
    expectRefusal(await ci.act("check", { lane: second.lane, generation: 1 }, snapshotCheck(volatileCfg, second.rec, "op_9_99999999")), "check-binding");
    // A tree check naming the other lane's canonical integration with its own operation.
    const tree = r.world.artifacts.treeOf(first.integration as never);
    const t = expectRefusal(
      await ci.act("check", { lane: second.lane, generation: 1 }, { ...snapshotCheck(volatileCfg, second.rec, second.opId), integration: first.integration, input: { kind: "tree", tree } }),
      "check-binding",
    );
    expect(t.reason).toMatch(/does not bind an integration the room prepared/);
    expect(await inDO(r, (rm) => rm.core.sql.all("SELECT act FROM evidence WHERE kind = 'check'"))).toEqual([]);
    expect((await statusOn(r, second.lane, second.integration)).state).toBe("open");
    expect((await statusOn(r, first.lane, first.integration)).state).toBe("open");
  });

  it("carry: an earlier check on the shared snapshot commit carries to the lane's new integration, whatever order the snapshot rows are stored in", async () => {
    // A carry rule for checks holds the first judgment back; the activation that removes it judges again.
    const t = await room(stableCfg, [{ id: "hold", kind: "carry", evidence: "check", allow: "false" }]);
    const { r, ci } = t;
    // Bob's docs landing moves main after Alice's check; Alice's src snapshot is unchanged by it.
    const bobLane = await t.bob.ok<Claim>("claim", null, { goal: "docs", scope: ["docs/**"] });
    const bobHead = pushChange(r, bobLane.lane, { "docs/guide.md": "more" });
    await t.bob.ok<Proposal>("propose", { lane: bobLane.lane }, { lease: 1, expectedGeneration: 0, head: bobHead, summary: "docs" });
    await t.bob.ok<Landing>("land", { lane: bobLane.lane, generation: 1 }, { lease: 1, head: bobHead });
    const mine = await landing(r, t.alice, ["src/**"], { "src/app.ts": "v2" });
    const check = await ci.ok<Check>("check", { lane: mine.lane, generation: 1 }, snapshotCheck(stableCfg, mine.rec, mine.opId));
    expect(await canonicalOf(r, check.id)).toBe(mine.integration);
    await tick(r, 4);
    // Main moved; the carry rule stops the carry, and the new integration's snapshot is recorded too.
    const moved = await op(r, mine.opId);
    expect(moved).toMatchObject({ state: "preparing", waiting: ["obl_unit-tests"] });
    expect(moved.integration).not.toBe(mine.integration);
    const commit = mine.rec["commit_sha"] as string;
    // Store the earlier integration's row after the new one's, so that a lookup by commit finds the new integration first.
    await inDO(r, (rm) =>
      rm.core.sql.transaction(() => {
        const rows = rm.core.sql.all("SELECT * FROM check_snapshots WHERE commit_sha = ?", commit);
        expect(rows.map((x) => x["integration"]).sort()).toEqual([mine.integration, moved.integration].sort());
        rm.core.sql.all("DELETE FROM check_snapshots WHERE commit_sha = ?", commit);
        for (const x of [...rows].sort((a, b) => (a["integration"] === moved.integration ? -1 : b["integration"] === moved.integration ? 1 : 0)))
          rm.core.sql.all(
            "INSERT INTO check_snapshots (integration, checker, config, paths, digest, commit_sha) VALUES (?, ?, ?, ?, ?, ?)",
            x["integration"] as string,
            x["checker"] as string,
            x["config"] as string,
            x["paths"] as string,
            x["digest"] as string,
            x["commit_sha"] as string,
          );
      }),
    );
    expect(await inDO(r, (rm) => rm.core.sql.all("SELECT integration FROM check_snapshots WHERE commit_sha = ?", commit)[0]!["integration"])).toBe(moved.integration);
    // A policy without the rule: the earlier check, bound to the earlier integration, carries by the identical snapshot.
    await inDO(r, (rm) => {
      const old = rm.core.activePolicy();
      rm.core.sql.transaction(() => rm.core.activate({ ...old.doc, rules: old.doc.rules.filter((x) => x.id !== "hold") }, old.checkers, null, iso(clock.now)));
    });
    await tick(r, 4);
    expect(await op(r, mine.opId)).toMatchObject({ state: "landed", integration: moved.integration });
  });
});
