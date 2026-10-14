/** Real IndexedDB/Web Locks/WebCrypto witness; transport and recorded answers are STAND-INs.
 * No native membership, deployed room, public pages or audio is proved here. */
import type { Receipt, ScopeRef } from "@generalbusiness/dap-contract";
import { canonicalize, intentDigest, newIncarnation, scopeIdOf, textDigest, verifySignedIntent } from "@generalbusiness/artroom-bytes";
import { signedIntent } from "@generalbusiness/artroom-client";
import { LENDING_DEFINITION } from "../pin.ts";
import { advance, lendingBinding, type Envelope, type Kept, type LendingIdentity, type Ports } from "./custody.ts";
import { deviceSigner, newDeviceKey } from "./join.ts";
import { actStore, browserLock, remembered } from "./storage.ts";

const ref = (kind: ScopeRef["kind"]): ScopeRef => ({ kind, scope: scopeIdOf({ v: 1, kind, definition: LENDING_DEFINITION, creator: null, cause: textDigest("PUBLIC TEST browser storage " + kind), ordinal: 0 }), inc: newIncarnation(new Uint8Array(16).fill(29)) });
let sends = 0;
async function mounted() {
  return browserLock.run(async () => {
    let held = await remembered.load();
    if (!held) { held = { v: 1, device: await newDeviceKey() }; await remembered.save(held); }
    const membership = ref("membership");
    const identity: LendingIdentity = { origin: location.origin, deployment: "PUBLIC TEST storage", scope: ref("lane"), definition: LENDING_DEFINITION, membership, member: { membership, member: "@browser" }, publicKey: held.device.publicKey };
    return { held, identity, store: actStore(identity) };
  });
}
const hash = async (value: unknown) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalize(value))))).map(b => b.toString(16).padStart(2, "0")).join("");
export const storageWitness = {
  async mount() { const { held } = await mounted(); return { publicKey: held.device.publicKey, privateExtractable: held.device.pair.privateKey.extractable }; },
  async loseReply() {
    const { held, identity, store } = await mounted();
    return browserLock.run(async () => {
      if (await store.load()) throw Error("A request is already kept");
      const envelope: Envelope = { signed: await signedIntent(deviceSigner(held.device), { to: identity.scope, kind: "donate", fields: { name: "PUBLIC TEST Sieve", description: "Fine mesh." } }), grants: [], beside: {} };
      await store.save({ v: 1, kind: "donate", envelope, phase: "prepared" });
      const ports: Ports = { current: () => true, post: async () => { sends++; throw Error("STAND-IN lost reply"); }, settle: async () => null, recorded: async () => false };
      const result = await advance(store, lendingBinding(identity), ports, envelope);
      const kept = await store.load() as Kept;
      return { status: result.status, phase: kept.phase, envelopeHash: await hash(kept.envelope), sends };
    });
  },
  async kept() { const { store } = await mounted(); const kept = await store.load() as Kept | null; return kept ? { phase: kept.phase, envelopeHash: await hash(kept.envelope), validSignature: verifySignedIntent(kept.envelope.signed) } : null; },
  async check() {
    const { identity, store } = await mounted();
    return browserLock.run(async () => {
      const kept = await store.load() as Kept;
      const ports: Ports = { current: () => true, post: async () => { sends++; throw Error("Check must not send"); }, settle: async () => null, recorded: async () => false };
      const result = await advance(store, lendingBinding(identity), ports, kept.envelope, true);
      return { status: result.status, sends, envelopeHash: await hash((await store.load() as Kept).envelope) };
    });
  },
  async continueOriginal(failStorage = false, current = true) {
    const { identity, store } = await mounted();
    return browserLock.run(async () => {
      const kept = await store.load() as Kept;
      const before = await hash(kept.envelope);
      const ports: Ports = { current: () => current, post: async envelope => { if (await hash(envelope) !== before) throw Error("Replacement envelope"); sends++; return { answer: "accepted", receipt: { intent: intentDigest(envelope.signed.intent) } as Receipt }; }, settle: async () => null, recorded: async (_receipt, envelope) => verifySignedIntent(envelope.signed) && await hash(envelope) === before };
      const writing = failStorage ? { ...store, save: async () => { throw Error("STAND-IN storage commit failure"); } } : store;
      const result = await advance(writing, lendingBinding(identity), ports, kept.envelope, false, true);
      return { status: result.status, sends, envelopeHash: await hash((await store.load() as Kept).envelope) };
    });
  },
};
