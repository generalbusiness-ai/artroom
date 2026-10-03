/**
 * Declared acts stage 2 (request fd6f00b6): admission decisions, one guard at
 * a time. Each test holds the Room to one condition of `src/admission.ts`
 * (the retry lookup, step 4a, the reads before admission, R-DECL-8 at each
 * step, grants, records) and to the nearest case on its other side.
 *
 * Envelopes are signed by the test itself (declared-support.ts), so the
 * harness converts nothing, and the file runs in the legacy run only. Every
 * decisive check is an `expect` on what the room answered: `outcome` turns a
 * thrown failure into a value, so no test fails by a throw of its own.
 */
import { describe, expect, it } from "vitest";
import { env, exports } from "cloudflare:workers";
import type { ActDeclaration, ActRecord, Claim, DraftedRoom, Genesis, PolicyDocument, Refusal, RoomId } from "@generalbusiness/artroom-contract";
import { policy, requireCheck, requireReview } from "@generalbusiness/artroom-policy";
import { admit } from "../../src/admission.ts";
import { hex } from "../../src/crypto.ts";
import type { Wire } from "../../src/errors.ts";
import { roomIdOf } from "../../src/ids.ts";
import { activate, act, bindingIn, declaredRoom, headSeq, inDO, laneRowOf, LEASE, ok, signed, v2 } from "./declared-support.ts";
import { addMember, Client, clock, day, DECLARED, grant, iso, makeRoom, newKeyPair, placeRepo, pushChange, randomBytes, sign, tick, worldFor, type TestRoom } from "./support.ts";

type Answer = { ok?: unknown; error?: { code: string; message: string } };

/** What the room answered: the record or refusal, or the thrown failure's code and message. */
async function outcome(p: Promise<unknown>): Promise<Answer> {
  const w = (await p) as Wire<unknown>;
  return "ok" in w ? { ok: w.ok } : { error: { code: w.error.code, message: w.error.message } };
}

/**
 * `admit` called inside the room, for a submission no transport carries: JSON and the Durable Object boundary deliver
 * own fields only, so only a direct call can give a submission an inherited one.
 */
const direct = (r: TestRoom, input: unknown): Promise<Answer> =>
  inDO(r, async (room) => {
    try {
      return { ok: (await admit(room.core, input, "submitted")).result };
    } catch (e) {
      return { error: { code: (e as { code?: string }).code ?? (e as Error).name, message: (e as Error).message } };
    }
  });

const bad = (message: string): Answer => ({ error: { code: "bad-request", message } });
const CLAIM = { goal: "g", scope: ["src/**"] };
const R0 = `sha256:${"0".repeat(64)}`;
const invariantsOf = (r: TestRoom, act: string) =>
  inDO(r, (room) => String(room.core.sql.all("SELECT x.invariants AS i FROM explain x JOIN entries e ON e.seq = x.seq WHERE e.id = ?", act)[0]!["i"]));

// ------------------------------------------------------------ step 1 and step 4a

describe.skipIf(DECLARED)("step 1 and step 4a are judged under the document in force (R-DECL-1, R-DECL-16)", () => {
  it("a v2 room judges step 1 under its active document: a v: 2 envelope of a declared kind is admitted, and the same envelope is bad-request in a v1 room (R-DECL-1)", async () => {
    const r = await declaredRoom();
    expect(await outcome(r.stub.submit(await signed(r, r.admin, "claim", null, CLAIM)))).toMatchObject({ ok: { kind: "claim", purpose: "ordinary" } });
    // The other side: under a v1 document the vocabulary is the legacy one, where `binding` is not a field.
    const legacy = await makeRoom();
    const other = await signed(legacy, legacy.admin, "claim", null, CLAIM, { binding: (await bindingIn(r, "claim"))! });
    expect(await outcome(legacy.stub.submit(other))).toEqual(bad("envelope.binding is not a field of this type."));
  });

  it("a v1 room has no step 4a: a legacy claim is admitted, never kind-undeclared; a v2 room answers kind-undeclared for a kind it does not declare (R-DECL-16)", async () => {
    const legacy = await makeRoom();
    const out = await act<Claim>(legacy, legacy.admin, "claim", null, CLAIM, { binding: null });
    expect(out).toMatchObject({ kind: "claim", purpose: "ordinary" });
    expect("refused" in out).toBe(false);
    const r = await declaredRoom();
    expect(await act(r, r.admin, "merge", null, {}, { binding: `sha256:${"1".repeat(64)}` })).toMatchObject({ refused: true, rule: "kind-undeclared" });
  });

  it("a declared act whose target its declaration does not accept is the thrown failure bad-request, in step 1's words, and nothing is recorded (R-DECL-4)", async () => {
    const r = await declaredRoom();
    const seq = await headSeq(r);
    const body = { lease: 1, expectedGeneration: 0, head: "a".repeat(40), summary: "s" };
    expect(await outcome(r.stub.submit(await signed(r, r.admin, "propose", null, body)))).toEqual(bad("envelope.target must be an object."));
    expect(await headSeq(r)).toBe(seq);
    // The other side: a target of the declared shape passes to the later steps, which answer with a refusal.
    expect(await act(r, r.admin, "propose", { lane: "act_999_00000000" }, body)).toMatchObject({ refused: true, rule: "lane-unknown" });
  });

  it("a v: 1 envelope of a declared kind carries no binding, so it is binding-stale; one that carries a binding is bad-request at step 1 (R-DECL-16)", async () => {
    // The control for step 4a's test of `v`: step 1 leaves no v: 1 envelope with a binding for it to judge.
    const r = await declaredRoom();
    const current = (await bindingIn(r, "claim"))!;
    expect(await act(r, r.admin, "claim", null, CLAIM, { binding: null })).toMatchObject({ refused: true, rule: "binding-stale", current: { binding: current } });
    const both = await signed(r, r.admin, "claim", null, CLAIM, { binding: current, v: 1 });
    expect(await outcome(r.stub.submit(both))).toEqual(bad("envelope.binding is only for an envelope of v: 2."));
  });
});

// ------------------------------------------------------------ recover

describe.skipIf(DECLARED)("a recover op runs the step it stands for, as recovery (R-DECL-21)", () => {
  it("recover open runs the open step and is judged as recovery: a configuration-recovery thread, a record that names its op; a member's is admin-required", async () => {
    const r = await declaredRoom();
    const bob = await addMember(r, "@bob", "member");
    const open = { op: "open", goal: "repair", scope: [".artroom/**"] };
    const out = await outcome(r.stub.submit(await signed(r, r.admin, "recover", null, open, { binding: null })));
    expect(out).toMatchObject({ ok: { kind: "recover", recover: "open", purpose: "config-recovery", goal: "repair", flags: ["config-recovery"] } });
    expect(await laneRowOf(r, (out.ok as Claim).lane)).toMatchObject({ kind: "recover", purpose: "config-recovery" });
    expect(await act(r, bob, "recover", null, open, { binding: null })).toMatchObject({ refused: true, rule: "admin-required" });
  });

  it("a recover body's op is one of the seven: any other name, also one every object inherits, is invalid-body and unrecorded, before any step is chosen", async () => {
    // The control for the step lookup's own test of `op`: step 5 has refused every other op by then.
    const r = await declaredRoom();
    const seq = await headSeq(r);
    for (const op of ["constructor", "check", "toString"]) {
      const out = await act(r, r.admin, "recover", null, { op, goal: "g", scope: [".artroom/**"] }, { binding: null });
      expect(out, op).toMatchObject({ refused: true, rule: "invalid-body", reason: "body.op must be one of open, take, version, approve, land, release, note." });
      expect((out as Refusal).act, op).toBeUndefined();
    }
    expect(await headSeq(r)).toBe(seq);
  });
});

// ------------------------------------------------------------ the reads before admission

const worker = exports.default as unknown as {
  draft(input: unknown): Promise<DraftedRoom>;
  found(genesis: Genesis, sig: string, draft: string): Promise<RoomId>;
};

/** A room on an imported repository that has no commits, so no main (founding-gaps.test.ts). */
async function roomWithNoMain(): Promise<TestRoom> {
  const admin = newKeyPair();
  const repo = `acme-import/${hex(randomBytes(16))}`;
  const drafted = await worker.draft({ name: `guards/${hex(randomBytes(6))}`, repo: { kind: "import", grant: grant(repo, admin.key) }, admin: { handle: "@founder", key: admin.key }, recovery: newKeyPair().key });
  const world = worldFor(roomIdOf(drafted.genesis));
  placeRepo(world, repo);
  world.artifacts.canonicalRepo();
  const id = await worker.found(drafted.genesis, sign(admin.seed, "artroom-genesis-v1", drafted.genesis), drafted.draft);
  const base = { id, stub: env.ROOMS.get(env.ROOMS.idFromName(id)) as unknown as TestRoom["stub"] };
  return { ...base, genesis: drafted.genesis, world, admin: new Client(base, admin), recovery: new Client(base, newKeyPair()), roomKey: drafted.genesis.roomKey };
}

describe.skipIf(DECLARED)("the reads before admission are chosen by the step an act runs, not by its name (R-PROP-1, R-OBL-3, R-LAND-2)", () => {
  it("a version's reads are made for a declared kind of another name and for a recover version: both are admitted; a head the fork does not hold is head-unknown", async () => {
    const r = await declaredRoom(v2((a) => void (a["submit"] = { ...a["propose"]!, label: "Submit" })));
    const c = await ok<Claim>(r, r.admin, "claim", null, CLAIM);
    const head = pushChange(r, c.lane, { "src/app.ts": "v2" });
    expect(await act(r, r.admin, "submit", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "s" })).toMatchObject({ generation: 1, head, lane: c.lane });
    const rec = await ok<Claim>(r, r.admin, "recover", null, { op: "open", goal: "repair", scope: [".artroom/**"] }, { binding: null });
    const rhead = pushChange(r, rec.lane, { ".artroom/note.txt": "x" });
    expect(await act(r, r.admin, "recover", { lane: rec.lane }, { op: "version", lease: 1, expectedGeneration: 0, head: rhead, summary: "s" }, { binding: null })).toMatchObject({ generation: 1, head: rhead });
    // The other side: the read decides. A head that was never pushed is refused, by either name.
    for (const kind of ["submit", "propose"])
      expect(await act(r, r.admin, kind, { lane: c.lane }, { lease: 1, expectedGeneration: 1, head: "b".repeat(40), summary: "s" }), kind).toMatchObject({ refused: true, rule: "head-unknown" });
  });

  it("a check's reads are made for a declared check act of another name: a check signed as verify binds the integration's tree; one that names another tree is check-binding", async () => {
    const base = policy(requireCheck("unit", { paths: "src/**", by: "@ci", id: "unit-tests" }));
    const doc = v2((a) => void (a["verify"] = { ...a["check"]!, label: "Verify" }), base);
    const cfg = { format: "artroom-checker-v2", act: "verify", volatile: false, timeoutSeconds: 60, runner: R0 };
    const r = await makeRoom({ policy: doc as unknown as PolicyDocument, files: { ".artroom/checkers/unit.json": JSON.stringify(cfg) } });
    const alice = await addMember(r, "@alice", "member");
    const ci = await addMember(r, "@ci", "checker");
    const c = await ok<Claim>(r, alice, "claim", null, { goal: "work", scope: ["src/**"] });
    const head = pushChange(r, c.lane, { "src/app.ts": "v2" });
    await ok(r, alice, "propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "change" });
    await tick(r);
    const preview = (await r.admin.read({ q: "proposal", ref: { lane: c.lane, generation: 1 } }))!.preview as { state: string; integration?: string };
    expect(preview.state).toBe("clean");
    const integration = preview.integration!;
    const tree = r.world.artifacts.commits.get(integration as never)!.tree;
    const config = await inDO(r, (room) => room.core.activePolicy().checkers["unit"]!.digest);
    const body = { obligation: "obl_unit-tests", check: "unit", integration, input: { kind: "tree", tree }, config, runner: R0, volatile: false, ok: true, detail: "42 passed" };
    const target = { lane: c.lane, generation: 1 };
    // The other side first: the tree the room read decides.
    expect(await act(r, ci, "verify", target, { ...body, input: { kind: "tree", tree: "3".repeat(40) } })).toMatchObject({ refused: true, rule: "check-binding", reason: "The check's input is not the integration's tree." });
    expect(await act(r, ci, "verify", target, body)).toMatchObject({ kind: "verify", ok: true, lane: c.lane, generation: 1 });
  });

  it("the first landing's read of main is made for a declared land act of another name: in a repository with no main, ship fails with not-found as land does, and nothing is recorded", async () => {
    const r = await roomWithNoMain();
    await activate(r, v2((a) => void (a["ship"] = { ...a["land"]!, label: "Ship" })));
    const c = await ok<Claim>(r, r.admin, "claim", null, { goal: "g", scope: ["docs/**"] });
    const a = r.world.artifacts;
    const head = a.commit(null, { "docs/a.md": "a\n" });
    a.push(c.lane, head);
    await ok(r, r.admin, "propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "s" });
    const seq = await headSeq(r);
    for (const kind of ["ship", "land"]) {
      const out = await outcome(r.stub.submit(await signed(r, r.admin, kind, { lane: c.lane, generation: 1 }, { lease: 1, head })));
      expect(out.error?.code, kind).toBe("not-found");
      expect(out.error?.message, kind).toMatch(/no main/);
    }
    expect(await headSeq(r)).toBe(seq);
    expect(a.main).toBeNull();
  });

  it("a declaration that gives a target two steps is not run as its first step alone: the act fails as internal and makes no version (R-DECL-5)", async () => {
    // `stagedProblems` keeps such a document from activating through a landing, so this one is activated directly.
    const r = await declaredRoom();
    const c = await ok<Claim>(r, r.admin, "claim", null, CLAIM);
    const head = pushChange(r, c.lane, { "src/app.ts": "v2" });
    await activate(r, v2((a) => void ((a["propose"] as { targets: unknown }).targets = { thread: ["version", "land"] })));
    const seq = await headSeq(r);
    const body = { lease: 1, expectedGeneration: 0, head, summary: "s" };
    expect(await outcome(r.stub.submit(await signed(r, r.admin, "propose", { lane: c.lane }, body)))).toEqual({ error: { code: "internal", message: "The room cannot run propose on this target." } });
    expect(await headSeq(r)).toBe(seq);
    // The other side: with the one step again, the same act makes the version.
    await activate(r, v2());
    expect(await act(r, r.admin, "propose", { lane: c.lane }, body)).toMatchObject({ kind: "propose", generation: 1 });
  });
});

// ------------------------------------------------------------ R-DECL-8

interface Thread {
  readonly lane: string;
  readonly head: string;
  readonly path: string;
}

/**
 * A v2 room with two kinds of thread, each opened by @bob with one version: a `claim` thread, which the code-review
 * acts name, and a `task` thread, which only `task` and `task-version` name. An admin's review is required on both.
 */
async function twoThreads() {
  const rules = policy(requireReview({ paths: "src/**", from: "role:admin", id: "rv" }), requireReview({ paths: "lib/**", from: "role:admin", id: "rv-lib" }));
  const doc = v2((a) => {
    a["task"] = { ...a["claim"]!, label: "Task", threads: ["task"] };
    a["task-version"] = { ...a["propose"]!, label: "Task version", threads: ["task"] };
  }, rules);
  const r = await declaredRoom(doc);
  const bob = await addMember(r, "@bob", "member");
  const open = async (kind: string, version: string, path: string): Promise<Thread> => {
    const c = await ok<Claim>(r, bob, kind, null, { goal: "g", scope: [path] });
    const head = pushChange(r, c.lane, { [path]: "v2" });
    await ok(r, bob, version, { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "s" });
    return { lane: c.lane, head, path };
  };
  return { r, bob, task: await open("task", "task-version", "lib/task.ts"), claim: await open("claim", "propose", "src/app.ts") };
}

type Setup = Awaited<ReturnType<typeof twoThreads>>;
interface Site {
  readonly step: string;
  readonly kind: string;
  /** What the act targets, for the title; a task thread unless said. */
  readonly where?: string;
  readonly by: (s: Setup) => Client;
  readonly target: (t: Thread) => unknown;
  readonly body: (s: Setup, t: Thread) => unknown;
  /** What the same act is on the claim thread, which its declaration names. */
  readonly named: object;
  readonly first?: (s: Setup) => Promise<unknown>;
}

const SITES: readonly Site[] = [
  { step: "take", kind: "claim", by: (s) => s.bob, target: (t) => ({ lane: t.lane }), body: (_s, t) => ({ scope: [t.path, "docs/**"], expectedGeneration: 1, lease: 1 }), named: { kind: "claim", effect: { type: "rescoped" } } },
  {
    step: "version",
    kind: "propose",
    by: (s) => s.bob,
    target: (t) => ({ lane: t.lane }),
    body: (s, t) => ({ lease: 1, expectedGeneration: 1, head: pushChange(s.r, t.lane as never, { [t.path]: "v3" }, t.head as never), summary: "again" }),
    named: { kind: "propose", generation: 2 },
  },
  { step: "comment", kind: "note", where: "a line of a task thread", by: (s) => s.r.admin, target: (t) => ({ lane: t.lane, generation: 1, head: t.head, path: t.path, line: 1 }), body: () => ({ text: "hm" }), named: { kind: "note", text: "hm" } },
  { step: "review", kind: "review", by: (s) => s.r.admin, target: (t) => ({ lane: t.lane, generation: 1 }), body: (_s, t) => ({ head: t.head, verdict: "approve", scope: [t.path], text: "ok" }), named: { kind: "review", verdict: "approve" } },
  {
    step: "check",
    kind: "check",
    by: (s) => s.r.admin,
    target: (t) => ({ lane: t.lane, generation: 1 }),
    body: () => ({ obligation: "obl_none", check: "unit", integration: "1".repeat(40), input: { kind: "tree", tree: "3".repeat(40) }, config: R0, runner: R0, volatile: false, ok: true, detail: "ran" }),
    // Past R-DECL-8, the check is judged on its own terms: this generation has no such obligation.
    named: { refused: true, rule: "obligation-unknown" },
  },
  {
    step: "land",
    kind: "land",
    by: (s) => s.bob,
    target: (t) => ({ lane: t.lane, generation: 1 }),
    body: (_s, t) => ({ lease: 1, head: t.head }),
    named: { kind: "land", lane: expect.any(String) },
    first: (s) => ok(s.r, s.r.admin, "review", { lane: s.claim.lane, generation: 1 }, { head: s.claim.head, verdict: "approve", scope: [s.claim.path], text: "ok" }),
  },
  { step: "release", kind: "release", by: (s) => s.bob, target: (t) => ({ lane: t.lane }), body: () => ({ lease: 1 }), named: { kind: "release" } },
];

describe.skipIf(DECLARED)("an act on a thread whose kind its declaration does not name is wrong-thread, at every step (R-DECL-8)", () => {
  for (const site of SITES)
    it(`the ${site.step} step: ${site.kind} on ${site.where ?? "a task thread"}, which its threads do not name, is wrong-thread and recorded; on a claim thread it is judged as ever`, async () => {
      const s = await twoThreads();
      const out = await act(s.r, site.by(s), site.kind, site.target(s.task), site.body(s, s.task));
      expect(out).toMatchObject({
        refused: true,
        rule: "wrong-thread",
        reason: `${s.task.lane} is a task thread, which ${site.kind} does not act on.`,
        fix: "Act on it with an act whose threads name task.",
      });
      expect(await invariantsOf(s.r, (out as Refusal).act!)).toContain('"rule":"R-DECL-8","held":false');
      // The other side: the same act on a thread of a kind it names.
      await site.first?.(s);
      expect(await act(s.r, site.by(s), site.kind, site.target(s.claim), site.body(s, s.claim))).toMatchObject(site.named);
    });

  it("a comment on an entry: a declared note on an entry of a configuration-recovery thread is wrong-thread and recorded; a recover note on it, and a note on an entry of a task thread, are admitted (R-DECL-21)", async () => {
    const s = await twoThreads();
    const rec = await ok<Claim>(s.r, s.r.admin, "recover", null, { op: "open", goal: "repair", scope: [".artroom/**"] }, { binding: null });
    const out = await act(s.r, s.r.admin, "note", { act: rec.id }, { text: "hi" });
    expect(out).toMatchObject({
      refused: true,
      rule: "wrong-thread",
      reason: `${rec.lane} is a configuration-recovery thread, on which only recover ops act.`,
      fix: "Use the platform kind recover, with an admin's own key.",
    });
    expect(await invariantsOf(s.r, (out as Refusal).act!)).toContain('"rule":"R-DECL-8","held":false');
    expect(await act(s.r, s.r.admin, "recover", { act: rec.id }, { op: "note", text: "hi" }, { binding: null })).toMatchObject({ kind: "recover", recover: "note", text: "hi" });
    // An entry target is not a thread target: `note` does not name task threads, and its comment on a task thread's entry is admitted.
    expect(await act(s.r, s.r.admin, "note", { act: s.task.lane }, { text: "on the entry" })).toMatchObject({ kind: "note", text: "on the entry" });
  });

  it("an entry that belongs to no thread takes a declared comment: a note on a roster entry is admitted; a recover note on it is wrong-thread", async () => {
    const r = await declaredRoom();
    const bob = await addMember(r, "@bob", "member");
    const entry = String(await inDO(r, (room) => room.core.sql.all("SELECT id FROM entries WHERE lane IS NULL AND seq > 0 ORDER BY seq LIMIT 1")[0]!["id"]));
    expect(await act(r, bob, "note", { act: entry }, { text: "welcome" })).toMatchObject({ kind: "note", text: "welcome", anchor: { act: entry } });
    expect(await act(r, r.admin, "recover", { act: entry }, { op: "note", text: "x" }, { binding: null })).toMatchObject({ refused: true, rule: "wrong-thread", reason: "recover acts only on a configuration-recovery thread." });
  });

  it("R-DECL-8 is not applied under a v1 document: the legacy acts act on a claim thread and on a legacy recovery lane", async () => {
    const r = await makeRoom();
    const c = await r.admin.ok<Claim>("claim", null, CLAIM);
    const head = pushChange(r, c.lane, { "src/app.ts": "v2" });
    expect(await act(r, r.admin, "propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "s" }, { binding: null })).toMatchObject({ kind: "propose", generation: 1 });
    const rec = await r.admin.ok<Claim>("claim", null, { goal: "repair", scope: [".artroom/**"], purpose: "config-recovery" });
    expect(await act(r, r.admin, "note", { act: rec.id }, { text: "hi" }, { binding: null })).toMatchObject({ kind: "note", text: "hi" });
    expect(await act(r, r.admin, "release", { lane: rec.lane }, { lease: 1 }, { binding: null })).toMatchObject({ kind: "release" });
  });

  it("renew, a platform kind, acts on a thread of any kind: a task thread and a configuration-recovery thread are renewed", async () => {
    // The control for the thread rule's exemption of `renew`: no renewal reaches that rule at all.
    const s = await twoThreads();
    expect(await act(s.r, s.bob, "renew", { lane: s.task.lane }, { lease: 1 }, { binding: null })).toMatchObject({ kind: "renew", lane: s.task.lane });
    const rec = await ok<Claim>(s.r, s.r.admin, "recover", null, { op: "open", goal: "repair", scope: [".artroom/**"] }, { binding: null });
    expect(await act(s.r, s.r.admin, "renew", { lane: rec.lane }, { lease: 1 }, { binding: null })).toMatchObject({ kind: "renew", lane: rec.lane });
  });
});

// ------------------------------------------------------------ grants

describe.skipIf(DECLARED)("a delegate op in a v2 room is judged by the map its grantor signed (R-DECL-17)", () => {
  it("a binding that is not the active one is binding-stale, and a kind the grantor's role may not sign is delegation-invalid, both unrecorded; the active map is admitted", async () => {
    const r = await declaredRoom();
    const bob = await addMember(r, "@bob", "member");
    const k = newKeyPair();
    const op = (acts: Record<string, string>, kinds: string[] = []) => ({ op: "delegate", to: k.key, kinds, acts, lanes: "*", expiresAt: iso(clock.now + day) });
    const current = (await bindingIn(r, "claim"))!;
    const seq = await headSeq(r);
    expect(await act(r, bob, "roster", null, op({ claim: `sha256:${"2".repeat(64)}` }), { binding: null })).toMatchObject({ refused: true, rule: "binding-stale", current: { binding: current } });
    expect(await act(r, bob, "roster", null, op({ check: (await bindingIn(r, "check"))! }), { binding: null })).toMatchObject({ refused: true, rule: "delegation-invalid", reason: "The role member may not grant check." });
    expect(await headSeq(r)).toBe(seq);
    expect(await act(r, bob, "roster", null, op({ claim: current }, ["renew"]), { binding: null })).toMatchObject({ kind: "roster" });
  });
});

// ------------------------------------------------------------ the retry lookup

/** A v2 room with one accepted claim. With `returned`, the room is then under a v1 document, where step 1 fails for that envelope. */
async function accepted(returned = false) {
  const r = await declaredRoom();
  const claim = await signed(r, r.admin, "claim", null, CLAIM);
  const record = (await outcome(r.stub.submit(claim))).ok as ActRecord;
  if (returned) await activate(r, policy());
  return { r, claim, record, seq: await headSeq(r), envelope: claim.envelope as unknown as Record<string, unknown> };
}
const NOT_V1 = "envelope.binding is not a field of this type.";

describe.skipIf(DECLARED)("the retry lookup answers only the exact envelope and signature of an accepted act (R-DECL-16, R-IDEM-2)", () => {
  it("the accepted envelope with its own signature gets its original receipt when step 1 no longer admits it; one never accepted stays bad-request", async () => {
    const { r, claim, record, seq } = await accepted(true);
    expect(await outcome(r.stub.submit(claim))).toEqual({ ok: record });
    const fresh = await signed(r, r.admin, "claim", null, { goal: "h", scope: ["docs/**"] }, { binding: (claim.envelope as unknown as { binding: string }).binding });
    expect(await outcome(r.stub.submit(fresh))).toEqual(bad(NOT_V1));
    expect(await headSeq(r)).toBe(seq);
  });

  it("a submission that is null is bad-request, not an internal failure", async () => {
    const { r } = await accepted();
    expect(await outcome(r.stub.submit(null as never))).toEqual(bad("act must be an object."));
  });

  it("a submission that is nothing at all is bad-request, not an internal failure", async () => {
    const { r } = await accepted();
    expect(await outcome(r.stub.submit(undefined as never))).toEqual(bad("act must be an object."));
  });

  it("a submission that is an array is not answered as a retry, though it has the accepted envelope and signature as named fields", async () => {
    // JSON gives an array no named field, but the Durable Object boundary carries them.
    const { r, claim, seq } = await accepted();
    const array = Object.assign([], { envelope: claim.envelope, sig: claim.sig });
    expect(await outcome(r.stub.submit(array as never))).toEqual(bad("act must be an object."));
    expect(await headSeq(r)).toBe(seq);
  });

  for (const field of ["envelope", "sig"] as const)
    it(`a retry is answered only for a submission whose ${field} is its own field: an inherited one, beside another field, is bad-request`, async () => {
      const { r, claim } = await accepted();
      const other = field === "envelope" ? "sig" : "envelope";
      const input = Object.assign(Object.create({ [field]: claim[field] }) as object, { [other]: claim[other], extra: 1 });
      expect(await direct(r, input)).toEqual(bad("act must be an object."));
    });

  it("a retry is answered only for a signature that is text: the accepted signature as an array of its characters is bad-request", async () => {
    const { r, claim, seq } = await accepted();
    expect(await outcome(r.stub.submit({ envelope: claim.envelope, sig: [...claim.sig] } as never))).toEqual(bad("act.sig must be an Ed25519 signature in base64url."));
    // Nor a signature that is text but not base64url, or of another act: neither verifies.
    expect(await outcome(r.stub.submit({ envelope: claim.envelope, sig: "!".repeat(86) } as never))).toEqual(bad("act.sig must be an Ed25519 signature in base64url."));
    expect(await headSeq(r)).toBe(seq);
  });

  it("a submission whose envelope is null is bad-request, not an internal failure", async () => {
    const { r, claim } = await accepted();
    expect(await outcome(r.stub.submit({ envelope: null, sig: claim.sig } as never))).toEqual(bad("envelope must be an object."));
  });

  it("a submission whose envelope is undefined is bad-request, not an internal failure", async () => {
    const { r, claim } = await accepted();
    expect(await outcome(r.stub.submit({ envelope: undefined, sig: claim.sig } as never))).toEqual(bad("act.envelope is undefined; omit absent fields."));
  });

  for (const [field, message] of [
    ["actor", "envelope.actor must be a key ID."],
    ["idempotencyKey", "envelope.idempotencyKey must be 1 to 64 characters from A-Z, a-z, 0-9, _ and -."],
  ] as const)
    it(`the accepted envelope with an ${field} that is not text is not a retry: in an array, in an object, or as true, null or a number, it is bad-request`, async () => {
      const { r, claim, envelope, seq } = await accepted();
      for (const value of [[envelope[field]], { is: envelope[field] }, true, null, 7])
        expect(await outcome(r.stub.submit({ envelope: { ...envelope, [field]: value }, sig: claim.sig } as never)), JSON.stringify(value)).toEqual(bad(message));
      expect(await headSeq(r)).toBe(seq);
    });

  it("an envelope outside the signed JSON profile, or over the size limit, that fails step 1 keeps step 1's bad-request", async () => {
    const { r, claim, envelope } = await accepted();
    expect(await outcome(r.stub.submit({ envelope: { ...envelope, v: 1.5 }, sig: claim.sig } as never))).toEqual(bad("envelope.v must be 1 or 2."));
    const large = { ...envelope, v: 3, body: { goal: "g".repeat(70_000), scope: ["src/**"] } };
    expect(await outcome(r.stub.submit({ envelope: large, sig: claim.sig } as never))).toEqual(bad("envelope.v must be 1 or 2."));
  });

  it("the accepted envelope under another room's name, signed again by its actor, is not a retry: bad-request", async () => {
    // The control for the lookup's test of the room: an envelope that names another room has another digest.
    const { r, envelope, seq } = await accepted(true);
    const other = await makeRoom();
    const moved = { ...envelope, room: other.id };
    expect(await outcome(r.stub.submit({ envelope: moved, sig: sign(r.admin.keys.seed, "artroom-envelope-v1", moved) } as never))).toEqual(bad(NOT_V1));
    expect(await headSeq(r)).toBe(seq);
  });
});

// ------------------------------------------------------------ facts for wording

describe.skipIf(DECLARED)("an unrecorded refusal's {generation} is filled only by a positive integer (R-DECL-13)", () => {
  async function worded() {
    const r = await declaredRoom(v2((a) => void (a["release"] = { ...a["release"]!, who: { roles: ["maintainer"] }, refusals: { "role-forbids": { reason: "generation [{generation}]", fix: "None." } } })));
    const bob = await addMember(r, "@bob", "member");
    const said = async (generation: unknown) => {
      const out = await act(r, bob, "release", { lane: "act_1_00000000", generation }, { lease: 1 });
      expect(out).toMatchObject({ refused: true, rule: "role-forbids" });
      return (out as Refusal).reason;
    };
    return { r, bob, said };
  }

  it("a generation given as text, or in an array, fills nothing; the number 3 fills 3", async () => {
    const { said } = await worded();
    expect(await said("3")).toBe("generation []");
    expect(await said([3])).toBe("generation []");
    expect(await said(3)).toBe("generation [3]");
  });

  it("generation 0 fills nothing; generation 1 fills 1", async () => {
    const { said } = await worded();
    expect(await said(0)).toBe("generation []");
    expect(await said(1)).toBe("generation [1]");
  });

  it("a generation that is a number but not an integer never reaches the wording: the envelope is outside the signed JSON profile, bad-request (R-SIG-3)", async () => {
    // The control for the integer test's other reading: step 1's canonical form admits only safe integers.
    const { r, bob } = await worded();
    for (const generation of [1.5, 2 ** 53])
      expect(await outcome(r.stub.submit(await signedRaw(r, bob, { lane: "act_1_00000000", generation }))), String(generation)).toEqual(bad("The envelope is outside the signed JSON profile: a number is not a safe integer"));
  });
});

/** A release on `target`, with a signature made over a stand-in: canonical form is judged before the signature. */
async function signedRaw(r: TestRoom, c: Client, target: { lane: string; generation: number }) {
  const s = await signed(r, c, "release", { lane: target.lane, generation: 1 }, { lease: 1 });
  return { envelope: { ...(s.envelope as unknown as Record<string, unknown>), target }, sig: s.sig } as never;
}

// ------------------------------------------------------------ records and rows

describe.skipIf(DECLARED)("records and thread rows keep what the act and its document say (R-DECL-6, R-DECL-9, R-DECL-21)", () => {
  const start = (a: Record<string, ActDeclaration>) =>
    void (a["start"] = { label: "Start", targets: { none: ["open"], thread: ["take"] }, threads: ["start"], who: { roles: ["member"] }, hold: { scope: "body.scope", workspace: true } });
  const rowOf = (r: TestRoom, lane: string) => inDO(r, (room) => room.core.sql.all("SELECT goal, conflict, lease_ms, expires_ms FROM lanes WHERE id = ?", lane)[0]);

  it("a record's kind is the act's own kind, not the name of the step's record: a declared opener named start returns kind start, and a recover open returns kind recover", async () => {
    const r = await declaredRoom(v2(start));
    const bob = await addMember(r, "@bob", "member");
    expect(await act(r, bob, "start", null, { scope: ["src/**"] })).toMatchObject({ kind: "start", purpose: "ordinary" });
    expect(await act(r, r.admin, "recover", null, { op: "open", goal: "g", scope: [".artroom/**"] }, { binding: null })).toMatchObject({ kind: "recover" });
    expect(await act(r, r.admin, "claim", null, CLAIM)).toMatchObject({ kind: "claim" });
  });

  it("a thread opened by an act with no goal field stores empty text as its goal, and its record's goal is empty text", async () => {
    const r = await declaredRoom(v2(start));
    const bob = await addMember(r, "@bob", "member");
    const out = await outcome(r.stub.submit(await signed(r, bob, "start", null, { scope: ["src/**"] })));
    expect(out).toMatchObject({ ok: { kind: "start", goal: "" } });
    expect(await rowOf(r, (out.ok as Claim).lane)).toMatchObject({ goal: "" });
    // The other side: a goal that is text is stored as given.
    const c = await ok<Claim>(r, r.admin, "claim", null, { goal: "the goal", scope: ["docs/**"] });
    expect(await rowOf(r, c.lane)).toMatchObject({ goal: "the goal" });
  });

  it("a thread opened under a v1 document takes the room's current lease and records no lease length; under a v2 document it records the length (R-DECL-9)", async () => {
    const legacy = await makeRoom();
    const c = await act<Claim>(legacy, legacy.admin, "claim", null, CLAIM, { binding: null });
    expect(c).toMatchObject({ kind: "claim", lease: { generation: 1, expiresAt: iso(clock.now + LEASE) } });
    expect(await rowOf(legacy, (c as Claim).lane)).toMatchObject({ lease_ms: null, expires_ms: clock.now + LEASE });
    const r = await declaredRoom();
    const d = await ok<Claim>(r, r.admin, "claim", null, CLAIM);
    expect(await rowOf(r, d.lane)).toMatchObject({ lease_ms: LEASE, expires_ms: clock.now + LEASE });
  });

  it("a thread opened under a v1 document records no conflict mode; under a v2 document it records the policy's (R-DECL-6)", async () => {
    const legacy = await makeRoom();
    const c = await legacy.admin.ok<Claim>("claim", null, CLAIM);
    expect((await rowOf(legacy, c.lane))!["conflict"]).toBeNull();
    const r = await declaredRoom();
    const d = await ok<Claim>(r, r.admin, "claim", null, CLAIM);
    expect((await rowOf(r, d.lane))!["conflict"]).toBe(v2().lanes);
  });
});
