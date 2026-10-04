/**
 * Request 55be0661, item 3 (finding SEC-11): the MCP route reads at most
 * 1 MiB of a request body. Bytes are counted as they stream in, so a body
 * sent without `Content-Length` is cut off at the cap rather than read
 * whole; a declared length over the cap is refused before any read; and an
 * unauthenticated request is refused before its body is read at all.
 *
 * The cap is web-standard stream code, the same in Node as in the Workers
 * runtime, so it is tested here. The handler inside workerd, with the real
 * Room behind it, is tested in packages/room (test/workerd/mcp.test.ts).
 */

import { expect, test } from "vitest";
import type { RoomApi } from "@generalbusiness/artroom-contract";
import { createMcpFetch } from "../src/worker.ts";

const MiB = 1024 * 1024;
const room = {} as unknown as RoomApi;
const handler = createMcpFetch<unknown>({ room: async (_r, _e, bearer) => (bearer === "good" ? room : null), caller: async () => ({ role: "admin" }) });

/** A body of `total` bytes in 64 KiB chunks, with no length, counting the bytes the reader pulled. */
function streamed(total: number): { body: ReadableStream<Uint8Array>; pulled: () => number } {
  let sent = 0;
  const chunk = new Uint8Array(64 * 1024).fill(0x20);
  const body = new ReadableStream<Uint8Array>(
    {
      pull(c) {
        if (sent >= total) return c.close();
        sent += chunk.byteLength;
        c.enqueue(chunk.slice());
      },
    },
    { highWaterMark: 0 },
  );
  return { body, pulled: () => sent };
}

function post(bearer: string, body: BodyInit, headers: Record<string, string> = {}): Promise<Response> {
  return handler(
    new Request("http://localhost/v1/rooms/room_0123/mcp", {
      method: "POST",
      headers: { host: "localhost", "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${bearer}`, "mcp-protocol-version": "2025-06-18", ...headers },
      body,
      // Node asks for this where the body is a stream; the Workers runtime does not need it.
      duplex: "half",
    } as RequestInit),
    {},
  );
}

test("a body streamed without Content-Length is cut off at 1 MiB: 413, and the rest is never read", async () => {
  const s = streamed(16 * MiB);
  const res = await post("good", s.body);
  expect(res.status).toBe(413);
  expect(((await res.json()) as { error: { message: string } }).error.message).toMatch(/larger than 1 MiB/);
  expect(s.pulled()).toBeLessThanOrEqual(MiB + 128 * 1024);
});

test("a declared Content-Length over 1 MiB is 413 before any byte is read", async () => {
  const s = streamed(2 * MiB);
  const res = await post("good", s.body, { "content-length": String(2 * MiB) });
  expect(res.status).toBe(413);
  expect(s.pulled()).toBe(0);
});

test("an unknown bearer is 401 before the body is read", async () => {
  const s = streamed(16 * MiB);
  expect((await post("bad", s.body)).status).toBe(401);
  expect(s.pulled()).toBe(0);
});

test("a body of exactly 1 MiB is read and handed on", async () => {
  const message = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
  const res = await post("good", message.padEnd(MiB, " "));
  expect(res.status).toBe(200);
});
