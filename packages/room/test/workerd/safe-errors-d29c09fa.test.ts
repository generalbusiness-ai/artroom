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
import { runInDurableObject } from "cloudflare:test";
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
async function clean(r: TestRoom, extra: unknown[] = []): Promise<void> {
  const rows = await inDO(r, (room) => {
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
    ["no code", {}, "transport"],
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
  it("migration 2 rewrites every legacy error field at rest when the object opens, before any retry, and no projection shows the text; safe values stay", async () => {
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
      ];
      for (const [id, e] of tokens) sql.all("INSERT INTO job_tokens (token_id, expires_at, next_ms, last_error) VALUES (?, ?, ?, ?)", id, later, later, e);
      sql.all("INSERT INTO meta (k, v) VALUES ('publication_error', ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v", ECHOED[0]!);
      sql.all("UPDATE schema_version SET v = 1 WHERE id = 1");
      return `op_ws_${lane}_${lease}`;
    });

    // Reopen the object: a fresh stub after an abort. Nothing else runs before the reads.
    await inDO(r, (_room, state: DurableObjectState) => state.abort("restart")).catch(() => undefined);
    const stub = env.ROOMS.get(env.ROOMS.idFromName(r.id)) as unknown as TestRoom["stub"];
    const again: TestRoom = { ...r, stub, admin: new Client({ id: r.id, stub }, r.admin.keys) };

    const shown = await inDO(again, (room) => ({ status: room.core.landing.status(), duties: jobTokenDuties(room.core) }));
    expect(shown.status?.lastError).toBe(`main could not be read: ${WITHHELD}`);
    const wsView = (await again.admin.read({ q: "op", op: wsOp as never })) as { state: string; error: { message: string } };
    expect(wsView.error.message).toBe(`could not provision the workspace: ${WITHHELD}`);
    expect(Object.fromEntries(shown.duties.map((d) => [d.token, d.status]))).toMatchObject({
      "mint:job_legacy_1": `answer lost: create failed: ${WITHHELD}`,
      "mint:job_legacy_2": `outcome unknown; the token inventory could not be read: ${WITHHELD}`,
      tid_legacy_revoke: `revocation failed: ${WITHHELD}`,
      tid_legacy_held: "held",
      "mint:job_safe_1": "answer lost: create failed: Error INTERNAL_ERROR (10400)",
    });

    // The rows themselves are rewritten, and the store is at version 2.
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
      v: 2,
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
      sql.all("INSERT INTO job_tokens (token_id, expires_at, next_ms, last_error) VALUES ('mint:job_x_1', ?, ?, ?)", later, later, `answer lost: ${echoing().message}`);
      sql.all("INSERT INTO job_tokens (token_id, expires_at, next_ms, last_error) VALUES ('tid_y', ?, ?, 'held')", later, later);
      return jobTokenDuties(room.core);
    });
    expect(Object.fromEntries(duties.map((d) => [d.token, [d.kind, d.status]]))).toEqual({
      tid_x: ["revoke", `revocation failed: ${WITHHELD}`],
      "mint:job_x_1": ["unknown-mint", `answer lost: create failed: ${WITHHELD}`],
      tid_y: ["held", "held"],
    });
    for (const s of ECHOED) expect(JSON.stringify(duties)).not.toContain(s);
  });
});
