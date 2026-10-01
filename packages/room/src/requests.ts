/**
 * Signed requests that are not recorded (R-CRED-5, R-CRED-6), redemption
 * (R-CRED-9, R-ADM-12), bearer acts (R-CRED-3) and read sessions (R-CRED-7).
 *
 * Workspace operations are public; their write token is not (R-WS). A token
 * is minted for each retrieval, returned once, and never stored: the room
 * keeps only its ID, to revoke it when the lease ends (R-WS-3, R-WS-4).
 */

import type {
  ActRecord,
  DelegationId,
  Envelope,
  InvitationId,
  Joined,
  KeyId,
  LaneId,
  MemberId,
  Redeemed,
  Refusal,
  RosterRecord,
  Session,
  SessionToken,
  SignedEnvelope,
  SignedRequest,
  WorkspaceGrant,
  WorkspaceOp,
} from "@generalbusiness/artroom-contract";
import { isRefusal } from "@generalbusiness/artroom-contract";
import { submit } from "./admission.ts";
import { judge, refusal } from "./authority.ts";
import { canonicalize, utf8 } from "./canonical.ts";
import type { RoomCore } from "./core.ts";
import { digestBytes, newKeyPair, randomToken, sha256Hex, sign, unb64url, verify } from "./crypto.ts";
import { artroomError } from "./errors.ts";
import { iso, opIds, parseTime } from "./ids.ts";
import { laneRow } from "./model.ts";
import { delegation, invitation, keyRow, memberRow, revocationOf } from "./roster.ts";
import { checkRedemption, checkSignedRequest, ShapeError } from "./schema.ts";
import { num, one, str } from "./store.ts";

const tokenHash = (token: string) => sha256Hex(utf8(token));

// ------------------------------------------------------------ signed requests

export async function request(core: RoomCore, input: unknown): Promise<WorkspaceOp | WorkspaceGrant | Session | Refusal> {
  try {
    checkSignedRequest(input);
  } catch (e) {
    throw artroomError("bad-request", e instanceof ShapeError ? e.message : "The request is not a signed request.");
  }
  const signed = input as SignedRequest;
  const r = signed.request;
  if (r.room !== core.roomId) throw artroomError("unauthenticated", "The request names a different room.");
  if (!(await verify(r.actor, "artroom-request-v1", r, signed.sig))) throw artroomError("unauthenticated", "The signature does not verify for the actor key.");
  // R-CRED-6: notAfter in the window, nonce unseen for this key.
  const now = core.now();
  const notAfter = parseTime(r.notAfter)!;
  if (notAfter < now || notAfter > now + 300_000) throw artroomError("unauthenticated", "The request's notAfter is outside the room's 300-second window.");
  core.sql.all("DELETE FROM nonces WHERE expires_ms < ?", now);
  if (one(core.sql, "SELECT 1 AS x FROM nonces WHERE key = ? AND nonce = ?", r.actor, r.nonce)) throw artroomError("unauthenticated", "This nonce was already used.");
  core.sql.all("INSERT INTO nonces (key, nonce, expires_ms) VALUES (?, ?, ?)", r.actor, r.nonce, notAfter);

  const body = r.request;
  if (body.kind === "session") {
    const who = reader(core, r.actor, r.delegation ?? null);
    if ("refused" in who) return who;
    return newSession(core, who.member, r.actor, r.delegation ?? null, Math.min(body.ttlSeconds, 3600));
  }
  // workspace, workspace-token: judged as for `propose` on that lane, now (R-CRED-5, R-WS-2).
  const holder = workspaceAuthority(core, r.actor, r.delegation, body.lane, body.lease);
  if ("refused" in holder) return holder;
  const lane = holder.lane;
  const opId = opIds.workspace(lane.seq, lane.leaseGen);
  if (body.kind === "workspace") {
    const existing = one(core.sql, "SELECT body FROM workspaces WHERE id = ?", opId);
    if (existing) return JSON.parse(str(existing, "body")!) as WorkspaceOp;
    const op: WorkspaceOp = { id: opId, kind: "workspace", updatedAt: iso(now), lane: lane.id, state: "pending" };
    core.sql.all("INSERT INTO workspaces (id, lane, lease_gen, state, body, updated_ms) VALUES (?, ?, ?, 'pending', ?, ?)", opId, lane.id, lane.leaseGen, JSON.stringify(op), now);
    core.kick(`workspace:${opId}`, () => openWorkspace(core, opId, lane.id, lane.leaseGen));
    core.committed();
    return op;
  }
  const row = one(core.sql, "SELECT body FROM workspaces WHERE id = ?", opId);
  const op = row ? (JSON.parse(str(row, "body")!) as WorkspaceOp) : null;
  if (!op || op.state !== "ready")
    return refusal("workspace-not-ready", "The workspace for this lease is not ready.", "Open the workspace and wait for it to be ready.", { current: { op: opId } });
  const minted = await core.ports.artifacts.mintForkToken(lane.id, lane.leaseGen, lane.expiresMs!).catch(() => {
    throw artroomError("unavailable", "A workspace token could not be minted. Retry.");
  });
  // Re-validate after the await: the lease may have ended meanwhile (R-ADM-6, R-WS-2).
  const again = workspaceAuthority(core, r.actor, r.delegation, body.lane, body.lease);
  if ("refused" in again) {
    await core.ports.artifacts.revokeForkToken(lane.id, minted.id).catch(() => undefined);
    return again;
  }
  core.sql.all("INSERT INTO fork_tokens (id, lane, lease_gen, revoked) VALUES (?, ?, ?, 0)", minted.id, lane.id, lane.leaseGen);
  const expiresAt = Math.min(minted.expiresAt, again.lane.expiresMs!);
  return { op: opId, lane: lane.id, leaseGeneration: lane.leaseGen, remote: op.detail.remote, token: minted.token, expiresAt: iso(expiresAt) };
}

function workspaceAuthority(core: RoomCore, actor: KeyId, delegationId: DelegationId | undefined, laneId: LaneId, lease: number) {
  const env = { actor, kind: "propose" as const, target: { lane: laneId }, body: {} as never, ...(delegationId ? { delegation: delegationId } : {}) };
  const j = judge(core.sql, env as Pick<Envelope, "actor" | "kind" | "target" | "body" | "delegation">, "submitted", core.now(), { kind: "propose", lane: laneId });
  if (!j.ok) return j.refusal;
  const lane = laneRow(core.sql, laneId);
  if (!lane) return refusal("lane-unknown", `There is no lane ${laneId}.`, "Name an existing lane.");
  if (lane.purpose === "config-recovery" && !(j.authority.via === "member" && j.authority.role === "admin"))
    return refusal("admin-required", "Only an active admin's own key may open a configuration-recovery workspace.", "Sign with an admin's own key.");
  if (lane.state !== "held" || lane.holder !== j.authority.member)
    return refusal("not-holder", `Only the lane's holder may open its workspace or retrieve its token.`, "Claim the lane first.", { current: { leaseGeneration: lane.leaseGen } });
  if (lease !== lane.leaseGen) return refusal("lease-fenced", `The request carries lease generation ${lease}; the current one is ${lane.leaseGen}.`, "Use the current lease.", { current: { leaseGeneration: lane.leaseGen } });
  return { lane, member: j.authority.member! };
}

async function openWorkspace(core: RoomCore, opId: string, lane: LaneId, leaseGen: number): Promise<void> {
  let body: WorkspaceOp;
  try {
    const { remote } = await core.ports.artifacts.ensureFork(lane);
    body = { id: opId as WorkspaceOp["id"], kind: "workspace", updatedAt: iso(core.now()), lane, state: "ready", detail: { remote, leaseGeneration: leaseGen } };
  } catch {
    body = { id: opId as WorkspaceOp["id"], kind: "workspace", updatedAt: iso(core.now()), lane, state: "failed", error: artroomError("unavailable", "The lane's fork could not be created.") };
  }
  core.sql.all("UPDATE workspaces SET state = ?, body = ?, updated_ms = ? WHERE id = ?", body.state, JSON.stringify(body), core.now(), opId);
}

// ------------------------------------------------------------ read sessions (R-CRED-7)

/** Case (a), or case (b) with the session's member being the grantor's (R-CRED-5). */
function reader(core: RoomCore, actor: KeyId, delegationId: string | null): { member: MemberId } | Refusal {
  const sql = core.sql;
  if (revocationOf(sql, actor)) return refusal("key-revoked", "The signing key has been revoked.", "Sign with an active key.");
  if (delegationId) {
    const d = delegation(sql, delegationId);
    if (!d || d.revoked !== undefined || d.expiresMs <= core.now() || d.grantee !== actor) return refusal("delegation-invalid", "The delegation is not valid for this key.", "Ask the grantor for a new delegation.");
    const g = keyRow(sql, d.grantor);
    const m = g && g.state === "active" ? memberRow(sql, g.member) : null;
    if (!m || m.state !== "active") return refusal("delegation-invalid", "The grantor is no longer an active member.", "Ask a member for a new delegation.");
    return { member: m.handle };
  }
  const k = keyRow(sql, actor);
  const m = k && k.state === "active" ? memberRow(sql, k.member) : null;
  if (!m || m.state !== "active") return refusal("not-member", "The signing key belongs to no active member.", "Join the room first.");
  return { member: m.handle };
}

function newSession(core: RoomCore, member: MemberId, key: KeyId, delegationId: string | null, ttlSeconds: number): Session {
  const token = `ses_${randomToken()}` as SessionToken;
  const expires = core.now() + ttlSeconds * 1000;
  core.sql.all("INSERT INTO sessions (hash, member, key, delegation, expires_ms) VALUES (?, ?, ?, ?, ?)", tokenHash(token), member, key, delegationId, expires);
  return { token, member, expiresAt: iso(expires) };
}

/** The member behind a session or bearer token, judged now (R-CRED-7, R-API-3). */
export function authenticateRead(core: RoomCore, token: string): MemberId {
  const sql = core.sql;
  const h = tokenHash(token);
  const now = core.now();
  const s = one(sql, "SELECT * FROM sessions WHERE hash = ?", h) ?? one(sql, "SELECT member, key, delegation, expires_ms FROM bearers WHERE hash = ?", h);
  const fail = () => artroomError("unauthenticated", "The session or bearer token is not valid.");
  if (!s || num(s, "expires_ms")! <= now) throw fail();
  const key = str(s, "key")!;
  if (revocationOf(sql, key)) throw fail();
  const d = str(s, "delegation");
  if (d) {
    const dl = delegation(sql, d);
    if (!dl || dl.revoked !== undefined || dl.expiresMs <= now) throw fail();
    if (revocationOf(sql, dl.grantor)) throw fail();
  }
  const m = memberRow(sql, str(s, "member")!);
  if (!m || m.state !== "active") throw fail();
  return m.handle;
}

// ------------------------------------------------------------ redemption (R-CRED-9)

const limits = new Map<string, { n: number; since: number }>();

function rateLimit(key: string, max: number, now: number): void {
  const w = limits.get(key);
  if (!w || now - w.since > 60_000) {
    limits.set(key, { n: 1, since: now });
    return;
  }
  w.n++;
  if (w.n > max) throw artroomError("rate-limited", "Too many redemption attempts. Wait a minute and try again.", { retryAfterMs: 60_000 - (now - w.since) });
}

export async function redeem(core: RoomCore, input: unknown, address: string, mcpBase: string): Promise<Joined | Redeemed | Refusal> {
  try {
    checkRedemption(input);
  } catch (e) {
    throw artroomError("bad-request", e instanceof ShapeError ? e.message : "The redemption is not valid.");
  }
  const r = input as { custody: "client"; join: SignedEnvelope } | { custody: "room"; invitation: InvitationId; secret: string };
  const now = core.now();
  const invitationId = r.custody === "client" ? (r.join.envelope.body as { invitation?: string }).invitation ?? "none" : r.invitation;
  rateLimit(`addr:${core.roomId}:${address}`, 20, now);
  rateLimit(`inv:${core.roomId}:${invitationId}`, 10, now);

  if (r.custody === "client") {
    const body = r.join.envelope.body as { op?: string };
    if (r.join.envelope.kind !== "roster" || body.op !== "join" || r.join.envelope.delegation !== undefined)
      throw artroomError("bad-request", "A client-custody redemption carries a signed join.");
    // The same admission as any act, on the `submitted` path (R-ADM-12).
    const out = await submit(core, r.join, "submitted");
    if (isRefusal(out)) return out;
    const record = out as RosterRecord;
    const by = record.by as Extract<RosterRecord["by"], { via: "join" }>;
    return { custody: "client", member: by.member, role: by.role, key: by.key, record, session: newSession(core, by.member, by.key, null, 3600) };
  }

  // Room custody: check custody and secret before making any key (R-ADM-12, R-CRED-9).
  const inv = invitation(core.sql, r.invitation);
  const secret = unb64url(r.secret);
  if (!inv || inv.used !== undefined || inv.expiresMs <= now || !secret || digestBytes(secret) !== inv.secretHash)
    return refusal("invitation-invalid", "The invitation does not exist, was used, expired, or the secret does not match.", "Ask an admin for a new invitation.");
  if (inv.custody !== "room")
    return refusal(
      "custody-mismatch",
      "This invitation is for a key the client holds; it can be redeemed only with a join the client signs.",
      "Make a key, sign a join, and send it to redeem with custody client.",
    );
  const memberKey = newKeyPair();
  const join: Envelope = {
    v: 1,
    room: core.roomId,
    actor: memberKey.key,
    kind: "roster",
    target: null,
    body: { op: "join", invitation: inv.id, secret: r.secret },
    idempotencyKey: `redeem-${randomToken().slice(0, 32)}`,
  };
  const joined = await submit(core, { envelope: join, sig: sign(memberKey.seed, "artroom-envelope-v1", join) }, "room-redemption", {
    heldKeys: [{ key: memberKey.key, seed: memberKey.seed, purpose: "member" }],
  });
  if (isRefusal(joined)) return joined;
  const by = (joined as RosterRecord).by as Extract<RosterRecord["by"], { via: "join" }>;
  // R-CRED-3 step 2: a session key, and a recorded delegation from the member key to it.
  const ttl = inv.session?.ttlSeconds ?? 24 * 3600;
  const sessionKey = newKeyPair();
  const expiresMs = now + ttl * 1000;
  const delegate: Envelope = {
    v: 1,
    room: core.roomId,
    actor: memberKey.key,
    kind: "roster",
    target: null,
    body: { op: "delegate", to: sessionKey.key, kinds: inv.session?.kinds ?? "*", lanes: "*", expiresAt: iso(expiresMs) },
    idempotencyKey: `session-${randomToken().slice(0, 32)}`,
  };
  const granted = await submit(core, { envelope: delegate, sig: sign(memberKey.seed, "artroom-envelope-v1", delegate) }, "submitted", {
    heldKeys: [{ key: sessionKey.key, seed: sessionKey.seed, purpose: "session" }],
  });
  if (isRefusal(granted)) return granted;
  // R-CRED-3 step 3: the bearer token is returned once; only its hash is stored.
  const bearer = `arb_${randomToken()}`;
  core.sql.all("INSERT INTO bearers (hash, member, key, delegation, expires_ms) VALUES (?, ?, ?, ?, ?)", tokenHash(bearer), by.member, sessionKey.key, (granted as ActRecord).id, expiresMs);
  return {
    custody: "room",
    member: by.member,
    role: by.role,
    key: memberKey.key,
    delegation: (granted as ActRecord).id,
    bearer,
    expiresAt: iso(expiresMs),
    mcp: `${mcpBase}/v1/rooms/${core.roomId}/mcp` as `https://${string}`,
  };
}

// ------------------------------------------------------------ bearer acts (R-CRED-3 step 4)

/** An act for an MCP agent: signed by the bearer's session key, naming its delegation. */
export async function bearerAct(
  core: RoomCore,
  bearer: string,
  act: Pick<Envelope, "kind" | "target" | "body" | "idempotencyKey">,
): Promise<ActRecord | Refusal> {
  const row = one(core.sql, "SELECT * FROM bearers WHERE hash = ?", tokenHash(bearer));
  if (!row || num(row, "expires_ms")! <= core.now()) throw artroomError("unauthenticated", "The bearer token is not valid.");
  const key = str(row, "key") as KeyId;
  const seed = core.heldSeed(key);
  if (!seed) throw artroomError("unauthenticated", "The bearer token is not valid.");
  const env = { v: 1, room: core.roomId, actor: key, kind: act.kind, target: act.target, body: act.body, idempotencyKey: act.idempotencyKey, delegation: str(row, "delegation") as DelegationId } as Envelope;
  void canonicalize;
  return submit(core, { envelope: env, sig: sign(seed, "artroom-envelope-v1", env) }, "submitted");
}
