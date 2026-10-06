import { env } from "cloudflare:workers";
import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { expect, test } from "vitest";
import type { Answer, Digest, Intent, PlatformDefinition, Seed, RetainedInput, OperationId, Read } from "@generalbusiness/artroom-contract";
import { canonicalize, intentDigest, scopeIdOf, signIntent, textDigest } from "@generalbusiness/artroom-bytes";
import { PROPOSED_BOUNDS } from "@generalbusiness/artroom-contract";
import { clockOf, settleOutcome, validateDefinition, valueDigest, type OutcomeRule } from "@generalbusiness/artroom-derive";
import { grantOf } from "@generalbusiness/artroom-derive/testing";
import { gateRules, gateWith } from "../../derive/test/fixtures-marks.ts";
import { controls } from "../src/testing.ts";
import { outsideOf, wired } from "./outside.ts";
import { httpSource, verify } from "@generalbusiness/artroom-replay";
import { route } from "../src/worker.ts";
import { SqliteStore } from "../src/sqlite.ts";
import type { LateAnswers } from "../src/operations.ts";
import { START, at, objectOf, reader, rita, stubOf } from "./support.ts";

// Scope contract, revision 19, sections 6.2 and 9.2; witness 18.35, cases 1 to 3 and 5, and 18.45, case 6 (I3 deltas, entries EX6
// and FC7). STAND-INS: the platform data and its rules are derive's made-up fixture `gate`, supplied under a name and version that
// no runtime holds, with one field that states a place in a made-up byte domain. They show nothing about a definition of Artroom.
// What is real: the scope's read of `values` before the turn, the judge's match, and the store.
test("a value beside an intent, on real storage: the scope reads it only for a place that its pinned data states, and keeps it under its domain and its digest, once; other bytes, and a value past the bound of its domain, are bad-field and nothing is kept; the read route serves a value only under its domain", async () => {
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
    // A value is named by domain as well as digest: neither an absent nor another domain reads it.
    const read = objectOf(name) as unknown as { retained(reader: unknown, kind: string, digest: Digest, domain?: string): Promise<Read<RetainedInput>> };
    expect([await read.retained(reader, "value", digest), await read.retained(reader, "value", digest, "another-1")]).toEqual([{ ok: false, reason: "not-found" }, { ok: false, reason: "not-found" }]);
    expect(await read.retained(reader, "value", digest, DOMAIN)).toMatchObject({ ok: true, value: { kind: "value", domain: DOMAIN, digest, bytes } });
  } finally {
    wired.delete(name);
  }
});

// STAND-INS: gate's made-up platform data and rule; a scripted outside system; the test authority's grants. The actual scope
// opens the operation through its act, receives the answer, retains the value on SQLite, and serves the replay over its real routes.
// Invariant: an outcome's declared evidence values are matched by domain, digest and canonical byte bound, retained beside its entry
// across a restart, and required by a replay even when the value was not read by a rule.
test("an owner's evidence value on real storage and through the read routes: bad bytes write nothing; the valid late answer survives a restart and replays, while missing bytes make replay incomplete", async () => {
  const MADE = "platform:task@1" as PlatformDefinition;
  const [DOMAIN, MAX] = ["gate-proof-1", 64];
  const proof = { seat: 12 };
  const input = { kind: "value", domain: DOMAIN, digest: valueDigest(DOMAIN, proof), bytes: canonicalize(proof) } as const;
  const probe: OutcomeRule = {
    selects: false, read: false, retries: () => false,
    valueDomains: [{ domain: DOMAIN, max: MAX }],
    values: (evidence) => { const digest = (evidence.body as { proof?: Digest } | null)?.proof; return digest ? [{ domain: DOMAIN, max: MAX, digest }] : []; },
    // No value read is needed for retention: the declaration and the evidence name it.
  };
  const data = gateWith((data) => {
    data.name = "platform:task";
    data.acts.issue.effects.push({ code: "open-proof", row: "P16", most: { effects: 0, operations: ["probe"] } });
    data.outcomes.probe.attempts = 1;
  }).declared;
  const code = gateRules({ "open-proof": { place: "effect", most: 2, run: () => [{ effect: "operation", k: 0, owner: MADE, kind: "probe", attempts: 1 }, { effect: "attempt", operation: { k: 0 }, attempt: 1, result: "opened", selected: null }] }, probe: { place: "outcome", rules: probe } });
  const founding: Intent = { v: 1, to: null, actor: rita.key, kind: "found", on: null, expected: {}, fields: { opener: rita.member }, idempotencyKey: crypto.randomUUID(), notAfter: at(60) };
  const seed: Seed = { v: 1, kind: "directory", definition: MADE, creator: null, cause: intentDigest(founding), ordinal: 0 };
  const name = scopeIdOf(seed);
  controls(name, START);
  const out = outsideOf(name);
  wired.set(name, () => ({ outside: out, definitions: { read: () => Promise.resolve({ ok: false, reason: "unavailable" }), platform: (named) => named === MADE ? { data: data as never, rules: code.rules } : null } }));
  try {
    const founded = await stubOf(name).found(signIntent(founding, rita.secret), MADE);
    if (founded.answer !== "accepted") return expect.fail(`the scope was not founded: ${JSON.stringify(founded)}`);
    const scope = founded.receipt.fact.at;
    const issue: Intent = { v: 1, to: scope, actor: rita.key, kind: "issue", on: null, expected: {}, fields: { hash: textDigest("one") }, idempotencyKey: crypto.randomUUID(), notAfter: at(60) };
    expect((await stubOf(name).submit(signIntent(issue, rita.secret), [grantOf(rita, scope, ["gate.issue"])])).answer).toBe("accepted");
    const operation = "1:0" as OperationId;
    out.answer(operation, 1, null);
    const driver = () => objectOf(name) as unknown as { effect(): Promise<number> };
    await driver().effect();
    const before = await stubOf(name).summary(reader);
    if (!before.ok) return expect.fail("no summary");
    const kept = () => runInDurableObject(objectOf(name), (_instance, state) => state.storage.sql.exec("SELECT domain, digest, bytes FROM retained_value").toArray());
    const late = (digest: Digest, value?: RetainedInput) => runInDurableObject(objectOf(name), () => (out.deliver as LateAnswers)(operation, 1, { result: "confirmed", evidence: { basis: "own-answer", body: { proof: digest } }, ...(value ? { retain: [value] } : {}) }));
    const long = { seat: 12, pad: "x".repeat(MAX) };
    for (const offered of [await late(input.digest), await late(input.digest, { ...input, bytes: canonicalize({ seat: 13 }) }), await late(valueDigest(DOMAIN, long), { ...input, digest: valueDigest(DOMAIN, long), bytes: canonicalize(long) })]) {
      expect(offered).toMatchObject({ recorded: "refused", detail: expect.stringContaining("bad-input") });
    }
    expect([await kept(), (await stubOf(name).summary(reader))]).toEqual([[], before]);
    expect(await late(input.digest, input)).toMatchObject({ recorded: "written" });
    await evictDurableObject(objectOf(name));
    expect(await kept()).toEqual([{ domain: DOMAIN, digest: input.digest, bytes: input.bytes }]);
    const source = httpSource("https://scope.test", { reader, fetch: async (url, init) => { const response = await route(new Request(url, init), env.SCOPES); return { status: response.status, body: response.body }; } });
    expect(await source.retained(name, "value", input.digest, { bytes: 4096 }, DOMAIN)).toMatchObject({ ok: true, input });
    const options = { mode: "replay", grants: "as-recorded", scope: name, platform: (named: PlatformDefinition) => named === MADE ? { data: data as never, rules: code.rules } : null } as const;
    const good = await verify(source, options);
    expect([good.report.result, good.why]).toEqual(["consistent", null]);
    const missing = await verify({ ...source, retained: async (...args) => args[1] === "value" ? { ok: false as const, reason: "not-found" } : source.retained(...args) }, options);
    expect([missing.report.result, missing.report.at?.seq, missing.why]).toEqual(["incomplete", before.at.seq + 1, expect.stringContaining("the value named by outcome evidence")]);
    // Section 4.3: once a decisive outcome is recorded, answering a copy or contradiction needs no new value read. Even a lost
    // retained value cannot make either answer unavailable or bad-input. The pure judge and the real driver agree.
    const again = await runInDurableObject(objectOf(name), (_instance, state) => {
      state.storage.sql.exec("DELETE FROM retained_value WHERE domain = ? AND digest = ?", DOMAIN, input.digest);
      const store = new SqliteStore({ exec: (query, ...bindings) => state.storage.sql.exec(query, ...bindings), transaction: (closure) => state.storage.transactionSync(closure) });
      const definition = validateDefinition(data, PROPOSED_BOUNDS, undefined, { platform: true });
      if (!definition.ok) return expect.fail("the fixture definition no longer validates");
      const context = { clock: clockOf(store, START), bounds: PROPOSED_BOUNDS, platform: { named: MADE, rules: code.rules } };
      const offered = { type: "outcome", operation, attempt: 1, result: "confirmed", evidence: { basis: "own-answer", body: { proof: input.digest } } } as const;
      return [settleOutcome(store, definition.definition, offered, context), settleOutcome(store, definition.definition, { ...offered, owner: "platform:destination@1" }, context)];
    });
    expect(again).toEqual([{ result: "repeat", seq: before.at.seq + 1 }, { result: "refused", reason: "bad-input", detail: "the outcome names another owner or kind than its operation has" }]);
    expect([await late(input.digest), await late(valueDigest(DOMAIN, { seat: 13 })), await kept()]).toEqual([{ recorded: "repeat", seq: before.at.seq + 1 }, { recorded: "conflict", seq: before.at.seq + 1 }, []]);

  } finally { wired.delete(name); }
});
