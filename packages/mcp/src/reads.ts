/**
 * How the server reads: with a read session it asks membership for, kept in
 * memory, and by signed reads of its key where no session is given or a
 * session is refused (plan 031, section 7, "Where it runs"). A session is
 * asked of each membership the inventory uses, once, and again before a read
 * when it has ended. Nothing here is authority, and no token is written
 * anywhere: `Session` keeps it out of its JSON and text.
 */

import type { ItemQueryRead, Read, ScopeId, ScopeRef } from "@generalbusiness/dap-contract";
import { timeOf } from "@generalbusiness/artroom-bytes";
import { TransportError, httpTransport, requestSession, signedReads, signerSessionRequest, type Fetch, type Session, type Signer, type Transport } from "@generalbusiness/artroom-client";

export interface ReadPort {
  service: string;
  fetch?: Fetch;
  signer: Signer;
  now: () => number;
}

/** How long a membership that refused a session is not asked again, in milliseconds. */
const REFUSED_FOR_MS = 60_000;

export class Reads {
  readonly #port: ReadPort;
  readonly #sessions = new Map<ScopeId, { session: Session | null; refusedAt: number | null }>();
  readonly #plain: Transport;
  readonly #signed: Transport;

  constructor(port: ReadPort) {
    this.#port = port;
    this.#plain = httpTransport(port.service, port.fetch ? { fetch: port.fetch } : {});
    this.#signed = signedReads(this.#plain, port.signer, { now: port.now });
  }

  get transport(): Transport { return this.#plain; }
  get service(): string { return this.#port.service; }
  get fetch(): Fetch | undefined { return this.#port.fetch; }
  get signer(): Signer { return this.#port.signer; }
  now(): number { return this.#port.now(); }

  /** The session of a membership, asked for when none is held or the held one has ended. Null: membership gave none. */
  async session(membership: ScopeRef | null): Promise<Session | null> {
    if (membership === null) return null;
    const held = this.#sessions.get(membership.scope);
    const now = this.#port.now();
    if (held?.session && !held.session.endedBy(timeOf(now + 10_000))) return held.session;
    if (held && held.session === null && held.refusedAt !== null && now - held.refusedAt < REFUSED_FOR_MS) return null;
    try {
      const notAfter = timeOf(Math.floor(now / 1000) * 1000 + 60_000);
      const asked = await signerSessionRequest(membership, this.#port.signer, notAfter, crypto.randomUUID());
      const answer = await requestSession(this.#port.service, membership.scope, asked, this.#port.fetch ? { fetch: this.#port.fetch } : {});
      this.#sessions.set(membership.scope, answer.ok ? { session: answer.session, refusedAt: null } : { session: null, refusedAt: now });
      return answer.ok ? answer.session : null;
    } catch (error) {
      if (!(error instanceof TransportError)) throw error;
      this.#sessions.set(membership.scope, { session: null, refusedAt: now });
      return null;
    }
  }

  /** Forget a session, so the next read asks again: after a read that the session was refused for, as after a role change. */
  forget(membership: ScopeId): void { this.#sessions.delete(membership); }

  /**
   * One read of one scope: with the session of `membership` first, and by a
   * signed read where there is no session or the session was refused.
   */
  async read<T>(membership: ScopeRef | null, run: (transport: Transport, reader: string | null) => Promise<Read<T>>): Promise<Read<T>>;
  async read(membership: ScopeRef | null, run: (transport: Transport, reader: string | null) => Promise<ItemQueryRead>): Promise<ItemQueryRead>;
  async read<R extends { ok: true } | { ok: false; reason: string }>(membership: ScopeRef | null, run: (transport: Transport, reader: string | null) => Promise<R>): Promise<R> {
    const session = await this.session(membership);
    if (session) {
      const got = await run(this.#plain, session.reader());
      if (got.ok || (got.reason !== "forbidden" && got.reason !== "sessions-unavailable")) return got;
    }
    return run(this.#signed, null);
  }

  /** The reader to present for one membership, or null for signed reads. For a route that is not a contract read, such as the credential route. */
  async reader(membership: ScopeRef | null): Promise<string | null> {
    return (await this.session(membership))?.reader() ?? null;
  }
}
