/**
 * Review 17013617, P2 (client): the RPC update decoder's stream lifecycle
 * (R-API-8), tested with native streams. The pipe owns the source; the
 * caller owns the decoded stream. Cancel ends the subscription with or
 * without a reader; failures are ArtroomErrors.
 */

import { describe, expect, test } from "vitest";
import type { ByteStream, Update } from "@generalbusiness/artroom-contract";
import { isArtroomError } from "../src/index.ts";
import { decodeUpdates } from "../src/room.ts";

/** A native stream as the contract's structural `ByteStream` (TypeScript's overloads of getReader do not match it). */
const decode = (s: ReadableStream<Uint8Array>) => decodeUpdates(s as unknown as ByteStream);

const line = (c: string) => `${JSON.stringify({ cursor: c, entries: [], attention: [], publishedThrough: 0 } satisfies Omit<Update, "cursor"> & { cursor: string })}\n`;
const settle = () => new Promise((r) => setTimeout(r, 20));

/** A native byte stream that records whether it was cancelled, and with what. */
function source(chunks: Uint8Array[] = [], opts: { close?: boolean; fail?: boolean } = {}) {
  const seen = { cancelled: false as boolean, reason: undefined as unknown };
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      for (const ch of chunks) c.enqueue(ch);
      if (opts.close) c.close();
    },
    pull(c) {
      if (opts.fail) c.error(new Error("socket reset"));
    },
    cancel(reason) {
      seen.cancelled = true;
      seen.reason = reason;
    },
  });
  return { stream, seen };
}

async function rejection(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error("expected a rejection");
}

describe("cancel ends the subscription", () => {
  test("before any read: the source is cancelled with the reason, and released", async () => {
    const { stream, seen } = source();
    await decode(stream).cancel("done");
    await settle();
    expect(seen).toEqual({ cancelled: true, reason: "done" });
    expect(stream.locked).toBe(false);
  });

  test("during a pending read: the read resolves as done, and the source is cancelled", async () => {
    const { stream, seen } = source();
    const updates = decode(stream);
    const pending = updates.getReader().read();
    await settle();
    await updates.cancel("stop");
    expect(await pending).toEqual({ done: true });
    await settle();
    expect(seen.cancelled).toBe(true);
    expect(stream.locked).toBe(false);
  });

  test("after the caller released its reader, and after end of stream, cancel still resolves", async () => {
    const { stream, seen } = source([new TextEncoder().encode(line("a"))]);
    const updates = decode(stream);
    const reader = updates.getReader();
    expect((await reader.read()).done).toBe(false);
    reader.releaseLock();
    await updates.cancel();
    await settle();
    expect(seen.cancelled).toBe(true);

    const ended = source([new TextEncoder().encode(line("b"))], { close: true });
    const done = decode(ended.stream);
    const r = done.getReader();
    expect((await r.read()).done).toBe(false);
    expect((await r.read()).done).toBe(true);
    await done.cancel();
  });
});

describe("failures are ArtroomErrors", () => {
  test("invalid UTF-8 rejects with an ArtroomError, not a raw TypeError", async () => {
    const { stream } = source([new Uint8Array([0x7b, 0xff, 0x0a])], { close: true });
    const e = await rejection(decode(stream).getReader().read());
    expect(isArtroomError(e)).toBe(true);
    expect(e).toMatchObject({ code: "internal", message: expect.stringMatching(/not valid UTF-8/) });
  });

  test("a failing source rejects with a retryable ArtroomError that holds none of the source's text", async () => {
    const { stream } = source([], { fail: true });
    const e = await rejection(decode(stream).getReader().read());
    expect(e).toMatchObject({ name: "ArtroomError", code: "unavailable", retryable: true });
    expect(JSON.stringify(e)).not.toContain("socket reset");
  });

  test("a line that is not an update is an ArtroomError", async () => {
    const { stream } = source([new TextEncoder().encode("[1]\n")], { close: true });
    expect(await rejection(decode(stream).getReader().read())).toMatchObject({ code: "internal" });
  });
});

describe("decoding with native streams", () => {
  test("lines split across chunks, several lines in a chunk, and a split multi-byte character", async () => {
    const text = line("a") + JSON.stringify({ cursor: "b", entries: [], attention: [{ text: "café" }], publishedThrough: 0 }) + "\n" + line("c");
    const bytes = new TextEncoder().encode(text);
    const cut = text.indexOf("caf") + 4; // inside the two-byte character (the text before it is ASCII)
    const { stream } = source([bytes.slice(0, 5), bytes.slice(5, cut), bytes.slice(cut)], { close: true });
    const reader = decode(stream).getReader();
    const got: Update[] = [];
    for (let r = await reader.read(); !r.done; r = await reader.read()) got.push(r.value);
    expect(got.map((u) => u.cursor)).toEqual(["a", "b", "c"]);
    expect((got[1]!.attention[0] as unknown as { text: string }).text).toBe("café");
  });
});
