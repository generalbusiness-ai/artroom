/**
 * Declared acts stage 2 (request fd6f00b6): the cases of the second audit of
 * 15fa7f4c. Each test names the rule it holds the Room to. Envelopes are
 * signed by the test itself (declared-support.ts), so the harness converts
 * nothing here, and the file runs in the legacy run only.
 */
import { describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import type { ActDeclaration, ActRecord, CheckerService, CheckJob, Claim, PolicyDocument, PolicyDocumentV2, Redeemed, Refusal, Review, RosterRecord } from "@generalbusiness/artroom-contract";
import { policy, requireCheck, requireReview, validatePolicyV2 } from "@generalbusiness/artroom-policy";
import { WORDING_FILLED_BYTES } from "../../src/declared.ts";
import { JOB_RETRY_MS } from "../../src/jobs.ts";
import { redeem } from "../../src/requests.ts";
import { activate, act, bindingIn, declaredRoom, inDO, ok, signed, v2 } from "./declared-support.ts";
import { addMember, advance, b64url, call, Client, clock, day, DECLARED, digestBytes, expectOk, expectRefusal, iso, makeRoom, newKeyPair, pushChange, randomBytes, sign, tick, until, type TestRoom } from "./support.ts";

const R = `sha256:${"0".repeat(64)}` as const;
const reviewed = () => policy(requireReview({ paths: "src/**", from: "role:admin", id: "rv" }));
const landing = (r: TestRoom, op: string) =>
  inDO(r, (room) => {
    const v = room.core.landing.view(op as never) as unknown as { state: string; reason?: string; fix?: string };
    return { state: v.state, reason: v.reason, fix: v.fix };
  });
const jobs = (r: TestRoom) => inDO(r, (room) => room.core.sql.all("SELECT state, outcome, attempt FROM check_jobs ORDER BY rowid") as unknown as { state: string; outcome: string | null; attempt: number }[]);

// ------------------------------------------------------------ check jobs (R-DECL-18)

describe.skipIf(DECLARED)("check jobs in a v2 room name the kind and binding to sign (R-DECL-18, R-EXEC-8)", () => {
  type Sent = { job: CheckJob & { kind?: string; binding?: string }; out: unknown };

  /** A v2 room whose `src/**` needs the check `unit`, and a checker that signs exactly what its job names, as packages/checkers does. */
  async function checked(before: (job: Sent["job"], n: number) => Promise<void> | undefined = async () => {}, signAs?: (job: Sent["job"]) => { v: number; kind: string; binding?: string }, settle = true) {
    const base = () => policy(requireCheck("unit", { paths: "src/**", by: "@ci", id: "unit-tests" }));
    const doc = v2(() => {}, base());
    const cfg = { format: "artroom-checker-v2", act: "check", volatile: false, timeoutSeconds: 60, runner: R };
    const r = await makeRoom({ policy: doc as unknown as PolicyDocument, files: { ".artroom/checkers/unit.json": JSON.stringify(cfg) } });
    const alice = await addMember(r, "@alice", "member");
    const ci = await addMember(r, "@ci", "checker");
    const seen: Sent[] = [];
    const service: CheckerService = {
      async handle(job) {
        const j = job as Sent["job"];
        const n = seen.length;
        seen.push({ job: j, out: undefined });
        await before(j, n);
        const as = signAs ? signAs(j) : { v: j.binding ? 2 : 1, kind: j.kind ?? "check", ...(j.binding ? { binding: j.binding } : {}) };
        const body = { obligation: job.obligation, check: job.check, integration: job.integration, input: job.input, config: job.config, runner: job.runner ?? R, volatile: job.volatile, ok: true, detail: "Machine-run check", ...(job.landOp ? { landOp: job.landOp } : {}) };
        const stub = env.ROOMS.get(env.ROOMS.idFromName(r.id)) as never as TestRoom["stub"];
        const envelope = { v: as.v, room: r.id, actor: ci.key, kind: as.kind, ...(as.binding ? { binding: as.binding } : {}), target: { lane: job.lane, generation: job.generation }, body, idempotencyKey: `chk-${job.id}`.slice(0, 64) };
        const out = await call(stub.submit({ envelope, sig: sign(ci.keys.seed, "artroom-envelope-v1", envelope) } as never));
        seen[n]!.out = out;
        return out as never;
      },
    };
    r.world.checkers["unit"] = service;
    const c = await ok<Claim>(r, alice, "claim", null, { goal: "work", scope: ["src/**"] });
    const head = pushChange(r, c.lane, { "src/app.ts": "v2" });
    await ok(r, alice, "propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "change" });
    // A test that holds the checker's answer cannot wait for the room to be idle.
    if (settle) await inDO(r, (room) => room.core.idle());
    return { r, alice, c, head, seen, base };
  }

  it("the job carries the check act's kind and its active binding; a check signed with them is admitted, and the landing lands", async () => {
    const { r, alice, c, head, seen } = await checked();
    const l = (await ok(r, alice, "land", { lane: c.lane, generation: 1 }, { lease: 1, head })) as unknown as { op: { id: string } };
    await tick(r, 6);
    expect(seen.length).toBeGreaterThan(0);
    for (const s of seen) expect(s.job).toMatchObject({ kind: "check", binding: await bindingIn(r, "check") });
    expect(seen.every((s) => (s.out as ActRecord).kind === "check" && !("refused" in (s.out as object)))).toBe(true);
    expect((await landing(r, l.op.id)).state).toBe("landed");
  });

  it("a v1 room's job names neither", async () => {
    const r = await makeRoom({ policy: policy(requireCheck("unit", { paths: "src/**", by: "@ci", id: "unit-tests" })), files: { ".artroom/checkers/unit.json": JSON.stringify({ format: "artroom-checker-v1", volatile: false, timeoutSeconds: 60, runner: R }) } });
    const alice = await addMember(r, "@alice", "member");
    const got: CheckJob[] = [];
    r.world.checkers["unit"] = { handle: async (job) => (got.push(job), { refused: true, rule: "invalid-body", reason: "not run" }) as never };
    const c = await alice.ok<Claim>("claim", null, { goal: "work", scope: ["src/**"] });
    const head = pushChange(r, c.lane, { "src/app.ts": "v2" });
    await alice.ok("propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "change" });
    await inDO(r, (room) => room.core.idle());
    await tick(r, 3);
    expect(got.length).toBeGreaterThan(0);
    expect("kind" in got[0]! || "binding" in got[0]!).toBe(false);
  });

  it("a check signed under a binding an activation has replaced is binding-stale; the job is due again and its next attempt names the binding in force", async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    // The first job's check is signed only after the test has changed the meaning of `check`.
    const s = await checked(async (_job, n) => (n === 0 ? gate : undefined), undefined, false);
    await until(async () => s.seen.length > 0);
    const old = s.seen[0]!.job.binding!;
    await activate(s.r, v2((a) => void (a["check"] = { ...a["check"]!, body: { remark: { type: "text", max: 10, optional: true } } }), s.base()));
    const now = (await bindingIn(s.r, "check"))!;
    expect(now).not.toBe(old);
    release();
    await until(async () => s.seen[0]!.out !== undefined);
    await inDO(s.r, (room) => room.core.idle());
    expectRefusal(s.seen[0]!.out, "binding-stale");
    // Not ended as refused: every job the stale check answered is owed again.
    const after = await jobs(s.r);
    expect(after.some((j) => j.outcome === "refused: binding-stale")).toBe(false);
    expect(after.some((j) => j.state === "owed")).toBe(true);
    advance(JOB_RETRY_MS + 1000);
    await tick(s.r, 3);
    await inDO(s.r, (room) => room.core.idle());
    const later = s.seen.filter((x) => x.job.binding === now);
    expect(later.length).toBeGreaterThan(0);
    expect((later[later.length - 1]!.out as ActRecord).kind).toBe("check");
    expect((await jobs(s.r)).every((j) => j.state === "done")).toBe(true);
  });

  it("a checker that was given the binding in force and is still refused binding-stale is not asked again", async () => {
    // It signs `v: 1` with no binding, whatever its job says.
    const { r, seen } = await checked(async () => {}, () => ({ v: 1, kind: "check" }));
    await tick(r, 3);
    expect(seen.length).toBe(1);
    expectRefusal(seen[0]!.out, "binding-stale");
    expect(await jobs(r)).toEqual([{ state: "done", outcome: "refused: binding-stale", attempt: 1 }]);
    advance(JOB_RETRY_MS + 1000);
    await tick(r, 3);
    expect(seen.length).toBe(1);
  });
});

// ------------------------------------------------------------ reservation (R-LAND-7)

describe.skipIf(DECLARED)("reservation judges authority as for a new admission (R-LAND-7, R-DECL-17, R-DECL-21)", () => {
  async function flight(delegated: boolean, change: (a: Record<string, ActDeclaration>) => void) {
    const r = await declaredRoom(v2(() => {}, reviewed()));
    const bob = await addMember(r, "@bob", "member");
    const k = newKeyPair();
    const acts: Record<string, string> = {};
    for (const kind of ["claim", "propose", "land", "release"]) acts[kind] = (await bindingIn(r, kind))!;
    const g = await ok<RosterRecord>(r, bob, "roster", null, { op: "delegate", to: k.key, kinds: ["renew"], acts, lanes: "*", expiresAt: iso(clock.now + day) }, { binding: null });
    const who = delegated ? new Client(r, k, g.id) : bob;
    const c = await ok<Claim>(r, who, "claim", null, { goal: "g", scope: ["src/a.ts"] });
    const head = pushChange(r, c.lane, { "src/a.ts": "a" });
    await ok(r, who, "propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "s" });
    await ok(r, r.admin, "review", { lane: c.lane, generation: 1 }, { head, verdict: "approve", scope: ["src/**"], text: "ok" });
    const oldLand = (await bindingIn(r, "land"))!;
    const l = (await ok(r, who, "land", { lane: c.lane, generation: 1 }, { lease: 1, head })) as unknown as { op: { id: string } };
    await activate(r, v2(change, reviewed()));
    const changed = (await bindingIn(r, "land")) !== oldLand;
    await tick(r, 8);
    return { r, who, c, head, out: await landing(r, l.op.id), changed };
  }
  const reworded = (a: Record<string, ActDeclaration>) => void (a["land"] = { ...a["land"]!, body: { why: { type: "text", max: 10, optional: true } } });

  it("a landing under a delegation whose binding of land is no longer the active one loses its authority, as a new land under that grant would", async () => {
    const { r, who, c, head, out, changed } = await flight(true, reworded);
    expect(changed).toBe(true);
    expect(out).toMatchObject({ state: "retryable", reason: "authority-lost" });
    expect(out.fix).toContain("earlier meaning of land");
    // What a new admission says of the same grant now.
    expectRefusal(await act(r, who, "land", { lane: c.lane, generation: 1 }, { lease: 1, head }), "delegation-invalid");
  });

  it("the same landing under a delegation lands when the activation leaves the binding of land as it was", async () => {
    const { out, changed } = await flight(true, (a) => void (a["note"] = { ...a["note"]!, label: "Remark" }));
    expect(changed).toBe(false);
    expect(out.state).toBe("landed");
  });

  it("a landing by the member's own key completes under the declaration it was admitted in, though the binding of land has changed (R-DECL-23)", async () => {
    const { out, changed } = await flight(false, reworded);
    expect(changed).toBe(true);
    expect(out.state).toBe("landed");
  });

  async function recovery(r: TestRoom, approver: Client = r.admin) {
    const c = await ok<Claim>(r, r.admin, "recover", null, { op: "open", goal: "g", scope: [".artroom/**"] }, { binding: null });
    const head = pushChange(r, c.lane, { ".artroom/note.txt": "x" });
    await ok(r, r.admin, "recover", { lane: c.lane }, { op: "version", lease: 1, expectedGeneration: 0, head, summary: "s" }, { binding: null });
    await ok(r, approver, "recover", { lane: c.lane, generation: 1 }, { op: "approve", head, verdict: "approve", scope: [".artroom/**"], text: "ok" }, { binding: null });
    return (await ok(r, r.admin, "recover", { lane: c.lane, generation: 1 }, { op: "land", lease: 1, head }, { binding: null })) as unknown as { op: { id: string } };
  }

  it("a recover land in flight when the room returns to a v1 document keeps the admin's authority, and lands", async () => {
    const r = await declaredRoom();
    const l = await recovery(r);
    await activate(r, policy());
    await tick(r, 8);
    expect((await landing(r, l.op.id)).state).toBe("landed");
  });

  it("a legacy recovery landing in flight at a v2 activation that declares no kind named land keeps the admin's authority, and lands", async () => {
    const r = await makeRoom();
    const c = await r.admin.ok<Claim>("claim", null, { goal: "repair", scope: [".artroom/**"], purpose: "config-recovery" });
    const head = pushChange(r, c.lane, { ".artroom/note.txt": "x" });
    await r.admin.ok("propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "s" });
    await r.admin.ok("review", { lane: c.lane, generation: 1 }, { head, verdict: "approve", scope: [".artroom/**"], text: "ok" });
    const l = (await r.admin.ok("land", { lane: c.lane, generation: 1 }, { lease: 1, head })) as unknown as { op: { id: string } };
    await activate(
      r,
      v2((a) => {
        a["ship"] = { ...a["land"]!, label: "Ship" };
        delete a["land"];
      }),
    );
    await tick(r, 8);
    expect((await landing(r, l.op.id)).state).toBe("landed");
  });

  it("a recovery landing whose signer is no longer an admin when it is reserved loses its authority (R-ADMIN-8)", async () => {
    const r = await declaredRoom();
    const second = await addMember(r, "@root2", "admin");
    const l = await recovery(r, second);
    // The landing's signer loses the admin role before the landing is reserved.
    await ok(r, second, "roster", null, { op: "set-role", member: "@admin", role: "member" }, { binding: null });
    await tick(r, 8);
    const out = await landing(r, l.op.id);
    expect(out).toMatchObject({ reason: "authority-lost" });
    expect(out.state).not.toBe("landed");
  });
});

// ------------------------------------------------------------ bounds (R-DECL-26, R-DECL-13)

describe.skipIf(DECLARED)("a document too large to store is refused before it can activate (R-DECL-26)", () => {
  const CODES = ["invalid-body", "body-too-large", "not-member", "key-revoked", "delegation-invalid", "role-forbids", "idempotency-mismatch", "secret-detected", "lane-unknown", "lane-held", "not-holder", "lease-fenced", "generation-moved", "scope-overlap", "glob-invalid", "head-unknown", "head-mismatch", "outside-claim"];
  function sized(kinds: number): PolicyDocumentV2 {
    const words = "w".repeat(512);
    const refusals = Object.fromEntries(CODES.map((c) => [c, { reason: words, fix: words }]));
    return v2((a) => {
      for (let i = 0; i < kinds; i++)
        a[`say${i}`] = { label: `Say ${i}`, help: "h".repeat(4096), targets: { thread: ["version"] }, threads: ["claim"], body: { summary: { type: "text", max: 10 } }, who: { roles: ["member"] }, refusals } as unknown as ActDeclaration;
    });
  }

  it("a document inside every other bound whose canonical JSON is over 1,048,576 bytes is policy-invalid at propose time; the same shape under the bound is admitted", async () => {
    const big = sized(57);
    const small = sized(20);
    expect(JSON.stringify(big).length).toBeGreaterThan(1048576);
    expect(JSON.stringify(small).length).toBeLessThan(1048576);
    const r = await declaredRoom();
    const c = await ok<Claim>(r, r.admin, "claim", null, { goal: "policy", scope: [".artroom/**"] });
    const head = pushChange(r, c.lane, { ".artroom/policy.json": JSON.stringify(big) });
    const refused = expectRefusal(await act(r, r.admin, "propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "big" }), "policy-invalid");
    expect(refused.reason).toContain("1048576 bytes");
    const head2 = pushChange(r, c.lane, { ".artroom/policy.json": JSON.stringify(small) });
    expectOk(await act(r, r.admin, "propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head: head2, summary: "small" }));
  });

  it("the validator names the bound, and only when the document is over it", () => {
    const over = validatePolicyV2(sized(57), { historicalOpeningKinds: [], checkers: {} });
    expect(over.ok).toBe(false);
    expect(!over.ok && over.problems).toEqual(["policy: the document's canonical JSON must be at most 1048576 bytes"]);
    expect(validatePolicyV2(sized(20), { historicalOpeningKinds: [], checkers: {} }).ok).toBe(true);
  });
});

describe.skipIf(DECLARED)("refusal wording is filled only with facts in the room's own form, and is bounded (R-DECL-13)", () => {
  it("an unrecorded refusal's {lane} and {generation} are filled only by a lane ID and a positive integer", async () => {
    const r = await declaredRoom(v2((a) => void (a["release"] = { ...a["release"]!, who: { roles: ["maintainer"] }, refusals: { "role-forbids": { reason: "lane [{lane}] generation [{generation}]", fix: "{lane}".repeat(80) } } })));
    const bob = await addMember(r, "@bob", "member");
    const text = expectRefusal(await act(r, bob, "release", { lane: "A".repeat(60_000), generation: 0 }, { lease: 1 }), "role-forbids");
    expect(text.reason).toBe("lane [] generation []");
    expect(text.fix).toBe("");
    const c = await ok<Claim>(r, bob, "claim", null, { goal: "g", scope: ["src/**"] });
    const formed = expectRefusal(await act(r, bob, "release", { lane: c.lane, generation: 3 }, { lease: 1 }), "role-forbids");
    expect(formed.reason).toBe(`lane [${c.lane}] generation [3]`);
    expect(formed.fix).toBe(c.lane.repeat(80));
  });

  it("a recorded refusal whose template repeats {path} is cut to 8,192 bytes, never inside a character", async () => {
    // The reason is 85 paths of 813 bytes. The fix is one byte, ten paths, then two-byte characters: the 8,192nd byte
    // would be the first half of one of them.
    const r = await declaredRoom(v2((a) => void (a["propose"] = { ...a["propose"]!, refusals: { "outside-claim": { reason: "{path}".repeat(85), fix: `a${"{path}".repeat(10)}${"é".repeat(40)}` } } })));
    const c = await ok<Claim>(r, r.admin, "claim", null, { goal: "g", scope: ["src/**"] });
    const long = `docs/${"d".repeat(200)}/${"e".repeat(200)}/${"f".repeat(200)}/${"g".repeat(200)}/x.md`;
    expect(long.length).toBe(813);
    const head = pushChange(r, c.lane, { [long]: "x" });
    const out = expectRefusal(await act(r, r.admin, "propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "s" }), "outside-claim");
    const bytes = (t: string) => new TextEncoder().encode(t).length;
    expect(WORDING_FILLED_BYTES).toBe(8192);
    expect(out.reason).toBe(long.repeat(85).slice(0, 8192));
    expect(out.fix).toBe(`a${long.repeat(10)}${"é".repeat(30)}`);
    expect(bytes(out.fix!)).toBe(8191);
    // The recorded entry holds the same bounded text.
    const sealed = await inDO(r, (room) => String(room.core.sql.all("SELECT body FROM entries WHERE id = ?", out.act!)[0]!["body"]));
    expect(sealed).toContain(out.fix!);
    expect(sealed.length).toBeLessThan(4 * 8192);
  });
});

describe.skipIf(DECLARED)("the active document is parsed once per version, not once per kind", () => {
  it("a grant that names every kind of a 58-kind document reads the policy row at most once", async () => {
    const doc = v2((a) => {
      for (let i = 0; i < 50; i++) a[`k${i}`] = { label: `K${i}`, targets: { thread: ["version"] }, threads: ["claim"], body: { summary: { type: "text", max: 10 } }, who: { roles: ["member"] } };
    });
    const r = await declaredRoom(doc);
    const acts: Record<string, string> = {};
    for (const k of Object.keys(doc.acts)) if (k !== "check") acts[k] = (await bindingIn(r, k))!;
    const k = newKeyPair();
    const grant = await signed(r, r.admin, "roster", null, { op: "delegate", to: k.key, kinds: ["renew"], acts, lanes: "*", expiresAt: iso(clock.now + day) }, { binding: null });
    await inDO(r, (room) => {
      const sql = room.core.sql as unknown as { all: (q: string, ...v: unknown[]) => unknown; __reads?: number; __all?: (q: string, ...v: unknown[]) => unknown };
      sql.__all = sql.all.bind(sql);
      sql.__reads = 0;
      sql.all = (q: string, ...v: unknown[]) => {
        if (q.includes("FROM policies WHERE version")) sql.__reads = (sql.__reads ?? 0) + 1;
        return sql.__all!(q, ...v);
      };
    });
    expectOk(await call<ActRecord | Refusal>(r.stub.submit(grant)));
    const reads = await inDO(r, (room) => {
      const sql = room.core.sql as unknown as { all: unknown; __reads: number; __all: unknown };
      sql.all = sql.__all;
      return sql.__reads;
    });
    expect(reads).toBeLessThanOrEqual(1);
  });

  it("a kept policy cannot be changed by its reader, and a new activation is read at once", async () => {
    const r = await declaredRoom();
    const frozen = await inDO(r, (room) => {
      const p = room.core.activePolicy();
      return Object.isFrozen(p) && Object.isFrozen(p.doc) && Object.isFrozen((p.doc as unknown as PolicyDocumentV2).acts["claim"]!.targets) && room.core.activePolicy() === p;
    });
    expect(frozen).toBe(true);
    const before = await bindingIn(r, "note");
    await activate(r, v2((a) => void (a["note"] = { ...a["note"]!, body: { ...a["note"]!.body, mood: { type: "text", max: 10, optional: true } } })));
    expect(await bindingIn(r, "note")).not.toBe(before);
    expect(await inDO(r, (room) => Object.hasOwn((room.core.activePolicy().doc as unknown as PolicyDocumentV2).acts["note"]!.body!, "mood"))).toBe(true);
  });
});

// ------------------------------------------------------------ records

describe.skipIf(DECLARED)("records of declared and recover acts keep the contract's fields", () => {
  it("an opening act with no goal field and a review act with no text field return records whose goal and text are empty strings", async () => {
    const doc = v2((a) => {
      a["start"] = { label: "Start", targets: { none: ["open"], thread: ["take"] }, threads: ["start"], who: { roles: ["member"] }, hold: { scope: "body.scope", workspace: true } };
      a["propose"] = { ...a["propose"]!, threads: ["start", "claim", "room"] };
      a["ack"] = { label: "Ack", targets: { version: ["review"] }, threads: ["start"], who: { roles: ["member"] } };
    }, reviewed());
    const r = await declaredRoom(doc);
    const bob = await addMember(r, "@bob", "member");
    const c = await ok<Claim>(r, bob, "start", null, { scope: ["src/**"] });
    expect(c.goal).toBe("");
    const head = pushChange(r, c.lane, { "src/app.ts": "v2" });
    await ok(r, bob, "propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "s" });
    const rv = await ok<Review>(r, r.admin, "ack", { lane: c.lane, generation: 1 }, { head, verdict: "approve", scope: ["src/**"] });
    expect(rv.text).toBe("");
  });

  it("every recover record names its op as `recover`; a landing's `op` stays its landing operation (R-DECL-21)", async () => {
    const r = await declaredRoom();
    const c = await ok<Claim>(r, r.admin, "recover", null, { op: "open", goal: "g", scope: [".artroom/**"] }, { binding: null });
    const head = pushChange(r, c.lane, { ".artroom/note.txt": "x" });
    const v = await ok(r, r.admin, "recover", { lane: c.lane }, { op: "version", lease: 1, expectedGeneration: 0, head, summary: "s" }, { binding: null });
    const a = await ok(r, r.admin, "recover", { lane: c.lane, generation: 1 }, { op: "approve", head, verdict: "approve", scope: [".artroom/**"], text: "ok" }, { binding: null });
    const l = await ok(r, r.admin, "recover", { lane: c.lane, generation: 1 }, { op: "land", lease: 1, head }, { binding: null });
    const records = [c, v, a, l] as unknown as { kind: string; recover: string; op?: { id?: string } }[];
    expect(records.map((x) => [x.kind, x.recover])).toEqual([["recover", "open"], ["recover", "version"], ["recover", "approve"], ["recover", "land"]]);
    expect(records.slice(0, 3).every((x) => !("op" in x))).toBe(true);
    expect(records[3]!.op!.id).toMatch(/^op_/);
    // A declared act's record has no such field.
    const plain = await ok<Claim>(r, r.admin, "claim", null, { goal: "g", scope: ["src/**"] });
    expect("recover" in plain).toBe(false);
  });
});

// ------------------------------------------------------------ bearer sessions

describe.skipIf(DECLARED)("bearer sessions across a change of document (R-IDEM-3, R-DECL-17)", () => {
  async function session(d: TestRoom, acts: Record<string, string>) {
    const bytes = randomBytes(32);
    const op = { op: "invite", member: "@agent", role: "agent", custody: "room", expiresAt: iso(clock.now + day), secretHash: digestBytes(bytes), session: { kinds: ["renew"], acts, lanes: "*", ttlSeconds: 3600 } };
    const inv = await ok<RosterRecord>(d, d.admin, "roster", null, op, { binding: null });
    return { inv, secret: b64url(bytes) };
  }

  it("a session that uses a key again for another act after the room returned to v1 is idempotency-mismatch, naming the original entry", async () => {
    const d = await declaredRoom();
    const { inv, secret } = await session(d, { claim: (await bindingIn(d, "claim"))! });
    const b = await call<Redeemed>(d.stub.redeem({ custody: "room", invitation: inv.id, secret }, "x"));
    const claim = { kind: "claim", target: null, body: { goal: "g", scope: ["src/**"] }, idempotencyKey: "k-1" };
    const first = expectOk(await call<Claim | Refusal>(d.stub.bearerAct(b.bearer, claim as never)));
    await activate(d, policy());
    const other = expectRefusal(await call(d.stub.bearerAct(b.bearer, { ...claim, body: { goal: "other", scope: ["docs/**"] } } as never)), "idempotency-mismatch");
    expect(other.reason).toContain(first.id);
    // The same act under the same key is still a retry, and gets its original record.
    expect(await call(d.stub.bearerAct(b.bearer, claim as never))).toEqual(first);
  });

  it("a redemption that waited in the queue behind an activation is granted under the document then in force", async () => {
    const d = await declaredRoom();
    const { inv, secret } = await session(d, { claim: (await bindingIn(d, "claim"))! });
    // The redemption arrives while an activation holds the queue: the room returns to a v1 document first.
    const out = await inDO(d, async (room) => {
      let go = () => {};
      const gate = new Promise<void>((resolve) => (go = resolve));
      const first = room.core.serial(async () => {
        await gate;
        room.core.sql.transaction(() => room.core.activate(policy() as never, room.core.activePolicy().checkers, null, iso(clock.now)));
      });
      const redeemed = redeem(room.core, { custody: "room", invitation: inv.id, secret }, "x", "https://artroom.test");
      go();
      await first;
      return redeemed;
    });
    // Under v1 a session with a grant map is refused binding-stale, and the invitation stays unused (R-DECL-17).
    const refused = expectRefusal(out, "binding-stale");
    expect(refused.reason).not.toContain("invalid");
    expect(await inDO(d, (room) => room.core.sql.all("SELECT used FROM invitations WHERE id = ?", inv.id)[0]!["used"])).toBeNull();
  });
});
