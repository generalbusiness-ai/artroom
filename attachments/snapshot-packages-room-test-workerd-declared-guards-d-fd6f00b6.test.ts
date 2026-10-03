/**
 * Declared acts stage 2 (request fd6f00b6): guards of
 * packages/room/src/admission.ts that had no mutant (family D of the guard
 * audit). They fill a declaration's refusal wording with the facts of the
 * thread an act names, keep a policy rule's own words, word the recover
 * refusal, and keep a version's summary and a comment's text as text.
 *
 * Envelopes are signed by the test itself (declared-support.ts), so the
 * harness converts nothing here, and the file runs in the legacy run only.
 */
import { describe, expect, it } from "vitest";
import type { ActDeclaration, ActRecord, Claim, PlatformRule, PolicyDocument, Refusal } from "@generalbusiness/artroom-contract";
import { policy, requireReview, rule } from "@generalbusiness/artroom-policy";
import type { Wire } from "../../src/errors.ts";
import { act, activate, declaredRoom, inDO, ok, signed, v2 } from "./declared-support.ts";
import { addMember, DECLARED, expectOk, expectRefusal, pushChange, tick, type TestRoom } from "./support.ts";

/** A lane ID, and an entry ID, that no room in this file has. */
const NO_THREAD = "act_999_00000000";
const DIGEST = `sha256:${"0".repeat(64)}` as const;

/** A wording that reports every fact of a thread, so a test reads back what filled each slot. */
const THREAD = { reason: "lane [{lane}] holder [{holder}] generation [{generation}] kind [{kind}]", fix: "obligation [{obligation}] path [{path}]" } as const;
const thread = (lane: string, holder: string, generation: number | "", kind: string) => `lane [${lane}] holder [${holder}] generation [${generation}] kind [${kind}]`;

/** A v2 document in which each named kind words the listed refusal codes with `wording`. */
function wordedDoc(codes: Readonly<Record<string, readonly PlatformRule[]>>, base: PolicyDocument = policy(), wording: { readonly reason: string; readonly fix: string } = THREAD) {
  return v2((a) => {
    for (const [kind, list] of Object.entries(codes)) a[kind] = { ...a[kind]!, refusals: Object.fromEntries(list.map((c) => [c, wording])) } as ActDeclaration;
  }, base);
}

const reviewed = () => policy(requireReview({ paths: "src/**", from: "role:admin", id: "rv" }));

/** A thread @bob opened and holds, with one version whose head is returned. */
async function versioned(r: TestRoom) {
  const bob = await addMember(r, "@bob", "member");
  const c = await ok<Claim>(r, bob, "claim", null, { goal: "g", scope: ["src/**"] });
  const head = pushChange(r, c.lane, { "src/app.ts": "v2" });
  await ok(r, bob, "propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "s" });
  return { bob, lane: c.lane, head };
}

// ------------------------------------------------------------ the thread's facts, step by step

describe.skipIf(DECLARED)("refusal wording is filled with the facts of the thread the act names, at each step (R-DECL-13)", () => {
  it("a refused take-over reports the thread's holder and generation; a thread that does not exist reports neither", async () => {
    const r = await declaredRoom(wordedDoc({ claim: ["lane-held", "lane-unknown"] }));
    const bob = await addMember(r, "@bob", "member");
    const c = await ok<Claim>(r, r.admin, "claim", null, { goal: "g", scope: ["src/**"] });
    const held = expectRefusal(await act(r, bob, "claim", { lane: c.lane }, { scope: ["src/**"], expectedGeneration: 0 }), "lane-held");
    expect(held.reason).toBe(thread(c.lane, "@admin", 0, "claim"));
    const none = expectRefusal(await act(r, bob, "claim", { lane: NO_THREAD }, { scope: ["src/**"], expectedGeneration: 0 }), "lane-unknown");
    expect(none.reason).toBe(thread(NO_THREAD, "", "", "claim"));
  });

  it("a refused version reports the thread's holder and generation; a thread that does not exist reports neither", async () => {
    const r = await declaredRoom(wordedDoc({ propose: ["not-holder", "lane-unknown"] }));
    const bob = await addMember(r, "@bob", "member");
    const c = await ok<Claim>(r, r.admin, "claim", null, { goal: "g", scope: ["src/**"] });
    const body = { lease: 1, expectedGeneration: 0, head: "a".repeat(40), summary: "s" };
    const other = expectRefusal(await act(r, bob, "propose", { lane: c.lane }, body), "not-holder");
    expect(other.reason).toBe(thread(c.lane, "@admin", 0, "propose"));
    const none = expectRefusal(await act(r, bob, "propose", { lane: NO_THREAD }, body), "lane-unknown");
    expect(none.reason).toBe(thread(NO_THREAD, "", "", "propose"));
  });

  it("a refused comment on a line reports the thread's holder; a line of a thread that does not exist reports none", async () => {
    const r = await declaredRoom(wordedDoc({ note: ["head-mismatch", "lane-unknown"] }));
    const { lane, head } = await versioned(r);
    const line = { generation: 1, head: "b".repeat(40), path: "src/app.ts", line: 1 };
    expect(head).not.toBe(line.head);
    const wrong = expectRefusal(await act(r, r.admin, "note", { lane, ...line }, { text: "hi" }), "head-mismatch");
    expect(wrong.reason).toBe(thread(lane, "@bob", 1, "note"));
    const none = expectRefusal(await act(r, r.admin, "note", { lane: NO_THREAD, ...line }, { text: "hi" }), "lane-unknown");
    expect(none.reason).toBe(thread(NO_THREAD, "", 1, "note"));
  });

  it("a refused comment on an entry reports the holder, generation and lane of the entry's thread, which the target does not name; an entry that does not exist reports none", async () => {
    const words = { reason: "holder [{holder}] generation [{generation}]", fix: "lane [{lane}]" };
    const r = await declaredRoom(wordedDoc({ note: ["wrong-thread", "lane-unknown"] }, policy(), words));
    // A declared act on an entry of a configuration-recovery thread is wrong-thread (R-DECL-21): the only refusal of a
    // comment on an entry that is decided after its thread is read.
    const rec = await ok<Claim>(r, r.admin, "recover", null, { op: "open", goal: "repair", scope: [".artroom/**"] }, { binding: null });
    const wrong = expectRefusal(await act(r, r.admin, "note", { act: rec.id }, { text: "hi" }), "wrong-thread");
    expect(wrong.reason).toBe("holder [@admin] generation [0]");
    expect(wrong.fix).toBe(`lane [${rec.lane}]`);
    const none = expectRefusal(await act(r, r.admin, "note", { act: NO_THREAD }, { text: "hi" }), "lane-unknown");
    expect(none.reason).toBe("holder [] generation []");
    expect(none.fix).toBe("lane []");
  });

  it("a refused review reports the thread's holder; a thread that does not exist reports none", async () => {
    const r = await declaredRoom(wordedDoc({ review: ["head-mismatch", "lane-unknown"] }));
    const { lane } = await versioned(r);
    const body = { head: "b".repeat(40), verdict: "approve", scope: ["src/**"], text: "ok" };
    const wrong = expectRefusal(await act(r, r.admin, "review", { lane, generation: 1 }, body), "head-mismatch");
    expect(wrong.reason).toBe(thread(lane, "@bob", 1, "review"));
    const none = expectRefusal(await act(r, r.admin, "review", { lane: NO_THREAD, generation: 1 }, body), "lane-unknown");
    expect(none.reason).toBe(thread(NO_THREAD, "", 1, "review"));
  });

  it("a refusal reports the generation the act names, and the thread's own generation only when the act names none", async () => {
    const r = await declaredRoom(wordedDoc({ review: ["lane-unknown"], release: ["not-holder"] }));
    const { lane } = await versioned(r);
    // The thread is at generation 1; the review names generation 3, which does not exist.
    const named = expectRefusal(await act(r, r.admin, "review", { lane, generation: 3 }, { head: "b".repeat(40), verdict: "approve", scope: ["src/**"], text: "ok" }), "lane-unknown");
    expect(named.reason).toBe(thread(lane, "@bob", 3, "review"));
    // A release names a thread and no generation: the thread's own is reported.
    const own = expectRefusal(await act(r, r.admin, "release", { lane }, { lease: 1 }), "not-holder");
    expect(own.reason).toBe(thread(lane, "@bob", 1, "release"));
  });

  it("a refused check reports the thread's holder and the obligation it names; a thread that does not exist reports neither", async () => {
    const words = { reason: "holder [{holder}] generation [{generation}]", fix: "obligation [{obligation}]" };
    const r = await declaredRoom(wordedDoc({ check: ["obligation-unknown", "lane-unknown"] }, policy(), words));
    const { lane, head } = await versioned(r);
    const body = { obligation: "obl_none", check: "unit", integration: head, input: { kind: "tree", tree: head }, config: DIGEST, runner: DIGEST, volatile: false, ok: true, detail: "d" };
    const unknown = expectRefusal(await act(r, r.admin, "check", { lane, generation: 1 }, body), "obligation-unknown");
    expect(unknown.reason).toBe("holder [@bob] generation [1]");
    expect(unknown.fix).toBe("obligation [obl_none]");
    // The obligation is a fact of a check on a thread that exists: before the thread is found, the slot is empty.
    const none = expectRefusal(await act(r, r.admin, "check", { lane: NO_THREAD, generation: 1 }, body), "lane-unknown");
    expect(none.reason).toBe("holder [] generation [1]");
    expect(none.fix).toBe("obligation []");
  });

  it("a refused landing reports the thread's holder; a thread that does not exist reports none", async () => {
    const r = await declaredRoom(wordedDoc({ land: ["not-holder", "lane-unknown"] }));
    const { lane, head } = await versioned(r);
    const other = expectRefusal(await act(r, r.admin, "land", { lane, generation: 1 }, { lease: 1, head }), "not-holder");
    expect(other.reason).toBe(thread(lane, "@bob", 1, "land"));
    const none = expectRefusal(await act(r, r.admin, "land", { lane: NO_THREAD, generation: 1 }, { lease: 1, head }), "lane-unknown");
    expect(none.reason).toBe(thread(NO_THREAD, "", 1, "land"));
  });

  it("a landing refused obligation-open reports the open obligation; a landing refused for another cause reports none", async () => {
    const r = await declaredRoom(wordedDoc({ land: ["obligation-open", "head-mismatch"] }, reviewed()));
    const { bob, lane, head } = await versioned(r);
    const open = expectRefusal(await act(r, bob, "land", { lane, generation: 1 }, { lease: 1, head }), "obligation-open");
    expect(open.fix).toBe("obligation [obl_rv] path []");
    const wrong = expectRefusal(await act(r, bob, "land", { lane, generation: 1 }, { lease: 1, head: "b".repeat(40) }), "head-mismatch");
    expect(wrong.fix).toBe("obligation [] path []");
  });
});

// ------------------------------------------------------------ a policy rule's own words

describe.skipIf(DECLARED)("a policy rule's refusal keeps the rule's own words wherever rules run (R-DECL-13)", () => {
  const WORDS = { reason: "Declared reason for {kind}.", fix: "Declared fix." } as const;
  /** A require rule that cannot be evaluated: its condition is not true or false, so the act is refused policy-type-error. */
  const typed = () => rule({ id: "typed", kind: "require", paths: ["src/**"], when: "'not a boolean'", obligation: { type: "review", from: ["role:admin"], count: 1, allowSelf: false } });
  const RULE_REASON = "Policy rule typed could not be evaluated (result_type: the expression must return true or false).";
  const RULE_FIX = "Ask an admin to correct policy rule typed.";

  it("a version refused by a require rule keeps the rule's reason and fix, though the declaration words that code; a platform refusal of the same act takes the declaration's", async () => {
    const r = await declaredRoom(wordedDoc({ propose: ["policy-type-error", "generation-moved"] }, policy(typed()), WORDS));
    const c = await ok<Claim>(r, r.admin, "claim", null, { goal: "g", scope: ["src/**"] });
    const head = pushChange(r, c.lane, { "src/app.ts": "v2" });
    const moved = expectRefusal(await act(r, r.admin, "propose", { lane: c.lane }, { lease: 1, expectedGeneration: 5, head, summary: "s" }), "generation-moved");
    expect(moved).toMatchObject({ reason: "Declared reason for propose.", fix: "Declared fix." });
    const out = expectRefusal(await act(r, r.admin, "propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "s" }), "policy-type-error");
    expect(out.reason).toBe(RULE_REASON);
    expect(out.fix).toBe(RULE_FIX);
  });

  it("a landing refused by a land rule keeps the rule's reason and fix, though the rule's ID is a platform code the declaration words; a platform refusal of the same act takes the declaration's", async () => {
    // The document's own objection-open rule replaces the default one (R-POL-7), and blocks every landing.
    const blocks = rule({ id: "objection-open", kind: "land", block: "true", reason: "The rule's own reason.", fix: "The rule's own fix." });
    const r = await declaredRoom(wordedDoc({ land: ["objection-open", "head-mismatch"] }, policy(blocks), WORDS));
    const { bob, lane, head } = await versioned(r);
    const wrong = expectRefusal(await act(r, bob, "land", { lane, generation: 1 }, { lease: 1, head: "b".repeat(40) }), "head-mismatch");
    expect(wrong).toMatchObject({ reason: "Declared reason for land.", fix: "Declared fix." });
    const out = expectRefusal(await act(r, bob, "land", { lane, generation: 1 }, { lease: 1, head }), "objection-open");
    expect(out.reason).toBe("The rule's own reason.");
    expect(out.fix).toBe("The rule's own fix.");
  });

  it("a landing refused by a block that a require rule left on the version at an activation (R-POL-9) keeps the rule's reason and fix; a platform refusal of the same act takes the declaration's", async () => {
    const codes = { land: ["policy-type-error", "head-mismatch"] } as const;
    const r = await declaredRoom(wordedDoc(codes, policy(), WORDS));
    const { bob, lane, head } = await versioned(r);
    // A new policy whose require rule fails on this version: the recomputation stores the rule's refusal on it.
    await activate(r, wordedDoc(codes, policy(typed()), WORDS));
    await tick(r, 2);
    const stored = await inDO(r, (room) => room.core.sql.all("SELECT blocked FROM generations WHERE lane = ? AND generation = 1", lane)[0]!["blocked"]);
    expect(JSON.parse(String(stored))).toMatchObject({ rule: "policy-type-error", reason: RULE_REASON });
    const wrong = expectRefusal(await act(r, bob, "land", { lane, generation: 1 }, { lease: 1, head: "b".repeat(40) }), "head-mismatch");
    expect(wrong).toMatchObject({ reason: "Declared reason for land.", fix: "Declared fix." });
    const out = expectRefusal(await act(r, bob, "land", { lane, generation: 1 }, { lease: 1, head }), "policy-type-error");
    expect(out.reason).toBe(RULE_REASON);
    expect(out.fix).toBe(RULE_FIX);
  });
});

// ------------------------------------------------------------ recover

describe.skipIf(DECLARED)("recover acts only on configuration-recovery threads (R-DECL-21)", () => {
  it("recover on an ordinary thread is refused wrong-thread in words that name the thread; on an entry of no thread, in words that name none", async () => {
    const r = await declaredRoom();
    const c = await ok<Claim>(r, r.admin, "claim", null, { goal: "g", scope: ["src/**"] });
    const onThread = expectRefusal(await act(r, r.admin, "recover", { lane: c.lane }, { op: "release", lease: 1 }, { binding: null }), "wrong-thread");
    expect(onThread.reason).toBe(`${c.lane} is not a configuration-recovery thread; recover acts only on those.`);
    const noThread = String(await inDO(r, (room) => room.core.sql.all("SELECT id FROM entries WHERE lane IS NULL AND seq > 0 ORDER BY seq LIMIT 1")[0]!["id"]));
    const onEntry = expectRefusal(await act(r, r.admin, "recover", { act: noThread }, { op: "note", text: "x" }, { binding: null }), "wrong-thread");
    expect(onEntry.reason).toBe("recover acts only on a configuration-recovery thread.");
  });

  it("a recover approve stores the review step's own body, without the op, as a declared review does", async () => {
    // No read returns this stored body, so the test reads the row itself.
    const body = (r: TestRoom, id: string) => inDO(r, (room) => Object.keys((JSON.parse(String(room.core.sql.all("SELECT body FROM evidence WHERE act = ?", id)[0]!["body"])) as { body: object }).body).sort());
    const r = await declaredRoom(v2(() => {}, reviewed()));
    const c = await ok<Claim>(r, r.admin, "recover", null, { op: "open", goal: "g", scope: [".artroom/**"] }, { binding: null });
    const head = pushChange(r, c.lane, { ".artroom/note.txt": "x" });
    await ok(r, r.admin, "recover", { lane: c.lane }, { op: "version", lease: 1, expectedGeneration: 0, head, summary: "s" }, { binding: null });
    const approved = await ok(r, r.admin, "recover", { lane: c.lane, generation: 1 }, { op: "approve", head, verdict: "approve", scope: [".artroom/**"], text: "ok" }, { binding: null });
    expect(await body(r, approved.id)).toEqual(["head", "scope", "text", "verdict"]);
    const v = await versioned(r);
    const declared = await ok(r, r.admin, "review", { lane: v.lane, generation: 1 }, { head: v.head, verdict: "approve", scope: ["src/**"], text: "ok" });
    expect(await body(r, declared.id)).toEqual(["head", "scope", "text", "verdict"]);
  });

  it("renew, a platform kind, renews a configuration-recovery thread and a thread whose kind the declared acts do not name (R-DECL-8)", async () => {
    const r = await declaredRoom(v2((a) => void (a["release"] = { ...a["release"]!, threads: ["room"] })));
    const c = await ok<Claim>(r, r.admin, "claim", null, { goal: "g", scope: ["src/**"] });
    expectRefusal(await act(r, r.admin, "release", { lane: c.lane }, { lease: 1 }), "wrong-thread");
    expect(expectOk(await act(r, r.admin, "renew", { lane: c.lane }, { lease: 1 }, { binding: null })).kind).toBe("renew");
    const rec = await ok<Claim>(r, r.admin, "recover", null, { op: "open", goal: "repair", scope: [".artroom/**"] }, { binding: null });
    expect(expectOk(await act(r, r.admin, "renew", { lane: rec.lane }, { lease: 1 }, { binding: null })).kind).toBe("renew");
  });
});

// ------------------------------------------------------------ text fields, and facts before the target is judged

describe.skipIf(DECLARED)("a version's summary and a comment's text are text in the room's rows and records (R-DECL-12)", () => {
  /** The declaration of `kind` with no body fields of its own. */
  const bare = (kind: string) => v2((a) => {
    const { body: _body, ...rest } = a[kind]!;
    void _body;
    a[kind] = rest;
  });

  it("a version made by an act that declares no summary is admitted, and is stored and returned with an empty summary; a text summary is kept", async () => {
    const r = await declaredRoom(bare("propose"));
    const c = await ok<Claim>(r, r.admin, "claim", null, { goal: "g", scope: ["src/**"] });
    const head = pushChange(r, c.lane, { "src/app.ts": "v2" });
    const out = (await r.stub.submit(await signed(r, r.admin, "propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head }))) as unknown as Wire<ActRecord | Refusal>;
    expect(out).toMatchObject({ ok: { kind: "propose", generation: 1, summary: "" } });
    expect(await inDO(r, (room) => room.core.sql.all("SELECT summary FROM generations WHERE lane = ?", c.lane)[0]!["summary"])).toBe("");
    const kept = await declaredRoom();
    const v = await versioned(kept);
    expect(await inDO(kept, (room) => room.core.sql.all("SELECT summary FROM generations WHERE lane = ?", v.lane)[0]!["summary"])).toBe("s");
  });

  it("a comment made by an act that declares no text returns a record whose text is empty; a text is kept", async () => {
    const r = await declaredRoom(bare("note"));
    const c = await ok<Claim>(r, r.admin, "claim", null, { goal: "g", scope: ["src/**"] });
    expect(await ok(r, r.admin, "note", { act: c.id }, {})).toMatchObject({ kind: "note", text: "" });
    const kept = await declaredRoom();
    const k = await ok<Claim>(kept, kept.admin, "claim", null, { goal: "g", scope: ["src/**"] });
    expect(await ok(kept, kept.admin, "note", { act: k.id }, { text: "words" })).toMatchObject({ kind: "note", text: "words" });
  });
});

describe.skipIf(DECLARED)("a refusal decided before the target is judged fills {lane} only with a lane ID that is text (R-DECL-13)", () => {
  it("a lane given as a list of one lane ID, or as an object that cannot be read as text, fills nothing, and the act is still refused in the declaration's words", async () => {
    const r = await declaredRoom(v2((a) => void (a["release"] = { ...a["release"]!, who: { roles: ["maintainer"] }, refusals: { "role-forbids": { reason: "lane [{lane}] generation [{generation}]", fix: "Declared fix." } } })));
    const bob = await addMember(r, "@bob", "member");
    const c = await ok<Claim>(r, bob, "claim", null, { goal: "g", scope: ["src/**"] });
    const listed = expectRefusal(await act(r, bob, "release", { lane: [c.lane] }, { lease: 1 }), "role-forbids");
    expect(listed.reason).toBe("lane [] generation []");
    const unreadable = (await r.stub.submit(await signed(r, bob, "release", { lane: { toString: 1 } }, { lease: 1 }))) as unknown as Wire<ActRecord | Refusal>;
    expect(unreadable).toMatchObject({ ok: { refused: true, rule: "role-forbids", reason: "lane [] generation []" } });
    // The lane ID itself, as text, is reported.
    const text = expectRefusal(await act(r, bob, "release", { lane: c.lane }, { lease: 1 }), "role-forbids");
    expect(text.reason).toBe(`lane [${c.lane}] generation []`);
  });
});
