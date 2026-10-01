/**
 * Lane L's log push, over the publisher's one push implementation.
 *
 * `GitOps.pushLog` returns the publisher's own four-way outcome (landed,
 * rejected, error, unknown; push-outcome.ts). Lane L's `GitRemote.push`
 * answers with its `PushOutcome`, which has three cases. The mapping keeps
 * the rule that only a confirmed answer is ever reported as settled:
 * - landed: `{ ok: true }` (lane L still reads the ref back);
 * - rejected by the lease, with the ref's current value read back:
 *   `lease-mismatch`;
 * - everything else, including `error` (nothing was sent) and a lease
 *   refusal whose current value could not be read: `unknown`, with the
 *   detail. Lane L then reads the ref back to decide.
 */

import type { Sha } from "@generalbusiness/artroom-contract";
import type { PushOutcome } from "./push-outcome.ts";
import { LOG_REF, type LogObject } from "./gitops.ts";

/**
 * Lane L's `PushOutcome` (packages/log, src/git.ts), restated here so this
 * package does not type-check lane L's sources. The tests check that the
 * two are the same type, both ways.
 */
export type LogPushOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "lease-mismatch"; readonly current: Sha | null }
  | { readonly ok: false; readonly reason: "unknown"; readonly detail: string };

const TOKEN = /art_v\d+_[A-Za-z0-9_]+(\?expires=\d+)?/g;

export function toLogOutcome(r: { readonly outcome: PushOutcome; readonly current?: string | null }): LogPushOutcome {
  const o = r.outcome;
  if (o.outcome === "landed") return { ok: true };
  if (o.outcome === "rejected" && o.reason === "lease" && r.current !== undefined) {
    return { ok: false, reason: "lease-mismatch", current: (r.current ?? null) as Sha | null };
  }
  const what = o.outcome === "error" ? "nothing was sent" : o.outcome === "rejected" ? `refused (${o.reason})` : "no clear answer";
  return { ok: false, reason: "unknown", detail: `${what}: ${o.detail}`.replace(TOKEN, "<token>").slice(0, 600) };
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

export const LOG_PUSH_LIMITS = { objects: 100_000, bytes: 64 * 1024 * 1024 } as const;

/**
 * Check and decode a `pushLog` request before anything touches git. A
 * request this refuses sends nothing; the answer is `unknown` (lane L's
 * only "not settled" case), and lane L reads the ref back.
 */
export function decodeLogPush(req: LogPushRequest): { readonly objects: LogObject[] } | { readonly refused: LogPushOutcome } {
  const refuse = (detail: string) => ({ refused: { ok: false, reason: "unknown", detail: `nothing was sent: ${detail}` } as const });
  if (req.ref !== LOG_REF) return refuse(`pushLog writes only ${LOG_REF}`);
  if (!/^[0-9a-f]{40}$/.test(req.next)) return refuse("next is not a commit id");
  if (req.lease !== null && !/^[0-9a-f]{40}$/.test(req.lease)) return refuse("the lease is not a commit id");
  if (!Array.isArray(req.objects) || req.objects.length > LOG_PUSH_LIMITS.objects) return refuse("too many objects");
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
    if (bytes > LOG_PUSH_LIMITS.bytes) return refuse("objects over 64 MiB");
    objects.push({ type: o.type, data });
  }
  return { objects };
}
