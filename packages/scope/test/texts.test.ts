import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { expect, test } from "vitest";
import type { DeclaredDefinition, Digest, Entry, Seed } from "@generalbusiness/artroom-contract";
import { scopeIdOf, textDigest } from "@generalbusiness/artroom-bytes";
import { timeMs } from "@generalbusiness/artroom-derive";
import { grantOf, variant } from "@generalbusiness/artroom-derive/testing";
import { found, httpTransport, secretSigner, signedIntent } from "@generalbusiness/artroom-client";
import { TRUSTS, httpSource, verify } from "@generalbusiness/artroom-replay";
import { Node, founding, later, net, rita, routed, settle } from "./net.ts";
import { reader } from "./support.ts";

/**
 * A made-up definition with one detached text (section 6.2): a note whose
 * body is held beside the intent and named in it by digest. `strike`
 * redacts it. `copy` creates a scope under the same definition, with the
 * note's body in the creation message. `share` stores a peer lane in the
 * note and tells it the body, and the peer's handler opens a note with it.
 */
const body = { type: "text", max: 40, detached: true } as const;
const base: DeclaredDefinition = {
  format: "artroom-definition-1", name: "notes", profile: { name: "restricted", version: 1 }, capabilities: [], genesis: "start",
  items: {
    note: { many: true, max: 8, states: { kept: { final: false }, struck: { final: true } }, initial: "kept", parties: {}, refs: { peer: { fixed: false, required: false, to: { type: "scope", kind: "lane" } } }, values: { body: { fixed: false, required: false, of: body } } },
  },
  acts: {},
  receives: {}, timed: {}, rules: {},
};
const notes = variant(base, (def) => {
  const act = (a: object) => ({ on: "note", also: {}, fields: {}, guards: [], effects: [], sends: [], attention: [], ...a });
  const kept = [{ state: ["kept"] }];
  const write = [{ value: { slot: "body", from: { field: "body" } } }];
  def.acts = {
    start: act({ step: "open", grant: "start", fields: { body: { ...body, required: false } }, effects: write }),
    write: act({ step: "open", grant: "write", fields: { body: { ...body, required: true } }, effects: write }),
    edit: act({ step: "transition", grant: "write", fields: { body: { ...body, required: true } }, guards: kept, effects: write }),
    strike: act({ step: "transition", grant: "strike", guards: kept, effects: [{ state: "struck" }, { redact: { slot: "body" } }] }),
    copy: act({ step: "transition", grant: "write", guards: kept, sends: [{ create: { kind: "lane", definition: "self", fields: { body: { slot: "body" } }, result: {} } }] }),
    share: act({ step: "transition", grant: "write", fields: { peer: { type: "scope", kind: "lane", required: true } }, guards: kept, effects: [{ ref: { slot: "peer", from: { field: "peer" } } }], sends: [{ tell: { to: { slot: "peer" }, message: "noted", fields: { body: { slot: "body" } }, result: {} } }] }),
  };
  def.receives = { noted: { message: "noted", class: "tell", from: { kind: "lane" }, opens: "note", fields: { body: { ...body, required: true } }, also: {}, guards: [], effects: write, sends: [], attention: [] } };
});
const source = httpSource("https://scopes.test", { fetch: routed });

test("a detached text over the real route: the entry holds its digest and the scope keeps its bytes; a text that is not the one named is bad-field; a redaction removes the bytes, and replay reports them as redacted", async () => {
  net.hold = net.deaf = null;
  const signer = secretSigner(rita.secret);
  const now = timeMs(net.clock.now)!;
  const transport = httpTransport("https://scopes.test", { fetch: routed });
  const { answer, scope } = await found(transport, await signedIntent(signer, { to: null, kind: "found" }, { now }), notes.declared, [], reader);
  if (answer.answer !== "accepted" || !scope) throw new Error(`not founded: ${JSON.stringify(answer)}`);
  const at = answer.receipt.fact.at;
  const grants = [grantOf(rita, at, ["write", "strike"])];
  const [first, second, third] = ["A first body.", "A second body, edited.", "Another note."];
  const [t1, t2, t3] = [textDigest(first), textDigest(second), textDigest(third)];
  const act = async (kind: string, fields: { body?: string }, texts: string[], on: number | null = null, expected: Record<string, number> = {}) =>
    scope.submit(await signedIntent(signer, { to: at, kind, on, expected, fields }, { now }), grants, { texts });

  // The intent names the text by digest, and the text travels beside it. The entry holds the digest only.
  const wrote = await act("write", { body: t1 }, [first]);
  if (wrote.answer !== "accepted") throw new Error(`not accepted: ${JSON.stringify(wrote)}`);
  const note = wrote.receipt.fact.seq;
  const entry = await scope.entry(note);
  expect(wrote.receipt.effects).toContainEqual({ effect: "value", item: note, slot: "body", value: t1 });
  expect(JSON.stringify(entry)).not.toContain(first);
  expect(await scope.text(t1)).toMatchObject({ ok: true, value: first });

  // A mismatch is `bad-field`, and writes nothing: another text than the digest names, no text at all, a text past the field's
  // `max`, and the text itself where its digest belongs.
  const long = "x".repeat(41);
  const refusals = [await act("write", { body: t2 }, [first]), await act("write", { body: t2 }, []), await act("write", { body: textDigest(long) }, [long]), await act("write", { body: second }, [second])];
  expect(refusals.map((refused) => [refused.answer, "reason" in refused && refused.reason])).toEqual(Array(4).fill(["refused", "bad-field"]));
  expect([(await scope.summary()), await scope.text(t2)]).toMatchObject([{ ok: true, at: { seq: note } }, { ok: false, reason: "not-found" }]);

  // An edit, then the redaction: its entry is the tombstone of every text the slot has held, and the bytes of each are removed.
  expect(await act("edit", { body: t2 }, [second], note, { on: 1 })).toMatchObject({ answer: "accepted" });
  const struck = await act("strike", {}, [], note, { on: 2 });
  if (struck.answer !== "accepted") throw new Error(`not accepted: ${JSON.stringify(struck)}`);
  expect(struck.receipt.effects).toEqual([{ effect: "state", item: note, state: "struck" }, { effect: "redact", item: note, slot: "body", texts: [t1, t2] }]);
  expect([await scope.text(t1), await scope.text(t2)]).toEqual([{ ok: false, reason: "not-found" }, { ok: false, reason: "not-found" }]);
  // The struck note keeps its digest.
  expect(await scope.items("note")).toMatchObject({ ok: true, value: [{ id: note, state: "struck", values: { body: t2 } }] });

  // Replay derives every entry again. The two texts are not missing: they are reported as redacted, with the tombstone.
  expect(await act("write", { body: t3 }, [third])).toMatchObject({ answer: "accepted" });
  const replayed = async () => verify(source, { mode: "replay", scope: at.scope });
  const { report, why } = await replayed();
  expect([report.result, why, report.redacted]).toEqual(["consistent", null, [{ tombstone: struck.receipt.fact, item: note, slot: "body" }]]);
  expect(report.trusts).toContain(TRUSTS.redacted);
  // The bytes of a text that no entry redacts are a retained input. With other bytes under its digest, or with none, the replay
  // claims nothing.
  const kept = (query: string, ...bindings: string[]) => runInDurableObject(env.NET.get(env.NET.idFromName(at.scope)), (_instance, state) => state.storage.sql.exec(query, ...bindings).toArray());
  await kept("UPDATE retained_input SET bytes = ? WHERE kind = 'text' AND digest = ?", JSON.stringify(first), t3);
  const altered = (await replayed()).report;
  await kept("DELETE FROM retained_input WHERE kind = 'text' AND digest = ?", t3);
  expect([altered, (await replayed()).report]).toMatchObject(Array(2).fill({ result: "incomplete", at: { seq: note + 3 } }));
});

test("a detached text in a creation message: the child reads the bytes from its creator and keeps them; when the creator has redacted the text first, the creation is not decided", async () => {
  net.hold = net.deaf = null;
  const { signed, name } = founding(notes, {});
  const P = new Node(name, notes.declared);
  expect(await P.stub.found(signed, notes.declared)).toMatchObject({ answer: "accepted" });
  const write = async (text: string) => {
    const answer = await P.stub.submit(await P.intent(rita, "write", { fields: { body: textDigest(text) } }), await P.grants(), { texts: [text] });
    if (answer.answer !== "accepted") throw new Error(`not accepted: ${JSON.stringify(answer)}`);
    return answer.receipt.fact.seq;
  };
  const child = async (seq: number) => new Node(scopeIdOf((await P.entries())[seq]!.sends[0]!.to as Seed), notes.declared);
  const genesis = (entries: readonly Entry[]) => entries[0]?.input;

  // The message carries the digest, and the child reads the text from P before its genesis turn. While P serves other bytes than
  // the digest names, the child records nothing.
  const shared = "A body that is copied.";
  const a = await write(shared);
  const serves = (text: string) => runInDurableObject(P.object, (_instance, state) => state.storage.sql.exec("UPDATE retained_input SET bytes = ? WHERE kind = 'text' AND digest = ?", JSON.stringify(text), textDigest(shared)).toArray());
  net.hold = () => true;
  const copied = await P.did(rita, "copy", { on: a, expected: { on: 1 } });
  const K = await child(copied.fact.seq);
  await serves("Another body.");
  net.hold = null;
  await later(1, P);
  expect(await K.stub.summary(reader)).toMatchObject({ ok: false });
  // With the bytes that the digest names, the child writes its genesis, and retains the text under that digest.
  await serves(shared);
  await later(2, P, K);
  expect(genesis(await K.entries())).toMatchObject({ type: "genesis", decision: "applied", message: { body: { fields: { body: textDigest(shared) } } } });
  expect(await (K.stub as unknown as { retained(reader: unknown, kind: string, digest: Digest): Promise<unknown> }).retained(reader, "text", textDigest(shared))).toMatchObject({ ok: true, value: { bytes: JSON.stringify(shared) } });
  expect((await verify(source, { mode: "replay", scope: K.name })).report).toMatchObject({ result: "consistent", redacted: [] });
  // P answers for a text only to the receiver of a send that names it: the entry that wrote the note sent nothing.
  const asks = P.stub as unknown as { text(seq: number, digest: Digest): Promise<string | null> };
  expect([await asks.text(copied.fact.seq, textDigest(shared)), await asks.text(a, textDigest(shared))]).toEqual([JSON.stringify(shared), null]);

  // The send is held, and P redacts the text before it is delivered. The child cannot read the bytes, so it records nothing, and
  // P keeps the duty. What ends such a duty is not decided by the contract.
  const b = await write("A body that is struck first.");
  net.hold = () => true;
  const late = await P.did(rita, "copy", { on: b, expected: { on: 1 } });
  await P.did(rita, "strike", { on: b, expected: { on: 1 } });
  net.hold = null;
  await later(1, P);
  const L = await child(late.fact.seq);
  expect(await L.stub.summary(reader)).toMatchObject({ ok: false });
  const duty = (await P.duties()).find((d) => d.duty === `${late.fact.seq}.0`)!;
  expect([duty.result, duty.diagnosis, duty.acknowledged, duty.attempts.at(-1)?.answer]).toEqual([null, null, null, "retry"]);
});

test("a repeat of a decided send is answered from the entry that recorded it, and writes nothing, after both scopes have redacted the text that the message carries", async () => {
  net.hold = net.deaf = null;
  const { signed, name } = founding(notes, {});
  const P = new Node(name, notes.declared);
  expect(await P.stub.found(signed, notes.declared)).toMatchObject({ answer: "accepted" });
  const text = "A body that is told.";
  const wrote = await P.stub.submit(await P.intent(rita, "write", { fields: { body: textDigest(text) } }), await P.grants(), { texts: [text] });
  if (wrote.answer !== "accepted") throw new Error(`not accepted: ${JSON.stringify(wrote)}`);
  // Two lanes, each with the note of its genesis. A stores B as the note's peer and tells it the body: B reads the text from A,
  // and its handler opens a note with it.
  const lane = async () => {
    const copied = await P.did(rita, "copy", { on: wrote.receipt.fact.seq, expected: { on: 1 } });
    return new Node(scopeIdOf((await P.entries())[copied.fact.seq]!.sends[0]!.to as Seed), notes.declared);
  };
  const [A, B] = [await lane(), await lane()];
  await settle(P, A, B);
  const shared = await A.did(rita, "share", { on: 0, expected: { on: 1 }, fields: { peer: await B.at() } });
  await settle(A, B);
  const told = (await B.sealed()).at(-1)!;
  expect(told.entry).toMatchObject({ input: { type: "delivery", from: shared.fact, decision: "applied" }, effects: [{ effect: "open" }, { effect: "value", slot: "body", value: textDigest(text) }] });

  // Both redact the text, so neither holds its bytes. The same envelope again is still that send of that entry of A. B answers it
  // with the fact of the entry that decided it, as it answered the first delivery, and its head does not move.
  await A.did(rita, "strike", { on: 0, expected: { on: 2 } });
  await B.did(rita, "strike", { on: told.entry.seq, expected: { on: 1 } });
  const asks = A.stub as unknown as { text(seq: number, digest: Digest): Promise<string | null> };
  const keeps = B.stub as unknown as { retained(reader: unknown, kind: string, digest: Digest): Promise<unknown> };
  const head = (await B.summary()).at;
  expect([
    await asks.text(shared.fact.seq, textDigest(text)), await keeps.retained(reader, "text", textDigest(text)),
    await B.stub.deliver(await A.envelope(shared.fact.seq)),
    (await B.summary()).at,
  ]).toMatchObject([null, { ok: false }, { answer: "recorded", fact: { at: told.entry.at, seq: told.entry.seq, hash: told.hash } }, head]);
});
