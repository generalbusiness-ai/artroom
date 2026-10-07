import { expect, test } from "vitest";
import type { SessionClaims, Timestamp } from "@generalbusiness/artroom-contract";
import { newIncarnation } from "@generalbusiness/artroom-bytes";
import { t } from "@generalbusiness/artroom-derive/testing";
import { DIRECTORY, RULES_SCOPE } from "@generalbusiness/artroom-platform";
import { Branch, MEMBERSHIP, rita } from "../../platform/test/support-destination.ts";
import { repositorySessionMembership, fixedMembership, type Repository } from "../src/authority.ts";
import { mintSession, readerOf, sessionReaders, sessionsOf } from "../src/sessions.ts";

/** Boundary fixture only: Branch is judged in memory under the destination's
 * real rules; its creator, membership, token claims and directory summary are
 * labelled stand-ins. No namespace RPC or actual membership issuer runs. */
function fixture(kind: "destination" | "rules" = "destination") {
  const branch = new Branch(false);
  branch.confirmed();
  const at = { ...branch.at, kind };
  const sessions = sessionsOf("a deliberately scripted test secret", "destination-test")!;
  let now: Timestamp = branch.now;
  let calls = 0;
  let reply: unknown = { ok: true, value: { scope: branch.bureau.at, definition: DIRECTORY, status: "active", items: [{ type: "repository", state: "open", refs: { membership: MEMBERSHIP } }] } };
  // The rules variant scripts only the birth/state boundary over Branch's
  // fixture; founding-real witnesses the actual rules history and RPC.
  const context: Pick<Repository, "genesis" | "state"> & { state: NonNullable<Repository["state"]> } = { state: kind === "destination" ? branch.state : new Proxy(branch.state, { get(state, key) {
    if (key === "scope") return () => ({ ...state.scope()!, at });
    if (key === "page") return (type: string, states: readonly string[], after: number | null, limit: number) => type === "rules" ? { items: [{ refs: { directory: branch.bureau.at }, values: { membership: MEMBERSHIP.scope } }], next: null } : state.page(type, states, after, limit);
    const value = Reflect.get(state, key); return typeof value === "function" ? value.bind(state) : value;
  } }), genesis: () => { const input = branch.own(0)?.entry.input; return input?.type === "genesis" ? kind === "destination" ? input : { ...input, seed: { ...input.seed, kind, definition: RULES_SCOPE } } : null; } };
  const preparation = repositorySessionMembership(context, async (directory) => {
    calls++;
    expect(directory).toEqual(branch.bureau.at);
    return reply;
  });
  const readers = sessionReaders({
    sessions: () => sessions, clock: { read: () => now }, scope: () => context.state.scope(),
    membership: (scope) => fixedMembership(context, scope), membershipPreparation: preparation,
  });
  const claims: SessionClaims = { v: 1, deployment: sessions.deployment, membership: MEMBERSHIP, member: rita.member.member, key: rita.key, reads: ["summary", "history", "retained"], ends: t(60) };
  const token = (over: Partial<SessionClaims> = {}) => readerOf(mintSession(sessions, { ...claims, ...over }));
  return { at, branch, context, preparation, readers, claims, token, calls: () => calls, clock: (value: Timestamp) => { now = value; }, answer: (value: unknown) => { reply = value; } };
}

// Invariant: authenticating a session and proving the exact read precede any
// directory RPC; a token's membership incarnation is never a wildcard.
test("destination session preparation refuses invalid, expired, unrelated or disallowed sessions before its directory read, and rejects a wrong incarnation", async () => {
  const f = fixture();
  const valid = f.token();
  const altered = valid.slice(0, -1) + (valid.endsWith("A") ? "B" : "A");
  const noPeer = [
    altered, f.token({ deployment: "another-deployment" }),
    f.token({ membership: { ...MEMBERSHIP, scope: f.branch.at.scope } }),
    f.token({ ends: f.branch.now }), f.token({ reads: ["summary"] }),
    // Native issuers always include summary; a manually limited token fails closed.
    f.token({ reads: ["history"] }),
  ];
  for (const reader of noPeer) {
    await f.readers.prepare!(reader, "history");
    expect(f.calls()).toBe(0);
    expect(f.readers.allows(reader, "history")).toBe(false);
  }
  f.clock(t(-1));
  await f.readers.prepare!(valid, "history");
  expect(f.calls()).toBe(0);
  f.clock(f.branch.now);
  const wrongInc = f.token({ membership: { ...MEMBERSHIP, inc: newIncarnation(new Uint8Array(16).fill(9)) } });
  await f.readers.prepare!(wrongInc, "history");
  expect(f.calls()).toBe(1);
  expect(f.readers.allows(wrongInc, "history")).toBe(false);
  expect(fixedMembership(f.context, f.branch.at)).toBeNull();
});

// Invariant: only the actual directory's confirmed membership ref resolves a
// session, and this immutable read reference never fixes grant authority.
test("destination session preparation accepts only the verified creator's active DIRECTORY summary and exact confirmed membership, caches no grant authority, and rechecks time", async () => {
  const f = fixture();
  const valid = f.token();
  for (const value of [
    { scope: { ...f.branch.bureau.at, inc: newIncarnation(new Uint8Array(16).fill(9)) }, definition: DIRECTORY, status: "active", items: [{ type: "repository", state: "open", refs: { membership: MEMBERSHIP } }] },
    { scope: f.branch.bureau.at, definition: DIRECTORY, status: "provisional", items: [{ type: "repository", state: "open", refs: { membership: MEMBERSHIP } }] },
    { scope: f.branch.bureau.at, definition: DIRECTORY, status: "active", items: [{ type: "repository", state: "open", refs: { membership: { ...MEMBERSHIP, scope: f.branch.at.scope } } }] },
  ]) {
    f.answer({ ok: true, value });
    await f.readers.prepare!(valid, "history");
    expect(f.readers.allows(valid, "history")).toBe(false);
  }
  f.answer({ ok: true, value: { scope: f.branch.bureau.at, definition: DIRECTORY, status: "active", items: [{ type: "repository", state: "open", refs: { membership: MEMBERSHIP } }] } });
  await f.readers.prepare!(valid, "history");
  expect(f.readers.allows(valid, "history")).toBe(true);
  expect(f.calls()).toBe(4);
  expect(fixedMembership(f.context, f.branch.at)).toBeNull();
  await f.readers.prepare!(valid, "retained");
  expect(f.readers.allows(valid, "retained")).toBe(true);
  expect(f.calls()).toBe(4);
  f.clock(f.claims.ends);
  expect(f.readers.allows(valid, "history")).toBe(false);
});

// Invariant: a birth read resolves rules only when the actual directory
// confirms that exact rules incarnation alongside the session's membership.
test("rules session preparation requires its directory's exact confirmed rules and membership incarnations", async () => {
  const f = fixture("rules");
  const valid = f.token();
  await f.readers.prepare!(valid.slice(0, -1) + "!", "history");
  await f.readers.prepare!(f.token({ reads: ["summary"] }), "history");
  await f.readers.prepare!(f.token({ ends: f.branch.now }), "history");
  expect(f.calls()).toBe(0);
  const repository = (rules: unknown, membership: unknown = MEMBERSHIP) => ({ type: "repository", state: "open", refs: { rules, membership } });
  const value = (scope: unknown, items: unknown[]) => ({ ok: true, value: { scope, definition: DIRECTORY, status: "active", items } });
  const wrong = newIncarnation(new Uint8Array(16).fill(9));
  for (const reply of [
    value({ ...f.branch.bureau.at, inc: wrong }, [repository(f.at)]),
    value(f.branch.bureau.at, [repository({ ...f.at, inc: wrong })]),
    value(f.branch.bureau.at, [repository(f.at, { ...MEMBERSHIP, inc: wrong })]),
    value(f.branch.bureau.at, [repository(f.at), repository(f.at)]),
  ]) {
    f.answer(reply);
    await f.readers.prepare!(valid, "history");
    expect(f.readers.allows(valid, "history")).toBe(false);
  }
  f.answer(value(f.branch.bureau.at, [repository(f.at)]));
  await f.readers.prepare!(valid, "history");
  expect(f.readers.allows(valid, "history")).toBe(true);
  expect(fixedMembership(f.context, f.at)).toBeNull();
});
