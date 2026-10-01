// Room failure paths (review 8f5dede9, P1.2) on real SQLite (node:sqlite),
// real Ed25519 signatures and the real evaluator. Artifacts is an in-memory stub.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { RoomSpike } from "./.build/room.mjs";
import { RoomSpike as FaultyRoomSpike } from "./.build/room-fault.mjs";

const basePolicy = JSON.parse(readFileSync(new URL("../src/policy.json", import.meta.url), "utf8"));

// SqlStorage over node:sqlite: exec(query, ...bindings) with toArray() and one().
function storage() {
  const db = new DatabaseSync(":memory:");
  const sql = {
    exec(query, ...bindings) {
      let rows = [];
      if (bindings.length === 0 && query.trim().replace(/;\s*$/, "").includes(";")) db.exec(query);
      else rows = db.prepare(query).all(...bindings).map((r) => ({ ...r }));
      return { toArray: () => rows, one: () => { if (rows.length !== 1) throw new Error("expected one row"); return rows[0]; } };
    },
  };
  const transactionSync = (fn) => {
    db.exec("BEGIN");
    try { const r = fn(); db.exec("COMMIT"); return r; } catch (e) { db.exec("ROLLBACK"); throw e; }
  };
  const count = (table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
  return { ctx: { storage: { sql, transactionSync } }, db, count };
}

// Two commits: B changes src/x.ts and adds src/api/y.ts.
const trees = {
  tA: [{ name: "README.md", type: "blob", mode: "100644", hash: "r1" }, { name: "src", type: "tree", mode: "40000", hash: "sA" }],
  sA: [{ name: "x.ts", type: "blob", mode: "100644", hash: "x1" }],
  tB: [{ name: "README.md", type: "blob", mode: "100644", hash: "r1" }, { name: "src", type: "tree", mode: "40000", hash: "sB" }],
  sB: [{ name: "x.ts", type: "blob", mode: "100644", hash: "x2" }, { name: "api", type: "tree", mode: "40000", hash: "aB" }],
  aB: [{ name: "y.ts", type: "blob", mode: "100644", hash: "y1" }],
};
const repo = { readCommit: async (h) => ({ A: { treeHash: "tA" }, B: { treeHash: "tB" } })[h] ?? null, readTree: async (h) => trees[h] ?? null, [Symbol.dispose]() {} };
const env = { REPO: "test", ARTIFACTS: { get: async () => repo } };

const canonical = (v) => {
  if (v === null || typeof v === "boolean" || typeof v === "number") return String(v);
  if (typeof v === "string") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`;
};
async function actor() {
  const kp = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  return { id: Buffer.from(await crypto.subtle.exportKey("raw", kp.publicKey)).toString("base64url"), key: kp.privateKey };
}
let n = 0;
async function sign(who, kind, body) {
  const act = { kind, actor: who.id, body, nonce: `n${n++}` };
  return { act, sig: Buffer.from(await crypto.subtle.sign("Ed25519", who.key, new TextEncoder().encode(canonical(act)))).toString("base64url") };
}

const doubling = '($a0 := "0123456789abcdef"; ' + Array.from({ length: 24 }, (_, i) => `$a${i + 1} := $a${i} & $a${i};`).join(" ") + ' [{"review":"@security"}])';
const withRule = (rule) => ({ ...basePolicy, rules: [...basePolicy.rules, rule] });
const tables = ["acts", "claims", "proposals", "reviews", "evaluations", "refusals", "attention"];
const snapshot = (s) => Object.fromEntries(tables.map((t) => [t, s.count(t)]));

async function roomWith(policy, Room = RoomSpike) {
  const s = storage();
  const room = new Room(s.ctx, env);
  await room.setup(policy);
  const author = await actor();
  const claim = await room.act(await sign(author, "claim", { goal: "g", scope: ["**"] }));
  assert.ok(!claim.refused, JSON.stringify(claim));
  return { s, room, author, claim };
}

test("baseline: a propose is appended with its obligations", async () => {
  const { s, room, author, claim } = await roomWith(basePolicy);
  const p = await room.act(await sign(author, "propose", { claim: claim.seq, base: "A", head: "B" }));
  assert.ok(!p.refused, JSON.stringify(p));
  assert.deepEqual(p.changed, ["src/api/y.ts", "src/x.ts"]);
  assert.deepEqual(p.obligations, [{ check: "tests" }, { review: "any" }]);
  assert.equal(s.count("proposals"), 1);
});

test("a require rule that trips a budget refuses the act and appends nothing", async () => {
  const rule = { id: "required-security-review", kind: "require", on: ["propose"], expr: doubling };
  const { s, room, author, claim } = await roomWith(withRule(rule));
  const before = snapshot(s);
  const env = await sign(author, "propose", { claim: claim.seq, base: "A", head: "B" });
  const r = await room.act(env);
  assert.equal(r.refused, true);
  assert.equal(r.rule, "required-security-review");
  assert.match(r.reason, /value_bytes/);
  const after = snapshot(s);
  assert.equal(after.acts, before.acts, "no act appended");
  assert.equal(after.proposals, 0, "no proposal appended");
  assert.equal(after.refusals, before.refusals + 1);
  // The failing evaluation is recorded with its input and error.
  const row = s.db.prepare("SELECT input, output, act_digest FROM evaluations WHERE rule = ? AND seq IS NULL").get("required-security-review");
  assert.match(row.output, /"error":"value_bytes"/);
  assert.match(row.input, /"changed":\["src\/api\/y.ts","src\/x.ts"\]/);
  // Replaying the recorded inputs gives the same outcome, twice.
  for (let i = 0; i < 2; i++) {
    const x = await room.explainRefusal(row.act_digest);
    assert.equal(x.deterministic, true, JSON.stringify(x));
    assert.ok(x.evaluations.some((e) => e.rule === "required-security-review" && e.output.error === "value_bytes"));
  }
});

test("a require rule with the wrong output shape refuses the act", async () => {
  const rule = { id: "bad-shape", kind: "require", on: ["propose"], expr: '"yes"' };
  const { s, room, author, claim } = await roomWith(withRule(rule));
  const r = await room.act(await sign(author, "propose", { claim: claim.seq, base: "A", head: "B" }));
  assert.equal(r.rule, "bad-shape");
  assert.match(r.reason, /rule_output/);
  assert.equal(s.count("proposals"), 0);
});

test("a refuse rule with a non-boolean result refuses rather than passes", async () => {
  const rule = { id: "null-refuse", kind: "refuse", on: ["propose"], expr: "nothing.here" };
  const { s, room, author, claim } = await roomWith(withRule(rule));
  const r = await room.act(await sign(author, "propose", { claim: claim.seq, base: "A", head: "B" }));
  assert.equal(r.rule, "null-refuse");
  assert.equal(s.count("proposals"), 0);
});

for (const kind of ["require", "refuse", "notify"]) {
  test(`an injected engine fault in a ${kind} rule records nothing and is retryable`, async () => {
    const rule = { id: `fault-${kind}`, kind, on: ["propose"], expr: kind === "notify" ? '$glob("x", "__inject_fault__") ? [] : []' : kind === "refuse" ? '$glob("x", "__inject_fault__")' : '$glob("x", "__inject_fault__") ? [] : []' };
    const { s, room, author, claim } = await roomWith(withRule(rule), FaultyRoomSpike);
    const before = snapshot(s);
    const env = await sign(author, "propose", { claim: claim.seq, base: "A", head: "B" });
    await assert.rejects(room.act(env), (e) => /^engine_fault:/.test(e.message));
    assert.deepEqual(snapshot(s), before, "no act, refusal, evaluation or derived row");
    // The room still serves the next act.
    const next = await room.act(await sign(author, "claim", { goal: "after", scope: ["docs/**"] }));
    assert.ok(!next.refused, JSON.stringify(next));
  });
}

test("benchmarks running beside an act do not change its recorded evaluations", async () => {
  const strip = (s) => s.db.prepare("SELECT rule, input, output, steps FROM evaluations ORDER BY id").all().map((r) => ({ ...r }));
  // Both rooms record one propose, so the benchmark has the propose rules to
  // re-evaluate. Room b then proposes again while benchmarks run in every mode.
  const a = await roomWith(basePolicy);
  const b = await roomWith(basePolicy);
  for (const x of [a, b]) await x.room.act(await sign(x.author, "propose", { claim: x.claim.seq, base: "A", head: "B" }));
  await a.room.act(await sign(a.author, "propose", { claim: a.claim.seq, base: "A", head: "B" }));
  const propose = await sign(b.author, "propose", { claim: b.claim.seq, base: "A", head: "B" });
  const bench = [false, "steps", true, "memo", false, true].map((guard) => b.room.bench({ op: "rules", n: 2, inner: 10, guard }));
  const results = await Promise.all([b.room.act(propose), ...bench]);
  assert.ok(Object.keys(results[1].rules).length >= 5, "benchmark re-evaluated the propose rules");
  const norm = (rows) => rows.map((r) => ({ ...r, input: r.input.replace(/"(actor|nonce|digest)":"[^"]*"/g, "") }));
  assert.deepEqual(norm(strip(b.s)), norm(strip(a.s)));
});
