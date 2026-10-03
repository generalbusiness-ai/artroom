/**
 * Declared acts stage 2 (request fd6f00b6): the code-review declarations
 * admit what the legacy vocabulary admits (note section 6, "how nothing is
 * lost"). The same envelopes, bodies and signers are judged under a `v1`
 * document and under the code-review `v2` declarations, and must get the
 * same answer, with the exact message, except the differences R-DECL
 * makes on purpose, each listed here:
 *
 * - `claim` with `purpose` is invalid in a `v2` room: recovery is the
 *   platform kind `recover` (R-DECL-21);
 * - every declared act may carry `because` (R-DECL-12); under the legacy
 *   vocabulary only `claim` and `propose` may.
 */

import { describe, expect, it } from "vitest";
import type { ActDeclaration, EnvelopeKind, PolicyDocumentV2, Role } from "@generalbusiness/artroom-contract";
import { CODE_REVIEW_ACTS, codeReviewPolicy, defaultPolicy, delegableBy as vocabularyGrants } from "@generalbusiness/artroom-policy";
import { checkBody, checkDeclaredTarget, checkSignedEnvelope, ShapeError } from "../../src/schema.ts";
import { delegableBy, roleMaySign } from "../../src/roster.ts";

const legacy = defaultPolicy();
const declared: PolicyDocumentV2 = codeReviewPolicy(legacy);
const KINDS = Object.keys(CODE_REVIEW_ACTS) as EnvelopeKind[];
const ROLES: Role[] = ["admin", "maintainer", "member", "agent", "checker"];

const key = "key_" + "A".repeat(43);
const room = "room_" + "0".repeat(32);
const sig = "A".repeat(86);
const sha = "a".repeat(40);
const lane = "act_1_00000000";
const binding = `sha256:${"b".repeat(64)}`;

function outcome(fn: () => unknown): string {
  try {
    fn();
    return "ok";
  } catch (e) {
    if (e instanceof ShapeError) return `${e.rule}: ${e.message}`;
    throw e;
  }
}

const text = (n: number) => "x".repeat(n);

/** Bodies per kind and target: valid, at each limit and one past it, with each field missing, and with a stranger. */
const CASES: Readonly<Record<string, readonly (readonly [target: unknown, body: Record<string, unknown>])[]>> = (() => {
  const claimNew = { goal: "g", scope: ["src/**"], plan: "p" };
  const take = { scope: ["src/**"], expectedGeneration: 0, lease: 1, goal: "g", plan: "p" };
  const propose = { lease: 1, expectedGeneration: 0, head: sha, summary: "s" };
  const review = { head: sha, verdict: "approve", scope: ["src/**"], dependsOn: [], text: "t" };
  const check = {
    obligation: "obl_unit",
    check: "unit",
    integration: sha,
    input: { kind: "tree", tree: sha },
    config: binding,
    runner: binding,
    volatile: false,
    ok: true,
    detail: "d",
    landOp: "op_land_1",
  };
  const variants = (base: Record<string, unknown>, limits: Record<string, number>) => {
    const out: Record<string, unknown>[] = [base, { ...base, stranger: 1 }];
    for (const k of Object.keys(base)) {
      const { [k]: _drop, ...rest } = base;
      void _drop;
      out.push(rest);
    }
    for (const [k, n] of Object.entries(limits)) out.push({ ...base, [k]: text(n) }, { ...base, [k]: text(n + 1) }, { ...base, [k]: 7 });
    out.push({ ...base, scope: [] }, { ...base, scope: ["../x"] }, { ...base, lease: 0 }, { ...base, head: "nope" }, { ...base, replyTo: "act_x" }, { ...base, note: text(8193) });
    return out;
  };
  const proposal = { lane, generation: 1 };
  const line = { lane, generation: 1, head: sha, path: "src/app.ts", line: 3 };
  return {
    claim: [...variants(claimNew, { goal: 1024, plan: 16384 }).map((b) => [null, b] as const), ...variants(take, { goal: 1024, plan: 16384 }).map((b) => [{ lane }, b] as const)],
    propose: variants(propose, { summary: 8192 }).map((b) => [{ lane }, b] as const),
    note: [...variants({ text: "t", replyTo: lane }, { text: 16384 }).map((b) => [{ act: lane }, b] as const), ...variants({ text: "t" }, { text: 16384 }).map((b) => [line, b] as const)],
    review: [...variants(review, { text: 16384 }), { ...review, verdict: "maybe" }].map((b) => [proposal, b] as const),
    check: [...variants(check, { detail: 16384 }), { ...check, input: { kind: "filtered", snapshot: binding, paths: ["src/**"] } }, { ...check, input: { kind: "zip" } }].map((b) => [proposal, b] as const),
    land: variants({ lease: 1, head: sha }, {}).map((b) => [proposal, b] as const),
    release: variants({ lease: 1, note: "n" }, { note: 8192 }).map((b) => [{ lane }, b] as const),
  };
})();

describe("the code-review declarations judge bodies as the legacy vocabulary does (R-DECL-12, step 5)", () => {
  for (const kind of KINDS)
    it(`${kind}: every case gets the same outcome and message`, () => {
      let compared = 0;
      for (const [target, body] of CASES[kind]!) {
        expect(outcome(() => checkBody(kind, target, body, declared)), JSON.stringify(body).slice(0, 120)).toBe(outcome(() => checkBody(kind, target, body)));
        compared++;
      }
      expect(compared).toBeGreaterThan(8);
    });

  it("the two differences on purpose: claim's purpose, and because on every act", () => {
    expect(outcome(() => checkBody("claim", null, { goal: "g", scope: [".artroom/**"], purpose: "config-recovery" }))).toBe("ok");
    expect(outcome(() => checkBody("claim", null, { goal: "g", scope: [".artroom/**"], purpose: "config-recovery" }, declared))).toBe("invalid-body: body.purpose is not a field of this type.");
    const because = [{ act: lane }];
    expect(outcome(() => checkBody("land", { lane, generation: 1 }, { lease: 1, head: sha, because }))).toBe("invalid-body: body.because is not a field of this type.");
    expect(outcome(() => checkBody("land", { lane, generation: 1 }, { lease: 1, head: sha, because }, declared))).toBe("ok");
    expect(outcome(() => checkBody("land", { lane, generation: 1 }, { lease: 1, head: sha, because: [{ nothing: 1 }] }, declared))).toBe("invalid-body: body.because[0] must name an act, a commit or a URL.");
  });

  it("the declared field types, each with its limits (R-DECL-12)", () => {
    const fields: ActDeclaration["body"] = {
      n: { type: "int", min: 1, max: 3 },
      b: { type: "bool", optional: true },
      e: { type: "enum", values: ["a", "b"], optional: true },
      g: { type: "globs", max: 2, optional: true },
      m: { type: "member", optional: true },
      a: { type: "act", optional: true },
      s: { type: "segment", optional: true },
      t: { type: "text", max: 3, requiredFor: ["thread"] },
    };
    const doc: PolicyDocumentV2 = { ...declared, acts: { ...declared.acts, x: { label: "X", targets: { none: ["comment"], thread: ["release"] }, threads: ["claim"], body: fields, who: { roles: [] } } } };
    const at = (body: Record<string, unknown>, target: unknown = null) => outcome(() => checkBody("x", target, body, doc));
    expect(at({ n: 2 })).toBe("ok");
    expect(at({ n: 4 })).toBe("invalid-body: body.n must be an integer from 1 to 3.");
    expect(at({ n: 1, b: "yes" })).toBe("invalid-body: body.b must be true or false.");
    expect(at({ n: 1, e: "c" })).toBe("invalid-body: body.e must be one of a, b.");
    expect(at({ n: 1, g: ["a", "b", "c"] })).toBe("body-too-large: body.g has more than 2 items.");
    expect(at({ n: 1, g: ["a/[b"] })).toMatch(/^glob-invalid: body\.g\[0\]/);
    expect(at({ n: 1, m: "bob" })).toBe("invalid-body: body.m must be a member handle.");
    expect(at({ n: 1, a: "act_1" })).toBe("invalid-body: body.a must be an entry ID.");
    expect(at({ n: 1, s: "a/b" })).toBe("invalid-body: body.s must be one path segment, with no slash or glob character.");
    expect(at({ n: 1, s: ".." })).toBe("invalid-body: body.s must be one path segment, with no slash or glob character.");
    expect(at({ n: 1, s: "x*" })).toBe("invalid-body: body.s must be one path segment, with no slash or glob character.");
    expect(at({ n: 1, s: "part-1" })).toBe("ok");
    // A segment is 1 to 255 bytes, and not `.`.
    expect(at({ n: 1, s: "" })).toBe("invalid-body: body.s must be one path segment, with no slash or glob character.");
    expect(at({ n: 1, s: "." })).toBe("invalid-body: body.s must be one path segment, with no slash or glob character.");
    expect(at({ n: 1, s: "s".repeat(255) })).toBe("ok");
    expect(at({ n: 1, s: "s".repeat(256) })).toBe("body-too-large: body.s is longer than 255 bytes.");
    // Bytes, not characters: 128 two-byte characters are 256 bytes.
    expect(at({ n: 1, s: "é".repeat(127) })).toBe("ok");
    expect(at({ n: 1, s: "é".repeat(128) })).toBe("body-too-large: body.s is longer than 255 bytes.");
    expect(at({ n: 1, s: 7 })).toBe("invalid-body: body.s must be a string.");
    // An int is an integer within its limits: not a fraction, not a numeral in a string, not below the minimum.
    expect(at({ n: 1.5 })).toBe("invalid-body: body.n must be an integer from 1 to 3.");
    expect(at({ n: "2" })).toBe("invalid-body: body.n must be an integer from 1 to 3.");
    expect(at({ n: 0 })).toBe("invalid-body: body.n must be an integer from 1 to 3.");
    expect(at({ n: 3 })).toBe("ok");
    // `t` is required on target thread only; `n` on every target.
    expect(at({ n: 1, lease: 1 }, { lane })).toBe("invalid-body: body.t is required.");
    expect(at({ n: 1, lease: 1, t: "abcd" }, { lane })).toBe("body-too-large: body.t is longer than 3 bytes.");
    // A text is a string, within its limit in bytes.
    expect(at({ n: 1, lease: 1, t: 7 }, { lane })).toBe("invalid-body: body.t must be a string.");
    expect(at({ n: 1, lease: 1, t: ["a"] }, { lane })).toBe("invalid-body: body.t must be a string.");
    expect(at({ n: 1, lease: 1, t: "éé" }, { lane })).toBe("body-too-large: body.t is longer than 3 bytes.");
    expect(at({ n: 1, lease: 1, t: "abc" }, { lane })).toBe("ok");
    expect(at({ lease: 1, t: "a" }, { lane })).toBe("invalid-body: body.n is required.");
    // member, act and segment are fixed-format: the entropy check skips them (R-SEC-4); text is never skipped.
    expect([...checkBody("x", null, { n: 1, m: "@bob", a: lane, s: "part" }, doc).fixed].sort()).toEqual(["body.a", "body.m", "body.s"]);
    expect([...checkBody("x", { lane }, { n: 1, lease: 1, t: "abc" }, doc).fixed]).toEqual([]);
  });
});

describe("the code-review declarations judge envelopes and targets as the legacy vocabulary does (step 1)", () => {
  const targets: unknown[] = [null, { lane }, { lane, generation: 1 }, { lane, generation: 0 }, { act: lane }, { lane, generation: 1, head: sha, path: "a/../b", line: 1 }, { lane, generation: 1, head: sha, path: "src/a.ts", line: 2, endLine: 1 }, { lane, generation: 1, head: sha, path: "src/a.ts", line: 2 }, { lane: "x" }, "lane", { other: 1 }];
  for (const kind of KINDS)
    it(`${kind}: each target gets the same outcome and message`, () => {
      for (const target of targets) {
        const v1 = { envelope: { v: 1, room, actor: key, kind, target, body: {}, idempotencyKey: "k1" }, sig };
        const v2 = { envelope: { v: 2, room, actor: key, kind, binding, target, body: {}, idempotencyKey: "k1" }, sig };
        // As admission judges a declared act's target: any well-formed target at step 1, then, once step 4a has shown
        // the binding is the active declaration's, the shapes that declaration accepts (`checkDeclaredTarget`).
        const asAdmitted = outcome(() => {
          checkSignedEnvelope(v2, declared);
          checkDeclaredTarget(declared, kind, target);
        });
        expect(asAdmitted, JSON.stringify(target)).toBe(outcome(() => checkSignedEnvelope(v1)));
      }
    });

  it("step 1 does not judge a declared kind's target: the declaration's shapes are judged after step 4a, in the legacy words", () => {
    const at = (target: unknown) => outcome(() => checkSignedEnvelope({ envelope: { v: 2, room, actor: key, kind: "propose", binding, target, body: {}, idempotencyKey: "k1" }, sig }, declared));
    for (const target of [null, { lane }, { lane, generation: 0 }, { act: lane }, "thread"]) expect(at(target), JSON.stringify(target)).toBe("ok");
    expect(outcome(() => checkDeclaredTarget(declared, "propose", { lane }))).toBe("ok");
    expect(outcome(() => checkDeclaredTarget(declared, "propose", null))).toBe("bad-request: envelope.target must be an object.");
    expect(outcome(() => checkDeclaredTarget(declared, "propose", { lane, generation: 1 }))).toBe("bad-request: envelope.target.generation is not a field of this type.");
  });

  it("a v2 room: a kind of the grammar passes step 1 whatever it is; v: 2 needs a binding; a platform kind is v: 1; recover targets follow the op", () => {
    const e = (over: Record<string, unknown>) => ({ envelope: { v: 2, room, actor: key, kind: "merge", binding, target: null, body: {}, idempotencyKey: "k1", ...over }, sig });
    expect(outcome(() => checkSignedEnvelope(e({}), declared))).toBe("ok");
    expect(outcome(() => checkSignedEnvelope(e({ kind: "Merge" }), declared))).toBe("bad-request: envelope.kind must be a kind name, [a-z][a-z0-9-]{0,31}.");
    expect(outcome(() => checkSignedEnvelope(e({ binding: undefined }), declared))).toBe("bad-request: envelope.binding is undefined; omit absent fields.");
    expect(outcome(() => checkSignedEnvelope(e({ binding: "sha256:x" }), declared))).toBe("bad-request: envelope.binding must be a binding: sha256: and 64 lowercase hex digits.");
    expect(outcome(() => checkSignedEnvelope(e({ v: 1 }), declared))).toBe("bad-request: envelope.binding is only for an envelope of v: 2.");
    expect(outcome(() => checkSignedEnvelope(e({ v: 3 }), declared))).toBe("bad-request: envelope.v must be 1 or 2.");
    expect(outcome(() => checkSignedEnvelope(e({ kind: "renew", target: { lane } }), declared))).toBe("bad-request: envelope.v must be 1 for the platform kind renew.");
    const { binding: _b, ...noBinding } = e({}).envelope;
    void _b;
    expect(outcome(() => checkSignedEnvelope({ envelope: { ...noBinding, v: 1, kind: "renew", target: { lane }, body: { lease: 1 } }, sig }, declared))).toBe("ok");
    const recover = (target: unknown, body: unknown) => outcome(() => checkSignedEnvelope({ envelope: { ...noBinding, v: 1, kind: "recover", target, body }, sig }, declared));
    expect(recover(null, { op: "open" })).toBe("ok");
    expect(recover({ lane }, { op: "open" })).toBe("bad-request: envelope.target must be null for recover open.");
    expect(recover(null, { op: "take" })).toBe("bad-request: envelope.target must be an object.");
    expect(recover({ lane, generation: 1 }, { op: "approve" })).toBe("ok");
    expect(recover({ lane }, { op: "approve" })).toBe("bad-request: envelope.target.generation is required.");
    expect(recover({ act: lane }, { op: "note" })).toBe("ok");
    // The legacy vocabulary knows no recover, and no v: 2.
    expect(outcome(() => checkSignedEnvelope({ envelope: { ...noBinding, v: 1, kind: "recover", target: null, body: { op: "open" } }, sig }))).toBe("bad-request: envelope.kind must be one of claim, propose, note, review, check, land, release, renew, roster.");
  });

  it("recover bodies are the legacy recovery acts' fields, by op", () => {
    const r = (body: Record<string, unknown>) => outcome(() => checkBody("recover", null, body, declared));
    expect(r({ op: "open", goal: "g", scope: [".artroom/**"] })).toBe("ok");
    expect(r({ op: "open", goal: text(1025), scope: [".artroom/**"] })).toBe("body-too-large: body.goal is longer than 1024 bytes.");
    expect(r({ op: "take", scope: [".artroom/**"], expectedGeneration: 0 })).toBe("ok");
    expect(r({ op: "version", lease: 1, expectedGeneration: 0, head: sha, summary: text(8193) })).toBe("body-too-large: body.summary is longer than 8192 bytes.");
    expect(r({ op: "approve", head: sha, verdict: "approve", scope: [".artroom/**"], text: "t" })).toBe("ok");
    expect(r({ op: "approve", head: sha, verdict: "approve", scope: [".artroom/**"] })).toBe("invalid-body: body.text is required.");
    expect(r({ op: "land", lease: 1, head: sha })).toBe("ok");
    expect(r({ op: "release", lease: 1, note: text(8193) })).toBe("body-too-large: body.note is longer than 8192 bytes.");
    expect(r({ op: "note", text: "t", replyTo: lane })).toBe("ok");
    expect(r({ op: "merge" })).toBe("invalid-body: body.op must be one of open, take, version, approve, land, release, note.");
    expect(r({ op: "land", lease: 1, head: sha, extra: 1 })).toBe("invalid-body: body.extra is not a field of this type.");
  });

  it("grants in a v2 room are platform kinds and a signed map, never *", () => {
    const g = (body: Record<string, unknown>) => outcome(() => checkBody("roster", null, { op: "delegate", to: key, lanes: "*", expiresAt: "2026-10-02T00:00:00Z", ...body }, declared));
    expect(g({ kinds: ["renew"], acts: { claim: binding } })).toBe("ok");
    expect(g({ kinds: [], acts: {} })).toBe("ok");
    expect(g({ kinds: "*", acts: {} })).toBe("invalid-body: body.kinds must be an array.");
    expect(g({ kinds: ["claim"], acts: {} })).toBe("invalid-body: body.kinds[0] must be one of renew.");
    expect(g({ kinds: ["renew", "renew"], acts: {} })).toBe("body-too-large: body.kinds has more than 1 items.");
    expect(g({ kinds: [] })).toBe("invalid-body: body.acts is required.");
    expect(g({ kinds: [], acts: { Claim: binding } })).toBe("invalid-body: body.acts.Claim is not a kind name.");
    expect(g({ kinds: [], acts: { claim: "x" } })).toBe("invalid-body: body.acts.claim must be a binding: sha256: and 64 lowercase hex digits.");
    expect(g({ kinds: [], acts: Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`k${i}`, binding])) })).toBe("body-too-large: body.acts names more than 64 kinds.");
    const s = (session: Record<string, unknown>) =>
      outcome(() => checkBody("roster", null, { op: "invite", member: "@a", role: "agent", custody: "room", expiresAt: "2026-10-02T00:00:00Z", secretHash: binding, session }, declared));
    expect(s({ kinds: ["renew"], acts: { claim: binding }, lanes: "*", ttlSeconds: 3600 })).toBe("ok");
    expect(s({ kinds: "*", lanes: "*", ttlSeconds: 3600 })).toBe("invalid-body: body.session.acts is required.");
    // In a v1 room the legacy shapes, and a map is not a field.
    expect(outcome(() => checkBody("roster", null, { op: "delegate", to: key, kinds: "*", lanes: "*", expiresAt: "2026-10-02T00:00:00Z" }))).toBe("ok");
    expect(outcome(() => checkBody("roster", null, { op: "delegate", to: key, kinds: "*", acts: {}, lanes: "*", expiresAt: "2026-10-02T00:00:00Z" }))).toBe("invalid-body: body.acts is not a field of this type.");
  });
});

describe("the code-review declarations let each role sign, and grant, what the legacy table does (R-DECL-11)", () => {
  it("each role and kind: the same answer", () => {
    for (const role of ROLES) for (const kind of [...KINDS, "renew"]) expect(roleMaySign(role, kind, undefined, declared), `${role} ${kind}`).toBe(roleMaySign(role, kind));
  });

  it("each role: the same kinds may be granted, as platform kinds and a signed map", () => {
    for (const role of ROLES) {
      const g = vocabularyGrants(declared, role);
      expect([...g.declared, ...g.platform].sort(), role).toEqual([...delegableBy(role)].sort());
    }
  });
});
