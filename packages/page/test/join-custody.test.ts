import { expect, test } from "vitest";
import type { Entry, Receipt, ScopeRef, SignedIntent } from "@generalbusiness/artroom-contract";
import { b64url, entryHash, intentDigest, newIncarnation, scopeIdOf, textDigest, utf8, verifySignedIntent } from "@generalbusiness/artroom-bytes";
import type { Fetch } from "@generalbusiness/artroom-client";
import { checkOriginal, joinInvitation, originalJoin, type JoinStorage } from "../src/join-custody.ts";

// Actual signer/codec/HTTP adapter with SCRIPTED storage, locking and service
// answers. No native enrollment, grants, deployment or provider runs here.
const origin = "https://page-custody.test";
const ref = (kind: ScopeRef["kind"]): ScopeRef => ({ scope: scopeIdOf({ v: 1, kind, definition: "platform:membership@2", creator: null, cause: textDigest("TEST custody " + kind), ordinal: 0 }), kind, inc: newIncarnation(new Uint8Array(16).fill(7)) });
const directory = ref("directory"), membership = ref("membership");
const invitation = (n = 1, secret = "TEST invitation secret") => "artroom-invite:" + b64url(utf8(JSON.stringify({ v: 1, service: origin, repository: { directory, membership, rules: ref("rules").scope, destination: ref("destination").scope }, invitation: n, secret, handle: "@ada", definition: "platform:membership@2" })));
const lock = { run: async <T>(work: () => Promise<T>) => work() };
const now = () => Date.parse("2026-10-12T00:00:00Z");
function fixture() {
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
      receipt = { fact: { at: membership, seq: 5, hash: entryHash(entry) }, definition: "platform:membership@2", intent: intentDigest(signed.intent), effects: [], sends: [], epoch: 0 };
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
  return { storage, fetch, counters: () => ({ posts, settles, entries }), lose: () => { lost = true; }, missing: () => { missing = true; }, badEntry: () => { badEntry = true; }, refuse: () => { refused = true; }, values };
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
