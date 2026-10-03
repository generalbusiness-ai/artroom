/**
 * Declared acts stage 2 (request fd6f00b6): the body checks of admission
 * step 5 in a `v2` room, one test for each guard:
 *
 * - the last fields of the `check` step (R-DECL-5);
 * - the body of each `recover` op (R-DECL-21), with the legacy limits (R-SIG-6);
 * - the grant shapes: a list of platform kinds and a signed map (R-DECL-17).
 *
 * Each test puts the refused body beside the nearest accepted one, and
 * asserts the refusal's rule and its exact words.
 */

import { describe, expect, it } from "vitest";
import type { AnyPolicyDocument, PolicyDocumentV2 } from "@generalbusiness/artroom-contract";
import { DELEGABLE_PLATFORM, codeReviewPolicy, defaultPolicy } from "@generalbusiness/artroom-policy";
import { checkBody, ShapeError } from "../../src/schema.ts";

type Body = Record<string, unknown>;

const legacy = defaultPolicy();
const declared: PolicyDocumentV2 = codeReviewPolicy(legacy);

const key = "key_" + "A".repeat(43);
const sha = "a".repeat(40);
const lane = "act_1_00000000";
const digest = `sha256:${"b".repeat(64)}`;
const text = (n: number) => "x".repeat(n);
/** The largest integer a body may carry. */
const MAX = String(Number.MAX_SAFE_INTEGER);

function outcome(fn: () => unknown): string {
  try {
    fn();
    return "ok";
  } catch (e) {
    if (e instanceof ShapeError) return `${e.rule}: ${e.message}`;
    throw e;
  }
}

describe("the check step's fields in a v2 room have the legacy check's forms (R-DECL-5)", () => {
  const version = { lane, generation: 1 };
  const check: Body = { obligation: "obl_unit", check: "unit", integration: sha, input: { kind: "tree", tree: sha }, config: digest, runner: digest, volatile: false, ok: true, detail: "d" };
  const at = (over: Body) => outcome(() => checkBody("check", version, { ...check, ...over }, declared));
  const fixed = (over: Body) => checkBody("check", version, { ...check, ...over }, declared).fixed;

  it("runner must be a digest (R-DECL-5)", () => {
    expect(at({})).toBe("ok");
    expect(at({ runner: "sha256:abc" })).toBe("invalid-body: body.runner must be a digest.");
    expect(at({ runner: 7 })).toBe("invalid-body: body.runner must be a digest.");
  });

  it("runner is a fixed-format field, which the entropy check skips (R-DECL-5, R-SEC-4)", () => {
    expect(fixed({}).has("body.runner")).toBe(true);
    expect(fixed({}).has("body.detail")).toBe(false);
  });

  it("volatile must be true or false (R-DECL-5)", () => {
    expect(at({ volatile: true })).toBe("ok");
    expect(at({ volatile: "no" })).toBe("invalid-body: body.volatile must be true or false.");
    expect(at({ volatile: 0 })).toBe("invalid-body: body.volatile must be true or false.");
  });

  it("ok must be true or false (R-DECL-5)", () => {
    expect(at({ ok: false })).toBe("ok");
    expect(at({ ok: "yes" })).toBe("invalid-body: body.ok must be true or false.");
    expect(at({ ok: 1 })).toBe("invalid-body: body.ok must be true or false.");
  });

  it("landOp, when the check names one, must be an operation ID, and is fixed-format (R-DECL-5, R-SEC-4)", () => {
    expect(at({ landOp: "op_land_1" })).toBe("ok");
    expect(at({ landOp: "land 1" })).toBe("invalid-body: body.landOp must be an operation ID.");
    expect(at({ landOp: 1 })).toBe("invalid-body: body.landOp must be an operation ID.");
    expect(fixed({ landOp: "op_land_1" }).has("body.landOp")).toBe(true);
  });

  it("landOp is optional: a check that names no landing is accepted (R-DECL-5)", () => {
    expect(at({})).toBe("ok");
    expect(fixed({}).has("body.landOp")).toBe(false);
  });
});

describe("a recover body is an object that names its op (R-DECL-21)", () => {
  it("a recover body that is not an object is invalid-body (R-DECL-21)", () => {
    for (const body of ["open", 7, null, true, [{ op: "open", goal: "g", scope: [".artroom/**"] }]])
      expect(outcome(() => checkBody("recover", null, body, declared)), JSON.stringify(body)).toBe("invalid-body: body must be an object.");
    expect(outcome(() => checkBody("recover", null, { op: "open", goal: "g", scope: [".artroom/**"] }, declared))).toBe("ok");
  });
});

const recover = (body: Body) => outcome(() => checkBody("recover", null, body, declared));
const because = [{ act: lane }];

describe("recover open has the legacy recovery claim's fields and limits (R-DECL-21, R-SIG-6)", () => {
  const open: Body = { op: "open", goal: "g", scope: [".artroom/**"] };

  it("open is closed: it has no purpose and no other field (R-DECL-21)", () => {
    expect(recover(open)).toBe("ok");
    expect(recover({ ...open, purpose: "config-recovery" })).toBe("invalid-body: body.purpose is not a field of this type.");
    expect(recover({ ...open, lease: 1 })).toBe("invalid-body: body.lease is not a field of this type.");
  });

  it("open's goal is a string (R-DECL-21)", () => {
    expect(recover({ ...open, goal: 7 })).toBe("invalid-body: body.goal must be a string.");
    expect(recover({ ...open, goal: ["g"] })).toBe("invalid-body: body.goal must be a string.");
  });

  it("open's goal is at most 1024 bytes (R-DECL-21, R-SIG-6)", () => {
    expect(recover({ ...open, goal: text(1024) })).toBe("ok");
    expect(recover({ ...open, goal: text(1025) })).toBe("body-too-large: body.goal is longer than 1024 bytes.");
  });

  it("open's scope is a list of valid patterns (R-DECL-21, R-PATH-1)", () => {
    expect(recover({ ...open, scope: ".artroom/**" })).toBe("invalid-body: body.scope must be an array.");
    expect(recover({ ...open, scope: [".artroom/../src/**"] })).toBe("glob-invalid: body.scope[0] is not a valid pattern: a pattern must not have . or .. segments.");
  });

  it("open's scope names at least one pattern (R-DECL-21)", () => {
    expect(recover({ ...open, scope: [".artroom/room.json"] })).toBe("ok");
    expect(recover({ ...open, scope: [] })).toBe("invalid-body: body.scope needs at least 1 pattern.");
  });

  it("open's plan, when present, is a string (R-DECL-21)", () => {
    expect(recover({ ...open, plan: "p" })).toBe("ok");
    expect(recover({ ...open, plan: 7 })).toBe("invalid-body: body.plan must be a string.");
  });

  it("open's plan is at most 16384 bytes (R-DECL-21, R-SIG-6)", () => {
    expect(recover({ ...open, plan: text(16384) })).toBe("ok");
    expect(recover({ ...open, plan: text(16385) })).toBe("body-too-large: body.plan is longer than 16384 bytes.");
  });

  it("open's because, when present, is a list of reasons (R-DECL-21)", () => {
    expect(recover({ ...open, because })).toBe("ok");
    expect(recover({ ...open, because: "act_1_00000000" })).toBe("invalid-body: body.because must be an array.");
    expect(recover({ ...open, because: [{ nothing: 1 }] })).toBe("invalid-body: body.because[0] must name an act, a commit or a URL.");
  });

  it("open's plan and because are optional (R-DECL-21)", () => {
    expect(recover({ ...open, because })).toBe("ok");
    expect(recover({ ...open, plan: "p" })).toBe("ok");
    expect(recover(open)).toBe("ok");
  });
});

describe("recover take has the legacy takeover's fields and limits (R-DECL-21, R-SIG-6)", () => {
  const take: Body = { op: "take", scope: [".artroom/**"], expectedGeneration: 0 };

  it("take is closed: it has no field but its own (R-DECL-21)", () => {
    expect(recover(take)).toBe("ok");
    expect(recover({ ...take, extra: 1 })).toBe("invalid-body: body.extra is not a field of this type.");
    expect(recover({ ...take, purpose: "config-recovery" })).toBe("invalid-body: body.purpose is not a field of this type.");
  });

  it("take's scope is a list of valid patterns (R-DECL-21, R-PATH-1)", () => {
    expect(recover({ ...take, scope: ".artroom/**" })).toBe("invalid-body: body.scope must be an array.");
    expect(recover({ ...take, scope: ["/.artroom/**"] })).toBe("glob-invalid: body.scope[0] is not a valid pattern: a pattern must not start with /.");
  });

  it("take's scope names at least one pattern (R-DECL-21)", () => {
    expect(recover({ ...take, scope: [".artroom/room.json"] })).toBe("ok");
    expect(recover({ ...take, scope: [] })).toBe("invalid-body: body.scope needs at least 1 pattern.");
  });

  it("take's goal, when present, is a string (R-DECL-21)", () => {
    expect(recover({ ...take, goal: "g" })).toBe("ok");
    expect(recover({ ...take, goal: 7 })).toBe("invalid-body: body.goal must be a string.");
  });

  it("take's goal is at most 1024 bytes (R-DECL-21, R-SIG-6)", () => {
    expect(recover({ ...take, goal: text(1024) })).toBe("ok");
    expect(recover({ ...take, goal: text(1025) })).toBe("body-too-large: body.goal is longer than 1024 bytes.");
  });

  it("take's plan, when present, is a string (R-DECL-21)", () => {
    expect(recover({ ...take, plan: "p" })).toBe("ok");
    expect(recover({ ...take, plan: { steps: [] } })).toBe("invalid-body: body.plan must be a string.");
  });

  it("take's plan is at most 16384 bytes (R-DECL-21, R-SIG-6)", () => {
    expect(recover({ ...take, plan: text(16384) })).toBe("ok");
    expect(recover({ ...take, plan: text(16385) })).toBe("body-too-large: body.plan is longer than 16384 bytes.");
  });

  it("take's because, when present, is a list of reasons (R-DECL-21)", () => {
    expect(recover({ ...take, because })).toBe("ok");
    expect(recover({ ...take, because: [{ commit: "main" }] })).toBe("invalid-body: body.because[0].commit must be a git object name.");
  });

  it("take's expectedGeneration is an integer (R-DECL-21)", () => {
    expect(recover({ ...take, expectedGeneration: 3 })).toBe("ok");
    expect(recover({ ...take, expectedGeneration: "0" })).toBe(`invalid-body: body.expectedGeneration must be an integer from 0 to ${MAX}.`);
    expect(recover({ ...take, expectedGeneration: 0.5 })).toBe(`invalid-body: body.expectedGeneration must be an integer from 0 to ${MAX}.`);
  });

  it("take's expectedGeneration is not negative (R-DECL-21)", () => {
    expect(recover({ ...take, expectedGeneration: 0 })).toBe("ok");
    expect(recover({ ...take, expectedGeneration: -1 })).toBe(`invalid-body: body.expectedGeneration must be an integer from 0 to ${MAX}.`);
  });

  it("take's lease, when present, is an integer (R-DECL-21)", () => {
    expect(recover({ ...take, lease: 2 })).toBe("ok");
    expect(recover({ ...take, lease: "1" })).toBe(`invalid-body: body.lease must be an integer from 1 to ${MAX}.`);
  });

  it("take's lease is at least 1 (R-DECL-21)", () => {
    expect(recover({ ...take, lease: 1 })).toBe("ok");
    expect(recover({ ...take, lease: 0 })).toBe(`invalid-body: body.lease must be an integer from 1 to ${MAX}.`);
  });

  it("take's lease, goal, plan and because are optional (R-DECL-21)", () => {
    expect(recover({ ...take, goal: "g", plan: "p", because })).toBe("ok");
    expect(recover({ ...take, lease: 1, plan: "p", because })).toBe("ok");
    expect(recover({ ...take, lease: 1, goal: "g", because })).toBe("ok");
    expect(recover({ ...take, lease: 1, goal: "g", plan: "p" })).toBe("ok");
  });
});

describe("recover version has the legacy propose's fields and limits (R-DECL-21, R-SIG-6)", () => {
  const version: Body = { op: "version", lease: 1, expectedGeneration: 0, head: sha, summary: "s" };

  it("version is closed: it has no field but its own (R-DECL-21)", () => {
    expect(recover(version)).toBe("ok");
    expect(recover({ ...version, extra: 1 })).toBe("invalid-body: body.extra is not a field of this type.");
    expect(recover({ ...version, scope: [".artroom/**"] })).toBe("invalid-body: body.scope is not a field of this type.");
  });

  it("version's lease is an integer (R-DECL-21)", () => {
    expect(recover({ ...version, lease: 2 })).toBe("ok");
    expect(recover({ ...version, lease: "1" })).toBe(`invalid-body: body.lease must be an integer from 1 to ${MAX}.`);
  });

  it("version's lease is at least 1 (R-DECL-21)", () => {
    expect(recover({ ...version, lease: 1 })).toBe("ok");
    expect(recover({ ...version, lease: 0 })).toBe(`invalid-body: body.lease must be an integer from 1 to ${MAX}.`);
  });

  it("version's expectedGeneration is an integer (R-DECL-21)", () => {
    expect(recover({ ...version, expectedGeneration: 4 })).toBe("ok");
    expect(recover({ ...version, expectedGeneration: null })).toBe(`invalid-body: body.expectedGeneration must be an integer from 0 to ${MAX}.`);
  });

  it("version's expectedGeneration is not negative (R-DECL-21)", () => {
    expect(recover({ ...version, expectedGeneration: 0 })).toBe("ok");
    expect(recover({ ...version, expectedGeneration: -1 })).toBe(`invalid-body: body.expectedGeneration must be an integer from 0 to ${MAX}.`);
  });

  it("version's head is a git object name, and fixed-format (R-DECL-21, R-SEC-4)", () => {
    expect(recover({ ...version, head: "main" })).toBe("invalid-body: body.head must be a git object name.");
    expect(recover({ ...version, head: sha.toUpperCase() })).toBe("invalid-body: body.head must be a git object name.");
    expect([...checkBody("recover", null, version, declared).fixed]).toEqual(["body.head"]);
  });

  it("version's summary is a string (R-DECL-21)", () => {
    expect(recover({ ...version, summary: 7 })).toBe("invalid-body: body.summary must be a string.");
    expect(recover({ ...version, summary: null })).toBe("invalid-body: body.summary must be a string.");
  });

  it("version's summary is at most 8192 bytes (R-DECL-21, R-SIG-6)", () => {
    expect(recover({ ...version, summary: text(8192) })).toBe("ok");
    expect(recover({ ...version, summary: text(8193) })).toBe("body-too-large: body.summary is longer than 8192 bytes.");
  });

  it("version's because, when present, is a list of reasons (R-DECL-21)", () => {
    expect(recover({ ...version, because })).toBe("ok");
    expect(recover({ ...version, because: [{ url: "http://example.test/why" }] })).toBe("invalid-body: body.because[0].url must be an https URL.");
  });

  it("version's because is optional (R-DECL-21)", () => {
    expect(recover(version)).toBe("ok");
  });
});

describe("recover approve has the legacy review's fields and limits (R-DECL-21, R-SIG-6)", () => {
  const approve: Body = { op: "approve", head: sha, verdict: "approve", scope: [".artroom/**"], text: "t" };

  it("approve is closed: it has no field but its own (R-DECL-21)", () => {
    expect(recover(approve)).toBe("ok");
    expect(recover({ ...approve, extra: 1 })).toBe("invalid-body: body.extra is not a field of this type.");
    expect(recover({ ...approve, because })).toBe("invalid-body: body.because is not a field of this type.");
  });

  it("approve's head is a git object name, and fixed-format (R-DECL-21, R-SEC-4)", () => {
    expect(recover({ ...approve, head: "a".repeat(39) })).toBe("invalid-body: body.head must be a git object name.");
    expect(recover({ ...approve, head: 7 })).toBe("invalid-body: body.head must be a git object name.");
    expect([...checkBody("recover", null, approve, declared).fixed]).toEqual(["body.head"]);
  });

  it("approve's verdict is approve or object (R-DECL-21)", () => {
    expect(recover({ ...approve, verdict: "object" })).toBe("ok");
    expect(recover({ ...approve, verdict: "maybe" })).toBe("invalid-body: body.verdict must be one of approve, object.");
    expect(recover({ ...approve, verdict: true })).toBe("invalid-body: body.verdict must be one of approve, object.");
  });

  it("approve's scope is a list of valid patterns (R-DECL-21, R-PATH-1)", () => {
    expect(recover({ ...approve, scope: "**" })).toBe("invalid-body: body.scope must be an array.");
    expect(recover({ ...approve, scope: [".artroom/a**"] })).toBe("glob-invalid: body.scope[0] is not a valid pattern: ** must be a whole segment.");
  });

  it("approve's scope names at least one pattern (R-DECL-21)", () => {
    expect(recover({ ...approve, scope: [".artroom/room.json"] })).toBe("ok");
    expect(recover({ ...approve, scope: [] })).toBe("invalid-body: body.scope needs at least 1 pattern.");
  });

  it("approve's dependsOn, when present, is a list of valid patterns, and may be empty (R-DECL-21, R-PATH-1)", () => {
    expect(recover({ ...approve, dependsOn: [] })).toBe("ok");
    expect(recover({ ...approve, dependsOn: ["src/**"] })).toBe("ok");
    expect(recover({ ...approve, dependsOn: "src/**" })).toBe("invalid-body: body.dependsOn must be an array.");
    expect(recover({ ...approve, dependsOn: ["src/{a,b}"] })).toBe("glob-invalid: body.dependsOn[0] is not a valid pattern: ?, [, ], {, }, ! and \\ are not allowed.");
  });

  it("approve's dependsOn is optional (R-DECL-21)", () => {
    expect(recover(approve)).toBe("ok");
  });

  it("approve's text is a string (R-DECL-21)", () => {
    expect(recover({ ...approve, text: 7 })).toBe("invalid-body: body.text must be a string.");
    expect(recover({ ...approve, text: ["t"] })).toBe("invalid-body: body.text must be a string.");
  });

  it("approve's text is at most 16384 bytes (R-DECL-21, R-SIG-6)", () => {
    expect(recover({ ...approve, text: text(16384) })).toBe("ok");
    expect(recover({ ...approve, text: text(16385) })).toBe("body-too-large: body.text is longer than 16384 bytes.");
  });
});

describe("recover land has the legacy land's fields (R-DECL-21)", () => {
  const land: Body = { op: "land", lease: 1, head: sha };

  it("land is closed: it has no field but its own (R-DECL-21)", () => {
    expect(recover(land)).toBe("ok");
    expect(recover({ ...land, extra: 1 })).toBe("invalid-body: body.extra is not a field of this type.");
    expect(recover({ ...land, note: "n" })).toBe("invalid-body: body.note is not a field of this type.");
  });

  it("land's lease is an integer (R-DECL-21)", () => {
    expect(recover({ ...land, lease: 2 })).toBe("ok");
    expect(recover({ ...land, lease: "1" })).toBe(`invalid-body: body.lease must be an integer from 1 to ${MAX}.`);
  });

  it("land's lease is at least 1 (R-DECL-21)", () => {
    expect(recover({ ...land, lease: 1 })).toBe("ok");
    expect(recover({ ...land, lease: 0 })).toBe(`invalid-body: body.lease must be an integer from 1 to ${MAX}.`);
  });

  it("land's head is a git object name, and fixed-format (R-DECL-21, R-SEC-4)", () => {
    expect(recover({ ...land, head: "HEAD" })).toBe("invalid-body: body.head must be a git object name.");
    expect(recover({ ...land, head: `${sha}0` })).toBe("invalid-body: body.head must be a git object name.");
    expect([...checkBody("recover", null, land, declared).fixed]).toEqual(["body.head"]);
  });
});

describe("recover release has the legacy release's fields and limits (R-DECL-21, R-SIG-6)", () => {
  const release: Body = { op: "release", lease: 1 };

  it("release is closed: it has no field but its own (R-DECL-21)", () => {
    expect(recover(release)).toBe("ok");
    expect(recover({ ...release, extra: 1 })).toBe("invalid-body: body.extra is not a field of this type.");
    expect(recover({ ...release, head: sha })).toBe("invalid-body: body.head is not a field of this type.");
  });

  it("release's lease is an integer (R-DECL-21)", () => {
    expect(recover({ ...release, lease: 2 })).toBe("ok");
    expect(recover({ ...release, lease: 1.5 })).toBe(`invalid-body: body.lease must be an integer from 1 to ${MAX}.`);
  });

  it("release's lease is at least 1 (R-DECL-21)", () => {
    expect(recover({ ...release, lease: 1 })).toBe("ok");
    expect(recover({ ...release, lease: 0 })).toBe(`invalid-body: body.lease must be an integer from 1 to ${MAX}.`);
  });

  it("release's note, when present, is a string (R-DECL-21)", () => {
    expect(recover({ ...release, note: "n" })).toBe("ok");
    expect(recover({ ...release, note: 7 })).toBe("invalid-body: body.note must be a string.");
  });

  it("release's note is at most 8192 bytes (R-DECL-21, R-SIG-6)", () => {
    expect(recover({ ...release, note: text(8192) })).toBe("ok");
    expect(recover({ ...release, note: text(8193) })).toBe("body-too-large: body.note is longer than 8192 bytes.");
  });

  it("release's note is optional (R-DECL-21)", () => {
    expect(recover(release)).toBe("ok");
  });
});

describe("recover note has the legacy note's fields and limits (R-DECL-21, R-SIG-6)", () => {
  const note: Body = { op: "note", text: "t" };

  it("note is closed: it has no field but its own (R-DECL-21)", () => {
    expect(recover(note)).toBe("ok");
    expect(recover({ ...note, extra: 1 })).toBe("invalid-body: body.extra is not a field of this type.");
    expect(recover({ ...note, because })).toBe("invalid-body: body.because is not a field of this type.");
  });

  it("note's text is a string (R-DECL-21)", () => {
    expect(recover({ ...note, text: 7 })).toBe("invalid-body: body.text must be a string.");
    expect(recover({ ...note, text: { t: "t" } })).toBe("invalid-body: body.text must be a string.");
  });

  it("note's text is at most 16384 bytes (R-DECL-21, R-SIG-6)", () => {
    expect(recover({ ...note, text: text(16384) })).toBe("ok");
    expect(recover({ ...note, text: text(16385) })).toBe("body-too-large: body.text is longer than 16384 bytes.");
  });

  it("note's replyTo, when present, is an entry ID, and fixed-format (R-DECL-21, R-SEC-4)", () => {
    expect(recover({ ...note, replyTo: lane })).toBe("ok");
    expect(recover({ ...note, replyTo: "act_x" })).toBe("invalid-body: body.replyTo must be an entry ID.");
    expect(recover({ ...note, replyTo: 1 })).toBe("invalid-body: body.replyTo must be an entry ID.");
    expect([...checkBody("recover", null, { ...note, replyTo: lane }, declared).fixed]).toEqual(["body.replyTo"]);
  });

  it("note's replyTo is optional (R-DECL-21)", () => {
    expect(recover(note)).toBe("ok");
    expect([...checkBody("recover", null, note, declared).fixed]).toEqual([]);
  });
});

describe("a grant in a v2 room names platform kinds and a signed map (R-DECL-17)", () => {
  const grant = (over: Body, doc: AnyPolicyDocument = declared) => outcome(() => checkBody("roster", null, { op: "delegate", to: key, lanes: "*", expiresAt: "2026-10-02T00:00:00Z", ...over }, doc));
  const map = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`k${i}`, digest]));

  it("a grant's kinds are a list no longer than the delegable platform kinds, which today is renew alone (R-DECL-17)", () => {
    expect(grant({ kinds: [], acts: {} })).toBe("ok");
    expect(grant({ kinds: ["renew"], acts: {} })).toBe("ok");
    expect(grant({ kinds: ["renew", "renew"], acts: {} })).toBe("body-too-large: body.kinds has more than 1 items.");
  });

  // The repeat check of `platformKinds` cannot be reached while one platform kind is delegable: the bound refuses first.
  // If a second delegable platform kind is added, this test fails, and the repeat check then needs its own test.
  it("a grant cannot repeat a platform kind: renew is the only delegable one, so the bound of one item refuses a repeat (R-DECL-17)", () => {
    expect(DELEGABLE_PLATFORM).toEqual(["renew"]);
    expect(grant({ kinds: ["renew"], acts: {} })).toBe("ok");
    expect(grant({ kinds: ["renew", "renew"], acts: {} })).toBe("body-too-large: body.kinds has more than 1 items.");
  });

  it("a grant's kinds are judged as platform kinds in a v2 room: never *, and a declared kind is not one (R-DECL-17)", () => {
    expect(grant({ kinds: "*", acts: {} })).toBe("invalid-body: body.kinds must be an array.");
    expect(grant({ kinds: ["review"], acts: {} })).toBe("invalid-body: body.kinds[0] must be one of renew.");
  });

  it("a grant with an empty kinds list is accepted in a v2 room, and refused in a v1 room (R-DECL-17)", () => {
    expect(grant({ kinds: [], acts: {} })).toBe("ok");
    expect(grant({ kinds: [] }, legacy)).toBe("invalid-body: body.kinds must name at least one kind.");
  });

  it("a grant map must be an object from declared kind to binding (R-DECL-17)", () => {
    expect(grant({ kinds: [], acts: { claim: digest } })).toBe("ok");
    for (const acts of ["*", null, 7, [], ["claim"], [digest]]) expect(grant({ kinds: [], acts }), JSON.stringify(acts)).toBe("invalid-body: body.acts must be an object from declared kind to binding.");
  });

  it("a grant map names at most 64 kinds (R-DECL-17)", () => {
    expect(grant({ kinds: [], acts: map(64) })).toBe("ok");
    expect(grant({ kinds: [], acts: map(65) })).toBe("body-too-large: body.acts names more than 64 kinds.");
  });

  it("a grant map's keys are kind names of the grammar (R-DECL-17, R-DECL-2)", () => {
    expect(grant({ kinds: [], acts: { ["a".repeat(32)]: digest, "merge-2": digest } })).toBe("ok");
    expect(grant({ kinds: [], acts: { Claim: digest } })).toBe("invalid-body: body.acts.Claim is not a kind name.");
    expect(grant({ kinds: [], acts: { "2fa": digest } })).toBe("invalid-body: body.acts.2fa is not a kind name.");
    expect(grant({ kinds: [], acts: { "*": digest } })).toBe("invalid-body: body.acts.* is not a kind name.");
    expect(grant({ kinds: [], acts: { ["a".repeat(33)]: digest } })).toBe(`invalid-body: body.acts.${"a".repeat(33)} is not a kind name.`);
  });

  it("a grant's map is checked at step 5 in a v2 room: each value is a binding (R-DECL-17)", () => {
    expect(grant({ kinds: [], acts: { claim: "sha256:abc" } })).toBe("invalid-body: body.acts.claim must be a binding: sha256: and 64 lowercase hex digits.");
    expect(grant({ kinds: [], acts: { claim: null } })).toBe("invalid-body: body.acts.claim must be a binding: sha256: and 64 lowercase hex digits.");
  });
});

describe("a room-custody invitation's session in a v2 room has the same kinds and map as a grant (R-DECL-17)", () => {
  const session = (s: Body, doc: AnyPolicyDocument = declared) =>
    outcome(() => checkBody("roster", null, { op: "invite", member: "@a", role: "agent", custody: "room", expiresAt: "2026-10-02T00:00:00Z", secretHash: digest, session: s }, doc));
  const rest = { lanes: "*", ttlSeconds: 3600 };

  it("a v2 session must name its signed map: acts is required (R-DECL-17)", () => {
    expect(session({ kinds: [], acts: {}, ...rest })).toBe("ok");
    expect(session({ kinds: [], ...rest })).toBe("invalid-body: body.session.acts is required.");
  });

  it("a v2 session's kinds are a list of platform kinds, never * (R-DECL-17)", () => {
    expect(session({ kinds: ["renew"], acts: {}, ...rest })).toBe("ok");
    expect(session({ kinds: "*", acts: {}, ...rest })).toBe("invalid-body: body.session.kinds must be an array.");
    expect(session({ kinds: ["claim"], acts: {}, ...rest })).toBe("invalid-body: body.session.kinds[0] must be one of renew.");
    expect(session({ kinds: ["renew", "renew"], acts: {}, ...rest })).toBe("body-too-large: body.session.kinds has more than 1 items.");
  });

  it("a v2 session's map is a well-formed grant map (R-DECL-17)", () => {
    expect(session({ kinds: [], acts: { claim: digest }, ...rest })).toBe("ok");
    expect(session({ kinds: [], acts: "*", ...rest })).toBe("invalid-body: body.session.acts must be an object from declared kind to binding.");
    expect(session({ kinds: [], acts: { Claim: digest }, ...rest })).toBe("invalid-body: body.session.acts.Claim is not a kind name.");
    expect(session({ kinds: [], acts: { claim: "x" }, ...rest })).toBe("invalid-body: body.session.acts.claim must be a binding: sha256: and 64 lowercase hex digits.");
  });

  it("a session with an empty kinds list is accepted in a v2 room, and refused in a v1 room (R-DECL-17)", () => {
    expect(session({ kinds: [], acts: {}, ...rest })).toBe("ok");
    expect(session({ kinds: [], ...rest }, legacy)).toBe("invalid-body: body.session.kinds must name at least one kind.");
  });

  it("in a v1 room a session keeps the legacy shape: * is accepted and a map is not a field (R-DECL-17)", () => {
    expect(session({ kinds: "*", ...rest }, legacy)).toBe("ok");
    expect(session({ kinds: "*", acts: {}, ...rest }, legacy)).toBe("invalid-body: body.session.acts is not a field of this type.");
  });
});
