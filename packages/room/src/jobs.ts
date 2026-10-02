/**
 * Check jobs (R-EXEC-8 to R-EXEC-10, R-OBL-7, R-CARRY-15).
 *
 * The Room issues every job, and only over the checker's service binding.
 * A job is owed when a check obligation, advisory or not, is open on an
 * integration the Room prepared: a clean preview's, or a landing
 * operation's. Its owner is that preview or operation. One row per owner,
 * integration, obligation and configuration is the job's whole state:
 *
 * - `owed`: due at `next_ms`.
 * - `sent`: attempt `attempt` is with the service until `next_ms`, its
 *   deadline. Then the attempt has expired: the Room stops waiting for its
 *   answer, revokes its token, and the job is due again. A restart loses
 *   nothing but the wait.
 * - `done`: answered, or no longer needed, with its outcome.
 *
 * Every change is made only for the attempt it read, so a late answer or a
 * concurrent step never overwrites a newer attempt. Each step leaves every
 * unfinished job due in the future, so the alarm never spins.
 *
 * Still needed means: the owner is current on this integration (the
 * preview's integration now, or the operation active on it), the generation
 * is the lane's latest, the configuration is unchanged and the obligation is
 * open. An advisory job of a landing that landed before it was sent is still
 * delivered: the landing did not wait for it, and its check is still shown
 * (R-OBL-7).
 *
 * A whole-tree job reads the canonical repository with a read token minted
 * for the attempt. A filtered job reads only its own snapshot repository
 * (R-CARRY-16); without snapshot repositories none is owed (fail closed).
 * With them, the job is issued only if the commit the publisher wrote is the
 * one the Room recorded (R-CARRY-15 step 4).
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
/** When a job could not be prepared (an outage, a snapshot not written as recorded), it is tried again this much later. */
export const JOB_RETRY_MS = 30_000;
/** When the room cannot issue jobs now (not bound to its repository), they wait this long. */
export const JOB_IDLE_MS = 300_000;

interface JobRow {
  readonly id: `job_${string}`;
  readonly owner: OpId;
  readonly lane: LaneId;
  readonly generation: number;
  readonly obligation: `obl_${string}`;
  readonly checker: string;
  readonly config: Digest;
  readonly integration: Sha;
  readonly base: Sha;
  readonly state: "owed" | "sent";
  readonly attempt: number;
  readonly token: string | null;
}

const isPreview = (owner: string) => owner.startsWith("op_preview_");

/** Each room's attempts being waited for, by job ID: calling one stops the wait. Memory only; the row is the state. */
const waits = new WeakMap<RoomCore, Map<string, () => void>>();
function waitsOf(core: RoomCore): Map<string, () => void> {
  let m = waits.get(core);
  if (!m) waits.set(core, (m = new Map()));
  return m;
}

/**
 * Owe a job for each check obligation open on an owner's integration whose
 * checker has a service binding. `base` is the main commit the integration
 * was built on: the landing's `expectedMain`, or the preview's base.
 */
export function oweJobs(core: RoomCore, owner: OpId, lane: LaneId, generation: number, integration: Sha, base: Sha, policy: ActivePolicyFull): void {
  let owed = false;
  for (const o of obligationsFor(core.sql, lane, generation, { doc: policy.doc, checkers: policy.checkers, integration })) {
    if (o.kind !== "check" || o.state === "met") continue;
    const cfg = policy.checkers[o.check];
    if (!cfg || !core.checkers(o.check)) continue;
    // R-CARRY-16: without snapshot repositories, a scoped checker gets no job.
    if (checkerInputs(cfg.config.inputs, policy.doc.carry) && !core.snapshots) continue;
    core.sql.all(
      "INSERT INTO check_jobs (id, owner, lane, generation, obligation, checker, config, integration, base, state, next_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'owed', ?) ON CONFLICT (owner, integration, obligation, config) DO NOTHING",
      `job_${hex(randomBytes(12))}`,
      owner,
      lane,
      generation,
      o.id,
      o.check,
      cfg.digest,
      integration,
      base,
      core.now(),
    );
    owed = true;
  }
  if (owed) core.run("jobs");
}

/** Change a job only if it is still at the attempt and state it was read in. True if it changed. */
function move(core: RoomCore, j: JobRow, set: string, ...values: (string | number | null)[]): boolean {
  return core.sql.all(`UPDATE check_jobs SET ${set} WHERE id = ? AND attempt = ? AND state = ? RETURNING id`, ...values, j.id, j.attempt, j.state).length > 0;
}

/** Issue every job that is due; an attempt past its deadline is due again. */
export async function issueJobs(core: RoomCore): Promise<void> {
  if (!core.founded) return;
  const now = core.now();
  // A room the registry does not bind issues nothing (R-PUB-10); its debt waits, never past due.
  if (!(await core.isBound())) {
    core.sql.all("UPDATE check_jobs SET next_ms = ? WHERE state != 'done' AND next_ms <= ?", now + JOB_IDLE_MS, now);
    return;
  }
  for (const r of core.sql.all("SELECT * FROM check_jobs WHERE state != 'done' AND next_ms <= ? ORDER BY rowid", now)) {
    const j: JobRow = {
      id: str(r, "id") as JobRow["id"],
      owner: str(r, "owner") as OpId,
      lane: str(r, "lane") as LaneId,
      generation: num(r, "generation")!,
      obligation: str(r, "obligation") as JobRow["obligation"],
      checker: str(r, "checker")!,
      config: str(r, "config") as Digest,
      integration: str(r, "integration") as Sha,
      base: str(r, "base") as Sha,
      state: str(r, "state") as JobRow["state"],
      attempt: num(r, "attempt") ?? 0,
      token: str(r, "token"),
    };
    // An expired attempt: stop waiting for it, and revoke its token (it expired at the deadline in any case).
    if (j.state === "sent") {
      waitsOf(core).get(`${j.id}_${j.attempt}`)?.();
      if (j.token) await revokeCanonical(core, j.token).catch(() => undefined);
    }
    await issue(core, j).catch(() => move(core, j, "next_ms = ?", core.now() + JOB_RETRY_MS));
  }
}

async function revokeCanonical(core: RoomCore, tokenId: string): Promise<unknown> {
  const repo = await core.remotes.artifacts.get(core.location().name);
  return repo.revokeToken(tokenId);
}

/** The owner's hold on this integration now, or null: the land operation a check names, if any. */
function ownerNow(core: RoomCore, j: JobRow, advisory: boolean): { readonly landOp?: OpId } | null {
  if (isPreview(j.owner)) {
    const row = one(core.sql, "SELECT generation, body FROM previews WHERE id = ?", j.owner);
    const body = row ? (JSON.parse(str(row, "body")!) as { state?: string; integration?: string }) : null;
    return body?.state === "clean" && body.integration === j.integration && num(row, "generation") === j.generation ? {} : null;
  }
  const op = core.landing.view(j.owner);
  if (!op || !("integration" in op) || op.integration !== j.integration) return null;
  if (op.state === "preparing" || op.state === "ready" || op.state === "publishing" || op.state === "unresolved") return { landOp: op.id };
  return op.state === "landed" && advisory ? { landOp: op.id } : null;
}

async function issue(core: RoomCore, j: JobRow): Promise<void> {
  const notNeeded = () => void move(core, j, "state = 'done', outcome = 'not-needed', token = NULL");
  const policy = core.activePolicy();
  const cfg = policy.checkers[j.checker];
  const lane = laneRow(core.sql, j.lane);
  const gen = generationRow(core.sql, j.lane, j.generation);
  if (!cfg || cfg.digest !== j.config || !lane || !gen || lane.generation !== j.generation) return notNeeded();
  const status = obligationsFor(core.sql, j.lane, j.generation, { doc: policy.doc, checkers: policy.checkers, integration: j.integration }).find((o) => o.id === j.obligation);
  if (!status || status.kind !== "check" || status.state === "met") return notNeeded();
  const owner = ownerNow(core, j, status.advisory === true);
  if (!owner) return notNeeded();
  const service = core.checkers(j.checker);
  if (!service) return void move(core, j, "state = 'done', outcome = 'unbound', token = NULL");
  const ttl = cfg.config.timeoutSeconds + JOB_MARGIN_S;
  let target: { integration: Sha; input: CheckInput; readUrl: `https://${string}`; token: string; tokenId: string | null; expiresAt: number };
  const inputs = checkerInputs(cfg.config.inputs, policy.doc.carry);
  if (inputs) {
    if (!core.snapshots) return void move(core, j, "state = 'done', outcome = 'unbound', token = NULL");
    // R-CARRY-15 step 3: the snapshot commit is recorded before a filtered job is issued.
    const recorded = () => one(core.sql, "SELECT * FROM check_snapshots WHERE integration = ? AND checker = ? AND config = ?", j.integration, j.checker, j.config);
    if (!recorded()) await core.recordSnapshots(j.lane, j.generation, j.integration, policy);
    const rec = recorded();
    if (!rec) throw new Error("the snapshot could not be recorded");
    const commit = str(rec, "commit_sha") as Sha;
    const digest = str(rec, "digest") as Digest;
    const paths = JSON.parse(str(rec, "paths")!) as Glob[];
    const wrote = await core.snapshots.prepare({ commit, integration: j.integration, checker: j.checker, digest, paths });
    // R-CARRY-15 step 4: the publisher must have written exactly the commit the Room recorded.
    if (wrote.commit !== commit) throw new Error("the publisher wrote another snapshot commit");
    const t = await core.snapshots.mint(commit, j.id, core.now() + ttl * 1000);
    target = { integration: commit, input: { kind: "filtered", snapshot: digest, paths }, readUrl: wrote.remote, token: t.token, tokenId: null, expiresAt: t.expiresAt };
  } else {
    const tree = await core.ports.artifacts.treeOf(j.integration);
    if (!tree) throw new Error("the integration's tree could not be read");
    const readUrl = (await core.canonicalRemoteReady()) as `https://${string}`;
    const repo = await core.remotes.artifacts.get(core.location().name);
    const t = await repo.createToken("read", ttl);
    target = { integration: j.integration, input: { kind: "tree", tree }, readUrl, token: t.plaintext, tokenId: t.id, expiresAt: Date.parse(t.expiresAt) };
  }
  const attempt = j.attempt + 1;
  const job: CheckJob = {
    // Each attempt is its own run (R-EXEC-8): it names its own sandbox.
    id: `${j.id}_${attempt}`,
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
    ...(owner.landOp ? { landOp: owner.landOp } : {}),
    // The token expires no later than the job's deadline (R-EXEC-9).
    deadline: iso(target.expiresAt),
  };
  // The attempt is recorded before it is sent. Another step that got here first wins; this one sends nothing.
  if (!move(core, j, "state = 'sent', attempt = ?, next_ms = ?, token = ?", attempt, target.expiresAt, target.tokenId)) {
    if (target.tokenId) await revokeCanonical(core, target.tokenId).catch(() => undefined);
    return;
  }
  const sent: JobRow = { ...j, state: "sent", attempt, token: target.tokenId };
  core.kick(`job:${job.id}`, async () => {
    // The wait ends with the answer, or when a jobs step finds the attempt past its deadline.
    const expired = new Promise<null>((resolve) => waitsOf(core).set(job.id, () => resolve(null)));
    try {
      const result = await Promise.race([service.handle(job), expired]);
      if (result !== null) move(core, sent, "state = 'done', outcome = ?, token = NULL", isRefusal(result) ? `refused: ${result.rule}` : result.id);
    } catch {
      // No answer: due again soon, if this attempt is still the current one.
      move(core, sent, "state = 'owed', next_ms = ?", core.now() + JOB_RETRY_MS);
    } finally {
      waitsOf(core).delete(job.id);
      if (target.tokenId) await revokeCanonical(core, target.tokenId).catch(() => undefined);
    }
  });
}
