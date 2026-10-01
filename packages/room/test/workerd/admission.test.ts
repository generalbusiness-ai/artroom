/**
 * Admission: steps 1 to 6 and 10 of R-ADM-1, identifiers (R-ID), signing
 * (R-SIG), idempotency (R-IDEM), secret scanning (R-SEC) and runtime
 * failures (R-ADM-9).
 */

import { describe, expect, it } from "vitest";
import type { Claim, LogEntry, Note } from "@generalbusiness/artroom-contract";
import { canonicalize } from "../../src/canonical.ts";
import { digestJson, keyIdOf, publicKeyOf, verify } from "../../src/crypto.ts";
import { roomIdOf } from "../../src/ids.ts";
import { addMember, call, expectOk, expectRefusal, failure, makeRoom, newKeyPair, sign } from "./support.ts";

async function log(room: Awaited<ReturnType<typeof makeRoom>>): Promise<LogEntry[]> {
  const page = await room.admin.read({ q: "log", req: { limit: 500 } });
  return [...page.acts];
}

describe("R-ID identifiers", () => {
  it("R-ID-3: the room ID is room_ + the first 32 hex of the genesis digest", async () => {
    const room = await makeRoom();
    expect(room.id).toBe(`room_${digestJson(room.genesis).slice(7, 39)}`);
    expect(room.id).toBe(roomIdOf(room.genesis));
    expect(room.id).toMatch(/^room_[0-9a-f]{32}$/);
  });

  it("R-ID-1, R-ID-2: entry IDs are act_<seq>_<hash8>, and a lane's ID is its claim's ID", async () => {
    const room = await makeRoom();
    const claim = expectOk(await room.admin.act<Claim>("claim", null, { goal: "g", scope: ["src/**"] }));
    const entries = await log(room);
    const e = entries[2]!;
    expect(claim.id).toBe(`act_2_${e.hash.slice(7, 15)}`);
    expect(claim.lane).toBe(claim.id);
    // R-ID-1: a reader resolves by seq and compares hash8; a mismatch is not found.
    expect(await room.admin.read({ q: "explain", act: claim.id })).not.toBeNull();
    expect(await room.admin.read({ q: "explain", act: `act_2_00000000` })).toBeNull();
  });

  it("R-ID-4: a key ID is key_ + base64url of the 32-byte public key", () => {
    const k = newKeyPair();
    expect(k.key).toMatch(/^key_[A-Za-z0-9_-]{43}$/);
    expect(keyIdOf(publicKeyOf(k.key)!)).toBe(k.key);
  });

  it("R-ID-8: operation IDs come from sequence numbers", async () => {
    const room = await makeRoom();
    const claim = expectOk(await room.admin.act<Claim>("claim", null, { goal: "g", scope: ["src/**"] }));
    const ws = expectOk(await room.admin.request<{ id: string }>({ kind: "workspace", lane: claim.lane, lease: 1 }));
    // Workspace operations are lane B's: `op_ws_<lane>_<lease generation>`, and the lane ID is its claim's seq (lane B contract gap 9).
    expect(ws.id).toBe(`op_ws_${claim.lane}_1`);
    expect(claim.lane.startsWith(`act_${claim.seq}_`)).toBe(true);
  });
});

describe("R-GEN-1 and R-LOG-2: genesis and sealing", () => {
  it("genesis is entry 0 with the first admin's signature; the initial policy activates at seq 1", async () => {
    const room = await makeRoom();
    const [g, p] = await log(room);
    expect(g!.seq).toBe(0);
    expect(g!.prev).toBeNull();
    expect(g!.entry.type).toBe("system");
    const ev = (g!.entry as unknown as { event: { type: string; genesis: unknown; sig: string } }).event;
    expect(ev.type).toBe("genesis");
    expect(await verify(room.genesis.admin.key, "artroom-genesis-v1", room.genesis, ev.sig)).toBe(true);
    expect((p!.entry as unknown as { event: { type: string } }).event.type).toBe("policy-activated");
  });

  it("R-LOG-2, R-LOG-4: each hash is the digest of the content, chained by prev, signed by the room key", async () => {
    const room = await makeRoom();
    await room.admin.ok("claim", null, { goal: "g", scope: ["src/**"] });
    const entries = await log(room);
    let prev: string | null = null;
    for (const e of entries) {
      const { hash, roomSig, ...content } = e;
      expect(digestJson(content)).toBe(hash);
      expect(e.prev).toBe(prev);
      expect(await verify(room.roomKey, "artroom-entry-v1", hash, roomSig)).toBe(true);
      prev = hash;
    }
  });

  it("R-LOG-12: a new claim's opened effect does not name the lane", async () => {
    const room = await makeRoom();
    await room.admin.ok("claim", null, { goal: "g", scope: ["src/**"] });
    const e = (await log(room))[2]!;
    const receipt = (e.entry as unknown as { receipt: { effects: { type: string }[] } }).receipt;
    const opened = receipt.effects.find((x) => x.type === "opened")!;
    expect("lane" in opened).toBe(false);
    expect(canonicalize(e)).not.toContain(`act_2_${e.hash.slice(7, 15)}`);
  });
});

describe("R-SIG and R-ADM-1 steps 1 and 2: failures are thrown and record nothing", () => {
  it("R-SIG-5: a bad signature is unauthenticated", async () => {
    const room = await makeRoom();
    const s = room.admin.signed("claim", null, { goal: "g", scope: ["src/**"] });
    const bad = { ...s, sig: sign(newKeyPair().seed, "artroom-envelope-v1", s.envelope) };
    expect((await failure(room.stub.submit(bad))).code).toBe("unauthenticated");
    expect((await log(room)).length).toBe(2);
  });

  it("R-SIG-1: a signature under another domain tag does not verify", async () => {
    const room = await makeRoom();
    const s = room.admin.signed("claim", null, { goal: "g", scope: ["src/**"] });
    const wrongDomain = { ...s, sig: sign(room.admin.keys.seed, "artroom-request-v1", s.envelope) };
    expect((await failure(room.stub.submit(wrongDomain))).code).toBe("unauthenticated");
  });

  it("R-SIG-5: an envelope for another room is unauthenticated", async () => {
    const room = await makeRoom();
    const other = await makeRoom();
    const s = other.admin.signed("claim", null, { goal: "g", scope: ["src/**"] });
    expect((await failure(room.stub.submit(s))).code).toBe("unauthenticated");
  });

  it("R-SIG-4: an unknown envelope field is bad-request; an unknown body field is an unrecorded invalid-body", async () => {
    const room = await makeRoom();
    const env = { ...room.admin.envelope("claim", null, { goal: "g", scope: ["src/**"] }), extra: 1 };
    expect((await failure(room.stub.submit({ envelope: env, sig: sign(room.admin.keys.seed, "artroom-envelope-v1", env) }))).code).toBe("bad-request");
    const r = await room.admin.act("claim", null, { goal: "g", scope: ["src/**"], extra: true });
    expect(expectRefusal(r, "invalid-body").act).toBeUndefined();
    expect((await log(room)).length).toBe(2);
  });

  it("R-SIG-3: a non-integer number is outside the signed profile", async () => {
    const room = await makeRoom();
    const env = room.admin.envelope("renew", { lane: "act_1_00000000" }, { lease: 1.5 });
    const err = await failure(room.stub.submit({ envelope: env, sig: "A".repeat(86) }));
    expect(err.code).toBe("bad-request");
  });

  it("R-SIG-6: an envelope over 64 KiB is payload-too-large; a body field over its limit is body-too-large", async () => {
    const room = await makeRoom();
    const huge = room.admin.signed("note", { act: "act_0_00000000" }, { text: "x".repeat(70 * 1024) });
    expect((await failure(room.stub.submit(huge))).code).toBe("payload-too-large");
    const r = await room.admin.act("claim", null, { goal: "g".repeat(1025), scope: ["src/**"] });
    expectRefusal(r, "body-too-large");
    expect((await log(room)).length).toBe(2);
  });

  it("R-PATH-1: an invalid glob is refused glob-invalid and not recorded", async () => {
    const room = await makeRoom();
    for (const bad of ["/abs", "a/../b", "src/[a]", "a//b", "x**"]) expectRefusal(await room.admin.act("claim", null, { goal: "g", scope: [bad] }), "glob-invalid");
    expect((await log(room)).length).toBe(2);
  });
});

describe("R-IDEM idempotency", () => {
  it("R-IDEM-2: a byte-identical replay returns the original record and creates no entry", async () => {
    const room = await makeRoom();
    const s = room.admin.signed("claim", null, { goal: "g", scope: ["src/**"] }, "same-key");
    const a = await call<Claim>(room.stub.submit(s));
    const b = await call<Claim>(room.stub.submit(s));
    expect(b).toEqual(a);
    expect((await log(room)).length).toBe(3);
  });

  it("R-IDEM-3: the same key with different bytes is refused idempotency-mismatch, naming the original, recording nothing", async () => {
    const room = await makeRoom();
    const a = expectOk(await room.admin.act("claim", null, { goal: "g", scope: ["src/**"] }, "k1"));
    const r = expectRefusal(await room.admin.act("claim", null, { goal: "other", scope: ["src/**"] }, "k1"), "idempotency-mismatch");
    expect(r.reason).toContain(a.id);
    expect(r.act).toBeUndefined();
    expect((await log(room)).length).toBe(3);
  });

  it("R-IDEM-1: keys are scoped to the signing key", async () => {
    const room = await makeRoom();
    const bob = await addMember(room, "@bob", "member");
    expectOk(await room.admin.act("claim", null, { goal: "a", scope: ["src/a/**"] }, "shared"));
    expectOk(await bob.act("claim", null, { goal: "b", scope: ["src/b/**"] }, "shared"));
  });

  it("R-IDEM-2: a recorded refusal replays as the same refusal", async () => {
    const room = await makeRoom();
    const s = room.admin.signed("renew", { lane: "act_1_00000000" }, { lease: 1 }, "refused-once");
    const a = await call<{ rule: string; act: string }>(room.stub.submit(s));
    expect(a.rule).toBe("lane-unknown");
    const b = await call<{ rule: string; act: string }>(room.stub.submit(s));
    expect(b).toEqual(a);
    expect((await log(room)).length).toBe(3);
  });

  it("R-IDEM-4: an unrecorded refusal leaves no idempotency record; a retry is judged afresh", async () => {
    const room = await makeRoom();
    expectRefusal(await room.admin.act("claim", null, { goal: "g", scope: ["/bad"] }, "retry-me"), "glob-invalid");
    expectOk(await room.admin.act("claim", null, { goal: "g", scope: ["src/**"] }, "retry-me"));
  });
});

describe("R-SEC secret scanning before recording", () => {
  it("R-SEC-1 to R-SEC-3: a token in a note is refused secret-detected, unrecorded, without repeating the secret", async () => {
    const room = await makeRoom();
    const secret = "ghp_" + "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8";
    const r = expectRefusal(await room.admin.act("note", { act: "act_0_00000000" }, { text: `oops ${secret}` }), "secret-detected");
    expect(r.reason).toContain("body.text");
    expect(r.reason).toContain("github-token");
    expect(JSON.stringify(r)).not.toContain(secret);
    expect(r.fix).toBe("Remove the secret; rotate it if it was shared elsewhere.");
    const all = JSON.stringify(await log(room));
    expect(all).not.toContain(secret);
  });

  it("R-SEC-1: a long random token is refused by the entropy check; a commit SHA in text is not", async () => {
    const room = await makeRoom();
    expectRefusal(await room.admin.act("note", { act: "act_0_00000000" }, { text: "key: Zx9Qw3Er7Ty1Ui5Op2As8Df4Gh6Jk0LmNbVcXz" }), "secret-detected");
    const genesis = (await log(room))[0]!;
    const anchor = { act: `act_0_${genesis.hash.slice(7, 15)}` };
    expectOk(await room.admin.act<Note>("note", anchor, { text: "fixed in 3b18e512dba79e4c8300dd08aeb37f8e728b8dad" }));
  });

  it("R-SEC-4: a join's secret is exempt", async () => {
    const room = await makeRoom();
    await addMember(room, "@bob", "member");
  });
});

describe("R-ADM-9: a runtime failure records nothing", () => {
  it("a policy engine fault during refuse is a retryable policy-runtime error; the retry is admitted", async () => {
    const room = await makeRoom();
    room.world.policy.failures.refuse = 1;
    const s = room.admin.signed("claim", null, { goal: "g", scope: ["src/**"] }, "after-fault");
    const err = await failure(room.stub.submit(s));
    expect(err.code).toBe("policy-runtime");
    expect(err.retryable).toBe(true);
    expect((await log(room)).length).toBe(2);
    expectOk(await call(room.stub.submit(s)));
    expect((await log(room)).length).toBe(3);
  });

  it("R-PROP-1: an Artifacts failure before admission is unavailable and records nothing", async () => {
    const room = await makeRoom();
    const claim = expectOk(await room.admin.act<Claim>("claim", null, { goal: "g", scope: ["src/**"] }));
    room.world.artifacts.failNext("headInFork");
    const err = await failure(room.stub.submit(room.admin.signed("propose", { lane: claim.lane }, { lease: 1, expectedGeneration: 0, head: "a".repeat(40), summary: "s" })));
    expect(err.code).toBe("unavailable");
    expect((await log(room)).length).toBe(3);
  });
});

describe("R-ADM-1 step order", () => {
  it("authority (step 4) is judged before the body (step 5) and the secret scan (step 6)", async () => {
    const room = await makeRoom();
    const stranger = newKeyPair();
    const env = { v: 1 as const, room: room.id, actor: stranger.key, kind: "note" as const, target: { act: "act_0_00000000" }, body: { text: "ghp_" + "x".repeat(36), extra: 1 }, idempotencyKey: "k" };
    const r = await call<{ rule: string }>(room.stub.submit({ envelope: env, sig: sign(stranger.seed, "artroom-envelope-v1", env) }));
    expect(r.rule).toBe("not-member");
  });

  it("R-ADM-8: refusals from lane checks are recorded with the full envelope", async () => {
    const room = await makeRoom();
    const r = expectRefusal(await room.admin.act("renew", { lane: "act_1_00000000" }, { lease: 1 }), "lane-unknown");
    expect(r.act).toMatch(/^act_2_/);
    const e = (await log(room))[2]!;
    expect(e.entry.type).toBe("refusal");
    expect((e.entry as unknown as { receipt: { refusal: { rule: string } } }).receipt.refusal.rule).toBe("lane-unknown");
  });
});
