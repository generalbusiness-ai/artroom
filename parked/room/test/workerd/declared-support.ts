/**
 * Helpers for the declared-acts tests (requests fd6f00b6 and a5d64b35): rooms
 * with a `v1` or a `v2` document, and envelopes the tests sign themselves,
 * binding included, so that a test can send a stale one on purpose.
 */

import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import type { ActDeclaration, ActRecord, PolicyDocument, PolicyDocumentV2, Redeemed, Refusal, Role, RosterRecord, SignedEnvelope } from "@generalbusiness/artroom-contract";
import { CODE_REVIEW_ACTS, codeReviewPolicy, policy, requireReview } from "@generalbusiness/artroom-policy";
import type { Room } from "../../src/index.ts";
import { b64url, call, Client, clock, day, digestBytes, expectOk, iso, makeRoom, randomBytes, sign, type TestRoom } from "./support.ts";

export const LEASE = 1800 * 1000;
export const inDO = <T>(r: TestRoom, fn: (room: Room) => T | Promise<T>) => runInDurableObject(r.stub as unknown as DurableObjectStub<Room>, fn);

/** A `v2` document: the default fields and the code-review declarations, with `change` applied to the acts. */
export function v2(change: (acts: Record<string, ActDeclaration>) => void = () => {}, base: PolicyDocument = policy()): PolicyDocumentV2 {
  const acts = structuredClone(CODE_REVIEW_ACTS) as Record<string, ActDeclaration>;
  change(acts);
  return { ...codeReviewPolicy(base), acts };
}

export const declaredRoom = (doc: PolicyDocumentV2 = v2()) => makeRoom({ policy: doc as unknown as PolicyDocument });

/** The active declaration's binding of a kind, as the room computes it. */
export const bindingIn = (r: TestRoom, kind: string) => inDO(r, (room) => room.core.declaredBinding(kind));

/** Activate a document directly, as a landing's `policy-activated` would (R-POL-9). */
export async function activate(r: TestRoom, doc: PolicyDocument | PolicyDocumentV2): Promise<void> {
  await inDO(r, (room) => room.core.sql.transaction(() => room.core.activate(doc, room.core.activePolicy().checkers, null, iso(clock.now))));
}

export const headSeq = (r: TestRoom) => inDO(r, (room) => room.core.headSeq());

/** The room's object aborted, as after an eviction or a restart, and a fresh stub to it (job-token-mint.test.ts). */
export async function restarted(before: TestRoom): Promise<TestRoom> {
  await runInDurableObject(before.stub as unknown as DurableObjectStub<Room>, (_room: Room, state: DurableObjectState) => state.abort("restart")).catch(() => undefined);
  const stub = env.ROOMS.get(env.ROOMS.idFromName(before.id)) as unknown as TestRoom["stub"];
  return { ...before, stub, admin: new Client({ id: before.id, stub }, before.admin.keys) };
}

export interface Signing {
  /** `v: 2` with this binding; `null` signs `v: 1` with none; absent, the active binding. */
  readonly binding?: string | null;
  readonly v?: number;
  readonly ikey?: string;
}

/** An envelope this test signs itself: the harness never converts it. */
export async function signed(r: TestRoom, c: Client, kind: string, target: unknown, body: unknown, s: Signing = {}): Promise<SignedEnvelope> {
  const binding = s.binding === undefined ? await bindingIn(r, kind) : s.binding;
  const envelope = {
    v: s.v ?? (binding === null ? 1 : 2),
    room: r.id,
    actor: c.key,
    kind,
    ...(binding !== null ? { binding } : {}),
    target,
    body,
    idempotencyKey: s.ikey ?? b64url(randomBytes(12)),
    ...(c.delegation ? { delegation: c.delegation } : {}),
  };
  return { envelope, sig: sign(c.keys.seed, "artroom-envelope-v1", envelope) } as unknown as SignedEnvelope;
}

export async function act<T extends ActRecord = ActRecord>(r: TestRoom, c: Client, kind: string, target: unknown, body: unknown, s: Signing = {}): Promise<T | Refusal> {
  return call<T | Refusal>(r.stub.submit(await signed(r, c, kind, target, body, s)));
}

export async function ok<T extends ActRecord = ActRecord>(r: TestRoom, c: Client, kind: string, target: unknown, body: unknown, s: Signing = {}): Promise<T> {
  return expectOk(await act<T>(r, c, kind, target, body, s));
}

/** What a thread's row records of its opening (R-DECL-6, R-DECL-9), and when its lease ends. */
export const laneRowOf = (r: TestRoom, lane: string) =>
  inDO(r, (room) => room.core.sql.all("SELECT kind, binding, lease_ms, expires_ms, purpose, conflict FROM lanes WHERE id = ?", lane)[0] as { kind: string; binding: string | null; lease_ms: number | null; expires_ms: number | null; purpose: string; conflict: string | null });

/** A recorded entry, as the room sealed it. */
export const entryOf = (r: TestRoom, id: string) =>
  inDO(r, (room) => JSON.parse(String(room.core.sql.all("SELECT body FROM entries WHERE id = ?", id)[0]!["body"])) as { entry: { act?: { envelope: Record<string, unknown> }; receipt?: { effects: Record<string, unknown>[]; refusal?: Refusal } } });

/** The policy most tests land under: a change under `src/**` needs an admin's review. */
export const reviewed = (): PolicyDocument => policy(requireReview({ paths: "src/**", from: "role:admin", id: "rv" }));

/** A landing operation's state, and why it stopped. */
export const landing = (r: TestRoom, op: string) =>
  inDO(r, (room) => {
    const v = room.core.landing.view(op as never) as unknown as { state: string; reason?: string; fix?: string };
    return { state: v.state, reason: v.reason, fix: v.fix };
  });

/** A room thread, as the room opens one for a revert (R-REV-6). Returns its ID. */
export const revertLane = (r: TestRoom, scope = "lib/**") =>
  inDO(r, (room) => room.core.sql.transaction(() => String(room.core.host().record({ type: "revert-lane", of: "op_land_1" as never, scope: [scope], reason: "abort-after-landing" } as never).act)));

/** A delegate op with a signed map (R-DECL-17). */
export const delegateOp = (to: string, acts: Record<string, string>, kinds: readonly string[] = []) => ({ op: "delegate", to, kinds, acts, lanes: "*", expiresAt: iso(clock.now + day) });

/** A room-custody invitation, signed `v: 1` by the admin, and its redemption (R-CRED-3). `role` is left out for a member who exists. */
export async function invited(r: TestRoom, member: string, role: Role | null, session?: { kinds: readonly string[] | "*"; acts?: Readonly<Record<string, string>> }) {
  const bytes = randomBytes(32);
  const op = { op: "invite", member, ...(role ? { role } : {}), custody: "room", expiresAt: iso(clock.now + day), secretHash: digestBytes(bytes), ...(session ? { session: { ...session, lanes: "*", ttlSeconds: 3600 } } : {}) };
  const inv = await ok<RosterRecord>(r, r.admin as Client, "roster", null, op, { binding: null });
  const secret = b64url(bytes);
  return {
    id: inv.id,
    secret,
    redeem: () => call<Redeemed | Refusal>(r.stub.redeem({ custody: "room", invitation: inv.id, secret }, "x")),
    unused: () => inDO(r, (room) => room.core.sql.all("SELECT used FROM invitations WHERE id = ?", inv.id)[0]!["used"] === null),
  };
}

/** A redeemed room-custody session: the bearer an MCP agent gets. */
export async function bearer(r: TestRoom, member: string, role: Role | null, session?: { kinds: readonly string[] | "*"; acts?: Readonly<Record<string, string>> }): Promise<Redeemed> {
  return expectOk(await (await invited(r, member, role, session)).redeem());
}

/** A delegation as the members read shows it. */
export const delegationOf = async (r: TestRoom, id: string) => (await (r.admin as Client).read({ q: "members" })).delegations.find((x) => x.id === id)!;
