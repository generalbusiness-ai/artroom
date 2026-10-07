import { describe, expect, test } from "vitest";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { Intent, ReadRequest, ScopeId, Sealed, SignedReadName } from "@generalbusiness/artroom-contract";
import { b64url, canonicalBytes, intentDigest, scopeIdOf, signIntent, signRead } from "@generalbusiness/artroom-bytes";
import { secretSigner, signedLogReader, signedReader } from "@generalbusiness/artroom-client";
import { keys, type Actor } from "@generalbusiness/artroom-derive/testing";
import { REGISTER, platform } from "@generalbusiness/artroom-platform";
import { httpSource, verify } from "@generalbusiness/artroom-replay";
import { net } from "../src/testing.ts";
import { soon } from "./net.ts";
import { Platform, rita, routed } from "./repository.ts";
import { platformNet } from "./worker.ts";

const { paul, vic } = keys;
const SERVICE = "https://scopes.test";

/** A register that `who` founds by an `install` that names rita a founder, as an operator's key would. */
async function installed(who: Actor): Promise<Platform> {
  const install: Intent = { v: 1, to: null, actor: who.key, kind: "install", on: null, expected: {}, fields: { host: "git.example", namespace: "artroom", policy: "keys", founders: [rita.key] }, idempotencyKey: crypto.randomUUID(), notAfter: soon(60) };
  const R = new Platform(scopeIdOf({ v: 1, kind: "register", definition: REGISTER, creator: null, cause: intentDigest(install), ordinal: 0 }));
  expect(await R.stub.found(signIntent(install, who.secret), REGISTER)).toMatchObject({ answer: "accepted" });
  return R;
}

/** One read over the Worker's routes, with the real read sessions as deployed under a TEST SECRET: a reader with no session and no signed read reads nothing. */
async function get(path: string, authorization?: string): Promise<{ status: number; body: { ok: boolean; reason?: string; value?: unknown } }> {
  platformNet.sessions = true;
  platformNet.secret = b64url(new Uint8Array(32).fill(9));
  try {
    const response = await routed(`${SERVICE}/v1/scopes/${path}`, authorization === undefined ? {} : { headers: { authorization } });
    return { status: response.status, body: await response.json() };
  } finally {
    platformNet.sessions = false;
    platformNet.secret = null;
  }
}

/** The header of one signed read by `who`, made by the client. */
const signed = (who: Actor, scope: ScopeId, read: SignedReadName, arg: string) => signedReader(secretSigner(who.secret), scope, read, arg, { now: () => Date.parse(net.clock.now) });
const seqs = (body: { value?: unknown }) => (body.value as readonly Sealed[]).map((sealed) => sealed.entry.seq);

// Invariant: with no session, a scope answers a signed read only to a key that signed one of its entries within the intent window,
// and only its summary, its genesis and that key's own entries. Every other read, scope, key and time is `forbidden`.
// Each scope here is a real register in the namespace `PLATFORM`, under the deployed class's readers: the real read sessions,
// under a TEST SECRET. No Git host is wired: the claim's creation is recorded and nothing is sent.
describe("signed reads on real registers (the planner's decisions 61cc5e50 and c6499e91)", () => {
  test("the install's key reads the register's summary, genesis and own entries with no session; a founder's claim key reads its own; every other read, another scope and a key that signed nothing are forbidden", async () => {
    net.hold = net.deaf = null;
    const R = await installed(paul);
    const found = await R.intent(rita, "found", { expected: await R.expected({ register: 0 }), fields: { branch: "main", founderHandle: "@rita", recoveryKey: keys.sam.key } });
    expect(await R.stub.submit(found, [])).toMatchObject({ answer: "accepted", receipt: { fact: { seq: 1 } } });

    // Control: the same reads with no header at all are forbidden, as the deployed class answers a reader with no session.
    expect([(await get(R.name)).status, (await get(`${R.name}/history`)).status]).toEqual([403, 403]);
    // The install's key: the summary, and a history that holds the genesis and nothing that another key signed.
    const summary = await get(R.name, await signed(paul, R.name, "summary", "summary"));
    expect([summary.status, (summary.body.value as { scope: { kind: string } }).scope.kind]).toEqual([200, "register"]);
    const mine = await get(`${R.name}/history`, await signed(paul, R.name, "history", "0"));
    expect([mine.status, seqs(mine.body)]).toEqual([200, [0]]);
    expect((await get(`${R.name}/entries/0`, await signed(paul, R.name, "entry", "0"))).status).toBe(200);
    // The founder's claim key: the genesis and its own claim. The install's key may not read the claim's entry.
    const claims = await get(`${R.name}/history`, await signed(rita, R.name, "history", "0"));
    expect([claims.status, seqs(claims.body)]).toEqual([200, [0, 1]]);
    expect([(await get(`${R.name}/entries/1`, await signed(rita, R.name, "entry", "1"))).status, (await get(`${R.name}/entries/1`, await signed(paul, R.name, "entry", "1"))).body]).toEqual([200, { ok: false, reason: "forbidden" }]);

    // Every other read, and a read under a signature of another read or argument, is forbidden.
    expect([
      (await get(`${R.name}/items/claim`, await signed(paul, R.name, "summary", "summary"))).status,
      (await get(`${R.name}/outbox`, await signed(paul, R.name, "summary", "summary"))).status,
      (await get(`${R.name}/entries/1`, await signed(rita, R.name, "entry", "0"))).status,
      (await get(R.name, await signed(paul, R.name, "history", "0"))).status,
    ]).toEqual([403, 403, 403, 403]);
    // Another scope: a register that vic installed. Paul signed nothing there, and a signature for R is not one for it.
    const S = await installed(vic);
    expect([(await get(S.name, await signed(paul, S.name, "summary", "summary"))).status, (await get(S.name, await signed(paul, R.name, "summary", "summary"))).status, (await get(S.name, await signed(vic, S.name, "summary", "summary"))).status]).toEqual([403, 403, 200]);
    // A second register that paul installed: he may read it, and his signature for R is still not one for it.
    const P = await installed(paul);
    expect([(await get(P.name, await signed(paul, R.name, "summary", "summary"))).status, (await get(P.name, await signed(paul, P.name, "summary", "summary"))).status]).toEqual([403, 200]);
    // A key that signed nothing in R; and a request that names paul's key and is signed by vic's.
    expect((await get(R.name, await signed(vic, R.name, "summary", "summary"))).body).toEqual({ ok: false, reason: "forbidden" });
    const forged = signRead({ v: 1, to: R.name, actor: paul.key, read: "summary", arg: "summary", notAfter: soon(60) }, vic.secret);
    expect((await get(R.name, `Signed ${b64url(canonicalBytes(forged))}`)).status).toBe(403);

    // Replay over the log by a signed read: the install's key reads the genesis only, so the report is incomplete, and says so.
    platformNet.sessions = true;
    platformNet.secret = b64url(new Uint8Array(32).fill(9));
    try {
      const { report, why } = await verify(httpSource(SERVICE, { fetch: routed, reader: signedLogReader(secretSigner(paul.secret), { now: () => Date.parse(net.clock.now) }) }), { mode: "replay", scope: R.name, platform, grants: "proven" });
      expect([report.result, report.coverage.map((c) => [c.scope.scope, c.from, c.through]), why]).toEqual(["incomplete", [[R.name, 0, 0]], "the history could not be read through its head, entry 1: the source holds no entry 1 of " + R.name]);
    } finally {
      platformNet.sessions = false;
      platformNet.secret = null;
    }
  });

  test("a signed read is refused past its notAfter, with a notAfter further ahead than an intent may live, and once the key's last entry is older than the window", async () => {
    net.hold = net.deaf = null;
    const R = await installed(paul);
    const late = await signed(paul, R.name, "summary", "summary");
    // Ahead by one second more than an intent may live: signed with the bytes package, since the client signs no such read.
    const far: ReadRequest = { v: 1, to: R.name, actor: paul.key, read: "summary", arg: "summary", notAfter: soon(PROPOSED_BOUNDS.intentLifetimeSeconds + 1) };
    const farthest = `Signed ${b64url(canonicalBytes(signRead(far, paul.secret)))}`;
    const edge = `Signed ${b64url(canonicalBytes(signRead({ ...far, notAfter: soon(PROPOSED_BOUNDS.intentLifetimeSeconds) }, paul.secret)))}`;
    expect([(await get(R.name, farthest)).status, (await get(R.name, edge)).status, (await get(R.name, late)).status]).toEqual([403, 200, 200]);
    // Rita claims ten minutes after the install.
    net.clock.now = soon(600);
    expect(await R.stub.submit(await R.intent(rita, "found", { expected: await R.expected({ register: 0 }), fields: { branch: "main", founderHandle: "@rita", recoveryKey: keys.sam.key } }), [])).toMatchObject({ answer: "accepted" });
    // The read signed before is past its notAfter.
    expect((await get(R.name, late)).status).toBe(403);
    // Six minutes later the install is older than the window, and the claim is not: paul is refused, and rita reads.
    net.clock.now = soon(360);
    expect([(await get(R.name, await signed(paul, R.name, "summary", "summary"))).status, (await get(R.name, await signed(rita, R.name, "summary", "summary"))).status]).toEqual([403, 200]);
  });
});
