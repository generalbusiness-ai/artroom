// RoomSpike: one Durable Object per repository. Verifies a signed act,
// evaluates the policy's rules with recorded inputs, appends to SQLite and
// answers with the record or a Refusal. Spike only: four acts (claim,
// propose, review, land), no checks, no merges, no auth on setup.
import { DurableObject } from "cloudflare:workers";
import { b64urlDecode, canonical, sha256hex } from "./canonical";
import { compile, evaluate, ProfileError } from "./profile";

// The shape each rule kind must return. Anything else is a deterministic
// rule failure, and the act is refused: a failing rule never weakens policy.
const shapes: Record<RuleKind, (v: any) => boolean> = {
  refuse: (v) => typeof v === "boolean",
  survive: (v) => typeof v === "boolean",
  require: (v) => v === null || (Array.isArray(v) ? v.every((o) => o && typeof o === "object" && !Array.isArray(o)) : typeof v === "object"),
  land: (v) => !!v && typeof v === "object" && !Array.isArray(v) && typeof v.ok === "boolean",
  notify: (v) => v === null || (Array.isArray(v) && v.every((a) => typeof a === "string" || (Array.isArray(a) && a.every((b) => typeof b === "string")))),
};

/**
 * Evaluate one rule on one input. Returns the recorded output: the value, or
 * {error, message} for a deterministic failure (a ProfileError, or a value of
 * the wrong shape for the rule's kind). An EngineFault or any other error is
 * thrown, never recorded.
 */
export async function outcome(rule: Rule, input: unknown): Promise<{ output: unknown; failed: string | null; steps: number }> {
  try {
    const r = await evaluate(rule.expr, input);
    if (shapes[rule.kind](r.value)) return { output: r.value, failed: null, steps: r.steps };
    return { output: { error: "rule_output", message: `A ${rule.kind} rule returned ${canonical(r.value ?? null).slice(0, 200)}` }, failed: "rule_output", steps: r.steps };
  } catch (e) {
    if (!(e instanceof ProfileError)) throw e;
    return { output: { error: e.code, message: e.message }, failed: e.code, steps: 0 };
  }
}

/** A rule failed deterministically on its input; the act is refused with this rule. */
class RuleFailed extends Error {
  constructor(public rule: Rule, public code: string) {
    super(`Rule ${rule.id} failed: ${code}`);
  }
}
import { changedPaths } from "./treediff";
import defaultPolicy from "./policy.json";

export type Kind = "claim" | "propose" | "review" | "land";
export type RuleKind = "refuse" | "require" | "survive" | "land" | "notify";
export interface Act { kind: Kind; actor: string; body: any; nonce: string }
export interface Envelope { act: Act; sig: string }
export interface Rule { id: string; kind: RuleKind; on: Kind[]; expr: string; fix?: string }
export interface Policy { version: number; roles: Record<string, string[]>; rules: Rule[] }
export interface Refusal { refused: true; rule: string; reason: string; fix: string }
export interface Timings { verify: number; diff: number; rules: Partial<Record<RuleKind, number>>; sql: number; total: number; evaluations: number; steps: number }

const now = () => performance.now();
const round = (x: number) => Math.round(x * 1000) / 1000;

export class RoomSpike extends DurableObject<Env> {
  sql: SqlStorage;
  queue: Promise<unknown> = Promise.resolve();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS policies (digest TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS acts (seq INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, actor TEXT, nonce TEXT,
        digest TEXT UNIQUE, envelope TEXT, record TEXT, policy TEXT, at INTEGER, UNIQUE(actor, nonce));
      CREATE TABLE IF NOT EXISTS claims (id INTEGER PRIMARY KEY, actor TEXT, goal TEXT, scope TEXT, live INTEGER);
      CREATE TABLE IF NOT EXISTS proposals (id INTEGER PRIMARY KEY, claim INTEGER, actor TEXT, base TEXT, head TEXT,
        changed TEXT, obligations TEXT, live INTEGER, landed INTEGER);
      CREATE TABLE IF NOT EXISTS reviews (id INTEGER PRIMARY KEY AUTOINCREMENT, act INTEGER, proposal INTEGER, actor TEXT,
        verdict TEXT, scope TEXT, fresh INTEGER, why TEXT);
      CREATE TABLE IF NOT EXISTS evaluations (id INTEGER PRIMARY KEY AUTOINCREMENT, act_digest TEXT, seq INTEGER, policy TEXT,
        rule TEXT, kind TEXT, input TEXT, output TEXT, steps INTEGER, ms REAL);
      CREATE TABLE IF NOT EXISTS refusals (id INTEGER PRIMARY KEY AUTOINCREMENT, act_digest TEXT, rule TEXT, reason TEXT, at INTEGER);
      CREATE TABLE IF NOT EXISTS attention (actor TEXT, seq INTEGER, rule TEXT);
    `);
  }

  // ------------------------------------------------------------ policy
  async setup(policy: Policy | null): Promise<{ policy: string }> {
    const p = policy ?? (defaultPolicy as Policy);
    for (const r of p.rules) compile(r.expr); // admission check before adoption
    const body = canonical(p);
    const digest = await sha256hex(body);
    this.sql.exec("INSERT OR IGNORE INTO policies (digest, body) VALUES (?, ?)", digest, body);
    this.sql.exec("INSERT OR REPLACE INTO meta (key, value) VALUES ('policy', ?)", digest);
    return { policy: digest };
  }

  policy(): { digest: string; policy: Policy } {
    const row = this.sql.exec("SELECT p.digest, p.body FROM meta m JOIN policies p ON p.digest = m.value WHERE m.key = 'policy'").toArray()[0];
    if (!row) throw new Error("room has no policy; POST /setup first");
    return { digest: row.digest as string, policy: JSON.parse(row.body as string) };
  }

  // ------------------------------------------------------------ verify
  async verify(env: Envelope): Promise<boolean> {
    const key = await crypto.subtle.importKey("raw", b64urlDecode(env.act.actor), { name: "Ed25519" }, false, ["verify"]);
    return crypto.subtle.verify("Ed25519", key, b64urlDecode(env.sig), new TextEncoder().encode(canonical(env.act)));
  }

  // ------------------------------------------------------------ acts
  act(env: Envelope): Promise<unknown> {
    const run = this.queue.then(() => this.actNow(env));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async actNow(env: Envelope) {
    const t0 = now();
    const tm: Timings = { verify: 0, diff: 0, rules: {}, sql: 0, total: 0, evaluations: 0, steps: 0 };
    const finish = <T extends object>(x: T) => ({ ...x, timings: { ...tm, total: round(now() - t0) } });

    let t = now();
    const ok = await this.verify(env).catch(() => false);
    tm.verify = round(now() - t);
    if (!ok) return finish(refusal("signature", "The signature does not verify for this actor key.", "Sign the canonical JSON of the act with the actor's Ed25519 key."));
    const { act } = env;
    const digest = await sha256hex(canonical(env));
    const seen = this.sql.exec("SELECT seq, record FROM acts WHERE actor = ? AND nonce = ?", act.actor, act.nonce).toArray()[0];
    if (seen) return finish({ replayed: true, ...JSON.parse(seen.record as string) });

    const { digest: policyDigest, policy } = this.policy();
    const evals: { rule: string; kind: RuleKind; input: string; output: string; steps: number; ms: number }[] = [];
    // Evaluate one rule and record its input and output. A ProfileError or a
    // wrong output shape is recorded and throws RuleFailed (the act is then
    // refused). An EngineFault or any other error propagates: nothing is
    // written, and the caller may retry.
    const run = async (rule: Rule, input: object): Promise<any> => {
      const s = now();
      const { output, failed, steps } = await outcome(rule, input);
      const ms = now() - s;
      tm.rules[rule.kind] = round((tm.rules[rule.kind] ?? 0) + ms);
      tm.evaluations++;
      tm.steps += steps;
      evals.push({ rule: rule.id, kind: rule.kind, input: canonical(input), output: canonical(output ?? null), steps, ms });
      if (failed) throw new RuleFailed(rule, failed);
      return output;
    };
    const rules = (kind: RuleKind) => policy.rules.filter((r) => r.kind === kind && r.on.includes(act.kind));
    const refuse = async (input: object): Promise<Refusal | null> => {
      for (const rule of rules("refuse")) {
        if ((await run(rule, input)) === true) return refusal(rule.id, `Rule ${rule.id} refused this act.`, rule.fix ?? "");
      }
      return null;
    };
    const recordRefusal = (r: Refusal) => {
      const s = now();
      this.sql.exec("INSERT INTO refusals (act_digest, rule, reason, at) VALUES (?, ?, ?, ?)", digest, r.rule, r.reason, Date.now());
      this.saveEvals(evals, digest, null, policyDigest);
      tm.sql += now() - s;
      return finish(r);
    };
    const diff = async (from: string, to: string) => {
      const repo = await this.env.ARTIFACTS.get(this.env.REPO);
      try {
        return await changedPaths(repo, from, to);
      } finally {
        repo[Symbol.dispose]?.();
      }
    };

    // Everything from here to the append runs inside one try: a RuleFailed
    // anywhere (refuse, require, survive, land, notify) refuses the act.
    try {
    let record: any;
    let derive: (seq: number) => void;
    let notifyInput: any;

    if (act.kind === "claim") {
      const live = this.sql.exec("SELECT id, actor, scope FROM claims WHERE live = 1").toArray().map((c) => ({ id: c.id, actor: c.actor, scope: JSON.parse(c.scope as string) }));
      const input = { act, live_claims: live };
      const r = await refuse(input);
      if (r) return recordRefusal(r);
      const overlaps = live.filter((c) => c.scope.some((s: string) => act.body.scope.includes(s))).map((c) => c.id);
      record = { kind: "claim", goal: act.body.goal, scope: act.body.scope, overlaps };
      derive = (seq) => this.sql.exec("INSERT INTO claims (id, actor, goal, scope, live) VALUES (?, ?, ?, ?, 1)", seq, act.actor, act.body.goal, JSON.stringify(act.body.scope));
      notifyInput = { act, record };
    } else if (act.kind === "propose") {
      const c = this.sql.exec("SELECT * FROM claims WHERE id = ?", act.body.claim).toArray()[0];
      const claim = c ? { id: c.id, actor: c.actor, scope: JSON.parse(c.scope as string), live: c.live === 1 } : undefined;
      const prev = this.sql.exec("SELECT * FROM proposals WHERE claim = ? AND live = 1", act.body.claim).toArray()[0];
      const ds = now();
      const [d, since] = await Promise.all([diff(act.body.base, act.body.head), prev && prev.head !== act.body.head ? diff(prev.head as string, act.body.head) : null]);
      tm.diff = round(now() - ds);
      const changed = d.paths;
      const r = await refuse({ act, claim, changed });
      if (r) return recordRefusal(r);
      const obligations: any[] = [];
      for (const rule of rules("require")) {
        const out = await run(rule, { act, claim, changed });
        if (Array.isArray(out)) obligations.push(...out);
        else if (out) obligations.push(out);
      }
      // Survive: carry each fresh review of the previous head if the rule holds.
      const carried: { review: any; fresh: boolean; rule: string }[] = [];
      if (prev) {
        const reviews = this.sql.exec("SELECT * FROM reviews WHERE proposal = ? AND fresh = 1", prev.id).toArray();
        for (const rv of reviews) {
          const review = { actor: rv.actor, verdict: rv.verdict, scope: JSON.parse(rv.scope as string) };
          let fresh = true;
          for (const rule of rules("survive")) {
            const out = since ? await run(rule, { review, changed_since: since.paths }) : true;
            if (out !== true) fresh = false;
          }
          carried.push({ review: { act: rv.act, ...review }, fresh, rule: "survive" });
        }
      }
      record = { kind: "propose", claim: act.body.claim, base: act.body.base, head: act.body.head, changed, obligations,
        supersedes: prev?.id ?? null, carried: carried.map((x) => ({ review: x.review.act, fresh: x.fresh })), readTrees: d.readTrees + (since?.readTrees ?? 0) };
      derive = (seq) => {
        if (prev) this.sql.exec("UPDATE proposals SET live = 0 WHERE id = ?", prev.id);
        this.sql.exec("INSERT INTO proposals (id, claim, actor, base, head, changed, obligations, live, landed) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0)",
          seq, act.body.claim, act.actor, act.body.base, act.body.head, JSON.stringify(changed), JSON.stringify(obligations));
        for (const x of carried)
          this.sql.exec("INSERT INTO reviews (act, proposal, actor, verdict, scope, fresh, why) VALUES (?, ?, ?, ?, ?, ?, ?)",
            x.review.act, seq, x.review.actor, x.review.verdict, JSON.stringify(x.review.scope), x.fresh ? 1 : 0, x.fresh ? "survived" : "stale: reviewed paths changed");
      };
      notifyInput = { act, record, obligations, roles: policy.roles };
    } else if (act.kind === "review") {
      const p = this.sql.exec("SELECT * FROM proposals WHERE id = ? AND live = 1", act.body.proposal).toArray()[0];
      const proposal = p ? { id: p.id, actor: p.actor, head: p.head } : undefined;
      const r = await refuse({ act, proposal });
      if (r) return recordRefusal(r);
      record = { kind: "review", proposal: act.body.proposal, head: p!.head, verdict: act.body.verdict, scope: act.body.scope };
      derive = (seq) => this.sql.exec("INSERT INTO reviews (act, proposal, actor, verdict, scope, fresh, why) VALUES (?, ?, ?, ?, ?, 1, 'new')",
        seq, act.body.proposal, act.actor, act.body.verdict, JSON.stringify(act.body.scope));
      notifyInput = { act, record, proposal };
    } else if (act.kind === "land") {
      const p = this.sql.exec("SELECT * FROM proposals WHERE id = ? AND live = 1", act.body.proposal).toArray()[0];
      const proposal = p ? { id: p.id, claim: p.claim, actor: p.actor, head: p.head, landed: p.landed === 1, obligations: JSON.parse(p.obligations as string) } : undefined;
      const r = await refuse({ act, proposal });
      if (r) return recordRefusal(r);
      const reviews = this.sql.exec("SELECT actor, verdict, scope, fresh FROM reviews WHERE proposal = ?", p!.id).toArray()
        .map((x) => ({ actor: x.actor, verdict: x.verdict, scope: JSON.parse(x.scope as string), fresh: x.fresh === 1 }));
      let lane: string | null = null;
      for (const rule of rules("land")) {
        const out = await run(rule, { act, proposal, reviews, roles: policy.roles });
        if (out.ok !== true) return recordRefusal(refusal(rule.id, `Unmet: ${JSON.stringify(out.unmet ?? [])}`, rule.fix ?? ""));
        lane = out.lane ?? lane;
      }
      record = { kind: "land", proposal: p!.id, commit: p!.head, lane };
      derive = () => {
        this.sql.exec("UPDATE proposals SET landed = 1, live = 0 WHERE id = ?", p!.id);
        this.sql.exec("UPDATE claims SET live = 0 WHERE id = ?", p!.claim);
      };
      notifyInput = { act, record, proposal };
    } else {
      return finish(refusal("unknown-kind", `Unknown act kind ${(act as any).kind}.`, "Use claim, propose, review or land."));
    }

    // Append, derive, then notify. One synchronous transaction; the output gate
    // holds the answer until SQLite has committed it.
    const s = now();
    let seq = 0;
    const notified: string[] = [];
    const notifyRules = rules("notify");
    const notifyOut: { rule: string; actors: string[] }[] = [];
    for (const rule of notifyRules) {
      const out = await run(rule, { ...notifyInput, roles: policy.roles });
      if (out) notifyOut.push({ rule: rule.id, actors: out.flat() });
    }
    this.ctx.storage.transactionSync(() => {
      seq = this.sql.exec("INSERT INTO acts (kind, actor, nonce, digest, envelope, record, policy, at) VALUES (?, ?, ?, ?, ?, '{}', ?, ?) RETURNING seq",
        act.kind, act.actor, act.nonce, digest, canonical(env), policyDigest, Date.now()).one().seq as number;
      record = { seq, id: seq, actor: act.actor, digest, policy: policyDigest, ...record };
      this.sql.exec("UPDATE acts SET record = ? WHERE seq = ?", JSON.stringify(record), seq);
      derive(seq);
      for (const n of notifyOut) for (const a of n.actors) { this.sql.exec("INSERT INTO attention (actor, seq, rule) VALUES (?, ?, ?)", a, seq, n.rule); notified.push(a); }
      this.saveEvals(evals, digest, seq, policyDigest);
    });
    tm.sql = round(now() - s);
    return finish({ ...record, notified });
    } catch (e) {
      if (e instanceof RuleFailed) return recordRefusal(refusal(e.rule.id, e.message, "Fix this rule in the policy: it fails on this input."));
      throw e;
    }
  }

  private saveEvals(evals: { rule: string; kind: string; input: string; output: string; steps: number; ms: number }[], digest: string, seq: number | null, policy: string) {
    for (const e of evals)
      this.sql.exec("INSERT INTO evaluations (act_digest, seq, policy, rule, kind, input, output, steps, ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        digest, seq, policy, e.rule, e.kind, e.input, e.output, e.steps, e.ms);
  }

  // ------------------------------------------------------------ reads
  /** Replay every recorded evaluation of an act and compare outputs. */
  async explain(seq: number) {
    return this.replay(this.sql.exec("SELECT e.rule, e.kind, e.input, e.output, p.body FROM evaluations e JOIN policies p ON p.digest = e.policy WHERE e.seq = ?", seq).toArray(), { seq });
  }

  /** Replay the recorded evaluations of a refused act, by act digest. */
  async explainRefusal(digest: string) {
    return this.replay(this.sql.exec("SELECT e.rule, e.kind, e.input, e.output, p.body FROM evaluations e JOIN policies p ON p.digest = e.policy WHERE e.seq IS NULL AND e.act_digest = ?", digest).toArray(), { digest });
  }

  private async replay(rows: Record<string, SqlStorageValue>[], key: object) {
    const out = [];
    for (const r of rows) {
      const rule = (JSON.parse(r.body as string) as Policy).rules.find((x) => x.id === r.rule)!;
      let again: unknown;
      again = (await outcome(rule, JSON.parse(r.input as string))).output; // an EngineFault propagates
      out.push({ rule: r.rule, kind: r.kind, output: JSON.parse(r.output as string), same: canonical(again ?? null) === r.output });
    }
    return { ...key, evaluations: out, deterministic: out.every((x) => x.same) };
  }

  async diff(from: string, to: string, cached: boolean, limit = Infinity) {
    const t0 = now();
    const repo = await this.env.ARTIFACTS.get(this.env.REPO);
    const t1 = now();
    try {
      const r = await changedPaths(repo, from, to, cached ? (this.treeCache ??= new Map()) : undefined, limit);
      const calls = [...r.treeCallMs].sort((x, y) => x - y);
      return { count: r.paths.length, paths: r.paths, readTrees: r.readTrees, commit_ms: round(r.commitMs), tree_call_p50: calls.length ? round(calls[calls.length >> 1]) : null, tree_call_max: calls.length ? round(calls[calls.length - 1]) : null, get_ms: round(t1 - t0), diff_ms: round(now() - t1), total_ms: round(now() - t0) };
    } finally {
      repo[Symbol.dispose]?.();
    }
  }
  treeCache?: Map<string, ArtifactsTreeEntry[]>;

  // ------------------------------------------------------------ benchmarks
  /** CPU micro-benchmarks. Timers only advance in local workerd; deployed, read cpuTime from the trace. */
  // Each of the n samples times a batch of `inner` iterations, because local
  // workerd timers have 1 ms resolution.
  async bench(req: { op: string; rule?: string; n?: number; inner?: number; envelope?: Envelope; size?: number; guard?: boolean | "steps" | "memo"; timeoutMs?: number; expr?: string }) {
    const n = req.n ?? 50;
    const inner = req.inner ?? 20;
    const times: number[] = [];
    if (req.op === "noop") return { op: "noop" };
    if (req.op === "verify") {
      let ok = 0;
      for (let i = 0; i < n; i++) { const s = now(); for (let j = 0; j < inner; j++) if (await this.verify(req.envelope!)) ok++; times.push((now() - s) / inner); }
      return { op: "verify", n, inner, ok, times };
    }
    if (req.op === "rules") {
      // Re-evaluate the most recent recorded input of every rule.
      const rows = this.sql.exec("SELECT e.rule, e.kind, e.input, e.output, p.body FROM evaluations e JOIN policies p ON p.digest = e.policy WHERE e.id IN (SELECT MAX(id) FROM evaluations GROUP BY rule)").toArray();
      const result: Record<string, { kind: string; steps: number; times: number[]; inputBytes: number; output: string; recorded: string }> = {};
      for (const r of rows) {
        if (req.rule && r.rule !== req.rule) continue;
        const rule = (JSON.parse(r.body as string) as Policy).rules.find((x) => x.id === r.rule)!;
        const input = JSON.parse(r.input as string);
        const ts: number[] = [];
        let steps = 0;
        let value: unknown;
        for (let i = 0; i < n; i++) { const s = now(); for (let j = 0; j < inner; j++) ({ steps, value } = await evaluate(rule.expr, input, { guard: req.guard ?? true })); ts.push((now() - s) / inner); }
        result[r.rule as string] = { kind: r.kind as string, steps, times: ts, inputBytes: (r.input as string).length, output: canonical(value ?? null), recorded: r.output as string };
      }
      return { op: "rules", n, inner, guard: req.guard ?? true, rules: result };
    }
    if (req.op === "compile") {
      const { policy } = this.policy();
      for (let i = 0; i < n; i++) { const s = now(); for (let j = 0; j < inner; j++) for (const r of policy.rules) compile(r.expr); times.push((now() - s) / inner); }
      return { op: "compile", n, inner, rules: policy.rules.length, times };
    }
    if (req.op === "patho") {
      // A rule the profile admits whose cost is cubic in the input size.
      const expr = req.expr ?? "$count(changed[$count($$.changed[$count($$.changed[$ = $$.changed[0]]) > 0]) > 0])";
      const changed = Array.from({ length: req.size ?? 100 }, (_, i) => `src/dir${i % 10}/file${i}.ts`);
      const s = now();
      try {
        const r = await evaluate(expr, { changed }, { guard: req.guard ?? true, timeoutMs: req.timeoutMs ?? 0 });
        return { op: "patho", size: changed.length, guard: req.guard ?? true, timeoutMs: req.timeoutMs ?? 0, value: typeof r.value === "string" ? `string of ${r.value.length}` : r.value, steps: r.steps, ms: now() - s };
      } catch (e: any) {
        return { op: "patho", size: changed.length, guard: req.guard ?? true, timeoutMs: req.timeoutMs ?? 0, error: e.code ?? String(e), message: e.message, ms: now() - s };
      }
    }
    throw new Error(`unknown bench op ${req.op}`);
  }

  async log(since: number): Promise<string> {
    return `[${this.sql.exec("SELECT record FROM acts WHERE seq > ? ORDER BY seq LIMIT 500", since).toArray().map((r) => r.record).join(",")}]`;
  }
}

function refusal(rule: string, reason: string, fix: string): Refusal {
  return { refused: true, rule, reason, fix };
}
