import { expect, test, vi } from "vitest";
import type { SignedIntent } from "@generalbusiness/dap-contract";
import { b64url, canonicalize, intentDigest, keyIdOfSecret, newIncarnation, scopeIdOf, signIntent, textDigest, unb64url } from "@generalbusiness/artroom-bytes";
import type { CreationOffer } from "@generalbusiness/artroom-client";
import type { Context, PendingClaim, Repository } from "@generalbusiness/dap-cli";

// Actual Page descriptor/journal, codec and offer validator over SCRIPTED CLI
// workflow/locks/storage. No native admission, browser custody or host proof.
const cli = vi.hoisted(() => ({ claim: vi.fn(), checkClaim: vi.fn() }));
vi.mock("@generalbusiness/dap-cli", async () => ({ ...await vi.importActual<typeof import("@generalbusiness/dap-cli")>("@generalbusiness/dap-cli"), ...cli }));
import { originalStart, startRoom, recoveryKeyOnce } from "../src/start-custody.ts";
import type { ClaimStorage } from "../src/claim.ts";
const origin = "https://start-custody.test";
const ref = (kind: "register" | "directory" | "membership") => ({ scope: scopeIdOf({ v: 1, kind, definition: kind === "register" ? "platform:register@8" : kind === "directory" ? "platform:directory@7" : "platform:membership@2", creator: null, cause: textDigest("SCRIPTED Start " + kind), ordinal: 0 }), inc: newIncarnation(new Uint8Array(16).fill(6)), kind });
const register = ref("register");
const offer: CreationOffer = { v: 1, origin, register, definition: "platform:register@8", at: { seq: 0, hash: textDigest("SCRIPTED register head") }, registerItem: { id: 0, revision: 1, state: "open", host: "artifacts", namespace: "SCRIPTED", policy: "open", purpose: "demo-start" } };
const locks = { request: async <T>(_name: string, run: () => Promise<T>) => run() };
const repository: Repository = { directory: ref("directory"), membership: ref("membership"), rules: ref("directory").scope, destination: ref("membership").scope };
function fixture() {
  const values = new Map<string, string>();
  const storage: ClaimStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
  return { values, storage };
}

test("scripted retained register7 Start keeps its founder key before the CLI boundary; reload Check is read-only and Continue keeps the original envelope and key", async () => {
  cli.claim.mockReset(); cli.checkClaim.mockReset();
  // This descriptor is the exact legacy register7 format, retained before this upgrade.
  const register = { ...ref("register"), scope: scopeIdOf({ v: 1, kind: "register", definition: "platform:register@7", creator: null, cause: textDigest("SCRIPTED legacy Start"), ordinal: 0 }) };
  const legacyOffer: CreationOffer = { ...offer, register, definition: "platform:register@7" };
  const f = fixture(), offerRead = vi.fn(async () => legacyOffer);
  f.values.set(`artroom-page-start:${origin}`, canonicalize({ v: 1, origin, secret: b64url(new Uint8Array(32).fill(61)), configured: { register, definition: "platform:register@7" }, label: "Personal intent", handle: "@founder" }));
  let original: SignedIntent | undefined, posts = 0, founder: string | undefined;
  cli.claim.mockImplementation(async (ctx: Context) => {
    const descriptorBytes = f.values.get(`artroom-page-start:${origin}`)!;
    expect(!!descriptorBytes, "founder-key readback precedes the workflow boundary").toBe(true);
    const descriptor = JSON.parse(descriptorBytes) as { secret: string };
    const secret = await ctx.store.secret("browser");
    expect(secret !== null && b64url(secret) === descriptor.secret).toBe(true);
    const config = (await ctx.store.config())!;
    if (!config.claim) {
      founder = descriptor.secret;
      await ctx.store.keep("recovery", new Uint8Array(32).fill(92));
      const intent = { v: 1 as const, idempotencyKey: "20000000-0000-4000-8000-000000000001", actor: keyIdOfSecret(secret!), to: register, kind: "found", on: null, fields: { branch: "main", founderHandle: "@founder", recoveryKey: keyIdOfSecret(new Uint8Array(32).fill(92)) }, expected: { "0": 1 }, notAfter: "2099-01-01T00:00:00Z" };
      original = signIntent(intent, secret!);
      const pending: PendingClaim = { register: register.scope, intent: intentDigest(intent), handle: "@founder", found: { signed: original } };
      await ctx.store.save({ ...config, claim: pending });
    } else {
      expect(canonicalize(config.claim.found?.signed) === canonicalize(original)).toBe(true);
      expect(descriptor.secret === founder).toBe(true);
    }
    secret?.fill(0); posts++;
    return { code: 1, lines: ["SCRIPTED lost original reply"] };
  });
  cli.checkClaim.mockImplementation(async (ctx: Context) => {
    const config = (await ctx.store.config())!;
    expect(canonicalize(config.claim?.found?.signed) === canonicalize(original)).toBe(true);
    return { code: 1, lines: ["SCRIPTED original remains pending"] };
  });
  const first = await startRoom(origin, f.storage, { mode: "continue", label: "Ignored replacement", creationOffer: offerRead, locks });
  expect(first.pending).toBe(true); expect(posts).toBe(1);
  expect(first.configured).toEqual({ register, definition: "platform:register@7" });
  const status = originalStart(origin, f.storage)!;
  expect(Object.keys(status).sort()).toEqual(["configured", "handle", "key", "label", "operation", "state"]);
  const bytesBefore = [...f.values.entries()];
  const reload: ClaimStorage = { getItem: key => f.values.get(key) ?? null, setItem: (key, value) => { f.values.set(key, value); } };
  const unavailableOffer = vi.fn(async (): Promise<CreationOffer> => { throw new Error("SCRIPTED offer unavailable on reload"); });
  await startRoom(origin, reload, { mode: "check", creationOffer: unavailableOffer, locks });
  expect(cli.checkClaim).toHaveBeenCalledTimes(1); expect(cli.claim).toHaveBeenCalledTimes(1);
  expect(posts).toBe(1); expect(JSON.stringify([...f.values.entries()]) === JSON.stringify(bytesBefore)).toBe(true);
  const continued = await startRoom(origin, reload, { mode: "continue", label: "Ignored replacement", creationOffer: unavailableOffer, locks });
  expect([continued.key, continued.operation, continued.label]).toEqual([status.key, status.operation, "Personal intent"]);
  expect(posts).toBe(2); expect(unavailableOffer).not.toHaveBeenCalled();
  await expect(startRoom(origin, reload, { mode: "new", label: "Another room", offer, creationOffer: offerRead, locks })).rejects.toThrow("already retained");
  expect(posts).toBe(2);
  // Losing the original journal cannot turn an attempted Start into a new
  // claim. The separate descriptor still carries its exact operation.
  const descriptorBeforeLoss = f.values.get(`artroom-page-start:${origin}`)!;
  expect((JSON.parse(descriptorBeforeLoss) as { operation: string }).operation).toBe(status.operation);
  for (const name of [...f.values.keys()]) if (name.startsWith("artroom-page-claim:")) f.values.delete(name);
  const uuid = vi.spyOn(crypto, "randomUUID"), randomness = vi.spyOn(crypto, "getRandomValues");
  try {
    expect(() => originalStart(origin, reload)).toThrow("private Start");
    await expect(startRoom(origin, reload, { mode: "continue", creationOffer: unavailableOffer, locks })).rejects.toThrow("private Start");
    await expect(startRoom(origin, reload, { mode: "check", locks })).rejects.toThrow("private Start");
    expect(cli.claim).toHaveBeenCalledTimes(2); expect(cli.checkClaim).toHaveBeenCalledTimes(1);
    expect(posts).toBe(2); expect(uuid).not.toHaveBeenCalled(); // Public-key derivation uses 16-byte scalar blinding in the pinned
    // curve implementation; a new founder seed would require 32 bytes.
    expect(randomness.mock.calls.some(([array]) => array?.byteLength === 32)).toBe(false);
    expect(f.values.get(`artroom-page-start:${origin}`) === descriptorBeforeLoss).toBe(true);
  } finally { uuid.mockRestore(); randomness.mockRestore(); }
});

test("scripted dropped, malformed or stale Start custody stops before the workflow; a retained key alone permits only explicit Continue", async () => {
  cli.claim.mockReset(); cli.checkClaim.mockReset();
  const legacyNew = fixture();
  await expect(startRoom(origin, legacyNew.storage, { mode: "new", label: "Room", offer: { ...offer, definition: "platform:register@7" }, locks })).rejects.toThrow("register8");
  expect(legacyNew.values.size).toBe(0); expect(cli.claim).not.toHaveBeenCalled();
  const mismatched = fixture();
  await expect(startRoom(origin, mismatched.storage, { mode: "new", label: "Room", offer, locks, creationOffer: async () => ({ ...offer, definition: "platform:register@7" }) })).rejects.toThrow("private Start");
  expect(originalStart(origin, mismatched.storage)?.configured.definition).toBe("platform:register@8");
  const mismatchedBytes = [...mismatched.values.entries()];
  await startRoom(origin, mismatched.storage, { mode: "check", locks });
  expect([...mismatched.values.entries()]).toEqual(mismatchedBytes); expect(cli.claim).not.toHaveBeenCalled();
  const dropped: ClaimStorage = { getItem: () => null, setItem: () => {} };
  await expect(startRoom(origin, dropped, { mode: "new", label: "Room", offer, locks })).rejects.toThrow("private Start");
  expect(cli.claim).not.toHaveBeenCalled();
  const malformed = fixture(); malformed.values.set(`artroom-page-start:${origin}`, "{broken");
  await expect(startRoom(origin, malformed.storage, { mode: "new", label: "Room", offer, locks })).rejects.toThrow("private Start");
  expect(malformed.values.get(`artroom-page-start:${origin}`)).toBe("{broken");
  const stale = fixture();
  await expect(startRoom(origin, stale.storage, { mode: "new", label: "Room", offer, locks, current: () => false })).rejects.toThrow("private Start");
  expect(stale.values.size).toBe(0); expect(cli.claim).not.toHaveBeenCalled();
  const prepared = fixture();
  const unavailableOffer = async (): Promise<CreationOffer> => { throw new Error("SCRIPTED no fresh offer"); };
  await expect(startRoom(origin, prepared.storage, { mode: "new", label: "Room", offer, locks, creationOffer: unavailableOffer })).rejects.toThrow("no fresh offer");
  const before = [...prepared.values.entries()];
  expect(originalStart(origin, prepared.storage)?.state).toBe("prepared");
  const checked = await startRoom(origin, prepared.storage, { mode: "check", locks });
  expect(checked.pending).toBe(true); expect(checked.outcome.lines.join(" ")).toContain("Continue explicitly");
  expect(cli.checkClaim).not.toHaveBeenCalled(); expect(cli.claim).not.toHaveBeenCalled();
  expect(JSON.stringify([...prepared.values.entries()]) === JSON.stringify(before)).toBe(true);
});

test("scripted completed Start handoff returns the enrolled founder seed rather than the internal recovery seed", async () => {
  cli.claim.mockReset(); cli.checkClaim.mockReset();
  const f = fixture();
  cli.claim.mockImplementation(async (ctx: Context) => {
    const descriptor = JSON.parse(f.values.get(`artroom-page-start:${origin}`)!) as { configured: { definition: string }; secret: string };
    expect(descriptor.configured.definition).toBe("platform:register@8");
    const config = (await ctx.store.config())!;
    expect(config.register).toEqual(register);
    await ctx.store.keep("recovery", new Uint8Array(32).fill(92));
    const secret = (await ctx.store.secret("browser"))!;
    const intent = { v: 1 as const, idempotencyKey: "20000000-0000-4000-8000-000000000002", actor: keyIdOfSecret(secret), to: register, kind: "found", on: null, fields: {}, expected: {}, notAfter: "2099-01-01T00:00:00Z" };
    const pending: PendingClaim = { register: register.scope, intent: intentDigest(intent), handle: "@founder", found: { signed: signIntent(intent, secret) } };
    await ctx.store.save({ ...config, claim: pending });
    await ctx.store.save({ ...config, repository, handle: "@founder" }); secret.fill(0);
    return { code: 0, lines: ["SCRIPTED complete"] };
  });
  const result = await startRoom(origin, f.storage, { mode: "new", label: "Room", offer, creationOffer: async () => offer, locks });
  expect(result.repository).toEqual(repository);
  const actual = unb64url((JSON.parse(f.values.get(`artroom-page-start:${origin}`)!) as { secret: string }).secret)!;
  try {
    expect(!!result.secret && b64url(result.secret) === b64url(actual)).toBe(true);
    expect(result.secret && keyIdOfSecret(result.secret)).toBe(result.key);
    expect(result.secret && b64url(result.secret) === b64url(new Uint8Array(32).fill(92))).toBe(false);
  } finally { actual.fill(0); result.secret?.fill(0); }
  const recovery = await recoveryKeyOnce(origin, f.storage, { key: result.key, operation: result.operation }, { locks });
  expect(recovery.trim() === (JSON.parse(f.values.get(`artroom-page-start:${origin}`)!) as { secret: string }).secret).toBe(true);
  expect(originalStart(origin, f.storage)?.recoverySaved).toBe(true);
  const preserved = [...f.values.entries()];
  await expect(recoveryKeyOnce(origin, f.storage, { key: result.key, operation: result.operation }, { locks })).rejects.toThrow("already offered");
  expect(canonicalize([...f.values.entries()]) === canonicalize(preserved)).toBe(true);
});
