import { describe, expect, test } from "vitest";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import type { Effect, MemberRef, RefusalReason } from "@generalbusiness/artroom-contract";
import { canonicalBytes, digestBytes, intentDigest } from "@generalbusiness/artroom-bytes";
import { LAST_MS, type ActJudgment } from "../src/index.ts";
import { Scope, d, fields, grantOf, keys, lane, laneDefinition, on, otherLane, small, smallDefinition, t, variant, type Actor } from "./fixtures.ts";

const { rita, una, vic, paul, sam } = keys;
const names = (list: unknown) => (list as readonly MemberRef[]).map((m) => m.member);

/** A lane with commitment 2, accepted, performed by una. */
function laneWithCommitment(definition = laneDefinition): Scope {
  const s = new Scope(definition);
  s.did(rita, "offer", { fields: { intent: 0 }, expected: { intent: 1 } });
  s.did(rita, "assign", { ...on(s, 2), ...fields({ performer: una.member }) });
  return s;
}
const under = (s: Scope, commitment: number) => ({ fields: { commitment }, expected: { commitment: s.item(commitment).revision } });

describe("an accepted act", () => {
  test("its effects, revisions, counts and sends are as derived, and a fresh fold of the entries gives the same state", () => {
    const s = new Scope(laneDefinition);
    const offer = s.did(rita, "offer", { fields: { intent: 0 }, expected: { intent: 1 } });
    // The entry opens one item, whose ID is the entry's seq; `self` is that seq.
    expect(offer.seq).toBe(2);
    expect(offer.effects).toEqual<Effect[]>([
      { effect: "open", item: 2, type: "commitment", state: "offered" },
      { effect: "party", item: 2, slot: "requester", member: rita.member },
      { effect: "ref", item: 2, slot: "intent", to: 0 },
    ]);
    // A new item has revision 1. The intent was only read by the guards: it does not rise.
    expect([s.item(2).revision, s.item(0).revision]).toEqual([1, 1]);

    const assign = s.did(rita, "assign", { ...on(s, 2), ...fields({ performer: una.member }) });
    expect(assign.effects).toEqual<Effect[]>([
      { effect: "party", item: 2, slot: "performer", member: una.member },
      { effect: "state", item: 2, state: "accepted" },
      { effect: "attention", item: 2, members: [una.member], reason: "assigned" },
    ]);
    // Two effects touched item 2 in one entry: its revision rose once.
    expect(s.item(2)).toMatchObject({ revision: 2, state: "accepted" });
    expect([s.state.count("commitment", "offered"), s.state.count("commitment", "accepted"), s.state.count("intent", "open")]).toEqual([0, 1, 1]);
    // A handover tells the one replaced and the one replacing them.
    const handover = s.did(rita, "assign", { ...on(s, 2), ...fields({ performer: vic.member }) });
    expect(handover.effects.filter((e) => e.effect === "attention")).toEqual([
      { effect: "attention", item: 2, members: [una.member], reason: "replaced" }, { effect: "attention", item: 2, members: [vic.member], reason: "assigned" },
    ]);

    // Sends take ordinals in written order. `self` is not expanded; an earlier local item is sent as its fact; a creation is addressed by a seed.
    const signed = s.intent(rita, "link", fields({ target: otherLane, about: 0 }));
    s.submit(signed);
    const link = s.entries.at(-1)!.entry;
    expect(link.sends).toEqual([
      { n: 0, to: otherLane, message: { class: "request", type: "relate", body: { name: "closes", item: { self: true }, state: "set", detail: { about: { at: s.at, seq: 0, hash: s.entries[0]!.hash } } } } },
      { n: 1, to: { v: 1, kind: "lane", definition: d("e"), creator: s.at, cause: intentDigest(signed.intent), ordinal: 0 }, message: { class: "request", type: "create", body: { fields: { parent: { self: true }, by: rita.member } } } },
    ]);
    // Each request is outstanding until its one result.
    expect([s.state.request(link.seq, 0), s.state.request(link.seq, 1)].map((r) => r && [r.type, r.result, r.diagnosis])).toEqual([["relate", null, null], ["create", null, null]]);

    // A comment changes no item.
    const remark = s.did(sam, "remark", { on: 0, fields: { text: "seen" } });
    expect([remark.effects, s.item(0).revision]).toEqual([[], 1]);

    // The entry is at the head it was judged on, at the commit's reading.
    expect([remark.seq, remark.prev, remark.time, remark.clamped]).toEqual([link.seq + 1, s.entries.at(-2)!.hash, s.now, false]);
    expect(s.replay().snapshot()).toBe(s.state.snapshot());
  });
});

describe("a refused act", () => {
  const l = laneWithCommitment();
  l.did(rita, "offer", { fields: { intent: 0 }, expected: { intent: 1 } });   // commitment 4, offered
  l.did(una, "report", under(l, 2));                                          // report 5, authors una and paul
  const s = new Scope(smallDefinition);
  s.did(rita, "write", fields({ owner: rita.member, text: "a", due: t(30) })); // note 2; with note 0, the type is at its max of live items
  for (const reader of [una, vic]) s.did(rita, "share", { ...on(s, 2), ...fields({ reader: reader.member }) });
  const edit = (who: Actor, extra = {}) => s.intent(who, "edit", { ...on(s, 2, { other: 0 }), fields: { text: "b", other: 0, ...extra } });
  const offer = () => l.intent(rita, "offer", { fields: { intent: 0 }, expected: { intent: 1 } });
  const tampered = { intent: { ...offer().intent, kind: "close" }, sig: offer().sig };

  const rows: readonly (readonly [string, RefusalReason, string | null, () => ActJudgment, Scope])[] = [
    // Section 6.4.
    ["an expected revision that has moved", "revision-moved", null, () => l.act(rita, "assign", { on: 2, expected: { on: 1 }, fields: { performer: vic.member } }), l],
    ["two names that resolve to one item", "alias", null, () => s.act(rita, "edit", { ...on(s, 2, { other: 2 }), fields: { text: "b", other: 2 } }), s],
    ["two relate sends that resolve to one key, by self and by a slot", "duplicate-relation", null, () => s.act(rita, "echo", fields({ peer: otherLane })), s],
    // Authority: a grant for the action, to the signing key, covering this scope, not expired, with a positive verdict.
    ["no grant", "unauthorized", null, () => l.submit(offer(), { grants: [] }), l],
    ["a grant to another key", "unauthorized", null, () => l.submit(offer(), { grants: [{ grant: grantOf(una, l.at, ["offer"]), current: true }] }), l],
    ["a grant of another action", "unauthorized", null, () => l.submit(offer(), { grants: [{ grant: grantOf(rita, l.at, ["close"]), current: true }] }), l],
    ["a grant within another scope", "unauthorized", null, () => l.submit(offer(), { grants: [{ grant: grantOf(rita, otherLane, ["offer"]), current: true }] }), l],
    ["a grant past its notAfter", "unauthorized", null, () => l.submit(offer(), { grants: [{ grant: grantOf(rita, l.at, ["offer"], l.now), current: true }] }), l],
    ["a grant the authority does not find current", "unauthorized", null, () => l.submit(offer(), { grants: [{ grant: grantOf(rita, l.at, ["offer"]), current: false }] }), l],
    // One failed guard of each family.
    ["state: a hold under a commitment that is only offered", "guard-failed", "guards.0", () => l.act(rita, "take-hold", under(l, 4)), l],
    ["signer: an assignment by one who is not the requester", "guard-failed", "guards.1", () => l.act(una, "assign", { ...on(l, 2), ...fields({ performer: una.member }) }), l],
    ["notIn: a review by an author", "guard-failed", "guards.1", () => l.act(una, "accept-report", on(l, 5)), l],
    ["range: closing while a commitment is live", "guard-failed", "guards.2", () => l.act(rita, "close", on(l, 0)), l],
    ["equals: an edit by one who is not the owner", "guard-failed", "guards.1", () => s.submit(edit(una)), s],
    ["before: an edit at the deadline", "guard-failed", "guards.2", () => s.submit(edit(rita), { reading: t(30) }), s],
    ["after: a late edit at the deadline", "guard-failed", "guards.1", () => s.act(rita, "late", on(s, 2), { reading: t(30) }), s],
    ["every: a listed note that is not kept", "guard-failed", "guards.3", () => s.submit(edit(rita, { notes: [0] })), s],
    // Sections 6.3 and 4.2, and the input itself.
    ["an opening that leaves a required slot unset", "required-unset", "owner", () => s.act(rita, "write", fields({ text: "x" })), s],
    ["an opening past the type's max of live items", "type-full", null, () => s.act(rita, "write", fields({ owner: rita.member })), s],
    ["a party list past its max", "slot-full", null, () => s.act(rita, "share", { ...on(s, 2), ...fields({ reader: sam.member }) }), s],
    ["an intent addressed to another scope", "misaddressed", null, () => l.act(rita, "offer", { to: otherLane, fields: { intent: 0 }, expected: { intent: 1 } }), l],
    ["an intent at its notAfter", "expired", null, () => l.submit(offer(), { reading: t(60) }), l],
    ["an intent changed after it was signed", "bad-intent", null, () => l.submit(tampered), l],
    ["the genesis kind, sent as an act", "unknown-act", null, () => l.act(rita, "file", fields({ title: "again", opener: rita.member })), l],
    ["a field the act does not declare", "bad-field", null, () => l.act(rita, "offer", { fields: { intent: 0, note: "x" }, expected: { intent: 1 } }), l],
    ["an item that does not exist", "no-item", null, () => l.act(rita, "assign", { on: 99, expected: { on: 1 }, fields: { performer: vic.member } }), l],
  ];

  test.each(rows)("%s: %s", (_name, reason, detail, run, scope) => {
    const head = scope.head;
    const judgment = run();
    // A refusal names the head it was judged at, and writes nothing.
    expect(judgment).toMatchObject({ result: "refused", reason, judgedAt: head, ...(detail === null ? {} : { detail }) });
    expect(scope.head).toEqual(head);
  });

  test("each guard family passes when its condition holds, so the refusals above are the guards' own", () => {
    const head = s.head.seq;
    // Owner, before the deadline, and no note listed: the edit is written. One second after the deadline, the late edit is.
    expect(s.submit(edit(rita)).result).toBe("write");
    s.now = t(31);
    expect(s.act(rita, "late", on(s, 2)).result).toBe("write");
    expect(s.item(2).values["text"]).toBe("late");
    expect(s.head.seq).toBe(head + 2);
    // A transition of an item in a final state is refused.
    s.did(rita, "keep", on(s, 2));
    expect(s.act(rita, "keep", on(s, 2))).toMatchObject({ result: "refused", reason: "final" });
  });
});

describe("effects (section 6.6)", () => {
  test("a reference copied from a slot is the value that slot holds, whatever kind of slot it is", () => {
    // `backup` is a value slot that holds a scope reference by default; `peer` is a reference slot of the same type.
    const s = new Scope(variant(small, (def) => {
      def.items.note.values.backup = { fixed: false, required: false, of: { type: "scope", kind: "lane" }, default: otherLane };
      def.acts.restore = { ...def.acts.keep, effects: [{ ref: { slot: "peer", from: { slot: "backup" } } }] };
    }));
    expect(s.did(rita, "restore", on(s, 0)).effects).toEqual([{ effect: "ref", item: 0, slot: "peer", to: otherLane }]);
  });

  test("a time derived from the commit clock past the last timestamp is refused; nothing throws and nothing is written", () => {
    const s = new Scope(variant(small, (def) => {
      def.acts.late = { ...def.acts.keep, effects: [{ value: { slot: "due", from: { time: { plusSeconds: Math.floor(LAST_MS / 1000) } } } }] };
    }));
    expect([s.act(rita, "late", on(s, 0)), s.item(0).values["due"]]).toMatchObject([{ result: "refused", reason: "bad-field" }, null]);
  });

  test("no effect changes an item that was final before the entry; a final item may still be named and read", () => {
    // Note 0 is kept, which is final. An edit of a live note names it as `other`.
    const edit = (definition = smallDefinition) => {
      const s = new Scope(definition);
      s.did(rita, "keep", on(s, 0));
      const note = s.did(rita, "write", fields({ owner: rita.member, due: t(30) })).seq;
      return [s.act(rita, "edit", { ...on(s, note, { other: 0 }), fields: { text: "b", other: 0 } }), s.item(0).revision, s.item(0).values["text"]];
    };
    expect(edit()).toMatchObject([{ result: "write" }, 2, null]);
    // The same edit, with a value effect on `other`: its expected revision is right and no state effect names it.
    const writesOther = variant(small, (def) => def.acts.edit.effects.push({ of: "also.other", value: { slot: "text", from: { field: "text" } } }));
    expect(edit(writesOther)).toMatchObject([{ result: "refused", reason: "final" }, 2, null]);
  });
});

describe("range guards (section 6.5)", () => {
  // Kept notes, in ID order, with texts a, a, b, c. They are retained final items; `max` does not bound them.
  const s = new Scope(smallDefinition);
  for (const text of ["a", "a", "b", "c"]) {
    const note = s.did(rita, "write", fields({ owner: rita.member, text })).seq;
    s.did(rita, "keep", on(s, note));
  }
  // The scan stops after two items: it has seen a, a.
  const partial = { ...PROPOSED_BOUNDS, guardPage: 1, guardScan: 2 };
  const result = (kind: string, text: string, bounds = PROPOSED_BOUNDS) => {
    const j = s.judge(s.intent(rita, kind, { ...on(s, 0), ...fields({ text }) }), { bounds });
    return j.result === "write" ? "passes" : j.result === "refused" ? j.reason : j.result === "unavailable" ? j.reason : j.result;
  };

  test.each([
    // guard, text, on the unfinished scan, on every page
    ["has", "a", "passes", "passes"],                    // `some` holds by one witness
    ["has", "c", "guard-incomplete", "passes"],          // that `some` fails is an absence
    ["has", "z", "guard-incomplete", "guard-failed"],
    ["lacks", "a", "guard-failed", "guard-failed"],      // `none` fails by one witness
    ["lacks", "z", "guard-incomplete", "passes"],        // `none` over a final state is never passed on a partial scan
    ["few", "a", "guard-failed", "guard-failed"],        // `max` 1 is broken by two witnesses
    ["few", "b", "guard-incomplete", "passes"],          // a count within `max` is an upper bound
    ["enough", "a", "passes", "passes"],                 // `min` 2 is met by two witnesses
    ["enough", "b", "guard-incomplete", "guard-failed"], // that `min` is not met needs the whole set
  ])("%s %s: %s on an unfinished scan, %s on complete evidence", (kind, text, unfinished, complete) => {
    expect([result(kind, text, partial), result(kind, text)]).toEqual([unfinished, complete]);
  });

  test("a guard with no `where` is answered from the exact counts, whatever the scan limit", () => {
    const l = laneWithCommitment();
    l.bounds = { ...PROPOSED_BOUNDS, guardPage: 1, guardScan: 0 };
    expect(l.act(rita, "close", on(l, 0))).toMatchObject({ result: "refused", reason: "guard-failed", detail: "guards.2" });
  });
});

describe("idempotency (section 4.2)", () => {
  test("the same signed intent returns the first entry; another intent with its key and actor is a mismatch; a refusal consumes no key", () => {
    const s = new Scope(laneDefinition);
    const over = { fields: { intent: 0 }, expected: { intent: 1 }, idempotencyKey: "once" };
    const signed = s.intent(rita, "offer", over);

    // Refused for want of a grant: the key is not consumed, and the same intent is judged again.
    expect(s.submit(signed, { grants: [] }).result).toBe("refused");
    expect(s.submit(signed).result).toBe("write");
    const first = s.head;

    expect(s.submit(signed)).toEqual({ result: "accepted-before", seq: first.seq });
    // The key is consumed for the life of the scope: the exact retry returns the first entry also after its notAfter.
    expect(s.submit(signed, { reading: t(3600) })).toEqual({ result: "accepted-before", seq: first.seq });
    // The key stays with the first intent: another intent under it never takes effect, even one that would be refused.
    for (const kind of ["offer", "close"]) expect(s.submit(s.intent(rita, kind, { ...over, notAfter: t(30) }))).toEqual({ result: "mismatch", reason: "idempotency-mismatch" });
    expect(s.head).toEqual(first);

    // The key is scoped to the actor's key: the same text from another actor is another key.
    expect(s.act(sam, "remark", { on: 0, fields: { text: "hello" }, idempotencyKey: "once" }).result).toBe("write");
  });
});

describe("attribution (sections 6.7 and 10.2)", () => {
  test("a report after a handover is attributed to both performers, both holders and their principals", () => {
    const s = laneWithCommitment();                    // commitment 2: performer una
    const hold = s.did(una, "take-hold", under(s, 2)); // una holds, acting for paul
    expect(hold.effects.at(-1)).toEqual({ effect: "hold", item: hold.seq, change: "open", epoch: 1 });
    // A second hold under the same commitment is refused while the first is held.
    expect(s.act(una, "take-hold", under(s, 2))).toMatchObject({ result: "refused", reason: "guard-failed", detail: "guards.2" });
    s.now = t(600);
    expect(s.drain().map((j) => j.result)).toEqual(["write"]);
    s.did(rita, "assign", { ...on(s, 2), ...fields({ performer: vic.member }) });   // the handover
    s.did(vic, "take-hold", under(s, 2));              // vic holds, acting for quinn
    const report = s.did(vic, "report", under(s, 2));

    // The attribution is taken of the commitment, not of the new report, which has no history: una is in it.
    // The list is in byte order of member identifier, and not in the order in which the members joined the history.
    expect(names(s.item(report.seq).parties["authors"])).toEqual(["@paul", "@quinn", "@una", "@vic"]);
    // A hold ending changed the hold only: the commitment kept its performer through it.
    expect(s.item(hold.seq)).toMatchObject({ state: "ended", epoch: 2 });

    // `notIn: [authors]`: an author, a principal of one, and a key that acts for one are all refused; an outsider is not.
    const forPaul: Actor = { ...sam, principal: paul.member };
    const review = (who: Actor) => s.act(who, "accept-report", on(s, report.seq), { grants: [{ grant: grantOf(who, s.at, ["review"]), current: true }] }).result;
    expect([una, vic, paul, forPaul].map(review)).toEqual(["refused", "refused", "refused", "refused"]);
    expect(review(rita)).toBe("write");
    expect(s.replay().snapshot()).toBe(s.state.snapshot());
  });
});

describe("attribution within an entry, and under later authority (section 6.7)", () => {
  test("a holder set by an earlier effect of the entry is in the attribution; so is the principal of an attributed member's later grant", () => {
    // A report that first hands the hold under its commitment to the member in `to`, renews it, and then takes the attribution.
    const s = laneWithCommitment(variant(lane, (def) => {
      const report = def.acts.report;
      report.also = { ...report.also, hold: { item: "hold", by: "hold" } };
      report.fields = { ...report.fields, hold: { type: "item", of: "hold", required: true }, to: { type: "member", required: true } };
      report.effects.splice(2, 0, { of: "also.hold", party: { slot: "holder", from: { field: "to" } } }, { of: "also.hold", hold: { do: "renew" } });
    }));
    const hold = s.did(una, "take-hold", under(s, 2)).seq;
    const report = s.did(una, "report", { fields: { commitment: 2, hold, to: vic.member }, expected: { commitment: s.item(2).revision, hold: 1 } });
    // vic holds from this entry on, so vic is not outside the report's authors. Another signer set vic, so vic brings no principal.
    expect(names(s.item(report.seq).parties["authors"])).toEqual(["@paul", "@una", "@vic"]);

    // rita opens a note with una as owner: no grant of una's was judged. Later una edits it under a grant that names paul.
    const n = new Scope(smallDefinition);
    const note = n.did(rita, "write", fields({ owner: una.member, due: t(30) })).seq;
    expect(names(n.item(note).attributed)).toEqual(["@una"]);
    n.did(una, "edit", { ...on(n, note, { other: 0 }), fields: { text: "b", other: 0 } });
    expect(names(n.item(note).attributed)).toEqual(["@una", "@paul"]);
    expect(n.replay().snapshot()).toBe(n.state.snapshot());
  });
});

describe("a foreign fact (sections 5.1 and 6.5)", () => {
  test("a fact guard is judged on the fetched entry only, and the entry it read is recorded in `uses`", () => {
    const l = laneWithCommitment();
    const { entry, hash } = l.entries.at(-1)!;        // the lane's `assign` entry, which names una as performer
    const proof = { at: l.at, seq: entry.seq, hash };
    const fetched = { fact: proof, entry, under: "lane" };
    const s = new Scope(smallDefinition);
    const cite = (who: Actor, facts: (typeof fetched)[]) => s.act(who, "cite", { ...on(s, 0), ...fields({ proof }) }, { facts });

    // Not fetched, or fetched bytes that are not the entry the reference names: the act is not judged.
    expect(cite(una, [])).toEqual({ result: "unavailable", reason: "dependency-unavailable" });
    expect(cite(una, [{ ...fetched, entry: { ...entry, clamped: true } }])).toEqual({ result: "unavailable", reason: "dependency-unavailable" });
    // Under a definition of another name, or with a `where` that does not hold, the guard fails.
    expect(cite(una, [{ ...fetched, under: "change" }])).toMatchObject({ result: "refused", reason: "guard-failed", detail: "guards.1" });
    expect(cite(vic, [fetched])).toMatchObject({ result: "refused", reason: "guard-failed", detail: "guards.1" });

    expect(cite(una, [fetched]).result).toBe("write");
    const written = s.entries.at(-1)!.entry;
    expect(written.uses).toEqual([{ fact: proof, content: digestBytes(canonicalBytes(entry)) }]);
    // An effect may take a member from a field of the fetched fact.
    expect(names(s.item(0).parties["readers"])).toEqual(["@una"]);
  });

  test("each fact reference is verified whole: one that shares a verified hash and names another scope and position is not taken for it", () => {
    const l = laneWithCommitment();
    const { entry, hash } = l.entries.at(-1)!;
    const proof = { at: l.at, seq: entry.seq, hash };
    // `cite` with a second fact field, later in byte order than `proof`.
    const s = new Scope(variant(small, (def) => { def.acts.cite.fields.second = { type: "fact", kind: ["assign"], under: "lane", required: false }; }));
    const cite = (second: typeof proof) => s.act(una, "cite", { ...on(s, 0), ...fields({ proof, second }) }, { facts: [{ fact: proof, entry, under: "lane" }] });
    expect(cite({ at: otherLane, seq: 99, hash })).toEqual({ result: "unavailable", reason: "dependency-unavailable" });
    // Two references that both pass are one reference: the entry is used once.
    expect(cite(proof).result).toBe("write");
    expect(s.last.uses.map((u) => u.fact)).toEqual([proof]);
  });
});

describe("a scope that is not active (section 7.2)", () => {
  test("a provisional scope judges no act, and the answer is not a refusal", () => {
    const s = new Scope(laneDefinition, rita.member, false);
    expect(s.act(rita, "offer", { fields: { intent: 0 }, expected: { intent: 1 } })).toEqual({ result: "unavailable", reason: "scope-provisional" });
    expect(s.head.seq).toBe(0);
  });
});
