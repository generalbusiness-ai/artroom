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
 * (R-CARRY-16): one per snapshot commit, reused only for the same commit,
 * with a token per attempt, ended when the attempt ends. It is issued only
 * if the commit the publisher wrote is the one the Room recorded (R-CARRY-15
 * step 4).
 */

import type { CheckInput, CheckJob, Digest, Glob, LaneId, OpId, Sha } from "@generalbusiness/artroom-contract";
import { isRefusal } from "@generalbusiness/artroom-contract";
import { checkerInputs } from "@generalbusiness/artroom-policy";
import { completeInventory } from "@generalbusiness/artroom-git";
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
/** A canonical token is asked to expire this long before the job's deadline, as `SnapshotRepos.mint` does. */
export const TOKEN_MARGIN_S = 5;

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

/** An error's text without any token in it, short enough to keep. */
const redact = (s: string) => s.replace(/art_v\d+_[A-Za-z0-9_]+(\?expires=\d+)?/g, "<token>").slice(0, 300);

/**
 * Artifacts error codes that mean the request was refused and changed
 * nothing (as lane B's `refusedUnchanged`): a definite answer. Any other
 * failure, a lost answer included, may have applied.
 */
const REFUSED_UNCHANGED = new Set(["ALREADY_EXISTS", "INVALID_INPUT", "INVALID_REPO_NAME", "INVALID_TTL", "NOT_FOUND"]);
function refusedUnchanged(e: unknown): boolean {
  const x = e as { code?: unknown; numericCode?: unknown } | null;
  return typeof x?.code === "string" && REFUSED_UNCHANGED.has(x.code) && typeof x.numericCode === "number";
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

/** Issue every job that is due; an attempt past its deadline is due again. Ended tokens not yet revoked are tried first. */
export async function issueJobs(core: RoomCore): Promise<void> {
  if (!core.founded) return;
  for (const r of core.sql.all("SELECT token_id FROM job_tokens WHERE next_ms <= ?", core.now())) await settleToken(core, str(r, "token_id")!);
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

/** The longest wait between checks of a mint whose outcome is unknown. */
export const MINT_RECHECK_MAX_MS = 6 * 3600_000;

/**
 * Watch a mint whose answer was lost or malformed. Its outcome stays
 * unknown: Artifacts may still apply the request, at a time nothing bounds,
 * and the token's expiry runs from then. So the record is never settled
 * here, by time or by an inventory. It settles only by an answer: a
 * refusal that changed nothing, or a usable answer, whose token is then
 * recorded and revoked through the ended-token debt (`issue`). Artifacts'
 * token inventory names no owner, and the canonical repository holds other
 * owners' tokens, so the Room neither picks out this mint's token nor
 * revokes tokens it cannot attribute. What an inventory shows is kept on
 * the record as an observation (`last_error`), and it is checked again with
 * backoff, at most every `MINT_RECHECK_MAX_MS`. The records are the Room's
 * open cleanup duties (`jobTokenDuties`).
 */
async function watchMint(core: RoomCore, mint: string, notBefore: number, attempts: number): Promise<void> {
  const note = (what: string): void =>
    void core.sql.all(
      "UPDATE job_tokens SET attempts = ?, next_ms = ?, last_error = ? WHERE token_id = ?",
      attempts + 1,
      core.now() + Math.min(5_000 * 2 ** (attempts + 1), MINT_RECHECK_MAX_MS),
      redact(`outcome unknown; ${what}`),
      mint,
    );
  if (core.now() < notBefore) return void core.sql.all("UPDATE job_tokens SET next_ms = ? WHERE token_id = ?", notBefore, mint);
  try {
    const repo = await core.artifacts.get(core.location().name);
    const inventory = await repo.listTokens();
    // The shared rule (follow-up c9cd4cd8): every record accounted for and well formed, scope included.
    let tokens: ReturnType<typeof completeInventory>;
    try {
      tokens = completeInventory(inventory, "the canonical repository's token inventory");
    } catch (e) {
      return note(e instanceof Error ? e.message : String(e));
    }
    // Accounted for: every token the Room knows by its ID, each owned by its row here (held by a job, or ended).
    const known = new Set(core.sql.all("SELECT token_id FROM job_tokens WHERE token_id NOT LIKE 'mint:%'").map((r) => str(r, "token_id")!));
    const unaccounted = tokens.filter((t) => t.state === "active" && Date.parse(t.expiresAt) > core.now() && !known.has(t.id)).length;
    // An observation only: a clean inventory shows absence now, not that the mint can never apply.
    note(`${unaccounted} live token(s) on the canonical repository not accounted for at ${iso(core.now())}`);
  } catch (e) {
    note(`the token inventory could not be read: ${String(e)}`);
  }
}

/**
 * The Room's records of job tokens, for operators: tokens held by a job
 * (owned here until revoked or expired), ended tokens still owed
 * revocation, and mints whose outcome is unknown. `expiresAt` is a known
 * token's real expiry; an unknown mint's is unknown (null). `nextCheckAt`
 * is when the record is next due: a revocation attempt, or another
 * observation of an unknown mint.
 */
export function jobTokenDuties(core: RoomCore): {
  readonly token: string;
  readonly kind: "held" | "revoke" | "unknown-mint";
  readonly expiresAt: number | null;
  readonly nextCheckAt: number;
  readonly attempts: number;
  readonly status: string | null;
}[] {
  return core.sql.all("SELECT * FROM job_tokens ORDER BY token_id").map((r) => {
    const token = str(r, "token_id")!;
    const kind = token.startsWith("mint:") ? ("unknown-mint" as const) : str(r, "last_error") === "held" ? ("held" as const) : ("revoke" as const);
    return {
      token,
      kind,
      expiresAt: kind === "unknown-mint" ? null : num(r, "expires_at"),
      nextCheckAt: num(r, "next_ms")!,
      attempts: num(r, "attempts") ?? 0,
      status: str(r, "last_error"),
    };
  });
}

/** Try one ended canonical token's revocation. Settled by Artifacts' answer, or by its known expiry passing; otherwise retried. */
async function settleToken(core: RoomCore, token: string): Promise<void> {
  const row = one(core.sql, "SELECT expires_at, attempts FROM job_tokens WHERE token_id = ?", token);
  if (!row) return;
  // A mint whose answer was lost: no ID to revoke, and its token's expiry ran from whenever Artifacts applied it.
  if (token.startsWith("mint:")) return watchMint(core, token, num(row, "expires_at")!, num(row, "attempts") ?? 0);
  try {
    const repo = await core.artifacts.get(core.location().name);
    await repo.revokeToken(token);
    core.sql.all("DELETE FROM job_tokens WHERE token_id = ?", token);
  } catch (e) {
    const expires = num(row, "expires_at");
    if (expires !== null && expires <= core.now()) return void core.sql.all("DELETE FROM job_tokens WHERE token_id = ?", token);
    const attempts = (num(row, "attempts") ?? 0) + 1;
    core.sql.all(
      "UPDATE job_tokens SET attempts = ?, next_ms = ?, last_error = ? WHERE token_id = ?",
      attempts,
      core.now() + Math.min(5_000 * 2 ** attempts, 300_000),
      redact(String(e)),
      token,
    );
  }
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
      const repo = await core.artifacts.get(core.location().name);
      // The mint is recorded before Artifacts is asked (`mint:<job>`): if its answer is lost, a token may exist, or
      // may yet be made, that the Room cannot name. The record stays, unresolved and visible, until an answer
      // settles it (`watchMint`); nothing bounds its token's lifetime, not the attempt's deadline either.
      const intent = `mint:${jobId}`;
      core.sql.all("INSERT INTO job_tokens (token_id, expires_at, next_ms, last_error) VALUES (?, ?, ?, 'minting') ON CONFLICT (token_id) DO NOTHING", intent, deadline, deadline);
      let t: Awaited<ReturnType<typeof repo.createToken>>;
      try {
        // Asked to expire before the deadline claimed above; what Artifacts returns is checked below (R-EXEC-9).
        t = await repo.createToken("read", Math.floor((deadline - core.now()) / 1000) - TOKEN_MARGIN_S);
      } catch (e) {
        // A refusal that changed nothing settles it; any other failure may have minted a token.
        if (refusedUnchanged(e)) core.sql.all("DELETE FROM job_tokens WHERE token_id = ?", intent);
        else core.sql.all("UPDATE job_tokens SET last_error = ? WHERE token_id = ?", `answer lost: ${redact(String(e))}`, intent);
        throw e;
      }
      // An answer without the token's ID and text cannot be used or revoked: as unknown as a lost one.
      if (typeof t?.id !== "string" || !t.id || typeof t.plaintext !== "string" || !t.plaintext) {
        core.sql.all("UPDATE job_tokens SET last_error = 'malformed answer' WHERE token_id = ?", intent);
        throw new Error("Artifacts answered the mint without a usable token");
      }
      const expires = Date.parse(t.expiresAt);
      const known = Number.isFinite(expires) ? expires : null;
      // A token that is not read-only, or whose expiry is unknown or after the deadline, is refused and ended.
      const accepted = t.scope === "read" && known !== null && known <= deadline;
      // Known now: ownership passes from the mint record to a record of the token itself, in one transaction, so
      // either both happen or neither does. An accepted token's record is due at its expiry, a refused one's now.
      // A late answer, after the attempt was superseded, lands here too, and its token is ended below by its ID.
      try {
        core.sql.transaction(() => {
          core.sql.all(
            "INSERT INTO job_tokens (token_id, expires_at, next_ms, last_error) VALUES (?, ?, ?, ?) ON CONFLICT (token_id) DO UPDATE SET expires_at = excluded.expires_at, next_ms = excluded.next_ms, last_error = excluded.last_error",
            t.id,
            known,
            accepted ? known! : core.now(),
            accepted ? "held" : "refused",
          );
          core.sql.all("DELETE FROM job_tokens WHERE token_id = ?", intent);
        });
      } catch (e) {
        // The handoff could not be written: the mint record stays. While its ID is known here, the token is
        // revoked now; only once Artifacts confirms that is the mint record settled.
        const revoked = await repo.revokeToken(t.id).then(() => true, () => false);
        if (revoked) core.sql.all("DELETE FROM job_tokens WHERE token_id = ?", intent);
        throw e;
      }
      tokenId = t.id;
      tokenExpires = known;
      if (!accepted) throw new Error("Artifacts minted a token that would outlive the job");
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
  if (!current(core, mine)) {
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
  };
  const sent: JobRow = { ...mine, token: tokenId };
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
      await end();
    }
  });
}
