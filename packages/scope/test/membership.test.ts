import { describe, expect, test } from "vitest";
import type { Entry, Observation, ObservationUse } from "@generalbusiness/artroom-contract";
import { MEMBERSHIP, actionsIn } from "@generalbusiness/artroom-platform";
import { grantOf } from "@generalbusiness/artroom-derive/testing";
import { later, net, soon } from "./net.ts";
import { notify, office, repository, rita, settle, una, vic, type Platform } from "./repository.ts";
import { reader } from "./support.ts";
import { platformNet } from "./worker.ts";

// Every scope here is on real Durable Object storage, in the namespace `PLATFORM`, under the PRODUCTION authority: no test authority
// and no scripted membership. Four things are stand-ins, as `repository.ts` lists them: three rules of membership, the office that
// creates it, the lane that sends a notice, and the test readers.

/** The freshness proof that an entry retains in its grant: the observation, as the scope recorded it, and how it used it. */
const proof = (entry: Entry): ObservationUse & { observation: Observation } => {
  if (entry.input.type !== "act" || !entry.input.authority[0]) throw new Error("the entry records no grant");
  return entry.input.authority[0].fresh as ObservationUse & { observation: Observation };
};
const head = async (node: Platform) => (await node.summary()).at;
const said = (answer: { answer: string; reason?: string; name?: string }) => [answer.answer, answer.reason ?? null, answer.name ?? null];

describe("authority on real scopes, under the production wiring (authority note, sections 3.1, 3.3, 3.5 and 12.1.3; the contract's section 16.1)", () => {
  // The plan's T11 (the proof plan's V7, I3's part), with the inbox of step 11 and the plan's T40.
  test("an act at an inbox is judged on a real observation of the signing key, read from the membership scope that the inbox's genesis records; after the key is revoked the next act on a fresh read is refused, and another member's key is not", async () => {
    const { M, ritasInbox, unasInbox, unasKey } = await repository();
    const m = await M.at();

    // Step 11: membership created each inbox by the entry that made its member active, with the membership scope in the body of the
    // creation. The inbox's genesis records it, and its owner is the member.
    const genesis = (await unasInbox.entries())[0]!.input as Extract<Entry["input"], { type: "genesis" }>;
    expect([(genesis.message!.body as { membership: unknown }).membership, (await unasInbox.summary()).value.status, (await unasInbox.item(0)).parties["owner"], (await ritasInbox.item(0)).parties["owner"]])
      .toEqual([m, "active", { membership: m, member: "@una" }, { membership: m, member: "@rita" }]);

    // Membership's own acts were judged on its own head (section 3.3): `invite-member` records rita's grant, built from the state
    // before the entry, with the entry's time as `at` and the use `fresh`. `seat` and `join` were judged by their rules, on no grant.
    const acts = (await M.entries()).flatMap((entry) => (entry.input.type === "act" ? [{ entry, kind: entry.input.signed.intent.kind, grants: entry.input.authority.length }] : []));
    expect(acts.map(({ kind, grants }) => [kind, grants])).toEqual([["seat", 0], ["first-key", 0], ["invite-member", 1], ["join", 0]]);
    const invited = acts[2]!.entry;
    expect(proof(invited)).toMatchObject({ observation: { of: m, head: { seq: invited.seq - 1 }, key: rita.key, keyState: "active", member: "@rita", role: "admin", within: { membership: m }, at: invited.time, definition: MEMBERSHIP }, use: "fresh", prior: null });

    // The plan's T40: an inbox records one notice for an advisory, with its source by the real rule P22, and nothing for its repeat.
    const first = await notify(unasInbox, { reason: "mentioned", item: 4 });
    const second = await notify(unasInbox, { reason: "assigned" });
    expect([first.answer.answer, (await unasInbox.stub.deliver(first.envelope)), (await unasInbox.summary()).value.counts.find(([type, state]) => type === "notice" && state === "unread")?.[2]])
      .toEqual(["recorded", first.answer, 2]);
    const [one, two] = [(first.answer as { fact: { seq: number } }).fact.seq, (second.answer as { fact: { seq: number } }).fact.seq];
    expect((await unasInbox.item(one)).values["source"]).toEqual({ scope: first.envelope.from.at.scope, incarnation: first.envelope.from.at.inc, seq: 4, hash: first.envelope.from.hash });

    // una marks her notice read. The inbox read her key's standing from M before the turn, and the entry retains that observation: of
    // M with its incarnation, at M's head, with the actions of her role there, and `within` as the repository.
    const marks = async (who: typeof una, kind: string, notice: number) => unasInbox.act(who, kind, { on: notice, expected: await unasInbox.expected({ on: notice, inbox: 0 }) });
    expect(said(await marks(una, "mark-read", one))).toEqual(["accepted", null, null]);
    const read = proof(await unasInbox.last());
    expect(read).toMatchObject({ observation: { of: m, head: await head(M), key: una.key, keyState: "active", member: "@una", memberState: "active", role: "member", actions: actionsIn("member"), within: { membership: m } }, use: "fresh", prior: null });

    // No grant that a caller presents is read. vic's key is no member's, and a grant written by hand for it changes nothing: M answers
    // that it does not know the key. rita is an admin and holds `inbox.own`, so she passes check 9, and only the owner marks a notice.
    expect(said(await unasInbox.act(vic, "mark-read", { on: two, expected: await unasInbox.expected({ on: two, inbox: 0 }) }, [grantOf(vic, await unasInbox.at(), ["inbox.own"])]))).toEqual(["refused", "unauthorized", null]);
    expect(said(await marks(rita, "mark-read", two))).toEqual(["refused", "guard-failed", null]);

    // rita revokes una's key. That is one entry in membership, judged on rita's own standing, and it is sent to no inbox.
    const sent = (await unasInbox.entries()).length;
    await M.did(rita, "revoke-key", { on: unasKey, expected: await M.expected({ on: unasKey, roster: 0, member: (await M.item(unasKey)).refs["member"] as number }), fields: { as: "retired" } });
    await settle(M, unasInbox);
    expect([(await M.item(0)).revision > 0, await M.stub.observe({ of: m, key: una.key })]).toMatchObject([true, { keyState: "retired", head: await head(M) }]);

    // Inside the window the inbox still holds the observation that it read before the revocation, and may use it: 300 seconds is a
    // stated limit on how stale a judgment may be (section 3.3). The entry records the reuse, and the entry before it.
    await later(10);
    expect(said(await marks(una, "dismiss", one))).toEqual(["accepted", null, null]);
    expect(proof(await unasInbox.last())).toMatchObject({ observation: read.observation, read: read.read, use: "reused", prior: { seq: sent - 1 } });

    // At the window the observation is outside it. The inbox reads again, M answers that the key is retired, and the act is refused.
    // Nothing is written. The revoked answer then stays for the run: the next act is refused too, whatever its age.
    await later(290);
    expect([said(await marks(una, "mark-read", two)), said(await marks(una, "dismiss", two)), (await unasInbox.entries()).length]).toEqual([["refused", "unauthorized", null], ["refused", "unauthorized", null], sent + 1]);
    // After a restart the inbox holds no observation and reads again: still refused. Another member's key is untouched, in its own inbox.
    await unasInbox.restart();
    expect(said(await marks(una, "mark-read", two))).toEqual(["refused", "unauthorized", null]);
    const mine = await notify(ritasInbox, { reason: "mentioned" });
    const notice = (mine.answer as { fact: { seq: number } }).fact.seq;
    expect(said(await ritasInbox.act(rita, "mark-read", { on: notice, expected: await ritasInbox.expected({ on: notice, inbox: 0 }) }))).toEqual(["accepted", null, null]);
    expect(proof(await ritasInbox.last())).toMatchObject({ observation: { key: rita.key, head: await head(M) }, use: "fresh" });
  });

  // The whole-scope rule, on real scopes (the contract's section 6.1; witness 18.39, case 3). The control of the test above.
  test("a version of membership that lacks a rule founds nothing: with the platform package's rules alone, as in production, and with one rule missing that the genesis does not meet, the creation is not decided, and the office keeps the duty until a runtime has every rule", async () => {
    /** What became of the office's one request, and whether the scope that it asks for exists. */
    const created = async (O: Platform, M: Platform) => {
      const duties = await O.stub.outbox(reader);
      return [(await M.stub.summary(reader)).ok, duties.ok && duties.value.map((duty) => [duty.class, duty.result, duty.attempts.map((attempt) => attempt.answer)])];
    };
    try {
      // The production wiring: the platform package has no rule for three marks of membership's data. The office is a declared
      // definition, and is founded. Its `create` reaches the object that the seed names, which has no definition that it can run
      // whole: transport's answer is `retry`, nothing is recorded, and the scope does not exist.
      platformNet.standIns = false;
      const production = await office();
      expect(await created(production.O, production.M)).toEqual([false, [["request", null, ["retry"]]]]);
      // One rule missing, `handle-form`, whose mark stands in two acts and not in the genesis act. The genesis act could be derived,
      // and the scope would then run under a part of its version. It is not founded either.
      [platformNet.standIns, platformNet.without] = [true, "handle-form"];
      const { O, M } = await office();
      expect(await created(O, M)).toEqual([false, [["request", null, ["retry"]]]]);
      // The same creation, sent again to a runtime that has a rule for every mark, is recorded.
      platformNet.without = null;
      net.clock.now = soon(600);
      await settle(O, M);
      expect((await M.summary()).value.status).toBe("active");
    } finally {
      [platformNet.standIns, platformNet.without] = [true, null];
    }
  });

  test("a membership scope that its creator has not confirmed answers no observation, and an active one answers only a request of the contract's form, as itself", async () => {
    const { O, M } = await office((envelope) => envelope.message.class === "control");
    // The genesis is written and the office holds its result, and the confirmation is held: the scope is provisional (case e).
    expect([(await M.summary()).value.status, await M.stub.observe({ of: await M.at(), key: rita.key })]).toEqual(["provisional", null]);
    net.hold = null;
    net.clock.now = soon(600);
    await settle(O, M);
    expect(await M.stub.observe({ of: await M.at(), key: rita.key })).toMatchObject({ keyState: "unknown", actions: [] });
    // A request of another form than the contract gives, and one that names another incarnation, get no answer.
    expect([await M.stub.observe({ of: await M.at(), key: rita.key, asker: "me" }), await M.stub.observe({ of: await O.at(), key: rita.key }), await O.stub.observe({ of: await O.at(), key: rita.key })]).toEqual([null, null, null]);
  });
});
