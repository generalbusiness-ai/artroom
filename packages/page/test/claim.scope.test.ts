import { expect, test } from "vitest";
import type { ScopeId, SignedIntent } from "@generalbusiness/artroom-contract";
import { b64url, scopeIdOf, timeMs, timeOf } from "@generalbusiness/artroom-bytes";
import type { Fetch } from "@generalbusiness/artroom-client";
import { net } from "@generalbusiness/artroom-scope/testing";
import { Platform, routed, settle } from "../../scope/test/repository.ts";
import { claimRoom, claimStatus, type ClaimOptions, type ClaimStorage } from "../src/claim.ts";
import { platformNet, platformOutside } from "@generalbusiness/artroom-scope/testing/worker";
import { command, memoryStore, type Context } from "@generalbusiness/artroom-cli";
import { reader } from "../../scope/test/support.ts";
import { OwnGit, ownHost } from "../../scope/test/hosts.ts";
import { artifactsOutside } from "../../scope/src/artifacts-wiring.ts";
import type { ArtifactsNamespace } from "../../scope/src/artifacts-host.ts";
import type { ClaimLocks } from "../src/claim.ts";

async function registerFixture() {
  net.hold = net.deaf = null;
  platformNet.secret = b64url(crypto.getRandomValues(new Uint8Array(32)));
  platformNet.sessions = true;
  platformNet.inspector = reader;
  const host = ownHost();
  // STAND-IN namespace: each repository uses the existing OwnGit fixture;
  // a register can create more than one repository in this namespace.
  const repositories = new Map<string, OwnGit>();
  const namespace: ArtifactsNamespace = {
    create: async (name) => { if (repositories.has(name)) throw new Error("ALREADY_EXISTS"); const repo = new OwnGit(); repositories.set(name, repo); return repo.ns.create(name); },
    get: async (name) => { const repo = repositories.get(name); if (!repo) throw new Error("repository not created"); return repo.ns.get(name); },
    delete: async () => false,
  };
  const hostFetch = async (request: Request) => {
    const name = new URL(request.url).pathname.split("/")[3]?.replace(/\.git$/, "");
    const repo = name ? repositories.get(name) : undefined;
    return repo ? repo.fetch(request) : new Response("no repository", { status: 404 });
  };
  const wired = new Set<ScopeId>();
  let R: Platform;
  const wire = (name: ScopeId) => { wired.add(name); platformOutside.set(name, (given, sql) => artifactsOutside(given, sql, { ...host.bindings(R.name), ARTIFACTS: namespace }, hostFetch)); };
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

function activeKept(bytes: string): any {
  const journal = JSON.parse(bytes);
  return journal.v === 1 ? journal : JSON.parse(journal.claims[journal.active]);
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
    const configured = { register: d.config.register!, definition: "platform:register@3" as const };
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
    const options: ClaimOptions = { mode: "new", pause: d.pause, tries: 16, locks: testLocks() };
    const kinds = () => sent.map((signed) => signed.intent.kind);
    await expect(claimRoom(session, { ...configured, definition: "platform:register@2" }, storage, "My local label", options)).rejects.toThrow("pinned version");
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
    const second = claimRoom(session, configured, storage, "An edited label must not replace the request", { ...options, mode: "resume" });
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
    options.mode = "resume";
    expect([unknown.outcome.code, unknown.pending, unknown.repository, unknown.label]).toEqual([1, true, null, "My local label"]);
    const original = sent[0]!;
    const savedBefore = inFlight;
    expect(activeKept(savedBefore).config.claim.found.signed).toEqual(original);
    expect(savedBefore).not.toContain(b64url(secret));
    expect(JSON.stringify(unknown)).not.toContain(activeKept(savedBefore).recovery);
    const uncertainSeat = await second;
    expect(uncertainSeat.outcome.lines.join("\n")).toMatch(/^No answer:/);
    expect([uncertainSeat.outcome.code, uncertainSeat.pending, uncertainSeat.repository]).toEqual([1, true, null]);
    const seatRecord = activeKept([...values.values()][0]!);
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
    const badRecord = activeKept(completeBytes);
    badRecord.completed.repository.membership.scope = configured.register.scope;
    tampered.claims[tampered.active] = JSON.stringify(badRecord);
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
    const configured = { register: d.config.register!, definition: "platform:register@3" as const };
    const values = new Map<string, string>();
    let selected = true;
    let invalidate: "found" | "seat" | "firstKey" | null = null;
    const storage: ClaimStorage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
        const step = invalidate === null ? null : activeKept(value).config.claim?.[invalidate];
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
    const options: ClaimOptions = { mode: "new", pause: d.pause, tries: 16, locks: testLocks(), current: () => selected };
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
      const kept = activeKept([...values.values()][0]!);
      originals[step] = kept.config.claim[step].signed;
      expect(kept.config.claim[step].accepted).toBeUndefined();
      expect(originals[step]!.intent.kind).toBe(kind);
      for (const prior of Object.keys(originals) as (keyof typeof originals)[]) expect(kept.config.claim[prior].signed).toEqual(originals[prior]);
      options.mode = "resume";
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

// Invariant: explicit New creates a distinct durable operation and native room
// only after the previous native creation is verified complete. Resume targets
// one original operation, and neither pending work nor an archived proof is
// replaced by a label edit, a queued duplicate New action, or another context.
test("explicit new creates another native directory while exact operation resume, pending conflict, stale new and legacy migration preserve original proofs (Git host, scheduler, storage and locks STAND-INs)", async () => {
  const clock = net.clock.now;
  const d = await registerFixture();
  try {
    const configured = { register: d.config.register!, definition: "platform:register@3" as const };
    const values = new Map<string, string>();
    const storage: ClaimStorage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
    let loseFound = true;
    const sent: SignedIntent[] = [];
    const fetch = (async (url: string, init?: RequestInit) => {
      const signed = new URL(url).pathname.endsWith("/acts") && typeof init?.body === "string" ? JSON.parse(init.body).signed as SignedIntent : undefined;
      if (signed) sent.push(structuredClone(signed));
      if (signed?.intent.kind === "found" && loseFound) { loseFound = false; throw new Error("scripted loss before found"); }
      return routed(url, init);
    }) as unknown as Fetch;
    const session = { ...d.session, fetch };
    const options = { pause: d.pause, tries: 16, locks: testLocks() };
    expect(claimStatus(session, configured, storage)).toBeNull();
    const pending = await claimRoom(session, configured, storage, "First local label", { ...options, mode: "new" });
    expect([pending.pending, pending.repository]).toEqual([true, null]);
    expect(claimStatus(session, configured, storage)).toEqual({ operation: pending.operation, label: "First local label", state: "pending" });
    const beforeConflict = [...values.values()][0]!;
    const conflict = await claimRoom(session, configured, storage, "Changed label cannot replace it", { ...options, mode: "new", operation: pending.operation });
    expect([conflict.operation, conflict.pending, conflict.repository]).toEqual([pending.operation, true, null]);
    expect(conflict.outcome.lines.join("\n")).toContain("already in progress");
    expect([[...values.values()][0]!, sent.length]).toEqual([beforeConflict, 1]);
    const first = await claimRoom(session, configured, storage, "Edited label", { ...options, mode: "resume", operation: pending.operation });
    expect([first.outcome.code, first.label]).toEqual([0, "First local label"]);
    const firstBytes = JSON.parse([...values.values()][0]!).claims[first.operation];
    expect(claimStatus(session, configured, storage)?.state).toBe("complete");
    const count = sent.length;
    const [second, staleNew] = await Promise.allSettled([
      claimRoom(session, configured, storage, "Second local label", { ...options, mode: "new", operation: first.operation }),
      claimRoom(session, configured, storage, "Unsolicited third", { ...options, mode: "new", operation: first.operation }),
    ]);
    expect(second.status).toBe("fulfilled");
    if (second.status !== "fulfilled") return;
    expect([second.value.outcome.code, second.value.label]).toEqual([0, "Second local label"]);
    expect(second.value.operation).not.toBe(first.operation);
    expect(second.value.repository!.directory.scope).not.toBe(first.repository!.directory.scope);
    expect(staleNew).toMatchObject({ status: "rejected", reason: expect.objectContaining({ message: expect.stringContaining("Another creation changed") }) });
    expect(sent.slice(count).map((signed) => signed.intent.kind)).toEqual(["found", "seat", "first-key"]);
    const journal = JSON.parse([...values.values()][0]!);
    expect([journal.active, Object.keys(journal.claims).length, journal.claims[first.operation]]).toEqual([second.value.operation, 2, firstBytes]);
    expect(JSON.parse(journal.claims[second.value.operation]).recovery).not.toBe(JSON.parse(firstBytes).recovery);
    const beforeResume = sent.length;
    const old = await claimRoom(session, configured, storage, "Again edited", { ...options, mode: "resume", operation: first.operation });
    expect([old.operation, old.repository, old.label, sent.length]).toEqual([first.operation, first.repository, first.label, beforeResume]);
    expect(claimStatus(session, configured, storage)?.operation).toBe(second.value.operation);
    // A completed legacy v1 record remains a single exact operation; migration
    // neither invents a found nor loses the original recovery/proof bytes.
    const legacyRaw = JSON.stringify(JSON.parse(firstBytes), null, 2);
    const legacyValues = new Map<string, string>([[[...values.keys()][0]!, legacyRaw]]);
    const legacyStorage: ClaimStorage = { getItem: (key) => legacyValues.get(key) ?? null, setItem: (key, value) => { legacyValues.set(key, value); } };
    expect(claimStatus(session, configured, legacyStorage)).toEqual({ operation: "legacy", label: first.label, state: "complete" });
    const legacy = await claimRoom(session, configured, legacyStorage, "No replacement", { ...options, mode: "resume", operation: "legacy" });
    expect([legacy.repository, sent.length]).toEqual([first.repository, beforeResume]);
    const migrated = JSON.parse([...legacyValues.values()][0]!);
    expect([migrated.v, migrated.active]).toEqual([2, "legacy"]);
    expect(migrated.claims.legacy === firstBytes).toBe(true);
    expect(migrated.originalLegacy === legacyRaw).toBe(true);
    // Saturation is a named client bound; archived/unknown data is never evicted.
    const full = JSON.parse([...values.values()][0]!);
    while (Object.keys(full.claims).length < 64) full.claims[crypto.randomUUID()] = firstBytes;
    values.set([...values.keys()][0]!, JSON.stringify(full));
    const saturated = [...values.values()][0]!;
    await expect(claimRoom(session, configured, storage, "Another", { ...options, mode: "new", operation: full.active })).rejects.toThrow("journal is full");
    expect(sent).toHaveLength(beforeResume);
    expect([...values.values()][0]! === saturated).toBe(true);
  } finally { d.done(); net.clock.now = clock; }
});
