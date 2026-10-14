/** Origin-private ready connections. Shared CLI owns exact invitation stages;
 * this Page adapter owns their browser retention and original-operation lock. */
import type { KeyId, ScopeRef } from "@generalbusiness/dap-contract";
import { b64url, canonicalize, isDigest, isRecord, keyIdOfSecret, parseStrict, utf8 } from "@generalbusiness/artroom-bytes";
import { issueInvitation, isInvitationIssueInput, type Config, type Store, type InvitationIssueInput, type InvitationIssueResult } from "@generalbusiness/dap-cli";
import { openRoom, type Room } from "./data.ts";
import { startRoom, originalStart, recoveryKeyOnce, type StartOptions } from "./start-custody.ts";
import type { ClaimStorage } from "./claim.ts";

export interface FounderBinding { key: KeyId; operation: string; membership: ScopeRef }
export interface ConnectionOptions extends Pick<StartOptions, "locks" | "current" | "fetch" | "now" | "pause" | "tries"> { mode: "new" | "check" | "continue" }
interface Row { operation: string; input: InvitationIssueInput; state: "reserved" | "entered" | InvitationIssueResult["state"]; config: Config; private: Record<string, string>; reason?: string }
interface Journal { v: 1; binding: string; active: string; rows: Record<string, Row> }
export interface ConnectionStatus { operation: string; kind: "person" | "agent-key"; handle: string; state: Row["state"]; reason?: string }
const MOST = 256 * 1024, MAX_OPERATIONS = 16;
const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const unavailable = () => new Error("The original private connection is unavailable or changed. Nothing was replaced or submitted.");
const bindingOf = (origin: string, expected: FounderBinding) => canonicalize([origin, expected.membership, expected.key, expected.operation]);
const storageKey = (binding: string) => `artroom-page-connections:${binding}`;
function read(storage: ClaimStorage, binding: string): Journal | null {
  const bytes = storage.getItem(storageKey(binding));
  if (bytes === null) return null;
  try {
    if (utf8(bytes).length > MOST) throw unavailable();
    const journal: unknown = parseStrict(bytes);
    if (!isRecord(journal) || Object.keys(journal).sort().join(",") !== "active,binding,rows,v" || journal["v"] !== 1 || journal["binding"] !== binding || !uuid(journal["active"]) || !isRecord(journal["rows"]) || Object.keys(journal["rows"]).length > MAX_OPERATIONS || !Object.hasOwn(journal["rows"], journal["active"])) throw unavailable();
    for (const [operation, row] of Object.entries(journal["rows"])) {
      if (!uuid(operation) || !isRecord(row) || row["operation"] !== operation || !Object.keys(row).every(k => ["operation", "input", "state", "config", "private", "reason"].includes(k)) || !["reserved", "entered", "prepared", "unknown", "refused", "verified"].includes(String(row["state"])) || !isInvitationIssueInput(row["input"]) || !isRecord(row["config"]) || !isRecord(row["private"]) || Object.entries(row["private"]).some(([name, value]) => !/^[A-Za-z0-9._-]{1,160}$/.test(name) || typeof value !== "string") || row["reason"] !== undefined && typeof row["reason"] !== "string") throw unavailable();
      // Once the workflow has been entered, absent private custody must never
      // be reinterpreted as a fresh operation. The shared helper validates its
      // own pointer/digest/input/stages before any Check or Continue.
      if (row["state"] !== "reserved" && !row["config"]["invitationIssue"]) throw unavailable();
      const pointer = row["config"]["invitationIssue"];
      const context = parseStrict(binding) as readonly unknown[];
      if (pointer !== undefined && (!isRecord(pointer) || Object.keys(pointer).sort().join(",") !== "actor,digest,membership,operation,request" || pointer["operation"] !== operation || !isDigest(pointer["digest"]) || canonicalize(pointer["membership"]) !== canonicalize(context[1]) || pointer["actor"] !== context[2] || typeof pointer["request"] !== "string" || !Object.hasOwn(row["private"], pointer["request"]))) throw unavailable();
    }
    if (canonicalize(journal) !== bytes) throw unavailable();
    return journal as unknown as Journal;
  } catch { throw unavailable(); }
}
function write(storage: ClaimStorage, journal: Journal, current: () => boolean): Journal {
  if (!current()) throw unavailable();
  const bytes = canonicalize(journal);
  if (utf8(bytes).length > MOST) throw new Error("Private connection custody is full. Originals are retained; nothing further was submitted.");
  // Validate the complete candidate before touching the retained original.
  read({ getItem: () => bytes, setItem: () => { throw unavailable(); } }, journal.binding);
  storage.setItem(storageKey(journal.binding), bytes);
  if (storage.getItem(storageKey(journal.binding)) !== bytes) throw unavailable();
  if (!current()) throw unavailable();
  return structuredClone(journal);
}
export function originalConnection(origin: string, storage: ClaimStorage, expected: FounderBinding): ConnectionStatus | null {
  const journal = read(storage, bindingOf(origin, expected));
  if (!journal) return null;
  const row = journal.rows[journal.active]!;
  return { operation: row.operation, kind: row.input.kind, handle: row.input.handle, state: row.state, ...(row.reason ? { reason: row.reason } : {}) };
}
async function withFounder<T>(origin: string, storage: ClaimStorage, expected: FounderBinding, options: ConnectionOptions, work: (room: Room, config: Config) => Promise<T>): Promise<T> {
  const status = originalStart(origin, storage);
  if (!status || status.key !== expected.key || status.operation !== expected.operation || options.current?.() === false) throw unavailable();
  const result = await startRoom(origin, storage, { ...options, mode: "check" });
  const secret = result.secret;
  try {
    if (!result.repository || !secret || result.operation !== expected.operation || result.key !== expected.key || canonicalize(result.repository.membership) !== canonicalize(expected.membership)) throw new Error("The original founder proof is not verified. Check the original Start; no connection was submitted.");
    const room = await openRoom({ service: origin, secret, ...(options.fetch ? { fetch: options.fetch } : {}), ...(options.now ? { now: options.now } : {}) }, { directory: result.repository.directory.scope, membership: result.repository.membership });
    if (options.current?.() === false || room.session.service !== origin || room.directory !== result.repository.directory.scope || canonicalize(room.membership) !== canonicalize(expected.membership) || room.key !== expected.key || room.key !== keyIdOfSecret(secret) || room.me?.handle !== result.handle) throw unavailable();
    return await work(room, { v: 1, service: origin, key: "browser", register: result.configured.register, repository: result.repository, handle: result.handle });
  } finally { secret?.fill(0); }
}
export async function connectInvitation(origin: string, storage: ClaimStorage, expected: FounderBinding, input: InvitationIssueInput, options: ConnectionOptions): Promise<InvitationIssueResult> {
  const browser = globalThis as { navigator?: { locks?: import("./claim.ts").ClaimLocks } };
  const locks = options.locks ?? browser.navigator?.locks;
  if (!locks) throw unavailable();
  const binding = bindingOf(origin, expected);
  return locks.request(`artroom-page-connections:${binding}`, () => withFounder(origin, storage, expected, options, async (room, base) => {
    let journal = read(storage, binding) ?? { v: 1 as const, binding, active: "", rows: {} };
    const active = journal.active ? journal.rows[journal.active] : undefined;
    for (const stored of Object.values(journal.rows)) {
      const { invitationIssue: _pointer, ...unchanged } = stored.config;
      if (canonicalize(unchanged) !== canonicalize(base)) throw unavailable();
    }
    const current = () => options.current?.() !== false && (() => { try { const original = originalStart(origin, storage); return original?.key === expected.key && original.operation === expected.operation; } catch { return false; } })();
    let row: Row;
    if (options.mode === "new") {
      if (active && !["verified", "refused"].includes(active.state)) throw new Error("An original connection remains unresolved. Check or explicitly Continue it before another invitation.");
      if (Object.keys(journal.rows).length >= MAX_OPERATIONS) throw new Error("Private connection history is full. No original is evicted for another invitation.");
      if (!room.me?.actions.includes("membership.invite") || input.kind === "agent-key" && (!room.me.actions.includes("membership.manage") || !room.me.ref)) throw new Error("This verified founder cannot currently create that connection. Nothing was submitted.");
      const actualInput: InvitationIssueInput = input.kind === "agent-key" ? { ...input, controller: room.me.ref! } : input;
      if (!isInvitationIssueInput(actualInput)) throw new Error("Enter a valid handle and supported connection details. Nothing was reserved or submitted.");
      const operation = crypto.randomUUID();
      row = { operation, input: structuredClone(actualInput), state: "reserved", config: structuredClone(base), private: {} };
      if (storage.getItem(storageKey(binding)) !== (journal.active ? canonicalize(journal) : null)) throw unavailable();
      journal = write(storage, { ...journal, active: operation, rows: { ...journal.rows, [operation]: row } }, current);
    } else {
      if (!active) throw new Error("There is no retained original connection. Nothing was submitted.");
      row = structuredClone(active);
      if (row.state === "reserved" && options.mode === "check") return { operation: row.operation, kind: row.input.kind, handle: row.input.handle, state: "prepared", reason: "A reserved original is retained, but its public pointer has not been verified. Check sends nothing. Continue explicitly to recover its exact initial private snapshot if available." };
    }
    const operation = row.operation;
    const reservedNames = row.state === "reserved" && options.mode === "continue" ? Object.keys(row.private) : [];
    if (row.state === "reserved" && options.mode === "continue" && reservedNames.length !== 1) throw new Error("The exact initial private connection snapshot is missing or ambiguous. Nothing was submitted.");
    const update = (next: Row) => { if (storage.getItem(storageKey(binding)) !== canonicalize(journal)) throw unavailable(); journal = write(storage, { ...journal, rows: { ...journal.rows, [operation]: next } }, current); row = structuredClone(next); };
    const store: Store = {
      config: async () => structuredClone(row.config),
      save: async config => {
        const { invitationIssue: _pointer, ...unchanged } = config;
        if (canonicalize(unchanged) !== canonicalize(base) || config.invitationIssue?.operation !== operation) throw unavailable();
        update({ ...row, config: structuredClone(config), state: "entered" });
      },
      secret: async name => name === "browser" ? room.session.secret.slice() : null,
      keep: async () => { throw new Error("Connection creation never replaces or generates a founder signing key."); },
      private: async name => row.private[name] === undefined ? null : utf8(row.private[name]!),
      keepPrivate: async (name, bytes) => {
        if (!/^[A-Za-z0-9._-]{1,160}$/.test(name)) throw unavailable();
        const value = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
        if (row.private[name] !== undefined && row.private[name] !== value) throw new Error("An original private connection snapshot is never overwritten.");
        update({ ...row, private: { ...row.private, [name]: value } });
      }
    };
    // The shared helper records its pointer/private snapshot before any
    // invitation secret/signing stage can be dispatched. Page never calls
    // mode:new again for this reserved operation after it has been entered.
    const result = await issueInvitation({ store, ...(options.fetch ? { fetch: options.fetch } : {}), ...(options.now ? { now: options.now } : {}), ...(options.pause ? { pause: options.pause } : {}), ...(options.tries !== undefined ? { tries: options.tries } : {}) }, row.input, { mode: options.mode, operation, current, privateRequests: Object.keys(row.private), ...(reservedNames.length === 1 ? { reservedRequest: reservedNames[0]! } : {}) });
    if (!current() || result.operation !== operation || result.kind !== row.input.kind || result.handle !== row.input.handle) throw unavailable();
    const { reason: _previousReason, ...retained } = row;
    update({ ...retained, state: result.state, ...(result.reason ? { reason: result.reason } : {}) });
    return result;
  }));
}
export async function founderConnectionFiles(origin: string, storage: ClaimStorage, expected: FounderBinding, options: Omit<ConnectionOptions, "mode"> = {}): Promise<{ config: string; key: string }> {
  return withFounder(origin, storage, expected, { ...options, mode: "check" }, async (room, config) => ({
    config: JSON.stringify({ ...config, key: "device" }, null, 2) + "\n",
    key: b64url(room.session.secret) + "\n"
  }));
}
export async function saveFounderRecoveryOnce(origin: string, storage: ClaimStorage, expected: FounderBinding, options: Omit<ConnectionOptions, "mode"> = {}): Promise<string> {
  return withFounder(origin, storage, expected, { ...options, mode: "check" }, async () => recoveryKeyOnce(origin, storage, expected, options));
}
