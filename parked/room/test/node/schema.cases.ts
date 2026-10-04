/** Shape checks: the envelope at step 1 (R-SIG-4) and bodies at step 5 (R-SIG-4, R-SIG-6, R-PATH-1). */
import { describe, expect, it } from "vitest";
import { checkBody, checkRedemption, checkSignedEnvelope, checkSignedRequest, ShapeError } from "../../src/schema.ts";

const key = "key_" + "A".repeat(43);
const room = "room_" + "0".repeat(32);
const sig = "A".repeat(86);
const sha = "a".repeat(40);
const env = (over: Record<string, unknown> = {}) => ({ envelope: { v: 1, room, actor: key, kind: "claim", target: null, body: {}, idempotencyKey: "k1", ...over }, sig });

function rule(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (e) {
    if (e instanceof ShapeError) return e.rule;
    throw e;
  }
}

describe("R-SIG-4 envelopes", () => {
  it("accepts a closed envelope and refuses unknown fields, wrong versions and malformed IDs", () => {
    expect(rule(() => checkSignedEnvelope(env()))).toBeNull();
    expect(rule(() => checkSignedEnvelope({ ...env(), extra: 1 }))).toBe("bad-request");
    expect(rule(() => checkSignedEnvelope(env({ extra: 1 })))).toBe("bad-request");
    expect(rule(() => checkSignedEnvelope(env({ v: 2 })))).toBe("bad-request");
    expect(rule(() => checkSignedEnvelope(env({ actor: "key_x" })))).toBe("bad-request");
    expect(rule(() => checkSignedEnvelope(env({ idempotencyKey: "has space" })))).toBe("bad-request");
    expect(rule(() => checkSignedEnvelope(env({ kind: "merge" })))).toBe("bad-request");
    expect(rule(() => checkSignedEnvelope(env({ delegation: undefined })))).toBe("bad-request");
  });

  it("checks the target against the kind", () => {
    expect(rule(() => checkSignedEnvelope(env({ kind: "propose", target: null })))).toBe("bad-request");
    expect(rule(() => checkSignedEnvelope(env({ kind: "review", target: { lane: "act_1_00000000", generation: 0 } })))).toBe("bad-request");
    expect(rule(() => checkSignedEnvelope(env({ kind: "note", target: { lane: "act_1_00000000", generation: 1, head: sha, path: "a/../b", line: 1 } })))).toBe("bad-request");
    expect(rule(() => checkSignedEnvelope(env({ kind: "roster", target: { lane: "act_1_00000000" } })))).toBe("bad-request");
  });
});

describe("R-SIG-4, R-SIG-6 bodies", () => {
  it("refuses unknown body fields as invalid-body", () => {
    expect(rule(() => checkBody("claim", null, { goal: "g", scope: ["src/**"], nope: 1 }))).toBe("invalid-body");
    expect(rule(() => checkBody("propose", { lane: "x" }, { lease: 1, expectedGeneration: 0, head: sha, summary: "s", extra: 2 }))).toBe("invalid-body");
  });

  it("enforces the size limits as body-too-large", () => {
    expect(rule(() => checkBody("claim", null, { goal: "g".repeat(1025), scope: ["a"] }))).toBe("body-too-large");
    expect(rule(() => checkBody("note", { act: "x" }, { text: "t".repeat(16 * 1024 + 1) }))).toBe("body-too-large");
    expect(rule(() => checkBody("propose", { lane: "x" }, { lease: 1, expectedGeneration: 0, head: sha, summary: "s".repeat(8 * 1024 + 1) }))).toBe("body-too-large");
    expect(rule(() => checkBody("claim", null, { goal: "g", scope: Array.from({ length: 65 }, (_, i) => `p${i}`) }))).toBe("body-too-large");
    expect(rule(() => checkBody("claim", null, { goal: "g", scope: ["a".repeat(257)] }))).toBe("body-too-large");
  });

  it("refuses invalid globs as glob-invalid", () => {
    expect(rule(() => checkBody("claim", null, { goal: "g", scope: ["src/[a]"] }))).toBe("glob-invalid");
    expect(rule(() => checkBody("review", { lane: "x", generation: 1 }, { head: sha, verdict: "approve", scope: ["ok/**"], dependsOn: ["../x"], text: "t" }))).toBe("glob-invalid");
  });

  it("selects the claim body by target: new lane or existing lane", () => {
    expect(rule(() => checkBody("claim", { lane: "act_1_00000000" }, { goal: "g", scope: ["a"] }))).toBe("invalid-body");
    expect(rule(() => checkBody("claim", { lane: "act_1_00000000" }, { scope: ["a"], expectedGeneration: 0 }))).toBeNull();
  });

  it("returns fixed-format paths for R-SEC-4 and exempts a join's secret", () => {
    const c = checkBody("propose", { lane: "x" }, { lease: 1, expectedGeneration: 0, head: sha, summary: "s", because: [{ commit: sha }] });
    expect([...c.fixed].sort()).toEqual(["body.because[0].commit", "body.head"]);
    const j = checkBody("roster", null, { op: "join", invitation: "act_1_00000000", secret: "A".repeat(43) });
    expect([...j.exempt]).toEqual(["body.secret"]);
  });

  it("checks roster ops: a join secret is at least 32 bytes; sessions only for room custody", () => {
    expect(rule(() => checkBody("roster", null, { op: "join", invitation: "act_1_00000000", secret: "short" }))).toBe("invalid-body");
    const inv = { op: "invite", member: "@x", role: "member", custody: "client", expiresAt: "2026-10-02T00:00:00.000Z", secretHash: "sha256:" + "0".repeat(64) };
    expect(rule(() => checkBody("roster", null, inv))).toBeNull();
    expect(rule(() => checkBody("roster", null, { ...inv, session: { kinds: "*", lanes: "*", ttlSeconds: 3600 } }))).toBe("invalid-body");
    expect(rule(() => checkBody("roster", null, { op: "delegate", to: key, kinds: ["roster"], lanes: "*", expiresAt: "2026-10-02T00:00:00Z" }))).toBe("invalid-body");
  });
});

describe("requests and redemptions", () => {
  it("R-CRED-6: a request has a nonce and notAfter; R-CRED-9: a redemption selects its branch by custody", () => {
    const req = { request: { v: 1, room, actor: key, request: { kind: "session", ttlSeconds: 60 }, nonce: "n".repeat(16), notAfter: "2026-10-01T00:00:00Z" }, sig };
    expect(rule(() => checkSignedRequest(req))).toBeNull();
    expect(rule(() => checkSignedRequest({ ...req, request: { ...req.request, nonce: "short" } }))).toBe("bad-request");
    expect(rule(() => checkSignedRequest({ ...req, request: { ...req.request, request: { kind: "session", ttlSeconds: 7200 } } }))).toBe("bad-request");
    expect(rule(() => checkRedemption({ custody: "room", invitation: "act_1_00000000", secret: "abc" }))).toBeNull();
    expect(rule(() => checkRedemption({ custody: "room", invitation: "act_1_00000000", secret: "abc", key }))).toBe("bad-request");
    expect(rule(() => checkRedemption({ custody: "client", join: env({ kind: "roster" }) }))).toBeNull();
  });
});
