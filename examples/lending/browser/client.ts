/**
 * The lending gateway: reads the lending scope, and signs, keeps and sends one
 * lending act at a time. It follows notes/2026-10-13-lending-library.md, section 4.1.
 *
 * An act is signed once and kept (custody.ts) before anything is sent. After a
 * lost reply or a reload Check is read-only. Explicit Continue reuses that
 * original envelope. Nothing here signs a replacement.
 */
import type { Entry, Receipt, Summary } from "@generalbusiness/dap-contract";
import { b64url, canonicalize, intentDigest, timeMs, timeOf } from "@generalbusiness/artroom-bytes";
import { ScopeHandle, completeSummary, httpTransport, observeScope, openHttpHeadStream, requestSession, shapeDeclaredAct, signedIntent, signerSessionRequest,
  type CompleteSnapshot, type Fetch, type HeadStreamFetch, type Observation, type Session, type Signer } from "@generalbusiness/artroom-client";
import { lending } from "../definition.ts";
import { LENDING_DEFINITION } from "../pin.ts";
import { advance, envelopeKey, lendingBinding, validKept, type CustodyLock, type Envelope, type Kept, type KeptStore, type LendingIdentity, type Ports, type Settled } from "./custody.ts";
import { lendingView, membershipActions, propose, refusalWords, type LendingAct, type LendingView } from "./model.ts";

/** How long after an intent's deadline a "not found" is taken as final. */
export const SETTLED_AFTER_MS = 120_000;

/** What the member is told about one lending act. `recorded` and `refused` are final; `unknown` keeps the original. */
export type ActOutcome =
  | { status: "recorded" }
  | { status: "refused"; reason: string }
  | { status: "unknown"; reason: string }
  | { status: "nothing-sent"; reason: string };
/** The original request that is kept, as the interface may show it. */
export interface Pending { kind: string; thing: number | null; name: string | null; notAfter: string; unsent: boolean }
export type LendingState =
  | { status: "loading" }
  | { status: "current"; view: LendingView; entries: readonly Entry[]; /** Separately observed membership actions, or unknown after a failed read. */ actions: readonly string[] | null }
  | { status: "behind"; reason: string; view?: LendingView };

export interface LendingGateway {
  /** Follow the scope. Each `current` state is one coherent read: a summary, its head, and the record up to it. */
  observe(emit: (state: LendingState) => void): Observation;
  /** One coherent read, without following the scope: a session, the summary, and the record up to its head. */
  look(): Promise<LendingState>;
  /** Sign one act, keep it, then send it. Refused while another original is kept. */
  act(kind: LendingAct, input?: { thing?: number; name?: string; description?: string; reason?: string }): Promise<ActOutcome>;
  /** The kept original, or null. */
  pending(): Promise<Pending | null>;
  /** Check submits no new act. Its reads may first sign and send
   * read-session authentication. */
  check(): Promise<ActOutcome | null>;
  /** Resume an unsent original. Unknown delivery needs explicit continueOriginal. */
  resume(): Promise<ActOutcome | null>;
  /** Explicit Continue: resend the same kept envelope before its deadline. */
  continueOriginal(): Promise<ActOutcome | null>;
  /** Give up the kept original, only when a read shows it did not take effect and its deadline has passed. */
  abandon(): Promise<boolean>;
  dispose(): void;
}

export function lendingGateway(configured: LendingIdentity, signer: Signer, options: {
  current(): boolean; lock: CustodyLock; store: KeptStore; /** The clock for deadlines. Date.now by default. */ now?: () => number; fetch?: Fetch; headFetch?: HeadStreamFetch; /** The fetch of the one send. It defaults to `fetch`. */ actFetch?: Fetch;
}): LendingGateway {
  const identity = JSON.parse(JSON.stringify(configured)) as LendingIdentity;
  const origin = new URL(identity.origin);
  if (origin.origin !== identity.origin || !["https:", "http:"].includes(origin.protocol)) throw new Error("The configured service must be an exact origin.");
  if (identity.definition !== LENDING_DEFINITION || signer.key !== identity.publicKey) throw new Error("This device does not match the configured lending identity.");

  const now = options.now ?? (() => Date.now()), binding = lendingBinding(identity);
  const lifetime = new AbortController();
  let readVersion = 0;
  let alive = true, session: Session | null = null, observer: Observation | undefined, view: LendingView | undefined, fresh = false, currentEntries: readonly Entry[] = [];
  let currentActions: readonly string[] | null = null;
  const usable = () => alive && options.current();
  const current = () => { if (!usable()) throw new Error("This device context is no longer current."); };
  const transport = httpTransport(identity.origin, { fetch: options.fetch ?? ((url, init) =>
    fetch(url, { ...init, redirect: "error", signal: init?.signal ? AbortSignal.any([init.signal, lifetime.signal]) : lifetime.signal })) });
  const handle = () => new ScopeHandle(transport, identity.scope.scope, session?.reader() ?? null);

  /** A read session from the room's membership, signed by this device. Null with the refusal's reason when there is none. */
  const signIn = async (): Promise<string | null> => {
    const signed = await signerSessionRequest(identity.membership, signer, timeOf(now() + 60_000), b64url(crypto.getRandomValues(new Uint8Array(16)))); current();
    const answer = await requestSession(identity.origin, identity.membership.scope, signed, options.fetch ? { fetch: options.fetch } : {}); current();
    if (!answer.ok) return answer.reason;
    session = answer.session;
    return null;
  };
  /** The reads that settle a kept request need a session; a reloaded page has none yet. */
  const ready = async (): Promise<void> => { if (!session) await signIn(); };

  /** Existing authenticated membership summary route. A failed or incomplete read cannot retain old standing. */
  const readActions = async (): Promise<readonly string[] | null> => {
    try {
      const read = completeSummary(await new ScopeHandle(transport, identity.membership.scope, session?.reader() ?? null).summary()); current();
      return read.ok ? membershipActions(read.value.value, identity.member, signer.key) : null;
    } catch { return null; }
  };

  /** The record up to `seq`, read page by page until the read is complete. */
  const record = async (seq: number): Promise<Entry[]> => {
    const entries: Entry[] = [];
    let cursor: string | undefined;
    for (;;) {
      const page = await handle().history(cursor); current();
      if (!page.ok) throw new Error(`The record could not be read: ${page.reason}.`);
      for (const sealed of page.value) entries.push(sealed.entry);
      if (page.complete || page.next === undefined) break;
      cursor = page.next;
    }
    return entries.slice(0, seq + 1);
  };

  const send = options.actFetch ?? options.fetch ?? ((url: string, init?: Parameters<Fetch>[1]) =>
    fetch(url, { ...init, redirect: "error", signal: init?.signal ? AbortSignal.any([init.signal, lifetime.signal]) : lifetime.signal }));
  const ports: Ports = {
    current: usable,
    post: (envelope) => new ScopeHandle(httpTransport(identity.origin, { fetch: send as Fetch }), identity.scope.scope).submit(envelope.signed, envelope.grants, envelope.beside),
    // An acceptance counts only when the scope's own record holds this exact signed request.
    recorded: async (receipt: Receipt, envelope: Envelope) => {
      if (receipt.definition !== identity.definition || receipt.intent !== intentDigest(envelope.signed.intent) || canonicalize(receipt.fact.at) !== canonicalize(identity.scope)) return false;
      await ready();
      const followed = await handle().followReceipt(receipt);
      return followed.ok && followed.entry.input.type === "act" && canonicalize(followed.entry.input.signed) === canonicalize(envelope.signed);
    },
    settle: async (envelope) => { await ready(); const answer = await handle().settle(envelope.signed); return answer.ok ? answer.value : null; },
  };
  /** Tell the member what a step settled, and release custody only on a final result for this exact request. */
  const conclude = async (held: Kept, settled: Settled): Promise<ActOutcome> => {
    if (settled.status === "unknown") return { status: "unknown", reason: "No answer came back that could be trusted. The original request is kept. Check it before doing anything else." };
    current(); const latest = await options.store.load(); current();
    if (!validKept(latest, binding) || envelopeKey(latest.envelope) !== envelopeKey(held.envelope) || latest.phase !== settled.status)
      return { status: "unknown", reason: "The original request is kept. Check it before doing anything else." };
    await options.store.clear(); current(); observer?.refresh();
    return settled.status === "recorded" ? { status: "recorded" } : { status: "refused", reason: refusalWords(held.kind as LendingAct, settled.reason) };
  };

  return {
    observe(emit) {
      observer = observeScope<Summary>({
        context: { origin: identity.origin, deployment: identity.deployment, scope: identity.scope, definition: identity.definition, membership: identity.membership, member: identity.member.member, key: identity.publicKey },
        current: usable,
        authenticate: async () => options.lock.run(async () => {
          current();
          const signed = await signerSessionRequest(identity.membership, signer, timeOf(now() + 60_000), b64url(crypto.getRandomValues(new Uint8Array(16)))); current();
          const answer = await requestSession(identity.origin, identity.membership.scope, signed, options.fetch ? { fetch: options.fetch } : {}); current();
          if (answer.ok) session = answer.session;
          return answer.ok ? { ok: true, session: answer.session } : answer;
        }),
        snapshot: async (next) => { session = next; return completeSummary(await handle().summary()); },
        open: (next, signal) => openHttpHeadStream(identity.origin, identity.scope, next, signal, options.headFetch ? { fetch: options.headFetch } : {}),
        emit: (state) => {
          if (!usable()) return;
          if (state.status !== "current") { readVersion++; fresh = false; currentActions = null; emit(state.status === "connecting" ? { status: "loading" } : { status: "behind", reason: "reason" in state && typeof state.reason === "string" ? state.reason : state.status, ...(view ? { view } : {}) }); return; }
          const snapshot: CompleteSnapshot<Summary> = state.snapshot;
          // One coherent view: the summary, its head, and the record up to that head.
          const version = ++readVersion;
          currentActions = null;
          emit({ status: "behind", reason: "Reading current membership actions.", ...(view ? { view } : {}) });
          void Promise.all([record(snapshot.at.seq), readActions()]).then(([entries, actions]) => {
            if (!usable() || version !== readVersion) return;
            const next = lendingView(snapshot.value, snapshot.at, entries);
            if (view && next.record.seq < view.record.seq) return;
            view = next; fresh = !view.behind; currentEntries = entries; currentActions = actions;
            emit(view.behind ? { status: "behind", reason: "The record is behind the list.", view } : { status: "current", view, entries, actions });
          }).catch((error: unknown) => { if (usable() && version === readVersion) { fresh = false; emit({ status: "behind", reason: error instanceof Error ? error.message : "The record could not be read.", ...(view ? { view } : {}) }); } });
        },
      });
      return observer;
    },
    async look() {
      const version = ++readVersion;
      currentActions = null;
      const superseded = (): LendingState => view && fresh ? { status: "current", view, entries: currentEntries, actions: currentActions } : { status: "behind", reason: "A newer read replaced this one.", ...(view ? { view } : {}) };
      try {
        current();
        const refusal = await signIn();
        if (version !== readVersion) return superseded();
        if (refusal !== null) { fresh = false; return { status: "behind", reason: `The room refused a read session: ${refusal}.`, ...(view ? { view } : {}) }; }
        const read = completeSummary(await handle().summary()); current();
        if (version !== readVersion) return superseded();
        if (!read.ok) { fresh = false; return { status: "behind", reason: `The library could not be read: ${read.reason}.`, ...(view ? { view } : {}) }; }
        const [entries, actions] = await Promise.all([record(read.value.at.seq), readActions()]);
        if (version !== readVersion) return superseded();
        const next = lendingView(read.value.value, read.value.at, entries);
        if (view && next.record.seq < view.record.seq) return superseded();
        view = next; fresh = !view.behind; currentEntries = entries; currentActions = actions;
        return view.behind ? { status: "behind", reason: "The record is behind the list.", view } : { status: "current", view, entries, actions };
      } catch (error) { if (version !== readVersion) return superseded(); fresh = false; return { status: "behind", reason: error instanceof Error ? error.message : "The library could not be read.", ...(view ? { view } : {}) }; }
    },
    act(kind, input = {}) {
      return options.lock.run(async (): Promise<ActOutcome> => {
        current();
        if ((await options.store.load() ?? null) !== null) return { status: "nothing-sent", reason: "An earlier request is kept. Check it first." };
        current();
        if (!view || !fresh) return { status: "nothing-sent", reason: "The list is not current yet. Nothing was sent." };
        const proposed = propose(view, kind, input, identity.member.member);
        if (!proposed.ok) return { status: "nothing-sent", reason: proposed.reason };
        const { on, expected, fields } = proposed.proposal;
        let held: Kept;
        try {
          const shaped = shapeDeclaredAct(lending, kind, { on, fields } as never);
          const signed = await signedIntent(signer, { to: identity.scope, kind, on: shaped.on, fields: shaped.fields, expected }, { now: now() }); current();
          held = { v: 1, kind, envelope: { signed, grants: [], beside: shaped.beside }, phase: "prepared" };
          if (!validKept(held, binding)) throw new Error("The signed request is not a lending request of this identity.");
          // Kept before anything is sent.
          await options.store.save(held); current();
        } catch { return { status: "nothing-sent", reason: "The request could not be signed and kept. Nothing was sent." }; }
        return conclude(held, await advance(options.store, binding, ports, held.envelope));
      });
    },
    async pending() {
      const held = await options.store.load();
      if (held === null || held === undefined) return null;
      if (!validKept(held, binding)) return { kind: "unknown", thing: null, name: null, notAfter: "", unsent: false };
      const { intent } = held.envelope.signed;
      return { kind: held.kind, thing: held.kind === "publish" && typeof intent.fields["thing"] === "number" ? intent.fields["thing"] : intent.on, name: typeof intent.fields["name"] === "string" ? intent.fields["name"] : null, notAfter: intent.notAfter, unsent: held.phase === "prepared" };
    },
    check() {
      return options.lock.run(async () => {
        current(); const held = await options.store.load(); current();
        if (held === null || held === undefined) return null;
        if (!validKept(held, binding)) return { status: "unknown" as const, reason: "The kept request cannot be read. It stays in this browser." };
        return conclude(held, await advance(options.store, binding, ports, held.envelope, true));
      });
    },
    resume() {
      return options.lock.run(async () => {
        current(); const held = await options.store.load(); current();
        if (held === null || held === undefined) return null;
        if (!validKept(held, binding) || held.phase !== "prepared")
          return { status: "unknown" as const, reason: "This request may already have been sent. Check it; it will not be sent again." };
        return conclude(held, await advance(options.store, binding, ports, held.envelope));
      });
    },
    continueOriginal() {
      return options.lock.run(async () => {
        current(); const held = await options.store.load(); current();
        if (held === null || held === undefined) return null;
        if (!validKept(held, binding)) return { status: "unknown" as const, reason: "The kept request cannot be read. It stays in this browser." };
        const deadline = timeMs(held.envelope.signed.intent.notAfter);
        if (deadline === null || now() > deadline) return { status: "unknown" as const, reason: "The original request's deadline has passed. Check it; nothing was sent." };
        return conclude(held, await advance(options.store, binding, ports, held.envelope, false, true));
      });
    },
    abandon() {
      return options.lock.run(async () => {
        current(); const held = await options.store.load(); current();
        if (held === null || held === undefined) return true;
        if (!validKept(held, binding)) return false;
        const deadline = timeMs(held.envelope.signed.intent.notAfter);
        if (deadline === null || now() < deadline + SETTLED_AFTER_MS) return false;
        await ready();
        const answer = await handle().settle(held.envelope.signed); current();
        if (answer.ok || answer.reason !== "not-found") return false;
        await options.store.clear(); current(); observer?.refresh();
        return true;
      });
    },
    dispose() { alive = false; readVersion++; lifetime.abort(); observer?.cancel(); session = null; view = undefined; fresh = false; currentActions = null; },
  };
}
