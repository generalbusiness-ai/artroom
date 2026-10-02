/**
 * Check jobs (R-EXEC-8 to R-EXEC-10, R-OBL-7, R-CARRY-15).
 *
 * The Room issues every job, and only over the checker's service binding.
 * A job is owed when a check obligation, advisory or not, is open on a
 * landing operation's integration, and the deployment binds a service for its
 * checker. Previews get no jobs yet: a scoped checker's snapshot is recorded
 * only for a landing's integration. The alarm's `jobs` step issues owed jobs.
 * Each runs in the background; a job with no answer by its deadline is issued
 * again while it is still needed.
 *
 * - A whole-tree job reads the canonical repository, with a read token
 *   minted for it that expires at the job's deadline. The token is revoked
 *   when the service answers.
 * - A filtered job reads only its own snapshot repository (R-CARRY-16). No
 *   deployment has those yet, so no filtered job is owed (fail closed). When
 *   one is given, the publisher writes the snapshot into its own repository,
 *   and the job is issued only if the commit it wrote is the one the Room
 *   recorded (R-CARRY-15 step 4); otherwise nothing is issued and it is tried
 *   again later.
 */

import type { CheckInput, CheckJob, Digest, Glob, LaneId, OpId, Sha } from "@generalbusiness/artroom-contract";
import { isRefusal } from "@generalbusiness/artroom-contract";
import { checkerInputs } from "@generalbusiness/artroom-policy";
import type { ActivePolicyFull, RoomCore } from "./core.ts";
import { hex, randomBytes } from "./crypto.ts";
import { iso } from "./ids.ts";
import { generationRow, laneRow } from "./model.ts";
import { obligationsFor } from "./obligations.ts";
import { num, one, str } from "./store.ts";

/** Time a job has beyond the checker's own timeout, to start a runner, fetch, sign and submit. */
export const JOB_MARGIN_S = 300;

interface JobRow {
  readonly id: `job_${string}`;
  readonly lane: LaneId;
  readonly generation: number;
  readonly obligation: `obl_${string}`;
  readonly checker: string;
  readonly config: Digest;
  readonly integration: Sha;
  readonly base: Sha;
  readonly op: OpId;
  readonly attempts: number;
}

/**
 * Owe a job for each check obligation open on a landing's integration whose
 * checker has a service binding: one per operation, integration, obligation
 * and configuration.
 */
export function oweJobs(core: RoomCore, lane: LaneId, generation: number, integration: Sha, base: Sha, op: OpId, policy: ActivePolicyFull): void {
  let owed = false;
  for (const o of obligationsFor(core.sql, lane, generation, { doc: policy.doc, checkers: policy.checkers, integration })) {
    if (o.kind !== "check" || o.state === "met") continue;
    const cfg = policy.checkers[o.check];
    if (!cfg || !core.checkers(o.check)) continue;
    // R-CARRY-16: without snapshot repositories, a scoped checker gets no job.
    if (checkerInputs(cfg.config.inputs, policy.doc.carry) && !core.snapshots) continue;
    core.sql.all(
      "INSERT INTO check_jobs (id, lane, generation, obligation, checker, config, integration, base, op, state, attempts, next_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'owed', 0, ?) ON CONFLICT (op, integration, obligation, config) DO NOTHING",
      `job_${hex(randomBytes(12))}`,
      lane,
      generation,
      o.id,
      o.check,
      cfg.digest,
      integration,
      base,
      op,
      core.now(),
    );
    owed = true;
  }
  if (owed) core.run("jobs");
}

/** Issue every job that is due. A failure to prepare one leaves it owed, with backoff. */
export async function issueJobs(core: RoomCore): Promise<void> {
  if (!core.founded || !(await core.isBound())) return;
  for (const r of core.sql.all("SELECT * FROM check_jobs WHERE state IN ('owed', 'sent') AND next_ms <= ? ORDER BY rowid", core.now())) {
    const j: JobRow = {
      id: str(r, "id") as JobRow["id"],
      lane: str(r, "lane") as LaneId,
      generation: num(r, "generation")!,
      obligation: str(r, "obligation") as JobRow["obligation"],
      checker: str(r, "checker")!,
      config: str(r, "config") as Digest,
      integration: str(r, "integration") as Sha,
      base: str(r, "base") as Sha,
      op: str(r, "op") as OpId,
      attempts: num(r, "attempts") ?? 0,
    };
    if (core.running(`job:${j.id}`)) continue;
    await issue(core, j).catch(() => later(core, j));
  }
}

function done(core: RoomCore, j: JobRow, outcome: string): void {
  core.sql.all("UPDATE check_jobs SET state = 'done', outcome = ? WHERE id = ?", outcome, j.id);
}

/** Try again later, with backoff: 5 seconds, doubling, at most 5 minutes. */
function later(core: RoomCore, j: JobRow): void {
  core.sql.all("UPDATE check_jobs SET state = 'owed', attempts = ?, next_ms = ? WHERE id = ?", j.attempts + 1, core.now() + Math.min(5_000 * 2 ** j.attempts, 300_000), j.id);
}

async function issue(core: RoomCore, j: JobRow): Promise<void> {
  const policy = core.activePolicy();
  const cfg = policy.checkers[j.checker];
  const lane = laneRow(core.sql, j.lane);
  const gen = generationRow(core.sql, j.lane, j.generation);
  // Still needed: the landing is active on this integration, under the same configuration, and the obligation is still open.
  const landing = core.landing.activeViews().find((o) => o.id === j.op);
  if (!landing || !("integration" in landing) || landing.integration !== j.integration) return done(core, j, "not-needed");
  if (!cfg || cfg.digest !== j.config || !lane || !gen || lane.generation !== j.generation) return done(core, j, "not-needed");
  const status = obligationsFor(core.sql, j.lane, j.generation, { doc: policy.doc, checkers: policy.checkers, integration: j.integration }).find((o) => o.id === j.obligation);
  if (!status || status.state === "met") return done(core, j, "not-needed");
  const service = core.checkers(j.checker);
  if (!service) return done(core, j, "unbound");
  const ttl = cfg.config.timeoutSeconds + JOB_MARGIN_S;
  let target: { integration: Sha; input: CheckInput; readUrl: `https://${string}`; token: string; expiresAt: number; revoke?: () => Promise<unknown> };
  const inputs = checkerInputs(cfg.config.inputs, policy.doc.carry);
  if (inputs) {
    if (!core.snapshots) return done(core, j, "unbound");
    const rec = one(core.sql, "SELECT * FROM check_snapshots WHERE integration = ? AND checker = ? AND config = ?", j.integration, j.checker, j.config);
    if (!rec) return later(core, j);
    const commit = str(rec, "commit_sha") as Sha;
    const digest = str(rec, "digest") as Digest;
    const paths = JSON.parse(str(rec, "paths")!) as Glob[];
    const wrote = await core.snapshots.prepare({ commit, integration: j.integration, checker: j.checker, digest, paths });
    // R-CARRY-15 step 4: the publisher must have written exactly the commit the Room recorded.
    if (wrote.commit !== commit) return later(core, j);
    const t = await core.snapshots.mint(commit, j.id, core.now() + ttl * 1000);
    target = { integration: commit, input: { kind: "filtered", snapshot: digest, paths }, readUrl: wrote.remote, token: t.token, expiresAt: t.expiresAt };
  } else {
    const tree = await core.ports.artifacts.treeOf(j.integration);
    if (!tree) return later(core, j);
    const readUrl = (await core.canonicalRemoteReady()) as `https://${string}`;
    const repo = await core.remotes.artifacts.get(core.location().name);
    const t = await repo.createToken("read", ttl);
    target = { integration: j.integration, input: { kind: "tree", tree }, readUrl, token: t.plaintext, expiresAt: Date.parse(t.expiresAt), revoke: () => repo.revokeToken(t.id) };
  }
  const job: CheckJob = {
    id: j.id,
    room: core.roomId,
    lane: j.lane,
    generation: j.generation,
    head: gen.head,
    obligation: j.obligation,
    check: j.checker,
    integration: target.integration,
    base: j.base,
    input: target.input,
    readUrl: target.readUrl,
    // R-EXEC-9: git's credential, exactly three variables.
    gitAuthEnv: { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "http.extraHeader", GIT_CONFIG_VALUE_0: `Authorization: Bearer ${target.token}` },
    config: cfg.digest,
    // R-EXEC-10: copied from the configuration whose digest is `config`.
    volatile: cfg.config.volatile,
    advisory: cfg.config.advisory === true,
    runner: cfg.config.runner ?? null,
    landOp: j.op,
    // The token expires no later than the job's deadline (R-EXEC-9).
    deadline: iso(target.expiresAt),
  };
  // Sent: with no answer by the deadline, the job is issued again while it is still needed.
  core.sql.all("UPDATE check_jobs SET state = 'sent', attempts = ?, next_ms = ? WHERE id = ?", j.attempts + 1, target.expiresAt, j.id);
  core.kick(`job:${j.id}`, async () => {
    try {
      const result = await service.handle(job);
      done(core, j, isRefusal(result) ? `refused: ${result.rule}` : result.id);
    } finally {
      await target.revoke?.().catch(() => undefined);
    }
  });
}
