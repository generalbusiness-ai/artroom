/**
 * Invitation redemption, as the client does it: client custody (R-CRED-1,
 * R-CRED-2) with its recovery of a lost join response, and room custody
 * (R-CRED-3) with its refused and lost responses (R-CRED-9, section 22
 * point 29). The custody check itself (R-ADM-12) is the Room's, and is
 * tested in packages/room/test/workerd/roster.test.ts.
 */

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { InvitationId, Joined, Redeemed } from "@generalbusiness/artroom-contract";
import { connect, generateSigner, isRefusal, join, LOST_REDEMPTION, redeem } from "../src/index.ts";
import { FakeRoom } from "./support/fake-room.ts";
import { caught, FAST, startRoom, type Url } from "./support/setup.ts";

let room: FakeRoom;
let url: Url;
beforeEach(async () => {
  ({ room, url } = await startRoom());
});
afterEach(() => room.stop());

const used = (id: InvitationId) => room.invitations.get(id)!.used !== undefined;
const joins = () => room.entries.filter((e) => e.entry.type === "act" && e.entry.act.envelope.kind === "roster" && (e.entry.act.envelope.body as { op: string }).op === "join");
const redeemCalls = () => room.requests.filter((r) => r.route === "/redeem").length;

describe("client custody: a key the caller made (R-CRED-1, R-CRED-2)", () => {
  test("join binds the key at redemption and returns a read session", async () => {
    const { invitation, secret } = await room.invite("@alice", { role: "maintainer" });
    const { signer } = await generateSigner();
    const joined = (await join({ url }, room.id, { invitation, secret, signer })) as Joined;
    expect(joined).toMatchObject({ custody: "client", member: "@alice", role: "maintainer", key: signer.key });
    expect(joined.record.by).toMatchObject({ via: "join", custody: "client", invitation });
    expect(used(invitation)).toBe(true);
  });

  test("a wrong secret is refused, nothing is recorded, and the invitation stays usable", async () => {
    const { invitation, secret } = await room.invite("@alice");
    const { signer } = await generateSigner();
    const before = room.entries.length;
    const bad = await join({ url }, room.id, { invitation, secret: `${secret}x`, signer });
    expect(isRefusal(bad) && bad.rule).toBe("invitation-invalid");
    expect(isRefusal(bad) && bad.act).toBeUndefined();
    expect(room.entries.length).toBe(before);
    expect(used(invitation)).toBe(false);
    expect(isRefusal(await join({ url }, room.id, { invitation, secret, signer }))).toBe(false);
  });

  test("a lost join response is recovered: the same bytes return the original join (R-IDEM-2), and the key signs for a session (R-CRED-5)", async () => {
    const { invitation, secret } = await room.invite("@alice");
    const { signer } = await generateSigner();
    room.faults.push({ route: "POST /redeem", kind: "drop" });
    const joined = await join({ url }, room.id, { invitation, secret, signer }, FAST);
    expect(isRefusal(joined)).toBe(false);
    expect((joined as Joined).session.member).toBe("@alice");
    expect(redeemCalls()).toBe(2);
    expect(room.requests.filter((r) => r.route === "/acts")).toHaveLength(1);
    expect(room.requests.filter((r) => r.route === "/requests")).toHaveLength(1);
    expect(joins()).toHaveLength(1);
    expect((joined as Joined).record.id).toBe(`act_${joins()[0]!.seq}_${joins()[0]!.hash.slice(7, 15)}`);
  });
});

describe("join() recovery uses the caller's clock (ClientOptions.now)", () => {
  test("against a room whose clock is a day behind: a session request retried after the clock moves is signed again at the moved time", async () => {
    let at = Date.now() - 24 * 3600_000;
    const behind = await FakeRoom.create({ clock: () => at });
    const behindUrl = (await behind.start()) as Url;
    try {
      const { invitation, secret } = await behind.invite("@alice");
      const { signer } = await generateSigner();
      behind.faults.push({ route: "POST /redeem", kind: "drop" });
      const notAfters: number[] = [];
      let first = true;
      const fetcher: typeof fetch = async (input, init) => {
        if (String(input).endsWith("/requests")) {
          notAfters.push(Date.parse((JSON.parse(String(init?.body)) as { request: { notAfter: string } }).request.notAfter));
          if (first) {
            first = false;
            at += 10 * 60_000; // past the first signature's window
            return new Response(JSON.stringify({ name: "ArtroomError", code: "unavailable", message: "busy", retryable: true, retryAfterMs: 1, maybeRecorded: false }), {
              status: 503,
              headers: { "Content-Type": "application/json" },
            });
          }
        }
        return fetch(input, init);
      };
      const joined = await join({ url: behindUrl }, behind.id, { invitation, secret, signer }, { ...FAST, now: () => at, fetch: fetcher });
      expect(isRefusal(joined)).toBe(false);
      expect((joined as Joined).session.member).toBe("@alice");
      expect(notAfters).toHaveLength(2);
      expect(notAfters[1]! - notAfters[0]!).toBe(10 * 60_000);
    } finally {
      behind.stop();
    }
  });
});

describe("room custody: an MCP bearer token (R-CRED-3, R-SEC-5)", () => {
  test("a bearer handle reads with the token, and learns the room from genesis", async () => {
    const { invitation, secret } = await room.invite("@builder", { role: "agent", custody: "room" });
    const { bearer } = (await redeem({ url }, room.id, { invitation, secret })) as Redeemed;
    const api = await connect({ url }, "acme/web", { kind: "bearer", token: bearer });
    expect(api.id).toBe(room.id);
    expect((await api.members()).members.map((m) => m.handle)).toContain("@builder");
    const wrong = await caught(connect({ url }, "room_ffffffffffffffffffffffffffffffff", { kind: "bearer", token: bearer }));
    expect(wrong.code).toBe("not-found");
  });

  test("lost response: the client says so, does not retry, and leaks no bearer (open point 29)", async () => {
    const { invitation, secret } = await room.invite("@builder", { role: "agent", custody: "room" });
    room.faults.push({ route: "POST /redeem", kind: "drop" });
    const err = await caught(redeem({ url }, room.id, { invitation, secret }));
    expect(err).toMatchObject({ code: "unavailable", maybeRecorded: true });
    expect(err.message).toContain(LOST_REDEMPTION);
    expect(redeemCalls()).toBe(1); // no silent second attempt
    // The room did consume it, and the caller has been told it may have.
    expect(used(invitation)).toBe(true);
    expect(room.exposure.bearers).toHaveLength(1);
    expect(JSON.stringify(err)).not.toContain(room.exposure.bearers[0]);
    expect(JSON.stringify(err)).not.toContain(secret);
  });

  test("a gateway error with no room error body may have been recorded: no retry", async () => {
    const { invitation, secret } = await room.invite("@builder", { role: "agent", custody: "room" });
    room.faults.push({ route: "POST /redeem", kind: "status", status: 502 });
    const err = await caught(redeem({ url }, room.id, { invitation, secret }));
    expect(err.maybeRecorded).toBe(true);
    expect(redeemCalls()).toBe(1);
  });

  test("the room's own retryable error recorded nothing, so the client retries", async () => {
    const { invitation, secret } = await room.invite("@builder", { role: "agent", custody: "room" });
    room.faults.push({ route: "POST /redeem", kind: "status", status: 429, body: { name: "ArtroomError", code: "rate-limited", message: "slow down", retryable: true, retryAfterMs: 1 } });
    const out = await redeem({ url }, room.id, { invitation, secret }, FAST);
    expect(isRefusal(out)).toBe(false);
    expect(redeemCalls()).toBe(2);
    expect(room.exposure.bearers).toHaveLength(1);
  });
});
