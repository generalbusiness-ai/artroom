import { describe, expect, test } from "vitest";
import type { Duty, Entry, Read } from "@generalbusiness/artroom-contract";
import { entryHash } from "@generalbusiness/artroom-bytes";
import type { Delivered } from "@generalbusiness/artroom-derive";
import { incidentsOf, type Incident, type Resent } from "../src/index.ts";
import { desk, later, net, settle, ticket, una, type Node } from "./net.ts";
import { reader } from "./support.ts";

// The plan's T41 (authority note, section 12, G13 and G17; the contract's section 7.4). Real scopes in the namespace `NET`, with the test
// authority and the test readers, both STAND-INS. That an incident with no entry is written to the record by the runtime that found
// it is witnessed in `operations.test.ts`, T19, where an answer contradicts a recorded outcome.

interface Surface {
  incidents(reader: unknown, cursor?: string): Promise<Read<readonly Incident[]>>;
  waiting(reader: unknown, list: "diagnosed" | "unanswered", cursor?: string): Promise<Read<readonly Duty[]>>;
  resend(duty: unknown): Promise<Resent>;
}
const surface = (node: Node) => node.object as unknown as Surface;
const listed = async (node: Node, list: "diagnosed" | "unanswered") => {
  const read = await surface(node).waiting(reader, list);
  if (!read.ok) throw new Error(read.reason);
  return read.value.map((duty) => duty.duty);
};
const recorded = async (node: Node) => {
  const read = await surface(node).incidents(reader);
  if (!read.ok) throw new Error(read.reason);
  return read.value.map(({ kind, refs, scope }) => ({ kind, refs, scope }));
};

describe("the operator's record and the requests that wait (authority note, section 12, G13 and G17)", () => {
  test("T41: the two lists are bounded reads of the scope's own sends, and nothing is inferred from either; an instruction to send again dispatches the same envelope once, writes no entry and no second diagnosis, and is written to the operator's record, which no judgment reads", async () => {
    const D = await desk();
    const S = await ticket(D, "S");
    // A request to an incarnation that the desk does not have: every attempt is refused, and it ends `undelivered`. It waits in no list.
    const lost = { ...(await D.at()), inc: (await S.at()).inc };
    const refused = await S.did(una, "ask", { fields: { desk: lost } });
    await settle(S);
    // A second one whose first attempt gets no answer: it ends `delivery-unavailable`, and stays pending.
    net.hold = () => true;
    const diagnosed = await S.did(una, "ask", { fields: { desk: lost } });
    await settle(S);
    net.hold = null;
    for (const seconds of [1, 2, 4]) await later(seconds, S);
    // A third one, to the real desk, which records it. Its result is held, so transport acknowledged a request that has no result.
    net.hold = (envelope: Delivered) => envelope.message.class === "result";
    const unanswered = await S.did(una, "ask", { fields: { desk: await D.at() } });
    await settle(S, D);

    const duty = (receipt: { fact: { seq: number } }) => `${receipt.fact.seq}.0`;
    expect([await listed(S, "diagnosed"), await listed(S, "unanswered"), await recorded(S)]).toEqual([[duty(diagnosed)], [duty(unanswered)], []]);
    // A page is bounded, and says so: a cursor that names no send is `not-found`, and a list of another name is none.
    expect([(await surface(S).waiting(reader, "diagnosed", "x")).ok, (await surface(S).waiting(reader, "others" as never)).ok]).toEqual([false, false]);

    // The operator's instruction names the diagnosed request by its entry and ordinal. Transport is watched, and still holds results.
    const before = { summary: await S.summary(), entries: (await S.entries()).length, row: (await S.duties()).find((d) => d.duty === duty(diagnosed))! };
    const sent: Delivered[] = [];
    net.hold = (envelope: Delivered) => { if (envelope.message.class !== "result") sent.push(envelope); return envelope.message.class === "result"; };
    const answer = await surface(S).resend(duty(diagnosed));
    // One dispatch, of the same envelope: the same source entry, ordinal and message. The request keeps its identity.
    expect([answer, sent]).toEqual([{ sent: true, answer: "wrong-incarnation" }, [await S.envelope(diagnosed.fact.seq)]]);
    // It is bookkeeping: no entry, the same state at the same head, no second diagnosis, and one more attempt in the log of that send. No
    // retry follows by itself. The request still waits, in the same list.
    const after = (await S.duties()).find((d) => d.duty === duty(diagnosed))!;
    await settle(S);
    for (const seconds of [60, 600]) await later(seconds, S);
    expect([await S.summary().then((s) => [s.at, s.value.items]), (await S.entries()).length, after.diagnosis, after.result, after.attempts.length, sent.length, await listed(S, "diagnosed")])
      .toEqual([[before.summary.at, before.summary.value.items], before.entries, before.row.diagnosis, null, before.row.attempts.length + 1, 1, [duty(diagnosed)]]);
    // It is written to the operator's record, with the scope and the duty, and nothing else.
    expect(await recorded(S)).toEqual([{ kind: "sent-again", refs: [{ duty: duty(diagnosed) }], scope: await S.at() }]);

    // A request that is in neither list is not sent again: one that was settled `undelivered`, one that no entry sent, and a value that is no duty ID.
    expect([await surface(S).resend(duty(refused)), await surface(S).resend("999.0"), await surface(S).resend({ duty: 1 }), sent.length, (await recorded(S)).length])
      .toEqual([{ sent: false, reason: "not-waiting" }, { sent: false, reason: "not-found" }, { sent: false, reason: "not-found" }, 1, 1]);

    // The acknowledged request is sent again, once: the desk answers with the fact of the entry that recorded it before. Then its late result
    // arrives and settles it, and it waits in no list.
    expect([await surface(S).resend(duty(unanswered)), sent.length]).toEqual([{ sent: true, answer: "acknowledged" }, 2]);
    // The desk's second attempt of the result was made, and held, when the request reached it again. Its third is due after the retry delay.
    net.hold = null;
    await later(5, D, S);
    expect([await listed(S, "unanswered"), (await S.duties()).find((d) => d.duty === duty(unanswered))!.result?.clause, (await recorded(S)).map((row) => row.kind)]).toEqual([[], "applied", ["sent-again", "sent-again"]]);
  });

  test("T41: an incident that writes an entry is in that entry, and the record reads it from there: a creation's result that ran `conflict` names its entry and the entry of its request. The entry is MADE BY HAND: no second incarnation can be made in one namespace", () => {
    const at = { scope: "s", inc: "i", kind: "directory" } as never;
    const entry = {
      v: 1, at, seq: 9, prev: null, time: net.clock.now, clamped: false, epoch: 0, uses: [], prepared: [], effects: [{ effect: "state", item: 3, state: "conflicted" }], sends: [],
      input: { type: "delivery", from: { at, seq: 0, hash: "sha256:" + "1".repeat(64) }, n: 0, clause: "conflict", message: { class: "result", type: "create", outcome: "applied", of: { from: { at, seq: 3, hash: "sha256:" + "2".repeat(64) }, n: 0 } } },
    } as unknown as Entry;
    const hash = entryHash(entry);
    expect([incidentsOf(entry, hash), incidentsOf({ ...entry, input: { ...entry.input, clause: "applied" } } as Entry, hash)]).toEqual([[{ kind: "incarnation-conflict", refs: [{ entry: 9, hash }, { entry: 3 }] }], []]);
  });
});
