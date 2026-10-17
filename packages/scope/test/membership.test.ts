import { runInDurableObject } from "cloudflare:test";
import { describe, expect, test } from "vitest";
import type { Entry, Observation, ObservationUse } from "@generalbusiness/dap-contract";
import { canonicalize, isScopeRef, textDigest } from "@generalbusiness/artroom-bytes";
import { grantFrom } from "@generalbusiness/dap-derive";
import { MEMBERSHIP, actionsIn, platform } from "@generalbusiness/dap-platform";
import { grantOf } from "@generalbusiness/dap-derive/testing";
import { MemorySource, TRUSTS, httpSource, platformCode, verify, type MemoryScope } from "@generalbusiness/artroom-replay";
import { later, net, soon } from "./net.ts";
import { copied, inboxConfirmation, notify, office, repository, rewritten, rita, routed, settle, una, vic, type Platform } from "./repository.ts";
import { reader } from "./support.ts";
import { platformNet } from "./worker.ts";

// Every scope here is on real Durable Object storage, in the namespace `PLATFORM`, under the PRODUCTION authority: no test authority
// and no scripted membership, with the platform package's own rules for membership and no other. Three things are stand-ins, as
// `repository.ts` lists them: the office that creates it, the lane that sends a notice, and the test readers.

/** The freshness proof that an entry retains in its grant: the observation, as the scope recorded it, and how it used it. */
const proof = (entry: Entry): ObservationUse & { observation: Observation } => {
  if (entry.input.type !== "act" || !entry.input.authority[0]) throw new Error("the entry records no grant");
  return entry.input.authority[0].fresh as ObservationUse & { observation: Observation };
};
const head = async (node: Platform) => (await node.summary()).at;
const said = (answer: { answer: string; reason?: string; name?: string }) => [answer.answer, answer.reason ?? null, answer.name ?? null];

describe("authority on real scopes, under the production wiring (authority note, sections 3.1, 3.3, 3.5 and 12.1.3; the contract's section 16.1)", () => {
  // The plan's T11 (the proof plan's V7, I3's part), with the inbox of step 11 and the plan's T40.
  test("an act at an inbox is judged on a real observation of the signing key, read from the membership scope that the inbox's genesis records; after the key is revoked the next act on a fresh read is refused, and another member's key is not", async ({ task }) => {
    const { O, M, ritasInbox, unasInbox, unasKey } = await repository();
    const m = await M.at();

    // Step 11: membership created each inbox by the entry that made its member active, with the membership scope in the body of the
    // creation. The inbox's genesis records it, and its owner is the member.
    const genesis = (await unasInbox.entries())[0]!.input as Extract<Entry["input"], { type: "genesis" }>;
    const inbox = await unasInbox.summary();
    if (inbox.value.status !== "active") {
      // Failure-only diagnosis: record bounded protocol metadata, never bodies,
      // signing keys, invitation fields or raw errors. The active assertion stays.
      const scopes = await Promise.all([O, M, ritasInbox, unasInbox].map(async node => {
        const summary = await node.summary(), outbox = await node.stub.outbox(reader);
        const sealed = await node.sealed();
        const alarm = await runInDurableObject(node.object, (_instance, state) => state.storage.getAlarm());
        return { scope: summary.value.scope, head: summary.at, status: summary.value.status, alarm,
          outboxItems: outbox.ok ? outbox.value.slice(0, 8).map(outboxId => ({ outboxId: outboxId.outboxId, class: outboxId.class, held: outboxId.held, acknowledged: outboxId.acknowledged, result: outboxId.result,
            attemptCount: outboxId.attempts.length, attempts: outboxId.attempts.slice(-4).map(attempt => ({ at: attempt.at, answer: attempt.answer })) })) : null,
          outboxCount: outbox.ok ? outbox.value.length : null,
          entries: sealed.slice(-4).map(({ entry, hash }) => ({ seq: entry.seq, hash, type: entry.input.type,
            ...(entry.input.type === "delivery" ? { class: entry.input.message.class } : {}) })) };
      }));
      Object.assign(task.meta, { inboxConfirmationFailure: { observed: { scope: inbox.value.scope, head: inbox.at, status: inbox.value.status }, clock: net.clock.now, scopes } });
    }
    expect([(genesis.message!.body as { membership: unknown }).membership, inbox.value.status, (await unasInbox.item(0)).parties["owner"], (await ritasInbox.item(0)).parties["owner"]])
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
  test("a version of membership that lacks a rule founds nothing: with one rule missing, of the genesis or of a later act that the genesis does not meet, the creation is not decided, and the office keeps the duty until a runtime has every rule, as the platform package's rules alone do", async () => {
    /** What became of the office's one request, and whether the scope that it asks for exists. */
    const created = async (O: Platform, M: Platform) => {
      const outboxItems = await O.stub.outbox(reader);
      return [(await M.stub.summary(reader)).ok, outboxItems.ok && outboxItems.value.map((outboxId) => [outboxId.class, outboxId.result, outboxId.attempts.map((attempt) => attempt.answer)])];
    };
    try {
      // A runtime that lacks the rule `role-table`, whose mark stands in the genesis act. The office is a declared definition, and
      // is created. Its `create` reaches the object that the seed names, which has no definition that it can run whole: transport's
      // answer is `retry`, nothing is recorded, and the scope does not exist.
      platformNet.without = "role-table";
      const lacks = await office();
      expect(await created(lacks.O, lacks.M)).toEqual([false, [["request", null, ["retry"]]]]);
      // One rule missing, `handle-form`, whose mark stands in two acts and not in the genesis act. The genesis act could be derived,
      // and the scope would then run under a part of its version. It is not created either.
      platformNet.without = "handle-form";
      const { O, M } = await office();
      expect(await created(O, M)).toEqual([false, [["request", null, ["retry"]]]]);
      // The same creation, sent again to a runtime with the platform package's rules and no other, as in production, is recorded:
      // the package has a rule for every mark.
      platformNet.without = null;
      net.clock.now = soon(600);
      await settle(O, M);
      expect((await M.summary()).value.status).toBe("active");
    } finally {
      platformNet.without = null;
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
  // The plan's T44 (gap G18; the contract's section 9.3, the rows "Act" and "An observation", and section 16.1, "Replay").
  test("replay agrees with the runtime: each recorded grant is derived again from the observation that it retains and from membership's history at the observed head; a history that was changed is reported by the name of what it breaks", async () => {
    const { O, M, unasInbox, ritasInbox } = await repository();
    const [a, b] = [await notify(unasInbox, { reason: "mentioned" }), await notify(unasInbox, { reason: "assigned" })];
    expect(a.answer, "the mentioned notice must be recorded before replay").toMatchObject({ answer: "recorded" });
    expect(b.answer, "the assigned notice must be recorded before replay").toMatchObject({ answer: "recorded" });
    const [one, two] = [(a.answer as { fact: { seq: number } }).fact.seq, (b.answer as { fact: { seq: number } }).fact.seq];
    const marks = async (kind: string, notice: number) => unasInbox.did(una, kind, { on: notice, expected: await unasInbox.expected({ on: notice, inbox: 0 }) });
    // Three acts of una in her inbox: on a fresh read; on the same read again, ten seconds later; and, after membership has moved
    // and the window has passed, on a new read from a higher head. Two acts of rita in membership, each on her own standing.
    const first = await marks("mark-read", one);
    await later(10);
    const reused = await marks("dismiss", one);
    const invite = (handle: string) => M.did(rita, "invite-member", { fields: { handle, role: "member", inviteHash: textDigest(handle), inviteEnds: soon(3600) } });
    const [invited, again] = [await invite("@vic"), await invite("@paul")];
    await later(300);
    const third = await marks("mark-read", two);
    const anchors = [a, b].map(({ envelope }) => ({ scope: envelope.from.at.scope, seq: envelope.from.seq, hash: envelope.from.hash }));
    const options = { mode: "replay", platform, anchors, grants: "proven" } as const;

    // The verifier reads each history as bytes, through the Worker's read routes, and derives every entry again. It shares no code
    // with the runtime but the judges, the fold and the platform package's data, rules and answer. No grant is taken as current:
    // each is derived from its observation, and the observation's value from membership's history at its head.
    const { report, why } = await verify(httpSource("https://scopes.test", { fetch: routed }), { ...options, scope: unasInbox.name, head: (await unasInbox.summary()).at });
    expect([report.result, why]).toEqual(["consistent", null]);
    // The inbox's replay covers membership as far as the highest head that an entry observed, and what membership used that far: the
    // office, and the genesis of rita's inbox, whose result membership recorded.
    const observed = ((await unasInbox.entries())[third]!.input as Extract<Entry["input"], { type: "act" }>).authority[0]!.fresh.observation.head.seq;
    expect(report.coverage.map((covered) => [covered.scope.kind, covered.through])).toEqual([["inbox", third], ["membership", observed], ["directory", 1], ["inbox", 0]]);
    // What stays on trust: that each read was made as recorded, and that the rules which ran are those of each name and version. The
    // label of a stand-in's grant is not there: no grant was taken as recorded.
    expect([report.trusts.includes(TRUSTS.observed), report.trusts.includes(TRUSTS.authority), report.trusts.filter((trust) => trust.startsWith("platform-code"))])
      .toEqual([true, false, [platformCode("platform:inbox@1"), platformCode(MEMBERSHIP)]]);
    // Membership's own history: its acts on a grant are derived from its own state at the head before each.
    expect((await verify(httpSource("https://scopes.test", { fetch: routed }), { ...options, scope: M.name })).report.result).toBe("consistent");

    // Copies of the four histories, each changed in one way and sealed again, so that only what the entries say has changed.
    const world = async () => ({ O: await copied(O), M: await copied(M), I: await copied(unasInbox), R: await copied(ritasInbox) });
    const good = await world();
    type World = typeof good;
    /** The proof of an act entry of a copy, and the same entry with another proof: its grant is then the one that the new proof gives. */
    const proofOf = (scope: MemoryScope, seq: number) => proof(JSON.parse(scope.entries[seq]!.bytes) as Entry);
    const proven = (scope: MemoryScope, seq: number, use: ObservationUse | null) =>
      rewritten(scope, seq, (entry: { input: { authority: unknown[] } }) => { entry.input.authority = [use === null ? { ...grantFrom(proofOf(scope, seq)), fresh: null } : grantFrom(use)]; });
    const said = async (change: (w: World) => MemoryScope) => {
      const w = structuredClone(good);
      const target = change(w);
      const replayed = await verify(new MemorySource(Object.values(w)), { ...options, scope: target.scope.scope });
      return [replayed.report.result, replayed.report.at?.seq ?? null, replayed.why?.split(":")[0] ?? null];
    };
    const head = (w: World, seq: number) => ({ seq, hash: w.M.entries[seq]!.hash });
    const rows: readonly (readonly [string, (w: World) => MemoryScope, readonly unknown[]])[] = [
      ["the copies, unchanged", (w) => w.I, ["consistent", null, null]],
      // The third act's observation is said to be from the head before the one that the first act observed. una's standing there
      // is the same, so the value is true of that head: only the order of heads is broken (section 16.1, rule 3).
      ["an observation from a lower head than an earlier entry retains", (w) => proven(w.I, third, { ...proofOf(w.I, third), observation: { ...proofOf(w.I, third).observation, head: head(w, proofOf(w.I, first).observation.head.seq - 1) } }), ["mismatch", third, "observation-older"]],
      // The entry that reuses a read has the time of the entry that it reuses it from: the clock has not moved.
      ["a reuse at an equal time", (w) => rewritten(w.I, reused, (entry: Entry) => { entry.time = (JSON.parse(w.I.entries[first]!.bytes) as Entry).time; }), ["mismatch", reused, "observation-not-moved"]],
      // An act of membership is judged on an observation that serves that one commit. The second invitation is said to reuse the first's.
      ["a reuse where the kind of commit allows none", (w) => proven(w.M, again, { ...proofOf(w.M, invited), use: "reused", prior: head(w, invited) }), ["mismatch", again, "observation-reused"]],
      // The second act is said to be on a read of another run, and the third is of the first run again.
      ["a run that returns", (w) => proven(w.I, reused, { ...proofOf(w.I, reused), read: { run: "another run", n: 1 }, use: "fresh", prior: null }), ["mismatch", third, "run-returned"]],
      // A runtime that records a standing which membership never gave: the same key, with an admin's role.
      ["a value that membership's history does not give", (w) => proven(w.I, first, { ...proofOf(w.I, first), observation: { ...proofOf(w.I, first).observation, role: "admin" } }), ["mismatch", first, `the retained observation is not what the history of ${M.name} gives that key at its entry ${proofOf(good.I, first).observation.head.seq}`]],
      // A grant with its proof taken away, as a stand-in authority writes one: it is no grant (the contract's section 15.6n, on E8).
      ["a grant with no freshness proof", (w) => proven(w.I, first, null), ["mismatch", first, "the recorded grant holds no freshness proof of a key's standing"]],
      // A grant that states more than its observation gives.
      ["a grant that does not agree with its observation", (w) => rewritten(w.I, first, (entry: { input: { authority: { actions: string[] }[] } }) => { entry.input.authority[0]!.actions.push("membership.manage"); }), ["mismatch", first, "the recorded grant is not the grant that the observation it retains gives"]],
    ];
    for (const [name, change, expected] of rows) expect([name, await said(change)]).toEqual([name, expected]);
  });

  test("a withheld original inbox confirmation completes only at its retained retry time, without changing genesis or adding another confirmation", async ({ task }) => {
    let before: Awaited<ReturnType<typeof inboxConfirmation>> | null = null;
    const made = await repository({ withholdUnaConfirmationOnce: true, beforeInboxCompletion: async pending => {
      before = await inboxConfirmation(pending);
      const child = before.inboxes.find(inbox => inbox.scope.scope === pending.unasInbox.name)!;
      const membership = await pending.M.at();
      const retry = before.retries.find(row => row.class === "control"
        && canonicalize(row.scope) === canonicalize(membership)
        && canonicalize(row.inbox) === canonicalize(child.scope)
        && canonicalize(row.genesis) === canonicalize(child.genesis))!;
      Object.assign(task.meta, { beforeInboxConfirmation: before });
      expect(child.status).toBe("provisional");
      expect(child.controls).toEqual([]);
      expect(retry, "The original confirmation must have an actual retained unanswered retry").toBeDefined();
      expect(retry.attempts.map(attempt => attempt.answer)).toEqual(["none"]);
      expect(retry.next).toBeGreaterThan(before.clock);
      expect(retry.alarm).toBe(retry.next);
    } });
    const after = await inboxConfirmation(made), original = before as Awaited<ReturnType<typeof inboxConfirmation>> | null;
    if (!original) throw new Error("The actual pending confirmation was not captured");
    Object.assign(task.meta, { afterInboxConfirmation: after });
    const genesis = (await made.unasInbox.entries())[0]!.input as Extract<Entry["input"], { type: "genesis" }>;
    const membership = await made.M.at();
    // This is the original authority witness's active/owner assertion. Omitting
    // only fixture completion must fail here, before later protocol assertions.
    expect([(genesis.message!.body as { membership: unknown }).membership, (await made.unasInbox.summary()).value.status, (await made.unasInbox.item(0)).parties["owner"], (await made.ritasInbox.item(0)).parties["owner"]])
      .toEqual([membership, "active", { membership, member: "@una" }, { membership, member: "@rita" }]);
    const child = after.inboxes.find(inbox => inbox.scope.scope === made.unasInbox.name)!;
    const earlier = original.inboxes.find(inbox => inbox.scope.scope === made.unasInbox.name)!;
    expect([child.scope, child.genesis, child.controls.length]).toEqual([earlier.scope, earlier.genesis, 1]);
    expect(after.clock - original.clock).toBeGreaterThan(0);
    expect(after.clock - original.clock).toBeLessThanOrEqual(8000);
    const outbox = await made.M.stub.outbox(reader);
    expect(outbox.ok).toBe(true);
    if (!outbox.ok) throw new Error("Completed confirmation outbox unavailable");
    const confirmation = outbox.value.find(outboxId => outboxId.class === "control" && isScopeRef(outboxId.to) && canonicalize(outboxId.to) === canonicalize(child.scope))!;
    expect(confirmation.attempts.map(attempt => attempt.answer)).toEqual(["none", "acknowledged"]);
    expect(confirmation.acknowledged).toEqual(child.controls[0]);
  });

});
