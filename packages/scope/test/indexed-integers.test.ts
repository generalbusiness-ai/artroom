/** C2 on real turns/SQLite. The platform data, grant authority and the
 * rule attempting a fixed-slot change are explicitly scripted fixtures. */
import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { expect, test } from "vitest";
import type { Answer, FieldValue, Intent, PlatformDefinition, Seed } from "@generalbusiness/dap-contract";
import { intentDigest, scopeIdOf, signIntent, textDigest } from "@generalbusiness/artroom-bytes";
import { grantOf } from "@generalbusiness/dap-derive/testing";
import { gateRules, gateWith } from "../../derive/test/fixtures-marks.ts";
import { SqliteStore } from "../src/sqlite.ts";
import { controls } from "../src/testing.ts";
import { wired } from "./outside.ts";
import { START, at, objectOf, rita, stubOf } from "./support.ts";

test("native integer indexes retain exact duplicate and boundary keys across finality and restart; invalid values and fixed-slot faults change no item/index", async () => {
  const MADE = "platform:task@1" as PlatformDefinition;
  const integer = { type: "int", min: Number.MIN_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER };
  const data = gateWith(data => {
    data.name = "platform:task";
    data.items.ticket.values.number = { fixed: true, required: true, of: integer };
    data.items.ticket.indexes = ["number"];
    data.acts.issue.fields.number = { ...integer, required: true };
    data.acts.issue.effects.push({ value: { slot: "number", from: { field: "number" } } });
    const transition = { step: "transition", on: "ticket", grant: "gate.issue", also: {}, fields: {}, guards: [], sends: [], attention: [] };
    data.acts.finish = { ...transition, guards: [{ state: ["open"] }], effects: [{ state: "used" }] };
    data.acts.rewrite = { ...transition, effects: [{ code: "rewrite-number", row: "P16" }] };
  }).declared;
  let fixedChangeAttempts = 0;
  const rules = gateRules({ "rewrite-number": { place: "effect", most: 1, run: ({ input }) => {
    fixedChangeAttempts++;
    return input.type === "act" && input.signed.intent.on !== null ? [{ effect: "value", item: input.signed.intent.on, slot: "number", value: 8 }] : [];
  } } }).rules;
  const creation: Intent = { v: 1, to: null, actor: rita.key, kind: "found", on: null, expected: {}, fields: { opener: rita.member }, idempotencyKey: crypto.randomUUID(), notAfter: at(60) };
  const seed: Seed = { v: 1, kind: "directory", definition: MADE, creator: null, cause: intentDigest(creation), ordinal: 0 };
  const name = scopeIdOf(seed); controls(name, START);
  wired.set(name, () => ({ definitions: { read: () => Promise.resolve({ ok: false, reason: "unavailable" }), platform: named => named === MADE ? { data: data as never, rules } : null } }));
  try {
    const stub = stubOf(name), created = await stub.create(signIntent(creation, rita.secret), MADE);
    if (created.answer !== "accepted") return expect.fail(`indexed fixture was not founded: ${JSON.stringify(created)}`);
    const scope = created.receipt.fact.at;
    const act = (kind: string, over: Partial<Intent>): Promise<Answer> => stub.submit(signIntent({ v: 1, to: scope, actor: rita.key, kind, on: null, expected: {}, fields: {}, idempotencyKey: crypto.randomUUID(), notAfter: at(60), ...over }, rita.secret), [grantOf(rita, scope, ["gate.issue"])]);
    const issue = (number: unknown) => act("issue", { fields: { number: number as FieldValue, hash: textDigest("integer-key") } });
    const ids: number[] = [];
    for (const number of [Number.MIN_SAFE_INTEGER, 0, 1, 1, Number.MAX_SAFE_INTEGER]) {
      const answer = await issue(number);
      if (answer.answer !== "accepted") return expect.fail(`integer opening refused: ${number}`);
      ids.push(answer.receipt.fact.seq);
    }
    const snapshot = () => runInDurableObject(objectOf(name), (_instance, state) => {
      const store = new SqliteStore({ exec: (query, ...args) => state.storage.sql.exec(query, ...args), transaction: work => state.storage.transactionSync(work) });
      const keys = ["-9007199254740991", "0", "1", "9007199254740991", '"1"', "01", "+1", "1.0", "1e0", "-0"];
      return { head: store.scope()!.head, items: store.all().items, rows: state.storage.sql.exec("SELECT type, slot, key, id FROM item_key ORDER BY type, slot, key, id").toArray(), lookups: keys.map(key => store.lookup("ticket", "number", key, 9)), limited: store.lookup("ticket", "number", "1", 1) };
    });
    const before = await snapshot();
    expect(before.lookups).toEqual([[ids[0]], [ids[1]], [ids[2], ids[3]], [ids[4]], [], [], [], [], [], []]);
    expect(before.limited).toEqual([ids[2]]);
    expect(await issue("1")).toMatchObject({ answer: "refused", reason: "bad-field" });
    for (const number of [-0, 1.5, Number.MAX_SAFE_INTEGER + 1]) expect(() => issue(number)).toThrow();
    expect(await snapshot()).toEqual(before);
    const revision = before.items.find(item => item.id === ids[2])!.revision;
    expect(await act("rewrite", { on: ids[2]!, expected: { on: revision } })).toMatchObject({ answer: "unavailable" });
    expect(fixedChangeAttempts).toBeGreaterThan(0);
    expect(await snapshot()).toEqual(before);
    expect(await act("finish", { on: ids[2]!, expected: { on: revision } })).toMatchObject({ answer: "accepted" });
    const final = await snapshot();
    expect(final.items.find(item => item.id === ids[2])!.state).toBe("used");
    expect([final.rows, final.lookups]).toEqual([before.rows, before.lookups]);
    await evictDurableObject(objectOf(name));
    expect(await snapshot()).toEqual(final);
  } finally { wired.delete(name); }
});
