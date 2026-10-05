/**
 * What a verifier reads (scope contract, sections 9.2 and 9.4): for a scope,
 * its entries in order, each as its canonical bytes, and the inputs those
 * entries name by digest and do not carry. A retained input is a
 * definition's declaration, a foreign entry of some `uses`, or the input of
 * a rule evaluation. A delivered message and a rule's result are inside the
 * entry that records them.
 *
 * Everything read through a source is untrusted. The verifier hashes bytes
 * before it reads their content, and checks every statement the source
 * makes about a scope against the scope's own entries.
 */

import { DOMAINS, HISTORY_PAGE_BYTES, HISTORY_PAGE_ENTRIES, RETAINED_INPUT_BYTES } from "@generalbusiness/artroom-contract";
import type { Digest, Head, RetainedInput, ScopeId, ScopeRef } from "@generalbusiness/artroom-contract";
import { LATE, digestOfHash, positionOf, sha256, takeBytes, utf8, within, type ByteStream, type Expiry } from "@generalbusiness/artroom-bytes";
import { isLocalId, isObject, isScopeRef } from "@generalbusiness/artroom-derive";

/** One entry as stored: its canonical JSON text, and the hash the source gives for it. */
export interface Stored { seq: number; hash: Digest; bytes: string }

/**
 * A page of one scope's entries, in order from the sequence number asked
 * for. `scope` and `head` are the source's statements: what the scope is,
 * and the head the page was read at. `next`: where the next page begins, or
 * null when this page reaches the head.
 */
export interface Page { scope: ScopeRef; head: Head; entries: readonly Stored[]; next: number | null }

/**
 * Why a read gave nothing. `not-found`: the source answered, and it holds
 * none. `too-large`: the reply was past what the read was allowed to take
 * in, and was not taken in. `timeout`: no whole reply came within the
 * deadline. Anything else: it could not be read.
 */
export interface Unread { ok: false; reason: string }

/**
 * What one read may take in. Everything a source returns is untrusted, so
 * the caller says how much of it there may be before any of it is held.
 * `bytes`: the raw bytes of the reply, as they arrive, before decoding.
 * `entries`: the entries of one page.
 */
export interface Allow { bytes: number; entries: number }

/** The most one read takes in, whatever the caller allows: raw reply bytes, and entries of a page. A JSON reply escapes the text it carries, so the byte numbers are four times the contract's bounds on a history page and on a retained input. */
export const PAGE_REPLY_BYTES = 4 * HISTORY_PAGE_BYTES;
export const RETAINED_REPLY_BYTES = 4 * RETAINED_INPUT_BYTES;
export const PAGE_ENTRIES = HISTORY_PAGE_ENTRIES;
/** How long one read may take, in seconds, before it is given up and cancelled. This package's choice, and temporary. */
export const READ_SECONDS = 30;

export interface HistorySource {
  /** A page of the entries of a scope, from `from` on: `from`, `from + 1` and so on. `bytes`: the raw bytes that were read for it. */
  page(scope: ScopeId, from: number, allow: Allow): Promise<{ ok: true; page: Page; bytes: number } | Unread>;
  /** One retained input of a scope, by kind and digest. `bytes`: the raw bytes that were read for it. */
  retained(scope: ScopeId, kind: RetainedInput["kind"], digest: Digest, allow: Pick<Allow, "bytes">): Promise<{ ok: true; input: RetainedInput; bytes: number } | Unread>;
}

/** The hash of an entry, from its stored bytes alone: SHA-256 over the entry domain's tag, a newline, and the bytes (section 2.1). */
export function hashOfBytes(bytes: string): Digest {
  return digestOfHash(sha256(utf8(`${DOMAINS.entry}\n${bytes}`)));
}

// ---------------------------------------------------------------- over HTTP

/** A reply's body: the byte stream the bytes package's bounded reader takes. */
export type Body = ByteStream;

/** The little of `fetch` this package uses. The global `fetch` of Node, workerd and a browser satisfies it. */
export type Fetch = (url: string, init?: { method?: string; headers?: Record<string, string>; signal?: never }) => Promise<{ status: number; body: Body | null }>;

const unread = (reason: string): Unread => ({ ok: false, reason });
const isHead = (v: unknown): v is Head => isObject(v) && isLocalId(v["seq"]) && typeof v["hash"] === "string";

/**
 * A source over a scope service's read routes: `GET
 * /v1/scopes/:scope/log?cursor=` and `GET
 * /v1/scopes/:scope/retained/:kind/:digest`. `reader` is sent as the
 * `Authorization` header.
 *
 * A reply is read as raw bytes, chunk by chunk, by the bytes package's
 * bounded reader (`takeBytes` and `within`), which the client's HTTP
 * transport uses too. At the chunk that passes what the read may take in,
 * the body is cancelled and the read is `too-large`: nothing of it is
 * decoded, parsed or kept. A read that has no
 * whole reply after `seconds` is aborted and is `timeout`: the reader
 * starts no read and keeps no chunk after that, and nothing is decoded or
 * parsed. A `fetch` that ignores the abort signal may keep its own buffers
 * and its connection; that is outside this source's control. A reply that is
 * not UTF-8, or not the route's JSON answer, is `unavailable`.
 */
export function httpSource(service: string, options: { fetch?: Fetch; reader?: string; seconds?: number } = {}): HistorySource {
  const base = service.replace(/\/+$/, "");
  const send = options.fetch ?? (globalThis as { fetch?: Fetch }).fetch;
  const seconds = options.seconds ?? READ_SECONDS;
  const get = async (path: string, most: number): Promise<{ body: Record<string, unknown>; bytes: number } | Unread> => {
    if (!send) return unread("unavailable");
    const read = async (signal: Expiry): Promise<{ body: Record<string, unknown>; bytes: number } | Unread> => {
      const response = await send(`${base}${path}`, { method: "GET", headers: options.reader === undefined ? {} : { authorization: options.reader }, signal: signal as never });
      if (!response.body) return unread("unavailable");
      const all = await takeBytes(response.body, most, signal);
      // The read expired: its result is already `timeout`, and nothing is decoded or parsed here.
      if (all === LATE) return unread("timeout");
      if (!all) return unread("too-large");
      const body: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(all));
      if (!isObject(body) || typeof body["ok"] !== "boolean") return unread("unavailable");
      if (!body["ok"]) return unread(typeof body["reason"] === "string" ? body["reason"] : "unavailable");
      return { body, bytes: all.byteLength };
    };
    try {
      const got = await within(seconds, read);
      return got === LATE ? unread("timeout") : got;
    } catch {
      return unread("unavailable");
    }
  };
  return {
    async page(scope, from, allow) {
      const got = await get(`/v1/scopes/${scope}/log?cursor=${from}`, Math.min(allow.bytes, PAGE_REPLY_BYTES));
      if (!("body" in got)) return got;
      const { at, value, complete, next } = got.body;
      if (!isHead(at) || !isObject(value) || !isScopeRef(value["scope"]) || !Array.isArray(value["entries"])) return unread("unavailable");
      if (value["entries"].length > Math.min(allow.entries, PAGE_ENTRIES)) return unread("too-large");
      const entries: Stored[] = [];
      for (const e of value["entries"] as unknown[]) {
        if (!isObject(e) || !isLocalId(e["seq"]) || typeof e["bytes"] !== "string" || typeof e["hash"] !== "string") return unread("unavailable");
        entries.push({ seq: e["seq"], hash: e["hash"] as Digest, bytes: e["bytes"] });
      }
      return { ok: true, page: { scope: value["scope"], head: at, entries, next: complete === false ? positionOf(next) : null }, bytes: got.bytes };
    },
    async retained(scope, kind, digest, allow) {
      const got = await get(`/v1/scopes/${scope}/retained/${kind}/${encodeURIComponent(digest)}`, Math.min(allow.bytes, RETAINED_REPLY_BYTES));
      if (!("body" in got)) return got;
      const value = got.body["value"];
      if (!isObject(value) || typeof value["bytes"] !== "string" || (value["under"] !== undefined && typeof value["under"] !== "string")) return unread("unavailable");
      return { ok: true, input: { kind, digest, bytes: value["bytes"], ...(value["under"] === undefined ? {} : { under: value["under"] }) }, bytes: got.bytes };
    },
  };
}

// ---------------------------------------------------------------- in memory

/** One scope as a source in memory holds it. A test copies one and changes the copy. */
export interface MemoryScope { scope: ScopeRef; entries: Stored[]; retained: RetainedInput[] }

/** A source over histories held in memory, for tests and for a caller that has already read them. `pageSize` entries to a page. */
export class MemorySource implements HistorySource {
  readonly scopes = new Map<ScopeId, MemoryScope>();
  readonly pageSize: number;

  constructor(scopes: Iterable<MemoryScope> = [], pageSize = 200) {
    for (const s of scopes) this.scopes.set(s.scope.scope, s);
    this.pageSize = pageSize;
  }

  /** The bytes of what a read returns: for a source in memory, the UTF-8 bytes of the texts it holds. */
  page(scope: ScopeId, from: number, allow: Allow): Promise<{ ok: true; page: Page; bytes: number } | Unread> {
    const held = this.scopes.get(scope);
    const last = held?.entries.at(-1);
    if (!held || !last) return Promise.resolve(unread("not-found"));
    const entries = held.entries.slice(from, from + Math.min(this.pageSize, allow.entries, PAGE_ENTRIES));
    const bytes = entries.reduce((sum, e) => sum + utf8(e.bytes).length, 0);
    if (bytes > allow.bytes) return Promise.resolve(unread("too-large"));
    const next = from + entries.length < held.entries.length ? from + entries.length : null;
    return Promise.resolve({ ok: true, page: { scope: held.scope, head: { seq: last.seq, hash: last.hash }, entries, next }, bytes });
  }

  retained(scope: ScopeId, kind: RetainedInput["kind"], digest: Digest, allow: Pick<Allow, "bytes">): Promise<{ ok: true; input: RetainedInput; bytes: number } | Unread> {
    const input = this.scopes.get(scope)?.retained.find((r) => r.kind === kind && r.digest === digest);
    if (!input) return Promise.resolve(unread("not-found"));
    const bytes = utf8(input.bytes).length;
    return Promise.resolve(bytes > allow.bytes ? unread("too-large") : { ok: true, input, bytes });
  }
}
