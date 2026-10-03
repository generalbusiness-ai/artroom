/**
 * An in-memory room with declared acts, for the demo and the tests. It has
 * the reads and the generic act of the contract's `HttpRoom` that the live
 * adapter uses (declared acts stage 5), so the declared demo room is the
 * live adapter over this, and the tests exercise the same code path a real
 * room would.
 *
 * It keeps a log of real `LogEntry` values, a list of policy versions, and
 * the threads its acts open. It judges a generic act the way the Room does,
 * in the Room's order, as far as a demo needs: role, then kind and binding
 * (never recorded), then body (never recorded), then the thread (recorded).
 * It is a stand-in, not the Room: it has no signatures, no leases that
 * expire, no policy rules and no landing. A generic act sent with an
 * idempotency key is answered as R-IDEM-2 to R-IDEM-4 say.
 */

import { bindingsOf, fieldsOf, governs, meaningOf, PLATFORM_KIND_LIST } from "@generalbusiness/artroom-policy/declared";
import { own, readField, shapeOfTarget } from "../acts.ts";
import type {
  ActDeclaration,
  ActId,
  Binding,
  Catalogue,
  CatalogueAt,
  Cursor,
  DeclaredRecord,
  DeclaredTarget,
  Json,
  KindName,
  Lane,
  LogEntry,
  MemberId,
  NoteAnchor,
  PolicyVersion,
  ProposalAt,
  Refusal,
  Result,
  Role,
  Seq,
  Sha,
  Step,
  Update,
} from "../contract.ts";
import { envelopeOf } from "../contract.ts";
import { overlap } from "../glob.ts";
import { fakeKey, hex8 } from "./ids.ts";

export interface MemoryMember {
  readonly handle: MemberId;
  readonly role: Role;
}

/** A policy document as this room needs it: the legacy vocabulary, or declarations. */
export type MemoryDoc = "legacy" | { readonly acts: Readonly<Record<KindName, ActDeclaration>>; readonly lanes?: "by-scope" | "exclusive" };

interface Version {
  readonly policy: PolicyVersion;
  readonly since: Seq;
  until: Seq | null;
  readonly doc: MemoryDoc;
  readonly bindings: Readonly<Record<KindName, Binding>>;
  /** For each kind a later version dropped: the seq of the first activation without it. */
  readonly retired: Record<KindName, Seq>;
}

interface Thread {
  readonly id: ActId;
  /** The kind of the act that opened it (R-DECL-6). */
  readonly kind: string;
  readonly goal: string;
  scope: readonly string[];
  holder: MemberId | null;
  leaseGeneration: number;
  generation: number;
  readonly generations: { generation: number; head: Sha; act: ActId }[];
}

const STEPS_VERSION = "artroom-steps-v1";
const EPOCH = Date.UTC(2026, 9, 3, 9, 0, 0);
const refuse = (rule: string, reason: string, fix: string, extra: Partial<Refusal> = {}): Refusal => ({ refused: true, rule, reason, fix, ...extra }) as Refusal;

/** Thrown by `act` where a real handle throws an `ArtroomError`. */
export const badRequest = (message: string) => Object.assign(new Error(message), { code: "bad-request" as const });

export class MemoryRoom {
  readonly id = "room_00000000000000000000000000000001" as const;
  me: MemberId;
  publishedThrough = 0;
  /** Every generic act this room was sent, in order: the tests read it to show what was and was not resubmitted. */
  readonly sent: { readonly kind: string; readonly binding: string; readonly body: unknown; readonly target: unknown }[] = [];
  /** The idempotency key each of those acts came with, in the same order; undefined where it came with none. */
  readonly keys: (string | undefined)[] = [];
  /** What the room recorded under each idempotency key: the act's own text and its answer. */
  private readonly answered: Record<string, { readonly act: string; readonly result: Result<DeclaredRecord> }> = Object.create(null) as Record<string, never>;
  private readonly entries: LogEntry[] = [];
  private readonly versions: Version[] = [];
  private readonly threads = new Map<ActId, Thread>();
  private readonly watchers = new Set<(u: Update) => void>();

  private constructor(
    readonly name: string,
    readonly people: readonly MemoryMember[],
  ) {
    this.me = people[0]!.handle;
  }

  /** A new room: its genesis entry, then its first policy version. */
  static async found(name: string, people: readonly MemoryMember[], doc: MemoryDoc): Promise<MemoryRoom> {
    const room = new MemoryRoom(name, people);
    room.seal({ type: "system", event: { type: "genesis", genesis: { name }, sig: "sig" } as never });
    await room.activate(doc);
    return room;
  }

  // ------------------------------------------------------------ the log

  private seal(entry: LogEntry["entry"]): LogEntry {
    const seq = this.entries.length;
    const body = JSON.stringify(entry);
    const hash = `sha256:${hex8(`${seq}:${body}`)}${hex8(`${seq}:b:${body}`).repeat(7)}` as LogEntry["hash"];
    const e = {
      format: "artroom-log-v1",
      seq,
      prev: this.entries.at(-1)?.hash ?? `sha256:${"0".repeat(64)}`,
      at: new Date(EPOCH + seq * 60_000).toISOString().replace(".000Z", "Z"),
      hash,
      roomSig: "sig",
      entry,
    } as LogEntry;
    this.entries.push(e);
    return e;
  }

  private idOf(e: LogEntry): ActId {
    return `act_${e.seq}_${e.hash.slice(7, 15)}`;
  }

  private changed(): void {
    for (const w of this.watchers) w({ cursor: `c${this.entries.length}` as Cursor, entries: [], attention: [], publishedThrough: this.publishedThrough } as unknown as Update);
  }

  private authority(by: MemberId) {
    return { via: "member" as const, member: by, role: this.roleOf(by), key: fakeKey(by) };
  }

  private roleOf(m: MemberId): Role {
    return this.people.find((p) => p.handle === m)?.role ?? "member";
  }

  /** Publish the log through its head. */
  publish(): void {
    this.publishedThrough = this.entries.length - 1;
    this.changed();
  }

  // ------------------------------------------------------------ policy versions

  /** Activate a document: a `policy-activated` entry begins its interval and ends the one before. */
  async activate(doc: MemoryDoc): Promise<PolicyVersion> {
    const bindings = doc === "legacy" ? {} : await bindingsOf({ format: "artroom-policy-v2", steps: STEPS_VERSION, lanes: doc.lanes ?? "by-scope", acts: doc.acts } as never);
    const e = this.seal({ type: "system", event: { type: "policy-activated", policy: `sha256:${"0".repeat(64)}`, checkers: [], commit: null, previous: this.versions.at(-1)?.policy ?? null, recomputed: { proposals: 0, fenced: 0, reopened: 0 } } as never });
    const policy = this.idOf(e) as PolicyVersion;
    const last = this.versions.at(-1);
    if (last) last.until = e.seq;
    // A kind an earlier version declared and this one does not is retired here, once (R-DECL-23).
    for (const v of this.versions) {
      if (v.doc === "legacy") continue;
      for (const kind of Object.keys(v.doc.acts)) if ((doc === "legacy" || !Object.hasOwn(doc.acts, kind)) && v.retired[kind] === undefined) v.retired[kind] = e.seq;
    }
    this.versions.push({ policy, since: e.seq, until: null, doc, bindings, retired: Object.create(null) as Record<string, number> });
    this.changed();
    return policy;
  }

  private active(): Version {
    return this.versions.at(-1)!;
  }

  private catalogueOf(v: Version): Catalogue {
    const interval = { policy: v.policy, since: v.since, until: v.until };
    if (v.doc === "legacy") return { vocabulary: "artroom-legacy-v1", ...interval };
    const acts = Object.fromEntries(
      Object.entries(v.doc.acts).map(([kind, declaration]) => [kind, { declaration, binding: v.bindings[kind]!, ...(v.retired[kind] !== undefined ? { retired: v.retired[kind] } : {}) }]),
    );
    return { vocabulary: "declared", ...interval, steps: STEPS_VERSION, lanes: v.doc.lanes ?? "by-scope", acts } as Catalogue;
  }

  async acts(): Promise<Catalogue> {
    return this.catalogueOf(this.active());
  }

  async actsAt(at: CatalogueAt): Promise<Catalogue | null> {
    const v = "policy" in at && at.policy !== undefined ? this.versions.find((x) => x.policy === at.policy) : this.versions.find((x) => governs(this.catalogueOf(x), (at as { seq: Seq }).seq));
    return v ? this.catalogueOf(v) : null;
  }

  // ------------------------------------------------------------ the generic act

  /**
   * One act of a declared kind, with the binding its caller read (R-DECL-16).
   * The room compares that binding with the active one and never replaces it.
   */
  async act(kind: KindName, target: DeclaredTarget, body: { readonly [field: string]: Json }, opts: { readonly binding: Binding; readonly idempotencyKey?: string }): Promise<Result<DeclaredRecord>> {
    this.sent.push({ kind, binding: opts.binding, body, target });
    this.keys.push(opts.idempotencyKey);
    const key = opts.idempotencyKey;
    if (key === undefined) return this.admit(kind, target, body, opts);
    // R-IDEM-2 and R-IDEM-3: the same key with the same act returns what was recorded; with another act it is refused.
    const text = JSON.stringify([kind, opts.binding, target, body]);
    const prior = own(this.answered, key);
    if (prior) return prior.act === text ? prior.result : refuse("idempotency-mismatch", "This idempotency key was already used for a different act.", "Use a new idempotency key for a new act."); // G5U:mock-same-act
    const result = await this.admit(kind, target, body, opts);
    // R-IDEM-4: only what the room recorded is kept, an accepted act or a recorded refusal.
    if (!("refused" in result) || result.act !== undefined) this.answered[key] = { act: text, result }; // G5U:mock-recorded-only
    return result;
  }

  /** One generic act, decided once. */
  private async admit(kind: KindName, target: DeclaredTarget, body: { readonly [field: string]: Json }, opts: { readonly binding: Binding }): Promise<Result<DeclaredRecord>> {
    const v = this.active();
    if (v.doc === "legacy") throw badRequest("envelope.v must be 1."); // a v1 room refuses a v: 2 envelope at step 1
    if ((PLATFORM_KIND_LIST as readonly string[]).includes(kind)) throw badRequest(`${kind} is a platform kind; it has its own method.`);
    const by = this.me;
    const role = this.roleOf(by);
    const d = Object.hasOwn(v.doc.acts, kind) ? v.doc.acts[kind]! : null;
    // Step 4: who may sign a declared kind (R-DECL-11). Not recorded.
    if (d && role !== "admin" && !(d.who.roles as readonly string[]).includes(role)) return refuse("role-forbids", `The role ${role} may not sign ${kind}.`, "Ask an admin for a role that may.");
    // Step 4a: the kind is declared, and the act carries the active declaration's binding (R-DECL-16). Not recorded.
    if (!d) return refuse("kind-undeclared", `The kind ${kind} is not declared in the room's active policy, version ${v.policy}.`, "Read the room's declarations and use a kind they declare.");
    const current = v.bindings[kind]!;
    if (opts.binding !== current)
      return refuse("binding-stale", `The act was prepared for ${kind} as ${opts.binding}; the active declaration's binding is ${current}, in policy version ${v.policy}.`, "Read the active declaration. Sign the act again under its binding only if that meaning is still what you intend.", {
        current: { binding: current, policy: v.policy },
      } as Partial<Refusal>);
    // Step 5: the body is closed against the declaration's fields and its steps' fields (R-DECL-12). Not recorded.
    const shape = shapeOfTarget(target);
    const fields = shape ? fieldsOf(d, shape) : null;
    if (!shape || !fields) return refuse("invalid-body", `The target is not one of ${kind}'s targets.`, "Correct the target and sign it again.");
    for (const name of Object.keys(body)) if (name !== "because" && !fields.some((f) => f.name === name)) return refuse("invalid-body", `${name} is not a field of ${kind}.`, "Correct the body and sign it again.");
    for (const f of fields) {
      const value = own(body, f.name);
      const raw = value === undefined ? "" : Array.isArray(value) ? value.join("\n") : typeof value === "object" ? JSON.stringify(value) : String(value);
      const r = readField(f, raw);
      if (!r.ok) return refuse("invalid-body", r.problem, "Correct the body and sign it again.");
    }
    // Step 7: the thread (recorded).
    const steps = d.targets[shape] as readonly Step[];
    const envelope = { v: 2, room: this.id, actor: fakeKey(by), kind, binding: opts.binding, target, body, idempotencyKey: `k${this.sent.length}` };
    const recorded = (r: Refusal): Refusal => {
      const e = this.seal({ type: "refusal", act: { envelope, sig: "sig" }, receipt: { outcome: "refused", authority: this.authority(by), decisions: [], refusal: r } } as never);
      this.changed();
      return { ...r, act: this.idOf(e) };
    };
    const lane = target !== null && "lane" in target ? this.threads.get(target.lane) : undefined;
    if (target !== null && "lane" in target) {
      if (!lane) return recorded(refuse("lane-unknown", `There is no thread ${target.lane}.`, "Name an existing thread."));
      if (!(d.threads ?? []).includes(lane.kind)) return recorded(this.worded(d, refuse("wrong-thread", `${lane.id} is a ${lane.kind} thread, which ${kind} does not act on.`, `Act on it with an act whose threads name ${lane.kind}.`), { kind, lane: lane.id }));
      if (steps.some((s) => s === "version" || s === "release" || s === "land") && lane.holder !== by)
        return recorded(this.worded(d, refuse("not-holder", `${lane.holder ?? "Nobody"} holds ${lane.id}.`, "Take the thread over first, or ask its holder."), { kind, lane: lane.id, holder: lane.holder ?? "" }));
    }
    if (steps.includes("open")) {
      const scope = (body["scope"] ?? []) as readonly string[];
      for (const other of this.threads.values()) {
        if (other.holder === null) continue;
        if (scope.some((a) => other.scope.some((b) => overlap(a, b)?.certain || a === b)))
          return recorded(this.worded(d, refuse("scope-overlap", `${other.holder} holds ${other.id}, whose scope overlaps this one.`, "Choose another scope."), { kind, lane: other.id, holder: other.holder }));
      }
    }
    const e = this.seal({ type: "act", act: { envelope, sig: "sig" }, receipt: { outcome: "accepted", authority: this.authority(by), decisions: [], effects: [], flags: [] } } as never);
    const id = this.idOf(e);
    if (steps.includes("open")) {
      this.threads.set(id, { id, kind, goal: typeof body["goal"] === "string" ? body["goal"] : "", scope: (body["scope"] ?? []) as readonly string[], holder: by, leaseGeneration: 1, generation: 0, generations: [] });
    } else if (lane && steps.includes("version")) {
      lane.generation += 1;
      lane.generations.push({ generation: lane.generation, head: body["head"] as Sha, act: id });
    } else if (lane && steps.includes("release")) {
      lane.holder = null;
    }
    this.changed();
    return { id, seq: e.seq, kind, by: this.authority(by), at: e.at, flags: [], ...(steps.includes("open") ? { lane: id } : {}) } as DeclaredRecord;
  }

  /** A platform refusal in the declaration's own words, slots filled (R-DECL-13). The code is the room's. */
  private worded(d: ActDeclaration, r: Refusal, facts: Readonly<Record<string, string>>): Refusal {
    const w = (d.refusals as Record<string, { reason: string; fix: string }> | undefined)?.[r.rule];
    if (!w) return r;
    const fill = (t: string) => t.replace(/\{([a-zA-Z]+)\}/g, (_, slot: string) => facts[slot] ?? "");
    return { ...r, reason: fill(w.reason), fix: fill(w.fix) };
  }

  // ------------------------------------------------------------ records made another way

  /**
   * Append an act as the legacy vocabulary or a script made it, without
   * judging it: a `v: 1` record under a `v1` document, or any envelope a
   * test wants in the log. Returns the entry's ID.
   */
  record(by: MemberId, envelope: { readonly v: number; readonly kind: string; readonly target: unknown; readonly body: unknown; readonly binding?: string }, refusal?: Refusal): ActId {
    const act = { envelope: { room: this.id, actor: fakeKey(by), idempotencyKey: `r${this.entries.length}`, ...envelope }, sig: "sig" };
    const e = refusal
      ? this.seal({ type: "refusal", act, receipt: { outcome: "refused", authority: this.authority(by), decisions: [], refusal } } as never)
      : this.seal({ type: "act", act, receipt: { outcome: "accepted", authority: this.authority(by), decisions: [], effects: [], flags: [] } } as never);
    this.changed();
    return this.idOf(e);
  }

  // ------------------------------------------------------------ reads

  async members() {
    return {
      at: this.entries.length - 1,
      members: this.people.map((p, i) => ({ handle: p.handle, role: p.role, teams: [], keys: [], state: "active" as const, joined: i })),
      teams: {},
      delegations: [],
      recovery: fakeKey("recovery"),
      soleAdmin: false,
    };
  }

  async lanes() {
    const items: Lane[] = [...this.threads.values()].map((t) => {
      const base = { lane: t.id, kind: t.kind, purpose: "ordinary" as const, goal: t.goal, scope: t.scope, generation: t.generation, generations: [...t.generations], overlaps: [] };
      return (
        t.holder
          ? { ...base, state: "held", lease: { holder: t.holder, generation: t.leaseGeneration, expiresAt: new Date(EPOCH + 24 * 3600_000).toISOString() } }
          : { ...base, state: "unheld", lease: null, leaseGeneration: t.leaseGeneration, why: "released" }
      ) as Lane;
    });
    return { items, cursor: "c" as Cursor, more: false };
  }

  async proposal() {
    return null; // this stand-in keeps no proposal records
  }

  async op(): Promise<never> {
    throw new Error("This stand-in runs no landing.");
  }

  async attention() {
    return { items: [], cursor: "c" as Cursor, more: false };
  }

  async log(req: { readonly after?: number; readonly limit?: number } = {}) {
    const after = req.after ?? -1;
    const acts = this.entries.filter((e) => e.seq > after).slice(0, req.limit ?? 500);
    return { acts, cursor: `c${this.entries.length}` as Cursor, more: false, publishedThrough: this.publishedThrough, head: this.entries.length - 1 };
  }

  async explain(act: ActId) {
    const e = this.entries.find((x) => this.idOf(x) === act);
    if (!e) return null;
    const x = e.entry;
    const kind = envelopeOf(e)?.kind ?? "system";
    const c = x.type === "system" ? null : await this.actsAt({ seq: e.seq });
    return {
      act,
      kind,
      outcome: x.type === "system" ? "system" : x.type === "refusal" ? "refused" : "accepted",
      entry: e,
      decisions: [],
      invariants: x.type === "system" ? [] : [{ rule: "R-DECL-16" as const, held: x.type === "act", detail: "The kind was declared, and the act carried the binding in force." }],
      published: e.seq <= this.publishedThrough,
      ...(c ? { meaning: meaningOf(c, kind) } : {}),
    };
  }

  watch(_cursor: Cursor | undefined, onUpdate: (u: Update) => void) {
    this.watchers.add(onUpdate);
    const close = () => void this.watchers.delete(onUpdate);
    return { cursor: `c${this.entries.length}` as Cursor, close, [Symbol.dispose]: close };
  }

  // ------------------------------------------------------------ the named review methods

  /**
   * The code-review application's two methods the review screens call. This
   * stand-in has neither act unless its document is the legacy one, where it
   * records them as `v: 1` acts.
   */
  async review(at: ProposalAt, input: { readonly verdict: string; readonly scope: readonly string[]; readonly dependsOn?: readonly string[]; readonly text: string }) {
    if (this.active().doc !== "legacy") return refuse("kind-undeclared", "This room does not declare review.", "Use one of the room's own acts.");
    const id = this.record(this.me, { v: 1, kind: "review", target: { lane: at.lane, generation: at.generation }, body: { head: at.head, ...input } });
    return { id } as never;
  }

  async note(anchor: NoteAnchor, input: { readonly text: string; readonly replyTo?: ActId }) {
    if (this.active().doc !== "legacy") return refuse("kind-undeclared", "This room does not declare note.", "Use one of the room's own acts.");
    const id = this.record(this.me, { v: 1, kind: "note", target: anchor, body: input });
    return { id } as never;
  }
}
