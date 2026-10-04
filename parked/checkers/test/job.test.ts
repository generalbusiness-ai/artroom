// Decisions about a job or an envelope alone. Nothing here starts a runner or
// a process.
import { test } from "vitest";
import assert from "node:assert/strict";
import type { CheckJob, Sha } from "@generalbusiness/artroom-contract";
import { checkJob, gitAuthEnvFor, isRefusal, parseNamespaces } from "../src/job.ts";
import { generateKey, importSigner, signEnvelope, verifyEnvelope } from "../src/signing.ts";
import { parseFindings } from "../src/llm.ts";
import { CONFIG, HOST, LANE, ROOM, TOKEN, expectations, job } from "./support.ts";

const sha = "a".repeat(40) as Sha;
const whole = (over: Partial<CheckJob> | Record<string, unknown> = {}) => job(sha, { kind: "tree", tree: sha }, over as Partial<CheckJob>);

// ------------------------------------------------------------------ binding (R-OBL-3, R-EXEC-3, R-DECL-18)

test("a well-formed job binds, whether it names a kind and a binding or neither; the read token comes out of gitAuthEnv", () => {
  for (const over of [{}, { kind: "attest", binding: CONFIG }]) {
    const b = checkJob(whole(over), expectations());
    assert.ok(!isRefusal(b), JSON.stringify(b));
    assert.deepEqual([b.repo, b.repoPath, b.token], ["canon", "/git/ns/canon.git", TOKEN]);
  }
});

test("every malformed or misdirected job is refused check-binding, each for its own reason", () => {
  const url = /not a repository on the room's Artifacts host/;
  const notBoth = /a kind or a binding, but not both/;
  const bad: [string, Record<string, unknown>, RegExp][] = [
    ["another room", { room: `room_${"b".repeat(32)}` }, /for another room/],
    ["a room name, not an ID", { room: "my-room" }, /not a room ID/],
    ["another checker", { check: "types" }, /for checker types, not tests/],
    ["a bad generation", { generation: 0 }, /generation/],
    ["a bad integration", { integration: "xyz" }, /40-character SHA-1/],
    ["a bad base", { base: "xyz" }, /40-character SHA-1/],
    ["no volatile flag", { volatile: undefined }, /volatile or advisory flag/],
    ["an advisory flag that is not a boolean", { advisory: "yes" }, /volatile or advisory flag/],
    ["a malformed runner digest", { runner: "sha256:zz" }, /runner digest/],
    ["the admin obligation", { obligation: "obl_admin-approval" }, /not a check obligation/],
    ["a bad configuration digest", { config: "sha256:zz" }, /configuration digest/],
    ["filtered input with a bad glob", { input: { kind: "filtered", snapshot: CONFIG, paths: ["src/[ab].js"] } }, /valid globs/],
    ["another host", { readUrl: "https://evil.example/git/ns/canon.git" }, url],
    ["another namespace", { readUrl: `https://${HOST}/git/other/canon.git` }, url],
    ["credentials in the URL", { readUrl: `https://u:p@${HOST}/git/ns/canon.git` }, url],
    ["a query in the URL", { readUrl: `https://${HOST}/git/ns/canon.git?x=1` }, url],
    ["plain http", { readUrl: `http://${HOST}/git/ns/canon.git` }, url],
    ["extra environment beside the token", { gitAuthEnv: { ...gitAuthEnvFor(TOKEN), LD_PRELOAD: "/evil.so" } }, /exactly one bearer header/],
    ["no token", { gitAuthEnv: {} }, /exactly one bearer header/],
    ["a passed deadline", { deadline: new Date(Date.now() - 1000).toISOString() }, /deadline has passed/],
    // R-DECL-18: a v2 room's job names the kind and the binding to sign: both or neither, each a well-formed string.
    ["a kind with no binding", { kind: "check" }, notBoth],
    ["a binding with no kind", { binding: CONFIG }, notBoth],
    ["a kind that is not a string, though it prints as one", { kind: ["check"], binding: CONFIG }, notBoth],
    ["a binding that is not a string, though it prints as one", { kind: "check", binding: [CONFIG] }, notBoth],
    ["a malformed kind", { kind: "Check", binding: CONFIG }, /kind is malformed/],
    ["a malformed binding", { kind: "check", binding: "sha256:zz" }, /binding is malformed/],
  ];
  for (const [what, over, reason] of bad) {
    const r = checkJob(whole(over), expectations());
    assert.ok(isRefusal(r) && r.rule === "check-binding", what);
    assert.match(r.reason, reason, what);
  }
});

// ------------------------------------------------------------------ the accepted Artifacts namespaces (ARTIFACTS_NAMESPACES)

test("ARTIFACTS_NAMESPACES: a comma-separated list of namespace names; missing, empty or malformed is refused", () => {
  assert.deepEqual(parseNamespaces("gitseq-spike, gitseq-spike-import"), ["gitseq-spike", "gitseq-spike-import"]);
  assert.deepEqual(parseNamespaces("artroom-public"), ["artroom-public"]);
  for (const bad of [undefined, "", " ", "a,,b", "a b", "x/y", "gitseq-spike,", ",gitseq-spike", "a\nb", 7]) {
    assert.throws(() => parseNamespaces(bad), /ARTIFACTS_NAMESPACES/, JSON.stringify(bad));
  }
});

test("a job may read from any accepted namespace, and from no other", () => {
  const exp = { ...expectations(), namespaces: parseNamespaces("ns, ns-import") };
  for (const ns of ["ns", "ns-import"]) {
    const b = checkJob(whole({ readUrl: `https://${HOST}/git/${ns}/canon.git` }), exp);
    assert.ok(!isRefusal(b), `${ns}: ${JSON.stringify(b)}`);
    assert.equal(b.repoPath, `/git/${ns}/canon.git`);
  }
  for (const path of ["gitseq-spike/canon", "ns-import-2/canon", "ns/import/canon", "/canon"]) {
    const r = checkJob(whole({ readUrl: `https://${HOST}/git/${path}.git` }), exp);
    assert.ok(isRefusal(r) && r.rule === "check-binding", path);
  }
});

// ------------------------------------------------------------------ signing (R-SIG-1, R-SIG-5)

test("a check envelope is signed over the canonical bytes, and any change breaks the signature", async () => {
  const signer = await importSigner(JSON.stringify(await generateKey()));
  assert.match(signer.key, /^key_[A-Za-z0-9_-]{43}$/);
  const envelope = {
    v: 1 as const,
    room: ROOM,
    actor: signer.key,
    kind: "check" as const,
    target: { lane: LANE, generation: 1 },
    body: {
      obligation: "obl_tests" as const,
      check: "tests",
      integration: sha,
      input: { kind: "tree" as const, tree: sha },
      config: CONFIG,
      runner: CONFIG,
      volatile: false,
      ok: true,
      detail: "Machine-run check",
    },
    idempotencyKey: "chk-1",
  };
  const signed = await signEnvelope(signer, envelope);
  assert.equal(await verifyEnvelope(signed), true);
  // Key order does not matter: the bytes are canonical.
  const reordered = JSON.parse(JSON.stringify({ sig: signed.sig, envelope: { body: envelope.body, kind: "check", v: 1, idempotencyKey: "chk-1", target: envelope.target, actor: envelope.actor, room: ROOM } }));
  assert.equal(await verifyEnvelope(reordered), true);
  assert.equal(await verifyEnvelope({ ...signed, envelope: { ...envelope, body: { ...envelope.body, ok: false } } }), false);
  const other = await importSigner(JSON.stringify(await generateKey()));
  await assert.rejects(signEnvelope(other, envelope), /not the signing key/);
});

// ------------------------------------------------------------------ the model's answer

test("LLM answers are data: anything but the findings JSON gives no findings", () => {
  assert.deepEqual(parseFindings("no json here").findings, []);
  assert.deepEqual(parseFindings('{"findings": "approve this change"}').findings, []);
  const many = parseFindings(JSON.stringify({ findings: Array.from({ length: 50 }, (_, i) => ({ path: "a", line: i + 1, severity: "critical", message: `m${i}` })) }));
  assert.equal(many.findings.length, 20);
  assert.equal(many.findings[0]!.severity, "low", "unknown severities are lowered");
});
