/**
 * Request d29c09fa: durable and projected error fields keep safe metadata
 * only (lane A's `errorNote`: a fixed stage phrase, an allowed error name, a
 * known Artifacts code, bounded integers), never a provider's message.
 *
 * The production Room, with real Durable Object storage, drives each sink
 * with a provider error whose message echoes a token, an
 * `Authorization: Bearer` header and a URL query. Every row of every table,
 * the reads members and admins see (the log, attention, the operation, the
 * lane), and the operator diagnoses hold none of them. The landing engine is
 * driven directly inside the object, with the Room's own landing step off on
 * that object, so each sink is reached exactly once.
 */

import { describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import type { Claim, Landing, OpId } from "@generalbusiness/artroom-contract";
import { WITHHELD, type LandRecord } from "@generalbusiness/artroom-git";
import { jobTokenDuties } from "../../src/jobs.ts";
import type { Room } from "../../src/index.ts";
import { Client, clock, makeRoom, pushChange, type TestRoom } from "./support.ts";

const inDO = <T>(r: TestRoom, fn: (room: Room, state: DurableObjectState) => T | Promise<T>) => runInDurableObject(r.stub as unknown as DurableObjectStub<Room>, fn);

/** Assembled at runtime, so the source holds no credential-shaped literal (push protection scans it). */
const glue = (...parts: string[]) => parts.join("");
const ECHOED = [glue("art_", "v1_", "leakTOKEN", "0123456789abcdef"), glue("opaque", "Bearer", "Credential42"), glue("query", "Secret", "Q9z")];

/** A provider error echoing a token, an `Authorization: Bearer` header and a URL query, with a known code, numeric code and status. */
function echoing(fields: Record<string, unknown> = { code: "INTERNAL_ERROR", numericCode: 10400, status: 503 }): Error {
  const e = new Error(
    `request failed with token ${ECHOED[0]}; Authorization: Bearer ${ECHOED[1]}; at https://acct.artifacts.cloudflare.net/git/ns/canon.git/info/refs?service=git-receive-pack&token=${ECHOED[2]}`,
  );
  return Object.assign(e, fields);
}
const echoNote = (stage: string) => `${stage}: Error INTERNAL_ERROR (10400) status 503`;

/** Every row of every table, the reads, and the operator diagnoses: none may hold the provider's text. */
async function clean(r: TestRoom, extra: unknown[] = [], opts: { rows: boolean } = { rows: true }): Promise<void> {
  const rows = await inDO(r, (room) => {
    if (!opts.rows) return [];
    const tables = room.core.sql.all("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'").map((x) => String(x["name"]));
    return tables.map((t) => [t, room.core.sql.all(`SELECT * FROM "${t}"`)]);
  });
  const reads = [await r.admin.read({ q: "log", req: { limit: 500 } }), await r.admin.read({ q: "attention" }), await r.admin.read({ q: "lanes" })];
  const text = JSON.stringify([rows, reads, r.world.diagnoses, extra]);
  for (const s of ECHOED) expect(text).not.toContain(s);
}

/** A room whose own landing step is off, with one lane proposed and its landing accepted. */
async function accepted(): Promise<{ r: TestRoom; op: OpId; lane: string }> {
  const r = await makeRoom();
  await inDO(r, async (room) => {
    await room.core.idle();
    const run = room.core.run.bind(room.core);
    room.core.run = (s) => {
      if (s !== "landing") run(s);
    };
  });
  const { lane } = await r.admin.ok<Claim>("claim", null, { goal: "a lane", scope: ["docs/**"] });
  const head = pushChange(r, lane, { "docs/a.md": "a" });
  await r.admin.ok("propose", { lane }, { lease: 1, expectedGeneration: 0, head, summary: "a lane" });
  await inDO(r, (room) => room.core.idle());
  const l = await r.admin.ok<Landing>("land", { lane, generation: 1 }, { lease: 1, head });
  return { r, op: l.op.id as OpId, lane };
}

const record = (r: TestRoom, op: OpId) => inDO(r, (room) => room.core.landing.core.get(op) as LandRecord);
const opRead = (r: TestRoom, op: OpId) => r.admin.read({ q: "op", op: op as never });

/** Prepare the operation through to `ready`, then reserve it. */
async function ready(r: TestRoom, op: OpId): Promise<void> {
  await inDO(r, (room) => room.core.landing.prepare(op));
  clock.now += 60_000;
  await inDO(r, (room) => room.core.landing.evaluate(op));
  expect((await record(r, op)).state).toBe("ready");
  expect(await inDO(r, (room) => room.core.landing.reserve(op).kind)).toBe("reserved");
}

describe("request d29c09fa: the landing engine's error fields keep safe metadata only, in the Room", () => {
  it("a failed integration (the sandbox throws, through ContainerPublisher), then readiness that cannot be computed", async () => {
    const { r, op } = await accepted();
    const stub = r.world.artifacts.stub;
    const integrate = stub.integrate;
    stub.integrate = async () => {
      throw echoing();
    };
    try {
      await inDO(r, (room) => room.core.landing.prepare(op));
    } finally {
      stub.integrate = integrate;
    }
    expect((await record(r, op)).lastError).toBe(echoNote("integration failed"));
    await clean(r, [await opRead(r, op)]);

    clock.now += 60_000; // past the preparation's backoff
    await inDO(r, async (room) => {
      const readiness = room.core.readiness.bind(room.core);
      room.core.readiness = async () => {
        throw echoing();
      };
      try {
        await room.core.landing.prepare(op);
      } finally {
        room.core.readiness = readiness;
      }
    });
    expect((await record(r, op)).lastError).toBe(echoNote("readiness could not be computed"));
    await clean(r, [await opRead(r, op)]);
  });

  it("a push answered with the remote's text and main that cannot be read back, then a push that does not answer", async () => {
    const { r, op } = await accepted();
    await ready(r, op);
    const stub = r.world.artifacts.stub;
    const push = stub.push;
    stub.push = async () => ({ outcome: "rejected", reason: "remote-rejected", detail: `remote: artifacts_git_receive_pack_object_too_large\n${echoing().message}` });
    await inDO(r, async (room) => {
      const pub = (room.core.landing as unknown as { publisher: { readMain: () => Promise<string> } }).publisher;
      const readMain = pub.readMain;
      pub.readMain = async () => {
        throw echoing();
      };
      try {
        await room.core.landing.publish();
      } finally {
        pub.readMain = readMain;
      }
    });
    const first = await record(r, op);
    expect(first.pushes![0]).toMatchObject({ outcome: "rejected", detail: "push answered: rejected (remote-rejected) artifacts_git_receive_pack_object_too_large" });
    expect(first.lastError).toBe(echoNote("main could not be read"));
    expect(await inDO(r, (room) => room.core.landing.status()?.lastError)).toBe(echoNote("main could not be read"));
    await clean(r, [await opRead(r, op), await inDO(r, (room) => room.core.landing.status())]);

    stub.push = async () => {
      throw echoing();
    };
    try {
      for (let i = 0; i < 6 && (await record(r, op)).pushes!.length < 2; i++) {
        clock.now += 600_000;
        await inDO(r, (room) => room.core.landing.publish());
      }
    } finally {
      stub.push = push;
    }
    expect((await record(r, op)).pushes![1]).toMatchObject({ outcome: "unknown", detail: echoNote("push did not answer") });
    await clean(r, [await opRead(r, op), await inDO(r, (room) => room.core.landing.status())]);
  });
});

describe("request d29c09fa: a failed log publication stores and names a known code only", () => {
  for (const [what, fields, stored] of [
    ["a code that is provider text", { code: ECHOED[0] }, "transport"],
    ["a known Artifacts code", { code: "INTERNAL_ERROR", numericCode: 10400 }, "INTERNAL_ERROR"],
  ] as const)
    it(`${what}: publication_error is "${stored}", and the caller's error names only that`, async () => {
      const r = await makeRoom();
      const thrown = await inDO(r, async (room) => {
        await room.core.idle();
        const ports = room.core.ports as unknown as { log: () => Promise<unknown> };
        const log = ports.log;
        ports.log = async () => {
          throw echoing(fields);
        };
        try {
          await room.core.publish(true);
          return null;
        } catch (e) {
          return JSON.stringify({ message: (e as Error).message, code: (e as { code?: unknown }).code });
        } finally {
          ports.log = log;
        }
      });
      expect(thrown).toContain(`(${stored})`);
      expect(await inDO(r, (room) => room.core.sql.all("SELECT v FROM meta WHERE k = 'publication_error'")[0]?.["v"])).toBe(stored);
      await clean(r, [thrown]);
    });
});

describe("request d29c09fa: rows stored with provider text before the rule, reopened", () => {
  it("on reopen no projection shows the text, before any retry; migration 2's upgrade then rewrites every legacy error field at rest in bounded batches, terminal rows included, and stops; safe values and state stay", async () => {
    const { r, op, lane } = await accepted();
    await ready(r, op);
    await inDO(r, async (room) => {
      const pub = (room.core.landing as unknown as { publisher: { readMain: () => Promise<string> } }).publisher;
      const readMain = pub.readMain;
      pub.readMain = async () => {
        throw echoing();
      };
      try {
        await room.core.landing.publish();
      } finally {
        pub.readMain = readMain;
      }
    });
    const legacy = (prefix = "") => `${prefix}${echoing().message}`;
    const later = clock.now + 24 * 3600_000;
    // Write the legacy rows directly, and put the store back at version 1, as a room stored before the rule.
    const wsOp = await inDO(r, (room) => {
      const sql = room.core.sql;
      const body = JSON.parse(String(sql.all("SELECT body FROM artroom_land_op WHERE id = ?", op)[0]!["body"]));
      body.lastError = legacy("main could not be read: ");
      body.pushes[0].detail = legacy();
      sql.all("UPDATE artroom_land_op SET body = ? WHERE id = ?", JSON.stringify(body), op);
      void room.core.workspaces; // its tables
      void (room.core as unknown as { snapshotRepos: unknown }).snapshotRepos;
      const failed = JSON.stringify({ name: "ArtroomError", code: "internal", message: legacy("Could not provision the workspace: "), retryable: true });
      const row = sql.all("SELECT lease FROM artroom_ws WHERE lane = ?", lane)[0];
      const lease = row ? Number(row["lease"]) : 1;
      if (row) sql.all("UPDATE artroom_ws SET state = 'failed', error = ? WHERE lane = ?", failed, lane);
      else
        sql.all(
          "INSERT INTO artroom_ws (lane, lease, state, fork, lease_expires_at, error, updated_at) VALUES (?, ?, 'failed', ?, ?, ?, ?)",
          lane,
          lease,
          `canon--${lane}`,
          later,
          failed,
          clock.now,
        );
      sql.all("INSERT INTO artroom_ws_duty (fork, kind, reason, state, started_at, next_at, last_error, done_at, done_reason) VALUES ('f', 'token', 'legacy', 'done', ?, ?, ?, ?, 'revoked')", clock.now, later, legacy(), clock.now);
      sql.all("INSERT INTO artroom_snap_duty (snapshot, name, kind, reason, state, next_at, last_error, done_at, done_reason) VALUES ('s', 'n', 'delete', 'legacy', 'done', ?, ?, ?, 'deleted')", later, legacy(), clock.now);
      const tokens: [string, string][] = [
        ["mint:job_legacy_1", legacy("answer lost: ")],
        ["mint:job_legacy_2", legacy("outcome unknown; the token inventory could not be read: ")],
        ["tid_legacy_revoke", legacy()],
        ["tid_legacy_held", "held"],
        ["mint:job_safe_1", "answer lost: create failed: Error INTERNAL_ERROR (10400)"],
        ["mint:job_safe_2", "outcome unknown; 0 live token(s) on the canonical repository not accounted for at 2026-10-01T12:00:00.000Z"],
      ];
      for (const [id, e] of tokens) sql.all("INSERT INTO job_tokens (token_id, expires_at, next_ms, last_error) VALUES (?, ?, ?, ?)", id, later, later, e);
      sql.all("INSERT INTO meta (k, v) VALUES ('publication_error', ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v", ECHOED[0]!);
      sql.all("UPDATE schema_version SET v = 1 WHERE id = 1");
      // A room stored before mint lane C too: its `mint:` rows have not moved into the mint ledger yet.
      sql.all("DELETE FROM meta WHERE k = 'job_mints_moved'");
      return `op_ws_${lane}_${lease}`;
    });

    // Reopen the object: a fresh stub after an abort. Nothing else runs before the reads.
    await inDO(r, (_room, state: DurableObjectState) => state.abort("restart")).catch(() => undefined);
    const stub = env.ROOMS.get(env.ROOMS.idFromName(r.id)) as unknown as TestRoom["stub"];
    const again: TestRoom = { ...r, stub, admin: new Client({ id: r.id, stub }, r.admin.keys) };

    const shown = await inDO(again, (room) => ({ status: room.core.landing.status(), duties: jobTokenDuties(room.core), mints: room.core.mints.duties({ limit: 1000 }).records }));
    expect(shown.status?.lastError).toBe(`main could not be read: ${WITHHELD}`);
    const wsView = (await again.admin.read({ q: "op", op: wsOp as never })) as { state: string; error: { message: string } };
    expect(wsView.error.message).toBe(`could not provision the workspace: ${WITHHELD}`);
    expect(Object.fromEntries(shown.duties.map((d) => [d.token, d.status]))).toEqual({
      tid_legacy_revoke: `revocation failed: ${WITHHELD}`,
      tid_legacy_held: "held",
    });
    // Mint lane C: the `mint:` rows moved into the mint ledger at the start, as unknown records with a fixed note; no
    // row's text came with them.
    expect(shown.mints.map((x) => [x.purpose, x.state, x.lastError])).toEqual(
      ["job:job_legacy_1", "job:job_legacy_2", "job:job_safe_1", "job:job_safe_2"].map((p) => [p, "unknown", "moved from the check job's own mint record; sent before this time, with its answer lost"]),
    );
    // Before the upgrade's first batch, a row may still hold the text; nothing shown does.
    await clean(again, [shown, wsView], { rows: false });

    // Migration 2 only started the upgrade: its cursor is stored, and the alarm is due now while it lasts.
    const started = await inDO(again, (room) => ({
      cursor: room.core.sql.all("SELECT v FROM meta WHERE k = 'error_scrub'")[0]?.["v"],
      due: room.core.nextAlarm()! <= room.core.now(),
      tokens: room.core.sql.all("SELECT token_id, expires_at, next_ms, attempts FROM job_tokens ORDER BY token_id"),
    }));
    expect(started.cursor).toBe(JSON.stringify({ table: 0, after: null }));
    expect(started.due).toBe(true);
    // One bounded batch per run, until the last deletes the cursor.
    let batches = 0;
    while (await inDO(again, (room) => room.core.sql.all("SELECT 1 AS x FROM meta WHERE k = 'error_scrub'").length > 0)) {
      await inDO(again, (room) => room.core.scrubErrors());
      expect(++batches).toBeLessThan(20);
    }
    // Ownership, expiry, retry timing and kinds of the job tokens are as they were; only their errors changed.
    expect(await inDO(again, (room) => room.core.sql.all("SELECT token_id, expires_at, next_ms, attempts FROM job_tokens ORDER BY token_id"))).toEqual(started.tokens);
    expect(Object.fromEntries((await inDO(again, (room) => jobTokenDuties(room.core))).map((d) => [d.token, d.kind]))).toMatchObject({
      tid_legacy_revoke: "revoke",
      tid_legacy_held: "held",
    });
    // Done: a further run writes nothing.
    const done = await inDO(again, (room) => {
      const tables = room.core.sql.all("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'").map((x) => String(x["name"]));
      const dump = () => JSON.stringify(tables.map((t) => room.core.sql.all(`SELECT * FROM "${t}"`)));
      const before = dump();
      room.core.scrubErrors();
      return before === dump();
    });
    expect(done).toBe(true);

    // The rows themselves are rewritten, and the store is at version 4 (mint lane C's due indexes, then declared acts stage 2's columns, follow the scrub).
    const rows = await inDO(again, (room) => {
      const sql = room.core.sql;
      const body = JSON.parse(String(sql.all("SELECT body FROM artroom_land_op WHERE id = ?", op)[0]!["body"]));
      return {
        v: sql.all("SELECT v FROM schema_version")[0]!["v"],
        land: [body.lastError, body.pushes[0].detail],
        ws: JSON.parse(String(sql.all("SELECT error FROM artroom_ws WHERE lane = ?", lane)[0]!["error"])).message,
        wsDuty: sql.all("SELECT last_error FROM artroom_ws_duty WHERE reason = 'legacy'")[0]!["last_error"],
        snapDuty: sql.all("SELECT last_error FROM artroom_snap_duty WHERE reason = 'legacy'")[0]!["last_error"],
        publication: sql.all("SELECT v FROM meta WHERE k = 'publication_error'")[0]!["v"],
      };
    });
    expect(rows).toEqual({
      v: 4,
      land: [`main could not be read: ${WITHHELD}`, `landing step failed: ${WITHHELD}`],
      ws: `could not provision the workspace: ${WITHHELD}`,
      wsDuty: `workspace step failed: ${WITHHELD}`,
      snapDuty: `snapshot step failed: ${WITHHELD}`,
      publication: "transport",
    });
    await clean(again, [shown, wsView]);
  });
});

describe("request d29c09fa: the operators' job-token view shows safe metadata only, whatever a row holds", () => {
  it("a row holding provider text after the migration is shown withheld; safe values as they are", async () => {
    const r = await makeRoom();
    const later = clock.now + 24 * 3600_000;
    const duties = await inDO(r, (room) => {
      const sql = room.core.sql;
      sql.all("INSERT INTO job_tokens (token_id, expires_at, next_ms, last_error) VALUES ('tid_x', ?, ?, ?)", later, later, `${echoing().message}`);
      sql.all("INSERT INTO job_tokens (token_id, expires_at, next_ms, last_error) VALUES ('tid_y', ?, ?, 'held')", later, later);
      return jobTokenDuties(room.core);
    });
    expect(Object.fromEntries(duties.map((d) => [d.token, [d.kind, d.status]]))).toEqual({
      tid_x: ["revoke", `revocation failed: ${WITHHELD}`],
      tid_y: ["held", "held"],
    });
    for (const s of ECHOED) expect(JSON.stringify(duties)).not.toContain(s);
  });
});

describe("request d29c09fa: in a founded room the upgrade drains through recovery and alarms alone, also while the canonical repository is gone", () => {
  for (const gone of [false, true])
    it(gone ? "canonical repository gone" : "a founded room", async () => {
      const r = await makeRoom();
      const later = clock.now + 24 * 3600_000;
      const text = echoing().message;
      await inDO(r, async (room, state) => {
        await room.core.idle();
        const sql = room.core.sql;
        void room.core.workspaces; // its tables
        void (room.core as unknown as { snapshotRepos: unknown }).snapshotRepos;
        sql.all("INSERT INTO artroom_ws_duty (fork, kind, reason, state, started_at, next_at, last_error, done_at, done_reason) VALUES ('f', 'token', 'legacy', 'done', ?, ?, ?, ?, 'revoked')", clock.now, later, text, clock.now);
        sql.all("INSERT INTO artroom_snap_duty (snapshot, name, kind, reason, state, next_at, last_error, done_at, done_reason) VALUES ('s', 'n', 'delete', 'legacy', 'done', ?, ?, ?, 'deleted')", later, text, clock.now);
        sql.all("INSERT INTO job_tokens (token_id, expires_at, next_ms, last_error) VALUES ('tid_legacy', ?, ?, ?)", later, later, text);
        if (gone) sql.all("INSERT INTO meta (k, v) VALUES ('canonical_gone', ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v", JSON.stringify({ since: new Date(clock.now).toISOString(), head: 0 }));
        sql.all("UPDATE schema_version SET v = 1 WHERE id = 1");
        await state.storage.deleteAlarm();
      });
      await inDO(r, (_room, state) => state.abort("legacy upgrade")).catch(() => undefined);
      const stub = env.ROOMS.get(env.ROOMS.idFromName(r.id)) as unknown as TestRoom["stub"];
      const again: TestRoom = { ...r, stub, admin: new Client({ id: r.id, stub }, r.admin.keys) };
      const before = await inDO(again, async (room, state) => ({ cursor: room.core.sql.all("SELECT v FROM meta WHERE k = 'error_scrub'").length, alarm: await state.storage.getAlarm() }));
      expect(before.cursor).toBe(1);
      expect(before.alarm).not.toBeNull();
      // Only alarms: no direct call to scrubErrors.
      for (let i = 0; i < 10; i++) if (!(await runDurableObjectAlarm(again.stub as unknown as DurableObjectStub<Room>))) break;
      const after = await inDO(again, (room) => ({
        cursor: room.core.sql.all("SELECT v FROM meta WHERE k = 'error_scrub'").length,
        // Mint lane C: the composed chain ran from version 1, the due indexes at 3.
        v: room.core.sql.all("SELECT v FROM schema_version WHERE id = 1")[0]!["v"],
        indexes: room.core.sql.all("SELECT name FROM sqlite_master WHERE type = 'index' AND name IN ('job_tokens_due', 'check_jobs_due') ORDER BY name").map((x) => x["name"]),
        gone: room.core.canonicalGone() !== null,
        rows: [
          room.core.sql.all("SELECT last_error FROM artroom_ws_duty WHERE reason = 'legacy'")[0]!["last_error"],
          room.core.sql.all("SELECT last_error FROM artroom_snap_duty WHERE reason = 'legacy'")[0]!["last_error"],
          room.core.sql.all("SELECT last_error FROM job_tokens WHERE token_id = 'tid_legacy'")[0]!["last_error"],
        ],
      }));
      expect(after).toEqual({
        cursor: 0,
        v: 4,
        indexes: ["check_jobs_due", "job_tokens_due"],
        gone,
        rows: [`workspace step failed: ${WITHHELD}`, `snapshot step failed: ${WITHHELD}`, `revocation failed: ${WITHHELD}`],
      });
      await clean(again);
    });
});
