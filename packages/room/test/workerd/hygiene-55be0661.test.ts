/**
 * Request 55be0661 in the Workers runtime.
 *
 * Item 1 (SEC-04): without a valid `PUBLIC_URL`, neither the Worker nor a
 * Room object starts, so no redemption can name a fallback host.
 *
 * Item 3 (SEC-11): the HTTPS routes read at most 1 MiB of a body, counting
 * bytes as they stream in; a body sent without `Content-Length` is cut off
 * at the cap, not read whole and measured afterwards.
 */

import { describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import { createExecutionContext, runInDurableObject } from "cloudflare:test";
import Artroom from "../../src/worker.ts";
import { route } from "../../src/http.ts";
import { Room } from "../../src/room.ts";
import type { RoomEnv } from "../../src/config.ts";

const roomEnv = env as unknown as RoomEnv;
const MiB = 1024 * 1024;

describe("PUBLIC_URL is required", () => {
  const { PUBLIC_URL: _, ...without } = roomEnv;
  const notOrigin = { ...roomEnv, PUBLIC_URL: "artroom.example.workers.dev" };

  it("the Worker refuses to start, for HTTPS and RPC alike, without a valid PUBLIC_URL", () => {
    for (const e of [without, notOrigin]) expect(() => new Artroom(createExecutionContext(), e)).toThrow(/PUBLIC_URL must be/);
    expect(() => new Artroom(createExecutionContext(), roomEnv)).not.toThrow();
  });

  it("a Room object refuses to start without a valid PUBLIC_URL", async () => {
    const stub = roomEnv.ROOMS.get(roomEnv.ROOMS.idFromName(`hygiene-${crypto.randomUUID()}`)) as unknown as DurableObjectStub<Room>;
    await runInDurableObject(stub, (_room: Room, state: DurableObjectState) => {
      for (const e of [without, notOrigin]) expect(() => new Room(state, e)).toThrow(/PUBLIC_URL must be/);
    });
  });
});

/** A body of `total` bytes in 64 KiB chunks, with no length, counting the bytes the reader pulled. */
function streamed(total: number, fill: Uint8Array = new Uint8Array([0x20])): { body: ReadableStream<Uint8Array>; pulled: () => number } {
  let sent = 0;
  const chunk = new Uint8Array(64 * 1024);
  for (let i = 0; i < chunk.length; i++) chunk[i] = fill[i % fill.length]!;
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

const draft = (body: BodyInit, headers: Record<string, string> = {}) => route(new Request("https://artroom.test/v1/rooms", { method: "POST", body, headers }), roomEnv);

describe("the HTTPS body cap", () => {
  it("a body streamed without Content-Length is cut off at 1 MiB: 413 payload-too-large, and the rest is never read", async () => {
    const s = streamed(16 * MiB);
    const res = await draft(s.body);
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ code: "payload-too-large" });
    expect(s.pulled()).toBeLessThanOrEqual(MiB + 128 * 1024);
  });

  it("the cap counts bytes, not characters: 1.5 MiB of two-byte characters is refused", async () => {
    const e = new TextEncoder().encode("é");
    const res = await draft(streamed(1.5 * MiB, e).body);
    expect(res.status).toBe(413);
  });

  it("a declared Content-Length over 1 MiB is refused before any byte is read", async () => {
    const s = streamed(2 * MiB);
    const res = await draft(s.body, { "Content-Length": String(2 * MiB) });
    expect(res.status).toBe(413);
    expect(s.pulled()).toBe(0);
  });

  it("a body of exactly 1 MiB is read and judged on its content", async () => {
    const res = await draft("{}".padEnd(MiB, " "));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "bad-request" });
  });
});
