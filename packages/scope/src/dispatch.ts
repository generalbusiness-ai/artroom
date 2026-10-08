/** Original Git dispatch under the adopted executor records (4566/6f14505d).
 * This process-local boundary supplies no coordinator, activation or proof of
 * bundle/admission/capacity/drain correspondence. No production supplier exists.
 * A registered executor holds work until its trusted supplier provides those
 * prerequisites and an exact signed permit. Legacy Outside is not fenced. */
import type { Base64Url, Digest, FactRef, KeyId, OperationId, ScopeRef, Timestamp } from "@generalbusiness/artroom-contract";
import { canonicalBytes, canonicalize, digestBytes, isDigest, isFactRef, isKeyId, isOperationId, isRecord, isScopeRef, parseStrict, sign, taggedBytes, verify } from "@generalbusiness/artroom-bytes";
import { byteOrder, timeMs } from "@generalbusiness/artroom-derive";
import type { EffectAnswer, EffectRequest, Outside } from "./operations.ts";
import type { Store } from "./store.ts";

export interface OwnerKey { service: string; namespace: string; object: string; scope: ScopeRef; nonce: Digest; release: Digest; build: Digest }
export interface AttemptKey { scope: ScopeRef; origin: FactRef; operation: OperationId; attempt: number; binding: Digest }
export interface ProviderTarget { provider: Digest; repository: { host: string; namespace: string; name: string; id: string | null } }
export interface RequestIdentity { method: "POST" | "DELETE" | "ARTIFACTS_CREATE" | "ARTIFACTS_DELETE" | "ARTIFACTS_CREATE_TOKEN" | "ARTIFACTS_REVOKE_TOKEN"; path: string; publicBody: Digest | null; custodyFromSite: number | null }
export interface CallSitePlan {
  ordinal: number; site: "repository.create" | "repository.delete" | "credential.mint" | "credential.revoke" | "git.receive-pack" | "temporary-read.mint" | "temporary-read.revoke";
  role: "original" | "auxiliary-mint" | "owned-cleanup";
  target: { mode: "fixed"; value: ProviderTarget };
  ref: string | null;
  rights: { operation: "create" | "delete" | "read" | "write" | "revoke"; permissions: readonly { name: string; level: "read" | "write" }[] };
  absoluteLifetime: { notBefore: Timestamp; useBefore: Timestamp; requestedSeconds: number | null; maximumProviderEnds: Timestamp | null } | null;
  request: RequestIdentity; cleanupPredecessor: number | null;
}
export interface CallPlan { format: "artroom-dispatch-call-plan-1"; attempt: AttemptKey; admittedBy: Digest; sites: readonly CallSitePlan[] }
export interface PermitPayload {
  format: "artroom-send-permit-1"; service: string; generation: number; tuple: Digest;
  coordinator: { namespace: string; object: string; key: KeyId };
  owner: OwnerKey; attempt: AttemptKey; callPlan: Digest;
  purpose: "original-dispatch" | "auxiliary-read" | "owned-cleanup"; duty: Digest | null; targetResolution: Digest | null;
}
export interface SignedPermit { key: KeyId; payload: PermitPayload; sig: Base64Url }
export interface PhysicalInvocation {
  format: "artroom-physical-invocation-1"; attempt: AttemptKey; plan: Digest; siteOrdinal: number; auxiliaryOrdinal: number;
  purpose: "original-dispatch"; sourceDuty: null; originalOwner: OwnerKey;
}
export interface CallEntry {
  format: "artroom-dispatch-call-entry-1"; invocation: Digest; plan: Digest; siteOrdinal: number; auxiliaryOrdinal: number;
  permit: Digest; owner: OwnerKey; attempt: AttemptKey; duty: null; sourceDuty: null; request: RequestIdentity;
  cleanupHandle: null; mayStartAt: Timestamp; targetResolution: null;
}
export interface LocalClosureRecord {
  format: "artroom-dispatch-exclusion-1"; permit: Digest; owner: OwnerKey; attempt: AttemptKey; closedRevision: number;
  callEntries: readonly Digest[]; carriedDuties: readonly Digest[]; closed: true;
}
export interface OwnerClosedState { format: "artroom-owner-state-1"; permit: Digest; owner: OwnerKey; attempt: AttemptKey; closedRevision: number; exclusion: Digest; phase: "closed" }
export interface ClosurePayload { format: "artroom-owner-closure-1"; service: string; generation: number; tuple: Digest; permit: Digest; owner: OwnerKey; attempt: AttemptKey; closedRevision: number; localRecord: Digest; exclusion: Digest }
export interface OriginalRecord { permit: SignedPermit; plan: CallPlan; invocation: PhysicalInvocation; consumed: CallEntry | null; closure: LocalClosureRecord | null; revision: number }

/** Trusted loaded context, not a wire assertion or a ready/verified flag.
 * Supplier owns authentication of the actual active tuple, issuer/executor/
 * namespace, immutable binding/admission, bundle/ABI, reservations and original
 * executor exclusion. Shape/signature alone prove none of those prerequisites.
 * current is synchronous/local; issue may await its actual coordinator.
 * A legacy row requires explicit exact attribution/exclusion, never a current
 * settings guess. Missing/conflicting prerequisites return null, not a permit. */
export interface DispatchContext {
  service: string; generation: number; tuple: Digest; coordinator: PermitPayload["coordinator"];
  owner: OwnerKey; binding: Digest; admittedBy: Digest; provider: Digest;
}
export interface DispatchAuthority {
  current(request: EffectRequest): DispatchContext | null;
  issue(request: EffectRequest, plan: CallPlan): Promise<unknown>;
}
export interface PreparedOriginal { site: CallSitePlan; send(fence: OriginalFence): Promise<EffectAnswer | null> }
/** Registration carries the reviewed adapter, never just a fenced boolean.
 * Unsupported mutation paths return null and cannot fall back to Outside.send. */
export interface OriginalAdapter { prepare(request: EffectRequest, context: DispatchContext): Promise<PreparedOriginal | null> }
export interface DispatchRegistration { authority: DispatchAuthority | null; adapter: OriginalAdapter }
export type DispatchWiring = (outside: Outside, object: string) => DispatchRegistration | null;

const fields = (v: unknown, names: readonly string[]): v is Record<string, unknown> => isRecord(v) && Object.keys(v).length === names.length && names.every((name) => Object.hasOwn(v, name));
const text = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const integer = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const nullable = (v: unknown, check: (value: unknown) => boolean) => v === null || check(v);
const stamp = (v: unknown) => typeof v === "string" && timeMs(v) !== null;
export const sameDispatch = (a: unknown, b: unknown): boolean => canonicalize(a) === canonicalize(b);
export const dispatchId = (domain: string, value: unknown): Digest => digestBytes(taggedBytes(domain, canonicalBytes(value)));
const snapshot = <T>(v: T): T => parseStrict(canonicalize(v)) as T;

export function isOwnerKey(v: unknown): v is OwnerKey {
  return fields(v, ["service", "namespace", "object", "scope", "nonce", "release", "build"]) && text(v["service"]) && text(v["namespace"]) && text(v["object"]) && isScopeRef(v["scope"]) && isDigest(v["nonce"]) && isDigest(v["release"]) && isDigest(v["build"]);
}
export function isAttemptKey(v: unknown): v is AttemptKey {
  return fields(v, ["scope", "origin", "operation", "attempt", "binding"]) && isScopeRef(v["scope"]) && isFactRef(v["origin"]) && isOperationId(v["operation"]) && integer(v["attempt"]) && v["attempt"] > 0 && isDigest(v["binding"]) && sameDispatch(v["origin"].at, v["scope"]) && Number(v["operation"].split(":")[0]) === v["origin"].seq;
}
function coordinator(v: unknown): v is PermitPayload["coordinator"] { return fields(v, ["namespace", "object", "key"]) && text(v["namespace"]) && text(v["object"]) && isKeyId(v["key"]); }
export function isPermitPayload(v: unknown): v is PermitPayload {
  return fields(v, ["format", "service", "generation", "tuple", "coordinator", "owner", "attempt", "callPlan", "purpose", "duty", "targetResolution"])
    && v["format"] === "artroom-send-permit-1" && text(v["service"]) && integer(v["generation"]) && isDigest(v["tuple"]) && coordinator(v["coordinator"]) && isOwnerKey(v["owner"]) && isAttemptKey(v["attempt"]) && isDigest(v["callPlan"])
    && ["original-dispatch", "auxiliary-read", "owned-cleanup"].includes(v["purpose"] as string) && nullable(v["duty"], isDigest) && nullable(v["targetResolution"], isDigest);
}
export function isSignedPermit(v: unknown): v is SignedPermit {
  return fields(v, ["key", "payload", "sig"]) && isKeyId(v["key"]) && isPermitPayload(v["payload"]) && v["key"] === v["payload"].coordinator.key && verify(v["key"], v["sig"], taggedBytes("artroom-send-permit-1", canonicalBytes(v["payload"])));
}
export function signDispatchPermit(secret: Uint8Array, payload: PermitPayload): SignedPermit {
  return { key: payload.coordinator.key, payload, sig: sign(secret, taggedBytes("artroom-send-permit-1", canonicalBytes(payload))) };
}
function requestIdentity(v: unknown): v is RequestIdentity {
  return fields(v, ["method", "path", "publicBody", "custodyFromSite"]) && ["POST", "DELETE", "ARTIFACTS_CREATE", "ARTIFACTS_DELETE", "ARTIFACTS_CREATE_TOKEN", "ARTIFACTS_REVOKE_TOKEN"].includes(v["method"] as string) && text(v["path"]) && nullable(v["publicBody"], isDigest) && nullable(v["custodyFromSite"], integer);
}
export function isGitOriginalSite(v: unknown): v is CallSitePlan {
  if (!fields(v, ["ordinal", "site", "role", "target", "ref", "rights", "absoluteLifetime", "request", "cleanupPredecessor"]) || v["ordinal"] !== 0 || v["site"] !== "git.receive-pack" || v["role"] !== "original" || !fields(v["target"], ["mode", "value"]) || v["target"]["mode"] !== "fixed") return false;
  const target = v["target"]["value"];
  if (!fields(target, ["provider", "repository"]) || !isDigest(target["provider"]) || !fields(target["repository"], ["host", "namespace", "name", "id"]) || !Object.values(target["repository"]).every(text) || !text(v["ref"])) return false;
  const rights = v["rights"];
  if (!fields(rights, ["operation", "permissions"]) || rights["operation"] !== "write" || !Array.isArray(rights["permissions"])) return false;
  let previous = "";
  for (const permission of rights["permissions"]) {
    if (!fields(permission, ["name", "level"]) || !text(permission["name"]) || byteOrder(permission["name"], previous) <= 0 || !["read", "write"].includes(permission["level"] as string)) return false;
    previous = permission["name"];
  }
  const life = v["absoluteLifetime"];
  if (life !== null && (!fields(life, ["notBefore", "useBefore", "requestedSeconds", "maximumProviderEnds"]) || !stamp(life["notBefore"]) || !stamp(life["useBefore"]) || timeMs(life["notBefore"])! >= timeMs(life["useBefore"])! || !nullable(life["requestedSeconds"], integer) || !nullable(life["maximumProviderEnds"], stamp))) return false;
  return requestIdentity(v["request"]) && v["request"].method === "POST" && v["request"].custodyFromSite === null && v["cleanupPredecessor"] === null;
}
export function isCallPlan(v: unknown): v is CallPlan {
  return fields(v, ["format", "attempt", "admittedBy", "sites"]) && v["format"] === "artroom-dispatch-call-plan-1" && isAttemptKey(v["attempt"]) && isDigest(v["admittedBy"]) && Array.isArray(v["sites"]) && v["sites"].length === 1 && isGitOriginalSite(v["sites"][0]);
}
export function isDispatchContext(v: unknown): v is DispatchContext {
  return fields(v, ["service", "generation", "tuple", "coordinator", "owner", "binding", "admittedBy", "provider"]) && text(v["service"]) && integer(v["generation"]) && isDigest(v["tuple"]) && coordinator(v["coordinator"]) && isOwnerKey(v["owner"]) && v["owner"].service === v["service"] && isDigest(v["binding"]) && isDigest(v["admittedBy"]) && isDigest(v["provider"]);
}
/** Only the supported immutable original can enter the atomic mark. */
export function isInitialOriginalRecord(v: unknown): v is OriginalRecord {
  if (!fields(v, ["permit", "plan", "invocation", "consumed", "closure", "revision"]) || !isSignedPermit(v["permit"]) || !isCallPlan(v["plan"]) || v["consumed"] !== null || v["closure"] !== null || v["revision"] !== 0) return false;
  const p = v["permit"].payload;
  const i = v["invocation"];
  return p.purpose === "original-dispatch" && p.duty === null && p.targetResolution === null && p.service === p.owner.service && sameDispatch(p.owner.scope, p.attempt.scope) && sameDispatch(p.attempt, v["plan"].attempt) && p.callPlan === dispatchId("artroom-dispatch-call-plan-1", v["plan"])
    && fields(i, ["format", "attempt", "plan", "siteOrdinal", "auxiliaryOrdinal", "purpose", "sourceDuty", "originalOwner"]) && i["format"] === "artroom-physical-invocation-1" && sameDispatch(i["attempt"], p.attempt) && i["plan"] === p.callPlan && i["siteOrdinal"] === 0 && i["auxiliaryOrdinal"] === 0 && i["purpose"] === p.purpose && i["sourceDuty"] === null && sameDispatch(i["originalOwner"], p.owner);
}

const issued = new WeakSet<object>();
export class DispatchHeld extends Error { override readonly name = "DispatchHeld"; constructor() { super("original dispatch held"); } }
/** Opaque process-local capability. It is never returned by a public RPC. */
export class OriginalFence {
  readonly #store: Store; readonly #authority: DispatchAuthority; readonly #request: EffectRequest; readonly #record: OriginalRecord; readonly #clock: () => Timestamp;
  private constructor(store: Store, authority: DispatchAuthority, request: EffectRequest, record: OriginalRecord, clock: () => Timestamp) { this.#store = store; this.#authority = authority; this.#request = request; this.#record = record; this.#clock = clock; issued.add(this); }
  /** Only validated signed/cross-bound records create the capability. */
  static async prepare(store: Store, registration: DispatchRegistration | null, object: string, request: EffectRequest, clock: () => Timestamp): Promise<{ fence: OriginalFence; send: PreparedOriginal["send"] } | null> {
    try {
      const authority = registration?.authority;
      if (!authority || !registration) return null;
      const context = snapshot(authority.current(request));
      if (!isDispatchContext(context) || context.owner.object !== object || !sameDispatch(context.owner.scope, request.scope) || !store.acceptDispatchGeneration(context)) return null;
      const prepared = await registration.adapter.prepare(request, context);
      if (!prepared || !isGitOriginalSite(prepared.site) || prepared.site.target.value.provider !== context.provider) return null;
      const attempt: AttemptKey = { scope: request.scope, origin: { at: request.scope, seq: request.origin.entry.seq, hash: request.origin.hash }, operation: request.operation, attempt: request.attempt, binding: context.binding };
      const plan: CallPlan = snapshot({ format: "artroom-dispatch-call-plan-1", attempt, admittedBy: context.admittedBy, sites: [prepared.site] });
      if (!isCallPlan(plan)) return null;
      const claim = snapshot(await authority.issue(request, plan));
      const current = snapshot(authority.current(request));
      if (!isSignedPermit(claim) || !isDispatchContext(current) || !sameDispatch(context, current) || !store.acceptDispatchGeneration(current)) return null;
      const p = claim.payload;
      if (p.service !== context.service || p.generation !== context.generation || p.tuple !== context.tuple || !sameDispatch(p.coordinator, context.coordinator) || !sameDispatch(p.owner, context.owner) || !sameDispatch(p.attempt, attempt) || p.callPlan !== dispatchId("artroom-dispatch-call-plan-1", plan) || p.purpose !== "original-dispatch" || p.duty !== null || p.targetResolution !== null) return null;
      const reading = timeMs(clock());
      const life = plan.sites[0]!.absoluteLifetime;
      if (reading === null || (life && (reading < timeMs(life.notBefore)! || reading >= timeMs(life.useBefore)!))) return null;
      const invocation: PhysicalInvocation = { format: "artroom-physical-invocation-1", attempt, plan: p.callPlan, siteOrdinal: 0, auxiliaryOrdinal: 0, purpose: "original-dispatch", sourceDuty: null, originalOwner: p.owner };
      const record: OriginalRecord = { permit: claim, plan, invocation, consumed: null, closure: null, revision: 0 };
      return { fence: new OriginalFence(store, authority, request, record, clock), send: prepared.send };
    } catch { return null; }
  }
  /** Atomically install original ownership and the irreversible ledger mark. */
  mark(at: Timestamp, next: number): boolean {
    try { return this.#current() && this.#store.markOriginalDispatch(this.#record, at, next); }
    catch { return false; }
  }
  #current(): boolean {
    const current = this.#authority.current(this.#request);
    const p = this.#record.permit.payload;
    return isDispatchContext(current) && this.#store.acceptDispatchGeneration(current) && sameDispatch(current.owner, p.owner) && current.service === p.service && sameDispatch(current.coordinator, p.coordinator) && current.tuple === p.tuple && current.generation === p.generation && current.binding === this.#record.plan.attempt.binding && current.admittedBy === this.#record.plan.admittedBy && current.provider === this.#record.plan.sites[0]!.target.value.provider;
  }
  /** Called only by the registered terminal adapter, immediately beside fetch.
   * Current destination/custody checks are separate and remain in that adapter.
   * No awaited coordinator/readback and no asynchronous callback lives here. */
  consume(actual: RequestIdentity): void {
    if (!this.#current() || !sameDispatch(actual, this.#record.plan.sites[0]!.request)) throw new DispatchHeld();
    const at = this.#clock();
    const life = this.#record.plan.sites[0]!.absoluteLifetime;
    if (timeMs(at) === null || (life && (timeMs(at)! < timeMs(life.notBefore)! || timeMs(at)! >= timeMs(life.useBefore)!))) throw new DispatchHeld();
    const entry: CallEntry = { format: "artroom-dispatch-call-entry-1", invocation: dispatchId("artroom-physical-invocation-1", this.#record.invocation), plan: this.#record.invocation.plan, siteOrdinal: 0, auxiliaryOrdinal: 0, permit: dispatchId("artroom-send-permit-1", this.#record.permit.payload), owner: this.#record.permit.payload.owner, attempt: this.#record.invocation.attempt, duty: null, sourceDuty: null, request: actual, cleanupHandle: null, mayStartAt: at, targetResolution: null };
    if (!this.#store.consumeOriginalDispatch(this.#record, entry)) throw new DispatchHeld();
  }
}
export function requireOriginalFence(value: unknown): asserts value is OriginalFence { if (!value || typeof value !== "object" || !issued.has(value)) throw new DispatchHeld(); }
