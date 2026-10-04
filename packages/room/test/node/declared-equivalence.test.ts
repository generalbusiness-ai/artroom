/**
 * Declared acts stage 2 (request fd6f00b6): the shape checks of a `v2` room
 * (`src/schema.ts`), as pure functions.
 *
 * The code-review declarations admit what the legacy vocabulary admits (note
 * section 6, "how nothing is lost"). The same envelopes, targets, bodies and
 * signers are judged under a `v1` document and under the code-review `v2`
 * declarations, and must get the same answer, with the exact message, except
 * the differences R-DECL makes on purpose, each listed here:
 *
 * - `claim` with `purpose` is invalid in a `v2` room: recovery is the
 *   platform kind `recover` (R-DECL-21), whose ops take the bodies of the
 *   legacy acts they stand for;
 * - every declared act may carry `because` (R-DECL-12); under the legacy
 *   vocabulary only `claim` and `propose` may.
 *
 * The rest is what a `v2` room adds: the declared field types, the target
 * shapes of a declaration, the envelope of `v: 2`, and grants as a signed
 * map; and the two pure functions of `src/declared.ts`: the filling of
 * refusal wording, and the list of what this room does not run yet.
 */

import { describe, expect, it } from "vitest";
import type { ActDeclaration, EnvelopeKind, PolicyDocumentV2, Role } from "@generalbusiness/artroom-contract";
import { CODE_REVIEW_ACTS, codeReviewPolicy, defaultPolicy, delegableBy as vocabularyGrants, shapeOf } from "@generalbusiness/artroom-policy";
import { fill, stagedProblems, WORDING_FILLED_BYTES } from "../../src/declared.ts";
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

/** The fixed-format paths of an accepted body, which the entropy check skips (R-SEC-4); of a refused one, the refusal. */
function judged(kind: string, target: unknown, body: unknown, doc?: PolicyDocumentV2): string {
  let fixed: string[] = [];
  const got = outcome(() => void (fixed = [...checkBody(kind as EnvelopeKind, target, body, doc).fixed].sort()));
  return got === "ok" ? `ok, fixed: ${fixed.join(" ")}` : got;
}

describe("the code-review declarations judge bodies as the legacy vocabulary does (R-DECL-12, R-DECL-5, step 5)", () => {
  it("each kind, each case: the same outcome and message, and the same fixed-format fields (R-SEC-4)", () => {
    for (const kind of KINDS) {
      let compared = 0;
      for (const [target, body] of CASES[kind]!) {
        expect(judged(kind, target, body, declared), `${kind} ${JSON.stringify(body).slice(0, 120)}`).toBe(judged(kind, target, body));
        compared++;
      }
      expect(compared, kind).toBeGreaterThan(8);
    }
    // The comparison is not empty on either side: a check's fixed-format fields, and a refusal.
    const [target, check] = CASES["check"]![0]!;
    expect(judged("check", target, check, declared)).toBe("ok, fixed: body.check body.config body.input.tree body.integration body.landOp body.obligation body.runner");
    expect(judged("check", target, { ...check, runner: "sha256:abc" }, declared)).toBe("invalid-body: body.runner must be a digest.");
  });

  it("each recover op takes the body of the legacy act it stands for, case by case, and nothing else (R-DECL-21)", () => {
    const OPS: Readonly<Record<string, readonly [kind: string, onTarget: (t: unknown) => boolean]>> = {
      open: ["claim", (t) => t === null],
      take: ["claim", (t) => t !== null],
      version: ["propose", () => true],
      approve: ["review", () => true],
      land: ["land", () => true],
      release: ["release", () => true],
      note: ["note", () => true],
    };
    for (const [op, [kind, onTarget]] of Object.entries(OPS)) {
      let compared = 0;
      for (const [target, body] of CASES[kind]!) {
        if (!onTarget(target)) continue;
        expect(judged("recover", target, { op, ...body }, declared), `${op} ${JSON.stringify(body).slice(0, 120)}`).toBe(judged(kind, target, body));
        compared++;
      }
      expect(compared, op).toBeGreaterThan(8);
    }
    const r = (body: unknown) => outcome(() => checkBody("recover", null, body, declared));
    // A recovery thread is opened by the op, never by a purpose; and `because` is open's, take's and version's alone, as it was claim's and propose's.
    expect(r({ op: "open", goal: "g", scope: [".artroom/**"], purpose: "config-recovery" })).toBe("invalid-body: body.purpose is not a field of this type.");
    expect(r({ op: "open", goal: "g", scope: [".artroom/**"], because: [{ act: lane }] })).toBe("ok");
    expect(r({ op: "land", lease: 1, head: sha, because: [{ act: lane }] })).toBe("invalid-body: body.because is not a field of this type.");
    // The op is one of the seven, as text: no other name, none an object inherits, and no list that reads as one (defect 36).
    const unknown = "invalid-body: body.op must be one of open, take, version, approve, land, release, note.";
    for (const op of ["merge", "toString", "constructor", "__proto__", ["open"], undefined]) expect(r({ op, goal: "g", scope: [".artroom/**"] }), String(op)).toBe(unknown);
    for (const body of ["open", null, [{ op: "open" }]]) expect(r(body), JSON.stringify(body)).toBe("invalid-body: body must be an object.");
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
    expect(at({ n: 1, s: ".." })).toBe("invalid-body: body.s must be one path segment, with no slash or glob character.");
    // No slash, and no character R-PATH-1 keeps out of a pattern, the backslash included: a segment may fill a slot of a scope template (defect 35).
    for (const ch of ["/", "*", "?", "[", "]", "{", "}", "!", "\\"]) expect(at({ n: 1, s: `a${ch}b` }), ch).toBe("invalid-body: body.s must be one path segment, with no slash or glob character.");
    for (const s of ["a-b_c.d", "a b", "a(b)", "a..b"]) expect(at({ n: 1, s }), s).toBe("ok");
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
  it("each kind, each target: the same outcome and message", () => {
    for (const kind of KINDS)
      for (const target of targets) {
        const v1 = { envelope: { v: 1, room, actor: key, kind, target, body: {}, idempotencyKey: "k1" }, sig };
        const v2 = { envelope: { v: 2, room, actor: key, kind, binding, target, body: {}, idempotencyKey: "k1" }, sig };
        // As admission judges a declared act's target: any well-formed target at step 1, then, once step 4a has shown
        // the binding is the active declaration's, the shapes that declaration accepts (`checkDeclaredTarget`).
        const asAdmitted = outcome(() => {
          checkSignedEnvelope(v2, declared);
          checkDeclaredTarget(declared, kind, target);
        });
        expect(asAdmitted, `${kind} ${JSON.stringify(target)}`).toBe(outcome(() => checkSignedEnvelope(v1)));
      }
  });

  it("step 1 does not judge a declared kind's target: the declaration's shapes are judged after step 4a, in the legacy words", () => {
    const at = (target: unknown) => outcome(() => checkSignedEnvelope({ envelope: { v: 2, room, actor: key, kind: "propose", binding, target, body: {}, idempotencyKey: "k1" }, sig }, declared));
    for (const target of [null, { lane }, { lane, generation: 0 }, { act: lane }, "thread"]) expect(at(target), JSON.stringify(target)).toBe("ok");
    expect(outcome(() => checkDeclaredTarget(declared, "propose", { lane }))).toBe("ok");
    expect(outcome(() => checkDeclaredTarget(declared, "propose", null))).toBe("bad-request: envelope.target must be an object.");
    expect(outcome(() => checkDeclaredTarget(declared, "propose", { lane, generation: 1 }))).toBe("bad-request: envelope.target.generation is not a field of this type.");
  });

  it("a declared target is accepted only in a shape its kind declares, for kinds with two shapes, with none alone and with an entry alone (R-DECL-4)", () => {
    const who = { roles: ["member"] } as const;
    const doc: PolicyDocumentV2 = {
      ...declared,
      acts: {
        ...declared.acts,
        ship: { label: "Ship", targets: { thread: ["release"], version: ["land"] }, threads: ["claim"], who },
        mark: { label: "Mark", targets: { version: ["review"], line: ["comment"] }, threads: ["claim"], who },
        start: { label: "Start", targets: { none: ["open"] }, who, hold: { scope: "body.scope", workspace: true } },
        remark: { label: "Remark", targets: { entry: ["comment"] }, who },
      },
    };
    expect(stagedProblems(doc)).toEqual([]);
    const line = { lane, generation: 1, head: sha, path: "src/app.ts", line: 3 };
    const all: unknown[] = [null, { lane }, { lane, generation: 1 }, { act: lane }, line, { ...line, endLine: 4 }, { lane, generation: 1, head: sha }, { lane, act: lane }, { lane, path: "a" }, {}, [], [{ lane }], "x", 7, { other: 1 }];
    const accepted: string[] = [];
    for (const [kind, d] of Object.entries(doc.acts))
      for (const t of all) {
        const shape = shapeOf(t);
        const got = outcome(() => checkDeclaredTarget(doc, kind, t));
        if (got === "ok") accepted.push(`${kind} ${shape}`);
        else expect(got, `${kind} ${JSON.stringify(t)}`).toMatch(/^bad-request: envelope\.target/);
        // So step 5 always finds the steps of the target it is given.
        if (got === "ok") expect(shape !== null && Object.hasOwn(d.targets, shape), `${kind} ${JSON.stringify(t)}`).toBe(true);
      }
    const every = Object.entries(doc.acts).flatMap(([kind, d]) => Object.keys(d.targets).map((shape) => `${kind} ${shape}`));
    expect([...new Set(accepted)].sort()).toEqual(every.sort());
    expect(outcome(() => checkDeclaredTarget(doc, "start", { lane }))).toBe("bad-request: envelope.target must be null for this act.");
  });

  it("a v2 room: a kind of the grammar passes step 1 whatever it is; v: 2 needs a binding; a platform kind is v: 1; recover targets follow the op", () => {
    const e = (over: Record<string, unknown>) => ({ envelope: { v: 2, room, actor: key, kind: "merge", binding, target: null, body: {}, idempotencyKey: "k1", ...over }, sig });
    expect(outcome(() => checkSignedEnvelope(e({}), declared))).toBe("ok");
    expect(outcome(() => checkSignedEnvelope(e({ kind: "Merge" }), declared))).toBe("bad-request: envelope.kind must be a kind name, [a-z][a-z0-9-]{0,31}.");
    // A kind is text: a list that only reads as a kind name is not one (R-DECL-2).
    expect(outcome(() => checkSignedEnvelope(e({ kind: ["claim"] }), declared))).toBe("bad-request: envelope.kind must be a kind name, [a-z][a-z0-9-]{0,31}.");
    expect(outcome(() => checkSignedEnvelope(e({ binding: undefined }), declared))).toBe("bad-request: envelope.binding is undefined; omit absent fields.");
    expect(outcome(() => checkSignedEnvelope(e({ binding: "sha256:x" }), declared))).toBe("bad-request: envelope.binding must be a binding: sha256: and 64 lowercase hex digits.");
    expect(outcome(() => checkSignedEnvelope(e({ v: 1 }), declared))).toBe("bad-request: envelope.binding is only for an envelope of v: 2.");
    expect(outcome(() => checkSignedEnvelope(e({ v: 3 }), declared))).toBe("bad-request: envelope.v must be 1 or 2.");
    expect(outcome(() => checkSignedEnvelope(e({ kind: "renew", target: { lane } }), declared))).toBe("bad-request: envelope.v must be 1 for the platform kind renew.");
    const { binding: _b, ...noBinding } = e({}).envelope;
    void _b;
    expect(outcome(() => checkSignedEnvelope({ envelope: { ...noBinding, v: 1, kind: "renew", target: { lane }, body: { lease: 1 } }, sig }, declared))).toBe("ok");
    // A recover act's target follows its op (R-DECL-21): each op takes its own shapes and no other.
    const recover = (target: unknown, body: unknown) => outcome(() => checkSignedEnvelope({ envelope: { ...noBinding, v: 1, kind: "recover", target, body }, sig }, declared));
    const line = { lane, generation: 1, head: sha, path: "src/a.ts", line: 2 };
    const shapes: Readonly<Record<string, unknown>> = { none: null, thread: { lane }, version: { lane, generation: 1 }, entry: { act: lane }, line };
    const takes: Readonly<Record<string, readonly string[]>> = { open: ["none"], take: ["thread"], version: ["thread"], release: ["thread"], approve: ["version"], land: ["version"], note: ["entry", "line"] };
    for (const [op, accepted] of Object.entries(takes))
      for (const [shape, target] of Object.entries(shapes)) {
        const got = recover(target, { op });
        if (accepted.includes(shape)) expect(got, `${op} ${shape}`).toBe("ok");
        else expect(got, `${op} ${shape}`).toMatch(/^bad-request: envelope\.target/);
      }
    expect(recover({ lane }, { op: "open" })).toBe("bad-request: envelope.target must be null for recover open.");
    // An unknown op is step 5's to refuse: step 1 asks only for a well-formed target.
    expect(recover({ lane }, { op: "merge" })).toBe("ok");
    expect(recover("thread", { op: "merge" })).toBe("bad-request: envelope.target must be an object.");
    // The platform kinds renew and roster keep their legacy targets and bodies in a v2 room.
    const platform = (kind: "renew" | "roster", target: unknown, body: unknown, doc?: PolicyDocumentV2) => outcome(() => (checkSignedEnvelope({ envelope: { ...noBinding, v: 1, kind, target, body }, sig }, doc), checkBody(kind, target, body, doc)));
    expect(platform("renew", { lane }, { lease: 1 }, declared)).toBe("ok");
    for (const [kind, target, body] of [["renew", null, { lease: 1 }], ["renew", { lane }, { lease: 1, because: [{ act: lane }] }], ["roster", { lane }, { op: "remove", member: "@bob" }], ["roster", null, { op: "remove" }]] as const) {
      expect(platform(kind, target, body, declared), `${kind} ${JSON.stringify(target)} ${JSON.stringify(body)}`).toBe(platform(kind, target, body));
      expect(platform(kind, target, body, declared)).not.toBe("ok");
    }
    // The legacy vocabulary knows no recover, and no v: 2.
    expect(outcome(() => checkSignedEnvelope({ envelope: { ...noBinding, v: 1, kind: "recover", target: null, body: { op: "open" } }, sig }))).toBe("bad-request: envelope.kind must be one of claim, propose, note, review, check, land, release, renew, roster.");
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
    expect(s({ kinds: "*", acts: {}, lanes: "*", ttlSeconds: 3600 })).toBe("invalid-body: body.session.kinds must be an array.");
    expect(s({ kinds: [], acts: { claim: "x" }, lanes: "*", ttlSeconds: 3600 })).toBe("invalid-body: body.session.acts.claim must be a binding: sha256: and 64 lowercase hex digits.");
    expect(g({ kinds: [], acts: ["claim"] })).toBe("invalid-body: body.acts must be an object from declared kind to binding.");
    // In a v1 room the legacy shapes, and a map is not a field.
    expect(outcome(() => checkBody("roster", null, { op: "delegate", to: key, kinds: "*", lanes: "*", expiresAt: "2026-10-02T00:00:00Z" }))).toBe("ok");
    expect(outcome(() => checkBody("roster", null, { op: "delegate", to: key, kinds: "*", acts: {}, lanes: "*", expiresAt: "2026-10-02T00:00:00Z" }))).toBe("invalid-body: body.acts is not a field of this type.");
    expect(outcome(() => checkBody("roster", null, { op: "delegate", to: key, kinds: [], lanes: "*", expiresAt: "2026-10-02T00:00:00Z" }))).toBe("invalid-body: body.kinds must name at least one kind.");
  });
});

describe("the code-review declarations let each role sign, and grant, what the legacy table does (R-DECL-11)", () => {
  it("each role and kind: the same answer", () => {
    for (const role of ROLES) for (const kind of [...KINDS, "renew"]) expect(roleMaySign(role, kind, undefined, declared), `${role} ${kind}`).toBe(roleMaySign(role, kind));
  });

  it("a declared kind is decided by its who.roles, admin implicit, never by the legacy table; a roster act keeps the roster op table", () => {
    const doc: PolicyDocumentV2 = { ...declared, acts: { ...declared.acts, ask: { label: "Ask", targets: { entry: ["comment"] }, who: { roles: ["member"] } }, check: { ...declared.acts["check"]!, who: { roles: ["member"] } } } };
    expect(ROLES.filter((role) => roleMaySign(role, "ask", undefined, doc))).toEqual(["admin", "member"]);
    expect(ROLES.filter((role) => roleMaySign(role, "check", undefined, doc))).toEqual(["admin", "member"]);
    expect(ROLES.filter((role) => roleMaySign(role, "ask"))).toEqual([]);
    for (const role of ROLES) for (const op of ["invite", "delegate", "set-role", "join", "rotate-recovery"] as const) expect(roleMaySign(role, "roster", op, doc), `${role} ${op}`).toBe(roleMaySign(role, "roster", op));
    expect(roleMaySign("member", "roster", "delegate", doc)).toBe(true);
    expect(roleMaySign("member", "roster", "invite", doc)).toBe(false);
  });

  it("each role: the same kinds may be granted, as platform kinds and a signed map", () => {
    for (const role of ROLES) {
      const g = vocabularyGrants(declared, role);
      expect([...g.declared, ...g.platform].sort(), role).toEqual([...delegableBy(role)].sort());
    }
  });
});

describe("refusal wording is filled from the room's facts, and bounded (R-DECL-13)", () => {
  const bytes = (t: string) => new TextEncoder().encode(t).length;

  it("only the eight slots are filled, a slot with no fact with nothing; a filled text is cut to 8,192 bytes at a character boundary, and is a prefix of the text itself", () => {
    expect(fill("{lane} is {holder}'s ({kind}, at {generation}){reservedFor}{until}{obligation}{path}{other}", { lane: "act_1_00000000", holder: "@admin", kind: "release", generation: "0" })).toBe("act_1_00000000 is @admin's (release, at 0){other}");
    expect(WORDING_FILLED_BYTES).toBe(8192);
    const path = `docs/${"d".repeat(200)}/${"e".repeat(200)}/${"f".repeat(200)}/${"g".repeat(200)}/x.md`;
    expect(path.length).toBe(813);
    // A template that repeats a slot cannot make a refusal larger than the bound.
    expect(fill("{path}".repeat(85), { path })).toBe(path.repeat(85).slice(0, 8192));
    // A text of exactly 8,192 bytes is not cut.
    const exact = fill(`${"p".repeat(62)}${"{path}".repeat(10)}`, { path });
    expect([exact, bytes(exact)]).toEqual([`${"p".repeat(62)}${path.repeat(10)}`, 8192]);
    // The 8,192nd byte would be the first half of a two-byte character: the cut falls before it.
    const split = fill(`a${"{path}".repeat(10)}${"é".repeat(40)}`, { path });
    expect([split, bytes(split)]).toEqual([`a${path.repeat(10)}${"é".repeat(30)}`, 8191]);
    // Nothing is decoded, so a leading U+FEFF, a legal character of a template, stays (defect 33).
    const marked = fill(`\uFEFF${"{path}".repeat(11)}`, { path });
    expect(marked).toBe(`\uFEFF${path.repeat(11)}`.slice(0, 1 + 8189));
    expect([marked.charCodeAt(0), bytes(marked)]).toEqual([0xfeff, 8192]);
  });
});

describe("what this room does not run before declared acts stage 4 (R-DECL-24, note section 8.5)", () => {
  it("a valid document that uses one of the seven steps or hold settings is named, with the act; the code-review document uses none", () => {
    const withActs = (change: (a: Record<string, ActDeclaration>) => void): PolicyDocumentV2 => {
      const acts = structuredClone(CODE_REVIEW_ACTS) as Record<string, ActDeclaration>;
      change(acts);
      return { ...declared, acts };
    };
    const hold = (h: object) => (a: Record<string, ActDeclaration>) => void ((a["claim"] as { hold: unknown }).hold = h);
    const cases: readonly (readonly [string, PolicyDocumentV2])[] = [
      ["acts.propose: version then land in one act", withActs((a) => void (a["propose"] = { ...a["propose"]!, targets: { thread: ["version", "land"] } }))],
      ["acts.pass: the step hand-over", withActs((a) => void (a["pass"] = { label: "Pass", targets: { thread: ["hand-over"] }, threads: ["claim"], who: { roles: ["member"] } }))],
      ["acts.note: a comment on target none", withActs((a) => void (a["note"] = { ...a["note"]!, targets: { none: ["comment"], entry: ["comment"], line: ["comment"] } }))],
      ["acts.claim: a scope template", withActs(hold({ scope: ["src/**"], workspace: true }))],
      ["acts.claim: hold.conflict", withActs(hold({ scope: "body.scope", workspace: true, conflict: "exclusive" }))],
      ["acts.claim: hold.reserveSeconds", withActs(hold({ scope: "body.scope", workspace: true, reserveSeconds: 60 }))],
      ["acts.claim: a hold without a workspace", withActs(hold({ scope: "body.scope" }))],
    ];
    for (const [what, doc] of cases) expect(stagedProblems(doc), what).toEqual([`${what} is not run by this room until declared acts stage 4`]);
    expect(stagedProblems(declared)).toEqual([]);
  });
});
