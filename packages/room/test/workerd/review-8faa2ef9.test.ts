/**
 * Review 8faa2ef9. The checker's diagnostics asserted the defective outcomes;
 * each test here asserts the correct one, with the further cases the review
 * asked for.
 */

import { describe, expect, it } from "vitest";
import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import type {
  Claim,
  LogEntry,
  Proposal,
  Refusal,
  RosterRecord,
  Update,
} from "@generalbusiness/artroom-contract";
import {
  policy,
  requireCheck,
  requireReview,
} from "@generalbusiness/artroom-policy/helpers";
import { digestJson } from "../../src/crypto.ts";
import type { Room } from "../../src/index.ts";
import { createSchema } from "../../src/store.ts";
import { cursor } from "../../src/reads.ts";
import { MemoryLogPublisher } from "../../src/memory/log.ts";
import { delegableBy } from "../../src/roster.ts";
import {
  addMember,
  advance,
  call,
  clock,
  Client,
  day,
  expectOk,
  expectRefusal,
  failure,
  iso,
  makeRoom,
  newKeyPair,
  pushChange,
  tick,
  type TestRoom,
} from "./support.ts";

const inside = <T>(r: TestRoom, fn: (room: Room) => T | Promise<T>) =>
  runInDurableObject(r.stub as unknown as DurableObjectStub<Room>, fn);
const entries = async (r: TestRoom): Promise<LogEntry[]> => [
  ...(await r.admin.read({ q: "log", req: { limit: 500 } })).acts,
];

// ------------------------------------------------------------------ 1. P1

describe("1. recovery accepts only the confirmed parent or the exact pending commit (R-LOG-8)", () => {
  async function lostReplies(r: TestRoom) {
    await r.admin.ok("claim", null, { goal: "g", scope: ["src/**"] });
    r.world.log.faults.lostPushReply = 1;
    r.world.log.faults.lostReadReply = 1;
    expect((await failure(r.stub.publishLog())).code).toBe("unavailable");
    return r.world.log.ref!;
  }

  for (const changed of ["checkpoint", "retained", "parent"] as const) {
    it(`a foreign commit with identical entry lines but a different ${changed} is refused; nothing advances; the ref is never forced`, async () => {
      const r = await makeRoom();
      const own = await lostReplies(r);
      const original = r.world.log.commits.get(own)!;
      const files: Record<string, string> = { ...original.files };
      if (changed === "checkpoint") {
        const cp = JSON.parse(
          files["artroom-log/v1/checkpoint.json"]!,
        ) as Record<string, unknown>;
        files["artroom-log/v1/checkpoint.json"] = JSON.stringify({
          ...cp,
          sig: "invalid-signature",
        });
      }
      if (changed === "retained")
        files[`artroom-log/v1/inputs/${"0".repeat(64)}.json`] = "{}";
      const foreign = "f".repeat(40) as never;
      r.world.log.commits.set(foreign, {
        ...original,
        files,
        parent:
          changed === "parent" ? ("e".repeat(40) as never) : original.parent,
      });
      r.world.log.ref = foreign;
      expect((await failure(r.stub.publishLog())).code).toBe("unavailable");
      expect((await r.admin.read({ q: "log" })).publishedThrough).toBe(-1);
      expect(r.world.log.ref).toBe(foreign);
      const pending = await inside(r, (room) => room.core.pendingPublication());
      expect(pending?.expected).toBe(own);
      // After a restart too.
      await evictDurableObject(r.stub);
      expect((await failure(r.stub.publishLog())).code).toBe("unavailable");
      expect((await r.admin.read({ q: "log" })).publishedThrough).toBe(-1);
      expect(events(await entries(r), "checkpoint")).toEqual([]);
    });
  }

  it("a publisher whose confirmed commit is not the expected one is not sealed (its serialization must match commitFor)", async () => {
    const r = await makeRoom();
    await r.admin.ok("claim", null, { goal: "g", scope: ["src/**"] });
    const real = MemoryLogPublisher.prototype.commitFor;
    MemoryLogPublisher.prototype.commitFor = () => "d".repeat(40) as never;
    try {
      expect((await failure(r.stub.publishLog())).code).toBe("unavailable");
    } finally {
      MemoryLogPublisher.prototype.commitFor = real;
    }
    expect((await r.admin.read({ q: "log" })).publishedThrough).toBe(-1);
    expect(events(await entries(r), "checkpoint")).toEqual([]);
  });

  it("the exact pending commit is stored before any remote write, and lost-response recovery still confirms it, across a restart", async () => {
    const r = await makeRoom();
    const own = await lostReplies(r);
    expect(
      (await inside(r, (room) => room.core.pendingPublication()))?.expected,
    ).toBe(own);
    await evictDurableObject(r.stub);
    expect(await call(r.stub.publishLog())).toEqual({
      through: 2,
      commit: own,
    });
    expect((await r.admin.read({ q: "log" })).publishedThrough).toBe(2);
  });
});

const events = (log: LogEntry[], type: string) =>
  log.filter((e) => e.entry.type === "system" && e.entry.event.type === type);

// ------------------------------------------------------------------ 2.

describe("2. a workspace is fenced by the lease's deadline, not only its generation (R-WS-2, R-LANE-8)", () => {
  it("a lease that runs out during fork creation, with no generation change, fails the op, and the expiry is sealed", async () => {
    const r = await makeRoom();
    const c = await r.admin.ok<Claim>("claim", null, {
      goal: "g",
      scope: ["src/**"],
    });
    const id = "op_ws_2_1";
    await inside(r, (room) =>
      room.core.sql.all(
        "INSERT INTO workspaces (id, lane, lease_gen, state, body, updated_ms) VALUES (?, ?, 1, 'pending', ?, ?)",
        id,
        c.lane,
        JSON.stringify({
          id,
          kind: "workspace",
          state: "pending",
          lane: c.lane,
          updatedAt: iso(clock.now),
        }),
        clock.now,
      ),
    );
    const real = r.world.artifacts.ensureFork.bind(r.world.artifacts);
    r.world.artifacts.ensureFork = async (lane) => {
      const out = await real(lane);
      advance(1800 * 1000 + 1);
      return out;
    };
    await tick(r);
    expect(await r.admin.read({ q: "op", op: id as never })).toMatchObject({
      state: "failed",
    });
    // The expiry is sealed by the same alarm run, not left for the next one.
    expect(events(await entries(r), "lease-expired").length).toBe(1);
    await tick(r);
    expect(events(await entries(r), "lease-expired").length).toBe(1);
    expect(await r.admin.read({ q: "lane", lane: c.lane })).toMatchObject({
      state: "unheld",
      why: "expired",
    });
  });

  it("a lease already past its deadline before the resume creates no fork", async () => {
    const r = await makeRoom();
    const c = await r.admin.ok<Claim>("claim", null, {
      goal: "g",
      scope: ["src/**"],
    });
    await inside(r, (room) =>
      room.core.sql.all(
        "INSERT INTO workspaces (id, lane, lease_gen, state, body, updated_ms) VALUES ('op_ws_2_1', ?, 1, 'pending', '{}', ?)",
        c.lane,
        clock.now,
      ),
    );
    advance(1800 * 1000 + 1);
    await inside(r, (room) => room.core.resumeWorkspaces());
    expect(r.world.artifacts.calls.get("ensureFork") ?? 0).toBe(0);
  });
});

// ------------------------------------------------------------------ 3.

describe("3. attention made later at an existing head reaches issued live cursors (R-API-8)", () => {
  it("the admins' publication-unresolved item arrives on a cursor issued before it, once, and wakes a waiting poll", async () => {
    const r = await makeRoom();
    await r.admin.ok("claim", null, { goal: "g", scope: ["src/**"] });
    const token = await r.admin.session();
    const start = await call<Update>(r.stub.poll(token, undefined, 0));
    r.world.log.foreignWrite();
    const waiting = call<Update>(r.stub.poll(token, start.cursor, 5_000));
    expect((await failure(r.stub.publishLog())).code).toBe("unavailable");
    const t0 = Date.now();
    const woke = await waiting;
    // Woken by the item, not by the poll's own timeout.
    expect(Date.now() - t0).toBeLessThan(4_000);
    expect(woke.attention).toContainEqual(
      expect.objectContaining({ why: "publication-unresolved" }),
    );
    const again = await call<Update>(r.stub.poll(token, woke.cursor, 0));
    expect(again.attention).toEqual([]);
    await r.admin.ok("claim", null, { goal: "later", scope: ["docs/**"] });
    const later = await call<Update>(r.stub.poll(token, woke.cursor, 0));
    expect(
      later.attention.filter((a) => a.why === "publication-unresolved"),
    ).toEqual([]);
  });

  it("pages stay lossless: an item made later at an old seq comes after the page cursor", async () => {
    const r = await makeRoom({
      policy: policy(
        requireReview({ id: "a", paths: "src/**", from: "role:admin" }),
      ),
    });
    const c = await r.admin.ok<Claim>("claim", null, {
      goal: "g",
      scope: ["src/**"],
    });
    await r.admin.ok(
      "propose",
      { lane: c.lane },
      {
        lease: 1,
        expectedGeneration: 0,
        head: pushChange(r, c.lane, { "src/x.ts": "1" }),
        summary: "s",
      },
    );
    const token = await r.admin.session();
    const first = await call<{ items: { id: string }[]; cursor: string }>(
      r.stub.read(token, { q: "attention", page: { limit: 100 } }),
    );
    r.world.log.foreignWrite();
    await failure(r.stub.publishLog());
    const next = await call<{ items: { why: string }[] }>(
      r.stub.read(token, {
        q: "attention",
        page: { cursor: first.cursor as never },
      }),
    );
    expect(next.items.map((i) => i.why)).toEqual(["publication-unresolved"]);
  });

  it("an RPC subscription opened at the live head receives the item made later at that head", async () => {
    const r = await makeRoom();
    await r.admin.ok("claim", null, { goal: "g", scope: ["src/**"] });
    const token = await r.admin.session();
    const reader = (
      (await r.stub.subscribe(token)) as ReadableStream<Uint8Array>
    ).getReader();
    r.world.log.foreignWrite();
    expect((await failure(r.stub.publishLog())).code).toBe("unavailable");
    const { value } = await reader.read();
    const u = JSON.parse(
      new TextDecoder().decode(value).trim().split("\n")[0]!,
    ) as Update;
    expect(u.entries).toEqual([]);
    expect(u.attention.map((a) => a.why)).toEqual(["publication-unresolved"]);
    await reader.cancel();
  });

  it("cursors in the earlier (seq, n) form still read, and skip nothing after their point", async () => {
    const r = await makeRoom();
    const bob = await addMember(r, "@bob", "member");
    const c = await r.admin.ok<Claim>("claim", null, {
      goal: "g",
      scope: ["src/**"],
    });
    const token = await r.admin.session();
    const h0 = c.seq;
    const legacyUpdates = cursor("updates", h0, {
      as: h0,
      an: Number.MAX_SAFE_INTEGER,
    });
    const legacyPage = cursor("attention", h0, { i: Number.MAX_SAFE_INTEGER });
    // A: a new entry after the cursor. B: made later, about an entry before it.
    await bob.ok("note", { act: c.id }, { text: "for the holder" });
    await inside(r, (room) =>
      room.core.attend(
        "role:admin",
        0,
        null,
        { why: "note" },
        "made later about seq 0",
      ),
    );
    const update = await call<Update>(r.stub.poll(token, legacyUpdates, 0));
    expect(update.attention.map((a) => a.seq)).toEqual([h0 + 1, 0]);
    const page = await call<{ items: { seq: number }[] }>(
      r.stub.read(token, { q: "attention", page: { cursor: legacyPage } }),
    );
    expect(page.items.map((a) => a.seq)).toEqual([h0 + 1, 0]);
  });
});

// ------------------------------------------------------------------ 4.

describe("4. a review that reopens an obligation seals the reopening", () => {
  it("Bob approves, then objects: the objection's receipt says the obligation opened", async () => {
    const r = await makeRoom({
      policy: policy(
        requireReview({ id: "one", paths: "src/**", from: "@bob" }),
      ),
    });
    const bob = await addMember(r, "@bob", "maintainer");
    const c = await r.admin.ok<Claim>("claim", null, {
      goal: "g",
      scope: ["src/**"],
    });
    const head = pushChange(r, c.lane, { "src/app.ts": "v2" });
    await r.admin.ok<Proposal>(
      "propose",
      { lane: c.lane },
      { lease: 1, expectedGeneration: 0, head, summary: "s" },
    );
    await bob.ok(
      "review",
      { lane: c.lane, generation: 1 },
      { head, verdict: "approve", scope: ["src/**"], text: "yes" },
    );
    const objected = await bob.ok(
      "review",
      { lane: c.lane, generation: 1 },
      { head, verdict: "object", scope: ["src/**"], text: "changed my mind" },
    );
    const entry = (await entries(r)).find((e) => e.seq === objected.seq)!;
    expect(
      (entry.entry as unknown as { receipt: { effects: unknown[] } }).receipt
        .effects,
    ).toEqual([
      {
        type: "obligations",
        lane: c.lane,
        generation: 1,
        opened: ["obl_one"],
        met: [],
      },
    ]);
    expect(
      (await r.admin.read({
        q: "proposal",
        ref: { lane: c.lane, generation: 1 },
      }))!.obligations[0]!.state,
    ).toBe("open");
  });
});

describe("4. checks use the same effect calculator", () => {
  it("@ci passes, then fails on the same input: a check only adds evidence, so the pass keeps the obligation met and the failure seals no transition", async () => {
    const unit = {
      format: "artroom-checker-v1",
      volatile: false,
      timeoutSeconds: 60,
    };
    const r = await makeRoom({
      policy: policy(
        requireCheck("unit", { paths: "src/**", by: "@ci", id: "unit-tests" }),
      ),
      files: { ".artroom/checkers/unit.json": JSON.stringify(unit) },
    });
    const ci = await addMember(r, "@ci", "checker");
    const c = await r.admin.ok<Claim>("claim", null, {
      goal: "g",
      scope: ["src/**"],
    });
    const head = pushChange(r, c.lane, { "src/app.ts": "v2" });
    await r.admin.ok(
      "propose",
      { lane: c.lane },
      { lease: 1, expectedGeneration: 0, head, summary: "s" },
    );
    await tick(r);
    const p = (await r.admin.read({
      q: "proposal",
      ref: { lane: c.lane, generation: 1 },
    }))!;
    if (p.preview.state !== "clean") throw new Error("preview not clean");
    const integration = p.preview.integration;
    const tree = r.world.artifacts.commits.get(integration)!.tree;
    const body = {
      obligation: "obl_unit-tests",
      check: "unit",
      integration,
      input: { kind: "tree", tree },
      config: digestJson(unit),
      runner: `sha256:${"0".repeat(64)}`,
      volatile: false,
      ok: true,
      detail: "42 passed",
    };
    const passed = await ci.ok("check", { lane: c.lane, generation: 1 }, body);
    const failed = await ci.ok(
      "check",
      { lane: c.lane, generation: 1 },
      { ...body, ok: false, detail: "1 failed" },
    );
    const effects = (seq: number) =>
      entries(r).then(
        (l) =>
          (
            l.find((e) => e.seq === seq)!.entry as unknown as {
              receipt: { effects: unknown[] };
            }
          ).receipt.effects,
      );
    expect(await effects(passed.seq)).toEqual([
      {
        type: "obligations",
        lane: c.lane,
        generation: 1,
        opened: [],
        met: ["obl_unit-tests"],
      },
    ]);
    expect(
      (await r.admin.read({
        q: "proposal",
        ref: { lane: c.lane, generation: 1 },
      }))!.obligations[0]!.state,
    ).toBe("met");
    expect(await effects(failed.seq)).toEqual([]);
  });
});

// ------------------------------------------------------------------ 5.

describe("5. durable storage upgrades through versioned migrations", () => {
  // a5a3406a: attention without n or pos, workspaces without attempts. fa836d61: attention with n, no pos.
  // Neither had a schema_version table.
  for (const shape of ["a5a3406a", "fa836d61"] as const) {
    it(`a populated store in the ${shape} schema reopens, twice: attention order kept, a pending workspace keeps going, earlier self-reviews stay ineligible, '*' grants are fixed`, async () => {
      const r = await makeRoom({
        policy: policy(
          requireReview({ id: "rv", paths: "src/**", from: "role:admin" }),
          requireReview({ id: "two", paths: "src/**", from: "role:admin" }),
        ),
      });
      const bob = await addMember(r, "@bob", "member");
      const grant = await bob.ok<RosterRecord>("roster", null, {
        op: "delegate",
        to: newKeyPair().key,
        kinds: "*",
        lanes: "*",
        expiresAt: iso(clock.now + day),
      });
      const c = await r.admin.ok<Claim>("claim", null, {
        goal: "g",
        scope: ["src/**"],
      });
      // Items at entries below and above seq 10, so an order by ID text differs from (seq, n).
      for (let i = 0; i < 8; i++)
        await bob.ok("note", { act: c.id }, { text: `note ${i}` });
      const head = pushChange(r, c.lane, { "src/app.ts": "v2" });
      await r.admin.ok(
        "propose",
        { lane: c.lane },
        { lease: 1, expectedGeneration: 0, head, summary: "s" },
      );
      const token = await r.admin.session();
      const before = (
        await call<{ items: { id: string }[] }>(
          r.stub.read(token, { q: "attention", page: { limit: 500 } }),
        )
      ).items.map((i) => i.id);
      expect(before.length).toBeGreaterThan(1);
      await inside(r, (room) => {
        const sql = room.core.sql;
        const n = shape === "fa836d61";
        sql.all("CREATE TABLE attention_old AS SELECT * FROM attention");
        sql.all("DROP TABLE attention");
        sql.all(
          `CREATE TABLE attention (id TEXT PRIMARY KEY, seq INTEGER NOT NULL, ${n ? "n INTEGER NOT NULL DEFAULT 0, " : ""}principal TEXT NOT NULL, lane TEXT, item TEXT NOT NULL, open INTEGER NOT NULL)`,
        );
        sql.all(
          `INSERT INTO attention (id, seq, ${n ? "n, " : ""}principal, lane, item, open) SELECT id, seq, ${n ? "n, " : ""}principal, lane, item, open FROM attention_old`,
        );
        sql.all("DROP TABLE attention_old");
        sql.all("DROP TABLE workspaces");
        sql.all(
          `CREATE TABLE workspaces (id TEXT PRIMARY KEY, lane TEXT NOT NULL, lease_gen INTEGER NOT NULL, state TEXT NOT NULL, body TEXT NOT NULL, updated_ms INTEGER NOT NULL${n ? ", attempts INTEGER NOT NULL DEFAULT 0" : ""})`,
        );
        sql.all(
          "INSERT INTO workspaces (id, lane, lease_gen, state, body, updated_ms) VALUES ('op_ws_2_1', ?, 1, 'pending', '{}', ?)",
          c.lane,
          clock.now,
        );
        // An earlier self-review by the proposer, recorded before admission facts existed.
        sql.all(
          "INSERT INTO evidence (act, seq, kind, lane, generation, head, member, key, grantor, verdict, qualifies, flags, body) VALUES ('act_999_aaaaaaaa', 999, 'review', ?, 1, ?, '@admin', ?, NULL, 'approve', '[\"obl_rv\"]', '[]', ?)",
          c.lane,
          head,
          r.admin.key,
          JSON.stringify({
            authority: {
              via: "member",
              member: "@admin",
              role: "admin",
              key: r.admin.key,
            },
            body: {
              head,
              verdict: "approve",
              scope: ["src/**"],
              text: "legacy",
            },
          }),
        );
        // An earlier "*" grant, stored as "*".
        sql.all(
          "UPDATE delegations SET kinds = '\"*\"' WHERE id = ?",
          grant.id,
        );
        sql.all("DROP TABLE schema_version");
        createSchema(sql);
        createSchema(sql);
      });
      await evictDurableObject(r.stub);
      const after = (
        await call<{ items: { id: string }[] }>(
          r.stub.read(token, { q: "attention", page: { limit: 500 } }),
        )
      ).items.map((i) => i.id);
      expect(after).toEqual(before);
      const migrated = await inside(r, (room) => ({
        admission: JSON.parse(
          room.core.sql.all(
            "SELECT body FROM evidence WHERE act = 'act_999_aaaaaaaa'",
          )[0]!["body"] as string,
        ).admission,
        attempts: room.core.sql.all(
          "SELECT attempts FROM workspaces WHERE id = 'op_ws_2_1'",
        )[0]!["attempts"],
        kinds: JSON.parse(
          room.core.sql.all(
            "SELECT kinds FROM delegations WHERE id = ?",
            grant.id,
          )[0]!["kinds"] as string,
        ),
        version: room.core.sql.all("SELECT v FROM schema_version")[0]!["v"],
      }));
      expect(migrated).toEqual({
        admission: { teams: [], author: true },
        attempts: 0,
        kinds: delegableBy("member"),
        version: 5,
      });
      expect(
        (await r.admin.read({
          q: "proposal",
          ref: { lane: c.lane, generation: 1 },
        }))!.obligations.find((o) => o.id === "obl_rv")!.state,
      ).toBe("open");
      await tick(r);
      expect(
        await r.admin.read({ q: "op", op: "op_ws_2_1" as never }),
      ).toMatchObject({ state: "ready" });
      // New items are placed after the migrated ones.
      r.world.log.foreignWrite();
      await failure(r.stub.publishLog());
      const latest = (
        await call<{ items: { id: string }[] }>(
          r.stub.read(token, { q: "attention", page: { limit: 500 } }),
        )
      ).items.map((i) => i.id);
      expect(latest.slice(0, after.length)).toEqual(after);
      expect(latest.length).toBe(after.length + 1);
    });
  }

  it("a store without admission facts is judged as an author, which never adds eligibility", async () => {
    const r = await makeRoom({
      policy: policy(
        requireReview({ id: "rv", paths: "src/**", from: "role:maintainer" }),
      ),
    });
    const bob = await addMember(r, "@bob", "maintainer");
    const c = await r.admin.ok<Claim>("claim", null, {
      goal: "g",
      scope: ["src/**"],
    });
    const head = pushChange(r, c.lane, { "src/app.ts": "v2" });
    await r.admin.ok(
      "propose",
      { lane: c.lane },
      { lease: 1, expectedGeneration: 0, head, summary: "s" },
    );
    const review = await bob.ok(
      "review",
      { lane: c.lane, generation: 1 },
      { head, verdict: "approve", scope: ["src/**"], text: "ok" },
    );
    await inside(r, (room) => {
      const row = room.core.sql.all(
        "SELECT body FROM evidence WHERE act = ?",
        review.id,
      )[0]!;
      const { admission, ...rest } = JSON.parse(row["body"] as string) as {
        admission: unknown;
      };
      void admission;
      room.core.sql.all(
        "UPDATE evidence SET body = ? WHERE act = ?",
        JSON.stringify(rest),
        review.id,
      );
    });
    expect(
      (await r.admin.read({
        q: "proposal",
        ref: { lane: c.lane, generation: 1 },
      }))!.obligations[0]!.state,
    ).toBe("open");
  });
});

// ------------------------------------------------------------------ "*"

describe("'*' is fixed at the grant (R-ADM-5, R-LOG-10)", () => {
  it("a member grants '*', then is promoted to admin: the delegation still covers only a member's kinds", async () => {
    const r = await makeRoom();
    const bob = await addMember(r, "@bob", "member");
    const k = newKeyPair();
    const grant = await bob.ok<RosterRecord>("roster", null, {
      op: "delegate",
      to: k.key,
      kinds: "*",
      lanes: "*",
      expiresAt: iso(clock.now + day),
    });
    expect(
      (await r.admin.read({ q: "members" })).delegations.find(
        (d) => d.id === grant.id,
      )!.kinds,
    ).toEqual(delegableBy("member"));
    await r.admin.ok("roster", null, {
      op: "set-role",
      member: "@bob",
      role: "admin",
    });
    const d = new Client(r, k, grant.id);
    expectOk(await d.act("claim", null, { goal: "g", scope: ["src/**"] }));
    const check = await d.act(
      "check",
      { lane: "act_1_00000000", generation: 1 },
      {
        obligation: "obl_x",
        check: "unit",
        integration: "a".repeat(40),
        input: { kind: "tree", tree: "b".repeat(40) },
        config: `sha256:${"0".repeat(64)}`,
        runner: `sha256:${"0".repeat(64)}`,
        volatile: false,
        ok: true,
        detail: "x",
      },
    );
    expectRefusal(check as Refusal, "delegation-invalid");
  });
});
