/**
 * Helpers for the declared-acts stage 2 tests (request fd6f00b6): rooms with
 * a `v1` or a `v2` document, and envelopes the tests sign themselves, binding
 * included, which the harness never converts.
 */

import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import type { ActDeclaration, ActRecord, PolicyDocument, PolicyDocumentV2, Refusal, SignedEnvelope } from "@generalbusiness/artroom-contract";
import { CODE_REVIEW_ACTS, codeReviewPolicy, policy } from "@generalbusiness/artroom-policy";
import type { Room } from "../../src/index.ts";
import { b64url, call, Client, clock, expectOk, iso, makeRoom, randomBytes, sign, type TestRoom } from "./support.ts";

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

export const laneRowOf = (r: TestRoom, lane: string) =>
  inDO(r, (room) => room.core.sql.all("SELECT kind, binding, lease_ms, expires_ms, purpose FROM lanes WHERE id = ?", lane)[0] as { kind: string; binding: string | null; lease_ms: number | null; expires_ms: number | null; purpose: string });

