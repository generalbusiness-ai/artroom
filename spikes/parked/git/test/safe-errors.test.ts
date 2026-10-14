// Request d29c09fa: the landing engine and its publishers keep safe metadata
// only (lane A's `errorNote`) at every durable or projected error field. Each
// sink is driven by a provider error whose message echoes a token, an
// `Authorization: Bearer` header and a URL query; neither the rows, the
// views, the publication status nor the room's log may hold any of them.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { OpId, Sha } from "@generalbusiness/artroom-contract";
import { Landing } from "../src/landing/engine.ts";
import type { IntegrateResult } from "../src/landing/core.ts";
import { GitPublisher } from "../src/publisher/git-publisher.ts";
import { ContainerPublisher, type PublisherStub } from "../src/publisher/client.ts";
import { GitError, type GitOps } from "../src/publisher/gitops.ts";
import { outcomeNote } from "../src/publisher/push-outcome.ts";
import type { ArtifactsNamespace, RepoHandle } from "../src/artifacts.ts";
import type { MintLedger } from "../src/mints.ts";
import { type ScrubCursor, type ScrubTable, WITHHELD, isSafeErrorText, safeErrorText, scrubBatch, scrubLegacyErrors } from "../src/safe-errors.ts";
import { Clock, ControlledPublisher, ECHOED, FakeRoom, FakeTokens, MemoryCanonical, actId, echoNote, echoing, everyRow, laneId, noEcho, nodeSql, opId } from "./support.ts";

async function world() {
  const f = new MemoryCanonical().init(); // the sinks are the engine's: no test here needs real git
  const room = new FakeRoom();
  const clock = new Clock();
  const sql = nodeSql();
  const pub = new ControlledPublisher(f.publisher);
  const engine = new Landing({ sql, room, publisher: pub, tokens: new FakeTokens(), now: clock.now });
  await engine.refreshMain();
  const head = await f.propose(laneId(1), 1, f.main, { "src/c.txt": "c\n" });
  room.hold(laneId(1), 1, head);
  const id = opId(1);
  const r = engine.accept({ id, lane: laneId(1), generation: 1, head, act: actId(501), leaseGeneration: 1, policyVersion: room.policy });
  assert.ok(!("refused" in r), "accepted");
  /** Everything durable or shown: every row, the views, the status, the slot and the room's log. */
  const clean = (what: string) => noEcho(what, everyRow(sql), engine.view(id), engine.activeViews(), engine.status(), engine.slot(), room.log);
  return { f, room, clock, sql, pub, engine, id, clean, dispose: () => f.dispose() };
}

type World = Awaited<ReturnType<typeof world>>;

async function reserved(w: World): Promise<void> {
  await w.engine.prepare(w.id);
  assert.equal(w.engine.view(w.id)?.state, "ready");
  assert.equal(w.engine.reserve(w.id).kind, "reserved");
}

const record = (w: World, id: OpId) => w.engine.core.get(id)!;

/** A publisher sandbox stub whose integration throws `error`, over a canonical repository that mints and revokes. */
function containerPublisher(error: unknown): ContainerPublisher {
  const repo = {
    createToken: async () => ({ id: "tid_1", plaintext: "x", scope: "write", expiresAt: new Date(0).toISOString() }),
    revokeToken: async () => true,
  } as unknown as RepoHandle;
  const stub = {
    integrate: async () => {
      throw error;
    },
  } as unknown as PublisherStub;
  const artifacts = { get: async () => repo } as unknown as ArtifactsNamespace;
  // Since mint lane C the canonical token comes through the Room's mint ledger; here a stand-in that hands one over.
  const mints = { withToken: async <T>(_p: string, _s: string, _t: unknown, fn: (t: { plaintext: string }) => Promise<T>) => fn({ plaintext: "x" }) } as unknown as MintLedger;
  return new ContainerPublisher({ stub, artifacts, canonical: { name: "canon", remote: "https://acct.artifacts.cloudflare.net/git/ns/canon.git" }, mints, sleep: async () => {} });
}

test("d29c09fa, a failed integration (the engine's catch): the record keeps the stage, name, code and status only", async (t) => {
  const w = await world();
  t.after(w.dispose);
  w.pub.integrate = async () => {
    throw echoing();
  };
  await w.engine.prepare(w.id);
  assert.equal(record(w, w.id).state, "preparing");
  assert.equal(record(w, w.id).lastError, echoNote("integration failed"));
  w.clean("a failed integration");
});

test("d29c09fa, a failed integration (ContainerPublisher, the Room's publisher): its error result is safe metadata, and so is the record", async (t) => {
  const w = await world();
  t.after(w.dispose);
  const container = containerPublisher(echoing());
  const req = { op: w.id, attempt: 1, lane: laneId(1), generation: 1, head: w.f.main as Sha, expectedMain: w.f.main as Sha };
  const direct: IntegrateResult = await container.integrate(req);
  assert.deepEqual(direct, { kind: "error", detail: echoNote("integration failed") });
  w.pub.integrate = (r) => container.integrate(r);
  await w.engine.prepare(w.id);
  assert.equal(record(w, w.id).lastError, echoNote("integration failed"));
  w.clean("ContainerPublisher's failed integration");
});

test("d29c09fa, a failed integration (GitPublisher, git's stderr in a GitError): its error result keeps no stderr", async (t) => {
  const w = await world();
  t.after(w.dispose);
  const ops = {
    integrate: async () => {
      throw new GitError("merge-tree", { code: 128, stdout: "", stderr: echoing().message });
    },
  } as unknown as GitOps;
  const git = new GitPublisher(ops, "/canonical.git");
  w.pub.integrate = (r) => git.integrate(r);
  await w.engine.prepare(w.id);
  assert.equal(record(w, w.id).lastError, "integration failed: Error");
  w.clean("GitPublisher's failed integration");
});

test("d29c09fa, readiness that cannot be computed: the record keeps safe metadata only", async (t) => {
  const w = await world();
  t.after(w.dispose);
  w.room.readinessOf.set(w.id, () => {
    throw echoing();
  });
  await w.engine.prepare(w.id);
  assert.equal(record(w, w.id).lastError, echoNote("readiness could not be computed"));
  assert.equal(record(w, w.id).readinessPending, true);
  w.clean("a failed readiness evaluation");
});

test("d29c09fa, a push that does not answer: the attempt keeps safe metadata only", async (t) => {
  const w = await world();
  t.after(w.dispose);
  await reserved(w);
  w.pub.push = () => Promise.reject(echoing());
  assert.equal(await w.engine.publish(), true);
  const a = record(w, w.id).pushes![0]!;
  assert.deepEqual([a.outcome, a.detail], ["unknown", echoNote("push did not answer")]);
  w.clean("an unanswered push");
});

test("d29c09fa, a push whose answer carries the remote's text: the attempt keeps the outcome, the kind of refusal and a known Artifacts code only", async (t) => {
  const w = await world();
  t.after(w.dispose);
  await reserved(w);
  const text = `remote: artifacts_git_receive_pack_object_too_large\n${echoing().message}`;
  w.pub.push = async () => ({ outcome: "rejected", reason: "remote-rejected", detail: text });
  assert.equal(await w.engine.publish(), true);
  const a = record(w, w.id).pushes![0]!;
  assert.deepEqual([a.outcome, a.detail], ["rejected", "push answered: rejected (remote-rejected) artifacts_git_receive_pack_object_too_large"]);
  w.clean("a push answered with the remote's text");
  // Every outcome's note is its fixed phrase.
  assert.equal(outcomeNote({ outcome: "unknown", detail: text }), "push answered: unknown");
  assert.equal(outcomeNote({ outcome: "error", detail: text }), "push answered: error");
  assert.equal(outcomeNote({ outcome: "landed", detail: text }), "push answered: landed");
  assert.equal(outcomeNote({ outcome: "rejected", reason: "lease", detail: echoing().message }), "push answered: rejected (lease)");
});

test("d29c09fa, main that cannot be read back after the push: the record keeps safe metadata only", async (t) => {
  const w = await world();
  t.after(w.dispose);
  await reserved(w);
  w.pub.readMain = async () => {
    throw echoing();
  };
  assert.equal(await w.engine.publish(), true);
  assert.equal(record(w, w.id).state, "publishing");
  assert.equal(record(w, w.id).lastError, echoNote("main could not be read"));
  assert.equal(w.engine.status()?.lastError, echoNote("main could not be read"));
  w.clean("a failed read of main");
});

// ------------------------------------------------------------------ legacy rows: the validator, the read and the scrub

/** What a record stored before the rule may hold: the provider's message, redacted or not. */
const legacy = (prefix = "") => `${prefix}${echoing().message}`;

test("d29c09fa: the shared validator accepts every form the sinks write, and nothing with provider text", () => {
  const ok = [
    echoNote("main could not be read"),
    "integration failed: Error",
    "workspace cleanup failed: an error of another kind INVALID_INPUT (10001) status 400",
    "create failed: not an error",
    "push answered: landed",
    "push answered: rejected (remote-rejected) artifacts_git_receive_pack_object_too_large",
    "token not minted (create failed: Error)",
    "abort attempt before the push started",
    "answer lost: create failed: an error of another kind",
    "outcome unknown; 3 live token(s) on the canonical repository not accounted for at 2026-10-02T12:00:00.000Z",
    "held",
    "2 token cleanup step(s) on the fork are still owed; trying again later",
    "A repository at the lane's fork name is not a fork of the room's repository. It was not used or changed.",
    `landing step failed: ${WITHHELD}`,
  ];
  for (const t of ok) assert.ok(isSafeErrorText(t), t);
  const bad = [
    legacy(),
    legacy("main could not be read: "),
    legacy("push did not answer: "),
    `${echoNote("integration failed")} ${ECHOED[0]}`,
    `push answered: unknown: ${ECHOED[1]}`,
    `answer lost: ${legacy()}`,
    "integration failed: ArtifactsError",
    "integration failed: Error SOMETHING_NEW",
    `A repository named ${ECHOED[0]} exists but is not a fork of ns/canon. It was not used or changed.`,
    "",
  ];
  for (const t of bad) assert.ok(!isSafeErrorText(t), t);
  assert.equal(safeErrorText(legacy("main could not be read: "), "landing step failed"), `main could not be read: ${WITHHELD}`);
  assert.equal(safeErrorText(legacy(), "landing step failed"), `landing step failed: ${WITHHELD}`);
  assert.equal(safeErrorText(null, "landing step failed"), null);
  assert.equal(safeErrorText(echoNote("push did not answer"), "landing step failed"), echoNote("push did not answer"));
});

test("d29c09fa, reopen: a landing record stored with provider text shows only safe metadata before any retry, and the scrub rewrites it once", async (t) => {
  const w = await world();
  t.after(w.dispose);
  await reserved(w);
  w.pub.readMain = async () => {
    throw echoing();
  };
  await w.engine.publish();
  // Legacy rows: the provider's text in lastError and in the push's detail, as stored before the rule.
  const body = JSON.parse(String(w.sql.all("SELECT body FROM artroom_land_op WHERE id = ?", w.id)[0]!["body"]));
  body.lastError = legacy("main could not be read: ");
  body.pushes[0].detail = legacy("push did not answer: ");
  w.sql.all("UPDATE artroom_land_op SET body = ? WHERE id = ?", JSON.stringify(body), w.id);
  w.engine.kill();
  // Reopen: a new engine on the same storage, before any step runs.
  const reopened = new Landing({ sql: w.sql, room: w.room, publisher: w.pub, tokens: new FakeTokens(), now: w.clock.now });
  assert.equal(reopened.status()?.lastError, `main could not be read: ${WITHHELD}`);
  noEcho("the reopened projections", reopened.status(), reopened.view(w.id), reopened.activeViews(), w.room.log);
  // The scrub rewrites the rows, and a second run changes nothing.
  scrubLegacyErrors(w.sql);
  const rec = reopened.core.get(w.id)!;
  assert.deepEqual([rec.lastError, rec.pushes![0]!.detail], [`main could not be read: ${WITHHELD}`, `push did not answer: ${WITHHELD}`]);
  noEcho("the scrubbed rows", everyRow(w.sql));
  {
    const once = everyRow(w.sql);
    scrubLegacyErrors(w.sql); // a second run changes nothing
    assert.equal(everyRow(w.sql), once);
  }
});

test("d29c09fa: the scrub keeps safe values as they are", async (t) => {
  const w = await world();
  t.after(w.dispose);
  await reserved(w);
  w.pub.push = () => Promise.reject(echoing());
  await w.engine.publish();
  const before = everyRow(w.sql);
  // Nothing is written for a safe value: count the upgrade's writes.
  let writes = 0;
  const all = w.sql.all.bind(w.sql);
  w.sql.all = (q, ...b) => {
    if (/^\s*(UPDATE|INSERT|DELETE)/i.test(q)) writes++;
    return all(q, ...b);
  };
  scrubLegacyErrors(w.sql);
  w.sql.all = all;
  assert.equal(writes, 0);
  {
    const once = everyRow(w.sql);
    scrubLegacyErrors(w.sql); // a second run changes nothing
    assert.equal(everyRow(w.sql), once);
  }
  assert.equal(everyRow(w.sql), before);
});

test("d29c09fa: a terminal landing record keeps its body, and the upgrade rewrites only its error fields", async (t) => {
  const w = await world();
  t.after(w.dispose);
  await reserved(w);
  assert.equal(await w.engine.publish(), true);
  assert.equal(w.engine.view(w.id)?.state, "landed");
  const body = JSON.parse(String(w.sql.all("SELECT body FROM artroom_land_op WHERE id = ?", w.id)[0]!["body"]));
  const legacyBody = { ...body, lastError: legacy("integration failed: "), pushes: body.pushes.map((p: object) => ({ ...p, detail: legacy() })) };
  w.sql.all("UPDATE artroom_land_op SET body = ? WHERE id = ?", JSON.stringify(legacyBody), w.id);
  scrubLegacyErrors(w.sql);
  const after = JSON.parse(String(w.sql.all("SELECT body FROM artroom_land_op WHERE id = ?", w.id)[0]!["body"]));
  // Everything but the two error fields is as it was: state, receipt, tokens, outcomes, timing.
  assert.deepEqual(after, { ...body, lastError: `integration failed: ${WITHHELD}`, pushes: body.pushes.map((p: object) => ({ ...p, detail: `landing step failed: ${WITHHELD}` })) });
  noEcho("a terminal record", everyRow(w.sql));
});

test("d29c09fa: the upgrade runs in bounded batches with a cursor, skips a table that does not exist, and ends", () => {
  const sql = nodeSql();
  sql.all("CREATE TABLE t (id INTEGER PRIMARY KEY, last_error TEXT)");
  const values = [legacy(), "held", null, legacy("revocation failed: "), echoNote("create failed"), legacy(), legacy()];
  values.forEach((v, i) => sql.all("INSERT INTO t (id, last_error) VALUES (?, ?)", i + 1, v));
  const tables: ScrubTable[] = [
    { table: "missing", key: "id", columns: ["last_error"], fix: () => ({ last_error: "x" }) },
    { table: "t", key: "id", columns: ["last_error"], fix: (r) => (typeof r["last_error"] === "string" && !isSafeErrorText(r["last_error"]) ? { last_error: safeErrorText(r["last_error"], "revocation failed") } : null) },
  ];
  const changed = () => sql.all("SELECT id FROM t WHERE last_error LIKE '%withheld'").map((r) => r["id"]);
  let c: ScrubCursor | null = scrubBatch(sql, tables, { table: 0, after: null }, 3);
  assert.deepEqual(c, { table: 1, after: null });
  c = scrubBatch(sql, tables, c!, 3);
  assert.deepEqual([c, changed()], [{ table: 1, after: 3 }, [1]]);
  c = scrubBatch(sql, tables, c!, 3);
  assert.deepEqual([c, changed()], [{ table: 1, after: 6 }, [1, 4, 6]]);
  c = scrubBatch(sql, tables, c!, 3);
  assert.deepEqual([c, changed()], [null, [1, 4, 6, 7]]);
  assert.deepEqual(
    sql.all("SELECT last_error FROM t ORDER BY id").map((r) => r["last_error"]),
    [`revocation failed: ${WITHHELD}`, "held", null, `revocation failed: ${WITHHELD}`, echoNote("create failed"), `revocation failed: ${WITHHELD}`, `revocation failed: ${WITHHELD}`],
  );
  noEcho("the upgraded rows", everyRow(sql));
});
