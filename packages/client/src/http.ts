/**
 * The transport over a scope service's HTTP routes. Every body is JSON, and
 * every answer's body is the contract's own answer; the status code says
 * the same thing in HTTP's terms and is not read. A reader that is a text
 * is sent as the `Authorization` header.
 */

import type { ScopeApi } from "@generalbusiness/artroom-contract";
import { TransportError, type Transport } from "./handle.ts";

/** The little of `fetch` this package uses. The global `fetch` of Node, workerd and a browser satisfies it. */
export type Fetch = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ status: number; text(): Promise<string> }>;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** `service` is the service's base URL. `fetch` replaces the runtime's own. */
export function httpTransport(service: string, options: { fetch?: Fetch } = {}): Transport {
  const base = `${service.replace(/\/+$/, "")}/v1/scopes`;
  const part = encodeURIComponent;

  /** One request. `field` is the member every answer of that route has: `answer` for a founding or an act, `ok` for a read. */
  async function call<T>(field: "answer" | "ok", path: string, reader: unknown, body?: unknown): Promise<T> {
    const send = options.fetch ?? (globalThis as { fetch?: Fetch }).fetch;
    if (!send) throw new TransportError("this runtime has no fetch");
    const headers: Record<string, string> = { ...(typeof reader === "string" ? { authorization: reader } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) };
    let status: number;
    let text: string;
    try {
      const response = await send(`${base}${path}`, body === undefined ? { method: "GET", headers } : { method: "POST", headers, body: JSON.stringify(body) });
      status = response.status;
      text = await response.text();
    } catch (error) {
      throw new TransportError(`no reply: ${error instanceof Error ? error.message : String(error)}`);
    }
    let answer: unknown;
    try {
      answer = JSON.parse(text);
    } catch {
      answer = null;
    }
    if (!isObject(answer) || !(field in answer)) throw new TransportError(`the reply, status ${status}, is not an answer`);
    return answer as T;
  }
  const page = (cursor: string | undefined): string => (cursor === undefined ? "" : `?cursor=${part(cursor)}`);
  type Answered<K extends keyof ScopeApi> = Awaited<ReturnType<ScopeApi[K]>>;

  return {
    found: (founding, definition, definitions = []) => call<Answered<"found">>("answer", "", null, { founding, definition, definitions }),
    submit: (scope, signed, grants) => call<Answered<"submit">>("answer", `/${part(scope)}/acts`, null, { signed, grants }),
    settle: (scope, signed) => call<Answered<"settle">>("ok", `/${part(scope)}/settle`, null, { signed }),
    summary: (scope, reader) => call<Answered<"summary">>("ok", `/${part(scope)}`, reader),
    items: (scope, reader, type, cursor) => call<Answered<"items">>("ok", `/${part(scope)}/items/${part(type)}${page(cursor)}`, reader),
    history: (scope, reader, cursor) => call<Answered<"history">>("ok", `/${part(scope)}/history${page(cursor)}`, reader),
    entry: (scope, reader, seq) => call<Answered<"entry">>("ok", `/${part(scope)}/entries/${seq}`, reader),
    outbox: (scope, reader, cursor) => call<Answered<"outbox">>("ok", `/${part(scope)}/outbox${page(cursor)}`, reader),
    duty: (scope, reader, duty) => call<Answered<"duty">>("ok", `/${part(scope)}/outbox/${part(duty)}`, reader),
    log: (scope, reader, cursor) => call<Answered<"log">>("ok", `/${part(scope)}/log${page(cursor)}`, reader),
    retained: (scope, reader, kind, digest) => call<Answered<"retained">>("ok", `/${part(scope)}/retained/${part(kind)}/${part(digest)}`, reader),
  };
}
