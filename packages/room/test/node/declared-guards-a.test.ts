/**
 * Declared acts stage 2 (request fd6f00b6): the shape checks of a `v2` room
 * (`schema.ts`), one test for each guard, with the nearest case on the other
 * side of it.
 *
 * Admission calls `checkSignedEnvelope` at step 1, `checkDeclaredTarget`
 * after step 4a and `checkBody` at step 5, each with the room's active
 * document. These tests call the same three functions with a document, and
 * assert the refusal code and its words.
 */

import { describe, expect, it } from "vitest";
import type { ActDeclaration, EnvelopeKind, PolicyDocumentV2 } from "@generalbusiness/artroom-contract";
import { CODE_REVIEW_ACTS, codeReviewPolicy, defaultPolicy, shapeOf, validatePolicyV2 } from "@generalbusiness/artroom-policy";
import { checkBody, checkDeclaredTarget, checkSignedEnvelope, ShapeError } from "../../src/schema.ts";
import { stagedProblems } from "../../src/declared.ts";

const key = "key_" + "A".repeat(43);
const room = "room_" + "0".repeat(32);
const sig = "A".repeat(86);
const sha = "a".repeat(40);
const lane = "act_1_00000000";
const digest = `sha256:${"b".repeat(64)}`;
const MAX = "9007199254740991";

const version = { lane, generation: 1 };
const line = { lane, generation: 1, head: sha, path: "src/app.ts", line: 3 };

/** The outcome of a shape check: `ok`, the refusal code and its words, or the error it threw. */
function outcome(fn: () => unknown): string {
  try {
    fn();
    return "ok";
  } catch (e) {
    if (e instanceof ShapeError) return `${e.rule}: ${e.message}`;
    return `threw ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`;
  }
}

const who = { roles: ["member"] } as const;

/** The code-review declarations. */
const declared: PolicyDocumentV2 = codeReviewPolicy(defaultPolicy());

/** The code-review declarations and five more kinds, for the target shapes and field types they do not use. */
const more: Record<string, ActDeclaration> = {
  ship: { label: "Ship", targets: { thread: ["release"], version: ["land"] }, threads: ["claim"], who },
  mark: { label: "Mark", targets: { version: ["review"], line: ["comment"] }, threads: ["claim"], who },
  start: { label: "Start", targets: { none: ["open"] }, who, hold: { scope: "body.scope", workspace: true } },
  remark: { label: "Remark", targets: { entry: ["comment"] }, who },
  form: {
    label: "Form",
    targets: { entry: ["comment"] },
    body: {
      title: { type: "text", max: 8 },
      flag: { type: "bool", optional: true },
      paths: { type: "globs", max: 3, optional: true },
      part: { type: "segment", optional: true },
    },
    who,
  },
};
const doc: PolicyDocumentV2 = { ...declared, acts: { ...declared.acts, ...more } };

/** A valid document with the step `hand-over`, which this room does not run before stage 4. */
const handover: PolicyDocumentV2 = {
  ...declared,
  acts: {
    ...declared.acts,
    claim: { ...declared.acts["claim"]!, hold: { scope: "body.scope", workspace: true, reserveSeconds: 60 } },
    pass: { label: "Pass", targets: { thread: ["hand-over"] }, threads: ["claim"], who },
  },
};

const checkOk = { obligation: "obl_unit", check: "unit", integration: sha, input: { kind: "tree", tree: sha }, config: digest, runner: digest, volatile: false, ok: true, detail: "d" };

/** One valid target and body for each code-review kind. */
const VALID: Readonly<Record<string, readonly [target: unknown, body: Record<string, unknown>]>> = {
  claim: [null, { goal: "g", scope: ["src/**"] }],
  propose: [{ lane }, { lease: 1, expectedGeneration: 0, head: sha, summary: "s" }],
  note: [{ act: lane }, { text: "t" }],
  review: [version, { head: sha, verdict: "approve", scope: ["src/**"], text: "t" }],
  check: [version, checkOk],
  land: [version, { lease: 1, head: sha }],
  release: [{ lane }, { lease: 1 }],
};
const TAKE = { scope: ["src/**"], expectedGeneration: 0 };

/** Step 5 for a code-review kind: its valid body with these fields changed. */
const body = (kind: string, over: Record<string, unknown> = {}) => outcome(() => checkBody(kind, VALID[kind]![0], { ...VALID[kind]![1], ...over }, declared));
/** Step 5 for `claim` on a thread, which runs the step `take`. */
const take = (over: Record<string, unknown> = {}) => outcome(() => checkBody("claim", { lane }, { ...TAKE, ...over }, declared));

describe("the documents these tests use", () => {
  it("are valid v2 documents (R-DECL-24), and all but the hand-over one use only what this room runs", () => {
    expect(validatePolicyV2(declared).ok).toBe(true);
    expect(validatePolicyV2(doc).ok).toBe(true);
    expect(validatePolicyV2(handover).ok).toBe(true);
    expect(stagedProblems(declared)).toEqual([]);
    expect(stagedProblems(doc)).toEqual([]);
  });
});

describe("step 1 in a v2 room: the kind, and a platform kind's target (R-ADM-1 step 1 as amended)", () => {
  const env = (over: Record<string, unknown>) => ({ envelope: { v: 2, room, actor: key, kind: "claim", binding: digest, target: null, body: {}, idempotencyKey: "k1", ...over }, sig });
  const platform = (kind: string, target: unknown, b: unknown = {}) => ({ envelope: { v: 1, room, actor: key, kind, target, body: b, idempotencyKey: "k1" }, sig });
  const step1 = (signed: unknown) => outcome(() => checkSignedEnvelope(signed, declared));
  const recover = (op: unknown, target: unknown) => step1(platform("recover", target, { op }));

  it("a kind is a string: a value that only reads as a kind name is bad-request (R-DECL-2)", () => {
    const words = "bad-request: envelope.kind must be a kind name, [a-z][a-z0-9-]{0,31}.";
    expect(step1(env({ kind: ["claim"] }))).toBe(words);
    expect(step1(env({ kind: true }))).toBe(words);
    expect(step1(env({ kind: null }))).toBe(words);
    expect(step1(env({ kind: 7 }))).toBe(words);
    // The other side: the same name as a string.
    expect(step1(env({ kind: "claim" }))).toBe("ok");
    expect(step1(env({ kind: "true" }))).toBe("ok");
  });

  it("a renew names its thread, as under the legacy vocabulary (R-DECL-16: platform kinds keep the v: 1 envelope)", () => {
    expect(step1(platform("renew", null))).toBe("bad-request: envelope.target must be an object.");
    expect(step1(platform("renew", version))).toBe("bad-request: envelope.target.generation is not a field of this type.");
    expect(step1(platform("renew", { lane: "x" }))).toBe("bad-request: envelope.target.lane must be a lane ID.");
    expect(step1(platform("renew", { lane }))).toBe("ok");
    // The same answers as a v1 room gives.
    for (const target of [null, version, { lane: "x" }, { lane }]) expect(step1(platform("renew", target)), JSON.stringify(target)).toBe(outcome(() => checkSignedEnvelope(platform("renew", target))));
  });

  it("a roster act has target null, as under the legacy vocabulary", () => {
    expect(step1(platform("roster", { lane }))).toBe("bad-request: envelope.target must be null for roster acts.");
    expect(step1(platform("roster", "room"))).toBe("bad-request: envelope.target must be null for roster acts.");
    expect(step1(platform("roster", null))).toBe("ok");
  });

  it("a recover act's target follows its op (R-DECL-21): null for open, a thread for take, version and release, a version for approve and land, an entry or a line for note", () => {
    const accepted: Readonly<Record<string, readonly unknown[]>> = { open: [null], take: [{ lane }], version: [{ lane }], approve: [version], land: [version], release: [{ lane }], note: [{ act: lane }, line] };
    for (const [op, targets] of Object.entries(accepted)) for (const target of targets) expect(recover(op, target), `${op} ${JSON.stringify(target)}`).toBe("ok");
    expect(recover("open", { lane })).toBe("bad-request: envelope.target must be null for recover open.");
    for (const op of ["take", "version", "release"]) {
      expect(recover(op, null), op).toBe("bad-request: envelope.target must be an object.");
      expect(recover(op, version), op).toBe("bad-request: envelope.target.generation is not a field of this type.");
      expect(recover(op, { act: lane }), op).toBe("bad-request: envelope.target.act is not a field of this type.");
    }
    for (const op of ["approve", "land"]) {
      expect(recover(op, null), op).toBe("bad-request: envelope.target must be an object.");
      expect(recover(op, { lane }), op).toBe("bad-request: envelope.target.generation is required.");
      expect(recover(op, { lane, generation: 0 }), op).toBe(`bad-request: envelope.target.generation must be an integer from 1 to ${MAX}.`);
    }
    expect(recover("note", null)).toBe("bad-request: envelope.target must be an object.");
    expect(recover("note", { lane })).toBe("bad-request: envelope.target.generation is required.");
    expect(recover("note", { act: "x" })).toBe("bad-request: envelope.target.act must be an entry ID.");
  });

  it("a recover op named like an inherited property is an unknown op: step 1 judges only its target's form, and step 5 refuses the op (R-DECL-21)", () => {
    for (const op of ["toString", "constructor", "valueOf", "hasOwnProperty", "__proto__"]) {
      expect(recover(op, null), op).toBe("ok");
      expect(recover(op, { lane }), op).toBe("ok");
      expect(recover(op, "x"), op).toBe("bad-request: envelope.target must be an object.");
      expect(outcome(() => checkBody("recover", null, { op }, declared)), op).toBe("invalid-body: body.op must be one of open, take, version, approve, land, release, note.");
    }
  });

  it("a recover act with an unknown op, or none, still needs a target of some shape", () => {
    expect(recover("merge", "thread")).toBe("bad-request: envelope.target must be an object.");
    expect(recover("merge", { lane: "x" })).toBe("bad-request: envelope.target.lane must be a lane ID.");
    expect(recover("merge", { act: "x" })).toBe("bad-request: envelope.target.act must be an entry ID.");
    expect(recover("merge", { lane, generation: 0 })).toBe(`bad-request: envelope.target.generation must be an integer from 1 to ${MAX}.`);
    expect(step1(platform("recover", 7, {}))).toBe("bad-request: envelope.target must be an object.");
    // An op is a string: a list that reads as an op's name is an unknown op, so a thread is a well-formed target for it.
    expect(recover(["open"], { lane })).toBe("ok");
    expect(recover(["take"], null)).toBe("ok");
    expect(step1(platform("recover", { other: 1 }, "open"))).toBe("bad-request: envelope.target.other is not a field of this type.");
    // The other side: each well-formed shape passes step 1, and the op is step 5's to refuse.
    for (const target of [null, { lane }, version, { act: lane }, line]) expect(recover("merge", target), JSON.stringify(target)).toBe("ok");
  });
});

describe("a declared act's target, judged against its declaration after step 4a (R-DECL-4)", () => {
  const target = (kind: string, t: unknown) => outcome(() => checkDeclaredTarget(doc, kind, t));

  it("null is a target only of a kind that declares the shape none", () => {
    expect(target("propose", null)).toBe("bad-request: envelope.target must be an object.");
    expect(target("review", null)).toBe("bad-request: envelope.target must be an object.");
    expect(target("ship", null)).toBe("bad-request: envelope.target must be an object.");
    expect(target("remark", null)).toBe("bad-request: envelope.target must be an object.");
    expect(target("claim", null)).toBe("ok");
    expect(target("start", null)).toBe("ok");
  });

  it("an entry is a target only of a kind that declares the shape entry", () => {
    expect(target("propose", { act: lane })).toBe("bad-request: envelope.target.act is not a field of this type.");
    expect(target("claim", { act: lane })).toBe("bad-request: envelope.target.act is not a field of this type.");
    expect(target("review", { act: lane })).toBe("bad-request: envelope.target.act is not a field of this type.");
    expect(target("start", { act: lane })).toBe("bad-request: envelope.target must be null for this act.");
    expect(target("note", { act: lane })).toBe("ok");
    expect(target("remark", { act: lane })).toBe("ok");
  });

  it("a kind that declares two of thread, version and line is checked against the shape the target has", () => {
    expect(target("ship", { lane })).toBe("ok");
    expect(target("ship", version)).toBe("ok");
    expect(target("ship", { lane, generation: 0 })).toBe(`bad-request: envelope.target.generation must be an integer from 1 to ${MAX}.`);
    expect(target("mark", version)).toBe("ok");
    expect(target("mark", line)).toBe("ok");
    expect(target("mark", { ...line, path: "a/../b" })).toBe("bad-request: envelope.target.path must be a repository path.");
  });

  it("a target of a shape the kind does not declare is refused in the words of its first thread, version or line shape", () => {
    expect(target("ship", line)).toBe("bad-request: envelope.target.generation is not a field of this type.");
    expect(target("ship", "x")).toBe("bad-request: envelope.target must be an object.");
    expect(target("ship", { other: 1 })).toBe("bad-request: envelope.target.other is not a field of this type.");
    expect(target("mark", { lane })).toBe("bad-request: envelope.target.generation is required.");
    expect(target("propose", version)).toBe("bad-request: envelope.target.generation is not a field of this type.");
  });

  it("a kind that declares only none refuses every other target; a kind that declares only entry asks for an entry", () => {
    expect(target("start", { lane })).toBe("bad-request: envelope.target must be null for this act.");
    expect(target("start", version)).toBe("bad-request: envelope.target must be null for this act.");
    expect(target("start", "x")).toBe("bad-request: envelope.target must be null for this act.");
    expect(target("remark", { lane })).toBe("bad-request: envelope.target.lane is not a field of this type.");
    expect(target("remark", "x")).toBe("bad-request: envelope.target must be an object.");
    expect(target("remark", { act: "x" })).toBe("bad-request: envelope.target.act must be an entry ID.");
    expect(target("start", null)).toBe("ok");
    expect(target("remark", { act: lane })).toBe("ok");
  });

  it("an accepted target has a shape the kind declares, and every target of another shape is refused: step 5 always finds the steps of the target it is given", () => {
    const targets: unknown[] = [null, { lane }, version, { act: lane }, line, { ...line, endLine: 4 }, { lane, generation: 1, head: sha }, { lane, act: lane }, { act: lane, generation: 1 }, { lane, path: "a" }, {}, [], [{ lane }], "x", 7, { other: 1 }];
    const accepted: string[] = [];
    for (const [kind, d] of Object.entries(doc.acts))
      for (const t of targets) {
        const shape = shapeOf(t);
        const declaresIt = shape !== null && Object.hasOwn(d.targets, shape);
        const got = target(kind, t);
        if (got === "ok") {
          expect(declaresIt, `${kind} ${JSON.stringify(t)}`).toBe(true);
          accepted.push(`${kind} ${shape}`);
        } else expect(got, `${kind} ${JSON.stringify(t)}`).toMatch(/^bad-request: envelope\.target/);
        if (!declaresIt) expect(got, `${kind} ${JSON.stringify(t)}`).toMatch(/^bad-request: envelope\.target/);
      }
    // Each declared shape of each kind was accepted at least once.
    const every = Object.entries(doc.acts).flatMap(([kind, d]) => Object.keys(d.targets).map((shape) => `${kind} ${shape}`));
    expect([...new Set(accepted)].sort()).toEqual(every.sort());
  });
});

describe("step 5 in a v2 room: a declared act's body (R-DECL-12)", () => {
  const form = (over: Record<string, unknown>) => outcome(() => checkBody("form", { act: lane }, { title: "t", ...over }, doc));

  it("an optional field may be absent; a field that is not optional may not", () => {
    // `plan` is optional on claim; `goal` is required on target none.
    expect(body("claim")).toBe("ok");
    expect(body("claim", { plan: "p" })).toBe("ok");
    expect(outcome(() => checkBody("claim", null, { scope: ["src/**"] }, declared))).toBe("invalid-body: body.goal is required.");
    // `flag`, `paths` and `part` are optional on form; `title` is not.
    expect(form({})).toBe("ok");
    expect(outcome(() => checkBody("form", { act: lane }, {}, doc))).toBe("invalid-body: body.title is required.");
  });

  it("every declared act may carry because, and it is checked", () => {
    const because = [{ act: lane }];
    for (const kind of Object.keys(CODE_REVIEW_ACTS) as EnvelopeKind[]) {
      expect(body(kind, { because }), kind).toBe("ok");
      expect(body(kind, { because: [{ nothing: 1 }] }), kind).toBe("invalid-body: body.because[0] must name an act, a commit or a URL.");
    }
    expect(take({ because })).toBe("ok");
    expect(form({ because })).toBe("ok");
    // No other name is let in with it.
    expect(body("land", { because, cause: 1 })).toBe("invalid-body: body.cause is not a field of this type.");
  });

  it("a bool field is true or false", () => {
    expect(form({ flag: "yes" })).toBe("invalid-body: body.flag must be true or false.");
    expect(form({ flag: 1 })).toBe("invalid-body: body.flag must be true or false.");
    expect(form({ flag: null })).toBe("invalid-body: body.flag must be true or false.");
    expect(form({ flag: true })).toBe("ok");
    expect(form({ flag: false })).toBe("ok");
  });

  it("a globs field holds patterns of the restricted syntax (R-PATH-1), each a string of at most 256 characters", () => {
    expect(form({ paths: [7] })).toBe("invalid-body: body.paths[0] must be a string.");
    expect(form({ paths: ["src/**", "a".repeat(257)] })).toBe("body-too-large: body.paths[1] is longer than 256 characters.");
    expect(form({ paths: ["../x"] })).toMatch(/^glob-invalid: body\.paths\[0\] is not a valid pattern: /);
    expect(form({ paths: ["src/[a]"] })).toMatch(/^glob-invalid: body\.paths\[0\] is not a valid pattern: /);
    expect(form({ paths: ["src/**", "a".repeat(256)] })).toBe("ok");
    expect(form({ paths: [] })).toBe("ok");
  });

  const segmentWords = "invalid-body: body.part must be one path segment, with no slash or glob character.";

  it("a segment is at most 255 bytes", () => {
    expect(form({ part: "s".repeat(256) })).toBe("body-too-large: body.part is longer than 255 bytes.");
    expect(form({ part: "é".repeat(128) })).toBe("body-too-large: body.part is longer than 255 bytes.");
    expect(form({ part: "s".repeat(255) })).toBe("ok");
  });

  it("a segment is not empty, and is not . or ..", () => {
    expect(form({ part: "" })).toBe(segmentWords);
    expect(form({ part: "." })).toBe(segmentWords);
    expect(form({ part: ".." })).toBe(segmentWords);
    for (const part of ["...", ".a", "a.", "a..b"]) expect(form({ part }), part).toBe("ok");
  });

  it("a segment has no slash and no glob character: each of / * ? [ ] { } !", () => {
    for (const ch of ["/", "*", "?", "[", "]", "{", "}", "!"]) {
      expect(form({ part: `a${ch}b` }), ch).toBe(segmentWords);
      expect(form({ part: ch }), ch).toBe(segmentWords);
    }
    for (const part of ["a-b_c.d", "a b", "a,b", "a(b)", "a@b", "a~b", "a+b"]) expect(form({ part }), part).toBe("ok");
  });
});

describe("step 5 in a v2 room: the fields a step itself requires, with the legacy limits (R-DECL-5)", () => {
  const sizeOf = (n: number) => "x".repeat(n);

  it("open: scope is 1 to 64 valid patterns", () => {
    expect(body("claim", { scope: [] })).toBe("invalid-body: body.scope needs at least 1 pattern.");
    expect(body("claim", { scope: "src/**" })).toBe("invalid-body: body.scope must be an array.");
    expect(body("claim", { scope: ["../x"] })).toMatch(/^glob-invalid: body\.scope\[0\] is not a valid pattern: /);
    expect(body("claim", { scope: Array.from({ length: 65 }, (_, i) => `p${i}`) })).toBe("body-too-large: body.scope has more than 64 items.");
    expect(body("claim", { scope: Array.from({ length: 64 }, (_, i) => `p${i}`) })).toBe("ok");
  });

  it("take: scope is 1 to 64 valid patterns", () => {
    expect(take({ scope: [] })).toBe("invalid-body: body.scope needs at least 1 pattern.");
    expect(take({ scope: ["../x"] })).toMatch(/^glob-invalid: body\.scope\[0\] is not a valid pattern: /);
    expect(take()).toBe("ok");
  });

  it("take: expectedGeneration is an integer from 0", () => {
    const words = `invalid-body: body.expectedGeneration must be an integer from 0 to ${MAX}.`;
    expect(take({ expectedGeneration: -1 })).toBe(words);
    expect(take({ expectedGeneration: "0" })).toBe(words);
    expect(take({ expectedGeneration: 1.5 })).toBe(words);
    expect(take({ expectedGeneration: 0 })).toBe("ok");
    expect(take({ expectedGeneration: 7 })).toBe("ok");
  });

  it("take: lease, when present, is an integer from 1", () => {
    expect(take({ lease: 0 })).toBe(`invalid-body: body.lease must be an integer from 1 to ${MAX}.`);
    expect(take({ lease: "1" })).toBe(`invalid-body: body.lease must be an integer from 1 to ${MAX}.`);
    expect(take({ lease: 1 })).toBe("ok");
    expect(take()).toBe("ok");
  });

  it("version: lease is an integer from 1", () => {
    expect(body("propose", { lease: 0 })).toBe(`invalid-body: body.lease must be an integer from 1 to ${MAX}.`);
    expect(body("propose", { lease: 1 })).toBe("ok");
  });

  it("version: expectedGeneration is an integer from 0", () => {
    const words = `invalid-body: body.expectedGeneration must be an integer from 0 to ${MAX}.`;
    expect(body("propose", { expectedGeneration: -1 })).toBe(words);
    expect(body("propose", { expectedGeneration: "0" })).toBe(words);
    expect(body("propose", { expectedGeneration: 0 })).toBe("ok");
  });

  it("version: head is a git object name", () => {
    expect(body("propose", { head: "nope" })).toBe("invalid-body: body.head must be a git object name.");
    expect(body("propose", { head: sha.toUpperCase() })).toBe("invalid-body: body.head must be a git object name.");
    expect(body("propose", { head: sha })).toBe("ok");
  });

  it("review: head is a git object name", () => {
    expect(body("review", { head: "nope" })).toBe("invalid-body: body.head must be a git object name.");
    expect(body("review", { head: sha })).toBe("ok");
  });

  it("review: verdict is approve or object", () => {
    expect(body("review", { verdict: "maybe" })).toBe("invalid-body: body.verdict must be one of approve, object.");
    expect(body("review", { verdict: true })).toBe("invalid-body: body.verdict must be one of approve, object.");
    expect(body("review", { verdict: "approve" })).toBe("ok");
    expect(body("review", { verdict: "object" })).toBe("ok");
  });

  it("review: scope is 1 to 64 valid patterns", () => {
    expect(body("review", { scope: [] })).toBe("invalid-body: body.scope needs at least 1 pattern.");
    expect(body("review", { scope: ["../x"] })).toMatch(/^glob-invalid: body\.scope\[0\] is not a valid pattern: /);
    expect(body("review", { scope: ["src/**"] })).toBe("ok");
  });

  it("review: dependsOn, when present, is a list of valid patterns", () => {
    expect(body("review", { dependsOn: "src/**" })).toBe("invalid-body: body.dependsOn must be an array.");
    expect(body("review", { dependsOn: ["../x"] })).toMatch(/^glob-invalid: body\.dependsOn\[0\] is not a valid pattern: /);
    expect(body("review", { dependsOn: [7] })).toBe("invalid-body: body.dependsOn[0] must be a string.");
    expect(body("review", { dependsOn: [] })).toBe("ok");
    expect(body("review", { dependsOn: ["lib/**"] })).toBe("ok");
    expect(body("review")).toBe("ok");
  });

  it("land: lease is an integer from 1", () => {
    expect(body("land", { lease: 0 })).toBe(`invalid-body: body.lease must be an integer from 1 to ${MAX}.`);
    expect(body("land", { lease: 1 })).toBe("ok");
  });

  it("land: head is a git object name", () => {
    expect(body("land", { head: "nope" })).toBe("invalid-body: body.head must be a git object name.");
    expect(body("land", { head: sha })).toBe("ok");
  });

  it("release: lease is an integer from 1", () => {
    expect(body("release", { lease: 0 })).toBe(`invalid-body: body.lease must be an integer from 1 to ${MAX}.`);
    expect(body("release", { lease: 1 })).toBe("ok");
  });

  it("release: note, when present, is a string of at most 8 KiB", () => {
    expect(body("release", { note: sizeOf(8193) })).toBe("body-too-large: body.note is longer than 8192 bytes.");
    expect(body("release", { note: 7 })).toBe("invalid-body: body.note must be a string.");
    expect(body("release", { note: sizeOf(8192) })).toBe("ok");
    expect(body("release")).toBe("ok");
  });

  it("comment: replyTo, when present, is an entry ID", () => {
    expect(body("note", { replyTo: "act_x" })).toBe("invalid-body: body.replyTo must be an entry ID.");
    expect(body("note", { replyTo: 7 })).toBe("invalid-body: body.replyTo must be an entry ID.");
    expect(body("note", { replyTo: lane })).toBe("ok");
    expect(body("note")).toBe("ok");
  });

  it("check: obligation is an obligation ID", () => {
    expect(body("check", { obligation: "unit" })).toBe("invalid-body: body.obligation must be an obligation ID.");
    expect(body("check", { obligation: 7 })).toBe("invalid-body: body.obligation must be an obligation ID.");
    expect(body("check")).toBe("ok");
  });

  it("check: check is a checker name", () => {
    expect(body("check", { check: "Unit" })).toBe("invalid-body: body.check must be a checker name.");
    expect(body("check", { check: "" })).toBe("invalid-body: body.check must be a checker name.");
    expect(body("check", { check: "unit-2" })).toBe("ok");
  });

  it("check: integration is a git object name", () => {
    expect(body("check", { integration: "nope" })).toBe("invalid-body: body.integration must be a git object name.");
    expect(body("check", { integration: digest })).toBe("invalid-body: body.integration must be a git object name.");
    expect(body("check", { integration: sha })).toBe("ok");
  });

  it("check: input is an object, a tree or a filtered snapshot, each with its own closed shape", () => {
    expect(body("check", { input: { kind: "filtered", snapshot: digest, paths: ["src/**"] } })).toBe("ok");
    expect(body("check", { input: { kind: "filtered", snapshot: digest, paths: ["src/**"], tree: sha } })).toBe("invalid-body: body.input.tree is not a field of this type.");
    expect(body("check", { input: { kind: "tree", tree: sha, snapshot: digest } })).toBe("invalid-body: body.input.snapshot is not a field of this type.");
    expect(body("check", { input: null })).toBe("invalid-body: body.input must be an object.");
    expect(body("check", { input: "filtered" })).toBe("invalid-body: body.input must be an object.");
  });

  it("check: a filtered input's snapshot is a digest", () => {
    expect(body("check", { input: { kind: "filtered", snapshot: sha, paths: ["src/**"] } })).toBe("invalid-body: body.input.snapshot must be a digest.");
    expect(body("check", { input: { kind: "filtered", snapshot: digest, paths: ["src/**"] } })).toBe("ok");
  });

  it("check: a filtered input's paths are a list of valid patterns", () => {
    expect(body("check", { input: { kind: "filtered", snapshot: digest, paths: "src/**" } })).toBe("invalid-body: body.input.paths must be an array.");
    expect(body("check", { input: { kind: "filtered", snapshot: digest, paths: ["../x"] } })).toMatch(/^glob-invalid: body\.input\.paths\[0\] is not a valid pattern: /);
    expect(body("check", { input: { kind: "filtered", snapshot: digest, paths: [] } })).toBe("ok");
  });

  it("check: an input that is not filtered has kind tree", () => {
    expect(body("check", { input: { kind: "zip", tree: sha } })).toBe("invalid-body: body.input.kind must be one of tree.");
    expect(body("check", { input: { kind: 7, tree: sha } })).toBe("invalid-body: body.input.kind must be one of tree.");
    expect(body("check", { input: { kind: "tree", tree: sha } })).toBe("ok");
  });

  it("check: a tree input's tree is a git object name", () => {
    expect(body("check", { input: { kind: "tree", tree: "nope" } })).toBe("invalid-body: body.input.tree must be a git object name.");
    expect(body("check", { input: { kind: "tree", tree: digest } })).toBe("invalid-body: body.input.tree must be a git object name.");
    expect(body("check", { input: { kind: "tree", tree: sha } })).toBe("ok");
  });

  it("check: config is a digest", () => {
    expect(body("check", { config: sha })).toBe("invalid-body: body.config must be a digest.");
    expect(body("check", { config: 7 })).toBe("invalid-body: body.config must be a digest.");
    expect(body("check", { config: digest })).toBe("ok");
  });

  it("check: detail is a string of at most 16 KiB", () => {
    expect(body("check", { detail: sizeOf(16385) })).toBe("body-too-large: body.detail is longer than 16384 bytes.");
    expect(body("check", { detail: 7 })).toBe("invalid-body: body.detail must be a string.");
    expect(body("check", { detail: sizeOf(16384) })).toBe("ok");
  });

  it("the steps' fixed-format fields skip the entropy check exactly as the legacy kinds' do (R-SEC-4)", () => {
    const cases: readonly (readonly [string, unknown, Record<string, unknown>])[] = [
      ...Object.entries(VALID).map(([kind, [t, b]]) => [kind, t, b] as const),
      ["claim", { lane }, TAKE],
      ["note", line, { text: "t", replyTo: lane }],
      ["check", version, { ...checkOk, landOp: "op_land_1" }],
      ["check", version, { ...checkOk, input: { kind: "filtered", snapshot: digest, paths: ["src/**"] } }],
    ];
    /** The fixed-format paths of an accepted body, in order; of a refused one, the refusal. */
    const fixed = (kind: string, t: unknown, b: unknown, d?: PolicyDocumentV2): string => {
      let paths: string[] = [];
      const got = outcome(() => void (paths = [...checkBody(kind, t, b, d).fixed].sort()));
      return got === "ok" ? paths.join(" ") : got;
    };
    for (const [kind, t, b] of cases) expect(fixed(kind, t, b, declared), `${kind} ${JSON.stringify(b)}`).toBe(fixed(kind, t, b));
    expect(fixed("check", version, { ...checkOk, landOp: "op_land_1" }, declared)).toBe("body.check body.config body.input.tree body.integration body.landOp body.obligation body.runner");
    expect(fixed("propose", { lane }, VALID["propose"]![1], declared)).toBe("body.head");
    expect(fixed("claim", null, VALID["claim"]![1], declared)).toBe("");
  });
});

describe("the step hand-over, which no room runs before declared acts stage 4", () => {
  // No document with this step activates (`stagedProblems`, asserted here and, through a proposal, in
  // declared-fd6f00b6.test.ts), so no act reaches these checks through a room. They are called directly.
  const pass = (b: Record<string, unknown>) => outcome(() => checkBody("pass", { lane }, b, handover));

  it("a document with the step is valid, and this room refuses to run it (R-DECL-24, note section 8.5)", () => {
    expect(validatePolicyV2(handover).ok).toBe(true);
    expect(stagedProblems(handover)).toEqual([
      "acts.claim: hold.reserveSeconds is not run by this room until declared acts stage 4",
      "acts.pass: the step hand-over is not run by this room until declared acts stage 4",
    ]);
  });

  it("hand-over: lease is an integer from 1 (R-DECL-5)", () => {
    expect(pass({ lease: 0, to: "@bob" })).toBe(`invalid-body: body.lease must be an integer from 1 to ${MAX}.`);
    expect(pass({ to: "@bob" })).toBe("invalid-body: body.lease is required.");
    expect(pass({ lease: 1, to: "@bob" })).toBe("ok");
  });

  it("hand-over: to is a member handle (R-DECL-5, R-DECL-10)", () => {
    expect(pass({ lease: 1, to: "bob" })).toBe("invalid-body: body.to must be a member handle.");
    expect(pass({ lease: 1, to: key })).toBe("invalid-body: body.to must be a member handle.");
    expect(pass({ lease: 1 })).toBe("invalid-body: body.to is required.");
    expect(pass({ lease: 1, to: "@bob" })).toBe("ok");
    expect([...checkBody("pass", { lane }, { lease: 1, to: "@bob" }, handover).fixed]).toEqual(["body.to"]);
  });
});

describe("step 5: which checks a body gets (R-SIG-4 as amended)", () => {
  const v1 = defaultPolicy();

  it("under a v1 document the bodies are the legacy vocabulary's: claim may carry purpose, and land may not carry because", () => {
    expect(outcome(() => checkBody("claim", null, { goal: "g", scope: [".artroom/**"], purpose: "config-recovery" }, v1))).toBe("ok");
    expect(outcome(() => checkBody("land", version, { lease: 1, head: sha, because: [{ act: lane }] }, v1))).toBe("invalid-body: body.because is not a field of this type.");
    // The other side: the same bodies under the code-review declarations.
    expect(body("claim", { scope: [".artroom/**"], purpose: "config-recovery" })).toBe("invalid-body: body.purpose is not a field of this type.");
    expect(body("land", { because: [{ act: lane }] })).toBe("ok");
  });

  it("in a v2 room a renew's body is the platform's, as under the legacy vocabulary: a lease and nothing else", () => {
    const renew = (b: unknown) => outcome(() => checkBody("renew", { lane }, b, declared));
    expect(renew({ lease: 1 })).toBe("ok");
    expect(renew({ lease: 0 })).toBe(`invalid-body: body.lease must be an integer from 1 to ${MAX}.`);
    expect(renew({})).toBe("invalid-body: body.lease is required.");
    expect(renew({ lease: 1, because: [{ act: lane }] })).toBe("invalid-body: body.because is not a field of this type.");
    for (const b of [{ lease: 1 }, { lease: 0 }, {}, { lease: 1, because: [{ act: lane }] }]) expect(renew(b), JSON.stringify(b)).toBe(outcome(() => checkBody("renew", { lane }, b)));
  });

  it("in a v2 room a roster body is the platform's, by op", () => {
    const roster = (b: unknown) => outcome(() => checkBody("roster", null, b, declared));
    expect(roster({ op: "remove", member: "@bob" })).toBe("ok");
    expect(roster({ op: "remove" })).toBe("invalid-body: body.member is required.");
    expect(roster({ op: "remove", member: "@bob", because: [{ act: lane }] })).toBe("invalid-body: body.because is not a field of this type.");
  });

  it("in a v2 room a recover body is the platform's, by op (R-DECL-21)", () => {
    const rec = (b: unknown) => outcome(() => checkBody("recover", version, b, declared));
    expect(rec({ op: "land", lease: 1, head: sha })).toBe("ok");
    expect(rec({ op: "land", lease: 1 })).toBe("invalid-body: body.head is required.");
    expect(rec({ lease: 1, head: sha })).toBe("invalid-body: body.op must be one of open, take, version, approve, land, release, note.");
  });
});
