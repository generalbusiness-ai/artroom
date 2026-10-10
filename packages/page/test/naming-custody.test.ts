import { expect, test } from "vitest";
import type { Answer, Entry, Receipt, Sealed, Settlement } from "@generalbusiness/artroom-contract";
import { canonicalize, digestBytes, entryHash, intentDigest, newIncarnation, scopeIdOf, utf8 } from "@generalbusiness/artroom-bytes";
import { secretSigner, type Signer } from "@generalbusiness/artroom-client";
import { NamingBlocked, NamingCustody, confirmNaming, namingContextKey, namingCopy, namingTransition, type NamingContext, type NamingEnvelope, type NamingJournal, type NamingLocks, type NamingNative, type NamingSample, type NamingStore } from "../src/naming-custody.ts";

const TITLE = "naming preserves the frozen original and whole known reply across unavailable settlement, failed persistence and credential drift";
function deferred() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

// Workflow PORT STAND-INS only. The signature is real; the entry/receipt below
// are structural matching fixtures, NOT native admission or replay evidence.
// This memory store and lock recorder prove neither IndexedDB nor Web Locks.
function fixture() {
  const signer = secretSigner(new Uint8Array(32).fill(17));
  const cause = digestBytes(utf8("C4 structural naming fixture"));
  const directory = { scope: scopeIdOf({ v: 1, kind: "directory", definition: "platform:directory@1", creator: null, cause, ordinal: 0 }), inc: newIncarnation(new Uint8Array(16).fill(11)), kind: "directory" } as const;
  const membership = { scope: scopeIdOf({ v: 1, kind: "membership", definition: "platform:membership@1", creator: directory, cause, ordinal: 1 }), inc: newIncarnation(new Uint8Array(16).fill(12)), kind: "membership" } as const;
  const context: NamingContext = { origin: "https://naming.test", directory, membership, member: { membership, member: "@owner" }, key: signer.key, credential: "credential-1", generation: 0, epoch: "domain-1" };
  const sample: NamingSample = { context: namingCopy(context), definition: "platform:directory@1", head: { seq: 1, hash: cause }, time: "2026-10-10T12:00:00Z", state: "profile", profile: { id: 1, revision: 0, opening: { at: directory, seq: 1, hash: cause }, name: "Earlier name" } };
  let journal: NamingJournal = { v: 1, epoch: context.epoch, revision: 0, context: namingContextKey(context), records: [] };
  let active = true, failKnown = false, signatures = 0;
  const store: NamingStore = {
    async read() { return namingCopy(journal); },
    async current() { if (!active) throw new NamingBlocked("Credential generation changed."); },
    async credential(): Promise<Signer> { return { key: signer.key, sign(bytes) { signatures++; return signer.sign(bytes); } }; },
    async commit(_context, before, next) {
      if (canonicalize(before) !== canonicalize(journal)) throw new NamingBlocked("CAS conflict.");
      if (failKnown && next.records.at(-1)?.answer !== undefined) throw new NamingBlocked("Injected persistence failure.");
      if (!namingTransition(before, next)) throw new NamingBlocked("Illegal custody transition.");
      journal = namingCopy(next);
    },
  };
  const lockNames: string[] = [], posts: NamingEnvelope[] = [], settlements: string[] = [];
  const locks: NamingLocks = { async request(name, work) { lockNames.push(name); return work(); } };
  const entered = deferred(), captureRelease = deferred();
  let holdCapture = false, respondAccepted = false, found = false;
  let proof: { sealed: Sealed; receipt: Receipt } | null = null;
  function written(envelope: NamingEnvelope): { sealed: Sealed; receipt: Receipt } {
    const entry: Entry = { v: 1, at: directory, seq: 2, prev: cause, time: sample.time, clamped: false, epoch: 0, input: { type: "act", signed: envelope.signed, authority: [], presented: {} }, uses: [], prepared: [], effects: [], sends: [] };
    const hash = entryHash(entry);
    return { sealed: { entry, hash }, receipt: { fact: { at: directory, seq: entry.seq, hash }, definition: sample.definition, intent: intentDigest(envelope.signed.intent), effects: entry.effects, sends: [], epoch: 0 } };
  }
  const native: NamingNative = {
    async capture() { entered.release(); if (holdCapture) await captureRelease.promise; return { sample: namingCopy(sample), grants: [], beside: {} }; },
    async submit(_context, envelope): Promise<Answer> { posts.push(namingCopy(envelope)); proof = written(envelope); return respondAccepted ? { answer: "accepted", receipt: proof.receipt } : { answer: "unavailable", reason: "unavailable" }; },
    async settle(_context, signed): Promise<Settlement> { settlements.push(canonicalize(signed)); if (!found || !proof) return { ok: false, reason: "not-found" }; return { ok: true, at: { seq: proof.sealed.entry.seq, hash: proof.sealed.hash }, value: proof.receipt, complete: true }; },
    async entry() { if (!proof) return { ok: false, reason: "not-found" }; return { ok: true, at: { seq: proof.sealed.entry.seq, hash: proof.sealed.hash }, value: proof.sealed, complete: true }; },
    async latest() { return null; },
  };
  const create = (callerContext = context) => new NamingCustody(callerContext, store, locks, native, () => undefined);
  return { context, sample, store, create, posts, settlements, lockNames, entered, captureRelease,
    journal: () => namingCopy(journal), signatures: () => signatures,
    holdCapture: () => { holdCapture = true; }, accept: () => { respondAccepted = true; },
    found: () => { found = true; }, failKnown: () => { failKnown = true; }, invalidate: () => { active = false; } };
}

test(TITLE, async () => {
  const first = fixture(), callerContext = namingCopy(first.context);
  const custody = first.create(callerContext), confirmation = confirmNaming(first.sample, "  Confirmed name  ");
  const frozen = namingCopy(confirmation), originalContext = namingCopy(callerContext);
  first.holdCapture();
  const starting = custody.start(confirmation, { now: Date.parse(first.sample.time) });
  await first.entered.promise;
  // Caller mutation during the await cannot change the owned context, frozen
  // confirmation or lock identity. Fresh native capture still runs under locks.
  callerContext.credential = "another-credential"; callerContext.generation++;
  confirmation.name = "Silently changed";
  if (confirmation.sample.state === "profile") confirmation.sample.profile.revision++;
  first.captureRelease.release();
  const unavailable = await starting;
  expect(custody.context).toEqual(originalContext);
  expect(unavailable?.confirmation).toEqual(frozen);
  expect(first.lockNames).toEqual([`artroom:c4:credential:${originalContext.credential}`, `artroom:c4:naming-context:${namingContextKey(originalContext)}`, `artroom:c4:naming-operation:${namingContextKey(originalContext)}`]);
  expect(first.posts).toHaveLength(1); expect(first.signatures()).toBe(1);
  expect(first.posts[0]?.signed.intent.fields).toEqual({ name: frozen.name });
  expect(first.posts[0]?.signed.intent.expected).toEqual({ on: 0 });
  const retainedOriginal = canonicalize(first.journal().records[0]?.envelope);
  await expect(custody.start(confirmNaming(first.sample, "Replacement"))).rejects.toThrow("unresolved original");
  await custody.reconcile(); // Genuine not-found is still an unresolved original.
  expect(custody.publicStatus().phase).toBe("unknown");
  first.found(); await custody.reconcile();
  expect(custody.loaded?.answer).toEqual({ answer: "unavailable", reason: "unavailable" });
  expect(custody.loaded?.settlement?.ok).toBe(true);
  expect(custody.publicStatus()).toMatchObject({ phase: "recorded-verified", latest: "unavailable" });
  expect(canonicalize(first.journal().records[0]?.envelope)).toBe(retainedOriginal);
  expect(first.settlements.every(signed => signed === canonicalize(first.posts[0]?.signed))).toBe(true);
  expect(first.posts).toHaveLength(1); expect(first.signatures()).toBe(1);

  const failure = fixture(); failure.accept(); failure.failKnown();
  const loaded = failure.create();
  await expect(loaded.start(confirmNaming(failure.sample, "Accepted name"), { now: Date.parse(failure.sample.time) })).rejects.toThrow("persistence unavailable");
  const fullAnswer = loaded.loaded?.answer;
  expect(fullAnswer?.answer).toBe("accepted");
  expect(loaded.publicStatus()).toMatchObject({ phase: "accepted-unverified", persistence: "unavailable" });
  const durable = failure.journal();
  expect(durable.records[0]?.phase).toBe("attempted");
  expect(durable.records[0]?.answer).toBeUndefined();
  await expect(loaded.resumePrepared()).rejects.toThrow("not permission to resend");
  await expect(loaded.start(confirmNaming(failure.sample, "Another name"))).rejects.toThrow("persistence remains unavailable");
  expect(loaded.loaded?.answer).toEqual(fullAnswer); expect(failure.journal()).toEqual(durable);
  const reloaded = failure.create();
  await reloaded.reconcile();
  expect(reloaded.publicStatus().phase).toBe("unknown");
  await expect(reloaded.start(confirmNaming(failure.sample, "Another name"))).rejects.toThrow("unresolved original");
  failure.found(); await reloaded.reconcile();
  expect(reloaded.publicStatus()).toMatchObject({ phase: "recorded-verified", latest: "unavailable" });
  expect(reloaded.loaded?.answer).toBeUndefined(); // Reload does not invent the lost first reply.
  expect(loaded.loaded?.answer).toEqual(fullAnswer); // The original loaded owner retains it.
  expect(reloaded.loaded?.envelope).toEqual(durable.records[0]?.envelope);
  expect(failure.posts).toHaveLength(1); expect(failure.signatures()).toBe(1);
  expect(failure.settlements.every(signed => signed === canonicalize(failure.posts[0]?.signed))).toBe(true);

  const drift = fixture(); drift.holdCapture();
  const stopped = drift.create(), pending = stopped.start(confirmNaming(drift.sample, "Never signed"));
  await drift.entered.promise; drift.invalidate(); drift.captureRelease.release();
  await expect(pending).rejects.toThrow("generation changed");
  expect(drift.posts).toHaveLength(0); expect(drift.signatures()).toBe(0);
  expect(drift.journal().records).toEqual([]);
  const publicEvidence = canonicalize(custody.publicStatus());
  expect(publicEvidence).not.toContain(frozen.name); expect(publicEvidence).not.toContain(originalContext.credential);
  expect(publicEvidence).not.toContain(first.posts[0]?.signed.sig);
});
