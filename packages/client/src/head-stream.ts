/** Existing native head stream over HTTP. Notices invalidate reads; they are neither entries nor command outcomes. */
import type { Head, ScopeRef } from "@generalbusiness/artroom-contract";
import { isHead, isScopeRef, parseStrictBytes, takeBytes, type ByteStream, type Expiry } from "@generalbusiness/artroom-bytes";
import type { Session } from "./session.ts";
import type { Fetch } from "./http.ts";

export type HeadBodyResult = { ok: true; body: ByteStream } | { ok: false; reason: "forbidden" | "sessions-unavailable" | "clock-behind" | "unavailable" | "unsupported" };
export const HEAD_FRAME_BYTES = 1024;
/** Exact HTTP origin, excluding userinfo, path, query and fragment. Native URL parsing belongs to the caller's supported runtime. */
export function observationOrigin(origin: string): boolean {
  return /^https?:\/\/(?:[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?|\[[0-9a-f:]+\])(?::[0-9]{1,5})?$/.test(origin);
}
/** Caller supplies the existing session; no key/token enters a URL, error or persisted record. */
export async function openHttpHeadStream(origin: string, scope: ScopeRef, session: Session, signal: Expiry, options: { fetch?: Fetch } = {}): Promise<HeadBodyResult> {
  if (!observationOrigin(origin) || !isScopeRef(scope)) return { ok: false, reason: "unsupported" };
  const fetch = options.fetch ?? (globalThis as { fetch?: Fetch }).fetch;
  if (!fetch) return { ok: false, reason: "unsupported" };
  const response = await fetch(`${origin}/v1/scopes/${encodeURIComponent(scope.scope)}/stream`, { method: "GET", headers: { authorization: session.reader() }, signal: signal as never });
  if (signal.aborted) { if (response.body) void response.body.getReader().cancel().catch(() => undefined); return { ok: false, reason: "unavailable" }; }
  if (response.status === 200 && response.body) return { ok: true, body: response.body };
  if (response.status === 404 || response.status === 405 || response.status === 501) { if (response.body) void response.body.getReader().cancel().catch(() => undefined); return { ok: false, reason: "unsupported" }; }
  const bytes = response.body ? await takeBytes(response.body, HEAD_FRAME_BYTES, signal) : null;
  if (!(bytes instanceof Uint8Array)) return { ok: false, reason: "unavailable" };
  try { const value = parseStrictBytes(bytes) as { ok?: unknown; reason?: unknown }; if (value.ok === false && Object.keys(value).length === 2 && ["forbidden", "sessions-unavailable", "clock-behind", "unavailable"].includes(String(value.reason))) return value as HeadBodyResult; } catch { /* Unknown response is unavailable, never a fabricated head. */ }
  return { ok: false, reason: "unavailable" };
}

/** Raw-byte bound before decode/parse. No whole-stream buffer or queued heads. */
export async function* headLines(body: ByteStream, signal: Expiry): AsyncGenerator<Head> {
  const reader = body.getReader(); let pending: number[] = []; let stopped = false; let cancelled = false;
  const cancel = () => { if (cancelled) return; cancelled = true; void reader.cancel().catch(() => undefined); };
  let abort!: () => void;
  const end = new Promise<{ done: true }>(resolve => { abort = () => { stopped = true; pending = []; cancel(); resolve({ done: true }); }; });
  signal.addEventListener("abort", abort);
  try {
    for (;;) {
      if (signal.aborted || stopped) return;
      const read = await Promise.race([reader.read(), end]);
      if (signal.aborted || stopped) return;
      if (read.done) { if (pending.length) throw new Error("Truncated native head frame."); return; }
      const chunk = read.value;
      if (!chunk?.length) { await new Promise<void>(resolve => { setTimeout(resolve, 0); }); continue; }
      for (const byte of chunk) {
        if (signal.aborted || stopped) return;
        if (byte !== 10) { if (pending.length >= HEAD_FRAME_BYTES) throw new Error("Native head frame exceeds its byte bound."); pending.push(byte); continue; }
        const value: unknown = parseStrictBytes(Uint8Array.from(pending)); pending = [];
        if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== 1 || !("at" in value) || !isHead(value.at)) throw new Error("Malformed native head frame.");
        yield value.at;
      }
    }
  } finally { signal.removeEventListener("abort", abort); stopped = true; pending = []; cancel(); }
}
