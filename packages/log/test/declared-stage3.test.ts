/**
 * Declared acts stage 3 (request 1e8fee4b): the log decoded by grammar, and
 * kind, binding, body and who judged under the document in force at each
 * entry's seq, with the legacy vocabulary under v1 documents; the required
 * evaluation calls derived and rebuilt from the fold (docs/protocol.md
 * R-DECL-25; notes/2026-10-02-declared-acts.md sections 3.2, 3.9, 4.4, 5).
 *
 * The fixtures are room-signed logs in test/fixtures/, written by
 * scripts/declared-fixtures.ts with the simulator in support/declared-room.ts,
 * and one v1 log written at 815e3383 by scripts/v1-fixture.ts. Each forged
 * variant below differs from its fixture in exactly the way its test names,
 * and is resealed with the room key.
 *
 * Each verification failure has one witness through verify: the reason, at
 * the entry, with the verified prefix ending before it. The rules that are
 * pure functions of one entry or one envelope (the decoder's grammar,
 * `bodyProblem`) are then checked row by row as pure functions.
 */

import { describe, expect, test } from "vitest";
import type { Decision, Envelope, LogEntry, PolicyDocument, PolicyDocumentV2, ReplayContext, Sha } from "@generalbusiness/artroom-contract";
import { bindingOf, CODE_REVIEW_ACTS, evaluateRefuse, evaluateRequire, actMeter, ownersFor, policy, validatePolicyV2, type InputOf } from "@generalbusiness/artroom-policy";
import { canonicalize, parseStrict, utf8 } from "../src/canonical.ts";
import { digestJson, sha256Hex, unb64url } from "../src/crypto.ts";
import { Malformed, decodeEntry } from "../src/decode.ts";
import { retain } from "../src/entries.ts";
import { MemoryGit } from "../src/git.ts";
import { verifyLog, type VerifyReason } from "../src/verify.ts";
import { STEPS_V1, bodyProblem, kindProblem, vocabularyOf, LEGACY } from "../src/declared.ts";
import { keys } from "./support/room-sim.ts";
import { DeclaredRoom, pair, type Fixture } from "./support/declared-room.ts";
import { actAt, contextOf, insert, keep, open, reseal, verify, withEnvelope, withReceipt, type Log } from "./support/fixtures.ts";
import activatesJson from "./fixtures/declared-activates-kind.json";
import refusalsJson from "./fixtures/declared-refusals.json";
import recoveryJson from "./fixtures/declared-legacy-recovery.json";
import twoStepsJson from "./fixtures/declared-two-steps.json";
import profileJson from "./fixtures/declared-profile.json";
import checkJson from "./fixtures/declared-check-prepared.json";
import grantsJson from "./fixtures/declared-grants.json";
import v1Json from "./fixtures/v1-log-815e3383.json";

const ACTIVATES = activatesJson as unknown as Fixture;
const REFUSALS = refusalsJson as unknown as Fixture;
const RECOVERY = recoveryJson as unknown as Fixture;
const TWO_STEPS = twoStepsJson as unknown as Fixture;
const PROFILE = profileJson as unknown as Fixture;
const CHECK = checkJson as unknown as Fixture;
const GRANTS = grantsJson as unknown as Fixture;

const bob = keys.bob;
const alice = keys.alice;
const carol = pair(6);
const dan = pair(7);
const TEST2 = { "artroom-steps-v1": STEPS_V1, "artroom-steps-test2": STEPS_V1 };

/** Verify `log` and expect `reason` at `seq`, with the verified prefix ending just before it. */
async function expectFailure(log: Log, reason: VerifyReason, seq: number, opts: Parameters<typeof verify>[1] = {}) {
  const r = await verify(log, opts);
  expect(r.ok).toBe(false);
  const f = r.failures.find((x) => x.reason === reason);
  expect(f, `failures: ${r.failures.map((x) => `${x.reason}@${x.seq}: ${x.detail}`).join("; ")}`).toBeDefined();
  expect(f!.seq).toBe(seq);
  expect(r.verifiedThrough).toBe(seq - 1);
  return r;
}

/** The policy document a `policy-activated` entry names, from the retained files. */
function docOf(log: Log, seq: number): PolicyDocument {
  const e = log.entries[seq]!.entry;
  if (e.type !== "system" || e.event.type !== "policy-activated") throw new Error(`entry ${seq} is not policy-activated`);
  const digest = e.event.policy;
  const r = log.retained.find((x) => x.kind === "policy" && `sha256:${sha256Hex(utf8(x.body))}` === digest)!;
  return parseStrict(r.body) as PolicyDocument;
}

const idOf = (log: Log, seq: number) => `act_${seq}_${log.entries[seq]!.hash.slice(7, 15)}`;
const decisions = (log: Log, seq: number): Decision[] => {
  const e = log.entries[seq]!.entry;
  return e.type === "system" ? ((e.event as { decisions?: Decision[] }).decisions ?? []) : [...e.receipt.decisions];
};

/** Replace a system event at `seq` and reseal from there. */
function withEvent(log: Log, seq: number, change: (ev: Record<string, unknown>) => Record<string, unknown>): void {
  const e = log.entries[seq]!.entry;
  if (e.type !== "system") throw new Error(`entry ${seq} is not a system event`);
  log.entries[seq] = { ...log.entries[seq]!, entry: { type: "system", event: change({ ...(e.event as unknown as Record<string, unknown>) }) as never } };
  reseal(log, seq);
}

/** Append a copy of the act at `from`, its envelope changed and signed by `signer`, with a receipt that records no decision. */
function appendAct(log: Log, from: number, signer: typeof bob, change: (env: Record<string, unknown>) => Record<string, unknown>, receipt: (r: Record<string, unknown>) => Record<string, unknown> = (r) => ({ ...r, decisions: [], effects: [] })): number {
  const seq = log.entries.length;
  const e = actAt(log, from);
  insert(log, seq, { type: "act", act: e.act, receipt: e.receipt } as LogEntry["entry"]);
  withEnvelope(log, seq, signer, (env) => change({ ...env, idempotencyKey: `forged-${seq}` }));
  withReceipt(log, seq, receipt);
  return seq;
}

// =========================================================== decoding

describe("condition 1: decoding by grammar (R-SIG-4 as amended, R-DECL-2, R-DECL-16)", () => {
  const envOf = (e: Record<string, unknown>) => (e["act"] as { envelope: Record<string, unknown> }).envelope;
  /** The entry at `seq` as raw JSON, changed. */
  function changed(f: Fixture, seq: number, change: (e: Record<string, unknown>) => void): LogEntry {
    const entry = open(f).entries[seq]!;
    const raw = JSON.parse(canonicalize(entry.entry)) as Record<string, unknown>;
    change(raw);
    return { ...entry, entry: raw as never };
  }

  test("any kind that fits the grammar decodes, and judging it is verify's; an entry outside the grammar is malformed at its seq, and the verified prefix ends before it", async () => {
    const honest = await verify(open(ACTIVATES));
    expect(honest.ok).toBe(true);
    expect(actAt(open(ACTIVATES), 16).act.envelope.kind).toBe("standup");
    const log = open(ACTIVATES);
    log.entries[16] = changed(ACTIVATES, 16, (e) => void (envOf(e)["kind"] = "Stand_up"));
    reseal(log, 16);
    const r = await expectFailure(log, "malformed", 16);
    expect(r.failures[0]!.detail).toMatch(/kind is not a kind name/);
  });

  test("the decoder refuses each of these, by name", () => {
    const reservation = { ...open(ACTIVATES).entries[17]!, entry: { type: "system", event: { type: "reservation-ended", reservedFor: "@bob", leaseGeneration: 2 } } as never };
    const cases: [string, LogEntry, RegExp][] = [
      ["an envelope format other than 1 or 2", changed(ACTIVATES, 16, (e) => void (envOf(e)["v"] = 3)), /v is not 1 or 2/],
      ["a v: 2 envelope without a binding", changed(ACTIVATES, 16, (e) => void delete envOf(e)["binding"]), /binding is not a string/],
      ["a v: 2 envelope whose binding is not a digest", changed(ACTIVATES, 16, (e) => void (envOf(e)["binding"] = "sha256:x")), /binding is not a binding/],
      ["a platform kind in a v: 2 envelope", changed(ACTIVATES, 2, (e) => Object.assign(envOf(e), { v: 2, binding: digestJson("x") })), /platform kind/],
      ["a binding in a v: 1 envelope", changed(RECOVERY, 3, (e) => void (envOf(e)["binding"] = digestJson("x"))), /only in a v: 2 envelope/],
      ["a recover op that is not one", changed(RECOVERY, 11, (e) => void ((envOf(e)["body"] as Record<string, unknown>)["op"] = "explode")), /op is not one of/],
      ["a grant map key outside the grammar", changed(GRANTS, 8, (e) => void ((envOf(e)["body"] as { acts: Record<string, unknown> }).acts["Note"] = digestJson("x"))), /Note is not a kind name/],
      ["a grant map value that is not a binding", changed(GRANTS, 8, (e) => void ((envOf(e)["body"] as { acts: Record<string, unknown> }).acts["note"] = "x")), /is not a binding/],
      ["a v2 grant naming a declared kind plainly", changed(GRANTS, 8, (e) => void ((envOf(e)["body"] as Record<string, unknown>)["kinds"] = ["note"])), /kinds\[0\] is not one of renew/],
      ["a session map value that is not a binding", changed(GRANTS, 10, (e) => void ((envOf(e)["body"] as { session: { acts: Record<string, unknown> } }).session.acts["note"] = 7)), /is not a string/],
      ["a prepared event without its integration", changed(CHECK, 8, (e) => void delete (e["event"] as Record<string, unknown>)["integration"]), /integration is not a string/],
      ["a prepared event whose owner names no generation", changed(CHECK, 8, (e) => void delete (e["event"] as { owner: { preview: Record<string, unknown> } }).owner.preview["generation"]), /generation is not a sequence number/],
      ["a reservation-ended event without its lane", reservation, /lane is not a string/],
    ];
    for (const [name, entry, detail] of cases) {
      let thrown: unknown = null;
      try {
        decodeEntry(canonicalize(entry));
      } catch (e) {
        thrown = e;
      }
      expect(thrown, name).toBeInstanceOf(Malformed);
      expect((thrown as Error).message, name).toMatch(detail);
    }
    // The control: each unchanged entry decodes.
    for (const [f, seq] of [[ACTIVATES, 16], [ACTIVATES, 2], [RECOVERY, 3], [RECOVERY, 11], [GRANTS, 8], [GRANTS, 10], [CHECK, 8]] as const) expect(() => decodeEntry(canonicalize(open(f).entries[seq]!))).not.toThrow();
  });

  test("malformed: a retained v2 document that is not one (a reserved kind), where it is decoded", async () => {
    const log = open(ACTIVATES);
    const doc = docOf(log, 15) as unknown as PolicyDocumentV2;
    const bad = { ...doc, acts: { ...doc.acts, room: doc.acts["standup"] } };
    log.retained.push(retain("policy", bad));
    withEvent(log, 15, (ev) => ({ ...ev, policy: digestJson(bad) }));
    const r = await expectFailure(log, "malformed", 15);
    expect(r.failures[0]!.detail).toMatch(/the retained policy is not a policy document/);
    expect(r.failures[0]!.detail).toMatch(/reserved/);
  });
});

// ====================================================================== (1)

describe("condition 1: decoding by grammar, and kind, binding, body and who under D(s)", () => {
  test("a fresh replay of a log whose landed document activates a kind verifies, with every required call made", async () => {
    const r = await verify(open(ACTIVATES));
    expect(r.failures).toEqual([]);
    expect(r).toMatchObject({ ok: true, verifiedThrough: 21, publishedThrough: 21, unsupported: null, limits: [] });
    // refuse, notify, refuse+require, notify, notify, land (two rules), notify, land-evaluated (two rules), refuse, notify, refuse, notify.
    expect(r.decisionsReplayed).toBe(15);
    const late = contextOf(open(ACTIVATES), decisions(open(ACTIVATES), 20)[0]!) as Extract<ReplayContext, { kind: "refuse" }>;
    expect(late.input.actor.teams).toEqual(["@core"]);
  });

  test("kind-undeclared: an act of the new kind sealed before the activation that declares it", async () => {
    const log = open(ACTIVATES);
    const e = actAt(log, 16);
    insert(log, 15, { type: "act", act: e.act, receipt: { ...e.receipt, decisions: [] } } as LogEntry["entry"]);
    await expectFailure(log, "kind-undeclared", 15);
  });

  test("binding-stale: a note signed under the earlier document's note binding, sealed after its meaning changed", async () => {
    const log = open(ACTIVATES);
    const before = await bindingOf(docOf(log, 1) as unknown as PolicyDocumentV2, "note");
    const after = await bindingOf(docOf(log, 15) as unknown as PolicyDocumentV2, "note");
    expect(before).not.toBe(after);
    withEnvelope(log, 18, bob, (env) => ({ ...env, binding: before }));
    await expectFailure(log, "binding-stale", 18);
  });

  test("binding-stale: a v: 1 envelope of a declared kind under a v2 document", async () => {
    const log = open(ACTIVATES);
    withEnvelope(log, 18, bob, ({ binding: _b, ...env }) => ({ ...env, v: 1 }));
    await expectFailure(log, "binding-stale", 18);
  });

  test("the legacy rule: an old v1 log verifies unchanged, with the report 815e3383 gave it", async () => {
    const git = new MemoryGit();
    for (const [sha, o] of Object.entries(v1Json.objects)) git.objects.set(sha, { type: o.type as "blob", data: unb64url(o.data)! });
    git.refs.set(v1Json.ref, v1Json.head as Sha);
    const r = await verifyLog(git);
    expect({ ok: r.ok, room: r.room, commits: r.commits, verifiedThrough: r.verifiedThrough, publishedThrough: r.publishedThrough, decisionsReplayed: r.decisionsReplayed, last: r.last, failures: r.failures }).toEqual(v1Json.report);
    expect(r.unsupported).toBeNull();
    expect(r.limits).toEqual([]);
  });

  test("the legacy rule: a v: 2 envelope under a v1 document was never admitted (body-invalid), and recover is not a kind of a v1 room (kind-undeclared)", async () => {
    const v2 = open(RECOVERY);
    withEnvelope(v2, 3, alice, (env) => ({ ...env, v: 2, binding: digestJson("any") }));
    const r = await expectFailure(v2, "body-invalid", 3);
    expect(r.failures[0]!.detail).toMatch(/v: 2 envelope under a v1 document/);
    const recover = open(RECOVERY);
    const e = actAt(recover, 11);
    insert(recover, 4, { type: "act", act: e.act, receipt: { ...e.receipt } } as LogEntry["entry"]);
    await expectFailure(recover, "kind-undeclared", 4);
  });

  describe("body and target under the declaration in force (body-invalid; R-DECL-4, R-DECL-5, R-DECL-12, R-DECL-21)", () => {
    test("an act whose body lacks a declared field is body-invalid at its seq", async () => {
      const log = open(ACTIVATES);
      withEnvelope(log, 16, bob, (env) => ({ ...env, body: {} }));
      const r = await expectFailure(log, "body-invalid", 16);
      expect(r.failures[0]!.detail).toMatch(/text is required on target none/);
    });

    test("each rule of the body check, on the fixtures' own envelopes: the declaration's targets and fields, its steps' fields, and the recover ops", async () => {
      const activates = open(ACTIVATES);
      const recovery = open(RECOVERY);
      const scoped = () => "body.scope" as const;
      const env = (log: Log, seq: number) => actAt(log, seq).act.envelope as unknown as Record<string, unknown>;
      const standup = { env: env(activates, 16), vocab: await vocabularyOf(docOf(activates, 15) as never, STEPS_V1) };
      const propose = { env: env(activates, 6), vocab: await vocabularyOf(docOf(activates, 1) as never, STEPS_V1) };
      const release = { env: env(recovery, 11), vocab: await vocabularyOf(docOf(recovery, 10) as never, STEPS_V1) };
      for (const x of [standup, propose, release]) expect(bodyProblem(x.env as unknown as Envelope, x.vocab, scoped)).toBeNull(); // the control: each honest envelope passes
      const cases: [string, { env: Record<string, unknown>; vocab: Awaited<ReturnType<typeof vocabularyOf>> }, Record<string, unknown>, RegExp][] = [
        ["standup: a target the declaration does not accept", standup, { target: { lane: idOf(activates, 4) } }, /is not one of standup's targets/],
        ["standup: a body that is not an object", standup, { body: "text" }, /the body is not an object/],
        ["standup: a field the declaration does not have", standup, { body: { text: "x", mood: "good" } }, /mood is not a field of standup/],
        ["standup: a declared field over its limit", standup, { body: { text: "x".repeat(2049) } }, /text must be text of at most 2048 bytes/],
        ["standup: a because that is not a list of reasons", standup, { body: { text: "x", because: ["why"] } }, /"why" is not a reason/],
        ["propose: a step's field missing", propose, { body: (({ head: _head, ...body }) => body)(propose.env["body"] as Record<string, unknown>) }, /head is required by step version/],
        ["propose: a step's field of the wrong type", propose, { body: { ...(propose.env["body"] as object), lease: 0 } }, /lease must be an integer from 1/],
        ["recover release: a target the op does not take", release, { target: { lane: (release.env["target"] as { lane: string }).lane, generation: 1 } }, /recover release takes target thread/],
        ["recover release: a field the op does not have", release, { body: { op: "release", lease: 1, goal: "x" } }, /goal is not a field of recover release/],
        ["recover release: a required field missing", release, { body: { op: "release" } }, /lease is required by recover release/],
        ["recover release: a field of the wrong type", release, { body: { op: "release", lease: "1" } }, /lease must be an integer/],
      ];
      for (const [name, x, change, detail] of cases) expect(bodyProblem({ ...x.env, ...change } as unknown as Envelope, x.vocab, scoped), name).toMatch(detail);
    });
  });

  describe("grants carry the bindings their grantor signed (R-DECL-17)", () => {
    test("the grants log verifies: a v1-era * grant still covers renew; a v2 grant covers the note its map names; a session names a binding", async () => {
      const r = await verify(open(GRANTS));
      expect(r.failures).toEqual([]);
      expect(r.ok).toBe(true);
    });

    test("a v1-era grant covers no declared kind after the first v2 activation", async () => {
      const log = open(GRANTS);
      const seq = appendAct(log, 9, dan, (env) => ({ ...env, actor: dan.key, delegation: idOf(log, 5) }), (r) => ({ ...r, decisions: [], effects: [], authority: { ...(r["authority"] as object), key: dan.key, delegation: idOf(log, 5) } }));
      const f = await expectFailure(log, "delegation-invalid", seq);
      expect(f.failures[0]!.detail).toMatch(/before declared acts/);
    });

    test("a declared kind the grant's map does not name", async () => {
      const log = open(GRANTS);
      // Signed with release's binding in force, so only the grant's coverage is wrong.
      const binding = await bindingOf(docOf(log, 6) as unknown as PolicyDocumentV2, "release");
      const seq = appendAct(log, 9, carol, (env) => ({ ...env, kind: "release", binding, target: { lane: idOf(log, 4) }, body: { lease: 1 } }));
      const f = await expectFailure(log, "delegation-invalid", seq);
      expect(f.failures[0]!.detail).toMatch(/does not cover release/);
    });

    test("an act under a grant made for an earlier meaning of its kind", async () => {
      const log = open(GRANTS);
      const changed = { ...(docOf(log, 6) as unknown as PolicyDocumentV2) };
      const later: PolicyDocumentV2 = { ...changed, acts: { ...changed.acts, note: { ...changed.acts["note"]!, body: { text: { type: "text", max: 4096 } } } } };
      log.retained.push(retain("policy", later));
      insert(log, 11, { type: "system", event: { type: "policy-activated", policy: digestJson(later), checkers: [], commit: null, previous: idOf(log, 6), recomputed: { proposals: 0, reopened: 0, fenced: [] } } } as LogEntry["entry"]);
      const binding = await bindingOf(later, "note");
      const seq = appendAct(log, 9, carol, (env) => ({ ...env, binding }));
      const f = await expectFailure(log, "delegation-invalid", seq);
      expect(f.failures[0]!.detail).toMatch(/earlier meaning of note/);
    });

    // Checker observation 6dd8c0ba (2): `who.delegable` is outside the binding, so the declaration in force at each act decides.
    describe("who.delegable bounds a delegation at each act, also after the grant (R-DECL-11, R-ADM-5)", () => {
      /** The grants log, then a document that differs from the one in force only in `note.who.delegable`. */
      async function afterNote(delegable: boolean): Promise<Log> {
        const log = open(GRANTS);
        const before = docOf(log, 6) as unknown as PolicyDocumentV2;
        const later: PolicyDocumentV2 = { ...before, acts: { ...before.acts, note: { ...before.acts["note"]!, who: { ...before.acts["note"]!.who, delegable } } } } as PolicyDocumentV2;
        expect(validatePolicyV2(later).ok).toBe(true);
        // The binding leaves `who` out (R-DECL-15): the grant's map still names note's binding in force.
        expect(await bindingOf(later, "note")).toBe(await bindingOf(before, "note"));
        log.retained.push(retain("policy", later));
        insert(log, 11, { type: "system", event: { type: "policy-activated", policy: digestJson(later), checkers: [], commit: null, previous: idOf(log, 6), recomputed: { proposals: 0, reopened: 0, fenced: [] } } } as LogEntry["entry"]);
        return log;
      }

      test("the delegated note admitted before the change still verifies", async () => {
        const r = await verify(await afterNote(false));
        expect(r.failures).toEqual([]);
        expect(r.ok).toBe(true);
      });

      test("a delegated note signed after the change is delegation-invalid at its own seq", async () => {
        const log = await afterNote(false);
        const seq = appendAct(log, 9, carol, (env) => env);
        const f = await expectFailure(log, "delegation-invalid", seq);
        expect(f.failures[0]!.detail).toMatch(/note may not be delegated/);
      });

      test("the same later note is not delegation-invalid when the later document leaves note delegable", async () => {
        const log = await afterNote(true);
        appendAct(log, 9, carol, (env) => env);
        const r = await verify(log);
        expect(r.failures.filter((x) => x.reason === "delegation-invalid")).toEqual([]);
      });

      test("the grant's binding is judged before who.delegable, as admission judges them", async () => {
        const log = await afterNote(false);
        const seq = appendAct(log, 9, carol, (env) => ({ ...env, kind: "claim", binding: "sha256:" + "0".repeat(64), target: null, body: { goal: "x", scope: ["lib/**"] } }));
        const r = await verify(log);
        // claim stays delegable; its envelope's stale binding is judged at step 4a, before any delegation.
        expect(r.failures.find((x) => x.seq === seq)?.reason).toBe("binding-stale");
      });
    });

    test("the grantor's role, changed since the grant, may no longer sign the kind", async () => {
      const log = open(GRANTS);
      const doc = docOf(log, 6) as unknown as PolicyDocumentV2;
      appendAct(log, 10, alice, (env) => ({ ...env, body: { op: "set-role", member: "@bob", role: "checker" } }), (r) => ({ ...r, decisions: [], effects: [] }));
      const binding = await bindingOf(doc, "claim");
      const seq = appendAct(log, 9, carol, (env) => ({ ...env, kind: "claim", binding, target: null, body: { goal: "x", scope: ["lib/**"] } }));
      const f = await expectFailure(log, "delegation-invalid", seq);
      expect(f.failures[0]!.detail).toMatch(/grantor's role checker may not sign claim/);
    });

    test("a grant is judged when it is admitted: a kind the document does not declare (kind-undeclared), a binding that is not the one in force (binding-stale), a declared or platform kind the grantor's role may not sign, and a kind that may not be delegated (delegation-invalid)", async () => {
      const grantCases: [string, VerifyReason, (acts: Record<string, string>, doc: PolicyDocumentV2) => Promise<Record<string, unknown>>, RegExp][] = [
        ["a kind the document does not declare", "kind-undeclared", async (acts) => ({ acts: { ...acts, standup: acts["note"]! } }), /standup, which the document in force does not declare/],
        ["a binding that is not the one in force", "binding-stale", async (acts) => ({ acts: { ...acts, note: digestJson("an earlier meaning") } }), /the binding in force is/],
        ["a kind the grantor's role may not sign", "delegation-invalid", async (acts, doc) => ({ acts: { ...acts, check: await bindingOf(doc, "check") } }), /may not grant check/],
        ["a kind that may not be delegated", "delegation-invalid", async (acts, doc) => ({ acts: { ...acts, release: await bindingOf(doc, "release") } }), /release may not be delegated/],
      ];
      for (const [name, reason, change, detail] of grantCases) {
        const log = open(GRANTS);
        log.entries.length = 9; // the grant is entry 8
        const doc = docOf(log, 6) as unknown as PolicyDocumentV2;
        const body = actAt(log, 8).act.envelope.body as unknown as { acts: Record<string, string> };
        const extra = await change(body.acts, doc);
        withEnvelope(log, 8, bob, (env) => ({ ...env, body: { ...(env["body"] as object), ...extra } }));
        const r = await verify(log);
        const f = r.failures.find((x) => x.reason === reason);
        expect(f, `${name}: ${r.failures.map((x) => `${x.reason}@${x.seq}`).join(", ")}`).toBeDefined();
        expect(f!.seq, name).toBe(8);
        expect(f!.detail, name).toMatch(detail);
      }
      // A platform kind too: the grantor, made a checker first, may not sign renew, so may not grant it.
      const log = open(GRANTS);
      const e = actAt(log, 10);
      insert(log, 8, { type: "act", act: e.act, receipt: e.receipt } as LogEntry["entry"]);
      withEnvelope(log, 8, alice, (env) => ({ ...env, idempotencyKey: "forged-role", body: { op: "set-role", member: "@bob", role: "checker" } }));
      withEnvelope(log, 9, bob, (env) => ({ ...env, body: { ...(env["body"] as object), acts: {} } }));
      const f = await expectFailure(log, "delegation-invalid", 9);
      expect(f.failures[0]!.detail).toMatch(/may not grant renew/);
    });

    test("a grant's shape follows the document in force: the legacy shape under a v2 document, and a signed map under a v1 document, are body-invalid", async () => {
      const legacy = open(GRANTS);
      withEnvelope(legacy, 8, bob, (env) => ({ ...env, body: { op: "delegate", to: carol.key, kinds: ["renew"], lanes: "*", expiresAt: (env["body"] as { expiresAt: string }).expiresAt } }));
      expect((await expectFailure(legacy, "body-invalid", 8)).failures[0]!.detail).toMatch(/without a signed map/);
      const map = open(GRANTS);
      withEnvelope(map, 5, bob, (env) => ({ ...env, body: { ...(env["body"] as object), kinds: ["renew"], acts: {} } }));
      expect((await expectFailure(map, "body-invalid", 5)).failures[0]!.detail).toMatch(/with a signed map from kind to binding, under a v1 document/);
    });

    test("a room-custody session naming a binding that is not the one in force: binding-stale", async () => {
      const log = open(GRANTS);
      withEnvelope(log, 10, alice, (env) => {
        const body = env["body"] as { session: object };
        return { ...env, body: { ...body, session: { ...body.session, acts: { note: digestJson("an earlier meaning") } } } };
      });
      const r = await expectFailure(log, "binding-stale", 10);
      expect(r.failures[0]!.detail).toMatch(/the invitation's session/);
    });
  });

  test("who.roles: a member signing the check act, which only checkers may sign (role-forbids)", async () => {
    const log = open(CHECK);
    withEnvelope(log, 9, bob, (env) => ({ ...env, actor: bob.key }));
    withReceipt(log, 9, (r) => ({ ...r, authority: { via: "member", member: "@bob", role: "member", key: bob.key } }));
    await expectFailure(log, "role-forbids", 9);
  });
});

// ============================================================ steps, profile

describe("condition 1: the steps version and profile named by the retained document", () => {
  test("a log spanning two steps versions verifies, each interval under its own, by a verifier that carries both", async () => {
    const r = await verify(open(TWO_STEPS), { steps: TEST2 });
    expect(r.failures).toEqual([]);
    expect(r).toMatchObject({ ok: true, verifiedThrough: 7, unsupported: null });
  });

  test("an act after the move carrying the first version's binding is binding-stale", async () => {
    const log = open(TWO_STEPS);
    const first = await bindingOf(docOf(log, 1) as unknown as PolicyDocumentV2, "note");
    withEnvelope(log, 6, bob, (env) => ({ ...env, binding: first }));
    await expectFailure(log, "binding-stale", 6, { steps: TEST2 });
  });

  test("steps-unsupported: a verifier without the second version stops at the first entry that needs it; not a failure", async () => {
    const r = await verify(open(TWO_STEPS));
    expect(r.failures).toEqual([]);
    expect(r.ok).toBe(false);
    expect(r.unsupported).toMatchObject({ reason: "steps-unsupported", seq: 6 });
    expect(r.verifiedThrough).toBe(5);
  });

  test("profile-unsupported: a document naming a profile the verifier lacks stops at the first entry under it; not a failure", async () => {
    const r = await verify(open(PROFILE));
    expect(r.failures).toEqual([]);
    expect(r.ok).toBe(false);
    expect(r.unsupported).toMatchObject({ reason: "profile-unsupported", seq: 2 });
    expect(r.verifiedThrough).toBe(1);
  });
});

// ====================================================================== (2)

/** Rebuild a propose's refuse and require calls with `proposal` in place of its own, as a forger would, and retain them. */
async function forgeProposal(log: Log, seq: number, edit: (p: InputOf<"require">["proposal"], doc: PolicyDocument) => InputOf<"require">["proposal"]) {
  const recorded = decisions(log, seq);
  const policy = { doc: docOf(log, 1), version: recorded[0]!.policy };
  const refuseCtx = contextOf(log, recorded.find((d) => d.kind === "refuse")!) as Extract<ReplayContext, { kind: "refuse" }>;
  const requireCtx = contextOf(log, recorded.find((d) => d.kind === "require")!) as Extract<ReplayContext, { kind: "require" }>;
  const proposal = edit(requireCtx.input.proposal, policy.doc);
  const meter = actMeter();
  const r1 = await evaluateRefuse(policy, { ...refuseCtx.input, proposal }, { budget: meter, recoveryKey: false });
  const r2 = await evaluateRequire(policy, { ...requireCtx.input, proposal }, { budget: meter });
  for (const e of [...r1.evaluations, ...r2.evaluations]) keep(log, e.context);
  withReceipt(log, seq, (r) => ({ ...r, decisions: [...r1.evaluations, ...r2.evaluations].map((e) => e.decision) }));
}

const withoutPolicyFile = (p: InputOf<"require">["proposal"], doc: PolicyDocument) => {
  const changed = p.changed.filter((c) => c.path !== ".artroom/policy.json");
  const paths = p.paths.filter((x) => x !== ".artroom/policy.json");
  return { ...p, changed, paths, owners: ownersFor(doc, paths) };
};

describe("condition 2: required evaluation calls, derived and rebuilt from the fold", () => {
  test("decision-missing: each call the room had to make, left out: an act's refuse call; a version's require call, with no obligations recorded; a land's stage-land call; a notified event's notify call; a land-evaluated event's reservation-stage call", async () => {
    const without = (kind: Decision["kind"]) => (r: Record<string, unknown>) => ({ ...r, decisions: (r["decisions"] as Decision[]).filter((d) => d.kind !== kind) });
    const cases: [string, number, (log: Log) => void, RegExp][] = [
      ["refuse", 4, (log) => withReceipt(log, 4, (r) => ({ ...r, decisions: [] })), /refuse call/],
      ["require", 6, (log) => withReceipt(log, 6, (r) => ({ ...without("require")(r), effects: (r["effects"] as { type: string }[]).filter((x) => x.type !== "obligations") })), /require call decides src-review/],
      ["land", 10, (log) => withReceipt(log, 10, without("land")), /land call/],
      ["notify", 5, (log) => withEvent(log, 5, (ev) => ({ ...ev, decisions: [] })), /notify call/],
      ["land at reservation", 12, (log) => withEvent(log, 12, (ev) => ({ ...ev, decisions: [] })), /land call/],
    ];
    for (const [name, seq, forge, detail] of cases) {
      const log = open(ACTIVATES);
      log.entries.length = seq + 1;
      forge(log);
      const r = await verify(log);
      const f = r.failures.find((x) => x.reason === "decision-missing");
      expect(f, `${name}: ${r.failures.map((x) => `${x.reason}@${x.seq}: ${x.detail}`).join("; ")}`).toBeDefined();
      expect(f!.seq, name).toBe(seq);
      expect(f!.detail, name).toMatch(detail);
      expect(r.verifiedThrough, name).toBe(seq - 1);
    }
  });

  test("context-mismatch: a version's contexts replaced by plausible false ones, leaving out .artroom/policy.json, digests recomputed", async () => {
    const log = open(ACTIVATES);
    await forgeProposal(log, 6, withoutPolicyFile);
    // The forged calls replay consistently: only the rebuilt context, from Git, shows them false.
    const f = await expectFailure(log, "context-mismatch", 6);
    expect(f.failures[0]!.detail).toMatch(/proposal/);
  });

  test("without the Git objects the version is git-unwitnessed; the same substitution then fails at the next context that names the version", async () => {
    const honest = await verify(open(ACTIVATES), { repo: false });
    expect(honest.ok).toBe(true);
    expect(honest.limits).toEqual([expect.objectContaining({ reason: "git-unwitnessed", seq: 6 })]);
    const log = open(ACTIVATES);
    await forgeProposal(log, 6, withoutPolicyFile);
    withEvent(log, 7, (ev) => ({ ...ev, entry: idOf(log, 6) })); // the notification names the forged entry
    const r = await expectFailure(log, "context-mismatch", 7, { repo: false });
    expect(r.limits).toEqual([expect.objectContaining({ reason: "git-unwitnessed", seq: 6 })]);
  });

  test("context-mismatch: a require context whose budget does not start where the refuse call left it", async () => {
    const log = open(ACTIVATES);
    const recorded = decisions(log, 6);
    const req = recorded.find((d) => d.kind === "require")!;
    const ctx = contextOf(log, req) as Extract<ReplayContext, { kind: "require" }>;
    expect(ctx.budget.start.steps).toBeGreaterThan(0);
    const input = keep(log, { ...ctx, budget: { ...ctx.budget, start: { steps: 0, inspectedBytes: 0 } } });
    withReceipt(log, 6, (r) => ({ ...r, decisions: (r["decisions"] as Decision[]).map((d) => (d.kind === "require" ? { ...d, input } : d)) }));
    const f = await expectFailure(log, "context-mismatch", 6);
    expect(f.failures[0]!.detail).toMatch(/budget/);
  });

  test("policy-decision-mismatch: a recorded outcome that is not the one the rebuilt call makes", async () => {
    const log = open(ACTIVATES);
    withReceipt(log, 6, (r) => ({ ...r, decisions: (r["decisions"] as Decision[]).map((d) => (d.kind === "require" ? { ...d, outcome: { result: "pass" } } : d)) }));
    await expectFailure(log, "policy-decision-mismatch", 6);
  });

  test("decision-extra: a decision added that no rule required", async () => {
    const log = open(ACTIVATES);
    const doc = docOf(log, 1);
    const recorded = decisions(log, 4);
    const ctx = contextOf(log, recorded[0]!) as Extract<ReplayContext, { kind: "refuse" }>;
    const proposal = { generation: 1, head: "a".repeat(40) as Sha, base: "b".repeat(40) as Sha, changed: [{ status: "modified" as const, path: "src/app.ts" }], paths: ["src/app.ts"], owners: ownersFor(doc, ["src/app.ts"]) };
    const extra = await evaluateRequire({ doc, version: recorded[0]!.policy }, { kind: "require", actor: ctx.input.actor, lane: ctx.input.lane, proposal, room: ctx.input.room });
    for (const e of extra.evaluations) keep(log, e.context);
    withReceipt(log, 4, (r) => ({ ...r, decisions: [...(r["decisions"] as Decision[]), ...extra.evaluations.map((e) => e.decision)] }));
    await expectFailure(log, "decision-extra", 4);
  });

  test("decision-extra: a decision recorded on a recover op, which no policy rule judges", async () => {
    const log = open(RECOVERY);
    const forged = decisions(log, 2).map((d) => ({ ...d, policy: idOf(log, 10) as Decision["policy"] }));
    withReceipt(log, 11, (r) => ({ ...r, decisions: forged }));
    await expectFailure(log, "decision-extra", 11);
  });

  test("guard-failed: an act on a thread the log never opened, and a land-evaluated event for an operation no land act started", async () => {
    const thread = open(ACTIVATES);
    withEnvelope(thread, 6, bob, (env) => ({ ...env, target: { lane: "act_3_deadbeef" } }));
    await expectFailure(thread, "guard-failed", 6);
    const op = open(ACTIVATES);
    withEvent(op, 12, (ev) => ({ ...ev, op: "op_land_99" }));
    await expectFailure(op, "guard-failed", 12);
  });

  test("malformed: an activated document that is not valid in this room: a v2 document whose threads name a kind that never opened a thread here, and a v1 document with an artroom-checker-v2 configuration", async () => {
    const threads = open(ACTIVATES);
    const doc = docOf(threads, 15) as unknown as PolicyDocumentV2;
    const bad: PolicyDocumentV2 = { ...doc, acts: { ...doc.acts, propose: { ...doc.acts["propose"]!, threads: ["claim", "room", "ticket"] } } };
    threads.retained.push(retain("policy", bad));
    withEvent(threads, 15, (ev) => ({ ...ev, policy: digestJson(bad) }));
    expect((await expectFailure(threads, "malformed", 15)).failures[0]!.detail).toMatch(/ticket/);
    const checker = open(RECOVERY);
    const config = { format: "artroom-checker-v2", act: "check", volatile: false, timeoutSeconds: 60 };
    checker.retained.push(retain("policy", config));
    withEvent(checker, 1, (ev) => ({ ...ev, checkers: [{ name: "test", config: digestJson(config) }] }));
    await expectFailure(checker, "malformed", 1);
  });

  describe("where admission stopped: recorded refusals", () => {
    test("the refusals log verifies: a refuse rule, outside-claim after the refuse rules, obligation-open before policy, a landing blocked by a recomputation", async () => {
      const r = await verify(open(REFUSALS));
      expect(r.failures).toEqual([]);
      expect(r.ok).toBe(true);
    });

    test("guard-failed: an act accepted although a refuse rule refuses it", async () => {
      const log = open(REFUSALS);
      const e = actAt(log, 4);
      const lease = { holder: "@bob", generation: 1, expiresAt: log.entries[4]!.at };
      log.entries[4] = { ...log.entries[4]!, entry: { type: "act", act: e.act, receipt: { outcome: "accepted", authority: e.receipt.authority, decisions: e.receipt.decisions, effects: [{ type: "opened", purpose: "ordinary", lease }], flags: [] } } as never };
      reseal(log, 4);
      await expectFailure(log, "guard-failed", 4);
    });

    test("refusal-mismatch: a recorded policy refusal naming a rule that is not the one that refuses", async () => {
      const log = open(REFUSALS);
      withReceipt(log, 4, (r) => ({ ...r, refusal: { ...(r["refusal"] as object), rule: "another-rule" } }));
      await expectFailure(log, "refusal-mismatch", 4);
    });

    test("decision-missing: an outside-claim refusal without the refuse call that ran before it", async () => {
      const log = open(REFUSALS);
      withReceipt(log, 6, (r) => ({ ...r, decisions: [] }));
      await expectFailure(log, "decision-missing", 6);
    });

    test("refusal-mismatch: an outside-claim refusal although the refuse rules, which ran first, refuse it", async () => {
      const log = open(REFUSALS);
      withEnvelope(log, 6, bob, (env) => ({ ...env, body: { ...(env["body"] as object), summary: "WIP docs" } }));
      const recorded = decisions(log, 6);
      const ctx = contextOf(log, recorded[0]!) as Extract<ReplayContext, { kind: "refuse" }>;
      const act = actAt(log, 6).act.envelope as Envelope;
      const r = await evaluateRefuse({ doc: docOf(log, 1), version: recorded[0]!.policy }, { ...ctx.input, act: { kind: act.kind, target: act.target as never, body: act.body as never } }, { budget: actMeter() });
      expect(r.refusal?.rule).toBe("no-wip");
      for (const e of r.evaluations) keep(log, e.context);
      withReceipt(log, 6, (rc) => ({ ...rc, decisions: r.evaluations.map((e) => e.decision) }));
      await expectFailure(log, "refusal-mismatch", 6);
    });

    test("decision-extra: an obligation-open refusal, decided before policy, with a decision recorded", async () => {
      const log = open(REFUSALS);
      withReceipt(log, 8, (r) => ({ ...r, decisions: decisions(log, 4) }));
      await expectFailure(log, "decision-extra", 8);
    });

    test("refusal-mismatch: a recomputation whose require call fails, recorded without its block", async () => {
      const log = open(REFUSALS);
      withEvent(log, 10, ({ blocked: _b, ...ev }) => ev);
      await expectFailure(log, "refusal-mismatch", 10);
    });

    test("guard-failed: a recomputation of a version the log never proposed", async () => {
      const log = open(REFUSALS);
      withEvent(log, 10, (ev) => ({ ...ev, generation: 9 }));
      await expectFailure(log, "guard-failed", 10);
    });
  });

  test("the prepared event, where present (R-DECL-20): a check whose integration and tree it names verifies; one bound to another integration is guard-failed; with no prepared event the check is not judged against one (rooms seal it from stage 4)", async () => {
    const honest = await verify(open(CHECK));
    expect(honest.failures).toEqual([]);
    expect(honest.ok).toBe(true);
    const other = open(CHECK);
    withEnvelope(other, 9, carol, (env) => ({ ...env, body: { ...(env["body"] as object), integration: "d".repeat(40) } }));
    await expectFailure(other, "guard-failed", 9);
    const none = open(CHECK);
    none.entries.splice(8, 1);
    reseal(none, 8);
    const r = await verify(none);
    expect(r.failures).toEqual([]);
    expect(r.cannotProve.join("\n")).toMatch(/prepared event/);
  });
});

// ====================================================================== (3)

describe("condition 3: the legacy recovery sequence", () => {
  test("a v1 log with claim purpose config-recovery and its sequel, to the v2 activation and a recover release, verifies on a fresh replay", async () => {
    const log = open(RECOVERY);
    const r = await verify(log);
    expect(r.failures).toEqual([]);
    expect(r).toMatchObject({ ok: true, verifiedThrough: 11 });
    // What the fixture holds: the purpose, the flags and the sequel, as main's room writes them.
    const claim = actAt(log, 3);
    expect(claim.act.envelope.body).toMatchObject({ purpose: "config-recovery" });
    expect(claim.receipt.decisions).toEqual([]);
    expect((actAt(log, 6).receipt as unknown as { flags: string[] }).flags).toEqual(["config-recovery", "sole-admin-self-approval"]);
    expect(log.entries.slice(8, 11).map((e) => (e.entry as { event: { type: string } }).event.type)).toEqual(["land-reserved", "land-outcome", "policy-activated"]);
    expect(docOf(log, 10).format).toBe("artroom-policy-v2");
    expect(actAt(log, 11).act.envelope).toMatchObject({ v: 1, kind: "recover", body: { op: "release" } });
  });

  test("judged under the v2 declarations, its v1-era entries would fail: the recovery claim is a v: 1 claim with purpose", async () => {
    const log = open(RECOVERY);
    const v2 = await vocabularyOf(docOf(log, 10) as never, STEPS_V1);
    const claim = actAt(log, 3).act.envelope as Envelope;
    expect(kindProblem(claim, LEGACY)).toBeNull();
    expect(kindProblem(claim, v2)).toMatchObject({ reason: "binding-stale" });
  });
});

// ====================================================== unit: template scopes

describe("a thread whose scope is fixed by a template (R-DECL-7)", () => {
  const doc = {
    format: "artroom-policy-v2",
    profile: "artroom-jsonata-v1",
    steps: "artroom-steps-v1",
    owners: {},
    carry: { verdicts: true, checks: true, globalInputs: [], dependsOn: {} },
    lanes: "by-scope",
    retiredEvidence: "counts",
    rules: [],
    acts: {
      ...CODE_REVIEW_ACTS,
      part: {
        label: "Take a part",
        targets: { none: ["open"], thread: ["take"] },
        threads: ["part"],
        body: { name: { type: "segment", requiredFor: ["none"] } },
        who: { roles: ["member"] },
        hold: { scope: ["parts/{name}/**"] },
      },
    },
  } as unknown as PolicyDocumentV2;
  const env = (target: unknown, body: object): Envelope => ({ v: 2, room: "room_x", actor: bob.key, kind: "part", target, body, idempotencyKey: "k" }) as unknown as Envelope;

  test("open carries no scope, and a scope is refused; take on such a thread carries none either", async () => {
    const v = await vocabularyOf(doc, STEPS_V1);
    const fixed = () => "fixed" as const;
    expect(bodyProblem(env(null, { name: "bass" }), v, fixed)).toBeNull();
    expect(bodyProblem(env(null, { name: "bass", scope: ["x/**"] }), v, fixed)).toMatch(/scope is fixed/);
    expect(bodyProblem(env({ lane: "act_1_00000000" }, { expectedGeneration: 0 }), v, fixed)).toBeNull();
    expect(bodyProblem(env({ lane: "act_1_00000000" }, { expectedGeneration: 0, scope: ["x/**"] }), v, fixed)).toMatch(/scope is fixed/);
    // On a body-scoped thread, take must carry its new scope.
    expect(bodyProblem(env({ lane: "act_1_00000000" }, { expectedGeneration: 0 }), v, () => "body.scope")).toMatch(/scope is required/);
  });
});

// Checker observation 6dd8c0ba (1): a declared name may also be a name every object inherits.
describe("a declared field is present only as the body's own field (R-DECL-12)", () => {
  // `constructor` is not among them: canonical JSON reserves it as a key, so no binding can be computed for a field of that name.
  const INHERITED = ["toString", "valueOf", "hasOwnProperty", "isPrototypeOf", "toLocaleString"];
  const withField = (name: string, field: object): PolicyDocumentV2 => {
    const doc = { ...policy(), format: "artroom-policy-v2", steps: "artroom-steps-v1", acts: CODE_REVIEW_ACTS } as unknown as PolicyDocumentV2;
    return { ...doc, acts: { ...doc.acts, claim: { ...doc.acts["claim"]!, body: { ...doc.acts["claim"]!.body, [name]: field } } } } as PolicyDocumentV2;
  };
  const claim = (body: object): Envelope => ({ v: 2, room: "room_x", actor: bob.key, kind: "claim", target: null, body, idempotencyKey: "k" }) as unknown as Envelope;
  const scoped = () => "body.scope" as const;

  /** A log the simulated room writes: the document activated, then one claim. */
  async function claimLog(name: string, body: Readonly<Record<string, unknown>>): Promise<Log> {
    const doc = withField(name, { type: "text", max: 64, optional: true });
    expect(validatePolicyV2(doc).ok).toBe(true);
    const room = new DeclaredRoom();
    await room.activate(doc);
    await room.act({ signer: alice, kind: "claim", target: null, body: { goal: "The app", scope: ["src/**"], ...body } });
    return open(room.fixture("an optional declared field with a name every object inherits"));
  }

  test("an optional field named toString, left out, verifies on a fresh replay", async () => {
    const r = await verify(await claimLog("toString", {}));
    expect(r.failures).toEqual([]);
    expect(r.ok).toBe(true);
  });

  test("controls: the same field supplied verifies, and a plainly named optional field left out verifies", async () => {
    for (const log of [await claimLog("toString", { toString: "a caption" }), await claimLog("caption", {})]) {
      const r = await verify(log);
      expect(r.failures).toEqual([]);
      expect(r.ok).toBe(true);
    }
  });

  test("a supplied toString of the wrong type is still body-invalid", async () => {
    const log = await claimLog("toString", { toString: "a caption" });
    const seq = log.entries.length - 1;
    withEnvelope(log, seq, alice, (env) => ({ ...env, body: { ...(env["body"] as object), toString: 7 } }));
    const r = await expectFailure(log, "body-invalid", seq);
    expect(r.failures[0]!.detail).toMatch(/toString must be text/);
  });

  test(`each of ${INHERITED.join(", ")}: optional and left out is no problem; required and left out is named as required`, async () => {
    for (const name of INHERITED) {
      const optional = withField(name, { type: "text", max: 64, optional: true });
      const required = withField(name, { type: "text", max: 64 });
      expect(validatePolicyV2(optional).ok, name).toBe(true);
      expect(validatePolicyV2(required).ok, name).toBe(true);
      const body = { goal: "The app", scope: ["src/**"] };
      expect(bodyProblem(claim(body), await vocabularyOf(optional, STEPS_V1), scoped), name).toBeNull();
      expect(bodyProblem(claim({ ...body, [name]: "a caption" }), await vocabularyOf(optional, STEPS_V1), scoped), name).toBeNull();
      expect(bodyProblem(claim(body), await vocabularyOf(required, STEPS_V1), scoped), name).toBe(`${name} is required on target none`);
    }
  });
});
