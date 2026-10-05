/**
 * Taking in bytes from a party that is not trusted: a reply's body is read
 * as raw bytes, chunk by chunk, only as far as the caller allows, and one
 * exchange is given a deadline. Nothing here decodes or parses. A client's
 * HTTP transport and a verifier's HTTP source both read through these two
 * functions, so there is one bounded reader.
 */

/** A reply's body, as the little of a byte stream these packages use. The body of a `fetch` response in Node, workerd and a browser satisfies it. */
export interface ByteStream { getReader(): { read(): Promise<{ done: boolean; value?: Uint8Array | undefined }>; cancel(): Promise<unknown> } }

/**
 * The bytes of `body`, when they are at most `most`. At the chunk that
 * passes `most` the body is cancelled and the result is null: the bytes
 * read so far are dropped, and nothing was joined, decoded or parsed.
 */
export async function takeBytes(body: ByteStream, most: number): Promise<Uint8Array | null> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    bytes += value.byteLength;
    if (bytes > most) {
      // The cancellation is not awaited: a body that will not end need not answer it either.
      void reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(bytes);
  chunks.reduce((at, chunk) => (all.set(chunk, at), at + chunk.byteLength), 0);
  return all;
}

/** What `within` returns when the deadline passed first. */
export const LATE: unique symbol = Symbol("late");

/**
 * `run`, given at most `seconds`. `run` receives an abort signal to pass to
 * `fetch`. When the deadline passes first the signal is aborted, which
 * cancels the request and its body in a runtime's own `fetch`, and the
 * result is `LATE`. A rejection of `run`, early or late, is the caller's to
 * catch or is dropped; none is left unhandled.
 */
export async function within<T>(seconds: number, run: (signal: unknown) => Promise<T>): Promise<T | typeof LATE> {
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<typeof LATE>((resolve) => { timer = setTimeout(() => resolve(LATE), seconds * 1000); });
  try {
    const got = await Promise.race([run(abort.signal), late]);
    if (got === LATE) abort.abort();
    return got;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
