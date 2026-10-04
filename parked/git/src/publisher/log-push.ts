/**
 * Lane L's log push, over the publisher's one push implementation.
 *
 * `GitOps.pushLog` returns the publisher's own four-way outcome (landed,
 * rejected, error, unknown; push-outcome.ts). Lane L's `GitRemote.push`
 * answers with its `PushOutcome`, which has four cases. The mapping keeps
 * the rule that only a confirmed answer is ever reported as settled:
 * - landed: `{ ok: true }` (lane L still reads the ref back);
 * - rejected by the lease, with the ref's current value read back:
 *   `lease-mismatch`;
 * - rejected otherwise (a `[rejected]` or `[remote rejected]` status, or an
 *   Artifacts code given before any ref update, such as
 *   `artifacts_git_receive_pack_object_too_large`): `refused`, with the
 *   Artifacts code or the kind of status as `code` (contract amendment 4,
 *   R-LOG-20). Lane L reads the ref back, and does not push again;
 * - everything else, including `error` (nothing was sent) and a lease
 *   refusal whose current value could not be read: `unknown`, with the
 *   detail. Lane L then reads the ref back to decide.
 */

import type { Sha } from "@generalbusiness/artroom-contract";
import { artifactsRefusal, type PushOutcome } from "./push-outcome.ts";
import { LOG_REF, type LogObject, type StageChunk, type StageResult, type StageWant } from "./gitops.ts";

/**
 * Lane L's `PushOutcome` (packages/log, src/git.ts), restated here so this
 * package does not type-check lane L's sources. The tests check that the
 * two are the same type, both ways.
 */
export type LogPushOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "lease-mismatch"; readonly current: Sha | null }
  | { readonly ok: false; readonly reason: "unknown"; readonly detail: string }
  | { readonly ok: false; readonly reason: "refused"; readonly code: string; readonly detail: string };

const TOKEN = /art_v\d+_[A-Za-z0-9_]+(\?expires=\d+)?/g;

export function toLogOutcome(r: { readonly outcome: PushOutcome; readonly current?: string | null }): LogPushOutcome {
  const o = r.outcome;
  if (o.outcome === "landed") return { ok: true };
  if (o.outcome === "rejected" && o.reason === "lease" && r.current !== undefined) {
    return { ok: false, reason: "lease-mismatch", current: (r.current ?? null) as Sha | null };
  }
  const clean = (text: string) => text.replace(TOKEN, "<token>").slice(0, 600);
  if (o.outcome === "rejected" && o.reason !== "lease") return { ok: false, reason: "refused", code: artifactsRefusal(o.detail) ?? o.reason, detail: clean(o.detail) };
  const what = o.outcome === "error" ? "nothing was sent" : o.outcome === "rejected" ? `refused (${o.reason})` : "no clear answer";
  return { ok: false, reason: "unknown", detail: clean(`${what}: ${o.detail}`) };
}

/** Unpadded base64url, as lane A's log remote sends object data. */
export function fromB64url(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new Error("not base64url");
  const s = atob(text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

export function toB64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Lane A's `pushLog` request, as it crosses the Durable Object RPC boundary. */
export interface LogPushRequest {
  readonly objects: readonly { readonly type: string; readonly data: string }[];
  readonly ref: string;
  readonly next: string;
  readonly lease: string | null;
}

/**
 * One push's bound: objects and decoded bytes. Lane L's publisher sends
 * only the objects its lease does not hold and checks the same bound
 * before pushing (`LOG_TRANSFER_LIMITS`, error `cohort-too-large`), so the
 * bound limits one cohort, never the accumulated log.
 */
export const LOG_PUSH_LIMITS: { readonly objects: number; readonly bytes: number } = Object.freeze({ objects: 100_000, bytes: 8 * 1024 * 1024 });

/**
 * Check and decode a `pushLog` request before anything touches git. A
 * request this refuses sends nothing; the answer is `unknown` (lane L's
 * only "not settled" case), and lane L reads the ref back.
 */
export function decodeLogPush(req: LogPushRequest, limits: { readonly objects: number; readonly bytes: number } = LOG_PUSH_LIMITS): { readonly objects: LogObject[] } | { readonly refused: LogPushOutcome } {
  const refuse = (detail: string) => ({ refused: { ok: false, reason: "unknown", detail: `nothing was sent: ${detail}` } as const });
  if (req.ref !== LOG_REF) return refuse(`pushLog writes only ${LOG_REF}`);
  if (!/^[0-9a-f]{40}$/.test(req.next)) return refuse("next is not a commit id");
  if (req.lease !== null && !/^[0-9a-f]{40}$/.test(req.lease)) return refuse("the lease is not a commit id");
  if (!Array.isArray(req.objects)) return refuse("objects is not a list");
  if (req.objects.length > limits.objects) return refuse(`cohort too large: ${req.objects.length} objects, over ${limits.objects} in one push`);
  const objects: LogObject[] = [];
  let bytes = 0;
  for (const o of req.objects) {
    if (o.type !== "blob" && o.type !== "tree" && o.type !== "commit") return refuse("an object has an unknown type");
    let data: Uint8Array;
    try {
      data = fromB64url(o.data);
    } catch {
      return refuse("an object is not base64url");
    }
    bytes += data.length;
    if (bytes > limits.bytes) return refuse(`cohort too large: over ${limits.bytes} bytes in one push`);
    objects.push({ type: o.type, data });
  }
  return { objects };
}

/** Lane A's `stageLog` request, as it crosses the Durable Object RPC boundary. */
export interface LogStageRequest {
  readonly cohort: string;
  readonly want: readonly { readonly sha: string; readonly type: string; readonly size: number }[];
  readonly parts: readonly { readonly sha: string; readonly type: string; readonly size: number; readonly offset: number; readonly data: string }[];
}

/**
 * Check and decode a `stageLog` request before anything touches git: at
 * most `limits.objects` wanted objects and parts, and `limits.bytes` of
 * part data, in one call.
 */
export function decodeLogStage(
  req: LogStageRequest,
  limits: { readonly objects: number; readonly bytes: number } = LOG_PUSH_LIMITS,
): { readonly cohort: string; readonly want: StageWant[]; readonly parts: StageChunk[] } | { readonly refused: StageResult } {
  const refuse = (detail: string) => ({ refused: { ok: false, detail: `nothing was staged: ${detail}` } as const });
  const sha = (s: unknown) => typeof s === "string" && /^[0-9a-f]{40}$/.test(s);
  const type = (t: unknown): t is LogObject["type"] => t === "blob" || t === "tree" || t === "commit";
  const size = (n: unknown) => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
  if (!sha(req.cohort)) return refuse("the cohort is not a commit id");
  if (!Array.isArray(req.want) || !Array.isArray(req.parts)) return refuse("want and parts must be lists");
  if (req.want.length > limits.objects || req.parts.length > limits.objects) return refuse(`over ${limits.objects} objects in one call`);
  const want: StageWant[] = [];
  for (const w of req.want) {
    if (!sha(w.sha) || !type(w.type) || !size(w.size)) return refuse("a wanted object is not an id, a type and a size");
    want.push({ sha: w.sha, type: w.type, size: w.size });
  }
  const parts: StageChunk[] = [];
  let bytes = 0;
  for (const p of req.parts) {
    if (!sha(p.sha) || !type(p.type) || !size(p.size) || !size(p.offset)) return refuse("a part is not an id, a type, a size and an offset");
    let data: Uint8Array;
    try {
      data = fromB64url(p.data);
    } catch {
      return refuse("a part is not base64url");
    }
    bytes += data.length;
    if (bytes > limits.bytes) return refuse(`over ${limits.bytes} bytes in one call`);
    parts.push({ sha: p.sha, type: p.type, size: p.size, offset: p.offset, data });
  }
  return { cohort: req.cohort, want, parts };
}
