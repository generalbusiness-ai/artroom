/**
 * Invitation redemption: client custody (R-CRED-1, R-CRED-2), room custody
 * (R-CRED-3), the custody check on every path (R-ADM-12, section 23), and
 * refused, partial and lost responses (R-CRED-9, section 22 point 29).
 */

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { ArtroomError, InvitationId, Joined, Redeemed, SignedEnvelope } from "@generalbusiness/artroom-contract";
import {
  buildEnvelope,
  connect,
  generateSigner,
  isArtroomError,
  isRefusal,
  join,
  LOST_REDEMPTION,
  newIdempotencyKey,
  redeem,
  signEnvelope,
} from "../src/index.ts";
import type { FakeRoom } from "./support/fake-room.ts";
import { startRoom, type Url } from "./support/setup.ts";

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

const used = (id: InvitationId) => room.invitations.get(id)!.used !== undefined;
const joins = () => room.entries.filter((e) => e.entry.type === "act" && e.entry.act.envelope.kind === "roster" && (e.entry.act.envelope.body as { op: string }).op === "join");
const redeemCalls = () => room.requests.filter((r) => r.route === "/redeem").length;

/** A self-signed join, as a client would build it. */
async function selfJoin(invitation: InvitationId, secret: string) {
  const { signer } = await generateSigner();
  const env = buildEnvelope(room.id, { signer }, "roster", null, { op: "join", invitation, secret }, newIdempotencyKey());
  return { signer, signed: (await signEnvelope(env, signer)) as SignedEnvelope };
}

describe("client custody: a key the caller made (R-CRED-1, R-CRED-2)", () => {
  test("join binds the key at redemption and returns a read session", async () => {
    const { invitation, secret } = await room.invite("@alice", { role: "maintainer" });
    const { signer } = await generateSigner();
    const joined = (await join({ url }, room.id, { invitation, secret, signer })) as Joined;
    expect(joined).toMatchObject({ custody: "client", member: "@alice", role: "maintainer", key: signer.key });
    expect(joined.record.by).toMatchObject({ via: "join", custody: "client", invitation });
    expect(used(invitation)).toBe(true);
  });

  test("a second join with the same invitation is refused invitation-invalid; a bound key is refused key-in-use", async () => {
    const { invitation, secret } = await room.invite("@alice");
    const { signer } = await generateSigner();
    await join({ url }, room.id, { invitation, secret, signer });
    const other = (await generateSigner()).signer;
    const again = await join({ url }, room.id, { invitation, secret, signer: other });
    expect(isRefusal(again) && again.rule).toBe("invitation-invalid");
    const second = await room.invite("@alice");
    const reuse = await join({ url }, room.id, { ...second, signer });
    expect(isRefusal(reuse) && reuse.rule).toBe("key-in-use");
    expect(used(second.invitation)).toBe(false);
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

  test("a lost join response is recovered: the same signed bytes return the original join (R-IDEM-2)", async () => {
    const { invitation, secret } = await room.invite("@alice");
    const { signer } = await generateSigner();
    room.faults.push({ route: "POST /redeem", kind: "drop" });
    const joined = await join({ url }, room.id, { invitation, secret, signer });
    expect(isRefusal(joined)).toBe(false);
    expect(redeemCalls()).toBe(2);
    expect(joins()).toHaveLength(1);
    expect((joined as Joined).record.id).toBe(`act_${joins()[0]!.seq}_${joins()[0]!.hash.slice(7, 15)}`);
  });
});

describe("room custody: an MCP bearer token (R-CRED-3, R-SEC-5)", () => {
  test("redeem returns the bearer once; the log holds the join and the delegate, never the token", async () => {
    const { invitation, secret } = await room.invite("@builder", { role: "agent", custody: "room" });
    const redeemed = (await redeem({ url }, room.id, { invitation, secret })) as Redeemed;
    expect(redeemed).toMatchObject({ custody: "room", member: "@builder", role: "agent" });
    expect(redeemed.mcp).toBe(`${url}/v1/rooms/${room.id}/mcp`);
    const join = joins().at(-1)!;
    expect(join.entry.type === "act" && join.entry.receipt.authority).toMatchObject({ via: "join", custody: "room" });
    expect(room.keys.get(redeemed.key)?.custody).toBe("room");
    expect(room.delegations.get(redeemed.delegation)?.grantor).toBe(redeemed.key);
    expect(JSON.stringify(room.entries)).not.toContain(redeemed.bearer);
  });

  test("a bearer handle reads with the token, and learns the room from genesis", async () => {
    const { invitation, secret } = await room.invite("@builder", { role: "agent", custody: "room" });
    const { bearer } = (await redeem({ url }, room.id, { invitation, secret })) as Redeemed;
    const api = await connect({ url }, "acme/web", { kind: "bearer", token: bearer });
    expect(api.id).toBe(room.id);
    expect((await api.members()).members.map((m) => m.handle)).toContain("@builder");
    const wrong = await caught(connect({ url }, "room_ffffffffffffffffffffffffffffffff", { kind: "bearer", token: bearer }));
    expect(wrong.code).toBe("not-found");
  });

  test("refused: a wrong secret consumes nothing, issues no bearer, and a correct retry works", async () => {
    const { invitation, secret } = await room.invite("@builder", { role: "agent", custody: "room" });
    const bad = await redeem({ url }, room.id, { invitation, secret: `${secret}x` });
    expect(isRefusal(bad) && bad.rule).toBe("invitation-invalid");
    expect(used(invitation)).toBe(false);
    expect(room.exposure.bearers).toHaveLength(0);
    expect(isRefusal(await redeem({ url }, room.id, { invitation, secret }))).toBe(false);
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

  test("partial response: a cut-off body is a lost response, not a success, and leaks nothing", async () => {
    const { invitation, secret } = await room.invite("@builder", { role: "agent", custody: "room" });
    room.faults.push({ route: "POST /redeem", kind: "partial" });
    const err = await caught(redeem({ url }, room.id, { invitation, secret }));
    expect(err.maybeRecorded).toBe(true);
    expect(redeemCalls()).toBe(1);
    expect(JSON.stringify(err)).not.toContain(room.exposure.bearers[0]);
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
    const out = await redeem({ url }, room.id, { invitation, secret });
    expect(isRefusal(out)).toBe(false);
    expect(redeemCalls()).toBe(2);
    expect(room.exposure.bearers).toHaveLength(1);
  });
});

describe("custody is enforced on every join path (R-ADM-12, section 23)", () => {
  test("room-custody invitation, self-signed join on POST /acts: custody-mismatch, nothing recorded", async () => {
    const { invitation, secret } = await room.invite("@builder", { custody: "room" });
    const { signed } = await selfJoin(invitation, secret);
    const before = room.entries.length;
    const res = await fetch(`${url}/v1/rooms/${room.id}/acts`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(signed) });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ refused: true, rule: "custody-mismatch" });
    expect(room.entries.length).toBe(before);
    expect(used(invitation)).toBe(false);
  });

  test("room-custody invitation, self-signed join over RPC submit: custody-mismatch", async () => {
    const { invitation, secret } = await room.invite("@builder", { custody: "room" });
    const { signed } = await selfJoin(invitation, secret);
    const out = await room.wire().submit(signed);
    expect(isRefusal(out) && out.rule).toBe("custody-mismatch");
    expect(used(invitation)).toBe(false);
  });

  test("room-custody invitation, client redemption with join(): custody-mismatch, and the refusal says what to do", async () => {
    const { invitation, secret } = await room.invite("@builder", { custody: "room" });
    const { signer } = await generateSigner();
    const out = await join({ url }, room.id, { invitation, secret, signer });
    expect(isRefusal(out) && out.rule).toBe("custody-mismatch");
    expect(isRefusal(out) && out.fix).toMatch(/artroom redeem/);
    expect(used(invitation)).toBe(false);
  });

  test("client-custody invitation, room redemption with redeem(): custody-mismatch, no key made", async () => {
    const { invitation, secret } = await room.invite("@alice", { custody: "client" });
    const keys = room.keys.size;
    const out = await redeem({ url }, room.id, { invitation, secret });
    expect(isRefusal(out) && out.rule).toBe("custody-mismatch");
    expect(room.keys.size).toBe(keys);
    expect(used(invitation)).toBe(false);
  });
});
