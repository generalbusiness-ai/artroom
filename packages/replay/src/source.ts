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

import { DOMAINS } from "@generalbusiness/artroom-contract";
import type { Digest, Head, RetainedInput, ScopeId, ScopeRef } from "@generalbusiness/artroom-contract";
import { digestOfHash, sha256, utf8 } from "@generalbusiness/artroom-bytes";
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

/** Why a read gave nothing. `not-found`: the source answered, and it holds none. Anything else: it could not be read. */
export interface Unread { ok: false; reason: string }

export interface HistorySource {
  /** A page of the entries of a scope, from `from` on. */
  page(scope: ScopeId, from: number): Promise<{ ok: true; page: Page } | Unread>;
  /** One retained input of a scope, by kind and digest. */
  retained(scope: ScopeId, kind: RetainedInput["kind"], digest: Digest): Promise<{ ok: true; input: RetainedInput } | Unread>;
}

/** The hash of an entry, from its stored bytes alone: SHA-256 over the entry domain's tag, a newline, and the bytes (section 2.1). */
export function hashOfBytes(bytes: string): Digest {
  return digestOfHash(sha256(utf8(`${DOMAINS.entry}\n${bytes}`)));
}

// ---------------------------------------------------------------- over HTTP

/** The little of `fetch` this package uses. The global `fetch` of Node, workerd and a browser satisfies it. */
export type Fetch = (url: string, init?: { method?: string; headers?: Record<string, string> }) => Promise<{ status: number; text(): Promise<string> }>;

const unread = (reason: string): Unread => ({ ok: false, reason });
const isHead = (v: unknown): v is Head => isObject(v) && isLocalId(v["seq"]) && typeof v["hash"] === "string";

/**
 * A source over a scope service's read routes: `GET
 * /v1/scopes/:scope/log?cursor=` and `GET
 * /v1/scopes/:scope/retained/:kind/:digest`. `reader` is sent as the
 * `Authorization` header. A response that is not the route's JSON answer is
 * read as `unavailable`.
 */
export function httpSource(service: string, options: { fetch?: Fetch; reader?: string } = {}): HistorySource {
  const base = service.replace(/\/+$/, "");
  const send = options.fetch ?? (globalThis as { fetch?: Fetch }).fetch;
  const get = async (path: string): Promise<Record<string, unknown> | Unread> => {
    if (!send) return unread("unavailable");
    try {
      const response = await send(`${base}${path}`, { method: "GET", headers: options.reader === undefined ? {} : { authorization: options.reader } });
      const body: unknown = JSON.parse(await response.text());
      if (!isObject(body) || typeof body["ok"] !== "boolean") return unread("unavailable");
      if (!body["ok"]) return unread(typeof body["reason"] === "string" ? body["reason"] : "unavailable");
      return body;
    } catch {
      return unread("unavailable");
    }
  };
  return {
    async page(scope, from) {
      const body = await get(`/v1/scopes/${scope}/log?cursor=${from}`);
      if (body["ok"] === false) return body as Unread;
      const { at, value, complete, next } = body as Record<string, unknown>;
      if (!isHead(at) || !isObject(value) || !isScopeRef(value["scope"]) || !Array.isArray(value["entries"])) return unread("unavailable");
      const entries: Stored[] = [];
      for (const e of value["entries"] as unknown[]) {
        if (!isObject(e) || !isLocalId(e["seq"]) || typeof e["bytes"] !== "string" || typeof e["hash"] !== "string") return unread("unavailable");
        entries.push({ seq: e["seq"], hash: e["hash"] as Digest, bytes: e["bytes"] });
      }
      const more = complete === false && typeof next === "string" && /^(0|[1-9][0-9]{0,15})$/.test(next);
      return { ok: true, page: { scope: value["scope"], head: at, entries, next: more ? Number(next) : null } };
    },
    async retained(scope, kind, digest) {
      const body = await get(`/v1/scopes/${scope}/retained/${kind}/${encodeURIComponent(digest)}`);
      if (body["ok"] === false) return body as Unread;
      const value = (body as Record<string, unknown>)["value"];
      if (!isObject(value) || typeof value["bytes"] !== "string" || (value["under"] !== undefined && typeof value["under"] !== "string")) return unread("unavailable");
      return { ok: true, input: { kind, digest, bytes: value["bytes"], ...(value["under"] === undefined ? {} : { under: value["under"] }) } };
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

  page(scope: ScopeId, from: number): Promise<{ ok: true; page: Page } | Unread> {
    const held = this.scopes.get(scope);
    const last = held?.entries.at(-1);
    if (!held || !last) return Promise.resolve(unread("not-found"));
    const entries = held.entries.slice(from, from + this.pageSize);
    const next = from + entries.length < held.entries.length ? from + entries.length : null;
    return Promise.resolve({ ok: true, page: { scope: held.scope, head: { seq: last.seq, hash: last.hash }, entries, next } });
  }

  retained(scope: ScopeId, kind: RetainedInput["kind"], digest: Digest): Promise<{ ok: true; input: RetainedInput } | Unread> {
    const input = this.scopes.get(scope)?.retained.find((r) => r.kind === kind && r.digest === digest);
    return Promise.resolve(input ? { ok: true, input } : unread("not-found"));
  }
}
