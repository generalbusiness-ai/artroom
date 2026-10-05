import { describe, expect, test } from "vitest";
import { canonicalBytes, canonicalize, digestBytes, intentDigest, signIntent } from "@generalbusiness/artroom-bytes";
import { Scope, grantOf, laneDefinition } from "@generalbusiness/artroom-derive/testing";
import { at, definition, found, rita, una } from "./support.ts";

describe("the answers to a submitted act, on real storage (section 4.2)", () => {
  test("accepted, with a receipt that an exact retry and a settlement return again; mismatch; refused, which writes nothing and consumes no key; and, with the test authority, a stand-in, silent, a new act is not judged while an accepted key keeps its receipt", async () => {
    const s = await found();
    const offer = s.offer();
    const accepted = await s.submit(offer);
    expect(accepted).toMatchObject({
      answer: "accepted",
      receipt: { fact: { at: s.at, seq: 1 }, definition: definition.digest, intent: intentDigest(offer.intent), effects: [{ effect: "open", item: 1, type: "commitment", state: "offered" }, {}, {}], sends: [], epoch: 0 },
    });
    if (accepted.answer !== "accepted") return;
    const head = { seq: 1, hash: accepted.receipt.fact.hash };
    expect(await s.head()).toEqual(head);

    // An exact retry returns the same receipt and writes nothing.
    expect([await s.submit(offer), await s.head()]).toEqual([accepted, head]);
    // The same key and actor with another intent digest: the key stays with the first.
    expect(await s.submit(signIntent({ ...offer.intent, notAfter: at(30) }, rita.secret))).toEqual({ answer: "mismatch", reason: "idempotency-mismatch" });

    // Refused, here for want of a grant: the answer names the head it was judged at, and nothing is written.
    const assign = s.intent(rita, "assign", { on: 1, expected: { on: 1 }, fields: { performer: una.member } });
    expect([await s.submit(assign, []), await s.head()]).toEqual([{ answer: "refused", reason: "unauthorized", judgedAt: head }, head]);
    // Its key was not consumed: the same signed intent is judged again, and with a grant it is accepted.
    expect(await s.submit(assign)).toMatchObject({ answer: "accepted", receipt: { fact: { seq: 2 } } });

    // Settlement: the receipt by the exact signed intent, long after its `notAfter`. It admits nothing. An intent that was never accepted is not found.
    s.c.clock.now = at(86_400);
    const settled = await s.stub.settle(offer);
    expect(settled).toEqual({ ok: true, at: await s.head(), value: accepted.receipt, complete: true });
    expect([await s.stub.settle(s.offer()), (await s.head()).seq]).toEqual([{ ok: false, reason: "not-found" }, 2]);

    // The read of authority before the turn gives nothing, as when membership does not answer. The test authority is a stand-in:
    // this shows what the scope does with no read, and nothing about an observation. A new act is not judged, and nothing is written.
    s.c.authority = false;
    const later = s.offer();
    expect([await s.submit(later), (await s.head()).seq]).toEqual([{ answer: "unavailable", reason: "authority-unavailable" }, 2]);
    // An accepted key is answered from history. It needs no read, so a lost authority does not hide its receipt.
    expect(await s.submit(offer)).toEqual(accepted);
    // The key of the act that was not judged was not consumed: with a read, the same signed intent is accepted.
    s.c.authority = true;
    expect(await s.submit(later)).toMatchObject({ answer: "accepted", receipt: { fact: { seq: 3 } } });
  });

  test("an act whose entry would pass the size bound is refused and nothing is written", async () => {
    // The smallest bound that still holds the end of a hold with its attention, which the validator requires of the definition.
    const s = await found({ entryBytes: 4096 });
    const head = await s.head();
    // The entry records the grant that was judged. One whose list of actions is long makes the entry too large.
    const grant = grantOf(rita, s.at, ["offer", "x".repeat(4096)]);
    expect([await s.submit(s.offer(), [grant]), await s.head()]).toEqual([{ answer: "refused", reason: "bad-field", judgedAt: head }, head]);
  });

  test("unavailable: an act that names a foreign entry the resolver cannot read holds nothing; once it can, the entry's bytes are retained with the act, and its accepted key answers without the dependency", async () => {
    // Another scope's entry, from derive's fixture lane: an `assign`.
    const l = new Scope(laneDefinition);
    l.did(rita, "offer", { fields: { intent: 0 }, expected: { intent: 1 } });
    const entry = l.did(rita, "assign", { on: 2, expected: { on: 1 }, fields: { performer: una.member } });
    const proof = l.fact(entry.seq);

    const s = await found();
    const remark = s.intent(rita, "remark", { on: 0, fields: { text: "see the proof", proof } });
    expect([await s.submit(remark), (await s.head()).seq]).toEqual([{ answer: "unavailable", reason: "dependency-unavailable" }, 0]);

    s.c.foreign.set(proof.hash, { entry, under: "lane" });
    const accepted = await s.submit(remark);
    expect(accepted).toMatchObject({ answer: "accepted", receipt: { fact: { seq: 1 } } });
    // The key is now on a sealed entry, and its answers come from history with no fetch: when the dependency is lost, the exact
    // retry still gets its receipt, and another intent under the key is still a mismatch.
    s.c.foreign.delete(proof.hash);
    const other = signIntent({ ...remark.intent, fields: { text: "another", proof } }, rita.secret);
    expect([await s.submit(remark), await s.submit(other)]).toEqual([accepted, { answer: "mismatch", reason: "idempotency-mismatch" }]);
    const content = digestBytes(canonicalBytes(entry));
    expect((await s.entries(1))[0]!.uses).toEqual([{ fact: proof, content }]);
    // Section 9.2: the definition's bytes and the foreign entry's bytes are in the scope's own storage.
    const retained = await s.inside((state) => state.storage.sql.exec("SELECT kind, digest, bytes, under FROM retained_input ORDER BY kind").toArray());
    expect(retained).toEqual([
      { kind: "definition", digest: definition.digest, bytes: canonicalize(definition.declared), under: null },
      { kind: "entry", digest: content, bytes: canonicalize(entry), under: "lane" },
    ]);
  });
});
