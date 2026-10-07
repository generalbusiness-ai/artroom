import { describe, expect, test } from "vitest";
import type { Digest, OperationId, RetainedInput } from "@generalbusiness/artroom-contract";
import { canonicalize, entryHash, factRefOf, newIncarnation } from "@generalbusiness/artroom-bytes";
import { t } from "@generalbusiness/artroom-derive/testing";
import { destinationReceipt, foundingObjects, type DestinationObject, type RecordedJudgeEvidence } from "@generalbusiness/artroom-platform";
import { Branch, HEAD, NEXT, OTHER, TREE, handMade, rita } from "../../platform/test/support-destination.ts";
import { CredentialStore } from "../src/credential-store.ts";
import { DestinationHost, type DestinationBinding, type DestinationHostOptions, type DestinationInspection, type DestinationProvider, type DestinationRepository } from "../src/destination-host.ts";
import type { OutsideGiven } from "../src/object.ts";
import type { EffectAnswer, EffectRequest } from "../src/operations.ts";
import { found } from "./support.ts";

/** STAND-IN: provider replies and object reads are scripts. No host or transport runs. */
class Provider implements DestinationProvider {
  readonly calls: { kind: string; body: unknown }[] = [];
  seen: string | null = null;
  mintReply: unknown = { id: "provider-token-1", ends: t(60), plaintext: "private-token-1" };
  sendReply: unknown = { send: "accepted" };
  revokeReply: unknown = { revoked: true, id: "provider-token-1" };
  evidence: RecordedJudgeEvidence = { head: OTHER, present: false, tree: null, firstParent: null, ancestors: [], changes: null };
  objectsReply: readonly DestinationObject[] = [];
  preparing: (() => void) | undefined;
  forwarding: (() => void) | undefined;
  format(): Promise<"sha1"> { return Promise.resolve("sha1"); }
  mint(repository: DestinationRepository, binding: DestinationBinding): Promise<unknown> { this.calls.push({ kind: "mint", body: { repository, binding } }); return Promise.resolve(this.mintReply); }
  revoke(id: string, plaintext: string): Promise<unknown> { this.calls.push({ kind: "revoke", body: { id, plaintext } }); return Promise.resolve(this.revokeReply); }
  ref(_repository: DestinationRepository, ref: string): Promise<string | null> { this.calls.push({ kind: "ref", body: ref }); return Promise.resolve(this.seen); }
  objects(_repository: DestinationRepository, commit: string): Promise<readonly DestinationObject[]> { this.calls.push({ kind: "objects", body: commit }); this.preparing?.(); return Promise.resolve(this.objectsReply); }
  send(request: Parameters<DestinationProvider["send"]>[0]): Promise<unknown> {
    this.forwarding?.();
    if (!request.allowed()) return Promise.resolve({ send: "not-sent" });
    this.calls.push({ kind: "send", body: request });
    if ((this.sendReply as { send?: string } | null)?.send === "accepted") this.seen = request.commit;
    return Promise.resolve(this.sendReply);
  }
  inspect(context: DestinationInspection) { this.calls.push({ kind: "inspect", body: context }); return Promise.resolve({ evidence: this.evidence }); }
}

/** Branch's rules judge real entries in memory. Its creator and lane reader are labelled stand-ins.
 * Custody is real SQLite, supplied by a test Durable Object; the outside driver is called directly. */
function fixture(sql: SqlStorage, importing = false) {
  const branch = new Branch(importing);
  const provider = new Provider();
  const retained = new Map<Digest, RetainedInput>();
  const given: OutsideGiven = {
    state: branch.state, own: branch.own, retained: (_kind, digest) => retained.get(digest) ?? null,
    scope: () => branch.state.scope(),
    genesis: () => { const input = branch.own(0)?.entry.input; return input?.type === "genesis" ? input : null; },
    clock: { read: () => branch.now }, random: { bytes: (length) => new Uint8Array(length) },
  };
  const custody = new CredentialStore(sql, () => branch.at);
  const options: DestinationHostOptions = { host: "git.example", namespace: "artroom", provider, custody };
  const host = new DestinationHost(given, options);
  const request = (operation: OperationId, attempt = 1): EffectRequest => {
    const recorded = branch.state.operation(operation)!;
    return { scope: branch.at, operation, attempt, owner: recorded.owner, kind: recorded.kind, origin: branch.own(Number(operation.split(":")[0]))! };
  };
  const record = (operation: OperationId, reply: EffectAnswer, attempt = 1) => {
    expect(branch.outcome(operation, attempt, reply.result, reply.evidence).result).toBe("write");
    host.judged({ scope: branch.at, operation, attempt }, branch.own(branch.last.seq));
  };
  return { branch, provider, retained, given, custody, options, host, request, record };
}
const operation = (branch: Branch, kind: string) => {
  const entry = [...branch.entries].reverse().find(({ entry }) => entry.effects.some((effect) => effect.effect === "operation" && effect.kind === kind))!.entry;
  const opening = entry?.effects.find((effect) => effect.effect === "operation" && effect.kind === kind);
  expect(opening?.effect).toBe("operation");
  return `${entry.seq}:${opening!.effect === "operation" ? opening!.k : -1}` as OperationId;
};

describe("destination outside adapter; scripted host, platform judgments in memory and private SQLite custody", () => {
  // Invariant: each write uses only its own durably held and judged mint, and writes exact founding/receipt objects without recording secrets.
  test("founding and receipt sends use each exact mint and the platform's computed objects", async () => {
    const storage = await found();
    await storage.inside(async (state) => {
      const f = fixture(state.storage.sql);
      f.branch.confirmed();
      const write = operation(f.branch, "first-head");
      const mint = operation(f.branch, "mint");
      const minted = await f.host.send(f.request(mint));
      expect(minted).toEqual({ result: "confirmed", evidence: { basis: "own-answer", body: { token: "provider-token-1", ends: t(60) } } });
      expect(f.custody.read(mint, 1)).toMatchObject({ state: "held", plaintext: "private-token-1" });
      expect(await f.host.send(f.request(write))).toMatchObject({ result: "refused", evidence: { body: { send: "not-sent" } } });
      // Simulate loss after the provider reply was kept, before its outcome.
      expect(f.branch.lost(mint, 1).result).toBe("write");
      const resumed = new DestinationHost(f.given, { ...f.options, custody: new CredentialStore(state.storage.sql, () => f.branch.at) });
      const beforeRecovery = f.provider.calls.length;
      const retainedMint = resumed.replies(1);
      expect(retainedMint).toEqual({ answers: [{ operation: mint, attempt: 1, answer: minted }], more: false });
      expect(f.provider.calls).toHaveLength(beforeRecovery);
      expect(canonicalize(retainedMint)).not.toContain("private-token-1");
      f.record(mint, retainedMint.answers[0]!.answer);
      f.host.judged({ scope: f.branch.at, operation: mint, attempt: 1 }, null);
      expect(f.custody.live(mint, 1, f.branch.now)).toMatchObject({ state: "live", plaintext: "private-token-1" });
      const written = await f.host.send(f.request(write));
      expect(written).toMatchObject({ result: "confirmed", evidence: { body: { send: "accepted" } } });
      const sent = f.provider.calls.find((call) => call.kind === "send")!.body as Parameters<DestinationProvider["send"]>[0];
      const genesis = f.branch.own(0)!.entry;
      const expected = foundingObjects("sha1", genesis.at.scope, genesis.time, f.branch.branch.refs["claim"] as never);
      expect({ commit: sent.commit, objects: sent.objects }).toEqual(expected);
      expect(sent).toMatchObject({ old: null, ref: "refs/heads/main", token: "private-token-1", binding: { mint, write, writeAttempt: 1 } });
      f.record(write, written!);
      const receiptWrite = operation(f.branch, "receipt");
      const receiptMint = operation(f.branch, "mint");
      const receiptItem = f.branch.item(f.branch.last.seq);
      const receipt = destinationReceipt(f.branch.state, f.branch.own, receiptItem, "sha1");
      f.provider.mintReply = { id: "provider-token-2", ends: t(60), plaintext: "private-token-2" };
      const receiptMinted = await f.host.send(f.request(receiptMint));
      // Simulate a committed confirmation whose private judged callback was lost.
      expect(f.branch.outcome(receiptMint, 1, receiptMinted!.result, receiptMinted!.evidence).result).toBe("write");
      expect(f.custody.live(receiptMint, 1, f.branch.now)).toBeNull();
      const repeatedMint = resumed.replies(1);
      expect(repeatedMint).toEqual({ answers: [{ operation: receiptMint, attempt: 1, answer: receiptMinted }], more: false });
      const previousHead = f.branch.head;
      expect(f.branch.outcome(receiptMint, 1, repeatedMint.answers[0]!.answer.result, repeatedMint.answers[0]!.answer.evidence).result).toBe("repeat");
      expect(f.branch.head).toEqual(previousHead);
      resumed.judged({ scope: f.branch.at, operation: receiptMint, attempt: 1 }, null);
      expect(resumed.replies(1)).toEqual({ answers: [], more: false });
      const receiptWritten = await f.host.send(f.request(receiptWrite));
      const receiptSent = f.provider.calls.filter((call) => call.kind === "send").at(-1)!.body as Parameters<DestinationProvider["send"]>[0];
      expect({ commit: receiptSent.commit, objects: receiptSent.objects, ref: receiptSent.ref }).toEqual({ commit: receipt.commit, objects: receipt.objects, ref: receipt.ref });
      expect(receiptSent.token).toBe("private-token-2");
      f.record(receiptWrite, receiptWritten!);
      expect(f.branch.item(receiptItem.id).state).toBe("written");
      expect(canonicalize(f.branch.entries)).not.toContain("private-token");
      // A restarted adapter's cleanup reads only the exact recorded mint, using retained custody.
      const revoke = f.branch.entries.flatMap(({ entry }) => entry.effects.flatMap((effect) => effect.effect === "operation" && effect.kind === "revoke" ? [`${entry.seq}:${effect.k}` as OperationId] : []))[0]!;
      const restarted = new DestinationHost(f.given, { ...f.options, custody: new CredentialStore(state.storage.sql, () => f.branch.at) });
      const revoked = await restarted.send(f.request(revoke));
      expect(revoked).toMatchObject({ result: "confirmed", evidence: { body: { token: "provider-token-1" } } });
      expect(f.custody.read(mint, 1)).toMatchObject({ state: "live", plaintext: "private-token-1" });
      f.record(revoke, revoked!);
      expect(f.custody.read(mint, 1)).toMatchObject({ state: "revoked", plaintext: null });
    });
  });

  // Invariant: async preparation and the actual forwarding boundary both recheck T7 against live state and exact custody.
  test("compromise during object preparation or immediately before forwarding prevents the write", async () => {
    const storage = await found();
    await storage.inside(async (state) => {
      for (const where of ["preparing", "forwarding", "expiry"] as const) {
        const f = fixture(state.storage.sql);
        f.branch.ready();
        const { push, mint } = f.branch.reserved();
        f.provider.seen = HEAD;
        f.record(mint, (await f.host.send(f.request(mint)))!);
        if (where === "expiry") f.provider.forwarding = () => { f.branch.now = t(60); };
        else f.provider[where] = () => { expect(f.branch.compromised(rita).result).toBe("write"); };
        const reply = await f.host.send(f.request(push));
        expect(reply).toMatchObject({ result: "refused", evidence: { body: { send: "not-sent", seen: HEAD } } });
        expect(f.provider.calls.filter((call) => call.kind === "send")).toEqual([]);
        if (where !== "expiry") expect(f.branch.item(f.branch.branch.refs["slot"] as number).values["aborting"]).toBe(true);
      }
    });
  });

  // Invariant: a deciding host read may publish a change, but cannot replace a lost write's own outcome or clean its token.
  test("lost push response stays unknown when its separate deciding read observes publication", async () => {
    const storage = await found();
    await storage.inside(async (state) => {
      const f = fixture(state.storage.sql);
      f.branch.ready();
      const { push, mint, publication } = f.branch.reserved();
      f.record(mint, (await f.host.send(f.request(mint)))!);
      f.provider.sendReply = { send: "unknown" };
      expect(await f.host.send(f.request(push))).toBeNull();
      expect(f.branch.lost(push, 1).result).toBe("write");
      const read = operation(f.branch, "read");
      f.provider.seen = NEXT;
      const before = f.provider.calls.length;
      expect(f.host.recovery.accepts(f.request(push).owner, "push")).toBe(false);
      expect(await f.host.recovery.read(f.request(push))).toBeNull();
      expect(f.provider.calls).toHaveLength(before);
      const readReply = await f.host.recovery.read(f.request(read));
      expect(readReply).toEqual({ result: "confirmed", evidence: { basis: "own-answer", body: { seen: NEXT } } });
      f.record(read, readReply!);
      expect(f.branch.item(publication).state).toBe("published");
      expect(f.branch.state.operation(push)!.attempts[0]!.outcomes.map((outcome) => outcome.result)).toEqual(["unknown"]);
      expect(f.custody.read(mint, 1)).toMatchObject({ state: "live", plaintext: "private-token-1" });
      const lateMint = operation(f.branch, "mint");
      // Mint of the receipt is independent, and an old first write cannot take it.
      expect(lateMint).not.toBe(mint);
      expect(await f.host.send(f.request(push))).toMatchObject({ result: "refused", evidence: { body: { send: "not-sent" } } });
      expect(f.provider.calls.filter((call) => call.kind === "send")).toHaveLength(1);
    });
  });

  // Invariant: scope/operation/origin and host namespace must bind before a provider effect, and malformed replies cannot release a secret.
  test("forged requests and mismatched configured repositories never reach the provider", async () => {
    const storage = await found();
    await storage.inside(async (state) => {
      const f = fixture(state.storage.sql);
      f.branch.confirmed();
      const mint = operation(f.branch, "mint");
      const request = f.request(mint);
      const changed = structuredClone(request.origin.entry);
      changed.time = t(4);
      const forged: EffectRequest[] = [
        { ...request, scope: { ...request.scope, inc: newIncarnation(new Uint8Array(16).fill(9)) } },
        { ...request, owner: "hold@1" }, { ...request, kind: "push" }, { ...request, attempt: 2 },
        { ...request, origin: { entry: changed, hash: entryHash(changed) } },
        { ...request, origin: { entry: changed, hash: request.origin.hash } },
      ];
      for (const request of forged) expect(await f.host.send(request)).toBeNull();
      const elsewhere = new DestinationHost(f.given, { ...f.options, namespace: "another" });
      expect(await elsewhere.send(request)).toBeNull();
      expect(f.provider.calls).toEqual([]);
      f.custody.put({ id: "wrong-operation", mint: operation(f.branch, "first-head"), attempt: 1, ends: t(60), plaintext: "private-invalid" });
      expect(f.host.replies(1)).toEqual({ answers: [], more: false });
      expect(f.provider.calls).toEqual([]);
      for (const reply of [{ id: "provider-token-1", ends: t(60), plaintext: "secret", extra: true }, { id: "provider-token-1", ends: "bad", plaintext: "secret" }, null]) {
        f.provider.mintReply = reply;
        expect(await f.host.send(request)).toBeNull();
        expect(f.custody.read(mint, 1)).toBeNull();
      }
      f.provider.mintReply = { minted: false };
      expect(await f.host.send(request)).toEqual({ result: "refused", evidence: { basis: "own-answer", body: {} } });
    });
  });

  // Invariant: imported first heads read the imported object closure, and judge inspection names only retained manifest/report facts.
  test("imported head and judge inspection derive their context from recorded facts", async () => {
    const storage = await found();
    await storage.inside(async (state) => {
      const f = fixture(state.storage.sql, true);
      f.branch.confirmed();
      expect(f.branch.imported("done", HEAD).result).toBe("write");
      const write = operation(f.branch, "first-head");
      const mint = operation(f.branch, "mint");
      f.record(mint, (await f.host.send(f.request(mint)))!);
      const sent = await f.host.send(f.request(write));
      expect(f.provider.calls.find((call) => call.kind === "objects")?.body).toBe(HEAD);
      expect((f.provider.calls.find((call) => call.kind === "send")?.body as { commit: string }).commit).toBe(HEAD);
      f.record(write, sent!);
      const manifest = handMade(f.branch.lane.at, "propose-manifest", [], rita, { base: HEAD, integration: NEXT, tree: TREE, complete: true, selected: [] });
      const message = { class: "request", type: "tell", body: { message: "reserve", fields: { operation: { self: true }, manifest: factRefOf(manifest), verdicts: [], jobs: [], links: [], reports: [] } } } as const;
      expect(f.branch.from(f.branch.lane.at, "change", "merge", message as never, [{ fact: factRefOf(manifest), entry: manifest, under: "change" }]).judgment.result).toBe("write");
      const judge = operation(f.branch, "judge");
      const publication = f.branch.last;
      const use = publication.uses.find((use) => use.fact.hash === entryHash(manifest))!;
      f.retained.set(use.content, { kind: "entry", digest: use.content, bytes: canonicalize(manifest), under: "change" });
      const judged = await f.host.send(f.request(judge));
      expect(f.provider.calls.find((call) => call.kind === "inspect")?.body).toEqual({ repository: { host: "git.example", namespace: "artroom", name: "demo", id: "r1" }, ref: "refs/heads/main", recorded: HEAD, base: HEAD, integration: NEXT, tree: TREE, reports: [] });
      expect(judged?.evidence.body).toEqual(f.provider.evidence);
      // The port forwards host evidence, without making a second reservation judgment.
      expect(f.branch.item(publication.seq).state).toBe("queued");
    });
  });
});
