/**
 * The transport over a scope service's HTTP routes. Every body is JSON, and
 * every answer's body is the contract's own answer; the status code says
 * the same thing in HTTP's terms and is not read. A reader that is a text
 * is sent as the `Authorization` header.
 *
 * A reply is untrusted until it is checked: a body that is not one of the
 * answers of its operation, with what that answer must carry
 * (`answers.ts`), is a `TransportError` and never an outcome.
 */

import type { ScopeApi } from "@generalbusiness/artroom-contract";
import { ANSWERS } from "./answers.ts";
import { TransportError, type Transport } from "./handle.ts";

/** The little of `fetch` this package uses. The global `fetch` of Node, workerd and a browser satisfies it. */
export type Fetch = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ status: number; text(): Promise<string> }>;

/** `service` is the service's base URL. `fetch` replaces the runtime's own. */
export function httpTransport(service: string, options: { fetch?: Fetch } = {}): Transport {
  const base = `${service.replace(/\/+$/, "")}/v1/scopes`;
  const part = encodeURIComponent;

  type Answered<K extends keyof ScopeApi> = Awaited<ReturnType<ScopeApi[K]>>;

  /** One request of operation `op`. Its reply is returned only when it is an answer of that operation. */
  async function call<K extends keyof ScopeApi>(op: K, path: string, reader: unknown, body?: unknown): Promise<Answered<K>> {
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
    if (!ANSWERS[op](answer)) throw new TransportError(`the reply, status ${status}, is not an answer of ${op}`);
    return answer as Answered<K>;
  }
  const page = (cursor: string | undefined): string => (cursor === undefined ? "" : `?cursor=${part(cursor)}`);

  return {
    found: (founding, definition, definitions = []) => call("found", "", null, { founding, definition, definitions }),
    submit: (scope, signed, grants) => call("submit", `/${part(scope)}/acts`, null, { signed, grants }),
    settle: (scope, signed) => call("settle", `/${part(scope)}/settle`, null, { signed }),
    summary: (scope, reader) => call("summary", `/${part(scope)}`, reader),
    items: (scope, reader, type, cursor) => call("items", `/${part(scope)}/items/${part(type)}${page(cursor)}`, reader),
    history: (scope, reader, cursor) => call("history", `/${part(scope)}/history${page(cursor)}`, reader),
    entry: (scope, reader, seq) => call("entry", `/${part(scope)}/entries/${seq}`, reader),
    outbox: (scope, reader, cursor) => call("outbox", `/${part(scope)}/outbox${page(cursor)}`, reader),
    duty: (scope, reader, duty) => call("duty", `/${part(scope)}/outbox/${part(duty)}`, reader),
    log: (scope, reader, cursor) => call("log", `/${part(scope)}/log${page(cursor)}`, reader),
    retained: (scope, reader, kind, digest) => call("retained", `/${part(scope)}/retained/${part(kind)}/${part(digest)}`, reader),
  };
}
