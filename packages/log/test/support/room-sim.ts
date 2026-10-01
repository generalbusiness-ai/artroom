/**
 * A small Room simulator for golden logs. It seals entries in the
 * contract's order (R-LOG-2), evaluates real policy decisions with the
 * policy package and retains their replay contexts (R-LOG-7), and publishes
 * through `LogPublisher`. It records what an honest Room would record; the
 * tamper tests then change that.
 */

import type {
  ActId,
  Authority,
  Decision,
  Envelope,
  EntryContent,
  Genesis,
  KeyId,
  LogEntry,
  MemberId,
  PolicyDocument,
  Receipt,
  RefusalReceipt,
  RoomId,
  RuleInput,
  SignedEnvelope,
  SystemEvent,
} from "@generalbusiness/artroom-contract";
import { evaluateNotify, evaluateRefuse, policy, rule, type ActivePolicy, type RuleEvaluation } from "@generalbusiness/artroom-policy";
import { digestJson, keyPairFromSeed, sign, type KeyPair } from "../../src/crypto.ts";
import { entryId, makeCheckpoint, retain, roomIdOf, seal, type Retained } from "../../src/entries.ts";
import { LogPublisher, type PublishResult } from "../../src/publisher.ts";
import { MemoryGit, type GitRemote } from "../../src/git.ts";

export const seed = (n: number) => new Uint8Array(32).fill(n);
export const keys = {
  alice: keyPairFromSeed(seed(1)),
  recovery: keyPairFromSeed(seed(2)),
  room: keyPairFromSeed(seed(3)),
  bob: keyPairFromSeed(seed(4)),
  carol: keyPairFromSeed(seed(5)),
};

/** The demo policy: refuse whole-repository claims, notify the lane holder of every claim. */
export const DEMO_POLICY: PolicyDocument = policy(
  rule({ id: "narrow-claims", on: "claim", refuse: '"**" in act.body.scope', fix: "Claim only the paths you will change.", reason: "A claim on ** covers the whole repository." }),
  rule({ id: "holder-sees-claims", kind: "notify", on: ["claim"], to: ["holder"], why: "You claimed this lane." }),
);

const T0 = Date.parse("2026-10-01T12:00:00Z");

export class RoomSim {
  readonly entries: LogEntry[] = [];
  readonly retained: Retained[] = [];
  readonly genesis: Genesis;
  readonly room: RoomId;
  policy!: ActivePolicy;
  private idem = 0;

  constructor(admin: KeyPair = keys.alice, adminHandle: MemberId = "@alice") {
    this.genesis = {
      format: "artroom-log-v1",
      name: "demo/repo",
      repo: "demo-repo",
      admin: { handle: adminHandle, key: admin.key },
      recovery: keys.recovery.key,
      roomKey: keys.room.key,
      profile: { policy: "artroom-jsonata-v1", jsonata: "2.2.2" },
      createdAt: new Date(T0).toISOString(),
    };
    this.room = roomIdOf(this.genesis);
    this.system({ type: "genesis", genesis: this.genesis, sig: sign(admin.seed, "artroom-genesis-v1", this.genesis) });
    this.activate(DEMO_POLICY);
  }

  /** Room clock: one second per entry. */
  at(seq = this.entries.length): string {
    return new Date(T0 + seq * 1000).toISOString();
  }

  get last(): LogEntry {
    return this.entries.at(-1)!;
  }

  seal(entry: EntryContent["entry"]): LogEntry {
    const seq = this.entries.length;
    const e = seal({ format: "artroom-log-v1", seq, prev: seq === 0 ? null : this.last.hash, at: this.at(seq), entry }, keys.room.seed);
    this.entries.push(e);
    return e;
  }

  system(event: SystemEvent): LogEntry {
    return this.seal({ type: "system", event });
  }

  activate(doc: PolicyDocument): ActId {
    this.retained.push(retain("policy", doc));
    const e = this.system({ type: "policy-activated", policy: digestJson(doc), commit: null, previous: this.policy?.version ?? null, recomputed: { proposals: 0, reopened: 0, fenced: [] } });
    const id = entryId(e.seq, e.hash);
    this.policy = { doc, version: id };
    return id;
  }

  envelope(signer: KeyPair, kind: Envelope["kind"], target: unknown, body: unknown, delegation?: ActId): SignedEnvelope {
    const envelope = {
      v: 1,
      room: this.room,
      actor: signer.key,
      kind,
      target,
      body,
      idempotencyKey: `idem-${++this.idem}`,
      ...(delegation ? { delegation } : {}),
    } as unknown as Envelope;
    return { envelope, sig: sign(signer.seed, "artroom-envelope-v1", envelope) };
  }

  private keep(evaluations: readonly RuleEvaluation[]): Decision[] {
    for (const e of evaluations) this.retained.push(retain("input", e.context));
    return evaluations.map((e) => e.decision);
  }

  /** Evaluate the policy's refuse rules for this act, as admission step 9 does. */
  async refuseDecisions(act: SignedEnvelope, holder: MemberId | null) {
    const env = act.envelope;
    const input: Extract<RuleInput, { kind: "refuse" }> = {
      kind: "refuse",
      act: { kind: env.kind, target: env.target as never, body: env.body as never },
      actor: { member: holder, role: "admin", teams: [], delegated: false },
      lane: { id: null, claimed: false, holder: null, scope: [], generation: 0, purpose: "ordinary" },
      proposal: null,
      room: { admins: 1, members: 1 },
    };
    const r = await evaluateRefuse(this.policy, input);
    return { decisions: this.keep(r.evaluations), refusal: r.refusal };
  }

  /** An accepted act. `effects` default to none. */
  accept(act: SignedEnvelope, authority: Authority, decisions: readonly Decision[] = [], effects: Receipt["effects"] = [], flags: Receipt["flags"] = []): LogEntry {
    return this.seal({ type: "act", act, receipt: { outcome: "accepted", authority, decisions, effects, flags } });
  }

  refuse(act: SignedEnvelope, authority: Authority, decisions: readonly Decision[], refusal: RefusalReceipt["refusal"]): LogEntry {
    return this.seal({ type: "refusal", act, receipt: { outcome: "refused", authority, decisions, refusal } });
  }

  /** A claim, through refuse rules; accepted with an `opened` effect that names no lane (R-LOG-12). */
  async claim(signer: KeyPair, authority: Authority, scope: string[]): Promise<{ entry: LogEntry; lane: ActId | null }> {
    const act = this.envelope(signer, "claim", null, { goal: "Work on it", scope });
    const { decisions, refusal } = await this.refuseDecisions(act, authority.member);
    if (refusal) {
      const { act: _a, ...rest } = refusal as typeof refusal & { act?: unknown };
      return { entry: this.refuse(act, authority, decisions, rest), lane: null };
    }
    const lease = { holder: authority.member!, generation: 1, expiresAt: this.at(this.entries.length + 3600) };
    const entry = this.accept(act, authority, decisions, [{ type: "opened", purpose: "ordinary", lease }]);
    return { entry, lane: entryId(entry.seq, entry.hash) };
  }

  /** The `notify` outcome for an earlier entry, as a later `notified` event (R-LOG-13). */
  async notified(of: ActId, kind: Envelope["kind"], holder: MemberId): Promise<LogEntry> {
    const r = await evaluateNotify(
      this.policy,
      {
        kind: "notify",
        act: { id: of, kind, target: null, body: {} },
        actor: { member: holder, role: "admin", teams: [], delegated: false },
        lane: { id: of, claimed: true, holder, scope: [], generation: 0, purpose: "ordinary" },
        proposal: null,
      },
      { roles: {}, reviewers: [] },
    );
    const to = [...new Set(r.notify.map((n) => n.to as MemberId))];
    return this.system({ type: "notified", entry: of, decisions: this.keep(r.evaluations), to });
  }

  checkpoint() {
    return makeCheckpoint(this.room, keys.room.key, keys.room.seed, this.last, this.at(this.entries.length));
  }

  /** Publish everything so far, then record the `checkpoint` event (R-LOG-8 steps 1 to 5). */
  async publish(publisher: LogPublisher): Promise<PublishResult> {
    const r = await publisher.publish(this.entries, this.checkpoint(), this.retained);
    this.system({ type: "checkpoint", through: r.through, hash: r.hash, commit: r.commit });
    return r;
  }
}

export const memberAuthority = (handle: MemberId, key: KeyId, role: Authority["role"] = "admin"): Authority =>
  ({ via: "member", member: handle, role, key }) as Authority;

/**
 * The walk-through of protocol section 20, extended: genesis, policy, a
 * claim and its notification, publication C1, five more entries (an
 * invitation, a join, a second claim, its notification, a recorded
 * refusal), publication C2, and a third publication so the last checkpoint
 * event is itself published.
 */
export async function goldenLog(remote: GitRemote = new MemoryGit()) {
  const sim = new RoomSim();
  const publisher = new LogPublisher(remote);
  const alice = memberAuthority("@alice", keys.alice.key);
  const claim = await sim.claim(keys.alice, alice, ["src/**"]); // entry 2
  await sim.notified(claim.lane!, "claim", "@alice"); // entry 3
  const c1 = await sim.publish(publisher); // entry 4: checkpoint { through 3, C1 }
  // entries 5 to 9
  const secret = new Uint8Array(32).fill(9);
  const invite = sim.envelope(keys.alice, "roster", null, {
    op: "invite",
    member: "@bob",
    role: "member",
    custody: "client",
    expiresAt: sim.at(1000),
    secretHash: `sha256:${(await import("../../src/crypto.ts")).sha256Hex(secret)}`,
  });
  const inv = sim.accept(invite, alice); // 5
  const { b64url } = await import("../../src/crypto.ts");
  const join = sim.envelope(keys.bob, "roster", null, { op: "join", invitation: entryId(inv.seq, inv.hash), secret: b64url(secret) });
  sim.accept(join, { via: "join", member: "@bob", role: "member", key: keys.bob.key, invitation: entryId(inv.seq, inv.hash), custody: "client" }); // 6
  const bob = memberAuthority("@bob", keys.bob.key, "member");
  const claim2 = await sim.claim(keys.bob, bob, ["docs/**"]); // 7
  await sim.notified(claim2.lane!, "claim", "@bob"); // 8
  const refused = await sim.claim(keys.bob, bob, ["**"]); // 9: a recorded refusal
  const c2 = await sim.publish(publisher); // entry 10: checkpoint { through 9, C2 }
  const c3 = await sim.publish(publisher); // entry 11: checkpoint { through 10, C3 }
  return { sim, publisher, remote, c1, c2, c3, lanes: [claim.lane!, claim2.lane!], refused };
}
