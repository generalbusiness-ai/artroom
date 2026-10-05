import { describe, expect, test } from "vitest";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { OperationId } from "@generalbusiness/artroom-contract";
import { timeMs } from "@generalbusiness/artroom-derive";
import { C, hosted } from "./hosted.ts";
import { HOLD, at } from "./support.ts";

const RETRY = PROPOSED_BOUNDS.dispatchRetrySeconds;
const DAY = 86_400;

describe("the token ledger at a real scope, through the host port (authority note, sections 5.3, 5.4 and 5.7). The Git host, the gateway's side and the sender of a staging are stand-ins", () => {
  test("T19 through the port: a mint whose reply is lost stays `unknown` and `minting`, and a restart, a day and a listing that shows the token mint nothing again and settle nothing; its own late answer makes it `live`, and only then is its plaintext handed over and the staging sent; a revocation whose reply is lost stays a duty through two further attempts, until its own answer", async () => {
    // The host mints the second token of the staging's first attempt, and its reply is lost.
    const { h, stage, mints } = await hosted((made) => made.host.fault("mint", 2, { fault: "lose-reply" }));
    const { host, vault, stager, s } = h;
    const plain = (id: string) => host.tokens.get(id)!.plaintext;
    const history = async () => JSON.stringify(await s.entries());

    // Token 1 is `live`: its sealed outcome entry holds the host's ID and end time, and the gateway's side holds its plaintext.
    // Token 2 is `minting`, and its mint is `unknown`. The host holds both tokens, and the ledger knows one.
    const head = (await s.head()).seq;
    expect([await h.tokens(), (await s.entries(head - 1)).map((e) => e.input), vault.held.map((t) => [t.token, t.id, t.plaintext === plain(t.id)]), host.listing(), h.driver.holding]).toMatchObject([
      { 1: "live", 2: "minting" },
      [{ type: "outcome", operation: mints[0], result: "confirmed", evidence: { basis: "own-answer", body: { token: "tok-1", ends: host.ends } } }, { type: "outcome", operation: mints[1], result: "unknown", evidence: { basis: "none", body: null } }],
      [[1, "tok-1", true]], ["tok-1", "tok-2"], 0,
    ]);
    // The staging's request is sent only when both of its tokens are `live`: it is recorded and not sent. The ledger keeps no
    // wake-up of its own: the one alarm is the end of the hold.
    expect([stager.sent, await h.seen(stage), await s.alarmAt(), await h.duties()]).toMatchObject([[], { state: "pending", sends: [{ attempt: 1, next: null, sent: null }] }, timeMs(at(HOLD)), ["3:0 head pending", `${stage} stage pending`, `${mints[1]} mint unknown`]]);

    // A restart, a day, and a listing in which the host shows the token. The alarm writes the end of the hold, a timed entry,
    // which is not a staging's: its tokens are not the hold's. Nothing is minted again for that operation, nothing is revoked on
    // a guess, and nothing is settled: the ledger writes no entry and asks for no wake-up.
    await s.restart();
    s.c.clock.now = at(DAY);
    expect([await s.alarm(), await h.surface.effect(), host.listing(), host.asked.map((a) => `${a.call} ${a.token}`), (await s.entries(head + 1)).map((e) => e.input.type), await h.tokens(), stager.sent, await s.alarmAt()]).toEqual([
      true, 0, ["tok-1", "tok-2"], ["mint 1", "mint 2"], ["timed"], { 1: "live", 2: "minting" }, [], null,
    ]);

    // That request's own answer, delivered late, is the one thing that follows. Its entry makes the token `live`, and only after
    // that entry is sealed does the gateway's side hold the plaintext. No entry holds either plaintext.
    stager.answers.set(`${stage}#1`, { result: "confirmed", evidence: { basis: "read", body: { ref: "refs/artroom/staged/1", value: C("a") } } });
    host.fault("revoke", 1, { fault: "lose-reply" });
    expect([await h.redeliver("mint", 2), vault.held.map((t) => [t.token, t.id, t.plaintext === plain(t.id)]), await h.tokens()]).toMatchObject([{ recorded: "written", fact: { seq: head + 2 } }, [[1, "tok-1", true], [2, "tok-2", true]], { 1: "live", 2: "live" }]);
    for (const id of ["tok-1", "tok-2"]) expect(await history()).not.toContain(plain(id));

    // Both tokens are `live`, so the staging is sent, once. Its confirmed read ends the use of both: each is `revoking`, with a
    // revocation by its own ID. The host revokes both. The reply for token 1 is lost: `unknown`, and the token stays `revoking`.
    await h.drain();
    const ended = (await s.entries(head + 3))[0]!;
    const revocations = ended.effects.flatMap((e) => (e.effect === "operation" && e.kind === "revoke" ? [`${ended.seq}:${e.k}` as OperationId] : []));
    expect([stager.sent, revocations.length, host.asked.slice(2).map((a) => `${a.call} ${a.token} ${"id" in a ? a.id : ""}`).sort(), host.listing(), await h.tokens()]).toEqual([
      [`${stage}#1`], 2, ["revoke 1 tok-1", "revoke 2 tok-2"], [], { 1: "revoking", 2: "ended" },
    ]);
    const owed = revocations[0]!;
    expect(await h.seen(owed)).toMatchObject({ state: "pending", operation: { attempts: [{ attempt: 1, outcomes: [{ result: "unknown" }] }, { attempt: 2, outcomes: [] }] } });

    // A revocation that is not confirmed stays a duty. Its second and third attempts are new requests, and the host answers each
    // that no such token is live. That settles nothing about the first: the token is still `revoking`, and the operation is a duty.
    s.c.clock.now = at(DAY + RETRY);
    expect(await s.alarm()).toBe(true);
    s.c.clock.now = at(DAY + 3 * RETRY);
    expect(await s.alarm()).toBe(true);
    await s.restart();
    s.c.clock.now = at(2 * DAY);
    expect([await s.alarm(), await h.surface.effect(), host.asked.filter((a) => a.call === "revoke" && a.token === 1).map((a) => a.attempt), await h.tokens(), (await h.duties()).includes(`${owed} revoke unknown`), await s.alarmAt()]).toEqual([
      false, 0, [1, 2, 3], { 1: "revoking", 2: "ended" }, true, null,
    ]);
    expect((await h.seen(owed)).operation.attempts.map((a) => a.outcomes.map((o) => o.result))).toEqual([["unknown"], ["refused"], ["refused"]]);

    // Only the first request's own answer settles it: the token is `ended`, and the duty is gone. The first `unknown` entry stays.
    expect([await h.redeliver("revoke", 1), await h.tokens(), (await h.seen(owed)).state, (await h.seen(owed)).operation.attempts[0]!.outcomes.map((o) => o.result), (await h.duties()).filter((d) => d.includes("revoke") || d.includes("mint"))]).toMatchObject([
      { recorded: "written" }, { 1: "ended", 2: "ended" }, "settled", ["unknown", "confirmed"], [],
    ]);
  });
});
