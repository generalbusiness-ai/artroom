import { expect, test } from "vitest";
import type { ScopeId, SignedIntent } from "@generalbusiness/artroom-contract";
import { b64url, scopeIdOf, timeMs, timeOf } from "@generalbusiness/artroom-bytes";
import type { Fetch } from "@generalbusiness/artroom-client";
import { net } from "@generalbusiness/artroom-scope/testing";
import { Platform, routed, settle } from "../../scope/test/repository.ts";
import { claimRoom, type ClaimStorage } from "../src/claim.ts";
import { platformNet, platformOutside } from "@generalbusiness/artroom-scope/testing/worker";
import { command, memoryStore, type Context } from "@generalbusiness/artroom-cli";
import { reader } from "../../scope/test/support.ts";
import { ownHost } from "../../scope/test/hosts.ts";
import type { ClaimLocks } from "../src/claim.ts";

async function registerFixture() {
  net.hold = net.deaf = null;
  platformNet.secret = b64url(crypto.getRandomValues(new Uint8Array(32)));
  platformNet.sessions = true;
  platformNet.inspector = reader;
  const host = ownHost();
  const wired = new Set<ScopeId>();
  let R: Platform;
  const wire = (name: ScopeId) => { wired.add(name); platformOutside.set(name, (given, sql) => host.outside(given, sql, host.bindings(R.name))); };
  const pause = async (waiting: readonly ScopeId[] = []) => {
    const nodes = [R, ...waiting.filter((name) => name !== R.name).map((name) => new Platform(name))];
    for (let pass = 0; pass < 64; pass++) {
      let made = 0;
      for (const node of nodes) { while (await (node.stub as unknown as { effect(): Promise<number> }).effect() > 0) made++; made += await node.stub.dispatch(); }
      if (!made) break;
    }
    await settle(...nodes);
  };
  const ctx: Context = { store: memoryStore(), fetch: routed as unknown as Fetch, now: () => timeMs(net.clock.now)!, pause };
  expect((await command(ctx, ["install", "https://scopes.test", "--host", host.host, "--namespace", host.namespace])).code).toBe(0);
  const config = (await ctx.store.config())!;
  R = new Platform(config.register!.scope); wire(R.name); await R.restart();
  net.hold = (envelope) => { if ("definition" in envelope.to) wire(scopeIdOf(envelope.to)); return false; };
  const secret = (await ctx.store.secret(config.key))!;
  return { config, pause, fetch: routed as unknown as Fetch, secret, session: { service: "https://scopes.test", secret, now: ctx.now! }, done: () => { for (const name of wired) platformOutside.delete(name); platformNet.secret = null; platformNet.sessions = false; platformNet.inspector = null; net.hold = null; } };
}
// Test stand-in for Web Locks: queues every caller sharing the same lock name.
function testLocks(): ClaimLocks {
  const queues = new Map<string, Promise<unknown>>();
  return { request: async (name, run) => {
    const prior = queues.get(name) ?? Promise.resolve();
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    queues.set(name, prior.then(() => held));
    await prior;
    try { return await run(); } finally { release(); }
  } };
}

// Invariant: the browser founds through native configured-register policy and
// enrollment, retaining exact signed requests before delivery and across loss;
// wrong pins, ineligible keys and failed private storage cannot submit a found.
// Real Worker routes, register/directory/membership/rules/destination and signed
// reads. STAND-INs: demo's Git host and scheduler, local storage and HTTP loss.
test("the browser's native claim survives lost founding and enrollment replies without replacement requests; unsafe configuration or failed storage submits nothing (Git host, scheduler, storage and loss STAND-INs)", async () => {
  const clock = net.clock.now;
  const d = await registerFixture();
  try {
    const secret = d.secret;
    const configured = { register: d.config.register!, definition: "platform:register@2" as const };
    const values = new Map<string, string>();
    let failWrites = false;
    let dropWrites = false;
    const storage: ClaimStorage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { if (failWrites) throw new Error("private storage full"); if (!dropWrites) values.set(key, value); } };
    const sent: SignedIntent[] = [];
    let entered!: () => void;
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { entered = resolve; });
    const released = new Promise<void>((resolve) => { release = resolve; });
    let unavailableSettlement = false;
    let lose: "before-found" | "after-seat" | null = null;
    const fetch = (async (url: string, init?: RequestInit) => {
      const signed = new URL(url).pathname.endsWith("/acts") && typeof init?.body === "string" ? (JSON.parse(init.body) as { signed?: SignedIntent }).signed : undefined;
      if (signed) sent.push(structuredClone(signed));
      if (new URL(url).pathname.endsWith("/settle") && unavailableSettlement) return Response.json({ ok: false, reason: "unavailable" });
      if (signed?.intent.kind === "found" && lose === "before-found") { lose = null; entered(); await released; throw new Error("loss before delivery"); }
      const response = await (d.fetch as unknown as typeof globalThis.fetch)(url, init);
      if (signed?.intent.kind === "seat" && lose === "after-seat") { lose = null; await response.body?.cancel(); throw new Error("loss after accepted seat"); }
      return response;
    }) as unknown as Fetch;
    const session = { ...d.session, fetch };
    const options = { pause: d.pause, tries: 16, locks: testLocks() };
    const kinds = () => sent.map((signed) => signed.intent.kind);
    await expect(claimRoom(session, { ...configured, definition: "platform:register@1" }, storage, "My local label", options)).rejects.toThrow("pinned version");
    await expect(claimRoom({ ...session, secret: crypto.getRandomValues(new Uint8Array(32)) }, configured, storage, "My local label", options)).rejects.toThrow("cannot be read");
    expect(sent).toEqual([]);
    failWrites = true;
    await expect(claimRoom(session, configured, storage, "My local label", options)).rejects.toThrow("private storage full");
    expect([sent.length, values.size]).toEqual([0, 0]);
    failWrites = false;
    dropWrites = true;
    await expect(claimRoom(session, configured, storage, "My local label", options)).rejects.toThrow("could not retain the exact claim");
    expect([sent.length, values.size]).toEqual([0, 0]);
    dropWrites = false;
    lose = "before-found";
    const first = claimRoom(session, configured, storage, "My local label", options);
    await blocked;
    const second = claimRoom(session, configured, storage, "An edited label must not replace the request", options);
    // A second caller waits outside the durable record while the first found
    // is in flight; it cannot replace the recovery key or envelope.
    await Promise.resolve();
    const inFlight = [...values.values()][0]!;
    expect(sent).toHaveLength(1);
    net.clock.now = timeOf(timeMs(net.clock.now)! + 30_000);
    await new Platform(configured.register.scope).restart();
    lose = "after-seat";
    release();
    const unknown = await first;
    expect([unknown.outcome.code, unknown.pending, unknown.repository, unknown.label]).toEqual([1, true, null, "My local label"]);
    const original = sent[0]!;
    const savedBefore = inFlight;
    expect(JSON.parse(savedBefore).config.claim.found.signed).toEqual(original);
    expect(savedBefore).not.toContain(b64url(secret));
    expect(JSON.stringify(unknown)).not.toContain(JSON.parse(savedBefore).recovery);
    const uncertainSeat = await second;
    expect(uncertainSeat.outcome.lines.join("\n")).toMatch(/^No answer:/);
    expect([uncertainSeat.outcome.code, uncertainSeat.pending, uncertainSeat.repository]).toEqual([1, true, null]);
    const seatRecord = JSON.parse([...values.values()][0]!);
    expect(seatRecord.label).toBe("My local label");
    expect(sent.filter((signed) => signed.intent.kind === "found")).toEqual([original, original]);
    const M = new Platform(seatRecord.config.claim.repository.membership.scope);
    await M.restart();
    const complete = await claimRoom(session, configured, storage, "Retry", options);
    expect(complete.outcome.code, complete.outcome.lines.join("\n")).toBe(0);
    expect([complete.pending, complete.label, complete.repository?.membership.scope]).toEqual([false, "My local label", M.name]);
    expect(kinds()).toEqual(["found", "found", "seat", "seat", "first-key"]);
    expect(sent.filter((signed) => signed.intent.kind === "seat")).toEqual([seatRecord.config.claim.seat.signed, seatRecord.config.claim.seat.signed]);
    expect((await M.entries()).filter((entry) => entry.input.type === "act" && entry.input.signed.intent.kind === "seat")).toHaveLength(1);
    expect((await M.entries()).filter((entry) => entry.input.type === "act" && entry.input.signed.intent.kind === "first-key")).toHaveLength(1);
    expect(original.intent.fields).not.toHaveProperty("name");
    expect(original.intent.fields).not.toHaveProperty("label");
    const count = sent.length;
    expect((await claimRoom(session, configured, storage, "Retry", options)).repository).toEqual(complete.repository);
    expect(sent).toHaveLength(count);
    const storageKey = [...values.keys()][0]!;
    const completeBytes = values.get(storageKey)!;
    unavailableSettlement = true;
    const notObserved = await claimRoom(session, configured, storage, "Retry", options);
    expect([notObserved.outcome.code, notObserved.repository, notObserved.pending]).toEqual([1, null, true]);
    expect(sent).toHaveLength(count);
    expect(values.get(storageKey)).toBe(completeBytes);
    unavailableSettlement = false;
    const tampered = JSON.parse(completeBytes);
    tampered.completed.repository.membership.scope = configured.register.scope;
    values.set(storageKey, JSON.stringify(tampered));
    const substituted = await claimRoom(session, configured, storage, "Retry", options);
    expect([substituted.outcome.code, substituted.repository]).toEqual([1, null]);
    expect(substituted.outcome.lines.join("\n")).toContain("repository references do not match");
    expect(sent).toHaveLength(count);
    values.set(storageKey, completeBytes);
  } finally { d.done(); net.clock.now = clock; }
});

// Invariant: a claim queued or prepared under a room/key/register that is no
// longer selected sends no new mutation, keeps any exact original envelope,
// and can resume only when that original context is selected again.
// The scopes/routes are real; Git host, scheduler, storage and lock are STAND-INs.
test("a changed Page context stops queued and prepared native claims before delivery, preserving found, seat and first-key for exact original-context recovery (Git host, scheduler, storage and locks STAND-INs)", async () => {
  const clock = net.clock.now;
  const d = await registerFixture();
  try {
    const configured = { register: d.config.register!, definition: "platform:register@2" as const };
    const values = new Map<string, string>();
    let selected = true;
    let invalidate: "found" | "seat" | "firstKey" | null = null;
    const storage: ClaimStorage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
        const step = invalidate === null ? null : JSON.parse(value).config.claim?.[invalidate];
        if (step?.signed && !step.accepted) { selected = false; invalidate = null; }
      },
    };
    let reads = 0;
    const sent: SignedIntent[] = [];
    const fetch = (async (url: string, init?: RequestInit) => {
      reads++;
      if (new URL(url).pathname.endsWith("/acts") && typeof init?.body === "string") sent.push(structuredClone(JSON.parse(init.body).signed));
      return routed(url, init);
    }) as unknown as Fetch;
    const session = { ...d.session, fetch };
    const options = { pause: d.pause, tries: 16, locks: testLocks(), current: () => selected };
    let release!: () => void;
    const queuedGate = new Promise<void>((resolve) => { release = resolve; });
    let entered!: () => void;
    const waiting = new Promise<void>((resolve) => { entered = resolve; });
    const queuedLocks: ClaimLocks = { request: async (_name, run) => { entered(); await queuedGate; return run(); } };
    const queued = claimRoom(session, configured, storage, "Original label", { ...options, locks: queuedLocks });
    await waiting;
    selected = false;
    release();
    await expect(queued).rejects.toThrow("room, key or register changed");
    expect([reads, sent.length, values.size]).toEqual([0, 0, 0]);

    selected = true;
    const originals: Partial<Record<"found" | "seat" | "firstKey", SignedIntent>> = {};
    for (const [step, kind, earlier] of [["found", "found", []], ["seat", "seat", ["found"]], ["firstKey", "first-key", ["found", "seat"]]] as const) {
      invalidate = step;
      const stopped = await claimRoom(session, configured, storage, "Original label", options);
      expect([stopped.outcome.code, stopped.pending, stopped.repository]).toEqual([1, true, null]);
      expect(stopped.outcome.lines.join("\n")).toContain("earlier steps may already be accepted or unknown");
      expect(sent.map((signed) => signed.intent.kind)).toEqual(earlier);
      const kept = JSON.parse([...values.values()][0]!);
      originals[step] = kept.config.claim[step].signed;
      expect(kept.config.claim[step].accepted).toBeUndefined();
      expect(originals[step]!.intent.kind).toBe(kind);
      for (const prior of Object.keys(originals) as (keyof typeof originals)[]) expect(kept.config.claim[prior].signed).toEqual(originals[prior]);
      // A new stale invocation does not rewrite the prepared record or read.
      const saved = [...values.values()][0]!;
      const before = reads;
      await expect(claimRoom(session, configured, storage, "Replacement label", options)).rejects.toThrow("room, key or register changed");
      expect([reads, [...values.values()][0]!]).toEqual([before, saved]);
      selected = true;
    }
    net.clock.now = timeOf(timeMs(net.clock.now)! + 30_000);
    const complete = await claimRoom(session, configured, storage, "Replacement label", options);
    expect([complete.outcome.code, complete.pending, complete.label]).toEqual([0, false, "Original label"]);
    expect(sent).toEqual([originals.found, originals.seat, originals.firstKey]);
    expect(complete.repository).not.toBeNull();
  } finally { d.done(); net.clock.now = clock; }
});
