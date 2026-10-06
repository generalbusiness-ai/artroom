import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { expect, test } from "vitest";
import type { Answer, Digest, Entry, FactRef, Intent, MemberId, ObservationRequest, ObservationUse, OperationId, PlatformDefinition, RetainedInput, Seed, Send } from "@generalbusiness/artroom-contract";
import { canonicalize, entryHash, factRefOf, intentDigest, scopeIdOf, signIntent } from "@generalbusiness/artroom-bytes";
import { timeMs, timeOf, valueDigest } from "@generalbusiness/artroom-derive";
import { d, keys, membership, otherLane, type Actor } from "@generalbusiness/artroom-derive/testing";
import { EXTENTS, RULEBOOK, STEP_ROWS, rulebook, signers, weigherRules, weigherWith, type Seen } from "../../derive/test/fixtures-observes.ts";
import { MEMBERSHIP, platform } from "@generalbusiness/artroom-platform";
import { MemorySource, TRUSTS, verify, type MemoryScope } from "@generalbusiness/artroom-replay";
import type { Delivery } from "../src/index.ts";
import { controls, type Controls } from "../src/testing.ts";
import { outsideOf, wired } from "./outside.ts";
import { copied, repository, rewritten } from "./repository.ts";
import { START, at, objectOf, reader, stubOf } from "./support.ts";

// Scope contract, revisions 20 and 21, sections 5.2 (step 1) and 16.1; source rows I3-40, I3-41 and I3-53; witnesses 18.46 (cases 4,
// 5, 7, 8, 10 and 11), 18.48 (cases 6 to 8), 18.50 (cases 4 to 8) and 18.52 (case 5), on real storage with a scripted clock.
//
// STAND-INS, each labelled where it is used. The platform data and its rules are derive's made-up fixture `weigher`, supplied under
// a name and version that no runtime holds. The membership scope is scripted (`Controls.membership`): the test writes each answer,
// and no history stands behind its head. The rules scope is scripted too (`Controls.rulebook`): no rules scope answers an
// observation yet (I3 deltas, entries FB10 and GA7). The lane's entries and the answer of the outside system are made by hand.
// What is real: the scope's read before the turn, its numbers in the run, the judge's guards in the commit, the turn that starts
// again, and the store. These show nothing about a rule of a destination or of a rules scope, or about membership.

const { rita, una, vic, paul } = keys;
const MADE = "platform:task@1" as PlatformDefinition;
type Surface = { effect(): Promise<number>; deliver(envelope: unknown): Promise<Delivery> };

/** What the scripted scopes were asked, in order, and what each answers. */
interface Script { asked: string[]; silent: Set<string>; required: string[]; beside: (() => unknown) | null; after: (() => void) | null }

/** The name of what one read asks: `key:…`, `member:…`, `rules` or `holders:…`. */
const naming = (asked: ObservationRequest): string => ("key" in asked ? `key:${asked.key}` : "member" in asked ? `member:${asked.member}` : "holders" in asked ? `holders:${asked.holders}` : asked.asked);

/** A scope under the made-up data, founded on real storage, with its two scripted scopes. */
async function weighing(change: Parameters<typeof weigherWith>[0] = () => {}, first: Parameters<typeof weigherRules>[1] = signers) {
  const data = weigherWith(change).declared;
  const seen: Seen = { rows: [], read: [], named: [] };
  const founding: Intent = { v: 1, to: null, actor: rita.key, kind: "found", on: null, expected: {}, fields: { opener: rita.member }, idempotencyKey: crypto.randomUUID(), notAfter: at(60) };
  const seed: Seed = { v: 1, kind: "directory", definition: MADE, creator: null, cause: intentDigest(founding), ordinal: 0 };
  const name = scopeIdOf(seed);
  const c = controls(name, START);
  wired.set(name, () => ({ definitions: { read: () => Promise.resolve({ ok: false, reason: "unavailable" }), platform: (named) => (named === MADE ? { data: data as never, rules: weigherRules(seen, first).rules } : null) } }));
  const founded = await stubOf(name).found(signIntent(founding, rita.secret), MADE);
  if (founded.answer !== "accepted") throw new Error(`the scope was not founded: ${JSON.stringify(founded)}`);
  const scope = founded.receipt.fact.at;
  const script: Script = { asked: [], silent: new Set(), required: ["c1"], beside: null, after: null };
  const from = { of: membership, head: { seq: 40, hash: d("4") }, definition: "platform:membership@1" };
  const members: Record<string, MemberId> = Object.fromEntries(Object.values(keys).map((who) => [who.key, who.member.member]));
  // STAND-IN: each answer of membership is written here, by hand.
  c.membership = {
    at: membership,
    answers(asked) {
      const name = naming(asked);
      script.asked.push(name);
      if (script.silent.has(name)) return null;
      script.after?.();
      if ("key" in asked) return { ...from, key: asked.key, keyState: "active", member: members[asked.key] ?? "@nobody", memberState: "active", role: "member", actions: Object.values(data.acts).map((act) => act.grant), within: { membership }, controller: null, controllerActive: null, notAfter: null };
      if ("member" in asked) return { ...from, subject: "member", member: asked.member, memberState: "active", role: "member", activeKey: true, controller: null, controllerActive: null };
      return "holders" in asked ? { ...from, subject: "holders", action: asked.holders, count: 3, holders: ["@rita", "@una", "@vic"].slice(0, asked.most) } : null;
    },
  };
  // STAND-IN: each answer of the rules scope is written here, by hand, with what is said to come beside it.
  c.rulebook = {
    at: rulebook, definition: RULEBOOK, states: { singleControllerException: false, extents: false },
    answers(asked) {
      script.asked.push(naming(asked));
      if (script.silent.has("rules")) return null;
      script.after?.();
      return script.beside?.() ?? { subject: "rules", of: rulebook, head: { seq: 7, hash: d("7") }, revision: 3, definition: RULEBOOK, content: { asked: "rules", approvals: 1, ownerMayReview: false, labels: [], checks: script.required.map((check) => ({ name: check, configuration: d("c"), required: true, checker: "@check" })) } };
    },
  };
  let n = 0;
  const act = (who: Actor, kind: string, over: Partial<Intent> = {}): Promise<Answer> => {
    const intent: Intent = { v: 1, to: scope, actor: who.key, kind, on: null, expected: {}, fields: {}, idempotencyKey: `k${n++}`, notAfter: timeOf(timeMs(c.clock.now)! + 60_000), ...over };
    return stubOf(name).submit(signIntent(intent, who.secret), []);
  };
  const entries = async (): Promise<Entry[]> => {
    const read = await stubOf(name).history(reader, "0");
    if (!read.ok) throw new Error(`no history: ${read.reason}`);
    return read.value.map((sealed) => sealed.entry);
  };
  /** The revision of the desk, for a transition on it. */
  const desk = async () => {
    const read = await stubOf(name).summary(reader);
    if (!read.ok) throw new Error(`no summary: ${read.reason}`);
    return { on: 0, expected: { on: read.value.items.find((item) => item.id === 0)!.revision } };
  };
  return { name, c, scope, script, seen, act, entries, desk, surface: objectOf(name) as unknown as Surface };
}
type Weighing = Awaited<ReturnType<typeof weighing>>;

const said = (answer: Answer) => [answer.answer, "reason" in answer ? answer.reason : null];
const observedIn = (entry: Entry): readonly ObservationUse[] => ("observed" in entry.input ? (entry.input.observed ?? []) : []);
/** Each record of `observed`, as the name of its subject, its number in the run and its use. */
const records = (entry: Entry) => observedIn(entry).map((use) => { const o = use.observation; return [!("subject" in o) ? `key:${o.key}` : o.subject === "member" ? `member:${o.member}` : o.subject === "holders" ? `holders:${o.action}` : o.content.asked, use.read.n, use.use]; });
const check = (name: string, who: Actor) => ({ name, checker: who.member });
const advance = (c: Controls, seconds: number) => { c.clock.now = timeOf(timeMs(c.clock.now)! + seconds * 1000); };

test("18.46 cases 4 and 5, an act with a row, on real storage: the scope reads one observation for each subject before the turn, after the signer's, each numbered in the run; the entry retains each; a later act reuses them inside the row's window and reads nothing; a row that is over is refused and nothing is read for it; with membership silent for a subject the act is `authority-unavailable`; and after a restart nothing read is used", async () => {
  const s = await weighing();
  try {
    const { script, c } = s;
    // Case 4: three checks, whose checkers are two members. The signer's key is read first, then the row in the order of its list.
    const three = { fields: { checks: [check("a", una), check("b", vic), check("c", una)] } };
    expect([said(await s.act(rita, "set-checks", three)), script.asked]).toEqual([["accepted", null], [`key:${rita.key}`, "member:@una", "member:@vic"]]);
    const first = (await s.entries()).at(-1)!;
    expect([records(first), observedIn(first).map((use) => [use.observation.at, use.prior])]).toEqual([[["member:@una", 2, "fresh"], ["member:@vic", 3, "fresh"]], [[at(0), null], [at(0), null]]]);
    // Twenty seconds later, inside the row's 300 seconds: nothing is read, and the entry retains the same reads as `reused`, each
    // with the entry before it that retains it.
    advance(c, 20);
    expect([said(await s.act(rita, "set-checks", three)), script.asked.length]).toEqual([["accepted", null], 3]);
    const second = (await s.entries()).at(-1)!;
    const prior = { seq: first.seq, hash: entryHash(first) };
    expect([records(second), observedIn(second).map((use) => use.prior)]).toEqual([[["member:@una", 2, "reused"], ["member:@vic", 3, "reused"]], [prior, prior]]);
    // Case 5: five checks of five members. The row is over: refused `entry-too-large`, and no member is read for the row.
    const five = { fields: { checks: [rita, una, vic, paul, keys.sam].map((who, i) => check(`c${i}`, who)) } };
    advance(c, 1);
    expect([said(await s.act(rita, "set-checks", five)), script.asked.length, (await s.entries()).length]).toEqual([["refused", "entry-too-large"], 3, second.seq + 1]);
    // Membership does not answer for one subject. It is read once, before the turn, and no observation can be had: the act is
    // answered `authority-unavailable`. Nothing is written. The signer's own observation is held, and is not read again.
    script.silent.add("member:@paul");
    advance(c, 1);
    const before = script.asked.length;
    expect([said(await s.act(rita, "set-checks", { fields: { checks: [check("a", paul)] } })), (await s.entries()).length, script.asked.slice(before)]).toEqual([["unavailable", "authority-unavailable"], second.seq + 1, ["member:@paul"]]);
    // After a restart the scope holds no observation: it reads each again, in a new run, and retains each as `fresh`.
    await evictDurableObject(objectOf(s.name));
    const asked = script.asked.length;
    expect(said(await s.act(rita, "set-checks", three))).toEqual(["accepted", null]);
    const third = (await s.entries()).at(-1)!;
    expect([script.asked.slice(asked), records(third), observedIn(third)[0]!.read.run === observedIn(first)[0]!.read.run]).toEqual([[`key:${rita.key}`, "member:@una", "member:@vic"], [["member:@una", 2, "fresh"], ["member:@vic", 3, "fresh"]], false]);
  } finally {
    wired.delete(s.name);
  }
});

/** A lane's entry that decides one check, MADE BY HAND and signed by that key, which the scope's resolver can read. */
function decided(c: Controls, seq: number, who: Actor, name: string): FactRef {
  const signed = signIntent({ v: 1, to: otherLane, actor: who.key, kind: "decide", on: null, expected: {}, fields: { check: name }, idempotencyKey: `d${seq}`, notAfter: at(60) }, who.secret);
  const entry: Entry = { v: 1, at: otherLane, seq, prev: d("0"), time: START, clamped: false, epoch: 0, input: { type: "act", signed, authority: [], presented: {} }, uses: [], prepared: [], effects: [], sends: [] };
  const fact = factRefOf(entry);
  c.foreign.set(fact.hash, { entry, under: "lane" });
  return fact;
}

/** One operation of `weigh`, opened by an act that names the two entries of the lane; and the answer of the outside system, MADE BY HAND. */
async function opened(s: Weighing, facts: { first: FactRef; second: FactRef }): Promise<{ operation: OperationId; origin: Entry; offer(): Promise<void> }> {
  const answer = await s.act(rita, "start", { ...(await s.desk()), fields: facts });
  if (answer.answer !== "accepted") throw new Error(`the operation was not opened: ${JSON.stringify(answer)}`);
  const origin = (await s.entries()).at(-1)!;
  const operation = `${origin.seq}:0` as OperationId;
  const out = outsideOf(s.name);
  out.answer(operation, 1, { result: "confirmed", evidence: { basis: "own-answer", body: {} } });
  return { operation, origin, offer: async () => { await s.surface.effect(); } };
}
const outcomeOf = (entries: readonly Entry[], operation: OperationId): Entry | null => entries.find((entry) => entry.input.type === "outcome" && entry.input.operation === operation) ?? null;

test("18.46 cases 7, 8, 10 and 11, an outcome with rows, on real storage: its `uses` is a copy of its origin's and nothing is fetched; the scope reads the rules, each key and the holders before the turn, and the entry retains four fresh records; an age that equals the window leaves the outcome offered; a row that states `write` is written without its observation; and a row that states `wait` waits", async () => {
  const s = await weighing();
  try {
    const { script, c } = s;
    const facts = { first: decided(c, 41, una, "c1"), second: decided(c, 42, vic, "c2") };
    const [k1, k2] = [`key:${una.key}`, `key:${vic.key}`];

    // Case 7. The two entries of the lane were fetched for the act that opened the operation. The outcome fetches nothing: the
    // resolver holds neither entry now. The rules, the two keys that signed them and the holders of `x.do` are read, in that order.
    const g = await opened(s, facts);
    const lane = new Map(c.foreign);
    c.foreign.clear();
    script.asked.length = 0;
    await g.offer();
    for (const [hash, entry] of lane) c.foreign.set(hash, entry);
    expect(outcomeOf(await s.entries(), g.operation) === null).toBe(false);
    const entry = outcomeOf(await s.entries(), g.operation)!;
    expect([script.asked, records(entry), entry.uses, entry.clamped]).toEqual([["rules", k1, k2, "holders:x.do"], [["rules", 2, "fresh"], [k1, 3, "fresh"], [k2, 4, "fresh"], ["holders:x.do", 5, "fresh"]], g.origin.uses, false]);
    expect([g.origin.uses.map((use) => use.fact), s.seen.rows.at(-1), s.seen.read.at(-1)]).toEqual([[facts.first, facts.second], ["whole", "whole", "whole"], [2, 3, 4]]);

    // Case 8: the commit's reading is 10 seconds after each read began. An age that equals the window is outside it: the
    // observation is discarded and read again, inside the bound on restarts, and the outcome is not written. It stays offered.
    const late = await opened(s, facts);
    script.after = () => advance(c, 10);
    await late.offer();
    expect(outcomeOf(await s.entries(), late.operation)).toBeNull();
    // Offered again when its reads are in time: written.
    script.after = null;
    advance(c, c.bounds.drainRetrySeconds);
    await late.offer();
    expect(records(outcomeOf(await s.entries(), late.operation)!).map(([name, , use]) => [name, use])).toEqual([["rules", "fresh"], [k1, "fresh"], [k2, "fresh"], ["holders:x.do", "fresh"]]);

    // Case 11: the rules scope cannot be reached, and that row states `wait`. Not written: the outcome stays offered.
    const waiting = await opened(s, facts);
    script.silent.add("rules");
    await waiting.offer();
    expect(outcomeOf(await s.entries(), waiting.operation)).toBeNull();
    // Case 10: membership cannot be reached for the holders, and that row states `write`. Written, with three records, and the
    // rule is told that the row is absent.
    script.silent.delete("rules");
    script.silent.add("holders:x.do");
    advance(c, c.bounds.drainRetrySeconds);
    await waiting.offer();
    expect([records(outcomeOf(await s.entries(), waiting.operation)!).map(([name]) => name), s.seen.rows.at(-1)]).toEqual([["rules", k1, k2], ["whole", "whole", "absent"]]);
  } finally {
    wired.delete(s.name);
  }
});

test("18.52 case 5, two steps on real storage: the first step reads the rules and the keys of its row; the second step names its keys from the observation of the rules, and a key of both steps is read once and retained once", async () => {
  const [k1, k3] = [una.key, paul.key];
  const s = await weighing((data) => { data.outcomes.weigh.origin = "opening"; data.outcomes.weigh.observes = STEP_ROWS; }, (given) => [k1, ...signers(given).slice(2)]);
  try {
    const { script, c } = s;
    const facts = { first: decided(c, 41, una, "c1"), second: decided(c, 42, vic, "c2") };
    expect(said(await s.act(rita, "more", { ...(await s.desk()), fields: { more: [k3] } }))).toEqual(["accepted", null]);
    const g = await opened(s, facts);
    script.asked.length = 0;
    await g.offer();
    const entry = outcomeOf(await s.entries(), g.operation)!;
    // The rules require c1 and not c2. R3 names k1 and k3. R2, given the observation of the rules, names k1, which is at hand.
    expect([script.asked, records(entry).map(([name, , use]) => [name, use]), s.seen.rows.at(-1), entry.uses]).toEqual([["rules", `key:${k1}`, `key:${k3}`], [["rules", "fresh"], [`key:${k1}`, "fresh"], [`key:${k3}`, "fresh"]], ["whole", "whole", "whole"], g.origin.uses]);
  } finally {
    wired.delete(s.name);
  }
});

test("18.48 cases 6 to 8, and 18.50 cases 4 to 8, a clause of a result on real storage: an answer whose value is over the row's `max`, has no bytes beside it, or names a value in a domain that the row does not state is no answer, the delivery is tried again and no byte is stored; a whole answer is retained with its entry, and its value is kept once by its domain and its digest", async () => {
  const s = await weighing();
  try {
    const { script, c, name } = s;
    c.rulebook!.states = { singleControllerException: false, extents: true };
    expect(said(await s.act(rita, "point", { ...(await s.desk()), fields: { peer: otherLane } }))).toEqual(["accepted", null]);
    /** One `ask`, and the applied result of it as it arrives, from an entry of the peer MADE BY HAND. */
    const asked = async (seq: number) => {
      expect(said(await s.act(rita, "go", await s.desk()))).toEqual(["accepted", null]);
      const sent = (await s.entries()).at(-1)!;
      const request = { from: { at: s.scope, seq: sent.seq, hash: entryHash(sent) }, n: 0 };
      const answer: Send = { n: 0, to: s.scope, message: { class: "result", of: request, outcome: "applied" } };
      const entry: Entry = { v: 1, at: otherLane, seq, prev: d("0"), time: START, clamped: false, epoch: 0, input: { type: "delivery", from: request.from, n: 0, message: sent.sends[0]!.message as never, decision: "applied" }, uses: [], prepared: [], effects: [], sends: [answer] };
      c.foreign.set(entryHash(entry), { entry, under: "lane" });
      return { ...answer, from: factRefOf(entry) };
    };
    const kept = () => runInDurableObject(objectOf(name), (_instance, state) => state.storage.sql.exec("SELECT domain, digest, length(bytes) AS size FROM retained_value ORDER BY domain, digest").toArray());
    const list = ["src/**", "docs/**"];
    const [bytes, digest] = [canonicalize(list), valueDigest(EXTENTS, list)];
    /** What the scripted rules scope answers: the record with the digest of the extents, and the values that are said to come beside it. */
    const answering = (extents: string, values: readonly { domain: string; bytes: string }[]) => () => ({
      answer: { subject: "rules", of: rulebook, head: { seq: 7, hash: d("7") }, revision: 3, definition: RULEBOOK, content: { asked: "rules", approvals: 1, ownerMayReview: false, labels: [], checks: [], extents } },
      values,
    });
    const first = await asked(9);
    // 18.50 case 6: the list is 450,000 bytes, over the row's `max` of 400,000. Case 7: no bytes come beside the answer. Case 8: the
    // answer names a second value, in a domain that the row does not state. Each is no answer: the row states `wait`, so the entry
    // is not written and the delivery is tried again. No byte of any list is stored.
    const long = ["x".repeat(450_000)];
    for (const beside of [answering(valueDigest(EXTENTS, long), [{ domain: EXTENTS, bytes: canonicalize(long) }]), answering(digest, []), answering(digest, [{ domain: EXTENTS, bytes }, { domain: "x-other-1", bytes: canonicalize(["more"]) }])]) {
      script.beside = beside;
      expect([await s.surface.deliver(first), await kept()]).toEqual([{ answer: "retry", reason: "authority-unavailable" }, []]);
    }
    // 18.48 case 6, and 18.50 case 4: the bytes hash to the digest, in a stated domain, within the `max`. Written: the entry that
    // retains the observation holds the digest, and the list is one retained input of the kind `value`.
    script.beside = answering(digest, [{ domain: EXTENTS, bytes }]);
    const recorded = await s.surface.deliver(first);
    const entry = (await s.entries()).at(-1)!;
    const content = observedIn(entry)[0]!.observation as { content: { extents: string } };
    expect([recorded.answer, records(entry).map(([subject, , use]) => [subject, use]), content.content.extents, await kept()]).toEqual(["recorded", [["rules", "fresh"]], digest, [{ domain: EXTENTS, digest, size: bytes.length }]]);
    // 18.48 case 8, and 18.50 case 5: a second entry that retains a later observation with the same extents. One domain and one
    // digest are one input: nothing more is kept.
    c.clock.now = timeOf(timeMs(c.clock.now)! + 1000);
    const again = await s.surface.deliver(await asked(10));
    expect([again.answer, records((await s.entries()).at(-1)!).length, (await kept()).length]).toEqual(["recorded", 1, 1]);
  } finally {
    wired.delete(s.name);
  }
});

// What is real here, beyond the tests above: the membership scope. It is a scope under `platform:membership@1` on a real object of
// the namespace `PLATFORM`, with the platform package's own rules, and it answers each read by its own method `observe`, from its
// head. STAND-INS that remain: the observing scope's data and rules are made up; the reference by which it records that membership
// scope is written by the test, because no genesis of a made-up scope holds one; and the rules scope is scripted.
test("a scope with rows reads the real membership scope of the platform package: the standing of each member of a list, the standing of a key behind an entry at hand, and the holders of an action; and a replay derives each value again from membership's own history", async () => {
  const { O, M, ritasInbox, unasInbox } = await repository();
  const of = await M.at();
  // The acts of the made-up data are judged on an action that membership's role table gives a member, and the row of the holders
  // names one that an admin and a member hold.
  const s = await weighing((data) => {
    for (const act of Object.values(data.acts) as { grant: string }[]) act.grant = "issue.open";
    data.outcomes.weigh.observes[2].action = "issue.open";
  });
  try {
    const { c } = s;
    c.membership = { at: of, answers: (asked) => M.stub.observe(asked) };
    const member = (handle: string) => ({ membership: of, member: handle as MemberId });
    // An act with a row: the checkers are una, a member, and rita, who signs. Una's standing is membership's own answer at its
    // head. Rita is the signer's own member: the grant's observation serves that subject, and `observed` holds no record of it
    // (witness 18.52, case 10, on a real observation).
    expect(said(await s.act(rita, "set-checks", { fields: { checks: [{ name: "a", checker: member("@una") }, { name: "b", checker: member("@rita") }] } }))).toEqual(["accepted", null]);
    const head = (await M.summary()).at;
    const set = (await s.entries()).at(-1)!;
    expect([observedIn(set).map((use) => use.observation), set.input.type === "act" && set.input.authority[0]!.fresh.observation]).toMatchObject([
      [{ subject: "member", of, head, member: "@una", memberState: "active", role: "member", activeKey: true, definition: MEMBERSHIP }],
      { key: rita.key, member: "@rita", role: "admin", of, head },
    ]);
    expect(observedIn(set).length).toBe(1);
    // An outcome with rows: the key of una, a member; the key of vic, which membership does not hold; and the holders of the action.
    const facts = { first: decided(c, 41, una, "c1"), second: decided(c, 42, vic, "c2") };
    const g = await opened(s, facts);
    await g.offer();
    const outcome = outcomeOf(await s.entries(), g.operation)!;
    expect(observedIn(outcome).slice(1).map((use) => use.observation)).toMatchObject([
      { key: una.key, keyState: "active", member: "@una", role: "member", of, head },
      { key: vic.key, keyState: "unknown", actions: [], of, head },
      { subject: "holders", action: "issue.open", count: 2, holders: ["@rita", "@una"], of, head },
    ]);

    // The replay: the observing scope's history, with the histories of membership and of what membership used. No anchor is given
    // for membership, so each value is derived from its history at the recorded head: a member, a key, and the holders.
    const kept = async (kind: RetainedInput["kind"], digest: Digest): Promise<RetainedInput[]> => {
      const read = await (objectOf(s.name) as unknown as { retained(reader: unknown, kind: string, digest: Digest): Promise<{ ok: true; value: RetainedInput } | { ok: false }> }).retained(reader, kind, digest);
      return read.ok ? [read.value] : [];
    };
    const sealed = await stubOf(s.name).history(reader, "0");
    if (!sealed.ok) throw new Error("no history");
    const retained: RetainedInput[] = [];
    for (const { entry } of sealed.value) for (const use of entry.uses) retained.push(...await kept("entry", use.content));
    const W: MemoryScope = { scope: s.scope, entries: sealed.value.map(({ entry, hash }) => ({ seq: entry.seq, hash, bytes: canonicalize(entry) })), retained };
    const data = weigherWith((made) => { for (const act of Object.values(made.acts) as { grant: string }[]) act.grant = "issue.open"; made.outcomes.weigh.observes[2].action = "issue.open"; }).declared;
    const code = (named: PlatformDefinition) => (named === MADE ? { data: data as never, rules: weigherRules().rules, membership: () => of, rulesScope: () => rulebook }
      : named === RULEBOOK ? { data: { items: { rules: { values: {} } } } as never, rules: {} } : platform(named));
    const lane = [...c.foreign.values()].map(({ entry }) => { const fact = factRefOf(entry); return { scope: fact.at.scope, seq: fact.seq, hash: fact.hash }; });
    const world = async () => [W, await copied(O), await copied(M), await copied(ritasInbox), await copied(unasInbox)];
    const options = { mode: "replay", scope: s.name, platform: code, anchors: [{ scope: rulebook.scope, seq: 7, hash: d("7") }, ...lane] } as const;
    const good = await verify(new MemorySource(await world()), options);
    expect([good.report.result, good.why, good.report.trusts.includes(TRUSTS.observed)]).toEqual(["consistent", null, true]);
    // The same history, where the record of the holders states one more than membership's history gives at that head.
    const changed = await world();
    rewritten(changed[0]!, outcome.seq, (entry: { input: { observed: { observation: { count?: number } }[] } }) => { entry.input.observed[3]!.observation.count = 3; });
    const found = await verify(new MemorySource(changed), options);
    expect([found.report.result, found.report.at?.seq, found.why]).toEqual(["mismatch", outcome.seq, `the retained observation is not what the history of ${of.scope} gives the holders of that action at its entry ${head.seq}`]);
  } finally {
    wired.delete(s.name);
  }
});
