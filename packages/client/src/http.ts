/**
 * The transport over a scope service's HTTP routes. Every body is JSON, and
 * every answer's body is the contract's own answer; the status code says
 * the same thing in HTTP's terms and is not read. A reader that is a text
 * is sent as the `Authorization` header.
 *
 * A reply is untrusted until it is checked. Its body is read as raw bytes,
 * chunk by chunk, by the bytes package's bounded reader: at the chunk that
 * passes `bytes` the body is cancelled, and nothing of it is joined,
 * decoded or parsed. One request, with its whole reply, has `seconds`;
 * after that it is aborted. A body that is not one of the answers of its
 * operation, with what that answer must carry (`answers.ts`), is no
 * outcome either. Each of these is a `TransportError`.
 *
 * A `TransportError` never says that nothing was recorded. For a founding
 * or an act it says the outcome of the submitted intent is unknown, and
 * that the same signed intent may be sent again.
 */

import type { ScopeApi } from "@generalbusiness/artroom-contract";
import { LATE, takeBytes, within, type ByteStream } from "@generalbusiness/artroom-bytes";
import { ANSWERS } from "./answers.ts";
import { TransportError, type Transport } from "./handle.ts";

/** The little of `fetch` this package uses. The global `fetch` of Node, workerd and a browser satisfies it. */
export type Fetch = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: never }) => Promise<{ status: number; body: ByteStream | null }>;

/**
 * The most raw bytes one reply may be: 4 MiB. Temporary. The contract bounds
 * a history page and a retained input at 1 MiB of entry bytes, and a JSON
 * reply escapes the text it carries, so this is four times that, as the
 * replay package allows its own reads.
 */
export const REPLY_BYTES = 4 * 1024 * 1024;
/** How long one request and its reply may take, in seconds, before it is given up and aborted. Temporary. */
export const REPLY_SECONDS = 30;

/** What a caller is told with every failure of an operation that submits an intent. */
const UNKNOWN = "The outcome of the submitted intent is unknown: it may have been recorded. The same signed intent may be sent again.";

/** `service` is the service's base URL. `fetch` replaces the runtime's own. `bytes` and `seconds` replace `REPLY_BYTES` and `REPLY_SECONDS`. */
export function httpTransport(service: string, options: { fetch?: Fetch; bytes?: number; seconds?: number } = {}): Transport {
  const base = `${service.replace(/\/+$/, "")}/v1/scopes`;
  const part = encodeURIComponent;
  const most = options.bytes ?? REPLY_BYTES;
  const seconds = options.seconds ?? REPLY_SECONDS;

  type Answered<K extends keyof ScopeApi> = Awaited<ReturnType<ScopeApi[K]>>;

  /** One request of operation `op`. Its reply is returned only when it is an answer of that operation. */
  async function call<K extends keyof ScopeApi>(op: K, path: string, reader: unknown, body?: unknown): Promise<Answered<K>> {
    // A founding and an act submit an intent, and a failure leaves its outcome unknown. A read changes nothing.
    const failed = (what: string) => new TransportError(op === "found" || op === "submit" ? `${what}. ${UNKNOWN}` : `${what}. Nothing was read; the read may be made again.`);
    const send = options.fetch ?? (globalThis as { fetch?: Fetch }).fetch;
    if (!send) throw new TransportError("this runtime has no fetch; nothing was sent");
    const headers: Record<string, string> = { ...(typeof reader === "string" ? { authorization: reader } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) };
    let got: { status: number; bytes: Uint8Array | null } | typeof LATE;
    try {
      got = await within(seconds, async (signal) => {
        const response = await send(`${base}${path}`, { ...(body === undefined ? { method: "GET", headers } : { method: "POST", headers, body: JSON.stringify(body) }), signal: signal as never });
        return { status: response.status, bytes: response.body ? await takeBytes(response.body, most) : new Uint8Array(0) };
      });
    } catch (error) {
      throw failed(`no reply: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (got === LATE) throw failed(`no whole reply within ${seconds} seconds; the request was aborted`);
    if (got.bytes === null) throw failed(`the reply, status ${got.status}, is longer than ${most} bytes and was not read`);
    let answer: unknown;
    try {
      answer = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(got.bytes));
    } catch {
      answer = null;
    }
    if (!ANSWERS[op](answer)) throw failed(`the reply, status ${got.status}, is not an answer of ${op}`);
    return answer;
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
