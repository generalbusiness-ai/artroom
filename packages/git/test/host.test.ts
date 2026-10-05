import { describe, expect, test } from "vitest";
import type { Effect, Entry, Input, OperationId, ScopeRef } from "@generalbusiness/artroom-contract";
import { TokenDriver, type TokenAnswer, type TokenRequest } from "../src/host.ts";
import { TokenHost, Vault, secret } from "./support/tokens.ts";

/**
 * The entries here are made by hand, as a scope would seal them: no scope
 * judged them. Each holds the one `token` record that the code of `hold@1`
 * writes for an operation (`derive/src/capability/hold.ts`). `TokenHost` and
 * `Vault` are stand-ins of test support. So these tests show the driver as a
 * function of a sealed entry and a host's reply, and nothing about a scope
 * or a host. `scope/test/tokens.test.ts` runs the driver behind a real scope.
 */
const at = { scope: `sc_${"a".repeat(52)}`, inc: `in_${"a".repeat(26)}`, kind: "lane" } as ScopeRef;
const hash = `sha256:${"0".repeat(64)}` as const;
const sealed = (input: unknown, effects: Effect[]) => ({ entry: { v: 1, at, seq: 7, prev: hash, time: "2099-01-01T00:00:00Z", clamped: false, epoch: 0, input: input as Input, uses: [], prepared: [], effects, sends: [] } satisfies Entry, hash });
const token = (state: string, values: Record<string, unknown>, key = 1): Effect => ({ effect: "record", capability: "hold@1", kind: "token", key: [key], state, values });
const staging = { purpose: "staging", root: 1, operation: "7:0", attempt: 1 };
const request = (kind: string, operation: string, effects: Effect[], attempt = 1): TokenRequest => ({ scope: at, operation: operation as OperationId, attempt, owner: "hold@1", kind, origin: sealed({ type: "preparation" }, effects) });
const minting = (operation: string, key = 1) => request("mint", operation, [token("minting", { ...staging, mint: operation, id: null, ends: null, revocation: null }, key)]);
const outcome = (operation: string, result: string, effects: Effect[], attempt = 1) => sealed({ type: "outcome", operation, attempt, owner: "hold@1", kind: "mint", result, evidence: { basis: "own-answer", body: null } }, effects);
const of = (operation: string, attempt = 1) => ({ scope: at, operation: operation as OperationId, attempt });

function made() {
  const host = new TokenHost();
  const vault = new Vault();
  const log: string[] = [];
  const late: [OperationId, number, TokenAnswer][] = [];
  const driver = new TokenDriver({ host, custody: vault, log: (e) => log.push(`${e.step} ${e.event}`) });
  driver.late((operation, attempt, answer) => { late.push([operation, attempt, answer]); return Promise.resolve("offered"); });
  return { host, vault, log, late, driver };
}

describe("the token ledger's driver (authority note, sections 5.3, 5.4 and 5.7). The host, the gateway's side and the sealed entries are stand-ins", () => {
  test("a token's plaintext is in no answer; it is handed to the gateway's side only after the sealed outcome entry made that token `live` with the ID of the reply, and an entry that made it `revoking`, an answer that wrote no entry, and an entry of another result each drop it", async () => {
    const { host, vault, driver } = made();
    const answers = await Promise.all(["7:1", "7:2", "7:3", "7:4", "7:5"].map((operation, i) => driver.send(minting(operation, i + 1))));
    const plain = (n: number) => host.tokens.get(`tok-${n}`)!.plaintext;
    // The answer of a mint is the token's ID and its end time, and nothing else. The driver holds the five plaintexts, and the gateway's side none.
    expect([answers[0], driver.holding, vault.held.length]).toEqual([{ result: "confirmed", evidence: { basis: "own-answer", body: { token: "tok-1", ends: host.ends } } }, 5, 0]);
    for (let n = 1; n <= 5; n++) expect(JSON.stringify(answers)).not.toContain(plain(n));

    const live = (operation: string, id: string, key: number) => token("live", { ...staging, mint: operation, id, ends: host.ends, revocation: null }, key);
    // Sealed, and that entry made the token `live`: handed over, with its ID, its end time and what it is for.
    driver.judged(of("7:1"), outcome("7:1", "confirmed", [live("7:1", "tok-1", 1)]));
    expect([vault.held, driver.holding]).toEqual([[{ scope: at, token: 1, id: "tok-1", ends: host.ends, purpose: "staging", for: { root: 1, operation: "7:0", attempt: 1 }, state: "live", plaintext: plain(1) }], 4]);
    // Sealed, and that entry made the token `revoking`, because its use had ended: dropped. It is never given to anyone.
    driver.judged(of("7:2"), outcome("7:2", "confirmed", [token("revoking", { ...staging, mint: "7:2", id: "tok-2", ends: host.ends, revocation: "9:0" }, 2)]));
    // The answer wrote no entry: a copy, a contradiction or no answer. Dropped.
    driver.judged(of("7:3"), null);
    // An entry that names another ID than the reply gave, and an entry that is not the `confirmed` outcome of that attempt. Dropped.
    driver.judged(of("7:4"), outcome("7:4", "confirmed", [live("7:4", "tok-9", 4)]));
    driver.judged(of("7:5"), outcome("7:5", "refused", [live("7:5", "tok-5", 5)]));
    expect([vault.held.length, driver.holding]).toEqual([1, 0]);
    // What was dropped is gone: the same entry again hands nothing over.
    driver.judged(of("7:2"), outcome("7:2", "confirmed", [live("7:2", "tok-2", 2)]));
    expect(vault.held.length).toBe(1);
  });

  test("a job's read token is a token like any other (section 3.11; plan step 24): the host is asked with the job and its deadline, read from the `token` record of `git-read@1`; its plaintext goes to the gateway's side only when the sealed entry made it `live`; a record of the other owner, or one that names no job, sends nothing", async () => {
    const { host, vault, driver } = made();
    const job = { at, seq: 5, hash };
    const reading = { purpose: "check-read", job, before: "2099-01-01T00:30:00Z" };
    const read = (state: string, values: Record<string, unknown>, key = 1): Effect => ({ effect: "record", capability: "git-read@1", kind: "token", key: [key], state, values: { ...reading, ...values } });
    const asking = (operation: string, effects: Effect[], owner = "git-read@1"): TokenRequest => ({ ...request("mint", operation, effects), owner });
    const first = await driver.send(asking("7:0", [read("minting", { mint: "7:0", id: null, ends: null, revocation: null })]));
    const second = await driver.send(asking("7:1", [read("minting", { mint: "7:1", id: null, ends: null, revocation: null }, 2)]));
    expect([first, host.asked[0], driver.holding]).toEqual([
      { result: "confirmed", evidence: { basis: "own-answer", body: { token: "tok-1", ends: host.ends } } },
      { call: "mint", scope: at, operation: "7:0", attempt: 1, token: 1, purpose: "check-read", for: { job }, before: "2099-01-01T00:30:00Z" }, 2,
    ]);
    const plain = host.tokens.get("tok-1")!.plaintext;
    expect(JSON.stringify([first, second])).not.toContain(plain);
    const sealedBy = (operation: string, effects: Effect[]) => { const o = outcome(operation, "confirmed", effects); return { ...o, entry: { ...o.entry, input: { ...o.entry.input, owner: "git-read@1" } as Input } }; };
    // `live`: handed to the gateway's side, which is the runner's gateway. The runner is given nothing.
    driver.judged(of("7:0"), sealedBy("7:0", [read("live", { mint: "7:0", id: "tok-1", ends: host.ends, revocation: null })]));
    // `revoking`, because the job was decided before the answer came, or the token would outlive the deadline: dropped.
    driver.judged(of("7:1"), sealedBy("7:1", [read("revoking", { mint: "7:1", id: "tok-2", ends: host.ends, revocation: "9:0" }, 2)]));
    expect([vault.held, driver.holding]).toEqual([[{ scope: at, token: 1, id: "tok-1", ends: host.ends, purpose: "check-read", for: { job }, state: "live", plaintext: plain }], 0]);
    // The record is read under the request's own owner. A read token's record under `hold@1`, a record of `git-read@1` that names a hold, and one with no deadline: nothing reaches the host.
    const asked = host.asked.length;
    const none = [
      await driver.send(asking("7:2", [read("minting", { mint: "7:2" })], "hold@1")),
      await driver.send(asking("7:2", [{ effect: "record", capability: "git-read@1", kind: "token", key: [3], state: "minting", values: { ...staging, mint: "7:2" } }])),
      await driver.send(asking("7:2", [read("minting", { mint: "7:2", before: null })])),
    ];
    expect([none.map((a) => a?.result), host.asked.length - asked]).toEqual([["refused", "refused", "refused"], 0]);
    // Its revocation names the ID in the sealed record, as every revocation does.
    const revoked = await driver.send({ ...request("revoke", "9:0", [read("revoking", { mint: "7:1", id: "tok-2", ends: host.ends, revocation: "9:0" }, 2)]), owner: "git-read@1" });
    expect([revoked?.result, host.listing()]).toEqual(["confirmed", ["tok-1"]]);
  });

  test("a request names only what the sealed entry records, and a host's failure is no answer: no record sends nothing; a revocation names the recorded ID; a refusal, a lost request, a lost reply and a reply with no ID or end time each give their one answer; nothing that a host threw is in an answer or a log line", async () => {
    const { host, vault, log, late, driver } = made();
    const leaked = secret();
    const thrown = Object.assign(new Error(`POST https://ci:${leaked}@host.example/tokens?key=${leaked} failed: Authorization: Bearer ${leaked}`), { name: `HostError ${leaked}` });
    const notSent = { result: "refused", evidence: { basis: "own-answer", body: { send: "not-sent", why: "no-token-record" } } };

    // An entry with no `token` record for the operation, one whose record names another operation, and one that is for nothing: nothing reaches the host.
    const none = [
      await driver.send(request("mint", "7:1", [])), await driver.send(request("mint", "7:1", [token("minting", { ...staging, mint: "7:9" })])), await driver.send(request("mint", "7:1", [token("minting", { purpose: "staging", mint: "7:1" })])),
      await driver.send(request("revoke", "8:0", [token("revoking", { ...staging, mint: "7:1", id: null, revocation: "8:0" })])), await driver.send(request("revoke", "8:0", [token("live", { ...staging, mint: "7:1", id: "tok-1", revocation: "8:0" })])),
      await driver.send({ ...minting("7:1"), owner: "platform:destination@1" }),
    ];
    expect([none.slice(0, 5), none[5], host.asked.length, driver.accepts("platform:destination@1", "mint"), driver.accepts("hold@1", "stage")]).toEqual([
      Array(5).fill(notSent), { result: "refused", evidence: { basis: "own-answer", body: { send: "not-sent", why: "not-a-token-operation" } } }, 0, false, false,
    ]);

    // The host refuses: nothing was minted. The request is lost, or its reply is: no answer. A reply with no ID, with no end time, or whose ID is its plaintext: no answer, and nothing of it is kept.
    host.fault("mint", 1, { fault: "refuse" });
    host.fault("mint", 2, { fault: "lose-request", throws: thrown });
    host.fault("mint", 3, { fault: "lose-reply", throws: thrown });
    host.fault("mint", 4, { fault: "replies", reply: { minted: true, ends: host.ends, plaintext: leaked } });
    host.fault("mint", 5, { fault: "replies", reply: { minted: true, id: "tok-x", ends: "soon", plaintext: leaked } });
    host.fault("mint", 6, { fault: "replies", reply: { minted: true, id: leaked, ends: host.ends, plaintext: leaked } });
    // A reply with an ID, an end time and no plaintext is an answer: the ledger then knows the ID, and nobody holds a plaintext.
    host.fault("mint", 7, { fault: "replies", reply: { minted: true, id: "tok-7", ends: host.ends } });
    const minted = [];
    for (let n = 1; n <= 7; n++) minted.push(await driver.send(minting(`7:${n}`, n)));
    expect([minted, driver.holding]).toEqual([[
      { result: "refused", evidence: { basis: "own-answer", body: { send: "refused", why: "host-refused" } } }, null, null, null, null, null,
      { result: "confirmed", evidence: { basis: "own-answer", body: { token: "tok-7", ends: host.ends } } },
    ], 0]);

    // The reply that was lost is that request's own answer. Delivered later, it is offered to the scope as that attempt's answer, and its plaintext waits for the sealed entry.
    const lost = host.reply.get("mint 3")!;
    expect([await driver.answered(lost.ask, lost.reply), late, driver.holding]).toEqual(["offered", [["7:3", 1, { result: "confirmed", evidence: { basis: "own-answer", body: { token: "tok-1", ends: host.ends } } }]], 1]);

    // A revocation is sent for the ID in the sealed record. Revoked: confirmed. No such token is live: refused, by the host's own answer. A failed call: no answer.
    const revoking = (operation: string, id: string, attempt = 1) => request("revoke", operation, [token("revoking", { ...staging, mint: "7:3", id, ends: host.ends, revocation: operation })], attempt);
    host.fault("revoke", 1, { fault: "lose-reply", throws: thrown });
    const revoked = [await driver.send(revoking("8:0", "tok-1")), await driver.send(revoking("8:0", "tok-1", 2)), await driver.send(revoking("8:1", "tok-404"))];
    const gone = { result: "refused", evidence: { basis: "own-answer", body: { token: "tok-1", send: "refused", why: "not-live" } } };
    expect([revoked, host.asked.slice(-3).map((a) => [a.call, "id" in a && a.id, a.attempt]), host.listing()]).toEqual([
      [null, gone, { ...gone, evidence: { basis: "own-answer", body: { ...gone.evidence.body, token: "tok-404" } } }], [["revoke", "tok-1", 1], ["revoke", "tok-1", 2], ["revoke", "tok-404", 1]], ["tok-2", "tok-3", "tok-4", "tok-5"],
    ]);
    // Of the tokens that are still live at the host, three are those whose replies were out of form. The driver kept nothing of them,
    // so no ledger can name them: each mint is `unknown`, and only its own answer may follow (I3 deltas, entry ET5). The fourth is
    // the one with no plaintext, which the ledger knows by its ID.
    // The lost reply of the first revocation, delivered later: that request's own answer, confirmed.
    const answer = host.reply.get("revoke 1")!;
    await driver.answered(answer.ask, answer.reply);
    expect(late[1]).toEqual(["8:0", 1, { result: "confirmed", evidence: { basis: "own-answer", body: { token: "tok-1" } } }]);

    // Nothing that the host threw or replied out of form is anywhere the driver writes: its answers, what it offered late, and its log, which holds fixed words.
    const written = JSON.stringify([none, minted, revoked, late, log, vault.held]);
    for (const text of [leaked, "host.example", "HostError", "Bearer"]) expect(written).not.toContain(text);
    expect(log).toEqual(["mint host-failed", "mint host-failed", "mint no-answer", "mint no-answer", "mint no-answer", "revoke host-failed"]);
  });
});
