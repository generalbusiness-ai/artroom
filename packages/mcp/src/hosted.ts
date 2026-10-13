/**
 * The hosted MCP endpoint (notes/2026-10-13-hosted-mcp-endpoint.md): the
 * registry of one repository's agents and the object of one agent, each over
 * a Durable Object's SQLite storage, with the runtime's classes supplied by
 * the scope Worker (`packages/scope/src/worker.ts`), which binds the ports:
 * its own routes as the agent's in-process reader, the membership object's
 * observation read as the authority check, and the namespaces.
 *
 * - A **control request** (section 3.2) is a signed statement under
 *   `artroom-mcp-control-1` by a member key: `create`, `bearer` or `retire`.
 *   Its signature, its binding to this service, the membership and its
 *   incarnation, the action, the agent and the body, and the current
 *   authority of its signer (an admin holding `membership.manage`, or the
 *   recorded controller of the agent) are checked before anything is
 *   reserved. Then the request is recorded under its `op`, and a repeat with
 *   the same fingerprint resumes or answers the same; another request under
 *   the same `op` is refused.
 * - **Enrolment** (section 3.3) is the membership's own: an admin's
 *   `add-member` and `invite-key`, then the controller's `create` with the
 *   agent-key invitation; the agent object makes its key, keeps the signed
 *   `enrol` under custody before sending it, reads the admitted entry back
 *   and confirms the key is active, and only then mints the bearer.
 * - The **bearer** `<agent>.<secret>` is held as a digest and compared in
 *   constant time; failures are counted per connecting address.
 * - **Budgets** (section 3.6): custody has the store's own; the control plane
 *   of each object has 16 MiB, of which the last 1 MiB admits `retire` alone.
 */

import type { ControlAction, ControlRequest, Digest, KeyId, MemberId, ScopeRef, Seed, SignedControl } from "@generalbusiness/dap-contract";
import { PROPOSED_BOUNDS } from "@generalbusiness/dap-contract";
import { b64url, canonicalize, digestBytes, isKeyId, isScopeRef, keyIdOfSecret, parseStrict, scopeIdOf, timeMs, timeOf, unb64url, utf8, verifyControl } from "@generalbusiness/artroom-bytes";
import { TransportError, agentKeyInvitationOf, secretSigner, signedIntent, type AgentKeyInvitation, type Fetch } from "@generalbusiness/artroom-client";
import { CustodyError, Lost, meaningOf, type Envelope, type Identity } from "./custody.ts";
import { McpHttp, type SessionRow } from "./http.ts";
import type { McpConfig, Root } from "./inventory.ts";
import { McpService } from "./service.ts";
import { sqliteStore, type Sql } from "./sqlite-custody.ts";
import { Wire } from "./wire.ts";

export const CONTROL_BUDGET = 16 * 1024 * 1024;
export const RETIRE_RESERVE = 1024 * 1024;
/** What one control operation reserves before anything else: its row, its answer and its tombstone. */
export const CONTROL_ROW_BYTES = 16 * 1024;
/** How long a stored answer is kept past the original request's `notAfter`. */
export const ANSWER_RETENTION_MS = 7 * 86_400_000;
export const CONTROL_BODY_BYTES = 64 * 1024;
export const BEARER_FAILURES_PER_MINUTE = 10;
export const OP_BYTES = 128;

/** What a control route answers: the status, and a body that names a rule or a result, never a secret except the bearer shown once. */
export interface ControlAnswer { status: number; body: Record<string, unknown> }
const answer = (status: number, body: Record<string, unknown>): ControlAnswer => ({ status, body });
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const closed = (v: unknown, keys: readonly string[]): v is Record<string, unknown> => isRecord(v) && Object.keys(v).length === keys.length && keys.every((k) => Object.hasOwn(v, k));
const same = (a: unknown, b: unknown): boolean => canonicalize(a as never) === canonicalize(b as never);

/** The `Authorization: Control <b64url canonical JSON>.<sig>` header, parsed and shape-checked; null when malformed. Verifies nothing. */
export function controlOf(authorization: string | null): SignedControl | null {
  try {
    if (!authorization?.startsWith("Control ") || authorization.length > 8 * 1024) return null;
    const [encoded, sig, ...rest] = authorization.slice("Control ".length).split(".");
    if (!encoded || !sig || rest.length > 0) return null;
    const bytes = unb64url(encoded);
    if (!bytes) return null;
    const request = parseStrict(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes));
    if (!closed(request, ["v", "action", "service", "membership", "agent", "actor", "body", "op", "notAfter"]) || request["v"] !== 1) return null;
    if (!["create", "bearer", "retire"].includes(request["action"] as string) || typeof request["service"] !== "string") return null;
    if (!isScopeRef(request["membership"]) || (request["membership"] as ScopeRef).kind !== "membership") return null;
    if (request["agent"] !== null && (typeof request["agent"] !== "string" || !/^[0-9a-f]{64}$/.test(request["agent"]))) return null;
    if (!isKeyId(request["actor"]) || typeof request["body"] !== "string" || !/^sha256:[0-9a-f]{64}$/.test(request["body"])) return null;
    if (typeof request["op"] !== "string" || utf8(request["op"]).length < 1 || utf8(request["op"]).length > OP_BYTES || typeof request["notAfter"] !== "string" || timeMs(request["notAfter"]) === null) return null;
    return { request: request as unknown as ControlRequest, sig };
  } catch { return null; }
}

/** A control request's identity: everything but its signature and its deadline. */
export const fingerprintOf = (r: ControlRequest): string => digestBytes(utf8(canonicalize([r.actor, r.membership, r.action, r.agent, r.body, r.op])));

/** The membership's observation of a key or a member, as the hosted objects read it. Null: no answer (another incarnation, or no membership). */
export interface KeyStanding { keyState: string; memberState: string; member: MemberId; actions: readonly string[]; controller: MemberId | null }
export interface MemberStanding { memberState: string; controller: MemberId | null; activeKey: boolean | null }
export interface Authority { observe(membership: ScopeRef, ask: { key: KeyId } | { member: MemberId }): Promise<unknown> }

export type Authorized = { ok: true; by: "admin" | "controller"; member: MemberId } | { ok: false };

/**
 * Current authority, read from the membership now: the signer is an active key of an active member, and that member either
 * holds `membership.manage` or is the recorded controller of the agent member named.
 */
export async function authorityOf(ports: Authority, membership: ScopeRef, actor: KeyId, agentHandle: MemberId | null): Promise<Authorized> {
  const key = (await ports.observe(membership, { key: actor })) as KeyStanding | null;
  if (!key || key.keyState !== "active" || key.memberState !== "active") return { ok: false };
  if (key.actions.includes("membership.manage")) return { ok: true, by: "admin", member: key.member };
  if (agentHandle !== null) {
    const agent = (await ports.observe(membership, { member: agentHandle })) as MemberStanding | null;
    if (agent && agent.memberState !== "unknown" && agent.controller === key.member) return { ok: true, by: "controller", member: key.member };
  }
  return { ok: false };
}

/** The checks every control request passes before any effect: the signature, its binding to this service and route, and its time. */
export function bound(signed: SignedControl, service: string, action: ControlAction, agent: string | null, body: Uint8Array, now: number): ControlAnswer | null {
  const r = signed.request;
  if (!verifyControl(signed)) return answer(403, { error: "control", rule: "signature" });
  if (r.service !== service) return answer(403, { error: "control", rule: "service" });
  if (r.action !== action || r.agent !== agent) return answer(400, { error: "control", rule: "binding" });
  if (r.body !== digestBytes(body)) return answer(400, { error: "control", rule: "body" });
  const until = timeMs(r.notAfter)!;
  if (until <= now || until > now + PROPOSED_BOUNDS.intentLifetimeSeconds * 1000) return answer(400, { error: "control", rule: "notAfter" });
  return null;
}

/** The control table and budget of one object: reservations keyed by `op`, answers, tombstones. */
class ControlPlane {
  constructor(private readonly sql: Sql) {
    sql.exec(`CREATE TABLE IF NOT EXISTS control (op TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, action TEXT NOT NULL, agent TEXT, state TEXT NOT NULL, answer TEXT, not_after TEXT NOT NULL, created TEXT NOT NULL)`);
    sql.exec(`CREATE TABLE IF NOT EXISTS control_budget (k TEXT PRIMARY KEY, v INTEGER NOT NULL)`);
    sql.exec(`INSERT OR IGNORE INTO control_budget (k, v) VALUES ('used', 0)`);
  }
  used(): number { return Number(this.sql.exec(`SELECT v FROM control_budget WHERE k = 'used'`).toArray()[0]!["v"]); }
  /** Reserve one operation's space, inside the caller's transaction. False: the budget admits none; `retire` alone may draw on the reserve. */
  reserve(action: ControlAction): boolean {
    const used = this.used();
    const ceiling = action === "retire" ? CONTROL_BUDGET : CONTROL_BUDGET - RETIRE_RESERVE;
    if (used + CONTROL_ROW_BYTES > ceiling) return false;
    this.sql.exec(`UPDATE control_budget SET v = ? WHERE k = 'used'`, used + CONTROL_ROW_BYTES);
    return true;
  }
  row(op: string): { fingerprint: string; action: string; agent: string | null; state: string; answer: ControlAnswer | null; notAfter: string } | null {
    const r = this.sql.exec(`SELECT fingerprint, action, agent, state, answer, not_after FROM control WHERE op = ?`, op).toArray()[0];
    if (!r) return null;
    return { fingerprint: String(r["fingerprint"]), action: String(r["action"]), agent: r["agent"] === null ? null : String(r["agent"]), state: String(r["state"]), answer: r["answer"] === null ? null : JSON.parse(String(r["answer"])) as ControlAnswer, notAfter: String(r["not_after"]) };
  }
  insert(op: string, fingerprint: string, action: ControlAction, agent: string | null, state: string, notAfter: string, created: string): void {
    this.sql.exec(`INSERT INTO control (op, fingerprint, action, agent, state, answer, not_after, created) VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`, op, fingerprint, action, agent, state, notAfter, created);
  }
  complete(op: string, state: string, result: ControlAnswer): void {
    this.sql.exec(`UPDATE control SET state = ?, answer = ? WHERE op = ?`, state, JSON.stringify(result), op);
  }
  /** Retention: an answer is kept seven days past the original request's deadline; the tombstone stays. */
  retained(row: { answer: ControlAnswer | null; notAfter: string }, now: number): ControlAnswer | null {
    if (!row.answer) return null;
    return now > timeMs(row.notAfter)! + ANSWER_RETENTION_MS ? answer(409, { error: "op", rule: "stale" }) : row.answer;
  }
}

// ---------------------------------------------------------------- the registry

export interface RegistryPorts extends Authority {
  service: string;
  now(): number;
  /** A fresh, unique agent object ID. */
  mintId(): string;
  /** The agent object by its ID: its `create`. */
  agent(id: string): { create(op: string, request: ControlRequest, link: AgentKeyInvitation): Promise<ControlAnswer> };
}

/** One repository's registry: the only place that creates an agent object. Named by the membership scope ID. */
export class HostedRegistry {
  readonly #control: ControlPlane;
  constructor(private readonly sql: Sql, private readonly ports: RegistryPorts) {
    sql.exec(`CREATE TABLE IF NOT EXISTS agents (agent TEXT PRIMARY KEY, handle TEXT NOT NULL, key TEXT, state TEXT NOT NULL, created TEXT NOT NULL)`);
    this.#control = new ControlPlane(sql);
  }

  /** The agents of this repository, for a test's eyes: no route lists them in this head. */
  agents(): { agent: string; handle: string; key: string | null; state: string }[] {
    return this.sql.exec(`SELECT agent, handle, key, state FROM agents ORDER BY created`).toArray().map((r) => ({ agent: String(r["agent"]), handle: String(r["handle"]), key: r["key"] === null ? null : String(r["key"]), state: String(r["state"]) }));
  }

  async create(signed: SignedControl, body: Uint8Array): Promise<ControlAnswer> {
    const now = this.ports.now();
    const refused = bound(signed, this.ports.service, "create", null, body, now);
    if (refused) return refused;
    const r = signed.request;
    let link: AgentKeyInvitation | null = null;
    try {
      const given = parseStrict(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(body));
      link = closed(given, ["link"]) && typeof given["link"] === "string" ? agentKeyInvitationOf(given["link"]) : null;
    } catch { link = null; }
    if (!link) return answer(400, { error: "link", rule: "agent-key-invitation" });
    if (link.service !== this.ports.service) return answer(400, { error: "link", rule: "service" });
    if (!same(link.repository.membership, r.membership)) return answer(400, { error: "link", rule: "membership" });
    // Authority now, before anything is reserved: the controller the invitation names, or an admin.
    const authority = await authorityOf(this.ports, r.membership, r.actor, link.handle as MemberId);
    if (!authority.ok || (authority.by === "controller" && authority.member !== link.controller.member)) return answer(403, { error: "unauthorized" });
    const fingerprint = fingerprintOf(r);
    // The reservation, in one transaction, before the handoff to the agent object.
    const reserved = this.sql.transaction((): ControlAnswer | { agent: string } => {
      const row = this.#control.row(r.op);
      if (row) {
        if (row.fingerprint !== fingerprint) return answer(409, { error: "op", rule: "fingerprint" });
        if (row.state !== "reserved") return this.#control.retained(row, now) ?? answer(409, { error: "op", rule: "stale" });
        return { agent: row.agent! };
      }
      if (!this.#control.reserve("create")) return answer(507, { error: "full", rule: "control-budget" });
      const agent = this.ports.mintId();
      this.#control.insert(r.op, fingerprint, "create", agent, "reserved", r.notAfter, timeOf(now));
      return { agent };
    });
    if ("status" in reserved) return reserved;
    const result = await this.ports.agent(reserved.agent).create(r.op, r, link);
    // Unresolved: the reservation stays, and the next request with the same op resumes it.
    if (result.status === 503) return result;
    this.sql.transaction(() => {
      this.#control.complete(r.op, result.status < 300 ? "complete" : "refused", result);
      const existing = this.sql.exec(`SELECT agent FROM agents WHERE agent = ?`, reserved.agent).toArray()[0];
      if (!existing) this.sql.exec(`INSERT INTO agents (agent, handle, key, state, created) VALUES (?, ?, ?, ?, ?)`, reserved.agent, link.handle, typeof result.body["key"] === "string" ? result.body["key"] : null, result.status < 300 ? "enrolled" : "refused", timeOf(now));
    });
    return result;
  }
}

// ---------------------------------------------------------------- the agent

export interface AgentPorts extends Authority {
  /** This object's own ID, as the registry allotted it. */
  id: string;
  /** The Worker's own routes, on its own origin. */
  fetch: Fetch;
  now(): number;
  random(bytes: number): Uint8Array;
  every?: (ms: number, run: () => void) => () => void;
  pause?: (waiting: readonly string[]) => Promise<void>;
}

interface AgentRow { op: string; seed: Uint8Array; key: KeyId; state: "enrolling" | "enrolled" | "retired" | "refused"; membership: ScopeRef; handle: string; config: McpConfig; bearer: string | null; answer: ControlAnswer | null }

/** One agent: its key, bearer, configuration, sessions, custody and control identities, all in this object. */
export class HostedAgent {
  readonly #control: ControlPlane;
  #service: McpService | null = null;
  #http: McpHttp | null = null;
  readonly #failures = new Map<string, number[]>();
  constructor(private readonly sql: Sql, private readonly ports: AgentPorts) {
    sql.exec(`CREATE TABLE IF NOT EXISTS agent (id INTEGER PRIMARY KEY CHECK (id = 1), op TEXT NOT NULL, seed BLOB NOT NULL, key TEXT NOT NULL, state TEXT NOT NULL, membership TEXT NOT NULL, handle TEXT NOT NULL, config TEXT NOT NULL, bearer TEXT, answer TEXT, created TEXT NOT NULL, updated TEXT NOT NULL)`);
    sql.exec(`CREATE TABLE IF NOT EXISTS session (id TEXT PRIMARY KEY, row TEXT NOT NULL, created INTEGER NOT NULL)`);
    this.#control = new ControlPlane(sql);
  }

  #row(): AgentRow | null {
    const r = this.sql.exec(`SELECT op, seed, key, state, membership, handle, config, bearer, answer FROM agent WHERE id = 1`).toArray()[0];
    if (!r) return null;
    const seed = r["seed"] instanceof Uint8Array ? r["seed"] : new Uint8Array(r["seed"] as ArrayBuffer);
    return { op: String(r["op"]), seed, key: String(r["key"]) as KeyId, state: String(r["state"]) as AgentRow["state"], membership: JSON.parse(String(r["membership"])) as ScopeRef, handle: String(r["handle"]), config: JSON.parse(String(r["config"])) as McpConfig, bearer: r["bearer"] === null ? null : String(r["bearer"]), answer: r["answer"] === null ? null : JSON.parse(String(r["answer"])) as ControlAnswer };
  }
  #setConfig(config: McpConfig): void { this.sql.exec(`UPDATE agent SET config = ?, updated = ? WHERE id = 1`, canonicalize(config as never), timeOf(this.ports.now())); }

  /** The service of this agent: its key from the seed, its configuration from the row, its custody in this object's storage. */
  #serviceOf(row: AgentRow): McpService {
    if (this.#service) return this.#service;
    const read = async (): Promise<McpConfig> => this.#row()?.config ?? row.config;
    this.#service = new McpService({
      service: row.config.service, fetch: this.ports.fetch, signer: secretSigner(row.seed), custody: sqliteStore(this.sql, undefined, this.ports.now), now: this.ports.now,
      ...(this.ports.every ? { every: this.ports.every } : {}), ...(this.ports.pause ? { pause: this.ports.pause } : {}),
      config: {
        read,
        addRoot: async (root: Root) => { const c = await read(); this.#setConfig({ ...c, roots: [...(c.roots ?? []).filter((x) => x.scope !== root.scope), root] }); },
        setRepository: async (repository) => { this.#setConfig({ ...(await read()), repository }); },
        joined: async (joined) => { this.#setConfig({ ...(await read()), service: joined.service, repository: joined.repository, handle: joined.handle }); },
      },
    });
    return this.#service;
  }

  #httpOf(row: AgentRow): McpHttp {
    if (this.#http) return this.#http;
    const wire = new Wire(this.#serviceOf(row));
    this.#http = new McpHttp({
      wire, bodyBytes: 1024 * 1024, now: this.ports.now,
      mintSession: () => b64url(this.ports.random(16)),
      authorized: () => true,   // the bearer was checked before the request reached the layer
      persist: (session: SessionRow) => { this.sql.transaction(() => { this.sql.exec(`INSERT INTO session (id, row, created) VALUES (?, ?, ?) ON CONFLICT (id) DO UPDATE SET row = excluded.row`, session.id, JSON.stringify(session), session.created); }); },
      remove: (id) => { this.sql.exec(`DELETE FROM session WHERE id = ?`, id); },
    });
    // The sessions as persisted survive eviction; their streams do not, and the next GET reconciles.
    this.#http.restore(this.sql.exec(`SELECT row FROM session ORDER BY created`).toArray().map((r) => JSON.parse(String(r["row"])) as SessionRow));
    return this.#http;
  }

  /** The registry's call: make the key, enrol it, mint the bearer. Idempotent on `op`; resumable at every step. */
  async create(op: string, request: ControlRequest, link: AgentKeyInvitation): Promise<ControlAnswer> {
    const now = this.ports.now();
    let row = this.#row();
    if (row && row.op !== op) return answer(409, { error: "op", rule: "agent" });
    if (row?.state === "enrolled" || row?.state === "refused") return row.answer!;
    if (row?.state === "retired") return answer(409, { error: "retired" });
    if (!row) {
      // The seed is written before the envelope is built; the control budget is reserved before the key exists.
      const made = this.sql.transaction((): ControlAnswer | null => {
        if (!this.#control.reserve("create")) return answer(507, { error: "full", rule: "control-budget" });
        const seed = this.ports.random(32);
        const config: McpConfig = { service: link.service, repository: link.repository, handle: link.handle };
        this.sql.exec(`INSERT INTO agent (id, op, seed, key, state, membership, handle, config, bearer, answer, created, updated) VALUES (1, ?, ?, ?, 'enrolling', ?, ?, ?, NULL, NULL, ?, ?)`,
          op, seed, keyIdOfSecret(seed), canonicalize(link.repository.membership as never), link.handle, canonicalize(config as never), timeOf(now), timeOf(now));
        this.#control.insert(op, fingerprintOf(request), "create", this.ports.id, "reserved", request.notAfter, timeOf(now));
        return null;
      });
      if (made) return made;
      row = this.#row()!;
    }
    const service = this.#serviceOf(row);
    const M = link.repository.membership;
    const signer = secretSigner(row.seed);
    const identity: Identity = { service: link.service, membership: M, signer: signer.key, target: M, key: `enrol:${op}` };
    const meaning = meaningOf({ enrol: digestBytes(utf8(canonicalize(link as never))) });
    const fields = { invitation: link.invitation.seq, secret: link.secret };
    const build = async () => ({
      binding: { definition: "platform:membership", kind: "enrol", declaration: null, pinned: link.definition },
      envelope: { signed: await signedIntent(signer, { to: M, kind: "enrol", on: 0, fields, expected: link.expected }, { idempotencyKey: `enrol:${op}`, now }), beside: {} } as Envelope,
    });
    const notAfter = timeOf(now + PROPOSED_BOUNDS.intentLifetimeSeconds * 1000);
    let kept: Awaited<ReturnType<typeof service.custody.send>>;
    try {
      kept = await service.custody.send(identity, meaning, build, async (envelope) => {
        try { return await service.reads.transport.submit(M.scope, envelope.signed, [], envelope.beside); }
        catch (error) { if (error instanceof TransportError) throw new Lost(); throw error; }
      }, { notAfter, bytes: utf8(canonicalize(fields)).length });
    } catch (error) {
      if (error instanceof CustodyError) return answer(error.why.held === "full" ? 507 : 503, { error: "custody", rule: error.why.held });
      throw error;
    }
    if ("lost" in kept) return answer(503, { error: "unresolved", op });
    if (kept.answer.answer !== "accepted") {
      const given = kept.answer as { answer: string; reason?: string };
      if (given.answer === "unavailable") return answer(503, { error: "unresolved", op });
      const result = answer(422, { error: "refused", reason: given.reason ?? given.answer });
      this.sql.transaction(() => { this.sql.exec(`UPDATE agent SET state = 'refused', answer = ?, updated = ? WHERE id = 1`, JSON.stringify(result), timeOf(now)); this.#control.complete(op, "refused", result); });
      return result;
    }
    // Admitted: the entry holds the exact envelope, the key reads back active, and only then is the bearer minted.
    const fact = kept.answer.receipt.fact;
    service.reads.forget(M.scope);
    const entry = await service.reads.read(M, (t, r) => t.entry(M.scope, r, fact.seq));
    if (!entry.ok) return answer(503, { error: "unresolved", op, rule: "read-back" });
    const input = entry.value.entry.input;
    if (entry.value.hash !== fact.hash || input.type !== "act" || canonicalize(input.signed) !== canonicalize(kept.record.envelope.signed)) return answer(409, { error: "enrol", rule: "entry" });
    const standing = (await this.ports.observe(M, { key: signer.key })) as KeyStanding | null;
    if (!standing || standing.keyState !== "active") return answer(503, { error: "unresolved", op, rule: "key-not-active" });
    const inbox = entry.value.entry.sends.flatMap((send) => ("creator" in send.to && send.to.kind === "inbox" ? [scopeIdOf(send.to as Seed)] : []))[0];
    const secret = b64url(this.ports.random(32));
    const bearer = `${this.ports.id}.${secret}`;
    const result = answer(201, { agent: this.ports.id, key: signer.key, handle: link.handle, member: fact, bearer });
    this.sql.transaction(() => {
      const config: McpConfig = { ...row!.config, repository: { ...link.repository, ...(inbox ? { inbox } : {}) } };
      this.sql.exec(`UPDATE agent SET state = 'enrolled', bearer = ?, answer = ?, config = ?, updated = ? WHERE id = 1`, digestBytes(utf8(secret)), JSON.stringify(result), canonicalize(config as never), timeOf(now));
      this.#control.complete(op, "complete", result);
    });
    this.#service = null;   // derived again with the configuration that names the inbox
    this.#http = null;
    return result;
  }

  /** `bearer` and `retire`: the rotation or the ending, every session's deletion, every stream's close and the answer, in one transaction. */
  async control(signed: SignedControl, action: "bearer" | "retire", body: Uint8Array): Promise<ControlAnswer> {
    const now = this.ports.now();
    const row = this.#row();
    if (!row || row.state === "enrolling") return answer(404, { error: "agent" });
    const refused = bound(signed, row.config.service, action, this.ports.id, body, now);
    if (refused) return refused;
    const r = signed.request;
    if (!same(r.membership, row.membership)) return answer(400, { error: "control", rule: "membership" });
    const authority = await authorityOf(this.ports, row.membership, r.actor, row.handle as MemberId);
    if (!authority.ok) return answer(403, { error: "unauthorized" });
    const fingerprint = fingerprintOf(r);
    const secret = action === "bearer" ? b64url(this.ports.random(32)) : null;
    const result = this.sql.transaction((): ControlAnswer => {
      const existing = this.#control.row(r.op);
      if (existing) {
        if (existing.fingerprint !== fingerprint) return answer(409, { error: "op", rule: "fingerprint" });
        return this.#control.retained(existing, now) ?? answer(409, { error: "op", rule: "stale" });
      }
      if (row.state === "retired") return answer(409, { error: "retired" });
      if (!this.#control.reserve(action)) return answer(507, { error: "full", rule: "control-budget" });
      const done = action === "bearer"
        ? answer(200, { agent: this.ports.id, by: authority.by, bearer: `${this.ports.id}.${secret}` })
        : answer(200, { agent: this.ports.id, by: authority.by, retired: true });
      if (action === "bearer") this.sql.exec(`UPDATE agent SET bearer = ?, updated = ? WHERE id = 1`, digestBytes(utf8(secret!)), timeOf(now));
      else this.sql.exec(`UPDATE agent SET state = 'retired', bearer = NULL, updated = ? WHERE id = 1`, timeOf(now));
      this.sql.exec(`DELETE FROM session`);
      this.#control.insert(r.op, fingerprint, action, this.ports.id, "complete", r.notAfter, timeOf(now));
      this.#control.complete(r.op, "complete", done);
      return done;
    });
    if (result.status === 200 && this.#http) {
      // Graceful: every open stream closes with a final event; the sessions are already gone.
      const http = this.#http;
      this.#http = null;
      await http.closeAll();
    }
    return result;
  }

  /** The bearer check, in constant time over digests, with failures counted per connecting address. */
  #authorized(authorization: string | null, address: string | null): "ok" | "unauthorized" | "limited" {
    const key = address ?? "";
    const now = this.ports.now();
    const recent = (this.#failures.get(key) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= BEARER_FAILURES_PER_MINUTE) { this.#failures.set(key, recent); return "limited"; }
    const row = this.#row();
    let ok = false;
    if (authorization?.startsWith("Bearer ") && row?.state === "enrolled" && row.bearer) {
      const [id, secret, ...rest] = authorization.slice("Bearer ".length).split(".");
      if (id === this.ports.id && secret && rest.length === 0) {
        const given = utf8(digestBytes(utf8(secret)));
        const expected = utf8(row.bearer);
        let differ = given.length ^ expected.length;
        for (let i = 0; i < Math.max(given.length, expected.length); i++) differ |= (given[i] ?? 0) ^ (expected[i] ?? 0);
        ok = differ === 0;
      }
    }
    if (!ok) { recent.push(now); this.#failures.set(key, recent); return "unauthorized"; }
    return "ok";
  }

  /** `POST`, `GET` and `DELETE /mcp` for this agent. */
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("origin") !== null) return new Response(null, { status: 403 });
    const checked = this.#authorized(request.headers.get("authorization"), request.headers.get("cf-connecting-ip"));
    if (checked === "limited") return new Response(JSON.stringify({ error: "rate-limited" }), { status: 429, headers: { "content-type": "application/json" } });
    if (checked === "unauthorized") return new Response(null, { status: 401 });
    return this.#httpOf(this.#row()!).handle(request);
  }

  /** For a test: the service and the layer as this object holds them now. */
  inside(): { service: McpService | null; http: McpHttp | null } { return { service: this.#service, http: this.#http }; }
}

export type { ControlRequest, SignedControl, Digest };
