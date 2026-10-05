import { expect, test } from "vitest";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import { publicKeyOf, verifySignedIntent } from "@generalbusiness/artroom-bytes";
import { ScopeHandle, TransportError, bindingTransport, found, httpTransport, signedIntent, webCryptoSigner, type ServiceBinding, type Transport } from "../src/index.ts";

test("an intent signed by a WebCrypto key that cannot be read is one the bytes package verifies; each intent has a fresh idempotency key and a notAfter within the lifetime bound", async () => {
  const signer = await webCryptoSigner();
  // All a signer gives out is its key ID, which names a 32-byte public key, and signatures.
  expect([Object.keys(signer), publicKeyOf(signer.key)?.length]).toEqual([["key", "sign"], 32]);
  const now = Date.parse("2026-10-04T12:00:00.250Z");
  const asked = { to: null, kind: "found", fields: { source: "a repository" } };
  const [first, second] = [await signedIntent(signer, asked, { now }), await signedIntent(signer, asked, { now })];
  expect([verifySignedIntent(first), verifySignedIntent(second)]).toEqual([true, true]);
  // A signature over other bytes is not that intent's: the check is of these bytes, by this key.
  expect(verifySignedIntent({ intent: { ...first.intent, kind: "other" }, sig: first.sig })).toBe(false);
  expect(first.intent).toMatchObject({ v: 1, actor: signer.key, on: null, expected: {}, notAfter: "2026-10-04T12:05:00Z" });
  expect(first.intent.idempotencyKey).not.toBe(second.intent.idempotencyKey);
  // The bound is the latest a notAfter may be, and nothing later is signed.
  const longest = await signedIntent(signer, asked, { now, lifetimeSeconds: PROPOSED_BOUNDS.intentLifetimeSeconds });
  expect(longest.intent.notAfter).toBe("2026-10-04T12:15:00Z");
  await expect(signedIntent(signer, asked, { now, lifetimeSeconds: PROPOSED_BOUNDS.intentLifetimeSeconds + 1 })).rejects.toThrow(RangeError);
});

test("a reply is an outcome only when it is an answer of its operation: a discriminant the contract names, with what that answer must carry; anything else is a TransportError", async () => {
  const d = `sha256:${"a".repeat(64)}`;
  const fact = { at: { scope: `sc_${"a".repeat(52)}`, inc: `in_${"a".repeat(26)}`, kind: "lane" }, seq: 1, hash: d };
  const receipt = { fact, definition: d, intent: d, effects: [], sends: ["1.0"], epoch: 0 };
  const replying = (reply: unknown) => httpTransport("https://scopes.test", { fetch: () => Promise.resolve({ status: 200, text: () => Promise.resolve(JSON.stringify(reply)) }) });
  const submit = (reply: unknown) => replying(reply).submit(fact.at.scope, {} as never, []);
  const settle = (reply: unknown) => replying(reply).settle(fact.at.scope, {} as never);
  // Each has the member its route's answers have, and is not one of them.
  for (const reply of [{ answer: null }, { answer: "accepted" }, { answer: "accepted", receipt: {} }, { answer: "refused", reason: "guard-failed" }, { answer: "refused", reason: "no", judgedAt: fact }, { answer: "done" }]) {
    await expect(submit(reply)).rejects.toThrow(TransportError);
  }
  for (const reply of [{ ok: "yes" }, { ok: true }, { ok: true, at: fact, value: {}, complete: true }, { ok: false }, { ok: false, reason: "gone" }]) await expect(settle(reply)).rejects.toThrow(TransportError);
  // An answer of the route is returned as it came.
  const answers = [{ answer: "accepted", receipt }, { answer: "refused", reason: "guard-failed", judgedAt: { seq: 1, hash: d } }, { answer: "unavailable", reason: "busy" }, { answer: "mismatch", reason: "idempotency-mismatch" }];
  for (const answer of answers) expect(await submit(answer)).toEqual(answer);
  expect(await settle({ ok: true, at: { seq: 1, hash: d }, value: receipt, complete: true })).toMatchObject({ ok: true, value: receipt });
  expect(await settle({ ok: false, reason: "not-found" })).toEqual({ ok: false, reason: "not-found" });
});

test("on both transports, each operation of the handle returns a reply only when it has every member the contract requires of that operation's result; with one member missing or of another kind it is a TransportError", async () => {
  const d = `sha256:${"a".repeat(64)}`;
  const scope = { scope: `sc_${"a".repeat(52)}`, inc: `in_${"a".repeat(26)}`, kind: "lane" };
  const head = { seq: 1, hash: d };
  const fact = { at: scope, ...head };
  const receipt = { fact, definition: d, intent: d, effects: [{ effect: "activate" }], sends: ["1.0"], epoch: 0 };
  const item = { id: 1, type: "note", state: "draft", revision: 1, opened: d, parties: {}, refs: {}, values: {}, attributed: [] };
  const entry = { v: 1, at: scope, seq: 1, prev: d, time: "2026-10-04T12:00:00Z", clamped: false, epoch: 0, input: { type: "checkpoint", through: 0, state: d }, uses: [], prepared: [], effects: [], sends: [] };
  const sealed = { entry, hash: d };
  const duty = { duty: "1.0", to: scope, class: "request", held: false, attempts: [{ at: entry.time, answer: "none" }], acknowledged: null, result: null, diagnosis: null };
  const summary = { scope, status: "active", definition: "platform:directory@1", time: entry.time, items: [item], counts: [["note", "draft", 1]] };
  const read = (value: unknown, more: object = {}) => ({ ok: true, at: head, value, complete: true, ...more });
  const less = (whole: Record<string, unknown>, member: string) => Object.fromEntries(Object.entries(whole).filter(([name]) => name !== member));
  /** Every reply that is `whole` without one of its members. */
  const each = (whole: Record<string, unknown>) => Object.keys(whole).map((member) => less(whole, member));

  // For each operation as the handle calls it: replies that are its result, then replies that are not.
  type Row = [name: string, call: (t: Transport) => Promise<unknown>, good: unknown[], bad: unknown[]];
  const handle = (t: Transport) => new ScopeHandle(t, scope.scope as never);
  const refused = { ok: false, reason: "not-found" };
  const rows: Row[] = [
    ["found", (t) => found(t, {} as never, d as never).then((f) => f.answer),
      [{ answer: "accepted", receipt }, { answer: "refused", reason: "unsupported-definition" }, { answer: "refused", reason: "source-unverified" }, { answer: "unavailable", reason: "busy" }],
      [{ answer: "mismatch", reason: "idempotency-mismatch" }, { answer: "refused", reason: "not-found" }, ...each(receipt).map((r) => ({ answer: "accepted", receipt: r }))]],
    ["submit", (t) => handle(t).submit({} as never), [{ answer: "accepted", receipt }], [...each(receipt).map((r) => ({ answer: "accepted", receipt: r })), { answer: "accepted", receipt: { ...receipt, sends: ["first"] } },
      // An effect is one of the contract's, with its members; and an act's refusal is one an act can meet: a source check and a platform definition are a founding's.
      ...[{ effect: "state" }, { effect: "vanish" }].map((e) => ({ answer: "accepted", receipt: { ...receipt, effects: [e] } })),
      ...["source-unverified", "unsupported-definition"].map((reason) => ({ answer: "refused", reason, judgedAt: head }))]],
    ["settle", (t) => handle(t).settle({} as never), [read(receipt), refused, { ...refused, detail: fact }], [...each(read(receipt)), ...each(receipt).map((r) => read(r)), { ...refused, detail: "elsewhere" }]],
    ["summary", (t) => handle(t).summary(), [read(summary)], [...each(summary).map((v) => read(v)), read({ ...summary, status: "open" }), read({ ...summary, counts: [["note", "draft"]] }), read({ ...summary, items: [less(item, "opened")] })]],
    ["items", (t) => handle(t).items("note", "c"), [read([item], { next: "c2" }), read([{ ...item, opened: null, epoch: 2 }])], [...each(item).map((v) => read([v])), read(item), read([item], { next: 2 }), read([{ ...item, attributed: [{}] }]), read([{ ...item, parties: { owner: {} } }])]],
    ["history", (t) => handle(t).history("c"), [read([sealed], { complete: false, next: "c2" })], [...each(sealed).map((v) => read([v])), ...each(entry).map((e) => read([{ entry: e, hash: d }])), read(sealed)]],
    ["entry", (t) => handle(t).entry(1), [read(sealed)], [...each(sealed).map((v) => read(v)), ...each(entry).map((e) => read({ entry: e, hash: d })), read({ entry: { ...entry, at: { ...scope, kind: "room" } }, hash: d }),
      // The fixed records inside an entry: an input is one of the contract's with its members, and so is each use, prepared result and send.
      ...[{ input: { type: "act" } }, { input: { type: "mystery" } }, { uses: [{}] }, { prepared: [{}] }, { sends: [{}] }].map((part) => read({ entry: { ...entry, ...part }, hash: d }))]],
    ["outbox", (t) => handle(t).outbox("c"), [read([duty], { next: "c2" })], [...each(duty).map((v) => read([v])), read(duty)]],
    ["followDuty", (t) => handle(t).followDuty("1.0"),
      [read(duty), read({ ...duty, acknowledged: fact, result: { seq: 2, clause: "applied" }, diagnosis: { seq: 3, finding: "undelivered" } }), refused],
      [...each(duty).map((v) => read(v)), read({ ...duty, class: "letter" }), read({ ...duty, result: { seq: 2 } }), read({ ...duty, diagnosis: { seq: 3, finding: "lost" } }), read({ ...duty, attempts: [{ at: entry.time }] })]],
  ];
  const transports: [string, (reply: unknown) => Transport][] = [
    ["HTTP", (reply) => httpTransport("https://scopes.test", { fetch: () => Promise.resolve({ status: 200, text: () => Promise.resolve(JSON.stringify(reply)) }) })],
    ["a service binding", (reply) => bindingTransport(new Proxy({}, { get: () => () => Promise.resolve(reply) }) as ServiceBinding)],
  ];
  let checked = 0;
  for (const [over, transport] of transports) for (const [name, call, good, bad] of rows) {
    for (const reply of good) expect(await call(transport(reply)), `${name} over ${over}`).toEqual(reply);
    for (const reply of bad) await expect(call(transport(reply)), `${name} over ${over}: ${JSON.stringify(reply)}`).rejects.toThrow(TransportError);
    checked += good.length + bad.length;
  }
  // The same rows on each transport: none is skipped by a table that came out empty.
  expect(checked).toBe(2 * rows.reduce((n, [, , good, bad]) => n + good.length + bad.length, 0));
  expect(rows.every(([, , good, bad]) => good.length > 0 && bad.length > 0)).toBe(true);

  // Following a receipt reads the entry it names, so a reply that is no entry is no outcome of it either; a refusal the contract names is.
  for (const [, transport] of transports) {
    await expect(handle(transport(read({ entry: less(entry, "at"), hash: d }))).followReceipt(receipt as never)).rejects.toThrow(TransportError);
    expect(await handle(transport({ ok: false, reason: "forbidden" })).followReceipt(receipt as never)).toEqual({ ok: false, reason: "forbidden" });
    // An entry of the right shape and other bytes is the handle's own finding, not the transport's.
    expect(await handle(transport(read(sealed))).followReceipt(receipt as never)).toEqual({ ok: false, reason: "hash-mismatch" });
  }
});

test("the intent that is signed is a detached copy: what the caller changes while the signer works, or afterwards, is not in the returned intent, which still verifies", async () => {
  const signer = await webCryptoSigner();
  let release = (): void => undefined;
  const waiting = new Promise<void>((resolve) => { release = resolve; });
  // A signer that answers only when released, as one that asks a person does.
  const slow = { key: signer.key, sign: async (bytes: Uint8Array) => { await waiting; return signer.sign(bytes); } };
  const form = { to: null, kind: "found", expected: { on: 1 }, fields: { source: "a repository", tags: ["a"] } };
  const pending = signedIntent(slow, form);
  form.fields.source = "another";
  form.fields.tags.push("b");
  form.expected.on = 2;
  release();
  const signed = await pending;
  expect([verifySignedIntent(signed), signed.intent.fields, signed.intent.expected]).toEqual([true, { source: "a repository", tags: ["a"] }, { on: 1 }]);
});
