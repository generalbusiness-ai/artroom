/**
 * Contract amendment 2, lane E's client edits (protocol section 27):
 * - the RPC subscription's newline-delimited bytes become an `UpdateStream`
 *   (R-API-8);
 * - `attention` returns `AttentionPage`, with `publishedThrough` (R-API-9);
 * - bearer acts keep `because`, refuse `roster` locally, and go to
 *   `bearerAct` and `bearerRequest` over RPC (R-CRED-10);
 * - section 23, "Bearer receipt after revocation".
 */

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { ArtroomError, ByteStream, Claim, Redeemed, Update } from "@generalbusiness/artroom-contract";
import { connect, isArtroomError, isRefusal, redeem, type HttpRoomClient, type PreparedAct } from "../src/index.ts";
import { decodeUpdates } from "../src/room.ts";
import type { FakeRoom } from "./support/fake-room.ts";
import { joinAs, sha, startRoom, type Url } from "./support/setup.ts";

let room: FakeRoom;
let url: Url;
beforeEach(async () => {
  ({ room, url } = await startRoom());
});
afterEach(() => room.stop());

async function caught(p: Promise<unknown>): Promise<ArtroomError> {
  try {
    await p;
  } catch (e) {
    if (isArtroomError(e)) return e;
    throw e;
  }
  throw new Error("expected an ArtroomError");
}

async function bearer(kinds: "*" | ("claim" | "propose" | "note" | "renew")[] = "*"): Promise<Redeemed> {
  const { invitation, secret } = await room.invite("@builder", { role: "agent", custody: "room", kinds });
  const out = await redeem({ url }, room.id, { invitation, secret });
  if (isRefusal(out)) throw new Error(out.rule);
  return out;
}

function bytesOf(chunks: string[]): ByteStream {
  const encoded = chunks.map((c) => new TextEncoder().encode(c));
  return {
    getReader: () => ({
      read: async () => (encoded.length ? { done: false as const, value: encoded.shift()! } : { done: true as const }),
      releaseLock: () => {},
    }),
    cancel: async () => {},
  };
}

const service = () => ({ room: async () => room.wire() });

describe("R-API-8: the RPC subscription carries bytes", () => {
  const u = (c: string): Update => ({ cursor: c as never, entries: [], attention: [], publishedThrough: 0 });

  test("lines split across chunks, and several lines in one chunk, decode to updates in order", async () => {
    const text = `${JSON.stringify(u("a"))}\n${JSON.stringify(u("b"))}\n${JSON.stringify(u("c"))}\n`;
    const stream = decodeUpdates(bytesOf([text.slice(0, 7), text.slice(7, 70), text.slice(70)]));
    const reader = stream.getReader();
    const got: string[] = [];
    for (let r = await reader.read(); !r.done; r = await reader.read()) got.push(r.value.cursor);
    expect(got).toEqual(["a", "b", "c"]);
  });

  test("a multi-byte character split between chunks survives", async () => {
    const text = `${JSON.stringify({ ...u("x"), attention: [{ text: "café" }] })}\n`;
    const bytes = new TextEncoder().encode(text);
    const at = text.indexOf("caf") + 4; // inside the two-byte character
    const stream = decodeUpdates({
      getReader: () => {
        const parts = [bytes.slice(0, at), bytes.slice(at)];
        return { read: async () => (parts.length ? { done: false as const, value: parts.shift()! } : { done: true as const }), releaseLock: () => {} };
      },
      cancel: async () => {},
    });
    const r = await stream.getReader().read();
    expect(r.done === false && (r.value.attention[0] as unknown as { text: string }).text).toBe("café");
  });

  test("a line that is not an update is an error, not a silent gap", async () => {
    const stream = decodeUpdates(bytesOf(["not json\n"]));
    expect((await caught(stream.getReader().read())).code).toBe("internal");
  });

  test("the Room handle yields the room's updates after two acts", async () => {
    const alice = await joinAs(room, "@alice");
    const rpc = await connect(service(), room.id, { kind: "key", signer: alice.signer });
    const reader = (await rpc.subscribe()).getReader();
    const first = reader.read();
    const claim = await rpc.claim({ goal: "g", scope: ["src/**"] });
    if (isRefusal(claim)) throw new Error(claim.rule);
    await rpc.renew(claim);
    const seqs: number[] = [];
    let next = first;
    while (seqs.length < 2) {
      const r = await next;
      if (r.done) break;
      seqs.push(...r.value!.entries.map((e) => e.seq));
      if (seqs.length < 2) next = reader.read();
    }
    expect(seqs).toEqual([claim.seq, claim.seq + 1]);
  });
});

describe("R-API-9: attention carries publishedThrough", () => {
  test("over HTTPS and RPC, from the same read", async () => {
    const alice = await joinAs(room, "@alice");
    const page = await alice.api.attention();
    expect(page.publishedThrough).toBe(room.publishedThrough);
    const rpc = await connect(service(), room.id, { kind: "key", signer: alice.signer });
    expect((await rpc.attention()).publishedThrough).toBe(room.publishedThrough);
  });
});

describe("R-CRED-10: bearer acts", () => {
  test("over RPC, acts go to bearerAct with because kept, requests to bearerRequest, and roster is refused locally", async () => {
    const b = await bearer();
    const rpc = await connect(service(), "acme/web", { kind: "bearer", token: b.bearer });
    expect(rpc.id).toBe(room.id);
    const because = [{ url: "https://example.com/issue/1" as const }];
    const claim = await rpc.claim({ goal: "g", scope: ["src/**"], because });
    if (isRefusal(claim)) throw new Error(claim.rule);
    expect(claim.by).toMatchObject({ via: "delegation", member: "@builder", delegation: b.delegation });
    const p = await rpc.propose(claim, { head: sha("a") as never, expectedGeneration: 0, summary: "s", because });
    if (isRefusal(p)) throw new Error(p.rule);
    const sealed = room.entryById(p.id)!;
    expect(sealed.entry.type === "act" && (sealed.entry.act.envelope.body as { because?: unknown }).because).toEqual(because);
    const op = await rpc.workspace(claim);
    expect(isRefusal(op)).toBe(false);
    const err = await caught(rpc.roster({ op: "remove", member: "@admin" }));
    expect(err.code).toBe("forbidden");
  });

});

describe("section 23: bearer receipt after revocation (R-CRED-10, R-IDEM-2)", () => {
  test("a lost bearer act is found by a retry while the token is valid; after revocation the retry is unauthenticated and records nothing", async () => {
    const b = await bearer();
    const rpc = await connect(service(), room.id, { kind: "bearer", token: b.bearer });
    const claim = (await rpc.claim({ goal: "g", scope: ["src/**"] }, { idempotencyKey: "agent-1" })) as Claim;
    // The response was lost: the same act and key again.
    const again = (await rpc.claim({ goal: "g", scope: ["src/**"] }, { idempotencyKey: "agent-1" })) as Claim;
    expect(again.id).toBe(claim.id);
    room.revokeDelegation(b.delegation);
    const before = room.entries.length;
    const err = await caught(rpc.claim({ goal: "g", scope: ["src/**"] }, { idempotencyKey: "agent-1" }));
    expect(err.code).toBe("unauthenticated");
    expect(room.entries.length).toBe(before);
    expect(JSON.stringify(err)).not.toContain(b.bearer);
  });

  test("a signed envelope kept after its key is revoked still returns its original result", async () => {
    const alice = await joinAs(room, "@alice");
    let prepared: PreparedAct | undefined;
    const claim = (await (alice.api as HttpRoomClient).claim({ goal: "g", scope: ["src/**"] }, { onPrepared: (p) => void (prepared = p) })) as Claim;
    const admin = await connect(service(), room.id, { kind: "key", signer: room.admin.signer });
    const revoked = await admin.roster({ op: "revoke-key", key: alice.signer.key, reason: "retired" });
    expect(isRefusal(revoked)).toBe(false);
    const replayed = await (alice.api as HttpRoomClient).replay(prepared!);
    expect(isRefusal(replayed) ? replayed.rule : replayed.id).toBe(claim.id);
  });
});
