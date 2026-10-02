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
import { runInDurableObject } from "cloudflare:test";
import type { Claim, Landing, OpId } from "@generalbusiness/artroom-contract";
import type { LandRecord } from "@generalbusiness/artroom-git";
import type { Room } from "../../src/index.ts";
import { clock, makeRoom, pushChange, type TestRoom } from "./support.ts";

const inDO = <T>(r: TestRoom, fn: (room: Room) => T | Promise<T>) => runInDurableObject(r.stub as unknown as DurableObjectStub<Room>, fn);

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
