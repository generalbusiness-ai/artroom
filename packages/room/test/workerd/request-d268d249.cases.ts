/**
 * Request d268d249: pre-admission failures are diagnosable.
 *
 * A failure in the reads before admission is still `unavailable` with the
 * same fixed message, records nothing and is retried with the same
 * idempotency key, as before. The room now also logs one diagnosis that
 * names the step and the error's name, with the message redacted and
 * bounded (src/diag.ts). The other catch-all 5xx mappings on the act paths
 * log the same way.
 */

import { describe, expect, it, vi } from "vitest";
import { env, exports } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import type { CheckerConfig, Claim, DraftedRoom, Genesis, LogEntry, Proposal, RoomId } from "@generalbusiness/artroom-contract";
import { policy, requireCheck } from "@generalbusiness/artroom-policy/helpers";
import type { Registry, Room, RoomEnv } from "../../src/index.ts";
import type { Diagnosis } from "../../src/diag.ts";
import { jobTokenDuties } from "../../src/jobs.ts";
import { route } from "../../src/http.ts";
import { mcpEndpoint } from "../../src/mcp.ts";
import { roomIdOf } from "../../src/ids.ts";
import { hex } from "../../src/crypto.ts";
import { addMember, call, Client, clock, expectOk, failure, grant, makeRoom, newKeyPair, placeRepo, pushChange, randomBytes, sign, tick, worldFor, type TestRoom } from "./support.ts";
import type { PortMethod } from "./support.ts";

const UNAVAILABLE = "The repository could not be read. Nothing was recorded; retry with the same idempotency key.";
const INTERNAL = "The room failed while handling this request. Nothing was recorded; retry with the same idempotency key.";

/**
 * An error carrying every kind of credential the redaction must remove. The
 * samples are assembled at runtime, so the source holds no credential-shaped
 * literal (push protection scans it).
 */
const join = (...parts: string[]) => parts.join("");
const TOKEN = join("art_", "v1_", "0123456789abcdef", "ABCDEF0123456789abcdef");
const JWT = join("eyJ", "hbGciOiJIUzI1NiJ9", ".eyJ", "zdWIiOiIxMjM0NTY3ODkwIn0", ".c2lnbmF0dXJl", "LXZhbHVl");
const SECRETS = [TOKEN, "expires=1790000000", "hunter2pass", "sig=QWERTYUIOPasdfghjkl", JWT.slice(0, 20), join("gh", "p_"), "Zm9vYmFyYmF6cXV4"];
function leaky(): Error {
  const e = new Error(
    `git fetch https://x:hunter2pass@artifacts.example/ns/repo.git?sig=QWERTYUIOPasdfghjkl failed with ${TOKEN}?expires=1790000000; ` +
      `Authorization: Bearer Zm9vYmFyYmF6cXV4; token ${join("gh", "p_", "a".repeat(36))}; jwt ${JWT}`,
  );
  e.name = "ArtifactsError";
  return e;
}

function noSecrets(text: string): void {
  for (const s of SECRETS) expect(text).not.toContain(s);
  expect(text).not.toMatch(/\?sig=|\?expires=/);
}

const entries = async (r: TestRoom): Promise<LogEntry[]> => [...(await r.admin.read({ q: "log", req: { limit: 500 } })).acts];
const inDO = <T>(r: TestRoom, fn: (room: Room) => T | Promise<T>) => runInDurableObject(r.stub as unknown as DurableObjectStub<Room>, fn);
const logged = (r: TestRoom, event: string) => r.world.diagnoses.filter((d) => d.event === event);

/**
 * Submit `signed` with `method` failing once (optionally with `error`):
 * the client gets exactly the old 503, nothing is recorded, one diagnosis
 * names `step`, and the same signed act succeeds or is decided on retry.
 */
async function failsAt(r: TestRoom, signed: ReturnType<Client["signed"]>, method: PortMethod, step: string, error?: Error): Promise<Diagnosis> {
  const before = (await entries(r)).length;
  r.world.diagnoses.length = 0;
  r.world.artifacts.failNext(method, 1, error);
  const err = await failure(r.stub.submit(signed));
  expect(err).toEqual({ name: "ArtroomError", code: "unavailable", message: UNAVAILABLE, retryable: true, maybeRecorded: false });
  expect((await entries(r)).length).toBe(before);
  const pre = logged(r, "pre-admission-failed");
  expect(pre).toHaveLength(1);
  expect(pre[0]!.step).toBe(step);
  // Nothing else on the path logged it again.
  expect(r.world.diagnoses).toHaveLength(1);
  // Retry behaviour is unchanged: the same signed act is admitted (or decided) the next time.
  await call(r.stub.submit(signed));
  expect((await entries(r)).length).toBe(before + 1);
  return pre[0]!;
}

async function claimed(r: TestRoom, who: Client = r.admin) {
  return expectOk(await who.act<Claim>("claim", null, { goal: "g", scope: ["src/**", ".artroom/**"] }));
}

const proposeBody = (head: string, expectedGeneration = 0) => ({ lease: 1, expectedGeneration, head, summary: "s" });

describe("request d268d249: each pre-admission step is logged with its name", () => {
  it("propose.headInFork", async () => {
    const r = await makeRoom();
    const c = await claimed(r);
    const head = pushChange(r, c.lane, { "src/app.ts": "v2" });
    const d = await failsAt(r, r.admin.signed("propose", { lane: c.lane }, proposeBody(head)), "headInFork", "propose.headInFork");
    expect(d).toEqual({ event: "pre-admission-failed", step: "propose.headInFork", name: "Error", message: "Artifacts is unavailable (headInFork)" });
  });

  /** A checker's check on a proposed lane; `filtered` names input paths, so the snapshot is read too. */
  async function checkCase(filtered: boolean) {
    const r = await makeRoom();
    const ci = await addMember(r, "@ci", "checker");
    const c = await claimed(r);
    const head = pushChange(r, c.lane, { "src/app.ts": "v2" });
    await r.admin.ok<Proposal>("propose", { lane: c.lane }, proposeBody(head));
    const tree = r.world.artifacts.treeOf(head as never);
    const input = filtered ? { kind: "filtered", snapshot: `sha256:${"1".repeat(64)}`, paths: ["src/**"] } : { kind: "tree", tree };
    const body = { obligation: "obl_unit-tests", check: "unit", integration: head, input, config: `sha256:${"2".repeat(64)}`, runner: `sha256:${"0".repeat(64)}`, volatile: false, ok: true, detail: "ok" };
    return { r, signed: ci.signed("check", { lane: c.lane, generation: 1 }, body) };
  }

  it("check.snapshot: a scoped check's filtered input", async () => {
    const { r, signed } = await checkCase(true);
    const d = await failsAt(r, signed, "snapshot", "check.snapshot");
    expect(d.message).toBe("Artifacts is unavailable (snapshot)");
  });

  /** A land whose landing engine has not recorded main, so the room reads it first. */
  async function landCase() {
    const r = await makeRoom();
    const c = await claimed(r);
    const head = pushChange(r, c.lane, { "src/app.ts": "v2" });
    await r.admin.ok<Proposal>("propose", { lane: c.lane }, proposeBody(head));
    await inDO(r, async (room) => {
      await room.core.idle();
      room.core.sql.all("DELETE FROM artroom_land_meta WHERE k = 'main'");
    });
    return { r, signed: r.admin.signed("land", { lane: c.lane, generation: 1 }, { lease: 1, head }) };
  }

  it("land.refreshMain", async () => {
    const { r, signed } = await landCase();
    const before = (await entries(r)).length;
    r.world.diagnoses.length = 0;
    // The landing engine reads main through the publisher, not the Artifacts port: fail it on this room's object.
    await inDO(r, (room) => {
      const real = room.core.landing.refreshMain.bind(room.core.landing);
      let once = true;
      room.core.landing.refreshMain = () => {
        if (!once) return real();
        once = false;
        return Promise.reject(Object.assign(new Error(`publisher readMain failed: ${TOKEN}`), { name: "PublisherError" }));
      };
    });
    const err = await failure(r.stub.submit(signed));
    expect(err).toEqual({ name: "ArtroomError", code: "unavailable", message: UNAVAILABLE, retryable: true, maybeRecorded: false });
    expect((await entries(r)).length).toBe(before);
    expect(r.world.diagnoses).toEqual([{ event: "pre-admission-failed", step: "land.refreshMain", name: "PublisherError", message: "publisher readMain failed: <token>" }]);
    await call(r.stub.submit(signed));
    expect((await entries(r)).length).toBe(before + 1);
  });
});

describe("request d268d249: the diagnosis is redacted and bounded", () => {
  it("a token, a URL query, userinfo and bearer credentials in the error never reach the log or the client", async () => {
    const r = await makeRoom();
    const c = await claimed(r);
    const head = pushChange(r, c.lane, { "src/app.ts": "v2" });
    const signed = r.admin.signed("propose", { lane: c.lane }, proposeBody(head));
    r.world.artifacts.failNext("pinObjects", 1, leaky());
    const err = await failure(r.stub.submit(signed));
    expect(err.message).toBe(UNAVAILABLE);
    noSecrets(JSON.stringify(err));
    const [d] = r.world.diagnoses;
    expect(d).toMatchObject({ event: "pre-admission-failed", step: "propose.pinObjects", name: "ArtifactsError" });
    noSecrets(JSON.stringify(d));
    expect(d!.message).toContain("<token>");
    expect(d!.message).toContain("https://<credentials>@artifacts.example/ns/repo.git?<query>");
    expect(d!.message).toContain("Authorization: <redacted>");
    expect(d!.message.length).toBeLessThanOrEqual(300);
  });

});

describe("request d268d249: the parallel catch-all 5xx mappings log the same way", () => {
  it("an RPC failure that is not an ArtroomError: internal with the fixed message, logged under the method", async () => {
    const r = await makeRoom();
    r.world.diagnoses.length = 0;
    r.world.policy.refuseHook = () => {
      r.world.policy.refuseHook = null;
      throw leaky();
    };
    const err = await failure(r.stub.submit(r.admin.signed("claim", null, { goal: "g", scope: ["src/**"] })));
    expect(err).toEqual({ name: "ArtroomError", code: "internal", message: INTERNAL, retryable: true, maybeRecorded: false });
    expect(r.world.diagnoses).toHaveLength(1);
    expect(r.world.diagnoses[0]).toMatchObject({ event: "rpc-failed", step: "submit", name: "ArtifactsError" });
    noSecrets(JSON.stringify(r.world.diagnoses));
  });

  it("an HTTPS route failure that is not an ArtroomError: 500 with the fixed message, logged", async () => {
    const seen: Diagnosis[] = [];
    const broken = {
      ...env,
      ROOMS: {
        idFromName: () => {
          throw leaky();
        },
      },
    } as unknown as RoomEnv;
    const res = await route(new Request(`https://artroom.test/v1/rooms/room_${"a".repeat(32)}/acts`, { method: "POST", body: "{}" }), broken, (d) => seen.push(d));
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(JSON.parse(text)).toMatchObject({ code: "internal", message: INTERNAL });
    noSecrets(text);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ event: "http-failed", step: "route", name: "ArtifactsError" });
    noSecrets(JSON.stringify(seen));
  });

  it("an MCP failure outside a tool call that is not an ArtroomError: 500 with the fixed message, logged", async () => {
    const seen: Diagnosis[] = [];
    const mcp = mcpEndpoint(
      async () => {
        throw leaky();
      },
      (d) => seen.push(d),
    );
    const res = await mcp(new Request(`https://artroom.test/v1/rooms/room_${"a".repeat(32)}/mcp`, { method: "POST", headers: { authorization: "Bearer abc" }, body: "{}" }), env as unknown as RoomEnv);
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(JSON.parse(text)).toMatchObject({ code: "internal", message: INTERNAL });
    noSecrets(text);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ event: "mcp-failed", step: "mcp", name: "ArtifactsError" });
    noSecrets(JSON.stringify(seen));
  });

  it("the registry's bind: a failure that is not an ArtroomError goes to the Worker's console as one JSON line", async () => {
    const reg = env.REGISTRY.get(env.REGISTRY.idFromName("registry")) as unknown as DurableObjectStub<Registry>;
    // The registry's SQLite read fails on this object only, and is restored after.
    await runInDurableObject(reg, (registry: unknown) => {
      (registry as { row: () => never }).row = () => {
        throw leaky();
      };
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const err = await failure(reg.bind(`acme-import/${hex(randomBytes(16))}`, `room_${hex(randomBytes(16))}` as RoomId, `n-${hex(randomBytes(4))}`));
      expect(err).toEqual({ name: "ArtroomError", code: "internal", message: INTERNAL, retryable: true, maybeRecorded: false });
      const lines = spy.mock.calls.map((a) => JSON.parse(String(a[0])) as Diagnosis);
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatchObject({ event: "rpc-failed", step: "registry.bind", name: "ArtifactsError" });
      expect(Object.keys(lines[0]!)).toEqual(["event", "step", "name", "message"]);
      noSecrets(String(spy.mock.calls[0]![0]));
    } finally {
      spy.mockRestore();
      await runInDurableObject(reg, (registry: unknown) => {
        delete (registry as { row?: unknown }).row;
      });
    }
  });

  it("founding: a failed readMain is logged with its step", async () => {
    const admin = newKeyPair();
    const repo = `acme-import/${hex(randomBytes(16))}`;
    const worker = exports.default as unknown as { draft(input: unknown): Promise<DraftedRoom>; found(g: Genesis, sig: string, draft: string): Promise<RoomId> };
    const drafted = await worker.draft({ name: `acme/${hex(randomBytes(6))}`, repo: { kind: "import", grant: grant(repo, admin.key) }, admin: { handle: "@founder", key: admin.key }, recovery: newKeyPair().key });
    const world = worldFor(roomIdOf(drafted.genesis));
    placeRepo(world, drafted.genesis.repo);
    world.artifacts.main = world.artifacts.commit(null, { "README.md": "# imported\n" });
    world.artifacts.failNext("readMain", 1, leaky());
    const sig = sign(admin.seed, "artroom-genesis-v1", drafted.genesis);
    // Caught here, as founding.test.ts does: an RPC promise given to `expect().rejects` is reported as unhandled.
    let thrown: unknown = null;
    try {
      await worker.found(drafted.genesis, sig, drafted.draft);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toMatchObject({ name: "ArtroomError", code: "unavailable", message: "The canonical repository could not be created or read. Retry the same found." });
    expect(world.diagnoses).toHaveLength(1);
    expect(world.diagnoses[0]).toMatchObject({ event: "found-failed", step: "readMain", name: "ArtifactsError" });
    noSecrets(JSON.stringify(world.diagnoses));
    // The retry completes, as before.
    expect(await worker.found(drafted.genesis, sig, drafted.draft)).toBe(roomIdOf(drafted.genesis));
  });

  it("a preview that cannot be computed is logged; the proposal still says only that it failed", async () => {
    const r = await makeRoom();
    const c = await claimed(r);
    const head = pushChange(r, c.lane, { "src/app.ts": "v2" });
    await inDO(r, (room) => room.core.idle());
    r.world.diagnoses.length = 0;
    r.world.artifacts.failNext("preview", 1, leaky());
    await r.admin.ok<Proposal>("propose", { lane: c.lane }, proposeBody(head));
    await inDO(r, (room) => room.core.idle());
    const p = (await r.admin.read({ q: "proposal", ref: { lane: c.lane, generation: 1 } }))!;
    expect(p.preview).toMatchObject({ state: "failed" });
    expect(logged(r, "preview-failed")).toEqual([expect.objectContaining({ step: "preview", name: "ArtifactsError" })]);
    noSecrets(JSON.stringify(r.world.diagnoses));
  });

  it("a log publication that fails is logged with its step", async () => {
    const r = await makeRoom();
    await r.admin.ok("claim", null, { goal: "g", scope: ["src/**"] });
    await inDO(r, (room) => room.core.idle());
    r.world.diagnoses.length = 0;
    r.world.log.faults.failBeforePush = 5;
    expect((await failure(r.stub.publishLog())).code).toBe("unavailable");
    expect(logged(r, "publication-failed").length).toBeGreaterThanOrEqual(1);
    expect(logged(r, "publication-failed")[0]).toMatchObject({ step: "publish" });
    expect(logged(r, "rpc-failed")).toEqual([]);
    await tick(r);
  });

  it("a proposal read whose pinned ref cannot be written is logged with its step", async () => {
    const r = await makeRoom();
    const c = await claimed(r);
    const head = pushChange(r, c.lane, { "src/app.ts": "v2" });
    await r.admin.ok<Proposal>("propose", { lane: c.lane }, proposeBody(head));
    await inDO(r, async (room) => {
      await room.core.idle();
      room.core.sql.all("UPDATE pins SET done = 0");
    });
    r.world.diagnoses.length = 0;
    r.world.artifacts.failNext("pinRef", 1, leaky());
    await expect(r.admin.read({ q: "proposal", ref: { lane: c.lane, generation: 1 } })).rejects.toMatchObject({ code: "unavailable" });
    expect(r.world.diagnoses).toEqual([expect.objectContaining({ event: "read-failed", step: "completePins", name: "ArtifactsError" })]);
    noSecrets(JSON.stringify(r.world.diagnoses));
  });
});

/**
 * Checker report on 0e058f13: credentials known by their syntax were kept
 * when short or quoted. The redaction of each syntax is a pure function,
 * tested case by case in test/node/diag.cases.ts. Here the same messages go
 * through a retained job error, which is stored and shown by other code.
 */
const SYNTAX_CASES: [string, string, string[]][] = [
  ["a double-quoted password with spaces", 'login password="hunter two three" then failed', ["hunter", "two", "three"]],
  ["a double-quoted password with an escaped quote", String.raw`login password="ab\"cd ef" then failed`, ["ab", "cd", "ef"]],
  ["a single-quoted password with an escaped quote", String.raw`login password='it\'s mine' then failed`, ["it", "mine"]],
  ["a JSON password", '{"password": "x y z", "user": "u"}', ["x y", "z\""]],
  ["a short Bearer credential", "sent Bearer q, rejected", ["Bearer q"]],
  ["a short Basic credential", "sent Basic YQ== rejected", ["YQ=="]],
  ["a short Authorization header", "Authorization: Bearer q\nthen", ["Bearer q"]],
  ["a one-character token pair", "token=q ok", ["=q"]],
  ["a short GitHub token", `cut ${join("gh", "p_", "q1")} here`, [join("gh", "p_")]],
  ["a short JSON Web Token", `cut ${join("ey", "Jq.", "ey", "Jw.e")} here`, [join("ey", "Jq")]],
  ["a private key block's body", join("-----BEGIN ", "PRIVATE KEY-----\nq1w2\ne3r4\n-----END ", "PRIVATE KEY-----"), ["q1w2", "e3r4"]],
  // The checker's three controls (report e6a9016b), verbatim.
  ["the checker's quoted spaces", 'password: "horse battery staple"', ["horse", "battery", "staple"]],
  ["the checker's quoted escaped quote", JSON.stringify({ password: 'horse"battery' }), ["horse", "battery"]],
  ["the checker's short bearer", "request with Bearer abcd failed", ["abcd"]],
];

describe("request d268d249: credentials known by their syntax stay out of retained job errors (checker, 0e058f13)", () => {
  it("retained job errors keep safe metadata only (request d29c09fa), at all three sinks: a lost mint, an unreadable inventory, a failed revocation (since mint lane C, the mint ledger's)", async () => {
    const whole: CheckerConfig = { format: "artroom-checker-v1", volatile: false, timeoutSeconds: 60, runner: `sha256:${"0".repeat(64)}` };
    const r = await makeRoom({ policy: policy(requireCheck("unit", { paths: "src/**", by: "@ci", id: "unit-tests" })), files: { ".artroom/checkers/unit.json": JSON.stringify(whole), "package.json": "{}" } });
    // The canonical repository's methods named in `failing` throw an error with every case's credential, in its
    // message and its name (`String(e)` carries both), on this room's object only.
    const failing = new Set<string>();
    const message = SYNTAX_CASES.map(([, m]) => m).join("; ");
    await inDO(r, async (room) => {
      await room.core.idle();
      const run = room.core.run.bind(room.core);
      room.core.run = (s) => {
        if (s !== "jobs" && s !== "landing") run(s);
      };
      const binding = room.core.artifacts as unknown as { get: (name: string) => Promise<Record<string, unknown>> };
      const get = binding.get.bind(binding);
      binding.get = async (name) => {
        const repo = await get(name);
        const wrapped = Object.create(repo) as Record<string, unknown>;
        for (const m of ["createToken", "listTokens", "revokeToken"])
          wrapped[m] = (...a: unknown[]) => {
            if (failing.has(m)) throw Object.assign(new Error(message), { name: "ArtifactsError Bearer abcd" });
            return (repo[m] as (...x: unknown[]) => unknown).apply(repo, a);
          };
        return wrapped;
      };
    });
    const alice = await addMember(r, "@alice", "member");
    await addMember(r, "@ci", "checker");
    r.world.checkers["unit"] = { handle: async () => ({ refused: true, rule: "check-binding", reason: "test", fix: "none" }) as never };
    const c = await alice.ok<Claim>("claim", null, { goal: "work", scope: ["src/**"] });
    const head = pushChange(r, c.lane, { "src/app.ts": "v2" });
    await alice.ok<Proposal>("propose", { lane: c.lane }, proposeBody(head));
    const jobs = () =>
      inDO(r, async (room) => {
        await room.core.idle();
        await room.core.steps.jobs();
        await room.core.idle();
        return room.core.sql.all("SELECT token_id, expires_at, next_ms, last_error FROM job_tokens ORDER BY token_id");
      });
    const ledger = () => inDO(r, (room) => room.core.mints.duties({ limit: 1000 }));
    const clean = (e: string) => {
      expect(e).not.toContain("abcd");
      for (const [, , gone] of SYNTAX_CASES) for (const g of gone) expect(e).not.toContain(g);
    };
    // The lost mint: the mint ledger's unknown record keeps the stage and safe metadata only.
    failing.add("createToken");
    await jobs();
    const [lost] = (await ledger()).records;
    expect(lost).toMatchObject({ purpose: expect.stringMatching(/^job:/), state: "unknown", lastError: "create failed: an error of another kind" });
    // The ledger's observation of unknown creates, and the ended token's revocation: the inventory cannot be read;
    // the next attempt mints a token, the checker refuses, and its revocation fails.
    failing.clear();
    failing.add("listTokens");
    failing.add("revokeToken");
    clock.now = Number((await inDO(r, (room) => room.core.sql.all("SELECT next_ms FROM check_jobs")))[0]!["next_ms"]);
    const rows = await jobs();
    await inDO(r, async (room) => {
      await room.core.steps.mints();
      await room.core.mints.idle();
    });
    const d = await ledger();
    expect(d.observation.result).toBe("no inventory: the listing failed: an error of another kind");
    expect(rows.map((x) => String(x["last_error"]))).toEqual(["revocation failed: an error of another kind"]);
    for (const e of [String(lost!.lastError), String(d.observation.result), ...rows.map((x) => String(x["last_error"])), ...d.records.map((x) => String(x.lastError))]) clean(e);
    // Every row of every table, the ledger's duties and the operators' view of the job tokens hold none of it either.
    const everything = await inDO(r, (room) => {
      const tables = room.core.sql.all("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'").map((x) => String(x["name"]));
      return JSON.stringify([tables.map((t) => room.core.sql.all(`SELECT * FROM "${t}"`)), room.core.mints.duties({ limit: 1000 }), jobTokenDuties(room.core)]);
    });
    // The distinctive parts only: short ones ("cd", "it") occur in any room's rows.
    for (const g of ["hunter", "horse", "battery", "staple", "q1w2", "e3r4", "Bearer", "password"]) expect(everything).not.toContain(g);
  });
});
