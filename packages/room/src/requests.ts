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
  AnyPolicyDocument,
  DelegationId,
  Envelope,
  GrantMap,
  InvitationId,
  Joined,
  KeyId,
  LaneId,
  MemberId,
  Redeemed,
  Refusal,
  Role,
  RosterRecord,
  Session,
  SessionToken,
  SignedEnvelope,
  SignedRequest,
  WorkspaceGrant,
  WorkspaceOp,
} from "@generalbusiness/artroom-contract";
import { CODE_REVIEW_ACTS, DELEGABLE_PLATFORM, bindingSubject, delegableBy as grantable, isDeclared, isPlatformKind, stepsOf } from "@generalbusiness/artroom-policy";
import { isRefusal } from "@generalbusiness/artroom-contract";
import { admit, commit, decide, earlySteps, finalBoundary, refuseApplies, refuseInput, submit, type DecideOptions } from "./admission.ts";
import { judge, refusal, type Judged } from "./authority.ts";
import { entryAt } from "./log.ts";
import { utf8 } from "./canonical.ts";
import { fault, Moved, type RoomCore } from "./core.ts";
import { digestBytes, digestJson, newKeyPair, randomToken, sha256Hex, sign, unb64url, verify } from "./crypto.ts";
import { artroomError } from "./errors.ts";
import { iso, parseTime, RE } from "./ids.ts";
import { laneRow, type LaneRow } from "./model.ts";
import { limitAddress, limitInvitation } from "./ratelimit.ts";
import { delegation, delegableBy, invitation, keyRow, memberRow, revocationOf } from "./roster.ts";
import { checkRedemption, checkSignedRequest, isPlainObject, ShapeError } from "./schema.ts";
import { num, one, str } from "./store.ts";

export const tokenHash = (token: string) => sha256Hex(utf8(token));

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
  return workspaceRequest(core, r.actor, r.delegation, body);
}

/**
 * `workspace` and `workspace-token`, for a signed request or for a bearer
 * session (R-CRED-5, R-CRED-10): judged as for an act with step `version` on
 * that lane (`propose` under the legacy vocabulary), now, under the key and
 * delegation given (R-WS-2).
 */
async function workspaceRequest(
  core: RoomCore,
  actor: KeyId,
  delegationId: DelegationId | undefined,
  body: Exclude<SignedRequest["request"]["request"], { kind: "session" }>,
): Promise<WorkspaceOp | WorkspaceGrant | Refusal> {
  const r = { actor, delegation: delegationId };
  const holder = workspaceAuthority(core, r.actor, r.delegation, body.lane, body.lease);
  if ("refused" in holder) return holder;
  const lane = holder.lane;
  // Lane B's workspaces: one fork per lane, one token per lease generation (R-WS, R-CRED-8).
  const ws = core.workspaces;
  if (body.kind === "workspace") {
    const op = core.sql.transaction(() => {
      const opened = ws.open(lane.id, lane.leaseGen, lane.expiresMs!);
      if (!("refused" in opened))
        core.sql.all("INSERT INTO ws_leases (lane, lease_gen, state) VALUES (?, ?, 'open') ON CONFLICT (lane, lease_gen) DO UPDATE SET state = 'open'", lane.id, lane.leaseGen);
      return opened;
    });
    if (!("refused" in op) && op.state === "pending") {
      core.run("workspaces");
      core.committed();
    }
    return op;
  }
  // The caller was judged as holder of this lease just now; lane B checks the lease generation, readiness and expiry again.
  return ws.grant(lane.id, lane.leaseGen);
}

/**
 * The kinds whose step `version` acts on this thread (R-CRED-5 as amended):
 * `propose` under the legacy vocabulary; in a `v2` room, `recover` on a
 * configuration-recovery thread, and otherwise each declared act with step
 * `version` whose `threads` name the thread's kind.
 */
function versionKinds(core: RoomCore, lane: LaneRow | null): string[] {
  const doc = core.activePolicy().doc as AnyPolicyDocument;
  if (!isDeclared(doc)) return ["propose"];
  if (lane?.purpose === "config-recovery") return ["recover"]; // G2:workspace-recover
  return Object.keys(doc.acts).filter((k) => stepsOf(doc, k, { lane: lane?.id ?? "" })?.includes("version") && (!lane || doc.acts[k]!.threads?.includes(lane.kind))); // G2:workspace-kinds
}

function workspaceAuthority(core: RoomCore, actor: KeyId, delegationId: DelegationId | undefined, laneId: LaneId, lease: number) {
  const doc = core.activePolicy().doc;
  const found = laneRow(core.sql, laneId);
  let j: Judged | null = null;
  for (const kind of versionKinds(core, found)) {
    const env = { actor, kind, target: { lane: laneId }, body: {}, ...(delegationId ? { delegation: delegationId } : {}) };
    j = judge(core.sql, env, "submitted", core.now(), doc, { kind, lane: laneId, ...(isPlatformKind(kind) ? {} : { binding: core.declaredBinding(kind) ?? "" }) });
    if (j.ok) break;
  }
  if (!j) return found ? refusal("wrong-thread", `No declared act makes versions on ${laneId}, a ${found.kind} thread.`, "Declare an act with step version whose threads name this kind.") : refusal("lane-unknown", `There is no lane ${laneId}.`, "Name an existing lane.");
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
  return authenticateHash(core, tokenHash(token));
}

/** As `authenticateRead`, from the token's hash: what a WebSocket keeps (R-API-12). */
export function authenticateHash(core: RoomCore, h: string): MemberId {
  const sql = core.sql;
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

/** A caller's authorization, as the MCP endpoint's `tools/list` asks for it (R-API-14). */
export interface CallerView {
  /** The current roster role of the member behind the token: under a delegation, the grantor's member. */
  readonly role: Role;
  /** The delegation the token's key acts under, with `kinds` and the signed map `acts` exactly as recorded. */
  readonly delegation?: { readonly kinds: readonly string[] | "*"; readonly acts?: GrantMap };
}

/**
 * The authorization behind a session or bearer token, judged now exactly as
 * a read judges the token (R-CRED-7, R-CRED-10). A read: it records nothing
 * and changes no grant. The signed map is returned as it was signed, stale
 * entries included; choosing what to list from it is the MCP server's.
 */
export function callerOf(core: RoomCore, token: string): CallerView {
  const h = tokenHash(token);
  const member = authenticateHash(core, h); // GM:caller-judged
  const sql = core.sql;
  const s = one(sql, "SELECT delegation FROM sessions WHERE hash = ?", h) ?? one(sql, "SELECT delegation FROM bearers WHERE hash = ?", h);
  const id = s ? str(s, "delegation") : null;
  const d = id ? delegation(sql, id) : null;
  if (!d) return { role: memberRow(sql, member)!.role };
  // Under a delegation the grantor's role decides, as it does at admission (R-ADM-5).
  const grantor = keyRow(sql, d.grantor);
  const m = grantor ? memberRow(sql, grantor.member) : null;
  if (!m || m.state !== "active") throw artroomError("unauthenticated", "The session or bearer token is not valid.");
  return { role: m.role, delegation: { kinds: d.kinds, ...(d.acts !== undefined ? { acts: d.acts } : {}) } }; // GM:caller-grant
}

// ------------------------------------------------------------ redemption (R-CRED-9)

/**
 * `redeem`. `address` is the client's address over HTTPS, or null for a
 * Worker calling over a service binding, which has none (src/ratelimit.ts).
 */
export async function redeem(core: RoomCore, input: unknown, address: string | null, mcpBase: string): Promise<Joined | Redeemed | Refusal> {
  try {
    checkRedemption(input, core.founded ? core.activePolicy().doc : undefined);
  } catch (e) {
    throw artroomError("bad-request", e instanceof ShapeError ? e.message : "The redemption is not valid.");
  }
  const r = input as { custody: "client"; join: SignedEnvelope } | { custody: "room"; invitation: InvitationId; secret: string };
  limitAddress(core, address);

  if (r.custody === "client") {
    const body = r.join.envelope.body as { op?: string };
    if (r.join.envelope.kind !== "roster" || body.op !== "join" || r.join.envelope.delegation !== undefined)
      throw artroomError("bad-request", "A client-custody redemption carries a signed join.");
    // The same admission as any act, on the `submitted` path (R-ADM-12), which counts the attempt against the
    // invitation's limit. A refused join records nothing (R-CRED-9, R-GEN-6).
    const out = await admit(core, r.join, "submitted");
    if (isRefusal(out.result)) return out.result;
    // A session only for a join this call admitted: the stored result of an earlier one is public in the log.
    if (out.replay)
      return refusal("invitation-invalid", `This join was already admitted, as ${out.result.id}, so its invitation is used.`, "Sign a session request with the key that joined.");
    const record = out.result as RosterRecord;
    const by = record.by as Extract<RosterRecord["by"], { via: "join" }>;
    return { custody: "client", member: by.member, role: by.role, key: by.key, record, session: newSession(core, by.member, by.key, null, 3600) };
  }
  limitInvitation(core, r.invitation);
  return redeemRoom(core, r.invitation, r.secret, mcpBase);
}

/**
 * What a room-custody session's delegation grants (R-CRED-3 as amended).
 * Under a `v1` document: the session's kinds, or `*`. Under a `v2` one: a
 * `v2` session's platform kinds and signed map, which the grant's admission
 * checks against the active bindings, so a stale one refuses the redemption
 * with `binding-stale` (R-DECL-17). An invitation with no `v2` session, new
 * or from before declared acts, grants no declared kind, only the delegable
 * platform kinds of what it covered: intersection, never acquisition.
 */
function sessionGrant(core: RoomCore, inv: NonNullable<ReturnType<typeof invitation>>): { kinds: readonly string[] | "*"; acts?: Readonly<Record<string, string>> } | { refusal: Refusal } {
  const policy = core.activePolicy();
  const doc = policy.doc as AnyPolicyDocument;
  const session = inv.session as (NonNullable<typeof inv.session> & { acts?: Readonly<Record<string, string>> }) | undefined;
  if (!isDeclared(doc)) {
    // A session signed under a v2 document, redeemed after the room returned to v1: no binding of its map is the active
    // one, so the redemption is refused binding-stale and the invitation stays unused (R-DECL-17). The map is never
    // dropped silently.
    const named = Object.keys(session?.acts ?? {});
    if (named.length > 0)
      return {
        refusal: refusal(
          "binding-stale",
          `The invitation's session was prepared for ${named[0]} as ${session!.acts![named[0]!]}; the room's active policy, version ${policy.version}, declares no acts.`,
          "Ask an admin to invite again.",
          { current: { policy: policy.version } },
        ), // G2:session-v1
      };
    // An invitation admitted under a v2 document never gains a kind by a later return to v1: with no session it
    // granted the delegable platform kinds of its role, and it still grants only those.
    if (inv.declared && session === undefined) { // G2:invitation-no-gain
      const role = inv.role ?? memberRow(core.sql, inv.member)?.role;
      return emptyUnderV1({ kinds: role ? DELEGABLE_PLATFORM.filter((k) => (delegableBy(role) as readonly string[]).includes(k)) : [] }, policy.version);
    }
    return emptyUnderV1({ kinds: session?.kinds ?? "*" }, policy.version);
  }
  if (session?.acts !== undefined) {
    // A kind the session's map names that the active document no longer declares: no binding of it is the active one,
    // so the redemption is binding-stale, as R-DECL-17 words it for a redemption, not the grant's kind-undeclared.
    const gone = Object.keys(session.acts).find((k) => core.declaredBinding(k) === null);
    if (gone !== undefined)
      return {
        refusal: refusal(
          "binding-stale",
          `The invitation's session was prepared for ${gone} as ${session.acts[gone]}; the room's active policy, version ${policy.version}, no longer declares ${gone}.`,
          "Ask an admin to invite again.",
          { current: { policy: policy.version } },
        ), // G2:session-retired
      };
    return { kinds: session.kinds as readonly string[], acts: session.acts }; // G2:session-map
  }
  const role = inv.role ?? memberRow(core.sql, inv.member)?.role;
  if (!role) return { kinds: [], acts: {} };
  const covered: readonly string[] = session === undefined || session.kinds === "*" ? delegableBy(role) : session.kinds;
  return { kinds: grantable(doc, role).platform.filter((k) => covered.includes(k)), acts: {} }; // G2:session-intersection
}

/**
 * Under a `v1` document a session's delegation must name at least one kind
 * (R-ADM-5). A session from a `v2` document may grant none there: a role
 * that may not sign `renew`, or a map with no kinds. It is refused with a
 * reason that says so, and the invitation stays unused, instead of failing
 * on the delegate's shape.
 */
function emptyUnderV1(grant: { kinds: readonly string[] | "*" }, version: string): { kinds: readonly string[] | "*" } | { refusal: Refusal } {
  if (grant.kinds === "*" || grant.kinds.length > 0) return grant;
  return {
    refusal: refusal(
      "delegation-invalid",
      `This invitation's session grants no kind under the room's active policy, version ${version}.`,
      "Ask an admin to invite again.",
    ), // G2:session-empty
  };
}

class Abort extends Error {
  constructor(readonly refusal: Refusal) {
    super("redemption refused at the final boundary");
  }
}

/**
 * Room-custody redemption (R-CRED-3, R-CRED-9, R-ADM-12), all or nothing.
 *
 * 1. Custody and secret are checked before any key is made.
 * 2. The `join` is decided on the `room-redemption` path; the `delegate` to
 *    the session key is decided on the state after the join, simulated and
 *    rolled back, with its policy evaluated outside any transaction.
 * 3. One synchronous transaction re-checks both at the final boundary, then
 *    seals the join and the delegate, stores the room-held keys and the
 *    bearer hash. A refusal or failure at any point records nothing, makes
 *    no key and leaves the invitation unused.
 */
async function redeemRoom(core: RoomCore, invitationId: InvitationId, secretText: string, mcpBase: string): Promise<Redeemed | Refusal> {
  const now = core.now();
  const inv = invitation(core.sql, invitationId);
  const secret = unb64url(secretText);
  if (!inv || inv.used !== undefined || inv.expiresMs <= now || !secret || digestBytes(secret) !== inv.secretHash)
    return refusal("invitation-invalid", "The invitation does not exist, was used, expired, or the secret does not match.", "Ask an admin for a new invitation.");
  if (inv.custody !== "room")
    return refusal(
      "custody-mismatch",
      "This invitation is for a key the client holds; it can be redeemed only with a join the client signs.",
      "Make a key, sign a join, and send it to redeem with custody client.",
    );
  const memberKey = newKeyPair();
  const sessionKey = newKeyPair();
  const ttl = inv.session?.ttlSeconds ?? 24 * 3600;
  const expiresMs = now + ttl * 1000;
  const signed = (env: Envelope): SignedEnvelope => ({ envelope: env, sig: sign(memberKey.seed, "artroom-envelope-v1", env) });
  const join = signed({
    v: 1,
    room: core.roomId,
    actor: memberKey.key,
    kind: "roster",
    target: null,
    body: { op: "join", invitation: inv.id, secret: secretText },
    idempotencyKey: `redeem-${randomToken().slice(0, 32)}`,
  });
  const grantKey = `session-${randomToken().slice(0, 32)}`;

  return core.serial(async () => {
    for (let attempt = 0; attempt < 6; attempt++) {
      core.expireDueSync();
      const snap = core.headSeq();
      // The session's grant, under the document in force at `snap`: an activation while this redemption waited in the
      // queue changes what the session may grant, and its shape. An activation after this moves the head, and the
      // attempt is made again.
      const granted = sessionGrant(core, inv);
      if ("refusal" in granted) return granted.refusal;
      const grant = signed({
        v: 1,
        room: core.roomId,
        actor: memberKey.key,
        kind: "roster",
        target: null,
        body: { op: "delegate", to: sessionKey.key, ...granted, lanes: "*", expiresAt: iso(expiresMs) } as never,
        idempotencyKey: grantKey,
      });
      const joinPlan = await decide(core, join, "room-redemption", {});
      if (joinPlan.t === "replay") throw artroomError("internal", "A fresh redemption key was already used.");
      if (joinPlan.t !== "accept") return joinPlan.refusal;
      // The delegate, as it would be judged after the join (simulated, then rolled back).
      const sim = core.simulate(() => {
        commit(core, joinPlan, {});
        const j = judge(core.sql, grant.envelope, "submitted", core.now(), core.activePolicy().doc);
        if (!j.ok) return { refusal: j.refusal } as const;
        const early = earlySteps(core, grant, "submitted", digestJson(grant.envelope), j.authority);
        if (early) return { refusal: early.t === "unrecorded" ? early.refusal : refusal("invalid-body", "The session grant was refused.") } as const;
        return { authority: j.authority, input: refuseApplies(grant.envelope, j.authority) ? refuseInput(core, grant.envelope, j.authority, null) : null } as const;
      });
      if ("refusal" in sim) return sim.refusal;
      let precomputed: NonNullable<DecideOptions["precomputed"]> = { input: null, refusal: null, evaluations: [] };
      if (sim.input) {
        const r = await core.ports.policy.refuse(core.activePolicy(), sim.input, { budget: core.ports.policy.actBudget(), recoveryKey: false });
        if (r.refusal) return r.refusal;
        precomputed = { input: sim.input, refusal: null, evaluations: r.evaluations };
      }
      const grantPlan = await decide(core, grant, "submitted", {}, { authority: sim.authority, precomputed });
      if (grantPlan.t !== "accept") return grantPlan.t === "replay" ? refusal("invalid-body", "The session grant was replayed.") : grantPlan.refusal;
      const bearer = `arb_${randomToken()}`;
      try {
        const out = core.sql.transaction(() => {
          if (core.headSeq() !== snap) throw new Moved();
          const late = finalBoundary(core, joinPlan);
          if (late) throw new Abort(late);
          const joined = commit(core, joinPlan, { heldKeys: [{ key: memberKey.key, seed: memberKey.seed, purpose: "member" }] });
          fault("redemption:after-join");
          const late2 = finalBoundary(core, grantPlan);
          if (late2) throw new Abort(late2);
          const delegated = commit(core, grantPlan, { heldKeys: [{ key: sessionKey.key, seed: sessionKey.seed, purpose: "session" }] });
          fault("redemption:after-delegate");
          core.sql.all("INSERT INTO bearers (hash, member, key, delegation, expires_ms) VALUES (?, ?, ?, ?, ?)", tokenHash(bearer), (joined.result as RosterRecord).by.member, sessionKey.key, delegated.id, expiresMs);
          return { joined: joined.result as RosterRecord, delegation: delegated.id };
        });
        core.committed();
        const by = out.joined.by as Extract<RosterRecord["by"], { via: "join" }>;
        // R-CRED-3 step 3: the bearer token is returned once; only its hash is stored.
        return {
          custody: "room",
          member: by.member,
          role: by.role,
          key: memberKey.key,
          delegation: out.delegation,
          bearer,
          expiresAt: iso(expiresMs),
          mcp: `${mcpBase}/v1/rooms/${core.roomId}/mcp` as `https://${string}`,
        };
      } catch (e) {
        if (e instanceof Moved) continue;
        if (e instanceof Abort) return e.refusal;
        throw e;
      }
    }
    throw artroomError("unavailable", "The room is busy. Retry the redemption.", { retryAfterMs: 100, maybeRecorded: false });
  });
}

// ------------------------------------------------------------ bearer acts (R-CRED-3 step 4)

/** An act for an MCP agent: signed by the bearer's session key, naming its delegation. */
/**
 * Judge a bearer token (R-CRED-10): an unknown or expired token, or a
 * revoked delegation or session key, is `unauthenticated` and nothing is
 * recorded. So after revocation even a retry of an earlier act is refused:
 * there is no envelope to replay.
 */
function judgeBearer(core: RoomCore, bearer: unknown): { readonly key: KeyId; readonly delegation: DelegationId; readonly seed: Uint8Array } {
  const fail = () => artroomError("unauthenticated", "The bearer token is not valid.");
  if (typeof bearer !== "string") throw fail();
  const row = one(core.sql, "SELECT * FROM bearers WHERE hash = ?", tokenHash(bearer));
  if (!row || num(row, "expires_ms")! <= core.now()) throw fail();
  const key = str(row, "key") as KeyId;
  const d = delegation(core.sql, str(row, "delegation")!);
  if (!d || d.revoked !== undefined || d.expiresMs <= core.now() || revocationOf(core.sql, key)) throw fail();
  const seed = core.heldSeed(key);
  if (!seed) throw fail();
  return { key, delegation: d.id, seed };
}

/**
 * An act for an MCP agent: the room sets `v`, its room ID, the actor (the
 * session key) and the delegation, signs with the session key, and admits it
 * on the `submitted` path (R-CRED-3 step 4, R-CRED-10). The same act and
 * idempotency key build the same bytes, so a retry gets the original result.
 */
export async function bearerAct(core: RoomCore, bearer: unknown, act: unknown): Promise<ActRecord | Refusal> {
  const b = judgeBearer(core, bearer);
  if (!isPlainObject(act) || Object.keys(act).some((k) => !["kind", "target", "body", "idempotencyKey", "binding"].includes(k)))
    throw artroomError("bad-request", "A bearer act has only kind, target, body, idempotencyKey and, for a declared kind, binding.");
  const a = act as Pick<Envelope, "kind" | "target" | "body" | "idempotencyKey"> & { binding?: unknown };
  // A retry of an act this session already made is built as it was built then, so the same act and key give the same
  // bytes and the original result, whatever the room's document is now (R-IDEM-2, R-DECL-16).
  const build = (v: 1 | 2 | null, binding: unknown): Envelope =>
    ({
      v: v ?? (binding === undefined ? 1 : 2),
      room: core.roomId,
      actor: b.key,
      kind: a.kind,
      ...(binding !== undefined ? { binding } : {}),
      target: a.target,
      body: a.body,
      idempotencyKey: a.idempotencyKey,
      delegation: b.delegation,
    }) as unknown as Envelope;
  const earlier = a.binding === undefined ? builtBefore(core, b.key, a.idempotencyKey, a.kind) : null; // G2:bearer-retry
  let env = build(null, a.binding !== undefined ? a.binding : builtFor(core, a.kind)); // G2:bearer-binding
  if (earlier) {
    // Built as it was then, it is a retry only if that gives the same bytes. If it does not, this is another act
    // under a used key: it stays built for the document in force, and admission answers idempotency-mismatch,
    // naming the original entry (R-IDEM-3), not a field the caller never sent.
    const again = build(earlier.v, earlier.binding);
    if (digestJson(again) === earlier.digest) env = again; // G2:bearer-same-act
  }
  return submit(core, { envelope: env, sig: sign(b.seed, "artroom-envelope-v1", env) }, "submitted");
}

/**
 * The envelope version and binding the room gave this session's earlier act
 * under the same idempotency key and kind, or null when there is none. The
 * recorded entry holds the envelope the room signed then.
 */
function builtBefore(core: RoomCore, key: string, ikey: unknown, kind: unknown): { readonly v: 1 | 2; readonly binding: string | undefined; readonly digest: string } | null {
  if (typeof ikey !== "string" || typeof kind !== "string") return null;
  const prior = one(core.sql, "SELECT seq, digest FROM idem WHERE actor = ? AND ikey = ?", key, ikey);
  const entry = prior ? entryAt(core.sql, num(prior, "seq")! as never) : null;
  if (!entry || entry.entry.type === "system") return null; // G2:bearer-refusal: an accepted act or a recorded refusal, both hold the envelope the room signed
  const env = entry.entry.act.envelope as unknown as { v: 1 | 2; kind: string; binding?: string };
  return env.kind === kind ? { v: env.v, binding: env.binding, digest: str(prior!, "digest")! } : null;
}

/**
 * The binding a bearer act carries when its caller gave none, in a `v2`
 * room (R-API-9 as amended): bearer acts come from the named MCP tools,
 * each built for one code-review declaration, so it is that declaration's
 * binding under this room's steps version and `lanes`. A room whose
 * declaration of the kind differs refuses the act: `delegation-invalid` at
 * step 4 when the session's grant names the room's own binding, and
 * `binding-stale` at step 4a when the grant names the code-review binding.
 * The room never gives an act the meaning its own declaration has.
 */
function builtFor(core: RoomCore, kind: unknown): string | undefined {
  const doc = core.activePolicy().doc as AnyPolicyDocument;
  if (!isDeclared(doc) || typeof kind !== "string" || isPlatformKind(kind) || !Object.hasOwn(CODE_REVIEW_ACTS, kind)) return undefined;
  return digestJson(bindingSubject({ ...doc, acts: CODE_REVIEW_ACTS }, kind)); // G2:bearer-builtfor
}

/** `workspace` or `workspace-token` for a bearer session, judged under its delegation (R-CRED-10, R-WS-2). */
export async function bearerRequest(core: RoomCore, bearer: unknown, req: unknown): Promise<WorkspaceOp | WorkspaceGrant | Refusal> {
  const b = judgeBearer(core, bearer);
  const body = isPlainObject(req) ? req : {};
  if (
    (body["kind"] !== "workspace" && body["kind"] !== "workspace-token") ||
    Object.keys(body).some((k) => !["kind", "lane", "lease"].includes(k)) ||
    typeof body["lane"] !== "string" ||
    !RE.actId.test(body["lane"]) ||
    !Number.isSafeInteger(body["lease"])
  )
    throw artroomError("bad-request", "A bearer request is workspace or workspace-token, with lane and lease.");
  return workspaceRequest(core, b.key, b.delegation, body as never);
}
