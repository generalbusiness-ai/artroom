import { describe, expect, test } from "vitest";
import { canonicalBytes, canonicalize, digestBytes, intentDigest, signIntent } from "@generalbusiness/artroom-bytes";
import { Scope, laneDefinition } from "@generalbusiness/artroom-derive/testing";
import { at, definition, found, rita, una } from "./support.ts";

describe("the answers to a submitted act, on real storage (section 4.2)", () => {
  test("accepted, with a receipt that an exact retry and a settlement return again; mismatch; and refused, which writes nothing and consumes no key", async () => {
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
  });

  test("an act whose entry would pass the size bound is refused and nothing is written", async () => {
    const s = await found();
    // The bound is read when the object starts: 100 bytes from the restart on, which no entry fits.
    s.c.bounds = { ...s.c.bounds, entryBytes: 100 };
    await s.restart();
    const head = await s.head();
    expect([await s.submit(s.offer()), await s.head()]).toEqual([{ answer: "refused", reason: "bad-field", judgedAt: head }, head]);
  });

  test("unavailable: an act that names a foreign entry the resolver cannot read holds nothing; once it can, the entry's bytes are retained with the act", async () => {
    // Another scope's entry, from derive's fixture lane: an `assign`.
    const l = new Scope(laneDefinition);
    l.did(rita, "offer", { fields: { intent: 0 }, expected: { intent: 1 } });
    const entry = l.did(rita, "assign", { on: 2, expected: { on: 1 }, fields: { performer: una.member } });
    const proof = l.fact(entry.seq);

    const s = await found();
    const remark = s.intent(rita, "remark", { on: 0, fields: { text: "see the proof", proof } });
    expect([await s.submit(remark), (await s.head()).seq]).toEqual([{ answer: "unavailable", reason: "dependency-unavailable" }, 0]);

    s.c.foreign.set(proof.hash, { entry, under: "lane" });
    expect(await s.submit(remark)).toMatchObject({ answer: "accepted", receipt: { fact: { seq: 1 } } });
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
