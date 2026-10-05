/**
 * Taking in bytes from a party that is not trusted: a reply's body is read
 * as raw bytes, chunk by chunk, only as far as the caller allows, and one
 * exchange is given a deadline. Nothing here decodes or parses. A client's
 * HTTP transport and a verifier's HTTP source both read through these two
 * functions, so there is one bounded reader.
 *
 * What the reader guarantees is about what it holds itself. When the
 * exchange expires it starts no read, keeps no chunk, joins nothing and
 * returns `LATE`, so its caller decodes and parses nothing. What it cannot
 * do is stop the other party. It aborts the signal and asks the body to
 * cancel, and it waits for neither. A `fetch` that ignores the signal, or a
 * body that ignores the cancellation, may keep its own buffers and its
 * connection for as long as it likes: those are that implementation's, and
 * outside this reader's control.
 */

/** A reply's body, as the little of a byte stream these packages use. The body of a `fetch` response in Node, workerd and a browser satisfies it. */
export interface ByteStream { getReader(): { read(): Promise<{ done: boolean; value?: Uint8Array | undefined }>; cancel(): Promise<unknown> } }

/** Whether one exchange has expired, as the little of an abort signal the reader uses. The signal of an `AbortController` satisfies it. */
export interface Expiry { readonly aborted: boolean; addEventListener(type: "abort", listener: () => void): void; removeEventListener(type: "abort", listener: () => void): void }

/** What `within` returns when the deadline passed first, and what `takeBytes` returns when its exchange expired. */
export const LATE: unique symbol = Symbol("late");

/** Ask a body to stop. Not awaited, and a failure is dropped: a body that will not end need not answer this either. */
function cancel(reader: () => ReturnType<ByteStream["getReader"]>): void {
  try {
    void reader().cancel().catch(() => undefined);
  } catch {
    // A body that cannot be cancelled is its owner's to release.
  }
}

/**
 * The bytes of `body`, when they are at most `most` and `exchange` has not
 * expired.
 *
 * - At the chunk that passes `most` the body is cancelled and the result is
 *   null: the bytes read so far are dropped, and nothing was joined.
 * - When `exchange` is already expired, as when a response arrives after
 *   its deadline, no read is started: the body is asked to cancel and the
 *   result is `LATE`.
 * - When `exchange` expires during the reading, the chunks held are
 *   dropped, the body is asked to cancel, and the result is `LATE` at once.
 *   A read that was pending is not waited for; when it answers, what it
 *   answers is not kept, and no other read follows it.
 * - An empty chunk is not kept. It uses none of `most`, so it is the
 *   deadline that ends a body of empty chunks. After one, the next read
 *   waits a turn of the timer queue, so that a body which answers every
 *   read at once cannot keep the deadline's timer from running.
 */
export async function takeBytes(body: ByteStream, most: number, exchange: Expiry): Promise<Uint8Array | null | typeof LATE> {
  if (exchange.aborted) {
    cancel(() => body.getReader());
    return LATE;
  }
  const reader = body.getReader();
  let chunks: Uint8Array[] = [];
  let bytes = 0;
  let expire = (): void => undefined;
  const expired = new Promise<typeof LATE>((resolve) => {
    expire = () => {
      chunks = [];
      cancel(() => reader);
      resolve(LATE);
    };
  });
  exchange.addEventListener("abort", expire);
  try {
    for (;;) {
      if (exchange.aborted) return LATE;
      const got = await Promise.race([reader.read(), expired]);
      // The check comes before anything of the read is kept.
      if (got === LATE || exchange.aborted) return LATE;
      if (got.done || !got.value) break;
      if (got.value.byteLength === 0) {
        await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
        continue;
      }
      bytes += got.value.byteLength;
      if (bytes > most) {
        cancel(() => reader);
        return null;
      }
      chunks.push(got.value);
    }
    const all = new Uint8Array(bytes);
    chunks.reduce((at, chunk) => (all.set(chunk, at), at + chunk.byteLength), 0);
    return all;
  } finally {
    exchange.removeEventListener("abort", expire);
  }
}

/**
 * `run`, given at most `seconds`. `run` receives the exchange's abort
 * signal, to pass to `fetch` and to `takeBytes`. When the deadline passes
 * first the result is `LATE` and the signal is aborted in the same turn,
 * which cancels the request and its body in a runtime's own `fetch` and
 * stops `takeBytes`. `run` itself is not stopped: what it does after the
 * deadline is dropped, so it must do nothing with a `LATE` from
 * `takeBytes`. A rejection of `run`, early or late, is the caller's to
 * catch or is dropped; none is left unhandled.
 */
export async function within<T>(seconds: number, run: (signal: Expiry) => Promise<T>): Promise<T | typeof LATE> {
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<typeof LATE>((resolve) => {
    timer = setTimeout(() => {
      resolve(LATE);
      abort.abort();
    }, seconds * 1000);
  });
  try {
    return await Promise.race([run(abort.signal), late]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
