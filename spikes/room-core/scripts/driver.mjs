// Local driver for the room-core spike. Signs acts with Ed25519 (WebCrypto),
// posts them to the Worker, and records latencies.
//
//   node scripts/driver.mjs <base-url> [--runs 50] [--room name] [--phases acts,diff,bench] [--out file]
//
// Base URL is http://127.0.0.1:8787 for `wrangler dev`, or the workers.dev URL.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const base = args[0];
const opt = (name, d) => { const i = args.indexOf(`--${name}`); return i > 0 ? args[i + 1] : d; };
const runs = Number(opt("runs", 50));
const room = opt("room", `spike-${Date.now()}`);
const phases = opt("phases", "acts,diff,bench").split(",");
const out = opt("out", join(here, "..", "results", `${new URL(base).hostname.startsWith("127.") ? "local" : "deployed"}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`));
const repo = JSON.parse(readFileSync(join(here, "..", "results", "repo.json"), "utf8"));
const policy = JSON.parse(readFileSync(join(here, "..", "src", "policy.json"), "utf8"));

// ------------------------------------------------------------ signing
const canonical = (v) => {
  if (v === null || typeof v === "boolean") return String(v);
  if (typeof v === "number") { if (!Number.isSafeInteger(v)) throw new Error("safe integers only"); return String(v); }
  if (typeof v === "string") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`;
};
const b64url = (buf) => Buffer.from(buf).toString("base64url");
async function actor() {
  const kp = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const id = b64url(await crypto.subtle.exportKey("raw", kp.publicKey));
  return { id, key: kp.privateKey };
}
let nonce = 0;
async function sign(who, kind, body) {
  const act = { kind, actor: who.id, body, nonce: `${Date.now()}-${nonce++}` };
  const sig = b64url(await crypto.subtle.sign("Ed25519", who.key, new TextEncoder().encode(canonical(act))));
  return { act, sig };
}

// ------------------------------------------------------------ transport
// A deploy resets live Durable Objects for a while; acts are idempotent by
// (actor, nonce), so the driver resends the same request and counts it.
const resets = [];
async function call(method, path, body, attempt = 0) {
  try {
    return await call1(method, path, body);
  } catch (e) {
    if (attempt < 3 && /reset because its code was updated/.test(e.message)) {
      resets.push({ path: path.split("?")[0], at: new Date().toISOString() });
      return call(method, path, body, attempt + 1);
    }
    throw e;
  }
}
async function call1(method, path, body) {
  const t = performance.now();
  const r = await fetch(`${base}/r/${room}/${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { "content-type": "application/json", "user-agent": "artroom-spike-driver/0.1" } });
  const text = await r.text();
  const ms = performance.now() - t;
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`${path}: HTTP ${r.status}: ${text.slice(0, 300)}`); }
  if (json.error) throw new Error(`${path}: ${json.error}`);
  return { ms, ...json };
}

const stats = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  const r = (x) => Math.round(x * 1000) / 1000;
  return { n: s.length, p50: r(q(0.5)), p90: r(q(0.9)), max: r(s[s.length - 1]), min: r(s[0]) };
};

const result = { base, room, runs, started: new Date().toISOString(), repo: { base: repo.base, small: repo.small, large: repo.large, files: repo.files } };
const same = (a, b) => a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i]);

// ------------------------------------------------------------ phases
const author = await actor();
const reviewer = await actor();
policy.roles = { "@docs": [reviewer.id] };

if (phases.includes("acts")) {
  const setup = await call("POST", "setup", policy); // first call to a new room: compiles every rule
  result.first = { setupRoundTrip: setup.ms, setupWorkerMs: setup.worker_ms };
  const lat = {}; // step -> [round trip ms]
  const inDo = {}; // step -> [DO total ms]
  const parts = { verify: [], diff: [], sql: [] };
  const ruleMs = {};
  const add = (k, r) => {
    (lat[k] ??= []).push(r.ms);
    (inDo[k] ??= []).push(r.result.timings.total);
    parts.verify.push(r.result.timings.verify);
    parts.sql.push(r.result.timings.sql);
    if (r.result.timings.diff) parts.diff.push(r.result.timings.diff);
    for (const [kind, ms] of Object.entries(r.result.timings.rules)) (ruleMs[kind] ??= []).push(ms);
  };
  const expect = (cond, msg) => { if (!cond) throw new Error(`unexpected: ${msg}`); };
  for (let i = 0; i < runs; i++) {
    const claim = await call("POST", "act", await sign(author, "claim", { goal: `spike run ${i}`, scope: ["**"] }));
    expect(!claim.result.refused, `claim refused: ${JSON.stringify(claim.result)}`); add("claim", claim);
    if (i === 0) result.first.claimRoundTrip = claim.ms;
    const p1 = await call("POST", "act", await sign(author, "propose", { claim: claim.result.seq, base: repo.base, head: repo.small }));
    expect(!p1.result.refused && same(p1.result.changed, repo.expected.small), `propose small: ${JSON.stringify(p1.result).slice(0, 400)}`); add("propose-small", p1);
    const self = await call("POST", "act", await sign(author, "review", { proposal: p1.result.seq, verdict: "approve", scope: ["**"] }));
    expect(self.result.refused && self.result.rule === "no-self-review", "self review not refused"); add("review-refused", self);
    const r1 = await call("POST", "act", await sign(reviewer, "review", { proposal: p1.result.seq, verdict: "approve", scope: ["examples/**"] }));
    expect(!r1.result.refused, "review 1 refused"); add("review", r1);
    const p2 = await call("POST", "act", await sign(author, "propose", { claim: claim.result.seq, base: repo.base, head: repo.large }));
    expect(!p2.result.refused && same(p2.result.changed, repo.expected.large) && p2.result.carried.length === 1 && p2.result.carried[0].fresh === false, `propose large: ${JSON.stringify(p2.result).slice(0, 600)}`);
    add("propose-large-survive", p2);
    const l1 = await call("POST", "act", await sign(author, "land", { proposal: p2.result.seq }));
    expect(l1.result.refused && l1.result.rule === "obligations-met", `land 1 not refused: ${JSON.stringify(l1.result)}`); add("land-refused", l1);
    const r2 = await call("POST", "act", await sign(reviewer, "review", { proposal: p2.result.seq, verdict: "approve", scope: ["**"] }));
    expect(!r2.result.refused, "review 2 refused"); add("review", r2);
    const l2 = await call("POST", "act", await sign(author, "land", { proposal: p2.result.seq }));
    expect(!l2.result.refused && l2.result.commit === repo.large, `land 2: ${JSON.stringify(l2.result)}`); add("land", l2);
    if (i === 0) result.sample = { claim: claim.result, proposeLarge: { ...p2.result, changed: `${p2.result.changed.length} paths` }, landRefused: l1.result, land: l2.result, selfReview: self.result };
    process.stderr.write(`\r acts run ${i + 1}/${runs}`);
  }
  process.stderr.write("\n");
  // Idempotent replay and a bad signature.
  const again = await sign(author, "claim", { goal: "replay", scope: ["docs/**"] });
  const first = await call("POST", "act", again);
  const second = await call("POST", "act", again);
  const forged = await sign(author, "claim", { goal: "forged", scope: ["x/**"] });
  forged.act.body.goal = "changed after signing";
  const bad = await call("POST", "act", forged);
  result.checks = { replayed: second.result.replayed === true && second.result.seq === first.result.seq, badSignature: bad.result.refused === true && bad.result.rule === "signature" };
  // Replay the recorded rule inputs of every appended act.
  let evaluations = 0, differing = 0, actsReplayed = 0;
  for (let seq = 1; seq <= first.result.seq; seq++) {
    const e = (await call("GET", `explain?seq=${seq}`)).result;
    actsReplayed++;
    evaluations += e.evaluations.length;
    differing += e.evaluations.filter((x) => !x.same).length;
  }
  result.checks.explain = { actsReplayed, evaluations, differing };
  result.acts = {
    roundTrip: Object.fromEntries(Object.entries(lat).map(([k, v]) => [k, stats(v)])),
    roundTripAll: stats(Object.values(lat).flat()),
    inDurableObject: Object.fromEntries(Object.entries(inDo).map(([k, v]) => [k, stats(v)])),
    parts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, stats(v)])),
    rulesPerAct: Object.fromEntries(Object.entries(ruleMs).map(([k, v]) => [k, stats(v)])),
  };
}

if (phases.includes("diff")) {
  result.diff = {};
  for (const [name, from, to, cached] of [["small", repo.base, repo.small, 0], ["large", repo.base, repo.large, 0], ["large-cached", repo.base, repo.large, 1]]) {
    const rows = [];
    for (let i = 0; i < runs; i++) {
      const r = await call("GET", `diff?from=${from}&to=${to}&cached=${cached}`);
      if (!same(r.result.paths, repo.expected[name.split("-")[0]])) throw new Error(`diff ${name} mismatch`);
      rows.push(r);
    }
    result.diff[name] = { paths: rows[0].result.count, readTrees: rows.map((r) => r.result.readTrees)[runs - 1], readTreesFirst: rows[0].result.readTrees,
      get_ms: stats(rows.map((r) => r.result.get_ms)), commit_ms: stats(rows.map((r) => r.result.commit_ms)),
      tree_call_p50: stats(rows.map((r) => r.result.tree_call_p50).filter((x) => x !== null)), diff_ms: stats(rows.map((r) => r.result.diff_ms)), roundTrip: stats(rows.map((r) => r.ms)) };
  }
}

if (phases.includes("difflimit")) {
  // Large diff with a cap on readTree calls in flight.
  result.diffLimit = {};
  for (const limit of [1, 2, 4, 6, 8, 16, "Infinity"]) {
    const rows = [];
    for (let i = 0; i < runs; i++) rows.push((await call("GET", `diff?from=${repo.base}&to=${repo.large}&cached=0&limit=${limit}`)).result);
    result.diffLimit[limit] = { diff_ms: stats(rows.map((r) => r.diff_ms)), tree_call_p50: stats(rows.map((r) => r.tree_call_p50)) };
    process.stderr.write(`\r difflimit ${limit}   `);
  }
  process.stderr.write("\n");
}

if (phases.includes("bench")) {
  // Each op runs as `runs` separate requests, each doing `inner` iterations.
  // perOpInDO: the DO's own timer / inner (valid in local workerd only; deployed
  // timers do not advance during CPU work). perOpWall: (Worker-measured wall
  // time around the DO call - median no-op call) / inner, valid in both places.
  if (!phases.includes("acts")) throw new Error("bench re-evaluates recorded inputs; run it with the acts phase");
  const outputs = {}; // rule -> set of canonical outputs seen across guard modes, plus the recorded one
  const series = async (body, inner) => {
    const inDO = [], wall = [];
    for (let i = 0; i < runs; i++) {
      const r = await call("POST", "bench", { ...body, n: 1, inner });
      wall.push(r.worker_ms);
      const t = r.result.times ?? Object.values(r.result.rules ?? {})[0]?.times;
      if (t) inDO.push(t[0]);
      if (i === 0) series.last = r.result;
      for (const [id, x] of Object.entries(r.result.rules ?? {})) (outputs[id] ??= new Set([x.recorded])).add(x.output);
    }
    return { inDO, wall };
  };
  const noop = (await series({ op: "noop" }, 1)).wall;
  const base0 = stats(noop).p50;
  const perOp = ({ inDO, wall }, inner) => ({ inner, perOpInDO: stats(inDO), perOpWall: stats(wall.map((w) => Math.max(0, w - base0) / inner)) });
  const env = await sign(author, "claim", { goal: "bench", scope: ["bench/**"] });
  const vInner = Number(opt("verify-inner", 200));
  result.bench = { noopCall: stats(noop), verify: perOp(await series({ op: "verify", envelope: env }, vInner), vInner) };
  const cInner = Number(opt("compile-inner", 20));
  result.bench.compileAllRules = perOp(await series({ op: "compile" }, cInner), cInner);
  const rInner = Number(opt("rule-inner", 100));
  result.bench.rules = {};
  for (const rule of policy.rules) {
    const g = await series({ op: "rules", rule: rule.id, guard: true }, rInner);
    const meta = series.last.rules[rule.id];
    if (!meta) continue;
    const me = await series({ op: "rules", rule: rule.id, guard: "memo" }, rInner);
    const st = await series({ op: "rules", rule: rule.id, guard: "steps" }, rInner);
    const u = await series({ op: "rules", rule: rule.id, guard: false }, rInner);
    result.bench.rules[rule.id] = { kind: rule.kind, steps: meta.steps, inputBytes: meta.inputBytes, guarded: perOp(g, rInner), memo: perOp(me, rInner), stepsOnly: perOp(st, rInner), unguarded: perOp(u, rInner) };
    process.stderr.write(`\r bench rule ${rule.id}            `);
  }
  process.stderr.write("\n");
  result.bench.outputsAgreeAcrossModes = Object.values(outputs).every((set) => set.size === 1);
  const patho = [];
  for (const size of (opt("patho-sizes", "25,50,100")).split(",").map(Number)) {
    for (const mode of [{ guard: true }, { guard: "memo" }, { guard: "steps" }, { guard: false }, { guard: false, timeoutMs: 100 }]) {
      let r;
      try { r = await call("POST", "bench", { op: "patho", size, ...mode }); } catch (e) { patho.push({ size, ...mode, failed: String(e.message).slice(0, 300) }); continue; }
      patho.push({ size, ...mode, workerMs: r.worker_ms, inDO: Math.round(r.result.ms), steps: r.result.steps, error: r.result.error ?? null });
      process.stderr.write(`\r patho ${size} ${JSON.stringify(mode)}            `);
    }
  }
  // Memory: a rule that doubles a string 24 times (16 B -> 256 MiB) in 26 steps.
  const blowup = `($a0 := "0123456789abcdef"; ${Array.from({ length: 24 }, (_, i) => `$a${i + 1} := $a${i} & $a${i};`).join(" ")} $contains($a24, "z"))`;
  for (const mode of [{ guard: true }, { guard: "memo" }, { guard: "steps" }]) {
    let r;
    try { r = await call("POST", "bench", { op: "patho", expr: blowup, size: 1, ...mode }); } catch (e) { patho.push({ rule: "string-doubling", ...mode, failed: String(e.message).slice(0, 300) }); continue; }
    patho.push({ rule: "string-doubling", ...mode, workerMs: r.worker_ms, value: r.result.value ?? null, steps: r.result.steps, error: r.result.error ?? null });
  }
  process.stderr.write("\n");
  result.bench.patho = patho;
}

result.resets = resets;
result.finished = new Date().toISOString();
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ out, checks: result.checks, acts: result.acts?.roundTrip, diff: result.diff && Object.fromEntries(Object.entries(result.diff).map(([k, v]) => [k, { paths: v.paths, readTrees: v.readTrees, diff_ms: v.diff_ms, rt: v.roundTrip }])) }, null, 1));
