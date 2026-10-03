/**
 * Admission, lanes and proposals: steps 1 to 6 and 10 of R-ADM-1,
 * identifiers (R-ID), signing (R-SIG), idempotency (R-IDEM), secret scanning
 * (R-SEC), runtime failures (R-ADM-9), lanes and leases (R-LANE), proposals
 * (R-PROP, R-PATH), workspace credentials (R-WS) and concurrent admission
 * (R-LOG-1, R-ADM-6).
 *
 * Most tests share one room: each opens its own lane on its own paths, and
 * checks what it recorded by the log's head before and after.
 */

import { describe, expect, it } from "vitest";
import { exports } from "cloudflare:workers";
import { runDurableObjectAlarm } from "cloudflare:test";
import type { ActRecord, Claim, Landing, Lane, LogEntry, Note, Proposal, Refusal, Release, Renewal, RosterRecord, WorkspaceGrant, WorkspaceOp } from "@generalbusiness/artroom-contract";
import { policy, requireReview } from "@generalbusiness/artroom-policy/helpers";
import { starterPolicy } from "@generalbusiness/artroom-policy/pack";
import { canonicalize } from "../../src/canonical.ts";
import { digestJson, verify } from "../../src/crypto.ts";
import { roomIdOf } from "../../src/ids.ts";
import { chained, entries, events, headSeq, idOf, inDO, once, opOf, proposed, read } from "./core-support.ts";
import { addMember, advance, call, Client, clock, expectOk, expectRefusal, failure, forkRemote, isRefusal, iso, makeRoom, newKeyPair, pushChange, sign, tick, tokenLive, until, type TestRoom } from "./support.ts";

const LEASE = 1800 * 1000;

/** The room most tests here share, under the default policy, with two members. */
const shared = once(async () => {
  const room = await makeRoom();
  return { room, alice: await addMember(room, "@alice", "member"), bob: await addMember(room, "@bob", "maintainer") };
});

let paths = 0;
/** A scope no other test's lane overlaps. */
const own = () => `area${++paths}`;

const claim = (who: Client, scope: string[]) => who.ok<Claim>("claim", null, { goal: "work", scope });
const laneOf = async (room: TestRoom, lane: string) => (await read(room, { q: "lane", lane: lane as never })) as Lane;

describe("identifiers and the sealed log", () => {
  it("R-ID-3, R-GEN-1: the room ID is room_ and the first 32 hex of the genesis digest; genesis is entry 0 with the first admin's signature, and the initial policy activates at seq 1", async () => {
    const { room } = await shared();
    expect(room.id).toBe(`room_${digestJson(room.genesis).slice(7, 39)}`);
    expect(room.id).toBe(roomIdOf(room.genesis));
    const [g, p] = await entries(room);
    expect(g).toMatchObject({ seq: 0, prev: null, entry: { type: "system", event: { type: "genesis" } } });
    const ev = (g!.entry as unknown as { event: { sig: string } }).event;
    expect(await verify(room.genesis.admin.key, "artroom-genesis-v1", room.genesis, ev.sig)).toBe(true);
    expect(p).toMatchObject({ seq: 1, entry: { event: { type: "policy-activated" } } });
  });

  it("R-ID-1, R-ID-2, R-ID-8, R-LOG-12: an entry ID is act_<seq>_<hash8>, a lane's ID is its claim's ID, the sealed claim does not name its lane, and operation IDs come from sequence numbers", async () => {
    const { room } = await shared();
    const c = await claim(room.admin, [`${own()}/**`]);
    const e = (await entries(room))[c.seq]!;
    expect(c.id).toBe(`act_${c.seq}_${e.hash.slice(7, 15)}`);
    expect(c.lane).toBe(c.id);
    // R-LOG-12: the lane's ID depends on the entry's hash, so the sealed entry cannot hold it.
    const opened = (e.entry as unknown as { receipt: { effects: { type: string }[] } }).receipt.effects.find((x) => x.type === "opened")!;
    expect("lane" in opened).toBe(false);
    expect(canonicalize(e)).not.toContain(c.id);
    // R-ID-1: a reader resolves by seq and compares hash8; a mismatch is not found.
    expect(await read(room, { q: "explain", act: c.id })).not.toBeNull();
    expect(await read(room, { q: "explain", act: `act_${c.seq}_00000000` as never })).toBeNull();
    const ws = expectOk(await room.admin.request<{ id: string }>({ kind: "workspace", lane: c.lane, lease: 1 }));
    expect(ws.id).toBe(`op_ws_${c.lane}_1`);
  });
});

describe("R-SIG and R-ADM-1 steps 1, 2 and 5: an act that fails them is not recorded", () => {
  it("R-SIG-5, R-SIG-1: a signature by another key, under another domain tag, or over an envelope for another room is unauthenticated", async () => {
    const { room } = await shared();
    const before = await headSeq(room);
    const s = room.admin.signed("claim", null, { goal: "g", scope: ["src/**"] });
    const elsewhere = { ...s.envelope, room: `room_${"0".repeat(32)}` };
    for (const [why, sent] of [
      ["another key", { ...s, sig: sign(newKeyPair().seed, "artroom-envelope-v1", s.envelope) }],
      ["another domain tag", { ...s, sig: sign(room.admin.keys.seed, "artroom-request-v1", s.envelope) }],
      ["another room", { envelope: elsewhere, sig: sign(room.admin.keys.seed, "artroom-envelope-v1", elsewhere) }],
    ] as const)
      expect([why, (await failure(room.stub.submit(sent as never))).code]).toEqual([why, "unauthenticated"]);
    expect(await headSeq(room)).toBe(before);
  });

  it("R-SIG-3, R-SIG-4, R-SIG-6, R-PATH-1: an envelope outside the profile is a thrown failure; a body outside it is a refusal with no entry", async () => {
    const { room } = await shared();
    const before = await headSeq(room);
    const submit = (envelope: object) => failure(room.stub.submit({ envelope, sig: sign(room.admin.keys.seed, "artroom-envelope-v1", envelope) } as never));
    expect((await submit({ ...room.admin.envelope("claim", null, { goal: "g", scope: ["src/**"] }), extra: 1 })).code).toBe("bad-request");
    expect((await failure(room.stub.submit({ envelope: room.admin.envelope("renew", { lane: "act_1_00000000" }, { lease: 1.5 }), sig: "A".repeat(86) } as never))).code).toBe("bad-request");
    expect((await submit(room.admin.envelope("note", { act: "act_0_00000000" }, { text: "x".repeat(70 * 1024) }))).code).toBe("payload-too-large");
    for (const [body, rule] of [
      [{ goal: "g", scope: ["src/**"], extra: true }, "invalid-body"],
      [{ goal: "g".repeat(1025), scope: ["src/**"] }, "body-too-large"],
      [{ goal: "g", scope: ["a/../b"] }, "glob-invalid"],
      [{ goal: "g", scope: ["x**"] }, "glob-invalid"],
    ] as const)
      expect(expectRefusal(await room.admin.act("claim", null, body), rule).act).toBeUndefined();
    expect(await headSeq(room)).toBe(before);
  });

  it("R-ADM-1: authority (step 4) is judged before the body (step 5) and the secret scan (step 6)", async () => {
    const { room } = await shared();
    const stranger = newKeyPair();
    const env = { v: 1 as const, room: room.id, actor: stranger.key, kind: "note" as const, target: { act: "act_0_00000000" }, body: { text: "ghp_" + "x".repeat(36), extra: 1 }, idempotencyKey: "k" };
    const r = await call<{ rule: string }>(room.stub.submit({ envelope: env, sig: sign(stranger.seed, "artroom-envelope-v1", env) }));
    expect(r.rule).toBe("not-member");
  });

  it("R-ADM-8: a refusal from a lane check is recorded, with the full envelope", async () => {
    const { room } = await shared();
    const r = expectRefusal(await room.admin.act("renew", { lane: "act_1_00000000" }, { lease: 1 }), "lane-unknown");
    const e = (await entries(room)).at(-1)!;
    expect(r.act).toBe(idOf(e));
    expect(e.entry).toMatchObject({ type: "refusal", act: { envelope: { kind: "renew", body: { lease: 1 } } }, receipt: { refusal: { rule: "lane-unknown" } } });
  });
});

describe("R-IDEM idempotency", () => {
  it("R-IDEM-2: the same bytes again, eight at once and once more later, return the original record and create one entry", async () => {
    const { room } = await shared();
    const s = room.admin.signed("claim", null, { goal: "once", scope: [`${own()}/**`] }, "same-key");
    const before = await headSeq(room);
    const results = await Promise.all(Array.from({ length: 8 }, () => call<Claim>(room.stub.submit(s))));
    results.push(await call<Claim>(room.stub.submit(s)));
    for (const r of results) expect(r).toEqual(results[0]);
    expect(await headSeq(room)).toBe(before + 1);
  });

  it("R-IDEM-3: the same key with different bytes is refused idempotency-mismatch, naming the original, and nothing is recorded", async () => {
    const { room } = await shared();
    const a = await room.admin.ok("claim", null, { goal: "g", scope: [`${own()}/**`] }, "k1");
    const before = await headSeq(room);
    const r = expectRefusal(await room.admin.act("claim", null, { goal: "other", scope: [`${own()}/**`] }, "k1"), "idempotency-mismatch");
    expect(r.reason).toContain(a.id);
    expect(r.act).toBeUndefined();
    expect(await headSeq(room)).toBe(before);
  });

  it("R-IDEM-1: keys are scoped to the signing key", async () => {
    const { room, bob } = await shared();
    expectOk(await room.admin.act("claim", null, { goal: "a", scope: [`${own()}/**`] }, "one-key-two-signers"));
    expectOk(await bob.act("claim", null, { goal: "b", scope: [`${own()}/**`] }, "one-key-two-signers"));
  });

  it("R-IDEM-2, R-IDEM-4: a recorded refusal replays as the same refusal; an unrecorded one leaves no record, and a retry under its key is judged afresh", async () => {
    const { room } = await shared();
    const s = room.admin.signed("renew", { lane: "act_1_00000000" }, { lease: 1 }, "refused-once");
    const a = await call<Refusal>(room.stub.submit(s));
    expect(a.rule).toBe("lane-unknown");
    const before = await headSeq(room);
    expect(await call<Refusal>(room.stub.submit(s))).toEqual(a);
    expectRefusal(await room.admin.act("claim", null, { goal: "g", scope: ["/bad"] }, "retry-me"), "glob-invalid");
    expect(await headSeq(room)).toBe(before);
    expectOk(await room.admin.act("claim", null, { goal: "g", scope: [`${own()}/**`] }, "retry-me"));
  });
});

describe("R-SEC secret scanning before recording", () => {
  it("R-SEC-1 to R-SEC-3: a token or a long random string in a note is refused secret-detected, unrecorded, without repeating it; a commit SHA is not a secret", async () => {
    const { room } = await shared();
    const anchor = { act: idOf((await entries(room))[0]!) };
    const before = await headSeq(room);
    const secret = "ghp_" + "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8";
    const r = expectRefusal(await room.admin.act("note", anchor, { text: `oops ${secret}` }), "secret-detected");
    expect(r.reason).toContain("body.text");
    expect(r.reason).toContain("github-token");
    expect(JSON.stringify(r)).not.toContain(secret);
    expect(r.fix).toBe("Remove the secret; rotate it if it was shared elsewhere.");
    expectRefusal(await room.admin.act("note", anchor, { text: "key: Zx9Qw3Er7Ty1Ui5Op2As8Df4Gh6Jk0LmNbVcXz" }), "secret-detected");
    expect(await headSeq(room)).toBe(before);
    expect(JSON.stringify(await entries(room))).not.toContain(secret);
    expectOk(await room.admin.act<Note>("note", anchor, { text: "fixed in 3b18e512dba79e4c8300dd08aeb37f8e728b8dad" }));
  });
});

describe("R-ADM-9: a runtime failure records nothing", () => {
  it("a policy engine fault during refuse is a retryable policy-runtime error; the same bytes again are admitted", async () => {
    const { room } = await shared();
    const before = await headSeq(room);
    room.world.policy.failures.refuse = 1;
    const s = room.admin.signed("claim", null, { goal: "g", scope: [`${own()}/**`] }, "after-fault");
    expect(await failure(room.stub.submit(s))).toMatchObject({ code: "policy-runtime", retryable: true });
    expect(await headSeq(room)).toBe(before);
    expectOk(await call(room.stub.submit(s)));
    expect(await headSeq(room)).toBe(before + 1);
  });

  it("R-PROP-1: an Artifacts failure before admission is unavailable and records nothing", async () => {
    const { room } = await shared();
    const c = await claim(room.admin, [`${own()}/**`]);
    const before = await headSeq(room);
    room.world.artifacts.failNext("headInFork");
    const err = await failure(room.stub.submit(room.admin.signed("propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head: "a".repeat(40), summary: "s" })));
    expect(err.code).toBe("unavailable");
    expect(await headSeq(room)).toBe(before);
  });
});

describe("R-LANE lanes and leases", () => {
  it("R-LANE-1, R-LANE-2: a claim opens a lane at generation 0 and lease generation 1, held by the signer; the holder rescopes it with its lease and the expected generation", async () => {
    const { room } = await shared();
    const area = own();
    const c = await claim(room.admin, [`${area}/**`]);
    expect(c.lease).toEqual({ holder: "@admin", generation: 1, expiresAt: iso(clock.now + LEASE) });
    expect(await laneOf(room, c.lane)).toMatchObject({ state: "held", generation: 0, lease: { holder: "@admin", generation: 1 } });
    const wider = [`${area}/**`, `${area}-docs/**`];
    expectRefusal(await room.admin.act("claim", { lane: c.lane }, { scope: wider, expectedGeneration: 3, lease: 1 }), "generation-moved");
    const r = await room.admin.ok<Claim>("claim", { lane: c.lane }, { scope: wider, expectedGeneration: 0, lease: 1 });
    expect(r.effect).toMatchObject({ type: "rescoped", scope: wider });
  });

  it("R-PATH-3: overlaps with held lanes are reported, conservatively, and certain for a literal path", async () => {
    const { room, bob } = await shared();
    const area = own();
    const a = await claim(room.admin, [`${area}/**`]);
    const b = await claim(bob, [`${area}/app.ts`, `${area}-docs/**`]);
    expect(b.overlaps).toEqual([{ lane: a.lane, holder: "@admin", mine: `${area}/app.ts`, theirs: `${area}/**`, certain: true }]);
  });

  it("R-LANE-3: only the holder may propose, release or renew; others are refused not-holder", async () => {
    const { room, bob } = await shared();
    const c = await claim(room.admin, [`${own()}/**`]);
    expectRefusal(await bob.act("renew", { lane: c.lane }, { lease: 1 }), "not-holder");
    expectRefusal(await bob.act("release", { lane: c.lane }, { lease: 1 }), "not-holder");
    expectRefusal(await bob.act("propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head: "a".repeat(40), summary: "s" }), "not-holder");
  });

  it("R-LANE-6, R-LANE-7, R-LANE-8: an old lease generation is fenced; a held lane cannot be taken over; a release keeps its handover note; after a take-over the old holder and old generations are refused", async () => {
    const { room, bob } = await shared();
    const scope = [`${own()}/**`];
    const c = await claim(room.admin, scope);
    expectRefusal(await room.admin.act("renew", { lane: c.lane }, { lease: 7 }), "lease-fenced");
    expectRefusal(await bob.act("claim", { lane: c.lane }, { scope, expectedGeneration: 0 }), "lane-held");
    const rel = await room.admin.ok<Release>("release", { lane: c.lane }, { lease: 1, note: "half done; tests next" });
    expect(await laneOf(room, c.lane)).toMatchObject({ state: "unheld", why: "released", handover: rel.id, leaseGeneration: 2 });
    // R-LANE-7: a claim on an unheld lane that carries a lease is fenced.
    expectRefusal(await bob.act("claim", { lane: c.lane }, { scope, expectedGeneration: 0, lease: 2 }), "lease-fenced");
    const t = await bob.ok<Claim>("claim", { lane: c.lane }, { scope, expectedGeneration: 0 });
    expect(t.effect.type).toBe("taken-over");
    // Release (2) then take-over (3): the lease generation increases at each.
    expect(t.lease.generation).toBe(3);
    expectRefusal(await room.admin.act("renew", { lane: c.lane }, { lease: 1 }), "not-holder");
    expectRefusal(await bob.act("renew", { lane: c.lane }, { lease: 1 }), "lease-fenced");
    expectOk(await bob.act<Renewal>("renew", { lane: c.lane }, { lease: 3 }));
  });

  it("R-ADM-11, R-LANE-5: an accepted holder act renews the lease; a recorded refusal does not", async () => {
    const { room } = await shared();
    const c = await claim(room.admin, [`${own()}/**`]);
    advance(1000 * 1000);
    expectRefusal(await room.admin.act("renew", { lane: c.lane }, { lease: 9 }), "lease-fenced");
    expect((await laneOf(room, c.lane) as Lane & { lease: { expiresAt: string } }).lease.expiresAt).toBe(c.lease.expiresAt);
    const r = await room.admin.ok<Renewal>("renew", { lane: c.lane }, { lease: 1 });
    expect(r.lease.expiresAt).toBe(iso(clock.now + LEASE));
  });

  it("R-LANE-8, R-LANE-6: the object's alarm expires the lease, records lease-expired with no handover note, and fences the old holder", async () => {
    const { room, bob } = await shared();
    const scope = [`${own()}/**`];
    const c = await claim(room.admin, scope);
    advance(LEASE + 1000);
    // The Durable Object's own alarm, scheduled on commit, runs the expiry.
    expect(await runDurableObjectAlarm(room.stub)).toBe(true);
    const expired = events(await entries(room), "lease-expired").find((e) => e.event.lane === c.lane)!;
    expect(expired.event).toEqual({ type: "lease-expired", lane: c.lane, holder: "@admin", leaseGeneration: 1 });
    const lane = await laneOf(room, c.lane);
    expect(lane).toMatchObject({ state: "unheld", why: "expired", leaseGeneration: 2 });
    expect("handover" in lane).toBe(false);
    expectRefusal(await room.admin.act("renew", { lane: c.lane }, { lease: 1 }), "not-holder");
    const t = await bob.ok<Claim>("claim", { lane: c.lane }, { scope, expectedGeneration: 0 });
    expect(t.lease.generation).toBe(3);
  });
});

describe("R-PROP proposals", () => {
  it("R-PROP-1, R-PROP-2, R-PROP-5: propose pins the head as generation n+1, with the paths that changed; the same expected generation again is generation-moved", async () => {
    const { room } = await shared();
    const area = own();
    const c = await claim(room.admin, [`${area}/**`]);
    const head = pushChange(room, c.lane, { [`${area}/app.ts`]: "export const app = 2;\n" });
    const p = await room.admin.ok<Proposal>("propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "bump" });
    expect(p).toMatchObject({ generation: 1, head, pinnedRef: `refs/artroom/heads/${c.lane}/1`, changed: [{ status: "added", path: `${area}/app.ts` }] });
    expect(p.preview).toMatchObject({ id: `op_preview_${p.seq}`, state: "pending" });
    expect(room.world.artifacts.refs.get(`refs/artroom/objects/${head}`)).toBe(head);
    await tick(room);
    expect(room.world.artifacts.refs.get(p.pinnedRef)).toBe(head);
    expect((await read(room, { q: "proposal", ref: { lane: c.lane, generation: 1 } }))!.preview.state).toBe("clean");
    expectRefusal(await room.admin.act("propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "again" }), "generation-moved");
  });

  it("R-LANE-4: proposes sent at once for one generation: exactly one is admitted, and the others are recorded generation-moved", async () => {
    const { room } = await shared();
    const area = own();
    const c = await claim(room.admin, [`${area}/**`]);
    const heads = Array.from({ length: 4 }, (_, i) => pushChange(room, c.lane, { [`${area}/app.ts`]: `v${i}` }));
    const results = await Promise.all(heads.map((head, i) => room.admin.act<Proposal>("propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: `p${i}` })));
    const refused = results.filter(isRefusal) as Refusal[];
    expect(results.filter((r) => !isRefusal(r)).map((r) => (r as Proposal).generation)).toEqual([1]);
    expect(refused.map((r) => [r.rule, r.current, r.act !== undefined])).toEqual(Array.from({ length: 3 }, () => ["generation-moved", { generation: 1 }, true]));
  });

  it("R-PROP-1, R-PROP-4, R-PROP-6: a head not in the lane's fork is head-unknown; a changed path outside the claim is outside-claim; a diff over the bound is diff-too-large; each is recorded", async () => {
    const { room } = await shared();
    const area = own();
    const c = await claim(room.admin, [`${area}/**`]);
    const a = room.world.artifacts;
    const propose = (head: string) => room.admin.act("propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "s" });
    expect(expectRefusal(await propose(a.commit(a.main!, { [`${area}/app.ts`]: "x" })), "head-unknown").act).toBeDefined();
    const outside = expectRefusal(await propose(pushChange(room, c.lane, { "elsewhere/readme.md": "x", [`${area}/app.ts`]: "y" })), "outside-claim");
    expect(outside.fix).toBe("Extend the claim.");
    // jj conflict data outside the claim is refused by the claim check here: this room's policy has no rule for it.
    expectRefusal(await propose(pushChange(room, c.lane, conflicted(area))), "outside-claim");
    const two = pushChange(room, c.lane, { [`${area}/a.ts`]: "1", [`${area}/b.ts`]: "2" });
    room.world.bounds.maxEntries = 2;
    try {
      expect(expectRefusal(await propose(two), "diff-too-large").act).toBeDefined();
    } finally {
      delete room.world.bounds.maxEntries;
    }
  });

  /** jj stores a conflicted commit with `.jjconflict-side-*` and `.jjconflict-base-*` directories at the tree root. */
  const conflicted = (area: string) => ({ [`${area}/app.ts`]: "<<<<<<< conflict", ".jjconflict-side-0/src/app.ts": "v2", ".jjconflict-base-0/src/app.ts": "v1" });

  it("amendment 66d6fb14 (section 28): on propose, refuse rules run before the claim check, so the pack's jj-conflicts rule answers for conflict data outside the claim; other paths outside it are still outside-claim", async () => {
    const room = await makeRoom({ policy: starterPolicy({ owners: { "**": "@owner" } }) });
    const c = await claim(room.admin, ["src/**"]);
    const propose = (changes: Record<string, string>) => room.admin.act("propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head: pushChange(room, c.lane, changes), summary: "s" });
    expect(expectRefusal(await propose(conflicted("src")), "jj-conflicts").fix).toMatch(/Resolve the jj conflicts/);
    expectRefusal(await propose({ "docs/readme.md": "more" }), "outside-claim");
    expectOk(await propose({ "src/app.ts": "v2" }));
  });

  it("R-POL-1: a proposal whose head has an invalid policy file is policy-invalid", async () => {
    const { room } = await shared();
    const c = await claim(room.admin, [".artroom/**"]);
    for (const text of ['{"format":"artroom-policy-v1","format":"dup"}', '{"format":"nope"}']) {
      const head = pushChange(room, c.lane, { ".artroom/policy.json": text });
      expectRefusal(await room.admin.act("propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "s" }), "policy-invalid");
    }
    await room.admin.ok("release", { lane: c.lane }, { lease: 1 });
  });

  it("R-ADMIN-1, R-OBL-2: a change under .artroom/** gets obl_admin-approval, and a maintainer who is not an admin cannot meet it", async () => {
    const { room, bob } = await shared();
    const carol = await addMember(room, "@carol", "maintainer");
    const c = await claim(bob, [".artroom/**"]);
    const head = pushChange(room, c.lane, { ".artroom/checkers/unit.json": JSON.stringify({ format: "artroom-checker-v1", volatile: false, timeoutSeconds: 60 }) });
    const p = await bob.ok<Proposal>("propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "checker" });
    expect(p.obligations.map((o) => o.id)).toEqual(["obl_admin-approval"]);
    expectRefusal(await carol.act("review", { lane: c.lane, generation: 1 }, { head, verdict: "approve", scope: [".artroom/**"], text: "ok" }), "not-authorized-reviewer");
    expect((await room.admin.ok("review", { lane: c.lane, generation: 1 }, { head, verdict: "approve", scope: [".artroom/**"], text: "ok" })).kind).toBe("review");
  });
});

describe("R-WS workspace credentials", () => {
  async function workspaceReady(room: TestRoom, holder: Client, lane: string, lease = 1): Promise<WorkspaceOp> {
    const op = expectOk(await holder.request<WorkspaceOp>({ kind: "workspace", lane: lane as never, lease }));
    await tick(room);
    return (await holder.read({ q: "op", op: op.id, until: ["ready", "failed"], timeoutMs: 1000 })) as WorkspaceOp;
  }

  it("R-WS-1, R-WS-2 (section 23, B watches A's workspace): B sees state, remote and lease generation, never a token; a token is the holder's, and only once the workspace is ready", async () => {
    const { room, alice, bob } = await shared();
    const c = await claim(alice, [`${own()}/**`]);
    expectRefusal(await alice.request({ kind: "workspace-token", lane: c.lane, lease: 1 }), "workspace-not-ready");
    const pending = expectOk(await alice.request<WorkspaceOp>({ kind: "workspace", lane: c.lane, lease: 1 }));
    expect(pending.state).toBe("pending");
    const bToken = await bob.session();
    expect((await call<WorkspaceOp>(room.stub.read(bToken, { q: "op", op: pending.id }))).lane).toBe(c.lane);
    await tick(room);
    const ready = await call<WorkspaceOp>(room.stub.read(bToken, { q: "op", op: pending.id, until: ["ready"], timeoutMs: 1000 }));
    expect(ready).toMatchObject({ state: "ready", detail: { remote: forkRemote(room, c.lane), leaseGeneration: 1 } });
    expect(Object.keys((ready as { detail: object }).detail).sort()).toEqual(["leaseGeneration", "remote"]);
    expect(JSON.stringify(ready)).not.toMatch(/token/i);
    expectRefusal(await bob.request({ kind: "workspace-token", lane: c.lane, lease: 1 }), "not-holder");
    const grant = expectOk(await alice.request<WorkspaceGrant>({ kind: "workspace-token", lane: c.lane, lease: 1 }));
    expect(grant).toMatchObject({ op: pending.id, lane: c.lane, leaseGeneration: 1, remote: forkRemote(room, c.lane) });
    expect(tokenLive(room, c.lane, grant.token)).toBe(true);
  });

  it("R-WS-2 (section 23): a token request with an old lease generation, under an expired delegation, after the key is revoked, and after the member is removed, is refused", async () => {
    const { room } = await shared();
    const a = await addMember(room, "@ws-a", "member");
    const scope = [`${own()}/**`];
    const c = await claim(a, scope);
    await workspaceReady(room, a, c.lane);
    await a.ok("release", { lane: c.lane }, { lease: 1 });
    await a.ok("claim", { lane: c.lane }, { scope, expectedGeneration: 0 });
    await workspaceReady(room, a, c.lane, 3);
    expectRefusal(await a.request({ kind: "workspace-token", lane: c.lane, lease: 1 }), "lease-fenced");
    expectOk(await a.request({ kind: "workspace-token", lane: c.lane, lease: 3 }));
    const k = newKeyPair();
    const grant = await a.ok<RosterRecord>("roster", null, { op: "delegate", to: k.key, kinds: ["propose"], lanes: "*", expiresAt: iso(clock.now + 60_000) });
    const delegated = new Client(room, k, grant.id);
    expectOk(await delegated.request({ kind: "workspace-token", lane: c.lane, lease: 3 }));
    advance(120_000);
    expectRefusal(await delegated.request({ kind: "workspace-token", lane: c.lane, lease: 3 }), "delegation-invalid");
    await room.admin.ok("roster", null, { op: "revoke-key", key: a.key, reason: "retired" });
    expectRefusal(await a.request({ kind: "workspace-token", lane: c.lane, lease: 3 }), "key-revoked");
    const b = await addMember(room, "@ws-b", "member");
    const c2 = await claim(b, [`${own()}/**`]);
    await workspaceReady(room, b, c2.lane);
    await room.admin.ok("roster", null, { op: "remove", member: "@ws-b" });
    expectRefusal(await b.request({ kind: "workspace-token", lane: c2.lane, lease: 1 }), "not-member");
  });

  it("R-WS-3, R-WS-4 (section 23): a lease's token is revoked when the lease ends, and it appears in no log entry, explanation, attention item, update, error or cached response", async () => {
    // A room of its own: every entry of its log is explained.
    const room = await makeRoom();
    const bob = await addMember(room, "@bob", "member");
    const c = await claim(room.admin, ["src/**"]);
    await workspaceReady(room, room.admin, c.lane);
    const g = expectOk(await room.admin.request<WorkspaceGrant>({ kind: "workspace-token", lane: c.lane, lease: 1 }));
    expect(tokenLive(room, c.lane, g.token)).toBe(true);
    expect(Date.parse(g.expiresAt)).toBeLessThanOrEqual(Date.parse((await laneOf(room, c.lane) as Lane & { lease: { expiresAt: string } }).lease.expiresAt));
    // Act after the grant so that every surface has something to say.
    await room.admin.ok("note", { act: c.id }, { text: "pushed" });
    const head = pushChange(room, c.lane, { "src/app.ts": "v2" });
    await room.admin.ok("propose", { lane: c.lane }, { lease: 1, expectedGeneration: 0, head, summary: "s" });
    await room.admin.ok("release", { lane: c.lane }, { lease: 1 });
    await tick(room);
    expect(tokenLive(room, c.lane, g.token)).toBe(false);
    const outputs: unknown[] = [];
    const tokenA = await room.admin.session();
    const tokenB = await bob.session();
    const log = await call<{ acts: LogEntry[] }>(room.stub.read(tokenA, { q: "log", req: { limit: 500 } }));
    outputs.push(log);
    for (const e of log.acts) outputs.push(await call(room.stub.read(tokenA, { q: "explain", act: idOf(e) as never })));
    outputs.push(await call(room.stub.read(tokenA, { q: "attention" })), await call(room.stub.read(tokenB, { q: "attention" })));
    outputs.push(await call(room.stub.poll(tokenA, undefined, 0)));
    // The released lease's workspace is gone from the view: the answer is not-found, and carries no token either.
    outputs.push(await room.stub.read(tokenB, { q: "op", op: g.op }));
    outputs.push(await call(room.stub.read(tokenB, { q: "lanes" })));
    outputs.push(await room.stub.request(room.admin.signedRequest({ kind: "workspace-token", lane: c.lane, lease: 1 })));
    outputs.push(await room.stub.read("ses_not-a-real-token", { q: "log" }));
    for (const o of outputs) expect(JSON.stringify(o)).not.toContain(g.token);
    // The HTTPS response that carries a grant is never cacheable.
    const res = await exports.default.fetch(`https://artroom.test/v1/rooms/${room.id}/requests`, {
      method: "POST",
      body: JSON.stringify(room.admin.signedRequest({ kind: "workspace-token", lane: c.lane, lease: 1 })),
    });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const httpLog = await exports.default.fetch(`https://artroom.test/v1/rooms/${room.id}/log?limit=500`, { headers: { Authorization: `Bearer ${tokenB}` } });
    expect(httpLog.headers.get("Cache-Control")).toBe("no-store");
    expect(await httpLog.text()).not.toContain(g.token);
  });
});

describe("concurrent admission", () => {
  it("R-LOG-1, R-LOG-2, R-LOG-4, R-ADM-6: 24 acts sent at once by three members get unique, gapless sequence numbers; the whole log is one hash chain, each entry signed by the room key", async () => {
    const { room, alice, bob } = await shared();
    const members = [room.admin, alice, bob];
    const base = (await headSeq(room)) + 1;
    const area = own();
    const results = await Promise.all(Array.from({ length: 24 }, (_, i) => members[i % 3]!.act<Claim>("claim", null, { goal: `g${i}`, scope: [`${area}/p${i}/**`] })));
    expect(results.map((r) => (r as Claim).seq).sort((a, b) => a - b)).toEqual(Array.from({ length: 24 }, (_, i) => base + i));
    // Everything this file's tests recorded in the shared room, refusals and system events included.
    const log = await entries(room);
    expect(log.length).toBe(base + 24);
    expect(chained(log)).toBe(true);
    for (const e of log.slice(-30)) expect(await verify(room.roomKey, "artroom-entry-v1", e.hash, e.roomSig)).toBe(true);
  });

  it("R-ADM-6: when the landing engine writes while an admission waits on policy, the admission decides again before it commits", async () => {
    const room = await makeRoom({ policy: policy(requireReview({ paths: "src/**", from: "role:maintainer", id: "code-review" })) });
    const alice = await addMember(room, "@alice", "member");
    const bob = await addMember(room, "@bob", "maintainer");
    const { lane, head } = await proposed(room, alice, ["src/**"], { "src/app.ts": "v2" });
    await bob.ok("review", { lane, generation: 1 }, { head, verdict: "approve", scope: ["src/**"], text: "ok" });
    const landing = await alice.ok<Landing>("land", { lane, generation: 1 }, { lease: 1, head });
    await tick(room);
    // Hold the next admission inside its policy evaluation, and wait until it is there.
    let open!: () => void;
    room.world.policy.gate = new Promise<void>((r) => (open = r));
    const calls = room.world.policy.calls.refuse;
    const pending = bob.act<ActRecord>("note", { act: landing.id }, { text: "while landing" });
    await until(async () => room.world.policy.calls.refuse > calls);
    // The engine reserves and publishes meanwhile, outside the admission queue.
    await inDO(room, (r) => r.core.landing.reconcile());
    room.world.policy.gate = null;
    open();
    const note = expectOk(await pending);
    // The decision made before the engine wrote was dropped, and made again on the state the note is sealed after.
    expect(room.world.policy.calls.refuse).toBeGreaterThanOrEqual(calls + 2);
    const log = await entries(room);
    expect(chained(log)).toBe(true);
    expect(note.seq).toBeGreaterThan(events(log, "land-reserved")[0]!.seq);
    expect(await opOf(room, landing.op.id)).toMatchObject({ state: "landed" });
  });
});
