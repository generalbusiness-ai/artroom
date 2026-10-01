/**
 * The demo loop, through the types only. This file is compiled, never run:
 * `npm run typecheck` proves the contract supports the whole loop and that
 * every step handles a Refusal.
 *
 *   policy → invite → claim → workspace → (git push) → propose → note
 *   → review → check → land → wait → attention / log / explain
 *   → renew or release
 *
 * It also exercises the HTTPS handle, the MCP tools and a recut after
 * `generation-moved`.
 */

import {
  isCarried,
  isRefusal,
  isSha,
  isTerminal,
  type ActId,
  type ArtroomError,
  type ArtroomService,
  type Claim,
  type Cursor,
  type Digest,
  type Held,
  type LandOp,
  type McpInput,
  type McpOutput,
  type McpToolName,
  type Proposal,
  type Refusal,
  type Room,
  type RoomApi,
  type Sha,
  type Signer,
} from "@generalbusiness/artroom-contract";
import { connect } from "@generalbusiness/artroom-contract/client";
import { Checker, type CheckJob, type CheckOutcome, type Runner } from "@generalbusiness/artroom-contract/checker";
import { carry, lanes, owners, policy, requireCheck, requireReview, rule } from "@generalbusiness/artroom-contract/policy";

// ------------------------------------------------- example-local declarations

interface Env {
  readonly ARTROOM: ArtroomService;
  /** A delegation key held as a Worker secret. */
  readonly ARTROOM_KEY: string;
  readonly RUNNER: unknown;
}
declare function signerFromSecret(secret: string): Signer;
declare function runnerFor(binding: unknown, jobId: string): Runner;
declare function gitPush(remote: string, token: string): Promise<Sha>;
declare function show(message: string): void;
declare function callTool<T extends McpToolName>(name: T, input: McpInput<T>): Promise<McpOutput<T>>;
declare function sha256(bytes: Uint8Array): Promise<Digest>;
declare const env: Env;
declare const issue: `https://${string}`;

/** Every refusal gets the same treatment: say the rule, the reason and the fix. */
function explain(refusal: Refusal): null {
  show(`${refusal.rule}: ${refusal.reason}${refusal.fix ? ` Fix: ${refusal.fix}` : ""}`);
  return null;
}

function assertNever(value: never): never {
  throw new Error(`unhandled: ${JSON.stringify(value)}`);
}

// ------------------------------------------------------------------ 1. policy

export const roomPolicy = policy(
  owners({ "migrations/**": "@db", "src/api/**": "@security" }),
  requireCheck("tests", { paths: "src/**", by: "@ci" }),
  requireReview({ paths: "src/api/**", from: "@security" }),
  carry({ globalInputs: ["package.json", "package-lock.json", "tsconfig*.json", "wrangler.*", ".artroom/**"] }),
  lanes("by-scope"),
  rule({ id: "claim-before-propose", on: "propose", refuse: "$not(lane.claimed)", fix: "Claim the paths first." }),
);

// ------------------------------------------------- 2. an admin invites an agent

export async function inviteAgent(admin: RoomApi, secret: Uint8Array): Promise<ActId | null> {
  const invite = await admin.roster({
    op: "invite",
    member: "@builder",
    role: "agent",
    custody: "room", // an MCP agent: the room holds its key (R-CRED-3)
    expiresAt: "2026-10-08T00:00:00.000Z",
    secretHash: await sha256(secret),
    session: { kinds: "*", lanes: "*", ttlSeconds: 86_400 },
  });
  if (isRefusal(invite)) return explain(invite); // e.g. "admin-required"
  if (invite.flags.includes("recovery-key")) show("signed by the recovery key");
  return invite.invitation ?? null;
}

// ------------------------------------------------------- 3. the author's loop

export async function author(): Promise<LandOp | null> {
  const signer = signerFromSecret(env.ARTROOM_KEY);
  using room = await connect(env.ARTROOM, "acme/web", {
    kind: "delegation",
    signer,
    as: "act_12_9f3a01bc",
  });

  // claim
  const claim = await room.claim({
    goal: "Rate-limit /api/login",
    scope: ["src/api/login.ts", "src/lib/ratelimit/**"],
    because: [{ url: issue }],
  });
  if (isRefusal(claim)) return explain(claim); // e.g. "scope-owned", fix: "ask @security"
  for (const o of claim.overlaps) show(`${o.certain ? "overlaps" : "may overlap"} ${o.lane} (${o.theirs})`);

  // workspace
  const wsOp = await room.workspace(claim);
  if (isRefusal(wsOp)) return explain(wsOp);
  const ws = await room.wait(wsOp, { until: ["ready", "failed"] });
  if (ws.state === "failed") {
    show(`workspace failed (${ws.error.code}); retryable: ${ws.error.retryable}`);
    return null;
  }
  // The operation is public; the write token is holder-only (R-WS-1, R-WS-2).
  const grant = await room.workspaceToken(claim);
  if (isRefusal(grant)) return explain(grant); // e.g. "lease-fenced" after an expiry
  const head = await gitPush(grant.remote, grant.token);

  // propose, recutting once if the generation moved
  const proposal = await proposeWithRecut(room, claim, head);
  if (proposal === null) return null;

  // land
  const landing = await room.land(claim, proposal);
  if (isRefusal(landing)) return explain(landing); // e.g. "obligation-open: check tests"
  const op = await room.wait(landing.op, {
    until: ["landed", "aborted", "retryable", "failed", "unresolved"],
    timeoutMs: 120_000,
  });
  reportLanding(op);

  // keep the lane, or hand it over
  if (op.state === "landed") {
    const renewed = await room.renew(claim);
    if (isRefusal(renewed)) explain(renewed);
  } else {
    const released = await room.release(claim, { note: "Landing did not complete; see the operation." });
    if (isRefusal(released)) explain(released);
  }
  return op;
}

async function proposeWithRecut(room: RoomApi, held: Held, head: Sha): Promise<Proposal | null> {
  const first = await room.propose(held, { head, expectedGeneration: 0, summary: "Adds a token bucket." });
  if (!isRefusal(first)) return first;
  if (first.rule !== "generation-moved") return explain(first); // e.g. "outside-claim"
  const lane = await room.lane(held.lane);
  if (lane === null) return null;
  const again = await room.propose(held, { head, expectedGeneration: lane.generation, summary: "Recut." });
  return isRefusal(again) ? explain(again) : again;
}

function reportLanding(op: Exclude<LandOp, { state: "accepted" | "preparing" | "ready" | "publishing" }>): void {
  switch (op.state) {
    case "landed":
      show(`landed ${op.integration}, reserved at seq ${op.reservedAt}`);
      if (op.revertLane) show(`revert lane opened: ${op.revertLane}`);
      return;
    case "aborted":
      show(`aborted after ${op.abort.trigger}`);
      return;
    case "retryable":
      show(`retryable (${op.reason}): ${op.fix}`);
      return;
    case "failed":
      show(op.reason.code === "conflict" ? `conflict in ${op.reason.paths.join(", ")}` : `failed: ${op.reason.code}`);
      return;
    case "unresolved":
      show(`publication unresolved since ${op.since}; the slot stays held`);
      return;
    default:
      assertNever(op);
  }
}

// ----------------------------------------------------------- 4. the reviewer

export async function reviewer(room: Room, proposal: Proposal): Promise<void> {
  for (const obligation of proposal.obligations) {
    for (const evidence of obligation.evidence) {
      show(
        isCarried(evidence)
          ? `${obligation.id}: carried from generation ${evidence.from.generation}, head ${evidence.from.head}, because ${evidence.reason.text}`
          : `${obligation.id}: reviewed here (${evidence.act})`,
      );
    }
  }
  const note = await room.note(
    { lane: proposal.lane, generation: proposal.generation, head: proposal.head, path: "src/api/login.ts", line: 42 },
    { text: "Should the window be configurable?" },
  );
  if (isRefusal(note)) explain(note); // e.g. "secret-detected"

  const review = await room.review(proposal, {
    verdict: "approve",
    scope: ["src/api/**"],
    dependsOn: ["src/lib/authz/**"],
    text: "Limits look right.",
  });
  if (isRefusal(review)) {
    explain(review); // e.g. "not-authorized-reviewer", "self-review", "head-mismatch"
    return;
  }
  if (review.flags.includes("sole-admin-self-approval")) show("recorded as a sole-admin self-approval");
  if (review.after) show(`recorded after landing ${review.after} was reserved`);
}

// ------------------------------------------------------------ 5. the checker

export class Tests extends Checker<Env> {
  name = "tests";
  // No `inputs`: the default is the whole tree.
  async run(job: CheckJob): Promise<CheckOutcome> {
    if (!isSha(job.integration)) return { ok: false, detail: "integration is not a commit" };
    const box = runnerFor(this.env.RUNNER, job.id);
    await box.exec(["git", "init", "w"]);
    await box.exec(["git", "-C", "w", "fetch", "--depth", "1", job.readUrl, job.integration], { env: job.gitAuthEnv });
    await box.exec(["git", "-C", "w", "checkout", "--detach", "FETCH_HEAD"]);
    const checkedOut = await box.exec(["git", "-C", "w", "rev-parse", "HEAD"]);
    if (checkedOut.stdout.trim() !== job.integration) return { ok: false, detail: "checked-out head does not match" };
    const install = await box.exec(["npm", "ci"], { cwd: "w" });
    if (install.exitCode !== 0) return { ok: false, detail: install.stderr.slice(-4000) };
    const run = await box.exec(["npm", "test"], { cwd: "w" });
    return { ok: run.exitCode === 0, detail: run.stdout.slice(-4000) };
  }
}

/** What the room sees when it hands a job to a checker service. */
export async function dispatch(tests: Tests, job: CheckJob): Promise<void> {
  const check = await tests.handle(job);
  if (isRefusal(check)) {
    explain(check); // e.g. "check-binding": the job's integration is no longer the prepared one
    return;
  }
  show(`${check.check} ${check.ok ? "passed" : "failed"} on ${check.integration}`);
}

// ------------------------------------------- 6. attention, log and explain

export async function followRoom(room: RoomApi, from?: Cursor): Promise<Cursor> {
  let cursor = from;
  for (;;) {
    const page = await room.attention(cursor === undefined ? { limit: 50 } : { cursor, limit: 50 });
    for (const item of page.items) {
      if (!item.open) continue;
      switch (item.why) {
        case "review-requested":
          show(`review ${item.proposal.lane}#${item.proposal.generation} as ${item.as}: ${item.text}`);
          break;
        case "publication-unresolved":
          show(`admin: publication ${item.op} unresolved since ${item.since}`);
          break;
        default:
          show(item.text);
      }
    }
    cursor = page.cursor;
    if (!page.more) return cursor;
  }
}

export async function audit(room: RoomApi, act: ActId): Promise<void> {
  const page = await room.log({ after: 0, limit: 100 });
  show(`log head ${page.head}, published through ${page.publishedThrough}`);
  const why = await room.explain(act);
  if (why === null) return;
  for (const d of why.decisions) {
    show(`${d.rule} (${d.kind}) under ${d.policy}: ${d.outcome.result}, ${d.usage.steps} steps`);
  }
  if (!why.published) show("not yet published: offline verification covers only the published prefix");
}

// --------------------------------------------- 7. a person over HTTPS

export async function person(signer: Signer): Promise<void> {
  using room = await connect({ url: "https://artroom.example.workers.dev" }, "acme/web", { kind: "key", signer });
  try {
    const update = await room.subscribe(undefined, { waitMs: 25_000 });
    show(`${update.entries.length} new entries; published through ${update.publishedThrough}`);
  } catch (error) {
    const e = error as ArtroomError;
    if (e.retryable) show(`retry after ${e.retryAfterMs ?? 1000} ms`);
    else throw error;
  }
}

// ------------------------------------------------- 8. an agent over MCP

export async function agentOverMcp(): Promise<void> {
  const claim = await callTool("claim", { goal: "Fix login copy", scope: ["src/ui/login/**"] });
  if (isRefusal(claim)) {
    explain(claim);
    return;
  }
  const held = { lane: claim.lane, lease: claim.lease.generation };
  const ws = await callTool("workspace", { ...held, waitMs: 20_000 });
  if (isRefusal(ws)) {
    explain(ws);
    return;
  }
  if (ws.grant === null) {
    show(`workspace ${ws.op.state}`);
    return;
  }
  const head = await gitPush(ws.grant.remote, ws.grant.token);
  const p = await callTool("propose", { ...held, head, expectedGeneration: 0, summary: "Copy fix." });
  if (isRefusal(p)) {
    explain(p);
    return;
  }
  const landing = await callTool("land", { ...held, generation: p.generation, head: p.head, waitMs: 60_000 });
  if (isRefusal(landing)) {
    explain(landing);
    return;
  }
  if (isTerminal(landing.op)) show(`landing ${landing.op.state}`);
  const queue = await callTool("attention", { limit: 20 });
  show(`${queue.items.length} items; published through ${queue.publishedThrough}`);
  const why = await callTool("explain", { act: p.id });
  if (why) show(`${why.decisions.length} decisions`);
}

/** A `Claim` record is a `Held`: the compiler checks it here. */
export const claimIsHeld = (claim: Claim): Held => claim;
