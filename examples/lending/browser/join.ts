/**
 * Joining the room from a browser with an invitation, and finding the room's
 * lending scope. Requirement 1 of notes/2026-10-13-lending-library.md, section 6.
 *
 * The device key is made by WebCrypto and cannot be read out. The join is one
 * signed act to the room's membership, under the same custody as a lending act
 * (custody.ts): kept before it is sent, ordinary recovery by a read, and
 * explicit Continue with the original envelope. The kept join holds the invitation's secret, as the signed act does;
 * it stays in this origin's private storage and is cleared once the join is settled.
 */
import type { KeyId, MemberId, Receipt, ScopeRef, Summary } from "@generalbusiness/dap-contract";
import { b64url, canonicalize, intentDigest, keyIdOf, timeMs, timeOf } from "@generalbusiness/artroom-bytes";
import { ScopeHandle, httpTransport, invitationOf, requestSession, signedIntent, signerSessionRequest, wellFormedInvitation,
  type Fetch, type InvitationLink, type Signer } from "@generalbusiness/artroom-client";
import { LENDING_DEFINITION } from "../pin.ts";
import { memberForKey } from "./model.ts";
import { advance, envelopeKey, validKept, type Binding, type CustodyLock, type Envelope, type Kept, type KeptStore, type LendingIdentity, type Ports } from "./custody.ts";

/** The membership version of the application cohort, which the lending room uses. */
export const ROOM_MEMBERSHIP = "platform:membership@4";

/** A device key that WebCrypto holds. `pair` can be stored in IndexedDB as it is; its private half is not extractable. */
export interface DeviceKey { publicKey: KeyId; pair: CryptoKeyPair }
/** The WebCrypto calls used here, in this file's own terms, so that it reads the same under every runtime's types. */
interface Subtle {
  generateKey(algorithm: { name: string }, extractable: boolean, usages: readonly string[]): Promise<unknown>;
  exportKey(format: "raw", key: unknown): Promise<ArrayBuffer>;
  sign(algorithm: { name: string }, key: unknown, data: Uint8Array): Promise<ArrayBuffer>;
}
const subtle = (): Subtle => crypto.subtle as unknown as Subtle;
export async function newDeviceKey(): Promise<DeviceKey> {
  const pair = await subtle().generateKey({ name: "Ed25519" }, false, ["sign", "verify"]) as CryptoKeyPair;
  return { publicKey: keyIdOf(new Uint8Array(await subtle().exportKey("raw", pair.publicKey))), pair };
}
export function deviceSigner(device: DeviceKey): Signer {
  if (device.pair.privateKey.extractable) throw new Error("A device key must not be extractable.");
  return { key: device.publicKey, sign: async (bytes) => b64url(new Uint8Array(await subtle().sign({ name: "Ed25519" }, device.pair.privateKey, Uint8Array.from(bytes)))) };
}

/** The seat an invitation offers: the room's scopes and the handle. No secret is in it. */
export interface Seat { origin: string; directory: ScopeRef; membership: ScopeRef; handle: MemberId }
export type Invited = { ok: true; link: InvitationLink; seat: Seat } | { ok: false; reason: string };

/** Read an invitation link for this service. A link for another service, another membership version or with a part missing is refused. */
export function readInvitation(text: string, origin: string): Invited {
  const typed = text.trim();
  if (typed.length > 16 * 1024) return { ok: false, reason: "That is too long to be an invitation." };
  const link = invitationOf(typed);
  if (!link || !wellFormedInvitation(link)) return { ok: false, reason: "That is not an invitation link." };
  let service: string;
  try { service = new URL(link.service).origin; } catch { return { ok: false, reason: "The invitation names no service." }; }
  if (service !== origin) return { ok: false, reason: "This invitation is for another service." };
  if (link.definition !== ROOM_MEMBERSHIP) return { ok: false, reason: "This invitation is for a room this library cannot join." };
  // Membership judges the handle. Here it only has to be one short word that starts with @.
  if (!/^@\S{1,63}$/.test(link.handle)) return { ok: false, reason: "The invitation's handle is not a handle." };
  return { ok: true, link, seat: { origin, directory: link.repository.directory, membership: link.repository.membership, handle: link.handle as MemberId } };
}

/** A join kept with the seat it is for, so that a reload can show and settle it. */
export interface KeptJoin { v: 1; seat: Seat; kept: Kept }
export interface JoinStore { load(): Promise<unknown>; save(value: KeptJoin): Promise<void>; clear(): Promise<void> }
export type JoinOutcome =
  | { status: "joined"; seat: Seat }
  | { status: "refused"; reason: string }
  | { status: "unknown"; reason: string; seat?: Seat }
  | { status: "nothing-sent"; reason: string };

const joinBinding = (seat: Seat, key: KeyId): Binding => ({ scope: seat.membership, publicKey: key, kinds: ["join"] });
const validJoin = (value: unknown, key: KeyId): value is KeptJoin => {
  const held = value as KeptJoin | null;
  try {
    return !!held && held.v === 1 && !!held.seat && typeof held.seat.origin === "string" && typeof held.seat.handle === "string"
      && validKept(held.kept, joinBinding(held.seat, key));
  } catch { return false; }
};
const refusalWords = (reason: string): string =>
  `${reason === "guard-failed" ? "The room did not accept this invitation. It may be used, ended or mistyped." : reason === "unauthorized" ? "The room does not allow this join." : "The room refused the join."} (${reason})`;

export interface Joining {
  /** Sign the join once, keep it, then send it. Refused while an earlier join is kept. */
  join(link: InvitationLink, seat: Seat): Promise<JoinOutcome>;
  /** The seat of the kept join, or null. */
  pending(): Promise<Seat | null>;
  /** Check submits no new join act. Reading its recorded entry may first
   * sign and send read-session authentication. */
  check(): Promise<JoinOutcome | null>;
  /** Explicit Continue sends the kept join, without signing another one. */
  continueOriginal(): Promise<JoinOutcome | null>;
}

export function joining(device: DeviceKey, options: { lock: CustodyLock; store: JoinStore; current?: () => boolean; now?: () => number; fetch?: Fetch; actFetch?: Fetch }): Joining {
  const signer = deviceSigner(device), now = options.now ?? (() => Date.now()), usable = options.current ?? (() => true);
  const current = () => { if (!usable()) throw new Error("This join context is no longer current."); };
  const transport = (origin: string, fetch?: Fetch) => httpTransport(origin, fetch ? { fetch } : {});
  const ports = (seat: Seat): Ports => {
    // A person who has not joined has no read session. Settlement by the exact signed request needs none.
    const reads = new ScopeHandle(transport(seat.origin, options.fetch), seat.membership.scope, null);
    return {
      current: usable,
      post: (envelope) => new ScopeHandle(transport(seat.origin, options.actFetch ?? options.fetch), seat.membership.scope, null).submit(envelope.signed, envelope.grants, envelope.beside),
      recorded: async (receipt: Receipt, envelope: Envelope) => {
        if (receipt.definition !== ROOM_MEMBERSHIP || receipt.intent !== intentDigest(envelope.signed.intent) || canonicalize(receipt.fact.at) !== canonicalize(seat.membership)) return false;
        // Reading the recorded entry needs a session. If the join took effect, this device is a member
        // and the room gives its key one; if the room gives none, the join is not verified.
        const asked = await signerSessionRequest(seat.membership, signer, timeOf(now() + 60_000), b64url(crypto.getRandomValues(new Uint8Array(16))));
        const session = await requestSession(seat.origin, seat.membership.scope, asked, options.fetch ? { fetch: options.fetch } : {});
        if (!session.ok) return false;
        const followed = await new ScopeHandle(transport(seat.origin, options.fetch), seat.membership.scope, session.session.reader()).followReceipt(receipt);
        return followed.ok && followed.entry.input.type === "act" && canonicalize(followed.entry.input.signed) === canonicalize(envelope.signed);
      },
      settle: async (envelope) => { const answer = await reads.settle(envelope.signed); return answer.ok ? answer.value : null; },
    };
  };
  const inner = (held: KeptJoin): KeptStore => ({ load: async () => { const now = await options.store.load(); return validJoin(now, device.publicKey) ? now.kept : null; },
    save: (kept) => options.store.save({ v: 1, seat: held.seat, kept }), clear: () => options.store.clear() });
  const conclude = async (held: KeptJoin, readOnly: boolean, continueOriginal = false): Promise<JoinOutcome> => {
    current();
    const settled = await advance(inner(held), joinBinding(held.seat, device.publicKey), ports(held.seat), held.kept.envelope, readOnly, continueOriginal);
    current();
    if (settled.status === "unknown") return { status: "unknown", seat: held.seat, reason: "No answer came back that could be trusted. The original join is kept. Check it; do not use the invitation again." };
    const latest = await options.store.load(); current();
    if (!validJoin(latest, device.publicKey) || envelopeKey(latest.kept.envelope) !== envelopeKey(held.kept.envelope) || latest.kept.phase !== settled.status)
      return { status: "unknown", seat: held.seat, reason: "The original join is kept. Check it." };
    // Settled: the invitation's secret leaves this browser with the kept join.
    await options.store.clear(); current();
    return settled.status === "recorded" ? { status: "joined", seat: held.seat } : { status: "refused", reason: refusalWords(settled.reason) };
  };
  return {
    join(link, seat) {
      return options.lock.run(async (): Promise<JoinOutcome> => {
        current();
        if ((await options.store.load() ?? null) !== null) return { status: "nothing-sent", reason: "An earlier join is kept. Check it first." };
        current();
        let held: KeptJoin;
        try {
          const signed = await signedIntent(signer, { to: seat.membership, kind: "join", fields: { invitation: link.invitation, secret: link.secret }, expected: {} }, { now: now() }); current();
          held = { v: 1, seat, kept: { v: 1, kind: "join", envelope: { signed, grants: [], beside: {} }, phase: "prepared" } };
          if (!validJoin(held, device.publicKey)) throw new Error("not a join of this device");
          await options.store.save(held); current();
        } catch { return { status: "nothing-sent", reason: "The join could not be signed and kept. Nothing was sent." }; }
        return conclude(held, false);
      });
    },
    continueOriginal() {
      return options.lock.run(async () => {
        current(); const held = await options.store.load(); current();
        if ((held ?? null) === null) return null;
        if (!validJoin(held, device.publicKey)) return { status: "unknown" as const, reason: "The kept join cannot be read. It stays in this browser." };
        const deadline = timeMs(held.kept.envelope.signed.intent.notAfter);
        if (deadline === null || now() > deadline) return { status: "unknown" as const, seat: held.seat, reason: "The original join's deadline has passed. Check it; nothing was sent." };
        return conclude(held, false, true);
      });
    },
    async pending() { const held = await options.store.load(); return validJoin(held, device.publicKey) ? held.seat : null; },
    check() {
      return options.lock.run(async () => {
        current(); const held = await options.store.load(); current();
        if ((held ?? null) === null) return null;
        if (!validJoin(held, device.publicKey)) return { status: "unknown" as const, reason: "The kept join cannot be read. It stays in this browser." };
        return conclude(held, true);
      });
    },
  };
}

export type DiscoveryResult = { ok: true; identity: LendingIdentity } | { ok: false; reason: string };
/**
 * The room's lending scope, read from the room's directory with this device's own
 * session: the one application that the directory created under the lending pin.
 */
export async function findLending(seat: Seat, device: DeviceKey, options: { now?: () => number; fetch?: Fetch; deployment?: string } = {}): Promise<DiscoveryResult> {
  const signer = deviceSigner(device), now = options.now ?? (() => Date.now());
  const signed = await signerSessionRequest(seat.membership, signer, timeOf(now() + 60_000), b64url(crypto.getRandomValues(new Uint8Array(16))));
  const answer = await requestSession(seat.origin, seat.membership.scope, signed, options.fetch ? { fetch: options.fetch } : {});
  if (!answer.ok) return { ok: false, reason: `The room refused a read session: ${answer.reason}.` };
  const api = httpTransport(seat.origin, options.fetch ? { fetch: options.fetch } : {}), reader = answer.session.reader();
  const membership = await new ScopeHandle(api, seat.membership.scope, reader).summary();
  if (!membership.ok) return { ok: false, reason: `The room's membership could not be read: ${membership.reason}.` };
  if (!membership.complete || membership.next !== undefined || membership.value.definition !== ROOM_MEMBERSHIP || canonicalize(membership.value.scope) !== canonicalize(seat.membership)) return { ok: false, reason: "The room's membership could not be confirmed for this history." };
  const member = memberForKey(membership.value, device.publicKey);
  if (!member) return { ok: false, reason: "The room did not confirm this device's active membership." };
  const read = await new ScopeHandle(api, seat.directory.scope, reader).summary();
  if (!read.ok) return { ok: false, reason: `The room's directory could not be read: ${read.reason}.` };
  const scopes = lendingScopes(read.value);
  if (scopes.length !== 1) return { ok: false, reason: scopes.length === 0 ? "This room has no lending library." : "This room has more than one lending library." };
  return { ok: true, identity: { origin: seat.origin, deployment: options.deployment ?? seat.origin, scope: scopes[0]!, definition: LENDING_DEFINITION,
    membership: seat.membership, member, publicKey: device.publicKey } };
}
/** The scopes of the directory's created applications that pin the lending definition. */
export function lendingScopes(directory: Summary): ScopeRef[] {
  return directory.items.filter((item) => item.type === "application" && item.state === "created" && item.values["definition"] === LENDING_DEFINITION)
    .map((item) => item.refs["scope"]).filter((ref): ref is ScopeRef => typeof ref === "object" && ref !== null && "scope" in ref && "inc" in ref);
}
