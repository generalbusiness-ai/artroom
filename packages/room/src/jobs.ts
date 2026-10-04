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
 * for the attempt through the Room's mint ledger (R-MINT-1), with the
 * attempt's deadline as `notAfter`, and claimed into `job_tokens` in one
 * transaction (R-MINT-4). A filtered job reads only its own snapshot repository
 * (R-CARRY-16): one per snapshot commit, reused only for the same commit,
 * with a token per attempt, ended when the attempt ends. It is issued only
 * if the commit the publisher wrote is the one the Room recorded (R-CARRY-15
 * step 4).
 */

import type { AnyPolicyDocument, Binding, CheckerConfig, CheckerConfigV2, CheckInput, CheckJob, CheckJobV2, Digest, Glob, LaneId, OpId, Sha } from "@generalbusiness/artroom-contract";
import { isRefusal } from "@generalbusiness/artroom-contract";
import { bindingSubject, checkerInputs, isDeclared } from "@generalbusiness/artroom-policy";
import { MINT_WAIT_MS, OVERDUE_STEP_MS, errorNote, within, type MintLedger } from "@generalbusiness/artroom-git";
import type { ActivePolicyFull, RoomCore } from "./core.ts";
import { digestJson, hex, randomBytes } from "./crypto.ts";
import { iso } from "./ids.ts";
import { generationRow, laneRow } from "./model.ts";
import { obligationsFor } from "./obligations.ts";
import type { Sql } from "./ports.ts";
import { getMeta, num, one, safeJobStatus, setMeta, str } from "./store.ts";

/** Time a job has beyond the checker's own timeout, to start a runner, fetch, sign and submit. */
export const JOB_MARGIN_S = 300;
/** When a job could not be prepared (an outage, a snapshot not written as recorded), it is tried again this much later. */
export const JOB_RETRY_MS = 30_000;
/** When the room cannot issue jobs now (not bound to its repository), they wait this long. */
export const JOB_IDLE_MS = 300_000;
/** A canonical token is asked to expire this long before the job's deadline, as `SnapshotRepos.mint` does. */
export const TOKEN_MARGIN_S = 5;
/** Most jobs one jobs step issues, and most ended job tokens one revocation pass tries, earliest due first (R-MINT-7). */
export const JOB_BATCH = 20;
/** The due batches, read by the due indexes (`DUE_INDEXES`, migration 2): bind the room clock and the batch size. */
export const JOBS_DUE_SQL = "SELECT * FROM check_jobs WHERE state != 'done' AND next_ms <= ? ORDER BY next_ms, rowid LIMIT ?";
export const JOB_TOKENS_DUE_SQL = "SELECT token_id FROM job_tokens WHERE next_ms <= ? ORDER BY next_ms, token_id LIMIT ?";

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

/** The meta key under which a stored room's `mint:<job>` rows were moved into the mint ledger. */
export const JOB_MINTS_MOVED = "job_mints_moved";

/**
 * A room stored before mint lane C recorded each whole-tree job's canonical
 * mint as its own `mint:<job>` row in `job_tokens`, before Artifacts was
 * asked. Once, under a meta key, every such row moves into the mint ledger
 * as an `unknown` record, in one transaction with the rows' deletion: none
 * is lost, and none is settled (R-MINT-5). A room with none only sets the
 * key. Called at every object start; after the first, it reads one meta row.
 */
export function moveJobMints(sql: Sql, mints: Pick<MintLedger, "adopt">, now: number): void {
  if (getMeta(sql, JOB_MINTS_MOVED) !== null) return;
  sql.transaction(() => {
    // `mint:` up to, not including, `mint;`: a range of the primary key.
    const rows = sql.all("SELECT token_id, expires_at FROM job_tokens WHERE token_id >= 'mint:' AND token_id < 'mint;' ORDER BY token_id");
    mints.adopt(
      rows.map((r) => ({
        purpose: `job:${str(r, "token_id")!.slice("mint:".length)}`,
        scope: "read" as const,
        sentAt: now,
        // The row's `expires_at` was the attempt's deadline.
        notAfter: num(r, "expires_at"),
        note: "moved from the check job's own mint record; sent before this time, with its answer lost",
      })),
    );
    if (rows.length > 0) sql.all("DELETE FROM job_tokens WHERE token_id >= 'mint:' AND token_id < 'mint;'");
    setMeta(sql, JOB_MINTS_MOVED, "1");
  });
}

/** Each room's bounded wait for a job token's revocation, when not the mint ledger's (`MINT_WAIT_MS`). Tests shorten it on one object. */
const tokenWaits = new WeakMap<RoomCore, number>();
export function setJobTokenWait(core: RoomCore, ms: number | null): void {
  if (ms === null) tokenWaits.delete(core);
  else tokenWaits.set(core, ms);
}

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

/**
 * Issue the jobs that are due, at most `JOB_BATCH`, earliest due first; an
 * attempt past its deadline is due again. The rest are due at once, and the
 * alarm takes them up 1 s later (`jobsDue`). Ended job tokens are revoked by
 * their own pass (`revokeJobTokens`).
 */
export async function issueJobs(core: RoomCore): Promise<void> {
  if (!core.founded) return;
  const now = core.now();
  // A room the registry does not bind issues nothing (R-PUB-10); its debt waits, never past due.
  if (!(await core.isBound())) {
    core.sql.all("UPDATE check_jobs SET next_ms = ? WHERE state != 'done' AND next_ms <= ?", now + JOB_IDLE_MS, now);
    return;
  }
  for (const r of core.sql.all(JOBS_DUE_SQL, now, JOB_BATCH)) {
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
    // An expired attempt: stop waiting for it, and end its token. A recorded token was accepted only if it expires
    // by the attempt's deadline, which is `next_ms`. A failure to record that is not swallowed: the token's owner
    // (its `job_tokens` row, or the snapshot repositories' ledger) is unchanged, and the alarm tries again.
    if (j.state === "sent") {
      waitsOf(core).get(`${j.id}_${j.attempt}`)?.();
      if (j.token) await endToken(core, j.token, `${j.id}_${j.attempt}`, num(r, "next_ms"));
    }
    await issue(core, j).catch(() => move(core, j, "next_ms = ?", core.now() + JOB_RETRY_MS));
  }
}

/**
 * End an attempt's token. `token` is a canonical read token's ID, or
 * `snapshot:<commit>` for a filtered job's token, which the snapshot
 * repositories revoke (with their own durable duties), retiring the
 * repository once no job is left. A canonical token is owned by its
 * `job_tokens` row from the moment its ID is known (`issue`); ending it
 * makes that row due now, and the row stays until Artifacts confirms the
 * revocation or its known expiry has passed. A failure to write is not
 * swallowed: the row keeps the token, due at its expiry at the latest.
 */
async function endToken(core: RoomCore, token: string, job: string, expiresAt: number | null): Promise<unknown> {
  if (token.startsWith("snapshot:")) return core.snapshots.end(token.slice("snapshot:".length) as Sha, job);
  core.sql.all(
    "INSERT INTO job_tokens (token_id, expires_at, next_ms, last_error) VALUES (?, ?, ?, 'ended') ON CONFLICT (token_id) DO UPDATE SET expires_at = COALESCE(job_tokens.expires_at, excluded.expires_at), next_ms = excluded.next_ms, last_error = 'ended'",
    token,
    expiresAt,
    core.now(),
  );
  return settleToken(core, token);
}

/**
 * The Room's records of job tokens, for operators: tokens held by a job
 * (owned here until revoked or expired), and ended tokens still owed
 * revocation. `expiresAt` is the token's reported expiry; `nextCheckAt` is
 * when the record is next due. A whole-tree job's mint whose outcome is
 * unknown is a record of the canonical mint ledger (`core.mints.duties`).
 */
export function jobTokenDuties(core: RoomCore): {
  readonly token: string;
  readonly kind: "held" | "revoke";
  readonly expiresAt: number | null;
  readonly nextCheckAt: number;
  readonly attempts: number;
  readonly status: string | null;
}[] {
  return core.sql.all("SELECT * FROM job_tokens ORDER BY token_id").map((r) => ({
    token: str(r, "token_id")!,
    kind: str(r, "last_error") === "held" ? ("held" as const) : ("revoke" as const),
    expiresAt: num(r, "expires_at"),
    nextCheckAt: num(r, "next_ms")!,
    attempts: num(r, "attempts") ?? 0,
    status: safeJobStatus(str(r, "last_error")), // only safe metadata is shown (request d29c09fa)
  }));
}

/** Each room's job token revocation pass while it runs: when its current attempt times out (room clock). */
const tokenPasses = new WeakMap<RoomCore, { until: number }>();

/**
 * The job token revocation pass (R-MINT-4, R-MINT-7): at most `JOB_BATCH`
 * rows due now, earliest due first, read by index. The pass runs in the
 * background, one at a time, and the alarm never awaits it: later alarm
 * steps are not held by a revocation's wait. A failure to read the batch
 * is the step's own, and takes its kind's backoff (`jobTokens`).
 */
export function revokeJobTokens(core: RoomCore): void {
  if (!core.founded || tokenPasses.has(core)) return;
  const batch = core.sql.all(JOB_TOKENS_DUE_SQL, core.now(), JOB_BATCH).map((r) => str(r, "token_id")!);
  if (batch.length === 0) return;
  const pass = { until: core.now() + (tokenWaits.get(core) ?? MINT_WAIT_MS) };
  tokenPasses.set(core, pass);
  core.kick("job-tokens", async () => {
    try {
      for (const token of batch) {
        pass.until = core.now() + (tokenWaits.get(core) ?? MINT_WAIT_MS);
        await settleToken(core, token);
      }
    } finally {
      tokenPasses.delete(core);
    }
  });
}

/**
 * When the job token pass should next run, or null: the earliest due row,
 * not before the running pass's current attempt times out. A time already
 * passed (a backlog larger than one pass) is now plus 1 s, never sooner; a
 * still-future time is itself.
 */
export function jobTokensDue(core: RoomCore): number | null {
  const t = num(one(core.sql, "SELECT MIN(next_ms) AS t FROM job_tokens"), "t");
  if (t === null) return null;
  const pass = tokenPasses.get(core);
  const eligible = pass ? Math.max(t, pass.until) : t;
  const now = core.now();
  return eligible <= now ? now + OVERDUE_STEP_MS : eligible;
}

/** When the jobs step should next run, or null: the earliest job not done; overdue (a batch left over) is now plus 1 s. */
export function jobsDue(core: RoomCore): number | null {
  const t = num(one(core.sql, "SELECT MIN(next_ms) AS t FROM check_jobs WHERE state != 'done'"), "t");
  if (t === null) return null;
  const now = core.now();
  return t <= now ? now + OVERDUE_STEP_MS : t;
}

/**
 * Try one ended canonical token's revocation, by its ID. Settled by
 * Artifacts' answer, or once its known expiry has passed, with no
 * revocation (R-MINT-4); a token with no known expiry is never settled by
 * time. The repository lookup and the revocation share one bounded wait.
 * The expiry is checked again after the lookup, immediately before the
 * send, and nothing is sent once the wait has ended; a late answer changes
 * nothing. A failure is kept on the row as safe metadata only, with
 * backoff, for a later alarm.
 */
async function settleToken(core: RoomCore, token: string): Promise<void> {
  const row = one(core.sql, "SELECT expires_at, attempts FROM job_tokens WHERE token_id = ?", token);
  if (!row) return;
  const expires = num(row, "expires_at");
  const expired = () => expires !== null && expires <= core.now();
  const settle = () => void core.sql.all("DELETE FROM job_tokens WHERE token_id = ?", token);
  if (expired()) return settle();
  const wait = tokenWaits.get(core) ?? MINT_WAIT_MS;
  const end = Date.now() + wait;
  let note: string;
  try {
    const repo = await within((async () => core.artifacts.get(core.location().name))(), wait, null);
    if (expired()) return settle();
    if (!repo || Date.now() >= end) note = "the repository was not reached in time";
    else if (await within(repo.revokeToken(token).then(() => true), end - Date.now(), false)) return settle();
    else note = "revocation: no answer in time";
  } catch (e) {
    note = errorNote("revocation failed", e);
  }
  if (expired()) return settle();
  const attempts = (num(row, "attempts") ?? 0) + 1;
  core.sql.all("UPDATE job_tokens SET attempts = ?, next_ms = ?, last_error = ? WHERE token_id = ?", attempts, core.now() + Math.min(5_000 * 2 ** attempts, 300_000), note, token);
}

/** The owner's hold on this integration now, or null: the land operation a check names, if any. */
function ownerNow(core: RoomCore, j: JobRow, advisory: boolean): { readonly landOp?: OpId } | null {
  if (isPreview(j.owner)) {
    const row = one(core.sql, "SELECT generation, body FROM previews WHERE id = ?", j.owner);
    const body = row ? (JSON.parse(str(row, "body")!) as { state?: string; integration?: string }) : null;
    // A landed generation's preview owns no work: its landing did.
    if (generationRow(core.sql, j.lane, j.generation)?.landed) return null;
    return body?.state === "clean" && body.integration === j.integration && num(row, "generation") === j.generation ? {} : null;
  }
  const op = core.landing.view(j.owner);
  if (!op || !("integration" in op) || op.integration !== j.integration) return null;
  if (op.state === "preparing" || op.state === "ready" || op.state === "publishing" || op.state === "unresolved") return { landOp: op.id };
  return op.state === "landed" && advisory ? { landOp: op.id } : null;
}

/**
 * The work this job does now, or null if it no longer belongs to its owner:
 * the configuration is unchanged, the generation is the lane's latest, the
 * obligation is open on the integration, and the owner is current on it.
 * Synchronous, so a decision and the write that follows it see one state.
 */
function current(core: RoomCore, j: JobRow) {
  const policy = core.activePolicy();
  const cfg = policy.checkers[j.checker];
  const lane = laneRow(core.sql, j.lane);
  const gen = generationRow(core.sql, j.lane, j.generation);
  if (!cfg || cfg.digest !== j.config || !lane || !gen || lane.generation !== j.generation) return null;
  const status = obligationsFor(core.sql, j.lane, j.generation, { doc: policy.doc, checkers: policy.checkers, integration: j.integration }).find((o) => o.id === j.obligation);
  if (!status || status.kind !== "check" || status.state === "met") return null;
  const owner = ownerNow(core, j, status.advisory === true);
  return owner ? { policy, cfg, gen, owner } : null;
}

/** The kind and binding a v2 room's job tells its checker to sign (R-DECL-18, `CheckJobV2`); nothing under a v1 document. */
function signedAs(policy: ActivePolicyFull, config: CheckerConfig): { readonly kind?: string; readonly binding?: Binding } {
  const doc = policy.doc as AnyPolicyDocument;
  // A v2 document activates only with `artroom-checker-v2` configurations, each naming an act it declares (R-DECL-18).
  if (!isDeclared(doc)) return {};
  const act = (config as unknown as CheckerConfigV2).act;
  return { kind: act, binding: digestJson(bindingSubject(doc, act)) as Binding };
}

/**
 * Has an activation replaced the binding this job named, while the job is
 * still needed? Judged from the Room's own state, never from what the
 * checker service answered: a service cannot make the Room send a job again.
 */
function reboundSince(core: RoomCore, j: JobRow, job: CheckJob): boolean {
  const now = current(core, j);
  if (!now) return false; // G2:job-rebound-needed
  return signedAs(now.policy, now.cfg.config).binding !== (job as Partial<CheckJobV2>).binding; // G2:job-rebound
}

async function issue(core: RoomCore, j: JobRow): Promise<void> {
  const now = current(core, j);
  if (!now) return void move(core, j, "state = 'done', outcome = 'not-needed', token = NULL");
  const { policy, cfg, gen, owner } = now;
  const service = core.checkers(j.checker);
  if (!service) return void move(core, j, "state = 'done', outcome = 'unbound', token = NULL");
  const ttl = cfg.config.timeoutSeconds + JOB_MARGIN_S;
  const deadline = core.now() + ttl * 1000;
  const attempt = j.attempt + 1;
  const jobId: CheckJob["id"] = `${j.id}_${attempt}`;
  // The attempt is claimed before any credential is prepared: a step that loses the claim prepares nothing, and
  // every credential belongs to exactly one attempt. A host that stops from here on leaves the attempt due at its
  // deadline, when it is issued again and its recorded token ended.
  if (!move(core, j, "state = 'sent', attempt = ?, next_ms = ?, token = NULL", attempt, deadline)) return;
  const mine: JobRow = { ...j, state: "sent", attempt, token: null };
  let tokenId: string | null = null;
  let tokenExpires: number | null = null;
  let target: { integration: Sha; input: CheckInput; readUrl: `https://${string}`; token: string };
  // Not caught: the token's owner is durable before this runs, and a failure here leaves it as it was.
  const end = () => (tokenId ? endToken(core, tokenId, jobId, tokenExpires) : Promise.resolve());
  try {
    const inputs = checkerInputs(cfg.config.inputs, policy.doc.carry);
    if (inputs) {
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
      tokenId = `snapshot:${commit}`;
      move(core, mine, "token = ?", tokenId);
      const t = await core.snapshots.mint(commit, jobId, deadline);
      target = { integration: commit, input: { kind: "filtered", snapshot: digest, paths }, readUrl: wrote.remote as `https://${string}`, token: t.token };
    } else {
      const tree = await core.ports.artifacts.treeOf(j.integration);
      if (!tree) throw new Error("the integration's tree could not be read");
      const readUrl = (await core.canonicalRemoteReady()) as `https://${string}`;
      // Through the canonical mint ledger (R-MINT-2, R-MINT-3, R-EXEC-9). Its record and wake-up are stored before
      // the request, and a lost answer stays an unknown record. The lifetime asked is computed after the wake-up, from
      // the send time, to end before the deadline claimed above. The deadline is the request's `notAfter`: a token
      // whose reported expiry is later is never returned, and the ledger owes its revocation.
      const t = await core.mints.mint(`job:${jobId}`, "read", (sentAt) => Math.floor((deadline - sentAt) / 1000) - TOKEN_MARGIN_S, { notAfter: deadline });
      // The handoff: the token's `job_tokens` row is written and the ledger's record claimed in one transaction
      // (R-MINT-4). Due at its expiry: an accepted token ends by the deadline.
      try {
        core.sql.transaction(() => {
          core.sql.all("INSERT INTO job_tokens (token_id, expires_at, next_ms, last_error) VALUES (?, ?, ?, 'held')", t.id, t.expiresAt, t.expiresAt);
          t.claim();
        });
      } catch (e) {
        // Not claimed: the ledger still owns the token and revokes it now; a revocation that fails stays owed there.
        await t.release().catch(() => undefined);
        throw e;
      }
      tokenId = t.id;
      tokenExpires = t.expiresAt;
      move(core, mine, "token = ?", tokenId);
      target = { integration: j.integration, input: { kind: "tree", tree }, readUrl, token: t.plaintext };
    }
  } catch {
    // Not prepared: this attempt's credentials are ended (their owner is already durable), and the job is due again.
    await end();
    move(core, mine, "state = 'owed', next_ms = ?, token = NULL", core.now() + JOB_RETRY_MS);
    return;
  }
  // Preparation awaited: the attempt must still be the row's, and the owner, generation, configuration and
  // obligation are judged again, with no await before the dispatch. Work that no longer belongs to its owner is
  // retired with its credentials.
  if (!move(core, mine, "next_ms = next_ms")) return void (await end());
  // An attempt past its own deadline is never sent: its credentials are ended and the job is due again later.
  if (core.now() >= deadline) {
    move(core, mine, "state = 'owed', next_ms = ?, token = NULL", core.now() + JOB_RETRY_MS);
    await end();
    return;
  }
  const fresh = current(core, mine);
  if (!fresh) {
    move(core, mine, "state = 'done', outcome = 'not-needed', token = NULL");
    await end();
    return;
  }
  const job: CheckJob = {
    // Each attempt is its own run (R-EXEC-8): it names its own sandbox.
    id: jobId,
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
    deadline: iso(deadline),
    // R-DECL-18: in a v2 room the job names the kind its check is signed as and that kind's binding, from the
    // policy judged current just above, with no await since: an activation while the job was prepared is seen here.
    ...signedAs(fresh.policy, fresh.cfg.config), // G2:job-binding
  };
  const sent: JobRow = { ...mine, token: tokenId };
  core.kick(`job:${job.id}`, async () => {
    // The wait ends with the answer, or when a jobs step finds the attempt past its deadline.
    const expired = new Promise<null>((resolve) => waitsOf(core).set(job.id, () => resolve(null)));
    try {
      const result = await Promise.race([service.handle(job), expired]);
      // R-DECL-18: a check signed under a binding an activation has since replaced is refused binding-stale. The job
      // is then due again, and its next attempt names the binding in force, or ends as no longer needed. A checker
      // that was given the active binding and is still refused is not asked again.
      if (result !== null && isRefusal(result) && result.rule === "binding-stale" && reboundSince(core, sent, job)) move(core, sent, "state = 'owed', next_ms = ?, token = NULL", core.now() + JOB_RETRY_MS); // G2:job-reissue
      else if (result !== null) move(core, sent, "state = 'done', outcome = ?, token = NULL", isRefusal(result) ? `refused: ${result.rule}` : result.id);
    } catch {
      // No answer: due again soon, if this attempt is still the current one.
      move(core, sent, "state = 'owed', next_ms = ?", core.now() + JOB_RETRY_MS);
    } finally {
      waitsOf(core).delete(job.id);
      await end();
    }
  });
}
