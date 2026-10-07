import { expect, test } from "vitest";
import type { OperationId } from "@generalbusiness/artroom-contract";
import { CredentialStore, type ExpectedRevocation, type MintedCredential } from "../src/credential-store.ts";
import { START, at, found, reader } from "./support.ts";

// The credential IDs, mint references and replies are written by hand: no
// host runs and no scope judged a mint. Custody uses real Durable Object
// SQLite storage; the scope's test authority and readers are stand-ins.
const minted = (mint: string, plaintext = "private-provider-credential"): MintedCredential => ({ id: "provider-token-1", mint: mint as OperationId, attempt: 1, ends: at(60), plaintext });
const revoking = (revoke: string, credential: MintedCredential): ExpectedRevocation => ({ revoke: revoke as OperationId, attempt: 1, mint: credential.mint, mintAttempt: credential.attempt, id: credential.id });

test("private custody retains one mint's own reply and secret across a real object restart, uses only its judged live credential, and writes nothing into public state, history or log", async () => {
  const scope = await found();
  const credential = minted("1:0");
  const second = { ...minted("2:0", "private-provider-second"), id: "provider-token-2", ends: START };
  const revokeFirst = revoking("3:0", credential);
  const revokeSecond = revoking("4:0", second);
  const metadata = ({ mint, attempt, id, ends }: MintedCredential) => ({ mint, attempt, id, ends });
  const before = { head: await scope.head(), summary: await scope.summary(), history: await scope.sealed() };
  expect(await scope.inside((state) => {
    const store = new CredentialStore(state.storage.sql, () => scope.at);
    return [store.put(credential), store.put(second), store.expectRevoke(revokeFirst), store.expectRevoke(revokeSecond), store.judged(second.mint, 1, null), store.live(credential.mint, 1, START), store.reply(credential.mint, 1)];
  })).toEqual(["stored", "stored", true, true, false, null, { id: credential.id, ends: credential.ends }]);

  await scope.restart();
  expect(await scope.inside((state) => {
    const store = new CredentialStore(state.storage.sql, () => scope.at);
    const retained = store.read(credential.mint, 1);
    const reply = store.reply(credential.mint, 1)!;
    const firstPage = store.pending(null, 1);
    const nextPage = store.pending(firstPage.items[0]!, 1);
    const revokePage = store.revocations(null, 1);
    const revokeNext = store.revocations(revokePage.items[0]!, 1);
    const invalidLimit = store.pending(null, -2);
    const judged = store.judged(credential.mint, 1, reply);
    const live = store.live(credential.mint, 1, START);
    const otherAttempt = store.live(credential.mint, 2, START);
    const isolated = new CredentialStore(state.storage.sql, () => ({ ...scope.at, inc: "in_aaaaaaaaaaaaaaaaaaaaaaaaaa" as never }));
    const otherIncarnation = [isolated.read(credential.mint, 1), isolated.pending(null, 1), isolated.revocations(null, 1), isolated.expectRevoke(revokeFirst)];
    const revoked = store.revoked(second.mint, 1);
    return { retained, reply, firstPage, nextPage, revokePage, revokeNext, judged, live, otherAttempt, otherIncarnation, revoked, remaining: store.pending(null, 1), revokeRemaining: store.revocations(null, 1), invalidLimit };
  })).toEqual({
    retained: { ...credential, state: "held" }, reply: { id: credential.id, ends: credential.ends }, judged: true,
    firstPage: { items: [metadata(credential)], more: true }, nextPage: { items: [metadata(second)], more: false },
    revokePage: { items: [revokeFirst], more: true }, revokeNext: { items: [revokeSecond], more: false },
    live: { ...credential, state: "live" }, otherAttempt: null, otherIncarnation: [null, { items: [], more: false }, { items: [], more: false }, false],
    revoked: true, remaining: { items: [], more: false }, invalidLimit: { items: [], more: false },
    revokeRemaining: { items: [revokeFirst], more: false },
  });

  const after = { head: await scope.head(), summary: await scope.summary(), history: await scope.sealed() };
  const log = await scope.inside((_state, instance) => (instance as { log(reader: unknown): unknown }).log(reader));
  expect(after).toEqual(before);
  expect(JSON.stringify({ ...after, log })).not.toContain(credential.plaintext);
  expect(await scope.inside((state) => {
    const store = new CredentialStore(state.storage.sql, () => scope.at);
    return { revoked: store.revoked(credential.mint, 1), after: store.read(credential.mint, 1), evidence: store.reply(credential.mint, 1) };
  })).toEqual({ revoked: true, after: { ...credential, plaintext: null, state: "revoked" }, evidence: { id: credential.id, ends: credential.ends } });
  await scope.restart();
  expect(await scope.inside((state) => new CredentialStore(state.storage.sql, () => scope.at).revocations(null, 1))).toEqual({ items: [], more: false });
});

test("conflicting mint identities cannot replace custody; expiry and rejected custody drop never claim provider revocation or restore a secret", async () => {
  const scope = await found();
  const credential = minted("1:0");
  const other = { ...minted("2:0"), id: "provider-token-2" };
  const revoke = revoking("3:0", credential);
  expect(await scope.inside((state) => {
    const store = new CredentialStore(state.storage.sql, () => scope.at);
    const stored = store.put(credential);
    const sameId = store.put({ ...credential, mint: "2:0" as OperationId });
    const sameMint = store.put({ ...credential, id: "provider-token-2" });
    const storedOther = store.put(other);
    const wrongId = store.expectRevoke({ ...revoke, id: other.id });
    const expected = store.expectRevoke(revoke);
    const repeated = store.expectRevoke(revoke);
    const conflict = store.expectRevoke(revoking("3:0", other));
    const judged = store.judged(credential.mint, 1, { id: credential.id, ends: credential.ends });
    const beforeEnd = store.live(credential.mint, 1, at(59));
    const expired = store.live(credential.mint, 1, credential.ends);
    const stillLive = store.read(credential.mint, 1)?.state;
    const rejected = store.judged(credential.mint, 1, null);
    const repeat = store.put(credential);
    const restored = store.judged(credential.mint, 1, { id: credential.id, ends: credential.ends });
    return { stored, sameId, sameMint, storedOther, wrongId, expected, repeated, conflict, revocations: store.revocations(null, 1), judged, beforeEnd, expired, stillLive, rejected, repeat, restored, after: store.read(credential.mint, 1), reply: store.reply(credential.mint, 1) };
  })).toEqual({
    stored: "stored", sameId: "conflict", sameMint: "conflict", judged: true, beforeEnd: { ...credential, state: "live" },
    storedOther: "stored", wrongId: false, expected: true, repeated: true, conflict: false, revocations: { items: [revoke], more: false },
    expired: null, stillLive: "live", rejected: false, repeat: "repeat", restored: false,
    after: { ...credential, plaintext: null, state: "live" }, reply: { id: credential.id, ends: credential.ends },
  });
});
