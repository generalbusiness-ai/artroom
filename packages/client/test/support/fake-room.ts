/**
 * A fake Room for tests. It implements the contract's wire (`RoomWire`) in
 * memory, and the HTTPS routes of `HttpRoutes` on a local server, with the
 * rules a client can observe: signature checks (R-SIG-5), idempotency
 * (R-IDEM), authority by case (R-ADM-3), invitation custody (R-ADM-12),
 * leases and generations (R-LANE), workspace grants (R-WS) and resumable
 * cursors (R-API-6). It is not the real room: obligations, policy and
 * landing are reduced to what the client tests need.
 *
 * Fault injection drops or cuts responses after the room has acted, to test
 * lost responses.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket as WsSocket } from "ws";
import {
  isRefusal,
  type ActId,
  type ActRecord,
  type ArtroomError,
  type AttentionItem,
  type Authority,
  type Claim,
  type Cursor,
  type DelegableKind,
  type Delegation,
  type Digest,
  type EnvelopeKind,
  type Explanation,
  type Genesis,
  type Invitation,
  type Joined,
  type KeyId,
  type LandOp,
  type Lane,
  type LaneId,
  type LogEntry,
  type LogPage,
  type Member,
  type MemberId,
  type Obligation,
  type OpByKind,
  type OpKind,
  type Page,
  type Proposal,
  type ReadQuery,
  type ReadResults,
  type Redeemed,
  type Redemption,
  type Refusal,
  type Result,
  type Role,
  type RoomId,
  type RoomWire,
  type Roster,
  type RosterOp,
  type Session,
  type SessionToken,
  type SignedEnvelope,
  type SignedRequest,
  type Signer,
  type Update,
  type UpdateStream,
  type WorkspaceGrant,
  type WorkspaceOp,
} from "@generalbusiness/artroom-contract";
import {
  artroomError,
  buildEnvelope,
  canonicalize,
  digestOf,
  generateSigner,
  newIdempotencyKey,
  randomToken,
  roomIdOf,
  signEnvelope,
  signValue,
  STATUS,
  verifyValue,
  WS_PROTOCOL,
  WS_TOKEN_PREFIX,
} from "../../src/index.ts";
import { sha256Hex } from "../../src/canonical.ts";

type Obj = Record<string, unknown>;
type Path = "submitted" | "room-redemption";

const LEASE_MS = 15 * 60_000;

export interface Fault {
  /** For example `POST /acts`, `POST /redeem`, `GET /lanes`. Matches the route after `/v1/rooms/:room`. */
  readonly route: string;
  /**
   * - `drop`: act, then close the connection without a response (a lost response).
   * - `partial`: act, then send the status line and half the body.
   * - `status`: answer with `status` and `body` without acting.
   */
  readonly kind: "drop" | "partial" | "status";
  readonly status?: number;
  readonly body?: unknown;
  times?: number;
}

interface KeyState {
  readonly member: MemberId;
  readonly custody: "client" | "room";
  readonly added: number;
  revoked?: { reason: "retired" | "compromised"; at: number; by: ActId };
}

interface MemberState {
  readonly handle: MemberId;
  role: Role;
  state: "active" | "removed";
  readonly joined: number;
}

interface InvitationState extends Invitation {}

interface Reader {
  readonly member: MemberId;
  readonly expiresAt: number;
}

interface LaneState {
  readonly lane: LaneId;
  readonly seq: number;
  goal: string;
  plan?: string;
  scope: readonly string[];
  holder: MemberId | null;
  leaseGeneration: number;
  expiresAt: number;
  why?: "released" | "expired";
  handover?: ActId;
  generations: Proposal[];
  landing?: string;
}

interface AttentionState {
  readonly to: MemberId;
  readonly item: AttentionItem;
}

/** Everything the room ever sent or stored, for leak scans. */
export interface Exposure {
  readonly sessions: string[];
  readonly bearers: string[];
  readonly grants: string[];
}

export class FakeRoom {
  readonly name: string;
  id!: RoomId;
  roomKey!: Signer;
  admin!: { signer: Signer; handle: MemberId };
  readonly entries: LogEntry[] = [];
  readonly members = new Map<MemberId, MemberState>();
  readonly keys = new Map<KeyId, KeyState>();
  readonly delegations = new Map<ActId, Delegation>();
  readonly invitations = new Map<ActId, InvitationState>();
  readonly lanes = new Map<LaneId, LaneState>();
  readonly ops = new Map<string, WorkspaceOp | LandOp>();
  readonly attentionItems: AttentionState[] = [];
  readonly faults: Fault[] = [];
  /** Every HTTP request the server saw: method, route and status. */
  readonly requests: { method: string; route: string; status: number }[] = [];
  readonly exposure: Exposure = { sessions: [], bearers: [], grants: [] };
  publishedThrough = 0;
  clock: () => number;
  /** How many reads a workspace stays `pending`. */
  workspaceDelay = 1;
  /** Handles `POST /mcp`. Set by the MCP tests. */
  mcp: ((request: Request, room: FakeRoom) => Promise<Response>) | undefined;
  url = "";
  /** Other room IDs this server answers to, to test genesis checks. */
  aliases: string[] = [];

  readonly #idem = new Map<string, { bytes: string; result: Result<ActRecord> }>();
  readonly #readers = new Map<string, Reader>();
  readonly #bearers = new Map<string, { member: MemberId; delegation: ActId; signer: Signer; expiresAt: number }>();
  readonly #nonces = new Set<string>();
  readonly #grants = new Map<string, { lane: LaneId; leaseGeneration: number }>();
  readonly #sockets = new Set<WsSocket>();
  readonly #waiters = new Set<() => void>();
  #server: Server | undefined;
  #wss: WebSocketServer | undefined;

  private constructor(name: string, clock: () => number) {
    this.name = name;
    this.clock = clock;
  }

  static async create(opts: { name?: string; clock?: () => number } = {}): Promise<FakeRoom> {
    const room = new FakeRoom(opts.name ?? "acme/web", opts.clock ?? Date.now);
    room.roomKey = (await generateSigner()).signer;
    const admin = (await generateSigner()).signer;
    const recovery = (await generateSigner()).signer;
    room.admin = { signer: admin, handle: "@admin" };
    const genesis: Genesis = {
      format: "artroom-log-v1",
      name: room.name,
      repo: "acme-web",
      admin: { handle: "@admin", key: admin.key },
      recovery: recovery.key,
      roomKey: room.roomKey.key,
      profile: { policy: "artroom-jsonata-v1", jsonata: "2.2.2" },
      createdAt: new Date(room.clock()).toISOString(),
    };
    room.id = await roomIdOf(genesis);
    await room.#seal({ type: "system", event: { type: "genesis", genesis, sig: await signValue("artroom-genesis-v1", genesis, admin) } });
    room.members.set("@admin", { handle: "@admin", role: "admin", state: "active", joined: 0 });
    room.keys.set(admin.key, { member: "@admin", custody: "client", added: 0 });
    return room;
  }

  now(): number {
    return this.clock();
  }

  iso(ms = this.now()): string {
    return new Date(ms).toISOString();
  }

  // ------------------------------------------------------------------ log

  async #seal(entry: LogEntry["entry"]): Promise<LogEntry> {
    const seq = this.entries.length;
    const prev = seq === 0 ? null : this.entries[seq - 1]!.hash;
    const content = { format: "artroom-log-v1" as const, seq, prev, at: this.iso(), entry };
    const hash = await digestOf(content);
    const sealed: LogEntry = { ...content, hash, roomSig: await signValue("artroom-entry-v1", hash, this.roomKey) };
    this.entries.push(sealed);
    this.publishedThrough = Math.max(0, seq - 1);
    this.#wake();
    return sealed;
  }

  static idOf(e: LogEntry): ActId {
    return `act_${e.seq}_${e.hash.slice(7, 15)}`;
  }

  entryById(id: string): LogEntry | undefined {
    const m = /^act_(\d+)_([0-9a-f]{8})$/.exec(id);
    if (!m) return undefined;
    const e = this.entries[Number(m[1])];
    return e && FakeRoom.idOf(e) === id ? e : undefined;
  }

  #wake(): void {
    for (const w of [...this.#waiters]) w();
    void this.#pushSockets();
  }

  async #until(test: () => boolean, ms: number): Promise<boolean> {
    const deadline = Date.now() + ms;
    while (!test()) {
      const left = deadline - Date.now();
      if (left <= 0) return false;
      await new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(t);
          this.#waiters.delete(done);
          resolve();
        };
        const t = setTimeout(done, Math.min(left, 20));
        this.#waiters.add(done);
      });
    }
    return true;
  }

  // ------------------------------------------------------------ authority

  #authority(env: SignedEnvelope["envelope"], path: Path): Authority | Refusal {
    const body = env.body as Obj;
    const keyState = this.keys.get(env.actor);
    if (keyState?.revoked) return refusal("key-revoked", "The signing key was revoked.");
    if (env.delegation !== undefined) {
      const d = this.delegations.get(env.delegation);
      if (!d || d.revoked !== undefined || Date.parse(d.expiresAt) <= this.now() || d.grantee !== env.actor) {
        return refusal("delegation-invalid", "The delegation is unknown, expired, revoked, or not granted to this key.");
      }
      if (env.kind === "roster") return refusal("delegation-invalid", "A delegation never covers roster acts (R-ADM-5).");
      if (d.kinds !== "*" && !d.kinds.includes(env.kind as DelegableKind)) return refusal("delegation-invalid", `The delegation does not cover ${env.kind}.`);
      const grantor = this.keys.get(d.grantor);
      const m = grantor ? this.members.get(grantor.member) : undefined;
      if (!grantor || grantor.revoked || !m || m.state !== "active") return refusal("delegation-invalid", "The grantor is no longer active.");
      return { via: "delegation", member: m.handle, role: m.role, key: env.actor, delegation: d.id, grantor: d.grantor };
    }
    if (env.kind === "roster" && body["op"] === "join") {
      const inv = this.invitations.get(body["invitation"] as ActId);
      if (!inv || inv.used !== undefined || Date.parse(inv.expiresAt) <= this.now()) return refusal("invitation-invalid", "The invitation is unknown, used or expired.");
      if (typeof body["secret"] !== "string") return refusal("invitation-invalid", "The invitation secret does not match.");
      if (keyState !== undefined) return refusal("key-in-use", "This key already belongs to a member.");
      const expected = path === "submitted" ? "client" : "room";
      if (inv.custody !== expected) {
        return refusal(
          "custody-mismatch",
          inv.custody === "room" ? "This invitation is for an MCP agent, with a key the room holds." : "This invitation is for a key you hold.",
          inv.custody === "room" ? "Redeem it with `artroom redeem`." : "Redeem it with `artroom login`.",
        );
      }
      const existing = this.members.get(inv.member);
      return { via: "join", member: inv.member, role: existing?.role ?? inv.role ?? "member", key: env.actor, invitation: inv.id, custody: inv.custody };
    }
    if (!keyState) return refusal("not-member", "The signing key belongs to no member.");
    const m = this.members.get(keyState.member);
    if (!m || m.state !== "active") return refusal("not-member", "The member was removed.");
    if (m.role === "checker" && !["check", "note"].includes(env.kind)) return refusal("role-forbids", `A checker may not sign ${env.kind}.`);
    if (env.kind === "roster" && !["delegate", "undelegate"].includes(body["op"] as string) && m.role !== "admin") {
      return refusal("admin-required", "Only an admin may do that.");
    }
    return { via: "member", member: m.handle, role: m.role, key: env.actor };
  }

  /** The shared admission for `POST /acts`, `submit` and both redemptions (R-ADM-1, R-ADM-12). */
  async admit(signed: SignedEnvelope, path: Path): Promise<Result<ActRecord>> {
    const env = signed.envelope;
    if (typeof env !== "object" || env === null || env.v !== 1) throw artroomError("bad-request", "Not an envelope.");
    if (env.room !== this.id) throw artroomError("unauthenticated", "The envelope is for another room.");
    if (!(await verifyValue("artroom-envelope-v1", env, signed.sig, env.actor))) throw artroomError("unauthenticated", "The signature does not verify.");
    const idemKey = `${env.actor}|${env.idempotencyKey}`;
    const bytes = canonicalize(env);
    const seen = this.#idem.get(idemKey);
    if (seen) {
      if (seen.bytes === bytes) return seen.result;
      return refusal("idempotency-mismatch", `The idempotency key was used for a different act, ${isRefusal(seen.result) ? seen.result.act : seen.result.id}.`);
    }
    const authority = this.#authority(env, path);
    if (isRefusal(authority)) return authority;
    if (env.kind === "roster" && (env.body as Obj)["op"] === "join") {
      const inv = this.invitations.get((env.body as Obj)["invitation"] as ActId)!;
      const hash = `sha256:${await sha256Hex(new TextEncoder().encode((env.body as Obj)["secret"] as string))}`;
      if (hash !== inv.secretHash) return refusal("invitation-invalid", "The invitation secret does not match.");
    }
    const result = await this.#apply(signed, authority);
    if (!isRefusal(result) || result.act !== undefined) this.#idem.set(idemKey, { bytes, result });
    return result;
  }

  async #record(signed: SignedEnvelope, authority: Authority, effects: readonly Obj[] = []): Promise<LogEntry> {
    return this.#seal({
      type: "act",
      act: signed,
      receipt: { outcome: "accepted", authority, decisions: [], effects: effects as never, flags: [] },
    });
  }

  async #refuse(signed: SignedEnvelope, authority: Authority, r: Refusal): Promise<Refusal> {
    const { act: _a, ...rest } = r;
    const e = await this.#seal({ type: "refusal", act: signed, receipt: { outcome: "refused", authority, decisions: [], refusal: rest } });
    return { ...r, act: FakeRoom.idOf(e) };
  }

  #base(e: LogEntry, kind: EnvelopeKind, by: Authority) {
    return { id: FakeRoom.idOf(e), seq: e.seq, kind, by, at: e.at, flags: [] as const };
  }

  #held(lane: LaneState): Lane {
    const base = {
      lane: lane.lane,
      purpose: "ordinary" as const,
      goal: lane.goal,
      ...(lane.plan !== undefined ? { plan: lane.plan } : {}),
      scope: lane.scope,
      generation: lane.generations.length,
      generations: lane.generations.map((p) => ({ generation: p.generation, head: p.head, act: p.id })),
      overlaps: [],
      ...(lane.landing !== undefined ? { landing: lane.landing as `op_${string}` } : {}),
    };
    if (lane.holder !== null) return { ...base, state: "held", lease: { holder: lane.holder, generation: lane.leaseGeneration, expiresAt: this.iso(lane.expiresAt) } };
    return { ...base, state: "unheld", lease: null, leaseGeneration: lane.leaseGeneration, why: lane.why ?? "released", ...(lane.handover ? { handover: lane.handover } : {}) };
  }

  #attend(to: MemberId, item: Omit<AttentionItem, "id" | "seq" | "open"> & Obj, seq: number): void {
    const id = `att_${this.attentionItems.length + 1}`;
    this.attentionItems.push({ to, item: { ...item, id, seq, open: true } as AttentionItem });
    this.#wake();
  }

  /** Lane checks for holder acts (R-LANE-3, R-LANE-6). */
  #laneCheck(lane: LaneState | undefined, member: MemberId, lease: number): Refusal | undefined {
    if (!lane) return refusal("lane-unknown", "There is no such lane.");
    if (lane.holder === null || lane.holder !== member) return refusal("not-holder", "You do not hold this lane.", "Claim the lane first, or ask its holder.");
    if (lane.leaseGeneration !== lease) {
      return { ...refusal("lease-fenced", `Your lease ${lease} has ended; the lane is at lease ${lane.leaseGeneration}.`, "Claim the lane again."), current: { leaseGeneration: lane.leaseGeneration } };
    }
    return undefined;
  }

  async #apply(signed: SignedEnvelope, by: Authority): Promise<Result<ActRecord>> {
    const env = signed.envelope;
    const body = env.body as Obj;
    const target = env.target as Obj | null;
    const member = by.member as MemberId;
    switch (env.kind) {
      case "roster": {
        const op = body as RosterOp;
        if (op.op === "invite") {
          const e = await this.#record(signed, by);
          const id = FakeRoom.idOf(e);
          this.invitations.set(id, {
            id,
            member: op.member,
            ...(op.role ? { role: op.role } : {}),
            custody: op.custody,
            expiresAt: op.expiresAt,
            secretHash: op.secretHash,
            ...(op.session ? { session: op.session } : {}),
          });
          return { ...this.#base(e, "roster", by), op, invitation: id } as ActRecord;
        }
        if (op.op === "join") {
          const inv = this.invitations.get(op.invitation)!;
          const e = await this.#record(signed, by);
          (inv as { used?: number }).used = e.seq;
          if (!this.members.has(inv.member)) this.members.set(inv.member, { handle: inv.member, role: inv.role ?? "member", state: "active", joined: e.seq });
          this.keys.set(env.actor, { member: inv.member, custody: inv.custody, added: e.seq });
          return { ...this.#base(e, "roster", by), op } as ActRecord;
        }
        if (op.op === "delegate") {
          const e = await this.#record(signed, by);
          const id = FakeRoom.idOf(e);
          this.delegations.set(id, { id, grantor: env.actor, grantee: op.to, kinds: op.kinds, lanes: op.lanes, expiresAt: op.expiresAt });
          return { ...this.#base(e, "roster", by), op } as ActRecord;
        }
        if (op.op === "revoke-key") {
          const e = await this.#record(signed, by);
          const k = this.keys.get(op.key);
          if (k) k.revoked = { reason: op.reason, at: e.seq, by: FakeRoom.idOf(e) };
          return { ...this.#base(e, "roster", by), op } as ActRecord;
        }
        return refusal("invalid-body", `The fake room does not implement ${op.op}.`);
      }
      case "claim": {
        if (target === null) {
          const scope = body["scope"] as string[];
          if (!Array.isArray(scope) || scope.length === 0 || scope.some((g) => /[?[\]{}!\\]|^\/|\/\/|(^|\/)\.\.?(\/|$)/.test(g))) {
            return this.#refuse(signed, by, refusal("glob-invalid", "A scope pattern is not a valid glob.", "Use globs such as src/** or src/*.ts."));
          }
          const lease = { holder: member, generation: 1, expiresAt: this.iso(this.now() + LEASE_MS) };
          const e = await this.#record(signed, by, [{ type: "opened", purpose: "ordinary", lease }]);
          const lane = FakeRoom.idOf(e);
          const overlaps = [...this.lanes.values()]
            .filter((l) => l.holder !== null && l.scope.some((t) => scope.some((m) => overlap(m, t))))
            .map((l) => {
              const theirs = l.scope.find((t) => scope.some((m) => overlap(m, t)))!;
              return { lane: l.lane, holder: l.holder, mine: scope.find((m) => overlap(m, theirs))!, theirs, certain: false };
            });
          const state: LaneState = {
            lane,
            seq: e.seq,
            goal: body["goal"] as string,
            ...(body["plan"] !== undefined ? { plan: body["plan"] as string } : {}),
            scope,
            holder: member,
            leaseGeneration: 1,
            expiresAt: this.now() + LEASE_MS,
            generations: [],
          };
          this.lanes.set(lane, state);
          const claim: Claim = {
            ...this.#base(e, "claim", by),
            kind: "claim",
            lane,
            purpose: "ordinary",
            goal: state.goal,
            ...(state.plan !== undefined ? { plan: state.plan } : {}),
            scope,
            lease,
            overlaps,
            effect: { type: "opened", purpose: "ordinary", lease },
          };
          return claim;
        }
        const lane = this.lanes.get(target["lane"] as LaneId);
        if (!lane) return refusal("lane-unknown", "There is no such lane.");
        if (body["lease"] !== undefined) {
          const bad = this.#laneCheck(lane, member, body["lease"] as number);
          if (bad) return this.#refuse(signed, by, bad);
          lane.scope = body["scope"] as string[];
        } else {
          if (lane.holder !== null) return this.#refuse(signed, by, refusal("lane-held", `The lane is held by ${lane.holder}.`, "Wait for a release, or write a note to the holder."));
          lane.holder = member;
          lane.leaseGeneration += 1;
          lane.scope = body["scope"] as string[];
        }
        lane.expiresAt = this.now() + LEASE_MS;
        const lease = { holder: member, generation: lane.leaseGeneration, expiresAt: this.iso(lane.expiresAt) };
        const e = await this.#record(signed, by);
        return {
          ...this.#base(e, "claim", by),
          kind: "claim",
          lane: lane.lane,
          purpose: "ordinary",
          goal: lane.goal,
          scope: lane.scope,
          lease,
          overlaps: [],
          effect: body["lease"] !== undefined ? { type: "rescoped", lane: lane.lane, scope: lane.scope, obligationsRecomputed: false } : { type: "taken-over", lane: lane.lane, lease, previous: null },
        } as Claim;
      }
      case "propose": {
        const lane = this.lanes.get(target!["lane"] as LaneId);
        const bad = this.#laneCheck(lane, member, body["lease"] as number);
        if (bad) return lane ? this.#refuse(signed, by, bad) : bad;
        if (body["expectedGeneration"] !== lane!.generations.length) {
          return this.#refuse(signed, by, {
            ...refusal("generation-moved", `The lane is at generation ${lane!.generations.length}, not ${String(body["expectedGeneration"])}.`, `Propose again with expectedGeneration ${lane!.generations.length}.`),
            current: { generation: lane!.generations.length },
          });
        }
        const generation = lane!.generations.length + 1;
        const e = await this.#record(signed, by, [{ type: "proposed", lane: lane!.lane, generation, head: body["head"] }]);
        lane!.expiresAt = this.now() + LEASE_MS;
        const obligation: Obligation = {
          id: "obl_review",
          rule: "review",
          policy: FakeRoom.idOf(this.entries[0]!),
          paths: [],
          kind: "review",
          from: ["role:member", "role:maintainer", "role:admin"],
          count: 1,
          allowSelf: false,
          state: "open",
          evidence: [],
        };
        const proposal: Proposal = {
          ...this.#base(e, "propose", by),
          kind: "propose",
          lane: lane!.lane,
          generation,
          head: body["head"] as never,
          base: "0".repeat(40) as never,
          pinnedRef: `refs/artroom/heads/${lane!.lane}/${generation}`,
          summary: body["summary"] as string,
          changed: [],
          obligations: [obligation],
          notCarried: [],
          preview: { id: `op_preview_${e.seq}`, kind: "preview", updatedAt: e.at, lane: lane!.lane, generation, state: "pending" },
        };
        lane!.generations.push(proposal);
        for (const m of this.members.values()) {
          if (m.handle !== member && m.state === "active" && m.role !== "checker") {
            this.#attend(m.handle, { why: "review-requested", proposal: { lane: lane!.lane, generation }, obligation: "obl_review", as: `role:${m.role}`, lane: lane!.lane, text: `Review ${lane!.goal} (generation ${generation}).` }, e.seq);
          }
        }
        return proposal;
      }
      case "review": {
        const lane = this.lanes.get(target!["lane"] as LaneId);
        if (!lane) return refusal("lane-unknown", "There is no such lane.");
        const p = lane.generations[(target!["generation"] as number) - 1];
        if (!p) return refusal("lane-unknown", "There is no such generation.");
        if (p.head !== body["head"]) return this.#refuse(signed, by, refusal("head-mismatch", "That is not this generation's head.", "Review the head the proposal names."));
        if (p.by.member === member || lane.holder === member) return this.#refuse(signed, by, refusal("self-review", "You cannot review your own proposal.", "Ask another member to review it."));
        const e = await this.#record(signed, by);
        const id = FakeRoom.idOf(e);
        const evidence = { basis: "here" as const, act: id, kind: "review" as const, generation: p.generation, head: p.head };
        if (body["verdict"] === "approve") {
          const o = p.obligations[0]!;
          (p as unknown as { obligations: Obligation[] }).obligations = [{ ...o, state: "met", evidence: [evidence] } as Obligation];
        }
        for (const a of this.attentionItems) if (a.item.why === "review-requested" && a.to === member && a.item.lane === lane.lane) (a.item as { open: boolean }).open = false;
        return {
          ...this.#base(e, "review", by),
          kind: "review",
          lane: lane.lane,
          generation: p.generation,
          head: p.head,
          verdict: body["verdict"] as "approve",
          scope: body["scope"] as string[],
          dependsOn: (body["dependsOn"] as string[] | undefined) ?? [],
          text: body["text"] as string,
          fulfils: body["verdict"] === "approve" ? [{ obligation: "obl_review", evidence }] : [],
        };
      }
      case "note": {
        const e = await this.#record(signed, by);
        const anchor = target as never as { lane?: LaneId; act?: ActId };
        const lane = anchor.lane ? this.lanes.get(anchor.lane) : undefined;
        if (lane?.holder && lane.holder !== member) this.#attend(lane.holder, { why: "note", note: FakeRoom.idOf(e), lane: lane.lane, text: `${member} wrote a note.` }, e.seq);
        return { ...this.#base(e, "note", by), kind: "note", anchor: target as never, text: body["text"] as string, ...(body["replyTo"] ? { replyTo: body["replyTo"] as ActId } : {}) };
      }
      case "land": {
        const lane = this.lanes.get(target!["lane"] as LaneId);
        const bad = this.#laneCheck(lane, member, body["lease"] as number);
        if (bad) return lane ? this.#refuse(signed, by, bad) : bad;
        const p = lane!.generations[(target!["generation"] as number) - 1];
        if (!p || p.generation !== lane!.generations.length || p.head !== body["head"]) {
          return this.#refuse(signed, by, refusal("head-mismatch", "Land the latest generation's head.", "Read the lane and land its latest proposal."));
        }
        const open = p.obligations.find((o) => o.state === "open");
        if (open) return this.#refuse(signed, by, refusal("obligation-open", `Obligation ${open.id} is open.`, "Wait for a review, then land again."));
        if (lane!.landing !== undefined) return this.#refuse(signed, by, refusal("land-in-progress", "A landing is already in progress.", "Wait for it to finish."));
        const e = await this.#record(signed, by);
        const opId = `op_land_${e.seq}` as const;
        const op: LandOp = {
          id: opId,
          kind: "land",
          updatedAt: e.at,
          lane: lane!.lane,
          generation: p.generation,
          head: p.head,
          act: FakeRoom.idOf(e),
          leaseGeneration: lane!.leaseGeneration,
          expectedMain: "1".repeat(40) as never,
          policyVersion: FakeRoom.idOf(this.entries[0]!),
          attempts: 1,
          state: "accepted",
        };
        this.ops.set(opId, op);
        lane!.landing = opId;
        lane!.expiresAt = this.now() + LEASE_MS;
        return { ...this.#base(e, "land", by), kind: "land", lane: lane!.lane, generation: p.generation, op };
      }
      case "release": {
        const lane = this.lanes.get(target!["lane"] as LaneId);
        const bad = this.#laneCheck(lane, member, body["lease"] as number);
        if (bad) return lane ? this.#refuse(signed, by, bad) : bad;
        const e = await this.#record(signed, by, [{ type: "released", lane: lane!.lane, leaseGeneration: lane!.leaseGeneration }]);
        lane!.holder = null;
        lane!.why = "released";
        if (body["note"] !== undefined) lane!.handover = FakeRoom.idOf(e);
        this.#revokeGrants(lane!.lane);
        return { ...this.#base(e, "release", by), kind: "release", lane: lane!.lane, ...(body["note"] !== undefined ? { note: body["note"] as string } : {}) };
      }
      case "renew": {
        const lane = this.lanes.get(target!["lane"] as LaneId);
        const bad = this.#laneCheck(lane, member, body["lease"] as number);
        if (bad) return lane ? this.#refuse(signed, by, bad) : bad;
        lane!.expiresAt = this.now() + LEASE_MS;
        const e = await this.#record(signed, by);
        return { ...this.#base(e, "renew", by), kind: "renew", lane: lane!.lane, lease: { holder: member, generation: lane!.leaseGeneration, expiresAt: this.iso(lane!.expiresAt) } };
      }
      default:
        return refusal("role-forbids", `The fake room does not accept ${env.kind}.`);
    }
  }

  #revokeGrants(lane: LaneId): void {
    for (const [token, g] of this.#grants) if (g.lane === lane) this.#grants.delete(token);
  }

  /** Expire a lane's lease now (R-LANE-8). */
  expire(lane: LaneId): void {
    const l = this.lanes.get(lane)!;
    l.holder = null;
    l.why = "expired";
    l.leaseGeneration += 1;
    this.#revokeGrants(lane);
  }

  // ---------------------------------------------------------- requests

  async request(signed: SignedRequest): Promise<Result<WorkspaceOp | WorkspaceGrant | Session>> {
    const req = signed.request;
    if (req.room !== this.id) throw artroomError("unauthenticated", "The request is for another room.");
    if (!(await verifyValue("artroom-request-v1", req, signed.sig, req.actor))) throw artroomError("unauthenticated", "The signature does not verify.");
    const notAfter = Date.parse(req.notAfter);
    if (!(notAfter > this.now()) || notAfter - this.now() > 300_000) throw artroomError("unauthenticated", "The request has expired, or expires too far ahead.");
    if (this.#nonces.has(`${req.actor}|${req.nonce}`)) throw artroomError("unauthenticated", "The nonce was already used.");
    this.#nonces.add(`${req.actor}|${req.nonce}`);
    const kind = req.request.kind === "session" ? "note" : "propose";
    const by = this.#authority({ v: 1, room: this.id, actor: req.actor, kind, target: null, body: {}, idempotencyKey: "x", ...(req.delegation ? { delegation: req.delegation } : {}) } as never, "submitted");
    if (isRefusal(by)) return by;
    const member = by.member as MemberId;
    if (req.request.kind === "session") {
      const token = `ses_${randomToken(24)}`;
      const expiresAt = this.now() + Math.min(req.request.ttlSeconds, 3600) * 1000;
      this.#readers.set(token, { member, expiresAt });
      this.exposure.sessions.push(token);
      return { token: token as SessionToken, member, expiresAt: this.iso(expiresAt) };
    }
    const lane = this.lanes.get(req.request.lane);
    const bad = this.#laneCheck(lane, member, req.request.lease);
    if (bad) return bad;
    const opId = `op_ws_${lane!.seq}_${lane!.leaseGeneration}`;
    let op = this.ops.get(opId) as WorkspaceOp | undefined;
    if (req.request.kind === "workspace") {
      if (!op) {
        op = { id: opId as `op_${string}`, kind: "workspace", updatedAt: this.iso(), lane: lane!.lane, state: "pending" };
        this.ops.set(opId, op);
        (op as { pendingReads?: number }).pendingReads = this.workspaceDelay;
      }
      return this.#publicOp(op) as WorkspaceOp;
    }
    if (!op || op.state !== "ready") return refusal("workspace-not-ready", "The workspace is not ready.", "Wait for the workspace operation to be ready.");
    const token = `art_v1_${randomToken(24)}`;
    this.#grants.set(token, { lane: lane!.lane, leaseGeneration: lane!.leaseGeneration });
    this.exposure.grants.push(token);
    return { op: op.id, lane: lane!.lane, leaseGeneration: lane!.leaseGeneration, remote: op.detail.remote, token, expiresAt: this.iso(lane!.expiresAt) };
  }

  /** True while a grant is current: issued for the lane's current lease and not revoked (R-WS-3). */
  grantValid(token: string): boolean {
    const g = this.#grants.get(token);
    return g !== undefined && this.lanes.get(g.lane)?.leaseGeneration === g.leaseGeneration && this.lanes.get(g.lane)?.holder !== null;
  }

  #publicOp(op: WorkspaceOp | LandOp): WorkspaceOp | LandOp {
    const { pendingReads: _p, ...rest } = op as WorkspaceOp & { pendingReads?: number };
    return rest as WorkspaceOp;
  }

  /** Moves an operation one step forward. The fake room's operations advance as they are read. */
  #advance(id: string): void {
    const op = this.ops.get(id);
    if (!op) return;
    if (op.kind === "workspace" && op.state === "pending") {
      const o = op as WorkspaceOp & { pendingReads?: number };
      if ((o.pendingReads ?? 0) > 0) {
        o.pendingReads = (o.pendingReads ?? 0) - 1;
        return;
      }
      const lane = this.lanes.get(op.lane)!;
      this.ops.set(id, { id: op.id, kind: "workspace", updatedAt: this.iso(), lane: op.lane, state: "ready", detail: { remote: `https://artifacts.example/acme/web-${op.lane}.git`, leaseGeneration: lane.leaseGeneration } });
      return;
    }
    if (op.kind === "land") {
      const next: Record<string, string> = { accepted: "preparing", preparing: "ready", ready: "publishing", publishing: "landed" };
      const to = next[op.state];
      if (!to) return;
      const base = op as LandOp & Obj;
      const reserved = { integration: "2".repeat(40), evidence: [], publication: 1, reservedAt: this.entries.length };
      let updated: Obj;
      if (to === "preparing") updated = { ...pickBase(base), state: "preparing", waiting: [] };
      else if (to === "ready") updated = { ...pickBase(base), state: "ready", integration: "2".repeat(40), evidence: [], landInput: null };
      else if (to === "publishing") updated = { ...pickBase(base), ...reserved, state: "publishing", pushes: 1 };
      else updated = { ...pickBase(base), ...reserved, state: "landed", receipt: base["act"] };
      this.ops.set(id, { ...updated, updatedAt: this.iso() } as LandOp);
      if (to === "landed") {
        const lane = this.lanes.get(op.lane)!;
        delete lane.landing;
        if (lane.holder) this.#attend(lane.holder, { why: "land-outcome", op: op.id, state: "landed", lane: lane.lane, text: `Generation ${op.generation} landed.` }, this.entries.length - 1);
      }
    }
  }

  // ---------------------------------------------------------- redemption

  async redeem(r: Redemption, mcpUrl: string): Promise<Result<Joined | Redeemed>> {
    if (r.custody === "client") {
      const env = r.join?.envelope;
      if (!env || env.kind !== "roster" || (env.body as Obj)["op"] !== "join") throw artroomError("bad-request", "A client redemption carries a signed join.");
      const out = await this.admit(r.join, "submitted");
      if (isRefusal(out)) return out;
      const member = this.members.get((out.by as { member: MemberId }).member)!;
      const token = `ses_${randomToken(24)}`;
      const expiresAt = this.now() + 3600_000;
      this.#readers.set(token, { member: member.handle, expiresAt });
      this.exposure.sessions.push(token);
      return { custody: "client", member: member.handle, role: member.role, key: env.actor, record: out as never, session: { token: token as SessionToken, member: member.handle, expiresAt: this.iso(expiresAt) } };
    }
    const inv = this.invitations.get(r.invitation);
    if (!inv || inv.used !== undefined || Date.parse(inv.expiresAt) <= this.now()) return refusal("invitation-invalid", "The invitation is unknown, used or expired.");
    const hash = `sha256:${await sha256Hex(new TextEncoder().encode(r.secret))}`;
    if (hash !== inv.secretHash) return refusal("invitation-invalid", "The invitation secret does not match.");
    if (inv.custody !== "room") return refusal("custody-mismatch", "This invitation is for a key you hold.", "Redeem it with `artroom login`.");
    const memberKey = (await generateSigner()).signer;
    const join = await signEnvelope(buildEnvelope(this.id, { signer: memberKey }, "roster", null, { op: "join", invitation: inv.id, secret: r.secret }, newIdempotencyKey()) as never, memberKey);
    const joined = await this.admit(join as SignedEnvelope, "room-redemption");
    if (isRefusal(joined)) return joined;
    const sessionKey = (await generateSigner()).signer;
    const ttl = inv.session?.ttlSeconds ?? 86_400;
    const expiresAt = this.now() + ttl * 1000;
    const delegate = await signEnvelope(
      buildEnvelope(this.id, { signer: memberKey }, "roster", null, { op: "delegate", to: sessionKey.key, kinds: inv.session?.kinds ?? "*", lanes: "*", expiresAt: this.iso(expiresAt) }, newIdempotencyKey()) as never,
      memberKey,
    );
    const granted = await this.admit(delegate as SignedEnvelope, "submitted");
    if (isRefusal(granted)) throw artroomError("internal", "The room could not record the session delegation.");
    const bearer = `brr_${randomToken(32)}`;
    this.#bearers.set(await sha256Hex(new TextEncoder().encode(bearer)), { member: inv.member, delegation: granted.id, signer: sessionKey, expiresAt });
    this.exposure.bearers.push(bearer);
    const m = this.members.get(inv.member)!;
    return { custody: "room", member: m.handle, role: m.role, key: memberKey.key, delegation: granted.id, bearer, expiresAt: this.iso(expiresAt), mcp: mcpUrl as `https://${string}` };
  }

  /** The bearer's session key and delegation, so an MCP handler can act for it (R-CRED-3). */
  async bearerSession(token: string): Promise<{ member: MemberId; delegation: ActId; signer: Signer } | undefined> {
    const b = this.#bearers.get(await sha256Hex(new TextEncoder().encode(token)));
    if (!b || b.expiresAt <= this.now()) return undefined;
    const d = this.delegations.get(b.delegation);
    if (!d || d.revoked !== undefined) return undefined;
    return b;
  }

  // ---------------------------------------------------------------- reads

  async reader(token: string | undefined): Promise<MemberId> {
    if (token !== undefined) {
      const s = this.#readers.get(token);
      if (s && s.expiresAt > this.now()) return s.member;
      const b = await this.bearerSession(token);
      if (b) return b.member;
    }
    throw artroomError("unauthenticated", "A session or bearer token is required.");
  }

  /** Ends every read session now, as a key rotation would (R-CRED-7). */
  endSessions(): void {
    this.#readers.clear();
  }

  async read<Q extends ReadQuery>(token: string | undefined, query: Q): Promise<ReadResults[Q["q"]]> {
    const me = await this.reader(token);
    const out = await this.#read(me, query);
    return out as ReadResults[Q["q"]];
  }

  async #read(me: MemberId, query: ReadQuery): Promise<unknown> {
    switch (query.q) {
      case "lane": {
        const l = this.lanes.get(query.lane);
        return l ? this.#held(l) : null;
      }
      case "lanes": {
        let all = [...this.lanes.values()].map((l) => this.#held(l));
        if (query.filter?.state) all = all.filter((l) => l.state === query.filter!.state);
        if (query.filter?.holder) all = all.filter((l) => l.lease?.holder === query.filter!.holder);
        return page(all, query.filter?.cursor, query.filter?.limit, "n");
      }
      case "proposal":
        return this.lanes.get(query.ref.lane)?.generations[query.ref.generation - 1] ?? null;
      case "op": {
        if (!this.ops.has(query.op)) throw artroomError("not-found", "There is no such operation.");
        const until = query.until;
        if (until === undefined || until.length === 0) {
          this.#advance(query.op);
          return this.#publicOp(this.ops.get(query.op)!);
        }
        const reached = await this.#until(() => {
          this.#advance(query.op);
          return until.includes(this.ops.get(query.op)!.state);
        }, Math.min(query.timeoutMs ?? 30_000, 300_000));
        if (!reached) throw artroomError("timeout", `Operation ${query.op} did not reach ${until.join(" or ")} in time.`);
        return this.#publicOp(this.ops.get(query.op)!);
      }
      case "attention": {
        const mine = this.attentionItems.filter((a) => a.to === me).map((a) => a.item);
        return page(mine, query.page?.cursor, query.page?.limit, "a");
      }
      case "log": {
        const after = query.req?.after ?? -1;
        const fromCursor = query.req?.cursor !== undefined ? Number(String(query.req.cursor).slice(1)) : after;
        const limit = Math.min(query.req?.limit ?? 50, 500);
        const acts = this.entries.filter((e) => e.seq > fromCursor).slice(0, limit);
        const last = acts.length > 0 ? acts[acts.length - 1]!.seq : fromCursor;
        const head = this.entries.length - 1;
        const out: LogPage = { acts, cursor: `l${last}` as Cursor, more: last < head, publishedThrough: this.publishedThrough, head };
        return out;
      }
      case "explain": {
        const e = this.entryById(query.act);
        if (!e) return null;
        const kind = e.entry.type === "system" ? "system" : e.entry.act.envelope.kind;
        const out: Explanation = {
          act: query.act,
          kind,
          outcome: e.entry.type === "act" ? "accepted" : e.entry.type === "refusal" ? "refused" : "system",
          entry: e,
          decisions: [],
          invariants: e.entry.type === "refusal" ? [{ rule: "R-LANE-4", held: false, detail: e.entry.receipt.refusal.reason }] : [{ rule: "R-ADM-3", held: true }],
          published: e.seq <= this.publishedThrough,
        };
        return out;
      }
      case "members":
        return this.#roster();
    }
  }

  #roster(): Roster {
    const members: Member[] = [...this.members.values()].map((m) => ({
      handle: m.handle,
      role: m.role,
      teams: [],
      state: m.state,
      joined: m.joined,
      keys: [...this.keys.entries()]
        .filter(([, k]) => k.member === m.handle)
        .map(([id, k]) => (k.revoked ? { id, custody: k.custody, added: k.added, state: "revoked" as const, ...k.revoked } : { id, custody: k.custody, added: k.added, state: "active" as const })),
    }));
    return { at: this.entries.length - 1, members, teams: {}, delegations: [...this.delegations.values()], recovery: this.admin.signer.key, soleAdmin: true };
  }

  /** The next update after `cursor` for `me`: entries and attention items (R-API-8). */
  update(me: MemberId, cursor: Cursor | undefined): Update {
    const [seqText, attText] = (cursor ?? `u${this.entries.length - 1}.${this.attentionItems.length}`).slice(1).split(".");
    const seq = Number(seqText);
    const att = Number(attText);
    const entries = this.entries.filter((e) => e.seq > seq).map((e) => ({
      id: FakeRoom.idOf(e),
      seq: e.seq,
      type: e.entry.type,
      kind: e.entry.type === "system" ? e.entry.event.type : e.entry.act.envelope.kind,
      at: e.at,
    }));
    const attention = this.attentionItems.slice(att).filter((a) => a.to === me).map((a) => a.item);
    return { cursor: `u${this.entries.length - 1}.${this.attentionItems.length}` as Cursor, entries: entries as never, attention, publishedThrough: this.publishedThrough };
  }

  async subscribe(token: string | undefined, cursor: Cursor | undefined, waitMs: number): Promise<Update> {
    const me = await this.reader(token);
    const start = cursor ?? this.update(me, undefined).cursor;
    await this.#until(() => {
      const u = this.update(me, start);
      return u.entries.length > 0 || u.attention.length > 0;
    }, waitMs);
    return this.update(me, start);
  }

  // --------------------------------------------------------- RPC (RoomWire)

  /** The room as a service binding would expose it (`RoomWire`). */
  wire(): RoomWire {
    return {
      submit: (act) => this.admit(act, "submitted"),
      request: (req) => this.request(req),
      redeem: (r) => this.redeem(r, `${this.url}/v1/rooms/${this.id}/mcp`),
      read: (session, query) => this.read(session, query),
      subscribe: async (session: SessionToken, cursor?: Cursor): Promise<UpdateStream> => {
        const me = await this.reader(session);
        let at = cursor ?? this.update(me, undefined).cursor;
        let cancelled = false;
        return {
          getReader: () => ({
            read: async () => {
              if (cancelled) return { done: true as const };
              const u = await this.subscribe(session, at, 5_000);
              at = u.cursor;
              return { done: false as const, value: u };
            },
            releaseLock: () => {},
          }),
          cancel: async () => {
            cancelled = true;
          },
        };
      },
      [Symbol.dispose]: () => {},
    };
  }

  // --------------------------------------------------------------- HTTPS

  async start(): Promise<string> {
    const server = createServer((req, res) => void this.#serve(req, res));
    this.#wss = new WebSocketServer({
      noServer: true,
      handleProtocols: (protocols) => (protocols.has(WS_PROTOCOL) ? WS_PROTOCOL : false),
    });
    server.on("upgrade", (req, socket, head) => void this.#upgrade(req, socket, head));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    this.#server = server;
    const addr = server.address() as { port: number };
    this.url = `http://127.0.0.1:${addr.port}`;
    return this.url;
  }

  async stop(): Promise<void> {
    for (const s of this.#sockets) s.terminate();
    this.#wss?.close();
    await new Promise<void>((resolve) => {
      if (!this.#server) return resolve();
      this.#server.closeAllConnections();
      this.#server.close(() => resolve());
    });
  }

  /** Closes every live WebSocket abruptly, as a deploy or network fault would. */
  dropSockets(): void {
    for (const s of this.#sockets) s.terminate();
  }

  get socketCount(): number {
    return this.#sockets.size;
  }

  async #upgrade(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    const url = new URL(req.url ?? "/", "http://x");
    const protocols = String(req.headers["sec-websocket-protocol"] ?? "").split(",").map((p) => p.trim());
    const token = protocols.find((p) => p.startsWith(WS_TOKEN_PREFIX))?.slice(WS_TOKEN_PREFIX.length);
    let me: MemberId;
    try {
      me = await this.reader(token);
    } catch {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    this.#wss!.handleUpgrade(req, socket, head, (ws) => {
      const state = ws as WsSocket & { artroom?: { me: MemberId; cursor: Cursor } };
      const start = url.searchParams.get("cursor");
      state.artroom = { me, cursor: (start ?? this.update(me, undefined).cursor) as Cursor };
      this.#sockets.add(ws);
      ws.on("close", () => this.#sockets.delete(ws));
      void this.#pushSockets();
    });
  }

  async #pushSockets(): Promise<void> {
    for (const ws of this.#sockets) {
      const s = (ws as WsSocket & { artroom?: { me: MemberId; cursor: Cursor } }).artroom;
      if (!s || ws.readyState !== ws.OPEN) continue;
      const u = this.update(s.me, s.cursor);
      if (u.entries.length === 0 && u.attention.length === 0) continue;
      s.cursor = u.cursor;
      ws.send(JSON.stringify(u));
    }
  }

  async #serve(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", this.url);
    const m = /^\/v1\/rooms\/([^/]+)(\/.*)$/.exec(url.pathname);
    const method = req.method ?? "GET";
    const route = m ? m[2]! : url.pathname;
    const key = `${method} ${route}`;
    const fault = this.faults.find((f) => key === f.route || key.startsWith(`${f.route}/`));
    if (fault) {
      fault.times = (fault.times ?? 1) - 1;
      if (fault.times <= 0) this.faults.splice(this.faults.indexOf(fault), 1);
    }
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const raw = Buffer.concat(chunks).toString("utf8");
    const send = (status: number, body: unknown, headers: Record<string, string> = {}) => {
      this.requests.push({ method, route: route.replace(/\/act_[^/]+|\/op_[^/]+|\/\d+$/g, "/:id"), status });
      const text = JSON.stringify(body);
      if (fault?.kind === "drop") {
        res.socket?.destroy();
        return;
      }
      if (fault?.kind === "partial") {
        res.writeHead(status, { "content-type": "application/json", "content-length": String(Buffer.byteLength(text)) });
        res.write(text.slice(0, Math.floor(text.length / 2)));
        setTimeout(() => res.socket?.destroy(), 5);
        return;
      }
      res.writeHead(status, { "content-type": "application/json", ...headers });
      res.end(text);
    };
    if (fault?.kind === "status") {
      this.requests.push({ method, route, status: fault.status ?? 503 });
      res.writeHead(fault.status ?? 503, { "content-type": "application/json" });
      res.end(fault.body === undefined ? "" : JSON.stringify(fault.body));
      return;
    }
    const named = m ? decodeURIComponent(m[1]!) : "";
    if (!m || (named !== this.id && named !== this.name && !this.aliases.includes(named))) {
      return send(404, artroomError("not-found", "There is no such room."));
    }
    const auth = /^Bearer (.+)$/.exec(String(req.headers["authorization"] ?? ""))?.[1];
    const q = url.searchParams;
    const num = (k: string) => (q.has(k) ? Number(q.get(k)) : undefined);
    const str = (k: string) => q.get(k) ?? undefined;
    try {
      const body = raw.length > 0 ? JSON.parse(raw) : undefined;
      let out: unknown;
      let headers: Record<string, string> = {};
      if (method === "POST" && route === "/acts") out = await this.admit(body, "submitted");
      else if (method === "POST" && route === "/requests") {
        out = await this.request(body);
        headers = { "cache-control": "no-store" };
      } else if (method === "POST" && route === "/redeem") {
        out = await this.redeem(body, `${this.url}/v1/rooms/${this.id}/mcp`);
        headers = { "cache-control": "no-store" };
      } else if (method === "POST" && route === "/mcp") {
        if (!this.mcp) return send(404, artroomError("not-found", "No MCP endpoint."));
        const headersIn = new Headers();
        for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headersIn.set(k, v);
        const response = await this.mcp(new Request(url, { method, headers: headersIn, body: raw }), this);
        this.requests.push({ method, route, status: response.status });
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(Buffer.from(await response.arrayBuffer()));
        return;
      } else if (method === "GET") {
        const lane = /^\/lanes\/([^/]+)$/.exec(route);
        const prop = /^\/lanes\/([^/]+)\/(\d+)$/.exec(route);
        const op = /^\/ops\/([^/]+)$/.exec(route);
        const exp = /^\/explain\/([^/]+)$/.exec(route);
        let result: unknown;
        if (route === "/lanes") result = await this.read(auth, { q: "lanes", filter: clean({ state: str("state") as never, holder: str("holder") as never, touches: str("touches"), cursor: str("cursor") as never, limit: num("limit") }) });
        else if (lane) result = await this.read(auth, { q: "lane", lane: decodeURIComponent(lane[1]!) as LaneId });
        else if (prop) result = await this.read(auth, { q: "proposal", ref: { lane: decodeURIComponent(prop[1]!) as LaneId, generation: Number(prop[2]) } });
        else if (op) result = await this.read(auth, { q: "op", op: decodeURIComponent(op[1]!) as `op_${string}`, ...clean({ until: str("until")?.split(","), timeoutMs: num("timeoutMs") }) });
        else if (route === "/attention") result = await this.read(auth, { q: "attention", page: clean({ cursor: str("cursor") as never, limit: num("limit") }) });
        else if (route === "/log") result = await this.read(auth, { q: "log", req: clean({ after: num("after"), cursor: str("cursor") as never, limit: num("limit") }) });
        else if (exp) result = await this.read(auth, { q: "explain", act: decodeURIComponent(exp[1]!) as ActId });
        else if (route === "/members") result = await this.read(auth, { q: "members" });
        else if (route === "/subscribe") result = await this.subscribe(auth, str("cursor") as Cursor | undefined, Math.min(num("waitMs") ?? 25_000, 300_000));
        else return send(404, artroomError("not-found", "No such route."));
        if (result === null) return send(404, artroomError("not-found", "Not found."));
        return send(200, result);
      } else return send(404, artroomError("not-found", "No such route."));
      if (isRefusal(out)) return send(409, out);
      return send(200, out, headers);
    } catch (e) {
      const err = (e as ArtroomError).name === "ArtroomError" ? (e as ArtroomError) : artroomError("internal", "The fake room failed.");
      if (err.code === "internal") console.error(e);
      return send(STATUS[err.code], err);
    }
  }

  // --------------------------------------------------------------- helpers

  /** Issue an invitation as the admin; returns its ID and secret (R-GEN-6). */
  async invite(member: MemberId, opts: { role?: Role; custody?: "client" | "room"; kinds?: DelegableKind[] | "*" } = {}): Promise<{ invitation: ActId; secret: string }> {
    const secret = randomToken(32);
    const op: RosterOp = {
      op: "invite",
      member,
      ...(this.members.has(member) ? {} : { role: opts.role ?? "member" }),
      custody: opts.custody ?? "client",
      expiresAt: this.iso(this.now() + 86_400_000),
      secretHash: `sha256:${await sha256Hex(new TextEncoder().encode(secret))}` as Digest,
      ...(opts.custody === "room" ? { session: { kinds: opts.kinds ?? "*", lanes: "*" as const, ttlSeconds: 86_400 } } : {}),
    };
    const signed = await signEnvelope(buildEnvelope(this.id, { signer: this.admin.signer }, "roster", null, op, newIdempotencyKey()) as never, this.admin.signer);
    const out = await this.admit(signed as SignedEnvelope, "submitted");
    if (isRefusal(out)) throw new Error(`invite refused: ${out.rule}`);
    return { invitation: (out as { invitation: ActId }).invitation, secret };
  }

  /** Every string the room has issued as a credential. */
  secrets(): string[] {
    return [...this.exposure.sessions, ...this.exposure.bearers, ...this.exposure.grants];
  }
}

function refusal(rule: string, reason: string, fix?: string): Refusal {
  return { refused: true, rule, reason, ...(fix !== undefined ? { fix } : {}) };
}

function pickBase(op: Obj): Obj {
  const keys = ["id", "kind", "updatedAt", "lane", "generation", "head", "act", "leaseGeneration", "expectedMain", "policyVersion", "attempts"];
  return Object.fromEntries(keys.map((k) => [k, op[k]]));
}

function clean<T extends Obj>(o: T): { [K in keyof T]: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as never;
}

/** A crude, conservative overlap test for the fake: same first segment, or a `**` prefix. */
function overlap(a: string, b: string): boolean {
  const first = (g: string) => g.split("/")[0]!;
  return first(a) === first(b) || a.startsWith("**") || b.startsWith("**");
}

function page<T>(items: readonly T[], cursor: Cursor | undefined, limit: number | undefined, prefix: string): Page<T> {
  const from = cursor !== undefined ? Number(String(cursor).slice(1)) : 0;
  const n = Math.min(limit ?? 50, 500);
  const slice = items.slice(from, from + n);
  const next = from + slice.length;
  return { items: slice, cursor: `${prefix}${next}` as Cursor, more: next < items.length };
}

export type { OpByKind, OpKind };
