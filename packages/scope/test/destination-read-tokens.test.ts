import { expect, test } from "vitest";
import type { Entry, OperationId, PlatformDefinition } from "@generalbusiness/artroom-contract";
import { entryHash, signIntent, newIncarnation } from "@generalbusiness/artroom-bytes";
import type { Operation } from "@generalbusiness/artroom-derive";
import { t } from "@generalbusiness/artroom-derive/testing";
import { Branch, handMade, rita, una } from "../../platform/test/support-destination.ts";
import { CredentialStore } from "../src/credential-store.ts";
import { DestinationHost, DestinationReadTokens, type DestinationHostOptions } from "../src/destination-host.ts";
import type { OutsideGiven } from "../src/object.ts";
import type { EffectRequest } from "../src/operations.ts";
import { found } from "./support.ts";

// STAND-INS: origin, operation, outcome, creator and provider are scripted;
// no definition admits read-token and no membership or host runs. This shows
// only the adapter's boundary. Custody uses real SQLite storage.
function fixture(sql: SqlStorage) {
  const branch = new Branch(false); branch.confirmed();
  const owner: PlatformDefinition = "platform:destination@99";
  const origin = handMade(branch.at, "read-token", [], rita, { hours: 2 }, () => [{ effect: "operation", k: 0, owner, kind: "mint-read", attempts: 1 }]);
  if (origin.input.type !== "act") throw new Error("fixture");
  origin.input.signed = signIntent({ ...origin.input.signed.intent, on: branch.branch.id }, rita.secret);
  const id: OperationId = `${origin.seq}:0`;
  const operation: Operation = { id, owner, kind: "mint-read", most: 1, attempts: [{ attempt: 1, opened: origin.seq, outcomes: [] }], selected: null };
  const own = new Map<number, Entry>([[origin.seq, origin]]);
  let scope = branch.at;
  let now = t(0);
  const state = new Proxy(branch.state, { get(target, key) { if (key === "operation") return (asked: string) => asked === id ? operation : target.operation(asked as OperationId); const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value; } });
  const given: OutsideGiven = {
    state, own: (seq) => { const entry = own.get(seq); return entry ? { entry, hash: entryHash(entry) } : branch.own(seq); },
    retained: () => null, scope: () => ({ ...branch.state.scope()!, at: scope }),
    genesis: () => { const input = branch.own(0)!.entry.input; return input.type === "genesis" ? { ...input, seed: { ...input.seed, definition: owner } } : null; },
    clock: { read: () => now }, random: { bytes: (length) => new Uint8Array(length) },
  };
  const custody = new CredentialStore(sql, () => scope);
  let calls = 0;
  let response: "valid" | "bad" | "lost" | "refused" = "valid";
  let during: (() => void) | null = null;
  const options: DestinationHostOptions = { host: "git.example", namespace: "artroom", custody, provider: {
    format: async () => "sha1", mint: async () => null, revoke: async () => null, ref: async () => null, objects: async () => [], send: async () => null, inspect: async () => { throw new Error("not used"); },
    mintRead: async (_repository, request) => { calls++; expect(request.seconds).toBe(7200); during?.(); if (response === "lost") throw new Error("private-secret"); if (response === "refused") return { minted: false }; return { id: request.handle, ends: t(60), plaintext: response === "bad" ? "private-secret\0" : "private-secret" }; },
    remote: () => "https://git.example/git/artroom/demo.git",
  } };
  const port = new DestinationReadTokens(given, options, owner);
  const request: EffectRequest = { scope: branch.at, operation: id, attempt: 1, owner, kind: "mint-read", origin: given.own(origin.seq)! };
  const confirm = (handle: string) => {
    const entry: Entry = { ...origin, seq: origin.seq + 1, effects: [], input: { type: "outcome", operation: id, attempt: 1, owner, kind: "mint-read", result: "confirmed", evidence: { basis: "own-answer", body: { token: handle, ends: t(60) } } } };
    own.set(entry.seq, entry);
    operation.attempts = [{ attempt: 1, opened: origin.seq, outcomes: [{ seq: entry.seq, result: "confirmed", evidence: entryHash(entry), selected: null }] }];
    return { entry, hash: entryHash(entry) };
  };
  return { port, given, options, custody, branch, request, confirm, calls: () => calls, response: (value: typeof response) => { response = value; }, during: (callback: () => void) => { during = callback; }, replace: () => { scope = { ...scope, inc: newIncarnation(new Uint8Array(16).fill(9)) }; }, time: (value: typeof now) => { now = value; } };
}

test("scripted read-token boundary binds the caller and committed attempt, recovers without reminting, and takes once or expires", async () => {
  const storage = await found();
  await storage.inside(async (state) => {
    const f = fixture(state.storage.sql);
    expect(new DestinationHost(f.given, f.options).accepts(f.request.owner, "mint-read")).toBe(false); // No catalog entry exists for this scripted owner.
    expect(new DestinationHost(f.given, f.options).accepts("platform:destination@1", "mint-read")).toBe(false);
    expect(await f.port.send({ ...f.request, attempt: 2 })).toBeNull();
    expect(await f.port.send({ ...f.request, origin: { ...f.request.origin, hash: `sha256:${"a".repeat(64)}` } })).toBeNull();
    expect(f.calls()).toBe(0);
    const minted = await f.port.send(f.request);
    expect(minted).toMatchObject({ result: "confirmed", evidence: { basis: "own-answer" } });
    const handle = (minted!.evidence.body as { token: string }).token;
    expect(JSON.stringify(minted)).not.toContain("private-secret");
    expect(f.port.credential(handle, rita.key)).toBeNull();
    expect(f.port.reply({ mint: f.request.operation, attempt: 1, id: handle, ends: t(60) })).toEqual(minted);
    expect(await f.port.send(f.request)).toEqual(minted);
    expect(f.calls()).toBe(1);
    const confirmed = f.confirm(handle);
    f.port.judged({ scope: f.request.scope, operation: f.request.operation, attempt: 1 }, confirmed);
    f.confirm(handle + ":wrong");
    expect(f.port.credential(handle, rita.key)).toBeNull();
    expect(f.custody.held(handle)?.plaintext).toBe("private-secret");
    f.confirm(handle);
    expect(f.port.credential(handle, una.key)).toBeNull();
    expect(f.custody.held(handle)?.plaintext).toBe("private-secret");
    expect(f.port.credential(handle, rita.key)).toEqual({ token: "private-secret", ends: t(60), remote: "https://git.example/git/artroom/demo.git" });
    expect(f.port.credential(handle, rita.key)).toBeNull();
    expect(f.custody.reply(f.request.operation, 1)).toEqual({ id: handle, ends: t(60) });
  });
  const expired = await found();
  await expired.inside(async (state) => {
    const f = fixture(state.storage.sql);
    const minted = await f.port.send(f.request);
    const handle = (minted!.evidence.body as { token: string }).token;
    f.port.judged({ scope: f.request.scope, operation: f.request.operation, attempt: 1 }, f.confirm(handle));
    f.time(t(60));
    expect(f.port.credential(handle, rita.key)).toBeNull();
    expect(f.custody.held(handle)).toMatchObject({ state: "live", plaintext: null });
  });
});

test("scripted read-token boundary keeps malformed, lost and replaced-scope replies unknown without recovery mutation", async () => {
  for (const mode of ["bad", "lost", "refused", "replaced"] as const) {
    const storage = await found();
    await storage.inside(async (state) => {
      const f = fixture(state.storage.sql);
      if (mode === "replaced") f.during(f.replace); else f.response(mode);
      const reply = await f.port.send(f.request);
      expect(reply).toEqual(mode === "refused" ? { result: "refused", evidence: { basis: "own-answer", body: {} } } : null);
      expect(f.calls()).toBe(1);
      expect(f.custody.reply(f.request.operation, 1)).toBeNull();
      expect(f.custody.pending(null, 1)).toEqual({ items: [], more: false });
    });
  }
});
