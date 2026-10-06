import { runInDurableObject } from "cloudflare:test";
import { expect, test } from "vitest";
import type { Answer, Digest, Intent, PlatformDefinition, Seed } from "@generalbusiness/artroom-contract";
import { canonicalize, intentDigest, scopeIdOf, signIntent, textDigest } from "@generalbusiness/artroom-bytes";
import { valueDigest } from "@generalbusiness/artroom-derive";
import { grantOf } from "@generalbusiness/artroom-derive/testing";
import { gateRules, gateWith } from "../../derive/test/fixtures-marks.ts";
import { controls } from "../src/testing.ts";
import { wired } from "./outside.ts";
import { START, at, objectOf, reader, rita, stubOf } from "./support.ts";

// Scope contract, revision 19, sections 6.2 and 9.2; witness 18.35, cases 1 to 3 and 5, and 18.45, case 6 (I3 deltas, entries EX6
// and FC7). STAND-INS: the platform data and its rules are derive's made-up fixture `gate`, supplied under a name and version that
// no runtime holds, with one field that states a place in a made-up byte domain. They show nothing about a definition of Artroom.
// What is real: the scope's read of `values` before the turn, the judge's match, and the store.
test("a value beside an intent, on real storage: the scope reads it only for a place that its pinned data states, and keeps it under its domain and its digest, once; other bytes, and a value past the bound of its domain, are bad-field and nothing is kept; the read route does not serve a value", async () => {
  const MADE = "platform:task@1" as PlatformDefinition;
  const [DOMAIN, MAX] = ["gate-proof-1", 64];
  const data = gateWith((d) => { d.name = "platform:task"; d.acts.issue.fields.proof = { type: "digest", required: false, value: { domain: DOMAIN, max: MAX } }; }).declared;
  const founding: Intent = { v: 1, to: null, actor: rita.key, kind: "found", on: null, expected: {}, fields: { opener: rita.member }, idempotencyKey: crypto.randomUUID(), notAfter: at(60) };
  const seed: Seed = { v: 1, kind: "directory", definition: MADE, creator: null, cause: intentDigest(founding), ordinal: 0 };
  const name = scopeIdOf(seed);
  controls(name, START);
  wired.set(name, () => ({ definitions: { read: () => Promise.resolve({ ok: false, reason: "unavailable" }), platform: (named) => (named === MADE ? { data: data as never, rules: gateRules().rules } : null) } }));
  try {
    const stub = stubOf(name);
    const founded = await stub.found(signIntent(founding, rita.secret), MADE);
    if (founded.answer !== "accepted") throw new Error(`the scope was not founded: ${JSON.stringify(founded)}`);
    const scope = founded.receipt.fact.at;
    const grants = [grantOf(rita, scope, ["gate.issue"])];
    const issue = (secret: string, proof: Digest | null, values?: readonly string[]): Promise<Answer> => {
      const intent: Intent = { v: 1, to: scope, actor: rita.key, kind: "issue", on: null, expected: {}, fields: { hash: textDigest(secret), ...(proof ? { proof } : {}) }, idempotencyKey: crypto.randomUUID(), notAfter: at(60) };
      return stub.submit(signIntent(intent, rita.secret), grants, values ? { values } : {});
    };
    const kept = () => runInDurableObject(objectOf(name), (_instance, state) => state.storage.sql.exec("SELECT domain, digest, bytes FROM retained_value ORDER BY domain, digest").toArray());
    const said = (answer: Answer) => [answer.answer, "reason" in answer ? answer.reason : null];

    const proof = { seat: 12 };
    const [bytes, digest] = [canonicalize(proof), valueDigest(DOMAIN, proof)];
    const long = { seat: 12, pad: "x".repeat(MAX) };
    // No value came; other bytes came; and a value that is longer than the bound of its domain: `bad-field`, and nothing is kept.
    expect([said(await issue("one", digest)), said(await issue("one", digest, [canonicalize({ seat: 13 })])), said(await issue("one", valueDigest(DOMAIN, long), [canonicalize(long)])), await kept()])
      .toEqual([["refused", "bad-field"], ["refused", "bad-field"], ["refused", "bad-field"], []]);
    // The value came, behind bytes that no place names. At most as many values are read as the act's places name, which is one:
    // the value is not reached, and the act is refused. In first place it is matched, and the scope keeps it under its domain.
    expect(said(await issue("one", digest, ["\"another value\"", bytes]))).toEqual(["refused", "bad-field"]);
    expect([said(await issue("one", digest, [bytes, "\"another value\""])), await kept()]).toEqual([["accepted", null], [{ domain: DOMAIN, digest, bytes }]]);
    // A second act that names the same value: one domain and one digest are one input. An act whose intent sets no place reads
    // no value, whatever came beside it, and keeps none.
    expect([said(await issue("two", digest, [bytes])), said(await issue("three", null, [canonicalize({ seat: 14 })])), (await kept()).length]).toEqual([["accepted", null], ["accepted", null], 1]);
    // The read route serves no retained input of the kind `value` (entry EX6, whose deferral stands for the route).
    const read = await (stub as unknown as { retained(reader: unknown, kind: string, digest: Digest): Promise<{ ok: boolean; reason?: string }> }).retained(reader, "value", digest);
    expect(read).toEqual({ ok: false, reason: "not-found" });
  } finally {
    wired.delete(name);
  }
});
