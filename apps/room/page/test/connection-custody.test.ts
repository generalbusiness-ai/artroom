import { expect, test, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileStore } from "../../../../packages/cli/src/files.ts";
import { b64url, canonicalize, keyIdOfSecret, newIncarnation, scopeIdOf, textDigest, utf8 } from "@generalbusiness/artroom-bytes";
import type { Context, InvitationIssueInput, InvitationIssueResult } from "@generalbusiness/dap-cli";
import type { ClaimStorage } from "../src/claim.ts";
const shared = vi.hoisted(() => ({ issueInvitation: vi.fn() }));
vi.mock("@generalbusiness/dap-cli", async () => ({ ...await vi.importActual<typeof import("@generalbusiness/dap-cli")>("@generalbusiness/dap-cli"), ...shared }));
const founder = vi.hoisted(() => ({ originalStart: vi.fn(), startRoom: vi.fn(), recoveryKeyOnce: vi.fn() }));
vi.mock("../src/start-custody.ts", () => founder);
vi.mock("../src/data.ts", async () => ({ ...await vi.importActual<typeof import("../src/data.ts")>("../src/data.ts"), openRoom: async (session: { service: string; secret: Uint8Array }) => ({ session, directory: directory.scope, membership, key, me: { handle: "@founder", ref: controller, actions: ["membership.invite", "membership.manage"] } }) }));
import { connectInvitation, originalConnection, creatorConnectionFiles, saveCreatorRecoveryOnce } from "../src/connection-custody.ts";
const origin = "https://connection-custody.test";
const ref = (kind: "register" | "directory" | "membership") => ({ scope: scopeIdOf({ v: 1, kind, definition: kind === "register" ? "platform:register@7" : "platform:directory@3", creator: null, cause: textDigest("SCRIPTED connection " + kind), ordinal: 0 }), inc: newIncarnation(new Uint8Array(16).fill(4)), kind });
const directory = ref("directory"), membership = ref("membership"), register = ref("register"), seed = new Uint8Array(32).fill(71), key = keyIdOfSecret(seed);
const controller = { membership, member: "@founder" };
const expected = { key, operation: "50000000-0000-4000-8000-000000000001", membership };
const repository = { directory, membership, rules: directory.scope, destination: membership.scope };
const locks = { request: async <T>(_name: string, work: () => Promise<T>) => work() };
function fixture() {
  shared.issueInvitation.mockReset(); founder.originalStart.mockReset(); founder.startRoom.mockReset(); founder.recoveryKeyOnce.mockReset();
  const values = new Map<string, string>();
  const handed: Uint8Array[] = [];
  founder.originalStart.mockReturnValue({ ...expected, state: "complete" });
  founder.startRoom.mockImplementation(async () => { const secret = seed.slice(); handed.push(secret); return { ...expected, repository, configured: { register, definition: "platform:register@7" }, handle: "@founder", secret }; });
  const storage: ClaimStorage = { getItem: name => values.get(name) ?? null, setItem: (name, value) => { values.set(name, value); } };
  return { values, storage, handed };
}
// Actual Page Store/lock/retention adapter and bytes over SCRIPTED shared CLI,
// founder proof and native standing. Shared/native sender is proved separately.
test("connection custody reserves before the shared sender and retains opaque originals across reload Check/Continue; missing private snapshots never become fresh invitations", async () => {
  const f = fixture(); let posts = 0, firstOperation = "";
  const input: InvitationIssueInput = { kind: "person", handle: "@guest", role: "member", hours: 24 };
  shared.issueInvitation.mockImplementation(async (ctx: Context, actual: InvitationIssueInput, options: { operation: string; mode: string }): Promise<InvitationIssueResult> => {
    const publicState = originalConnection(origin, f.storage, expected)!;
    expect(publicState.operation).toBe(options.operation);
    expect(actual).toEqual(input);
    if (options.mode === "new") {
      firstOperation = options.operation;
      const bytes = utf8("SCRIPTED opaque signed-original invitation snapshot");
      const request = `i-${options.operation.replace(/-/g, "").slice(0, 30)}`;
      await ctx.store.keepPrivate(request, bytes);
      const config = (await ctx.store.config())!;
      await ctx.store.save({ ...config, invitationIssue: { operation: options.operation, request, digest: textDigest(new TextDecoder().decode(bytes)), membership, actor: key } });
      expect(canonicalize(Array.from((await ctx.store.private(request))!)) === canonicalize(Array.from(bytes))).toBe(true);
      expect(originalConnection(origin, f.storage, expected)?.state).toBe("entered");
      posts++;
    } else {
      expect(options.operation).toBe(firstOperation);
      const pointer = (await ctx.store.config())!.invitationIssue!;
      expect(new TextDecoder().decode((await ctx.store.private(pointer.request))!)).toBe("SCRIPTED opaque signed-original invitation snapshot");
      if (options.mode === "continue") posts++;
    }
    return { operation: options.operation, kind: actual.kind, handle: actual.handle, state: "unknown", reason: "SCRIPTED original reply lost" };
  });
  await connectInvitation(origin, f.storage, expected, input, { mode: "new", locks });
  expect(posts).toBe(1); expect(f.handed[0]!.every(byte => byte === 0)).toBe(true);
  const after = [...f.values.entries()];
  const reload: ClaimStorage = { getItem: f.storage.getItem, setItem: f.storage.setItem };
  await connectInvitation(origin, reload, expected, input, { mode: "check", locks });
  expect(posts).toBe(1); expect(canonicalize([...f.values.entries()]) === canonicalize(after)).toBe(true);
  await connectInvitation(origin, reload, expected, { ...input, handle: "@replacement" }, { mode: "continue", locks });
  expect(posts).toBe(2);
  const callsBefore = shared.issueInvitation.mock.calls.length;
  const journalKey = [...f.values.keys()][0]!, bytes = f.values.get(journalKey)!;
  const journal = JSON.parse(bytes); journal.rows[journal.active].private = {};
  f.values.set(journalKey, canonicalize(journal));
  await expect(connectInvitation(origin, reload, expected, input, { mode: "continue", locks })).rejects.toThrow("original private connection");
  expect(shared.issueInvitation).toHaveBeenCalledTimes(callsBefore); expect(posts).toBe(2);
});

test("dropped connection reservation dispatches nothing; true agent input uses the verified founder controller, and CLI/recovery files use that enrolled key", async () => {
  const f = fixture();
  const dropped: ClaimStorage = { getItem: () => null, setItem: () => {} };
  await expect(connectInvitation(origin, dropped, expected, { kind: "person", handle: "@guest", role: "member", hours: 24 }, { mode: "new", locks })).rejects.toThrow("original private connection");
  expect(shared.issueInvitation).not.toHaveBeenCalled();
  shared.issueInvitation.mockImplementation(async (ctx: Context, input: InvitationIssueInput, options: { operation: string }): Promise<InvitationIssueResult> => {
    expect(input.kind).toBe("agent-key"); expect(input.controller).toEqual(controller);
    const request = `i-${options.operation.replace(/-/g, "").slice(0, 30)}`, snapshot = "SCRIPTED agent add-member + invite-key originals";
    await ctx.store.keepPrivate(request, utf8(snapshot));
    await ctx.store.save({ ...(await ctx.store.config())!, invitationIssue: { operation: options.operation, request, digest: textDigest(snapshot), membership, actor: key } });
    return { operation: options.operation, kind: input.kind, handle: input.handle, state: "verified", link: "SCRIPTED private agent enrol link" };
  });
  const agent = await connectInvitation(origin, f.storage, expected, { kind: "agent-key", handle: "@agent", hours: 24, controller: { membership, member: "@forged" } }, { mode: "new", locks });
  expect(agent.state).toBe("verified");
  const files = await creatorConnectionFiles(origin, f.storage, expected, { locks });
  expect(files.key.trim() === b64url(seed)).toBe(true);
  const config = JSON.parse(files.config); expect(config.repository.membership).toEqual(membership); expect(config.key).toBe("device");
  // Real CLI fileStore consumes the downloaded config/key layout. No CLI
  // native request is made; the temporary directory is this test's own.
  const directory = mkdtempSync(join(tmpdir(), "page-cli-connection-"));
  try {
    mkdirSync(join(directory, "keys"), { mode: 0o700 });
    writeFileSync(join(directory, "config.json"), files.config, { mode: 0o600 });
    writeFileSync(join(directory, "keys", "device.key"), files.key, { mode: 0o600 });
    const cliStore = fileStore(directory), loaded = (await cliStore.config())!;
    const privateKey = (await cliStore.secret(loaded.key))!;
    try { expect(keyIdOfSecret(privateKey)).toBe(expected.key); } finally { privateKey.fill(0); }
  } finally { rmSync(directory, { recursive: true, force: true }); }
  founder.recoveryKeyOnce.mockResolvedValue(b64url(seed) + "\n");
  const recovery = await saveCreatorRecoveryOnce(origin, f.storage, expected, { locks });
  expect(recovery.trim() === b64url(seed)).toBe(true);
  expect(founder.recoveryKeyOnce).toHaveBeenCalledWith(origin, f.storage, expected, { locks });
  expect(f.handed.every(bytes => bytes.every(byte => byte === 0))).toBe(true);
});

test("a retained initial snapshot with a dropped public pointer is read-only on Check and recovered explicitly on Continue without another operation or snapshot", async () => {
  const f = fixture(); let dropPointer = true, submitted = 0;
  const input: InvitationIssueInput = { kind: "person", handle: "@guest", role: "member", hours: 24 };
  let originalOperation = "", originalRequest = "", initialBytes = "";
  const storage: ClaimStorage = {
    getItem: f.storage.getItem,
    setItem: (name, value) => {
      const journal = JSON.parse(value);
      if (dropPointer && journal.rows[journal.active].config.invitationIssue) { dropPointer = false; return; }
      f.values.set(name, value);
    }
  };
  shared.issueInvitation.mockImplementation(async (ctx: Context, actual: InvitationIssueInput, options: { mode: string; operation: string; reservedRequest?: string }): Promise<InvitationIssueResult> => {
    expect(actual).toEqual(input);
    if (options.mode === "new") {
      originalOperation = options.operation; originalRequest = `i-${options.operation.replace(/-/g, "").slice(0, 30)}`;
      initialBytes = "SCRIPTED complete INITIAL snapshot with retained random invitation secret";
      await ctx.store.keepPrivate(originalRequest, utf8(initialBytes));
    } else {
      expect(options.mode).toBe("continue"); expect(options.operation).toBe(originalOperation); expect(options.reservedRequest).toBe(originalRequest);
      expect(new TextDecoder().decode((await ctx.store.private(originalRequest))!) === initialBytes).toBe(true);
    }
    await ctx.store.save({ ...(await ctx.store.config())!, invitationIssue: { operation: originalOperation, request: originalRequest, digest: textDigest(initialBytes), membership, actor: key } });
    submitted++;
    return { operation: originalOperation, kind: input.kind, handle: input.handle, state: "unknown", reason: "SCRIPTED original sent" };
  });
  await expect(connectInvitation(origin, storage, expected, input, { mode: "new", locks })).rejects.toThrow("original private connection");
  expect(submitted).toBe(0); expect(originalConnection(origin, storage, expected)?.state).toBe("reserved");
  const before = canonicalize([...f.values.entries()]), callsBefore = shared.issueInvitation.mock.calls.length;
  const checked = await connectInvitation(origin, storage, expected, input, { mode: "check", locks });
  expect(checked.state).toBe("prepared"); expect(shared.issueInvitation).toHaveBeenCalledTimes(callsBefore); expect(submitted).toBe(0);
  expect(canonicalize([...f.values.entries()]) === before).toBe(true);
  const uuid = vi.spyOn(crypto, "randomUUID");
  try {
    await connectInvitation(origin, storage, expected, input, { mode: "continue", locks });
    expect(submitted).toBe(1); expect(uuid).not.toHaveBeenCalled();
    const journal = JSON.parse([...f.values.values()][0]!);
    expect(Object.keys(journal.rows)).toEqual([originalOperation]);
    expect(Object.keys(journal.rows[originalOperation].private)).toEqual([originalRequest]);
    expect(journal.rows[originalOperation].private[originalRequest] === initialBytes).toBe(true);
  } finally { uuid.mockRestore(); }
});

test("later prepared-stage private snapshots survive pointer-write loss; Check forwards the complete candidate set and Continue restores that exact successor", async () => {
  const f = fixture(); let dropStagePointer = true, dispatches = 0;
  const input: InvitationIssueInput = { kind: "agent-key", handle: "@agent", hours: 24 };
  let initialRequest = "", stageRequest = "", operation = "";
  const initial = "SCRIPTED initial snapshot with retained invitation secret";
  const stage = "SCRIPTED successor linked to initial digest with exact prepared add-member envelope";
  const storage: ClaimStorage = {
    getItem: f.storage.getItem,
    setItem: (name, value) => {
      const journal = JSON.parse(value);
      if (dropStagePointer && stageRequest && journal.rows[journal.active].config.invitationIssue?.request === stageRequest) { dropStagePointer = false; return; }
      f.values.set(name, value);
    }
  };
  const pointer = (request: string, bytes: string) => ({ operation, request, digest: textDigest(bytes), membership, actor: key });
  shared.issueInvitation.mockImplementation(async (ctx: Context, actual: InvitationIssueInput, options: { operation: string; mode: string; privateRequests: readonly string[] }): Promise<InvitationIssueResult> => {
    expect(actual.controller).toEqual(controller);
    if (options.mode === "new") {
      operation = options.operation; initialRequest = `i-${options.operation.replace(/-/g, "").slice(0, 30)}`; stageRequest = `i-${crypto.randomUUID().replace(/-/g, "").slice(0, 30)}`;
      expect(options.privateRequests).toEqual([]);
      await ctx.store.keepPrivate(initialRequest, utf8(initial));
      await ctx.store.save({ ...(await ctx.store.config())!, invitationIssue: pointer(initialRequest, initial) });
      await ctx.store.keepPrivate(stageRequest, utf8(stage));
      await ctx.store.save({ ...(await ctx.store.config())!, invitationIssue: pointer(stageRequest, stage) });
    } else {
      expect([...options.privateRequests].sort()).toEqual([initialRequest, stageRequest].sort());
      expect(new TextDecoder().decode((await ctx.store.private(stageRequest))!) === stage).toBe(true);
      expect((await ctx.store.config())!.invitationIssue!.request).toBe(initialRequest);
      if (options.mode === "continue") await ctx.store.save({ ...(await ctx.store.config())!, invitationIssue: pointer(stageRequest, stage) });
    }
    if (options.mode !== "check") dispatches++;
    return { operation, kind: input.kind, handle: input.handle, state: "unknown", reason: "SCRIPTED original retained" };
  });
  await expect(connectInvitation(origin, storage, expected, input, { mode: "new", locks })).rejects.toThrow("original private connection");
  expect(dispatches).toBe(0);
  const before = JSON.parse([...f.values.values()][0]!).rows[operation];
  expect(before.config.invitationIssue.request).toBe(initialRequest);
  await connectInvitation(origin, storage, expected, input, { mode: "check", locks });
  const afterCheck = JSON.parse([...f.values.values()][0]!).rows[operation];
  expect(dispatches).toBe(0);
  expect(canonicalize(afterCheck.config) === canonicalize(before.config)).toBe(true);
  expect(canonicalize(afterCheck.private) === canonicalize(before.private)).toBe(true);
  const uuid = vi.spyOn(crypto, "randomUUID");
  try {
    await connectInvitation(origin, storage, expected, input, { mode: "continue", locks });
    expect(dispatches).toBe(1); expect(uuid).not.toHaveBeenCalled();
    const restored = JSON.parse([...f.values.values()][0]!).rows[operation];
    expect(restored.config.invitationIssue.request).toBe(stageRequest);
    expect(canonicalize(restored.private) === canonicalize(before.private)).toBe(true);
  } finally { uuid.mockRestore(); }
});
