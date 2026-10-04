/**
 * Acts on the Room, from a signed envelope to a landed lane.
 *
 * Admission, lanes and proposals: steps 1 to 6 and 10 of R-ADM-1,
 * identifiers (R-ID), signing (R-SIG), idempotency (R-IDEM), secret scanning
 * (R-SEC), runtime failures (R-ADM-9), lanes and leases (R-LANE), proposals
 * (R-PROP, R-PATH), workspace credentials (R-WS) and concurrent admission
 * (R-LOG-1, R-ADM-6). Most of these tests share one room: each opens its own
 * lane on its own paths, and checks what it recorded by the log's head
 * before and after.
 *
 * Landing, with lane B's engine on the Room's SQLite and a fake publisher
 * sandbox: invalidation before reservation (R-LAND-6, R-LAND-9), ordering
 * after reservation (R-LAND-8, R-REV-7), the abort attempt (R-REV-5,
 * R-REV-6), the stage-specific land rule (R-POL-6, R-LAND-4, R-LAND-7),
 * configuration recovery and sole-admin approval (R-ADMIN), recomputation
 * after a policy activation (R-POL-9), and checks: sealed carry judgments
 * (R-CARRY-13 to R-CARRY-15), jobs over the checker's service binding
 * (R-EXEC-8 to R-EXEC-10) and advisory obligations (R-OBL-7).
 *
 * One file, so that the Worker is loaded once for all of them.
 */

import { describe, expect, it } from "vitest";
import { env, exports } from "cloudflare:workers";
import { runDurableObjectAlarm } from "cloudflare:test";
import type {
  ActRecord,
  Check,
  CheckBody,
  CheckerConfig,
  CheckerService,
  CheckJob,
  Claim,
  Landing,
  Lane,
  LogEntry,
  Note,
  PolicyDocument,
  Proposal,
  Refusal,
  Release,
  Renewal,
  Review,
  RosterRecord,
  SystemEvent,
  WorkspaceGrant,
  WorkspaceOp,
} from "@generalbusiness/artroom-contract";
import { policy, requireCheck, requireReview, rule } from "@generalbusiness/artroom-policy/helpers";
import { starterPolicy } from "@generalbusiness/artroom-policy/pack";
import { checkerInputs, filterSnapshot, snapshotDigest, type SnapshotEntry } from "@generalbusiness/artroom-policy";
import { encodeCommit, gitObject, verifyLog } from "@generalbusiness/artroom-log";
import type { SnapshotPort } from "../../src/index.ts";
import { canonicalize } from "../../src/canonical.ts";
import { digestJson, verify } from "../../src/crypto.ts";
import { roomIdOf } from "../../src/ids.ts";
import { obligationsFor } from "../../src/obligations.ts";
import type { ActivePolicyFull } from "../../src/core.ts";
import { snapshotCommit, snapshotMessage } from "../../src/snapshot.ts";
import { chained, entries, events, headSeq, hold, idOf, inDO, land, once, opOf, proposed, read } from "./core-support.ts";
import { addMember, advance, call, Client, clock, configDigest, day, expectOk, expectRefusal, failure, forkRemote, isRefusal, iso, makeRoom, newKeyPair, pushChange, sign, tick, tokenLive, until, type TestRoom } from "./support.ts";

describe("admission, lanes and proposals", () => {
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
});

describe("landing, policy activation and checks", () => {
  const op = opOf;

  const reviewed = () => policy(requireReview({ paths: "src/**", from: "role:maintainer", id: "code-review" }));

  /** The reviewed policy with one land rule that blocks when `block` holds. */
  const withLandRule = (block: string): PolicyDocument => ({
    ...reviewed(),
    rules: [...reviewed().rules.filter((r) => r.kind !== "land"), { id: "stage-rule", kind: "land", block, reason: "Blocked at this stage.", fix: "None." }],
  });

  /** `who` proposes a change under `scope`, and Bob approves it; returns what is needed to land. */
  async function approvedLane(room: TestRoom, who: Client, bob: Client, area = "src") {
    const { lane, head } = await proposed(room, who, [`${area}/**`], { [`${area}/app.ts`]: "v2" });
    const review = await bob.ok<Review>("review", { lane, generation: 1 }, { head, verdict: "approve", scope: [`${area}/**`], text: "ok" });
    return { lane, head, review };
  }

  /** A room under `doc` where Alice proposed a src change and Bob approved it. */
  async function approved(doc: PolicyDocument = reviewed()) {
    const room = await makeRoom({ policy: doc });
    const alice = await addMember(room, "@alice", "member");
    const bob = await addMember(room, "@bob", "maintainer");
    return { room, alice, bob, ...(await approvedLane(room, alice, bob)) };
  }

  /** Activate a new policy version now, as an approved change to `.artroom/` would (R-PUB-9). */
  const activate = (r: TestRoom, change: (p: ActivePolicyFull) => Pick<ActivePolicyFull, "doc" | "checkers">) =>
    inDO(r, (room) => {
      const next = change(room.core.activePolicy());
      room.core.sql.transaction(() => room.core.activate(next.doc, next.checkers, null, iso(clock.now)));
    });

  describe("R-LAND-6, R-LAND-7 and R-LAND-9: a change before reservation ends the operation as retryable", () => {
    /** One room for these: no operation in it reaches reservation, so main never moves. */
    const shared = once(async () => {
      const room = await makeRoom({ policy: withLandRule("false") });
      return { room, alice: await addMember(room, "@alice", "member"), bob: await addMember(room, "@bob", "maintainer"), carol: await addMember(room, "@carol", "maintainer") };
    });
    let areas = 0;
    const lane = async (who?: Client) => {
      const s = await shared();
      const area = `src/part${++areas}`;
      return { ...s, area, ...(await approvedLane(s.room, who ?? s.alice, s.bob, area)) };
    };

    it("section 23, a release during preparation: retryable, reason released; a second land meanwhile is land-in-progress", async () => {
      const { room, alice, lane: id, head } = await lane();
      const l = await land(alice, id, head);
      expect(l.op).toMatchObject({ id: `op_land_${l.seq}`, state: "accepted" });
      expectRefusal(await alice.act("land", { lane: id, generation: 1 }, { lease: 1, head }), "land-in-progress");
      await alice.ok("release", { lane: id }, { lease: 1 });
      expect(await op(room, l.op.id)).toMatchObject({ state: "retryable", reason: "released" });
      expect(events(await entries(room), "land-outcome").at(-1)!.event).toEqual({ type: "land-outcome", op: l.op.id, outcome: { state: "retryable", reason: "released" } });
    });

    it("section 23, a new generation during preparation: retryable, reason generation-moved", async () => {
      const { room, alice, area, lane: id, head } = await lane();
      const l = await land(alice, id, head);
      await tick(room);
      const head2 = pushChange(room, id, { [`${area}/app.ts`]: "v3" }, head);
      await alice.ok("propose", { lane: id }, { lease: 1, expectedGeneration: 1, head: head2, summary: "v3" });
      expect(await op(room, l.op.id)).toMatchObject({ state: "retryable", reason: "generation-moved" });
    });

    it("section 23, Byte mismatch: a new objection between ready and reservation changes the land input; retryable, reason land-input-changed", async () => {
      const { room, alice, carol, lane: id, head } = await lane();
      const main = room.world.artifacts.main;
      const l = await land(alice, id, head);
      await tick(room);
      expect((await op(room, l.op.id)).state).toBe("ready");
      await carol.ok("review", { lane: id, generation: 1 }, { head, verdict: "object", scope: ["src/**"], text: "no" });
      await tick(room);
      expect(await op(room, l.op.id)).toMatchObject({ state: "retryable", reason: "land-input-changed" });
      expect(room.world.artifacts.main).toBe(main);
    });

    it("R-LAND-7: reservation judges the initiator's authority again; an initiator whose role no longer allows it is retryable, reason authority-lost", async () => {
      const { room } = await shared();
      const dave = await addMember(room, "@dave", "member");
      const { lane: id, head } = await lane(dave);
      const l = await land(dave, id, head);
      await tick(room);
      await room.admin.ok("roster", null, { op: "set-role", member: "@dave", role: "checker" });
      await tick(room);
      expect(await op(room, l.op.id)).toMatchObject({ state: "retryable", reason: "authority-lost" });
    });
  });

  describe("R-POL-7: the default land rule", () => {
    it("an open objection refuses the land act itself (objection-open)", async () => {
      // The shared room above has no default land rule: its one land rule replaces them.
      const { room, alice, lane, head } = await approved();
      const carol = await addMember(room, "@carol", "maintainer");
      await carol.ok("review", { lane, generation: 1 }, { head, verdict: "object", scope: ["src/**"], text: "no" });
      expectRefusal(await alice.act("land", { lane, generation: 1 }, { lease: 1, head }), "objection-open");
    });
  });

  describe("R-POL-9, R-LAND-5: a policy activation during preparation", () => {
    it("section 23: the operation is prepared again under the new version and still lands; the activation is sealed right after the landing that caused it (R-PUB-9)", async () => {
      const { room, alice, lane, head } = await approved();
      // The admin changes the policy on another lane; it lands first.
      const ac = await room.admin.ok<Claim>("claim", null, { goal: "policy", scope: [".artroom/**"] });
      const ph = pushChange(room, ac.lane, { ".artroom/policy.json": JSON.stringify(reviewed()) + "\n" });
      await room.admin.ok("propose", { lane: ac.lane }, { lease: 1, expectedGeneration: 0, head: ph, summary: "same rules, new file" });
      const r = await room.admin.ok<Review>("review", { lane: ac.lane, generation: 1 }, { head: ph, verdict: "approve", scope: [".artroom/**"], text: "sole admin" });
      // R-ADMIN-2: the only admin approves its own configuration change, and the approval says so.
      expect(r.flags).toContain("sole-admin-self-approval");
      const adminLand = await land(room.admin, ac.lane, ph);
      const aliceLand = await land(alice, lane, head);
      await tick(room, 2);
      expect(await op(room, adminLand.op.id)).toMatchObject({ state: "landed" });
      const log = await entries(room);
      const outcome = events(log, "land-outcome").find((e) => e.event.op === adminLand.op.id)!;
      const activated = events(log, "policy-activated").at(-1)!;
      expect(activated.seq).toBe(outcome.seq + 1);
      expect((activated.event as unknown as { recomputed: { fenced: string[] } }).recomputed.fenced).toContain(aliceLand.op.id);
      await tick(room, 4);
      const final = await op(room, aliceLand.op.id);
      expect(final.state).toBe("landed");
      expect(final.policyVersion).toBe(activated.id);
      expect(final.attempts).toBeGreaterThanOrEqual(2);
    });

    it("section 23, Recompute after activation (R-POL-9): reopened 0 at activation; land is refused until an obligations-recomputed event lists the new obligation; a require rule that fails blocks landing", async () => {
      const r = await makeRoom({ policy: policy(requireReview({ id: "rv", paths: "src/**", from: "@bob" })) });
      const bob = await addMember(r, "@bob", "maintainer");
      await addMember(r, "@carol", "maintainer");
      const { lane, head } = await proposed(r, r.admin, ["src/**"], { "src/app.ts": "v2" });
      await bob.ok("review", { lane, generation: 1 }, { head, verdict: "approve", scope: ["src/**"], text: "ok" });
      const next = policy(requireReview({ id: "rv", paths: "src/**", from: "@carol" }), requireReview({ id: "extra", paths: "src/**", from: "@carol" }));
      await activate(r, () => ({ doc: next, checkers: {} }));
      const activated = events(await entries(r), "policy-activated").at(-1)!;
      expect((activated.event as unknown as { recomputed: { reopened: number; proposals: number } }).recomputed).toMatchObject({ reopened: 0, proposals: 1 });
      expectRefusal(await r.admin.act("land", { lane, generation: 1 }, { lease: 1, head }), "obligation-open");
      await tick(r);
      const recomputed = events(await entries(r), "obligations-recomputed").at(-1)!;
      expect(recomputed.seq).toBeGreaterThan(activated.seq);
      expect(recomputed.event).toMatchObject({ lane, generation: 1, obligations: ["obl_rv", "obl_extra"], reopened: ["obl_rv"], policy: activated.id });
      expect((recomputed.event as unknown as { decisions: unknown[] }).decisions.length).toBeGreaterThan(0);
      // A require rule whose condition fails deterministically blocks landing.
      await activate(r, () => ({ doc: policy(requireReview({ id: "rv", paths: "src/**", from: "@carol", when: "1" })), checkers: {} }));
      await tick(r);
      expect((events(await entries(r), "obligations-recomputed").at(-1)!.event as { blocked?: { rule: string } }).blocked?.rule).toBe("policy-type-error");
      expectRefusal(await r.admin.act("land", { lane, generation: 1 }, { lease: 1, head }), "policy-type-error");
    });

    it("R-POL-9: policy-activated names the checkers as name and digest pairs, sorted by name", async () => {
      const zeta: CheckerConfig = { format: "artroom-checker-v1", volatile: false, timeoutSeconds: 10 };
      const alpha: CheckerConfig = { format: "artroom-checker-v1", volatile: true, timeoutSeconds: 20 };
      const r = await makeRoom({ files: { ".artroom/checkers/zeta.json": JSON.stringify(zeta), ".artroom/checkers/alpha.json": JSON.stringify(alpha) } });
      expect((events(await entries(r), "policy-activated")[0]!.event as unknown as { checkers: unknown }).checkers).toEqual([
        { name: "alpha", config: configDigest(digestJson(alpha)) },
        { name: "zeta", config: configDigest(digestJson(zeta)) },
      ]);
    });
  });

  describe("R-LAND-8 and R-REV-7: acts admitted while a reservation is held", () => {
    /** Land up to a push that the sandbox holds in flight. */
    async function publishing() {
      const s = await approved();
      const l = await land(s.alice, s.lane, s.head);
      await tick(s.room);
      expect((await op(s.room, l.op.id)).state).toBe("ready");
      s.room.world.landing.controls.pausePush = true;
      // The alarm reserves and starts the push.
      const flight = tick(s.room);
      await until(async () => (await op(s.room, l.op.id)).state === "publishing");
      const finish = async () => {
        s.room.world.landing.controls.pausePush = false;
        await flight;
        await tick(s.room);
      };
      return { ...s, l, finish };
    }

    it("section 23, Paused push; a new generation, an objection, a retired key's revocation and a release: each is admitted with after; the landing completes", async () => {
      const { room, alice, bob, lane, head, l, finish } = await publishing();
      expect(events(await entries(room), "land-reserved").at(-1)!.event).toMatchObject({ op: l.op.id, lane, generation: 1, publication: 1 });
      const head2 = pushChange(room, lane, { "src/app.ts": "v3" }, head);
      const afterActs = [
        await alice.ok("propose", { lane }, { lease: 1, expectedGeneration: 1, head: head2, summary: "v3" }),
        await bob.ok("review", { lane, generation: 1 }, { head, verdict: "object", scope: ["src/**"], text: "wait" }),
        await room.admin.ok("roster", null, { op: "revoke-key", key: bob.key, reason: "retired" }),
        await alice.ok("release", { lane }, { lease: 1 }),
      ];
      for (const a of afterActs) {
        expect(a.after).toBe(l.op.id);
        expect(a.flags).toContain("after-reservation");
      }
      await finish();
      expect(await op(room, l.op.id)).toMatchObject({ state: "landed", publication: 1 });
      expect(room.world.artifacts.main).toBe(head);
      expect(events(await entries(room), "land-outcome").filter((e) => e.event.op === l.op.id).map((e) => e.event.outcome.state)).toEqual(["landed"]);
      // After the slot is free, acts carry no `after`.
      expect((await room.admin.ok("note", { act: l.id }, { text: "done" })).after).toBeUndefined();
    });

    it("section 23, Paused push; a compromised key's revocation of evidence (R-REV-5, R-REV-6): an abort attempt is recorded at once; the push still lands; a revert lane opens", async () => {
      const { room, bob, review, head, l, finish } = await publishing();
      const rev = await room.admin.ok<RosterRecord>("roster", null, { op: "revoke-key", key: bob.key, reason: "compromised" });
      expect(rev.after).toBe(l.op.id);
      expect(rev.invalidated).toMatchObject({ evidence: [review.id], abortAttempt: l.op.id });
      // The abort attempt runs beside the push in flight: it revokes the publication token and is recorded.
      await until(async () => events(await entries(room), "abort-attempt").length > 0);
      expect(events(await entries(room), "abort-attempt").at(-1)!.event).toMatchObject({ op: l.op.id, attempt: { trigger: rev.id, key: bob.key, tokenRevoked: true } });
      expect((await op(room, l.op.id)).state).toBe("publishing");
      // The held push completes after all: revoking its token did not stop it, and the outcome is what happened.
      await finish();
      const done = await op(room, l.op.id);
      expect(done.state).toBe("landed");
      expect(room.world.artifacts.main).toBe(head);
      const revert = events(await entries(room), "revert-lane").at(-1)!;
      expect(revert.event).toEqual({ type: "revert-lane", of: l.op.id, scope: ["src/app.ts"], reason: "abort-after-landing" });
      expect((done as { revertLane?: string }).revertLane).toBe(revert.id);
      expect((await read(room, { q: "lane", lane: revert.id as never })) as Lane).toMatchObject({ state: "unheld", why: "opened-by-room", revertOf: l.op.id, scope: ["src/app.ts"] });
      expect((await read(room, { q: "attention" })).items.some((i) => i.why === "revert-lane")).toBe(true);
    });

    it("R-REV-5: with no push that can still land, the abort attempt ends in aborted and frees the slot", async () => {
      const { room, alice, bob, lane, head } = await approved();
      const l = await land(alice, lane, head);
      await tick(room);
      // A push that failed before anything was sent: nothing can still land.
      room.world.landing.controls.errorPushes = 1;
      await tick(room);
      expect((await op(room, l.op.id)).state).toBe("unresolved");
      expect(events(await entries(room), "publication-unresolved").length).toBe(1);
      await room.admin.ok("roster", null, { op: "revoke-key", key: bob.key, reason: "compromised" });
      await tick(room);
      expect(await op(room, l.op.id)).toMatchObject({ state: "aborted", abort: { key: bob.key } });
      expect(room.world.artifacts.main).not.toBe(head);
    });
  });

  describe("R-POL-6, R-LAND-4: the stage-specific land rule, and its sealed land-evaluated event", () => {
    /** The one land-evaluated event of an operation, with the land-outcome that follows it. */
    async function evaluated(room: TestRoom, l: Landing) {
      const log = await entries(room);
      const evs = events(log, "land-evaluated");
      expect(evs).toHaveLength(1);
      expect(evs[0]!.event).toMatchObject({ op: l.op.id, decisions: [expect.objectContaining({ rule: "stage-rule", kind: "land" })] });
      expect((evs[0]!.event as unknown as { landInput: string }).landInput).toMatch(/^sha256:[0-9a-f]{64}$/);
      const outcome = events(log, "land-outcome").at(-1)!;
      expect(outcome.seq).toBeGreaterThan(evs[0]!.seq);
      return outcome.event.outcome.state;
    }

    it("section 23: a rule that blocks only at stage reservation passes at admission, then fails preparation; the operation is never ready", async () => {
      const { room, alice, lane, head } = await approved(withLandRule('stage = "reservation"'));
      const l = await land(alice, lane, head);
      const decisions = ((await entries(room)).find((e) => e.seq === l.seq)!.entry as unknown as { receipt: { decisions: { rule: string; kind: string; outcome: { result: string } }[] } }).receipt.decisions;
      expect(decisions.find((d) => d.rule === "stage-rule")).toMatchObject({ kind: "land", outcome: { result: "pass" } });
      await tick(room, 3);
      expect(await op(room, l.op.id)).toMatchObject({ state: "failed", reason: { code: "refused", refusal: { rule: "stage-rule" } } });
      expect(room.world.artifacts.main).not.toBe(head);
      expect(await evaluated(room, l)).toBe("failed");
    });

    it("section 23: a rule that passes at both stages: ready with a land input digest, and unchanged state builds the same bytes at reservation and lands", async () => {
      const { room, alice, lane, head } = await approved(withLandRule("false"));
      const l = await land(alice, lane, head);
      await tick(room);
      const ready = await op(room, l.op.id);
      expect(ready.state).toBe("ready");
      expect((ready as { landInput?: string }).landInput).toMatch(/^sha256:[0-9a-f]{64}$/);
      await tick(room, 2);
      expect((await op(room, l.op.id)).state).toBe("landed");
      expect(await evaluated(room, l)).toBe("landed");
    });
  });

  describe("R-ADMIN configuration recovery and sole-admin approval", () => {
    const lockout = policy(
      rule({ id: "freeze", on: ["claim", "propose", "note", "review", "land", "release", "renew"], refuse: "true", fix: "Nothing can be done." }),
      rule({ id: "never-land", kind: "land", block: "true", reason: "Frozen.", fix: "None." }),
    );
    /** The lockout, plus a require rule nobody can meet: neither may apply on a recovery lane. */
    const strict: PolicyDocument = { ...lockout, rules: [...lockout.rules, ...policy(requireReview({ paths: ".artroom/**", from: "@nobody", id: "impossible" })).rules.filter((r) => r.kind === "require")] };

    async function recoveryLane(room: TestRoom, admin: Client) {
      const claim = await admin.ok<Claim>("claim", null, { goal: "Restore a working policy", scope: [".artroom/policy.json"], purpose: "config-recovery" });
      expectOk(await admin.request<{ id: string }>({ kind: "workspace", lane: claim.lane, lease: 1 }));
      await tick(room);
      expectOk(await admin.request({ kind: "workspace-token", lane: claim.lane, lease: 1 }));
      return claim;
    }

    it("section 23, Policy lockout (R-ADMIN-5 to R-ADMIN-9): the sole admin repairs the policy through a configuration-recovery lane that no policy rule judges, whatever the policy port does with the lane's purpose; policy-activated follows", async () => {
      const room = await makeRoom({ policy: strict });
      // A port that ignores the purpose: only the Room's own rule keeps policy off the recovery lane.
      room.world.policy.ignorePurpose = true;
      const bob = await addMember(room, "@bob", "member");
      // The lockout holds for ordinary work.
      expectRefusal(await bob.act("claim", null, { goal: "g", scope: ["src/**"] }), "freeze");
      // A recovery claim needs an admin's own key: not a member's, and not a key an admin delegated to.
      expectRefusal(await bob.act("claim", null, { goal: "g", scope: [".artroom/policy.json"], purpose: "config-recovery" }), "admin-required");
      const dk = newKeyPair();
      const grant = await room.admin.ok<RosterRecord>("roster", null, { op: "delegate", to: dk.key, kinds: "*", lanes: "*", expiresAt: iso(clock.now + day) });
      expectRefusal(await new Client(room, dk, grant.id).act("claim", null, { goal: "g", scope: [".artroom/policy.json"], purpose: "config-recovery" }), "admin-required");

      const claim = await recoveryLane(room, room.admin);
      expect(claim.flags).toContain("config-recovery");
      expect(claim.purpose).toBe("config-recovery");
      // A recovery proposal that also changes src/x.ts is refused recovery-scope.
      const bad = pushChange(room, claim.lane, { ".artroom/policy.json": JSON.stringify(policy()), "src/x.ts": "x" });
      expectRefusal(await room.admin.act("propose", { lane: claim.lane }, { lease: 1, expectedGeneration: 0, head: bad, summary: "too much" }), "recovery-scope");
      const head = pushChange(room, claim.lane, { ".artroom/policy.json": JSON.stringify(policy()) });
      const p = await room.admin.ok<Proposal>("propose", { lane: claim.lane }, { lease: 1, expectedGeneration: 0, head, summary: "Replace the frozen policy." });
      expect(p.obligations.map((o) => o.id)).toEqual(["obl_admin-approval"]);
      const review = await room.admin.ok<Review>("review", { lane: claim.lane, generation: 1 }, { head, verdict: "approve", scope: [".artroom/**"], text: "Restores the default rules." });
      expect(review.flags).toEqual(expect.arrayContaining(["config-recovery", "sole-admin-self-approval"]));
      const l = await land(room.admin, claim.lane, head);
      expect(l.flags).toContain("config-recovery");
      // No policy decision is recorded for the recovery-lane acts.
      const log = await entries(room);
      for (const id of [claim.id, p.id, review.id, l.id]) expect((log.find((x) => idOf(x) === id)!.entry as unknown as { receipt: { decisions: unknown[] } }).receipt.decisions).toEqual([]);
      await tick(room, 3);
      expect(await op(room, l.op.id)).toMatchObject({ state: "landed" });
      const after = await entries(room);
      const activated = events(after, "policy-activated").at(-1)!;
      expect(activated.seq).toBe(events(after, "land-outcome").at(-1)!.seq + 1);
      expect((activated.event as unknown as { commit: string }).commit).toBe(head);
      // The frozen policy is gone.
      expectOk(await bob.act("claim", null, { goal: "back to work", scope: ["src/**"] }));
    });

    it("section 23, Same lockout, two admins (R-ADMIN-5, R-ADMIN-7): the author's own approval is self-review, and the other admin's meets obl_admin-approval; a non-admin can neither act on the recovery lane nor take it over", async () => {
      const room = await makeRoom({ policy: lockout });
      const admin2 = await addMember(room, "@admin2", "admin");
      const bob = await addMember(room, "@bob", "member");
      const claim = await recoveryLane(room, room.admin);
      expectRefusal(await bob.act("note", { act: claim.id }, { text: "hi" }), "admin-required");
      const head = pushChange(room, claim.lane, { ".artroom/policy.json": JSON.stringify(policy()) });
      await room.admin.ok("propose", { lane: claim.lane }, { lease: 1, expectedGeneration: 0, head, summary: "repair" });
      expectRefusal(await room.admin.act("review", { lane: claim.lane, generation: 1 }, { head, verdict: "approve", scope: [".artroom/**"], text: "mine" }), "self-review");
      const r = await admin2.ok<Review>("review", { lane: claim.lane, generation: 1 }, { head, verdict: "approve", scope: [".artroom/**"], text: "ok" });
      expect(r.flags).not.toContain("sole-admin-self-approval");
      expect((await read(room, { q: "proposal", ref: { lane: claim.lane, generation: 1 } }))!.obligations[0]).toMatchObject({ id: "obl_admin-approval", state: "met" });
      await room.admin.ok("release", { lane: claim.lane }, { lease: 1 });
      expectRefusal(await bob.act("claim", { lane: claim.lane }, { scope: [".artroom/policy.json"], expectedGeneration: 1 }), "admin-required");
    });

    it("section 23, Sole admin changes policy (R-ADMIN-2): if a second admin joins before reservation, the flagged self-approval stops counting", async () => {
      const room = await makeRoom();
      const { lane, head } = await proposed(room, room.admin, [".artroom/**"], { ".artroom/policy.json": JSON.stringify(reviewed()) });
      const r = await room.admin.ok<Review>("review", { lane, generation: 1 }, { head, verdict: "approve", scope: [".artroom/**"], text: "sole admin" });
      expect(r.flags).toContain("sole-admin-self-approval");
      const l = await land(room.admin, lane, head);
      await tick(room);
      expect((await op(room, l.op.id)).state).toBe("ready");
      await addMember(room, "@second", "admin");
      await tick(room);
      expect(await op(room, l.op.id)).toMatchObject({ state: "retryable", reason: "obligation-open" });
    });
  });

  // ------------------------------------------------------------------ checks (contract amendment 3, section 29)

  type CheckCarried = Extract<SystemEvent, { type: "check-carried" }>;
  const carriedEvents = async (r: TestRoom) => events(await entries(r), "check-carried").map((e) => ({ seq: e.seq, id: e.id, ...(e.event as CheckCarried) }));

  const R = `sha256:${"0".repeat(64)}` as const;
  const S = `sha256:${"9".repeat(64)}` as const;
  /** Scoped, non-volatile, pinned to R. */
  const scoped: CheckerConfig = { format: "artroom-checker-v1", inputs: ["src/**"], volatile: false, timeoutSeconds: 60, runner: R };
  /** Whole tree, non-volatile, pinned to R. */
  const whole: CheckerConfig = { format: "artroom-checker-v1", volatile: false, timeoutSeconds: 60, runner: R };
  const advisory: CheckerConfig = { ...whole, advisory: true };
  const allowChecks = (allow: string) => ({ id: "checks", kind: "carry" as const, evidence: "check" as const, allow });

  /** A room whose policy requires the `unit` check of `cfg` by @ci on src changes. */
  async function checkRoom(cfg: CheckerConfig, rules: PolicyDocument["rules"] = []) {
    const base = policy(requireCheck("unit", { paths: "src/**", by: "@ci", id: "unit-tests" }));
    const doc: PolicyDocument = { ...base, rules: [...base.rules, ...rules] };
    // package.json is a global input: a scoped runner always receives it (R-CARRY-8).
    const r = await makeRoom({ policy: doc, files: { ".artroom/checkers/unit.json": JSON.stringify(cfg), "package.json": "{}" } });
    return { r, doc, alice: await addMember(r, "@alice", "member"), bob: await addMember(r, "@bob", "member"), ci: await addMember(r, "@ci", "checker") };
  }

  const srcChange = (r: TestRoom, who: Client) => proposed(r, who, ["src/**"], { "src/app.ts": "v2" });

  function entriesOf(r: TestRoom, integration: string): SnapshotEntry[] {
    return [...r.world.artifacts.blobs(integration as never)].map(([p, b]) => [p, "100644", b] as const);
  }

  /** The check body a checker signs: its input is the integration's tree, or the scoped snapshot of it. */
  async function bodyFor(r: TestRoom, cfg: CheckerConfig, doc: PolicyDocument, integration: string, extra: Partial<CheckBody> = {}) {
    const paths = checkerInputs(cfg.inputs, doc.carry);
    const input = paths ? { kind: "filtered", snapshot: await snapshotDigest(filterSnapshot(entriesOf(r, integration), paths)), paths } : { kind: "tree", tree: r.world.artifacts.treeOf(integration as never) };
    return { obligation: "obl_unit-tests", check: "unit", integration, input, config: digestJson(cfg), runner: cfg.runner ?? R, volatile: cfg.volatile, ok: true, detail: "42 passed", ...extra };
  }

  /**
   * Bob's docs landing moves main after Alice's check passed on her first integration I1; her landing is prepared
   * again on I2, and the Room judges carrying her check onto it. `setup` runs once the room has its members.
   */
  async function carryCase(cfg: CheckerConfig, rules: PolicyDocument["rules"] = [], setup?: (t: Awaited<ReturnType<typeof checkRoom>>) => void) {
    const t = await checkRoom(cfg, rules);
    setup?.(t);
    const { r, doc, alice, bob, ci } = t;
    const other = await proposed(r, bob, ["docs/**"], { "docs/guide.md": "more docs" });
    const first = await land(bob, other.lane, other.head);
    const mine = await srcChange(r, alice);
    const l = await land(alice, mine.lane, mine.head);
    await tick(r);
    const i1 = (await op(r, l.op.id)).integration!;
    const check = await ci.ok<Check>("check", { lane: mine.lane, generation: 1 }, await bodyFor(r, cfg, doc, i1));
    await tick(r, 4);
    expect(await op(r, first.op.id)).toMatchObject({ state: "landed" });
    return { ...t, l, mine, i1, check, after: await op(r, l.op.id) };
  }

  /**
   * Like `carryCase`, but the engine is driven step by step, so Alice's landing stops at ready, unreserved, with
   * her check carried onto I2. `beforeI2` runs after main moved, before her landing is prepared on I2.
   */
  async function carriedAndReady(beforeI2?: (r: TestRoom) => Promise<void>) {
    const t = await checkRoom(scoped);
    const { r, doc, alice, bob, ci } = t;
    await hold(r, "landing", "recompute");
    const other = await proposed(r, bob, ["docs/**"], { "docs/guide.md": "more" });
    const first = await land(bob, other.lane, other.head);
    const mine = await srcChange(r, alice);
    const l = await land(alice, mine.lane, mine.head);
    await inDO(r, async (room) => {
      await room.core.landing.prepare(first.op.id);
      await room.core.landing.prepare(l.op.id);
    });
    const i1 = (await op(r, l.op.id)).integration!;
    const check = await ci.ok<Check>("check", { lane: mine.lane, generation: 1 }, await bodyFor(r, scoped, doc, i1));
    await inDO(r, async (room) => {
      room.core.sql.transaction(() => room.core.landing.reserve(first.op.id));
      await room.core.landing.publish();
      await room.core.landing.refreshMain();
    });
    await beforeI2?.(r);
    await inDO(r, (room) => room.core.landing.prepare(l.op.id));
    const ready = await op(r, l.op.id);
    if (!beforeI2) expect(ready.state).toBe("ready");
    return { ...t, l, mine, i1, check, ready };
  }

  const statusOn = (r: TestRoom, lane: string, integration: string) =>
    inDO(r, (room) => {
      const p = room.core.activePolicy();
      return obligationsFor(room.core.sql, lane, 1, { doc: p.doc, checkers: p.checkers, integration: integration as never })[0]!;
    });

  /** Let the work a commit started finish, such as the proposal's preview. */
  const settled = (r: TestRoom) => inDO(r, (room) => room.core.idle());

  /** A checker service as a service binding gives it (R-EXEC-8). It records each job and answers as told. */
  function checkerService(r: TestRoom, ci: Client, answer: (job: CheckJob) => Partial<CheckBody> | "refuse" = () => ({})) {
    const seen: { job: CheckJob; tokenLive: boolean }[] = [];
    const service: CheckerService = {
      async handle(job) {
        const token = /^Authorization: Bearer (.+)$/.exec(job.gitAuthEnv.GIT_CONFIG_VALUE_0)![1]!;
        seen.push({ job, tokenLive: r.world.artifacts.canonicalRepo().admits(token, "read") });
        const a = answer(job);
        if (a === "refuse") return { refused: true, rule: "check-binding", reason: "refused by the test service", fix: "none" } satisfies Refusal;
        // The service signs the check outside the runner and submits it to the room (lane G's Checker does the same).
        const stub = env.ROOMS.get(env.ROOMS.idFromName(r.id)) as never;
        const signer = new Client({ id: r.id, stub }, ci.keys);
        const body = { obligation: job.obligation, check: job.check, integration: job.integration, input: job.input, config: job.config, runner: job.runner ?? R, volatile: job.volatile, ok: true, detail: "Machine-run check", ...(job.landOp ? { landOp: job.landOp } : {}), ...a };
        return signer.act<Check>("check", { lane: job.lane, generation: job.generation }, body);
      },
    };
    r.world.checkers["unit"] = service;
    return seen;
  }

  /** Snapshot repositories in place of the Room's own, to steer the commit written; `wrong` makes the publisher write another identity. */
  function snapshotRepos(r: TestRoom, mode: { wrong: boolean }) {
    const prepared: string[] = [];
    const repos: SnapshotPort = {
      async prepare(s) {
        prepared.push(s.commit);
        const files = filterSnapshot(entriesOf(r, s.integration), s.paths);
        const right = snapshotCommit(files, s.checker, s.digest);
        const tree = right.objects.at(-2)!.sha;
        const who = "Sandbox Git <git@sandbox.invalid> 1700000000 +0000";
        const commit = mode.wrong ? gitObject("commit", encodeCommit({ tree, parents: [], author: who, committer: who, message: snapshotMessage(s.checker, s.digest) })).sha : right.commit;
        return { commit, remote: `https://artifacts.test/artroom-public/snap-${commit}.git` };
      },
      async mint(_commit, _job, deadline) {
        return { token: "art_v1_snapshotjobtoken0000", expiresAt: deadline };
      },
      async end() {
        return 0;
      },
    };
    r.world.snapshots = repos;
    return prepared;
  }

  describe("R-CARRY-13: every check carry judgment is a sealed check-carried event", () => {
    it("R-CARRY-13, R-LOG-10 a carry rule refuses the check: a notCarried event with the decision, and a new job for I2; after an activation that allows it, a second event carries it under the new version, and the carry counts with that event; artroom verify replays every decision", async () => {
      let seen: { job: CheckJob }[] = [];
      const { r, l, mine, after, check } = await carryCase(scoped, [allowChecks("false")], ({ r, ci }) => {
        // The checker has a service and snapshot repositories; it answers no job, so only the test's check is recorded.
        snapshotRepos(r, { wrong: false });
        seen = checkerService(r, ci, () => "refuse");
      });
      expect(after).toMatchObject({ state: "preparing", waiting: ["obl_unit-tests"] });
      let evs = await carriedEvents(r);
      expect(evs).toHaveLength(1);
      expect(evs[0]).toMatchObject({ integration: after.integration, act: check.id, outcome: { carried: false, notCarried: { act: check.id, code: "policy-rejected", rule: "checks" } } });
      expect(evs[0]!.decisions.map((d) => [d.rule, d.outcome.result])).toEqual([["checks", "no-carry"]]);
      // The landing had one job for I1, and a new one for I2: it names the snapshot commit the Room recorded for I2, the
      // landing, and I2's base. (Its previews had jobs of their own.)
      const rec = await inDO(r, (room) => room.core.sql.all("SELECT commit_sha, digest FROM check_snapshots WHERE integration = ?", after.integration!)[0]!);
      const jobs = seen.filter((s) => s.job.landOp === after.id);
      expect(jobs).toHaveLength(2);
      expect(jobs[0]!.job.base).not.toBe(after.expectedMain);
      expect(jobs[1]!.job).toMatchObject({ integration: rec["commit_sha"], landOp: after.id, base: after.expectedMain, input: { kind: "filtered", snapshot: rec["digest"] } });

      // An activation whose carry rule allows it: the check is judged again, and carried.
      await activate(r, (p) => ({ doc: { ...p.doc, rules: [...p.doc.rules.filter((x) => x.id !== "checks"), allowChecks("true")] }, checkers: p.checkers }));
      await tick(r, 4);
      const done = await op(r, l.op.id);
      expect(done).toMatchObject({ state: "landed" });
      evs = await carriedEvents(r);
      expect(evs.map((e) => [e.act, e.outcome.carried, e.lane, e.decisions.length])).toEqual([
        [check.id, false, mine.lane, 1],
        [check.id, true, mine.lane, 1],
      ]);
      const ev = evs[1]!;
      expect(ev).toMatchObject({ op: done.id, generation: 1, integration: done.integration, obligation: "obl_unit-tests", outcome: { carried: true, reason: { code: "snapshot-identical", runner: R } } });
      expect(ev.decisions.map((d) => [d.rule, d.outcome.result])).toEqual([["checks", "carry"]]);
      expect(ev.policy).not.toBe(evs[0]!.policy);
      // The stored carry names its event, and the evidence shows the rule.
      expect(await inDO(r, (room) => room.core.sql.all("SELECT event, policy FROM check_carries"))).toEqual([{ event: ev.id, policy: ev.policy }]);
      expect((await statusOn(r, mine.lane, done.integration!)).evidence).toEqual([expect.objectContaining({ basis: "carried", act: check.id, rules: ["checks"] })]);

      const p = await call<{ through: number }>(r.stub.publishLog());
      const report = await verifyLog(r.world.artifacts.canonicalRepo());
      expect(report.failures).toEqual([]);
      expect(report).toMatchObject({ ok: true, verifiedThrough: p.through });
      const recorded = (await entries(r)).reduce((n, e) => {
        const x = e.entry as unknown as { receipt?: { decisions?: unknown[] }; event?: { decisions?: unknown[] } };
        return n + (x.receipt?.decisions?.length ?? 0) + (x.event?.decisions?.length ?? 0);
      }, 0);
      expect(report.decisionsReplayed).toBe(recorded);
    });

    it("R-CARRY-13 a policy activation after the carry: the carry stops counting, and the next judgment is a new event under the new version; a stored carry without its sealed event never counts", async () => {
      const { r, l, mine, ready, check } = await carriedAndReady();
      const before = await carriedEvents(r);
      expect(before).toHaveLength(1);
      expect(before[0]).toMatchObject({ act: check.id, outcome: { carried: true } });
      expect((await statusOn(r, mine.lane, ready.integration!)).state).toBe("met");
      await activate(r, (p) => ({ doc: p.doc, checkers: p.checkers }));
      expect((await statusOn(r, mine.lane, ready.integration!)).state).toBe("open");
      await inDO(r, async (room) => {
        await room.core.recompute();
        await room.core.landing.prepare(l.op.id);
        await room.core.landing.evaluate(l.op.id);
      });
      const evs = await carriedEvents(r);
      expect(evs).toHaveLength(2);
      expect(evs[1]).toMatchObject({ act: check.id, outcome: { carried: true } });
      expect(evs[1]!.policy).not.toBe(evs[0]!.policy);
      expect(evs[1]!.policy).toBe(await inDO(r, (room) => room.core.activePolicy().version));
      const integration = (await op(r, l.op.id)).integration!;
      expect((await statusOn(r, mine.lane, integration)).state).toBe("met");
      // Fail closed: as a Room that sealed no event would have stored the carry (and as rows from before this rule are).
      await inDO(r, (room) => room.core.sql.all("UPDATE check_carries SET event = NULL"));
      expect((await statusOn(r, mine.lane, integration)).state).toBe("open");
    });
  });

  describe("R-CARRY-14, R-CARRY-15: the runner pin, and a filtered job only for the recorded commit", () => {
    it("R-CARRY-14 the pin changes from R to S by an approved change; a check made under R is judged against the current pin and does not carry, and the judgment is not sealed twice", async () => {
      const pinS = { ...scoped, runner: S };
      const { r, ready, check } = await carriedAndReady(async (r) => {
        await activate(r, (p) => ({ doc: p.doc, checkers: { unit: { config: pinS, digest: digestJson(pinS) } } }));
        await inDO(r, (room) => room.core.recompute());
      });
      expect(ready).toMatchObject({ state: "preparing", waiting: ["obl_unit-tests"] });
      const evs = await carriedEvents(r);
      expect(evs).toHaveLength(1);
      expect(evs[0]).toMatchObject({ integration: ready.integration, act: check.id, outcome: { carried: false, notCarried: { code: "config-changed" } }, decisions: [] });
      expect(evs[0]!.policy).toBe(await inDO(r, (room) => room.core.activePolicy().version));
      expect(await inDO(r, (room) => room.core.sql.all("SELECT 1 FROM check_carries"))).toEqual([]);
      // Readiness again on the same integration and policy: the judgment stands, and is not sealed twice.
      await inDO(r, (room) => room.core.landing.evaluate(ready.id as never));
      expect(await carriedEvents(r)).toHaveLength(1);
    });

    it("R-CARRY-14 no runner pinned: the check never carries (runner-changed), though a carry rule allows it; a check on I2 itself meets the obligation, with any runner", async () => {
      const { runner: _pin, ...unpinned } = scoped;
      void _pin;
      const { r, doc, ci, mine, after, check } = await carryCase(unpinned, [allowChecks("true")]);
      expect(after).toMatchObject({ state: "preparing", waiting: ["obl_unit-tests"] });
      const evs = await carriedEvents(r);
      expect(evs).toHaveLength(1);
      expect(evs[0]).toMatchObject({ act: check.id, outcome: { carried: false, notCarried: { act: check.id, code: "runner-changed", text: "No runner environment is pinned" } }, decisions: [] });
      await ci.ok("check", { lane: mine.lane, generation: 1 }, await bodyFor(r, unpinned, doc, after.integration!, { runner: S }));
      await tick(r, 3);
      expect(await op(r, after.id)).toMatchObject({ state: "landed" });
    });

    it("R-CARRY-15 the publisher writes the snapshot with another identity: its ID differs and no job is issued; once it writes the recorded commit, the job is issued for it (R-CARRY-16 is in snapshot-repos.test.ts)", async () => {
      const { r, alice, ci } = await checkRoom(scoped);
      const mode = { wrong: true };
      const { lane, head } = await srcChange(r, alice);
      // Bound once the preview is computed: this test follows the landing's job.
      await settled(r);
      const prepared = snapshotRepos(r, mode);
      const seen = checkerService(r, ci);
      const l = await land(alice, lane, head);
      await tick(r, 2);
      const integration = (await op(r, l.op.id)).integration!;
      const rec = await inDO(r, (room) => room.core.sql.all("SELECT * FROM check_snapshots WHERE integration = ?", integration)[0]!);
      expect(prepared.length).toBeGreaterThan(0);
      expect(new Set(prepared)).toEqual(new Set([rec["commit_sha"]]));
      expect(seen).toEqual([]);
      expect(await inDO(r, (room) => room.core.sql.all("SELECT state FROM check_jobs"))).toEqual([{ state: "owed" }]);
      mode.wrong = false;
      clock.now += 600_000;
      await tick(r, 3);
      expect(seen).toHaveLength(1);
      expect(seen[0]!.job).toMatchObject({
        integration: rec["commit_sha"],
        input: { kind: "filtered", snapshot: rec["digest"], paths: JSON.parse(rec["paths"] as string) },
        readUrl: `https://artifacts.test/artroom-public/snap-${String(rec["commit_sha"])}.git`,
        landOp: l.op.id,
      });
      expect(await op(r, l.op.id)).toMatchObject({ state: "landed", integration });
    });
  });

  describe("R-EXEC-8 to R-EXEC-10: jobs go over the checker's service binding", () => {
    it("R-EXEC-8, R-EXEC-9, R-EXEC-10 a whole-tree job carries base, volatile, advisory, runner and a GitAuthEnv with a read token for the canonical repository, revoked after the answer", async () => {
      const { r, alice, ci } = await checkRoom(whole);
      const { lane, head } = await srcChange(r, alice);
      await settled(r);
      const seen = checkerService(r, ci);
      const l = await land(alice, lane, head);
      await tick(r, 3);
      const done = await op(r, l.op.id);
      expect(done).toMatchObject({ state: "landed" });
      // One job, for the landing's integration, before anything else was asked of the checker.
      const jobs = seen.filter((s) => s.job.landOp === l.op.id);
      expect(jobs).toHaveLength(1);
      const { job, tokenLive } = jobs[0]!;
      const canonical = r.world.artifacts.canonicalRepo();
      expect(job).toMatchObject({
        room: r.id,
        lane,
        generation: 1,
        head,
        obligation: "obl_unit-tests",
        check: "unit",
        integration: done.integration,
        base: done.expectedMain,
        input: { kind: "tree", tree: r.world.artifacts.treeOf(done.integration as never) },
        readUrl: canonical.remote,
        config: configDigest(digestJson(whole)),
        volatile: false,
        advisory: false,
        runner: R,
      });
      expect(Object.keys(job.gitAuthEnv).sort()).toEqual(["GIT_CONFIG_COUNT", "GIT_CONFIG_KEY_0", "GIT_CONFIG_VALUE_0"]);
      expect(job.gitAuthEnv).toMatchObject({ GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "http.extraHeader" });
      expect(tokenLive).toBe(true);
      const token = /^Authorization: Bearer (.+)$/.exec(job.gitAuthEnv.GIT_CONFIG_VALUE_0)![1]!;
      const minted = [...canonical.tokens.values()].find((t) => t.plaintext === token)!;
      expect(minted.scope).toBe("read");
      // The token expires before the job's deadline, by Room's margin (review 90f30a3b).
      expect(minted.expiresAt).toBeLessThanOrEqual(Date.parse(job.deadline));
      expect(canonical.admits(token, "read")).toBe(false);
      expect(await inDO(r, (room) => room.core.sql.all("SELECT state, outcome FROM check_jobs WHERE id || '_' || attempt = ?", job.id))).toEqual([{ state: "done", outcome: expect.stringMatching(/^act_/) }]);
    });

    /** A landing prepared step by step, with its job owed but not yet issued: the landing and jobs steps are held. */
    async function owedJob() {
      const { r, doc, alice, ci } = await checkRoom(whole);
      await hold(r, "landing", "jobs");
      const { lane, head } = await srcChange(r, alice);
      await settled(r);
      const seen = checkerService(r, ci);
      const l = await land(alice, lane, head);
      await inDO(r, (room) => room.core.landing.prepare(l.op.id));
      const waiting = await op(r, l.op.id);
      expect(waiting).toMatchObject({ state: "preparing", waiting: ["obl_unit-tests"] });
      expect(await inDO(r, (room) => room.core.sql.all("SELECT state FROM check_jobs"))).toEqual([{ state: "owed" }]);
      const issue = () =>
        inDO(r, async (room) => {
          await room.core.steps.jobs();
          await room.core.idle();
          return room.core.sql.all("SELECT state, outcome FROM check_jobs");
        });
      return { r, doc, alice, ci, seen, lane, l, waiting, issue };
    }

    it("R-EXEC-8 a job is not issued once its landing has ended", async () => {
      const { alice, seen, lane, l, r, issue } = await owedJob();
      await alice.ok("release", { lane }, { lease: 1 });
      expect((await op(r, l.op.id)).state).not.toMatch(/^(accepted|preparing|ready)$/);
      expect(await issue()).toEqual([{ state: "done", outcome: "not-needed" }]);
      expect(seen).toEqual([]);
    });

    it("R-EXEC-8 a job is not issued once its obligation is met on the integration", async () => {
      const { r, doc, ci, seen, lane, l, waiting, issue } = await owedJob();
      await ci.ok("check", { lane, generation: 1 }, { ...(await bodyFor(r, whole, doc, waiting.integration!)), landOp: l.op.id });
      expect(await issue()).toEqual([{ state: "done", outcome: "not-needed" }]);
      expect(seen).toEqual([]);
    });

    it("R-EXEC-10 the job's volatile is the configuration's; a check that says otherwise is check-binding and leaves no evidence, and one that agrees is admitted", async () => {
      const cfg: CheckerConfig = { ...whole, volatile: true };
      const { r, alice, ci } = await checkRoom(cfg);
      let flip = true;
      const { lane, head } = await srcChange(r, alice);
      await settled(r);
      const seen = checkerService(r, ci, (job) => (flip ? { volatile: !job.volatile } : {}));
      const l = await land(alice, lane, head);
      await tick(r, 2);
      const first = seen.find((s) => s.job.landOp === l.op.id)!.job;
      expect(first.volatile).toBe(true);
      expect(await inDO(r, (room) => room.core.sql.all("SELECT outcome FROM check_jobs WHERE id || '_' || attempt = ?", first.id))).toEqual([{ outcome: "refused: check-binding" }]);
      expect(await inDO(r, (room) => room.core.sql.all("SELECT act FROM evidence WHERE kind = 'check'"))).toEqual([]);
      flip = false;
      const integration = (await op(r, l.op.id)).integration!;
      expectOk(await ci.act("check", { lane, generation: 1 }, { ...(await bodyFor(r, cfg, policy(), integration)), landOp: l.op.id }));
      await tick(r, 3);
      expect(await op(r, l.op.id)).toMatchObject({ state: "landed" });
    });
  });

  describe("R-OBL-7: advisory obligations never block a landing", () => {
    const obligationOf = async (r: TestRoom, lane: string) => (await read(r, { q: "proposal", ref: { lane: lane as never, generation: 1 } }))!.obligations.find((o) => o.id === "obl_unit-tests")!;

    it("R-OBL-7 the obligation is advisory by its configuration: its job is still issued, and a failing check on the landing's integration is recorded while the landing proceeds; obligation-open is never raised for it", async () => {
      const { r, alice, ci } = await checkRoom(advisory);
      const seen = checkerService(r, ci, () => ({ ok: false, detail: "3 failed" }));
      const { lane, head } = await srcChange(r, alice);
      expect(await obligationOf(r, lane)).toMatchObject({ kind: "check", advisory: true });
      const l = await land(alice, lane, head);
      await tick(r, 3);
      const done = await op(r, l.op.id);
      expect(done).toMatchObject({ state: "landed" });
      expect(r.world.artifacts.main).toBe(head);
      expect(seen.map((s) => s.job)).toContainEqual(expect.objectContaining({ landOp: l.op.id, advisory: true }));
      const log = await entries(r);
      const failing = log.filter((e) => e.entry.type === "act" && e.entry.act.envelope.kind === "check" && (e.entry.act.envelope.body as CheckBody).ok === false);
      expect(failing.some((e) => (e.entry as { act: { envelope: { body: CheckBody } } }).act.envelope.body.integration === done.integration)).toBe(true);
      expect(JSON.stringify(log)).not.toMatch(/obligation-open|check-failed/);
    });

    it("R-OBL-7, R-REV-3 a landing does not rely on advisory evidence: a passing advisory check between readiness and reservation leaves the land input as it was, and the checker's key compromised before reservation reopens the obligation without stopping the landing", async () => {
      const { r, doc, alice, ci } = await checkRoom(advisory);
      await hold(r, "landing");
      const { lane, head } = await srcChange(r, alice);
      const l = await land(alice, lane, head);
      await inDO(r, (room) => room.core.landing.prepare(l.op.id));
      const ready = await op(r, l.op.id);
      expect(ready.state).toBe("ready");
      const retained = () => inDO(r, (room) => room.core.landing.core.get(l.op.id)!.retained!.digest);
      const input = await retained();
      // The advisory check passes and readiness is evaluated again: it is shown as met, but the landing does not rely on it.
      await ci.ok("check", { lane, generation: 1 }, await bodyFor(r, advisory, doc, ready.integration!));
      await inDO(r, (room) => room.core.landing.evaluate(l.op.id));
      expect(await obligationOf(r, lane)).toMatchObject({ advisory: true, state: "met" });
      expect(await retained()).toBe(input);
      const revoked = await r.admin.ok<RosterRecord>("roster", null, { op: "revoke-key", key: ci.key, reason: "compromised" });
      expect(revoked.invalidated?.reopened).toEqual([{ lane, generation: 1, obligation: "obl_unit-tests" }]);
      expect(await op(r, l.op.id)).toMatchObject({ state: "ready" });
      expect(await inDO(r, (room) => room.core.sql.transaction(() => room.core.landing.reserve(l.op.id)))).toMatchObject({ kind: "reserved" });
    });

    it("R-EXEC-8, R-CARRY-14, R-OBL-7, R-POL-9 with no service binding no job is owed, and the landing waits for a check; a check stating another runner than the pin is check-binding; an activation that makes the checker advisory lets the waiting landing proceed", async () => {
      const { r, doc, alice, ci } = await checkRoom(whole);
      const { lane, head } = await srcChange(r, alice);
      const l = await land(alice, lane, head);
      await tick(r, 2);
      const waiting = await op(r, l.op.id);
      expect(waiting).toMatchObject({ state: "preparing", waiting: ["obl_unit-tests"] });
      expect(await inDO(r, (room) => room.core.sql.all("SELECT id FROM check_jobs"))).toEqual([]);
      expect(await obligationOf(r, lane)).not.toHaveProperty("advisory");
      expect(expectRefusal(await ci.act("check", { lane, generation: 1 }, await bodyFor(r, whole, doc, waiting.integration!, { runner: S })), "check-binding").reason).toMatch(/pins/);
      await activate(r, (p) => ({ doc: p.doc, checkers: { unit: { config: advisory, digest: digestJson(advisory) } } }));
      await tick(r, 4);
      expect(await obligationOf(r, lane)).toMatchObject({ advisory: true });
      expect(await op(r, l.op.id)).toMatchObject({ state: "landed" });
    });
  });
});
