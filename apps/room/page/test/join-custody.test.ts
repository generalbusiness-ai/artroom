import { expect, test } from "vitest";
import type { Entry, PlatformDefinition, Receipt, ScopeRef, SignedIntent } from "@generalbusiness/dap-contract";
import { b64url, entryHash, intentDigest, newIncarnation, scopeIdOf, textDigest, utf8, verifySignedIntent } from "@generalbusiness/artroom-bytes";
import type { Fetch } from "@generalbusiness/artroom-client";
import { checkOriginal, joinInvitation, originalJoin, type JoinStorage } from "../src/join-custody.ts";

// Actual signer/codec/HTTP adapter with SCRIPTED storage, locking and service
// answers. No native enrollment, grants, deployment or provider runs here.
const origin = "https://page-custody.test";
const ref = (kind: ScopeRef["kind"]): ScopeRef => ({ scope: scopeIdOf({ v: 1, kind, definition: "platform:membership@2", creator: null, cause: textDigest("TEST custody " + kind), ordinal: 0 }), kind, inc: newIncarnation(new Uint8Array(16).fill(7)) });
const directory = ref("directory"), membership = ref("membership");
const invitation = (n = 1, secret = "TEST invitation secret", targetMembership = membership, handle = "@ada") => "artroom-invite:" + b64url(utf8(JSON.stringify({ v: 1, service: origin, repository: { directory, membership: targetMembership, rules: ref("rules").scope, destination: ref("destination").scope }, invitation: n, secret, handle, definition: "platform:membership@2" })));
const lock = { run: async <T>(work: () => Promise<T>) => work() };
const now = () => Date.parse("2026-10-12T00:00:00Z");
function fixture(definition: PlatformDefinition = "platform:membership@2") {
  const values = new Map<string, string>();
  let writes = 0, posts = 0, settles = 0, entries = 0, lost = false, missing = false, badEntry = false, refused = false;
  let signed: SignedIntent | undefined, entry: Entry | undefined, receipt: Receipt | undefined;
  const storage: JoinStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => { writes++; values.set(key, value); } };
  const fetch: Fetch = async (url, init) => {
    if (url.endsWith("/acts")) {
      posts++;
      // Both persisted states precede the actual first POST.
      expect(writes).toBeGreaterThanOrEqual(2);
      expect(originalJoin(origin, storage)?.status).toBe("unknown");
      signed = (JSON.parse(init!.body!) as { signed: SignedIntent }).signed;
      expect(verifySignedIntent(signed)).toBe(true);
      entry = { v: 1, at: membership, seq: 5, prev: textDigest("TEST previous"), time: "2026-10-12T00:00:00Z", clamped: false, epoch: 0, input: { type: "act", signed, authority: [], presented: {} }, uses: [], prepared: [], effects: [], sends: [] };
      receipt = { fact: { at: membership, seq: 5, hash: entryHash(entry) }, definition, intent: intentDigest(signed.intent), effects: [], sends: [], epoch: 0 };
      if (refused) return Response.json({ answer: "refused", reason: "expired", judgedAt: { seq: 0, hash: textDigest("TEST refusal") } });
      if (lost) throw new Error("TEST lost reply");
      return Response.json({ answer: "accepted", receipt });
    }
    if (url.endsWith("/settle")) {
      settles++;
      // Recovery presents the original signed request, not a replacement.
      expect(JSON.parse(init!.body!).signed).toEqual(signed);
      return missing ? Response.json({ ok: false, reason: "not-found" }) : Response.json({ ok: true, at: { seq: 5, hash: receipt!.fact.hash }, complete: true, value: receipt });
    }
    entries++;
    const returned = badEntry ? { ...entry!, time: "2026-10-12T00:00:01Z" } : entry!;
    return Response.json({ ok: true, at: { seq: 5, hash: receipt!.fact.hash }, complete: true, value: { entry: returned, hash: entryHash(returned) } });
  };
  return { storage, fetch, counters: () => ({ posts, settles, entries }), lose: () => { lost = true; }, missing: () => { missing = true; }, badEntry: () => { badEntry = true; }, refuse: (value = true) => { refused = value; }, get writes() { return writes; }, values };
}

test("scripted lost enrollment survives reload and changed invitation without rekey or resubmission; read-only check verifies the original receipt and entry", async () => {
  const f = fixture(); f.lose();
  const first = await joinInvitation(origin, invitation(), f.storage, { fetch: f.fetch, now, lock });
  expect(first.status).toBe("unknown");
  const publicState = originalJoin(origin, f.storage)!;
  expect(Object.keys(publicState).sort()).toEqual(["handle", "key", "place", "status"]);
  const repeated = await joinInvitation(origin, invitation(2), f.storage, { fetch: f.fetch, now, lock });
  expect([repeated.status, repeated.key, f.counters().posts]).toEqual(["unknown", first.key, 1]);
  // A fresh storage adapter models the page's reload; original key/request
  // come from retained bytes rather than any in-memory sending map.
  const reloaded: JoinStorage = { getItem: key => f.values.get(key) ?? null, setItem: (key, value) => { f.values.set(key, value); } };
  const checked = await checkOriginal(origin, reloaded, { fetch: f.fetch, now, lock });
  expect(checked?.status).toBe("verified");
  expect([checked?.key, f.counters()]).toEqual([first.key, { posts: 1, settles: 1, entries: 1 }]);
  if (checked?.status === "verified") { expect(checked.secret.length).toBe(32); checked.secret.fill(0); }
  expect(originalJoin(origin, reloaded)?.status).toBe("verified");
});

test("scripted failed custody or stale context dispatches nothing; missing settlement and wrong entry retain the unknown original", async () => {
  const dropped: JoinStorage = { getItem: () => null, setItem: () => {} };
  let posts = 0;
  const noFetch: Fetch = async () => { posts++; throw new Error("TEST unexpected submission"); };
  await expect(joinInvitation(origin, invitation(), dropped, { fetch: noFetch, now, lock })).rejects.toThrow("original private enrollment");
  expect(posts).toBe(0);
  const stale = fixture();
  await expect(joinInvitation(origin, invitation(), stale.storage, { fetch: noFetch, now, lock, current: () => false })).rejects.toThrow("no longer current");
  expect(stale.values.size).toBe(0);
  for (const fault of ["missing", "wrong-entry"] as const) {
    const f = fixture(); f.lose();
    const pending = await joinInvitation(origin, invitation(), f.storage, { fetch: f.fetch, now, lock });
    const bytesBefore = [...f.values.values()][0];
    if (fault === "missing") f.missing(); else f.badEntry();
    const checked = await checkOriginal(origin, f.storage, { fetch: f.fetch, now, lock });
    expect([checked?.status, checked?.key, f.counters().posts]).toEqual(["unknown", pending.key, 1]);
    expect([...f.values.values()][0]).toBe(bytesBefore);
  }
});

test("scripted known refusal keeps the same invitation terminal but a different invitation uses the same key and retains exact refusal history", async () => {
  const f = fixture(); f.refuse();
  const first = await joinInvitation(origin, invitation(), f.storage, { fetch: f.fetch, now, lock });
  const original = JSON.parse([...f.values.values()][0]!);
  const same = await joinInvitation(origin, invitation(), f.storage, { fetch: f.fetch, now, lock });
  expect([first.status, same.status, same.key, f.counters().posts]).toEqual(["refused", "refused", first.key, 1]);
  const next = await joinInvitation(origin, invitation(2), f.storage, { fetch: f.fetch, now, lock });
  expect([next.status, next.key, f.counters().posts]).toEqual(["refused", first.key, 2]);
  const saved = JSON.parse([...f.values.values()][0]!);
  expect(saved.history).toHaveLength(1);
  // Boolean comparisons avoid emitting private seed/envelope bytes on failure.
  expect(JSON.stringify(saved.history[0].prepared) === JSON.stringify(original.prepared)).toBe(true);
  expect(JSON.stringify(saved.history[0].refusal) === JSON.stringify(original.refusal)).toBe(true);
  expect(saved.secret === original.secret).toBe(true);
  expect(verifySignedIntent(saved.history[0].prepared.signed)).toBe(true);
  const rejecting: JoinStorage = { getItem: key => f.values.get(key) ?? null, setItem: () => { throw new Error("TEST full storage"); } };
  const before = [...f.values.values()][0];
  await expect(joinInvitation(origin, invitation(3), rejecting, { fetch: f.fetch, now, lock })).rejects.toThrow("TEST full storage");
  expect(f.counters().posts).toBe(2);
  expect([...f.values.values()][0] === before).toBe(true);
  // Valid long invitations reach the real total record budget without an
  // archive eviction. The first over-budget replacement must issue no POST.
  const bounded = fixture(); bounded.refuse();
  let full = false;
  for (let n = 1; n <= 10; n++) {
    const count = bounded.counters().posts, prior = [...bounded.values.values()][0];
    try { await joinInvitation(origin, invitation(n, "x".repeat(8_000)), bounded.storage, { fetch: bounded.fetch, now, lock }); }
    catch (error) {
      expect(count, "valid long requests must establish prior refusal history before the bound").toBeGreaterThanOrEqual(2);
      expect(error instanceof Error && /original private enrollment|history is full/.test(error.message)).toBe(true);
      expect(bounded.counters().posts).toBe(count);
      expect([...bounded.values.values()][0] === prior).toBe(true);
      full = true; break;
    }
  }
  expect(full, "bounded custody must stop before evicting a prior refusal").toBe(true);
});


test("scripted A-refused B-refused A replay and reload return the exact archived answer without replacing current B custody", async () => {
  const f = fixture(); f.refuse();
  const membershipB = { ...membership, scope: scopeIdOf({ v: 1, kind: "membership", definition: "platform:membership@2", creator: null, cause: textDigest("TEST other target"), ordinal: 0 }) };
  const inviteA = invitation(), inviteB = invitation(2, "TEST other invitation", membershipB, "@beau");
  let preparations = 0;
  const options = { fetch: f.fetch, now: () => { preparations++; return now(); }, lock };
  const first = await joinInvitation(origin, inviteA, f.storage, options);
  const second = await joinInvitation(origin, inviteB, f.storage, options);
  expect([first.status, second.status, f.counters().posts]).toEqual(["refused", "refused", 2]);
  expect(second.place.membership).toEqual(membershipB);
  const currentBytes = [...f.values.values()][0]!, writesBefore = f.writes, preparationsBefore = preparations;
  const currentPublic = originalJoin(origin, f.storage);
  const reloaded: JoinStorage = {
    getItem: key => f.values.get(key) ?? null,
    setItem: () => { throw new Error("TEST archived replay must not write custody"); }
  };
  for (const storage of [f.storage, reloaded]) {
    const replay = await joinInvitation(origin, inviteA, storage, options);
    expect(replay.status).toBe("refused");
    expect([replay.key, replay.place, replay.handle, replay.answer]).toEqual([first.key, first.place, first.handle, first.answer]);
    expect(f.counters().posts).toBe(2);
    expect(preparations).toBe(preparationsBefore);
    expect(f.writes).toBe(writesBefore);
    // No private envelope or seed is printed if byte preservation fails.
    expect([...f.values.values()][0] === currentBytes).toBe(true);
    expect(originalJoin(origin, storage)).toEqual(currentPublic);
  }
});

test("scripted archived A refusal cannot hide an unknown current B enrollment on replay or reload", async () => {
  const f = fixture(); f.refuse();
  const first = await joinInvitation(origin, invitation(), f.storage, { fetch: f.fetch, now, lock });
  f.refuse(false); f.lose();
  const second = await joinInvitation(origin, invitation(2), f.storage, { fetch: f.fetch, now, lock });
  expect([first.status, second.status]).toEqual(["refused", "unknown"]);
  const before = [...f.values.values()][0]!, writesBefore = f.writes;
  const reloaded: JoinStorage = { getItem: key => f.values.get(key) ?? null, setItem: () => { throw new Error("TEST unknown replay must not write"); } };
  const replay = await joinInvitation(origin, invitation(), reloaded, { fetch: f.fetch, now, lock });
  expect([replay.status, replay.key, f.counters().posts]).toEqual(["unknown", second.key, 2]);
  expect(originalJoin(origin, reloaded)?.status).toBe("unknown");
  expect(f.writes).toBe(writesBefore);
  expect([...f.values.values()][0] === before).toBe(true);
});

// SCRIPTED service/storage, actual new-cohort proof and retained Page signer.
test("new-cohort Page custody retains a proof without its invitation seed across lost reply and reload", async () => {
  const f = fixture("platform:membership@6"), seed = b64url(new Uint8Array(32).fill(82));
  const link = "artroom-invite:" + b64url(utf8(JSON.stringify({ v: 1, service: origin, repository: { directory, membership, rules: ref("rules").scope, destination: ref("destination").scope }, invitation: 1, secret: seed, handle: "@ada", definition: "platform:membership@6" })));
  f.lose();
  const first = await joinInvitation(origin, link, f.storage, { fetch: f.fetch, now, lock });
  expect(first.status).toBe("unknown");
  const kept = JSON.parse([...f.values.values()][0]!);
  expect(Object.keys(kept.prepared.signed.intent.fields).sort()).toEqual(["invitation", "proof"]);
  expect(JSON.stringify(kept.prepared.signed)).not.toContain(seed);
  expect(originalJoin(origin, f.storage)?.key).toBe(first.key);
  const checked = await checkOriginal(origin, f.storage, { fetch: f.fetch, now, lock });
  expect(checked?.status).toBe("verified");
  expect(f.counters()).toEqual({ posts: 1, settles: 1, entries: 1 });
  if (checked?.status === "verified") checked.secret.fill(0);
});
