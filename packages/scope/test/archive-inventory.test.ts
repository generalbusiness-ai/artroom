/** Native read frames, SQLite and genuine founding/acts. All reviewed
 * policies/certificates are explicit TEST STAND-INS, never production
 * certifications. Synthetic/corrupt rows are labelled at their witnesses.
 * No inventory result proves authority, replay, ancestry or host custody. */
import { expect, test } from "vitest";
import { PROPOSED_BOUNDS } from "@generalbusiness/dap-contract";
import type { DeclaredDefinition, Digest, Entry, Head, Input, Seed, SendForm } from "@generalbusiness/dap-contract";
import { canonicalize, digestBytes, entryHash, textDigest, utf8 } from "@generalbusiness/artroom-bytes";
import type { OperationRules, ValidDefinition } from "@generalbusiness/dap-derive";
import { MemorySource, verify } from "@generalbusiness/artroom-replay";
import { variant } from "@generalbusiness/dap-derive/testing";
import { ArchiveBudget, type ArchiveCost } from "../src/archive-budget.ts";
import { inventoryArchive, type ArchivePolicyRegistry, type ReviewedArchivePolicy } from "../src/archive-inventory.ts";
import { definition, create, rita, type Lane } from "./support.ts";

const variants = ["genesis", "act", "delivery", "timed", "diagnosis", "outcome", "preparation", "checkpoint"] as const;
const base = variant(definition.declared, data => {
  data.acts["link"]!.sends = data.acts["link"]!.sends.filter((send: SendForm) => !("create" in send));
  data.acts["remark"]!.fields["text"] = { type: "text", max: 128, detached: true, required: true };
});
const policy = (definition: ValidDefinition, entryTypes: ReadonlySet<Input["type"]> = new Set(variants)): ReviewedArchivePolicy => ({
  review: "TEST STAND-IN: inline entry classes and declaration metadata, not a real certificate",
  entryTypes, support: { named: definition.digest, definition, owners: new Map(), records: new Map(), preparations: new Map() },
});
const registry = new Map([[base.digest, policy(base)]]);
async function scan(lane: Lane, through: Head, policies: ArchivePolicyRegistry = registry, limits: Partial<ArchiveCost> = {}, hook?: (query: string, sql: SqlStorage) => void, timing?: { now: () => number; milliseconds: number }) {
  return lane.inside(state => {
    const calls: { query: string; key: unknown }[] = [], budget = new ArchiveBudget(limits, timing?.now, timing?.milliseconds);
    const result = inventoryArchive({ exec(query, ...args) { calls.push({ query, key: args[0] }); hook?.(query, state.storage.sql); return state.storage.sql.exec(query, ...args); }, transaction: work => state.storage.transactionSync(work) }, lane.at, through, PROPOSED_BOUNDS, policies, budget);
    return { result, calls, cost: budget.admitted() };
  });
}
const entryReads = (calls: { query: string }[]) => calls.filter(call => call.query.startsWith("SELECT bytes FROM entry"));
const payloadReads = (calls: { query: string; key: unknown }[]) => calls.filter(call => call.query.startsWith("SELECT bytes FROM retained_value") || call.query.startsWith("SELECT bytes FROM retained_input") && call.key !== "definition");

test("a covered native fixed prefix selects validated declaration keys and explicit text omissions, excludes later entries and returns no payload bytes", async () => {
  const lane = await create({}, {}, base), body = "private detached fixture body", digest = textDigest(body);
  const answer = await lane.stub.submit(lane.intent(rita, "remark", { on: 0, fields: { text: digest } }), lane.grants(), { texts: [body] });
  expect(answer).toMatchObject({ answer: "accepted" });
  const through = await lane.head();
  const before = await scan(lane, through);
  expect(before.result.ok).toBe(true);
  if (!before.result.ok) return;
  expect(before.result.inventory.entries.map(entry => entry.seq)).toEqual([0, 1]);
  expect(before.result.inventory.objects.map(object => object.key)).toEqual([{ kind: "definition", digest: base.digest }]);
  expect(before.result.inventory.omittedTexts.map(text => text.key.digest)).toEqual([digest]);
  expect(payloadReads(before.calls)).toEqual([]);
  expect(entryReads(before.calls)).toHaveLength(2);
  expect(JSON.stringify(before.result)).not.toContain(body);
  expect(before.result.inventory.replay).toBe("unchecked");
  await lane.did(rita, "offer", { fields: { intent: 0 }, expected: { intent: 1 } });
  const later = await scan(lane, through);
  expect(later.result.ok).toBe(true);
  if (later.result.ok) {
    expect(later.result.inventory.entries).toEqual(before.result.inventory.entries);
    expect(later.result.inventory.objects).toEqual(before.result.inventory.objects);
    expect(later.result.inventory.omittedTexts).toEqual(before.result.inventory.omittedTexts);
  }
});

test("forbidden final metadata and missing reviewed inline-class coverage fail before any local entry or retained payload body", async () => {
  const lane = await create({}, {}, base);
  const signed = lane.intent(rita, "offer", { fields: { intent: 0 }, expected: { intent: 1 } });
  expect(await lane.submit(signed)).toMatchObject({ answer: "accepted" });
  const through = await lane.head();
  const coverage = await scan(lane, through, new Map([[base.digest, policy(base, new Set(["genesis"]))]]));
  expect(coverage.result).toEqual({ ok: false, reason: "unsupported-archive-cohort" });
  expect(entryReads(coverage.calls)).toEqual([]); expect(payloadReads(coverage.calls)).toEqual([]);
  await lane.inside(state => {
    const original = state.storage.sql.exec<{ bytes: string }>("SELECT bytes FROM entry WHERE seq = ?", through.seq).one().bytes;
    const entry: Entry = JSON.parse(original); entry.uses = [{ fact: lane.genesis.fact, content: lane.genesis.fact.hash }]; const bytes = canonicalize(entry);
    state.storage.sql.exec("UPDATE entry SET bytes = ?, size = ? WHERE seq = ?", bytes, utf8(bytes).length, through.seq);
  });
  const forbidden = await scan(lane, through);
  expect(forbidden.result).toEqual({ ok: false, reason: "unsupported-foreign-copy" });
  expect(entryReads(forbidden.calls)).toEqual([]); expect(payloadReads(forbidden.calls)).toEqual([]);
  expect(forbidden.calls.some(call => call.query.includes("AS usesType") && call.key === through.seq)).toBe(true);
});

test("native metadata/body or final cutoff drift cannot publish a completed inventory", async () => {
  const lane = await create({}, {}, base);
  await lane.did(rita, "offer", { fields: { intent: 0 }, expected: { intent: 1 } });
  const through = await lane.head();
  let changed = false;
  const changedBody = await scan(lane, through, registry, {}, (query, sql) => {
    if (changed || !query.startsWith("SELECT bytes FROM entry")) return;
    changed = true;
    sql.exec("UPDATE entry SET bytes = replace(bytes, 'A lane', 'B lane') WHERE seq = 0");
  });
  expect(changedBody.result).toEqual({ ok: false, reason: "mismatch" });
  const other = await create({}, {}, base); await other.did(rita, "offer", { fields: { intent: 0 }, expected: { intent: 1 } });
  const cutoff = await other.head(); let pins = 0;
  const changedCutoff = await scan(other, cutoff, registry, {}, (query, sql) => {
    if (!query.startsWith("SELECT k, octet_length(v)")) return;
    if (++pins === 2) sql.exec("UPDATE entry SET hash = ? WHERE seq = ?", textDigest("changed final cutoff"), cutoff.seq);
  });
  expect(changedCutoff.result).toEqual({ ok: false, reason: "mismatch" });
});

test("one native pass admits its exact measured call/byte/node limits and refuses the next unit without a phase reset", async () => {
  const lane = await create({}, {}, base), through = await lane.head(), baseline = await scan(lane, through);
  expect(baseline.result.ok).toBe(true);
  if (!baseline.result.ok) return;
  const cost = baseline.result.inventory.cost;
  expect((await scan(lane, through, registry, { calls: cost.calls, inputWork: cost.inputWork, nodes: 1 })).result.ok).toBe(true);
  expect((await scan(lane, through, registry, { calls: cost.calls - 1 })).result).toEqual({ ok: false, reason: "limit" });
  expect((await scan(lane, through, registry, { inputWork: cost.inputWork - 1 })).result).toEqual({ ok: false, reason: "limit" });
  const noNode = await scan(lane, through, registry, { nodes: 0 });
  expect(noNode.result).toEqual({ ok: false, reason: "limit" });
  expect(entryReads(noNode.calls)).toEqual([]); expect(payloadReads(noNode.calls)).toEqual([]);
});

const leaf = (name: string, child?: Digest) => variant({
  format: "artroom-definition-1", name, profile: { name: "restricted", version: 1 }, capabilities: [], genesis: "found",
  items: { root: { many: false, max: 1, states: { live: { final: false } }, initial: "live", parties: {}, refs: {}, values: {} } },
  acts: { "found": { step: "open", on: "root", grant: "found", also: {}, fields: {}, guards: [], effects: [], sends: [], attention: [] },
    spawn: { step: child ? "transition" : "comment", on: "root", grant: "spawn", also: {}, fields: {}, guards: [], effects: [], sends: child ? [{ create: { kind: "lane", definition: child, fields: {}, result: {} } }] : [], attention: [] } },
  receives: {}, timed: {}, rules: {},
} satisfies DeclaredDefinition, () => {});
async function keep(lane: Lane, definitions: readonly ValidDefinition[]) {
  await lane.inside(state => { for (const definition of definitions) state.storage.sql.exec("INSERT OR REPLACE INTO retained_input (kind, digest, bytes) VALUES ('definition', ?, ?)", definition.digest, canonicalize(definition.declared)); });
}

test("archive-only closure requires a missing unused child; later bytes complete the same cutoff while ordinary replay and later unrelated inputs remain unchanged", async () => {
  const child = leaf("late-child");
  const parent = variant(base.declared, data => { data.acts["link"].sends.push({ create: { kind: "lane", definition: child.digest, fields: {}, result: {} } }); });
  const lane = await create({}, {}, parent), through = await lane.head(), policies = new Map([[parent.digest, policy(parent)], [child.digest, policy(child)]]);
  const rows = await lane.sealed();
  const history = { scope: lane.at, entries: rows.map(row => ({ seq: row.entry.seq, hash: row.hash, bytes: canonicalize(row.entry) })), retained: [{ kind: "definition" as const, digest: parent.digest, bytes: canonicalize(parent.declared) }] };
  expect((await verify(new MemorySource([history]), { mode: "replay", scope: lane.name, grants: "as-recorded" })).report.result).toBe("consistent");
  const absent = await scan(lane, through, policies);
  expect(absent.result).toEqual({ ok: false, reason: "incomplete" });
  expect(entryReads(absent.calls)).toEqual([]); expect(payloadReads(absent.calls)).toEqual([]);
  await keep(lane, [child]);
  await lane.did(rita, "offer", { fields: { intent: 0 }, expected: { intent: 1 } });
  const complete = await scan(lane, through, policies);
  expect(complete.result.ok).toBe(true);
  if (complete.result.ok) {
    expect(complete.result.inventory.through).toEqual(through);
    expect(complete.result.inventory.entries).toHaveLength(1);
    expect(complete.result.inventory.objects.map(object => object.key)).toEqual([{ kind: "definition", digest: parent.digest }, { kind: "definition", digest: child.digest }]);
    expect(complete.result.inventory.objects[1]!.consumers).toMatchObject([{ consumer: "definition-child", purpose: "archive-closure", origin: { input: "genesis", at: { seq: 0 } } }]);
  }
  expect((await verify(new MemorySource([history]), { mode: "replay", scope: lane.name, grants: "as-recorded" })).report.result).toBe("consistent");
});

/** Synthetic closed-form entries for consumer/phase/budget boundaries. No
 * native operation opening, outside evidence or outcome judgment is claimed.
 * Native SQLite, canonical/hash binding and inventory reads remain real. */
async function appendInputs(lane: Lane, inputs: readonly Input[], prepared?: Digest): Promise<Head> {
  return lane.inside(state => {
    const genesis = JSON.parse(state.storage.sql.exec<{ bytes: string }>("SELECT bytes FROM entry WHERE seq = 0").one().bytes) as Entry;
    let head: Head = lane.genesis.fact;
    for (const [index, input] of inputs.entries()) {
      const entry: Entry = { ...genesis, seq: index + 1, prev: head.hash, input, effects: [], sends: [], uses: [], prepared: prepared && index === 0 ? [{ rule: "always", input: prepared, result: true }] : [] };
      const bytes = canonicalize(entry), hash = entryHash(entry);
      state.storage.sql.exec("INSERT INTO entry (seq, hash, time, bytes, size) VALUES (?, ?, ?, ?, ?)", entry.seq, hash, entry.time, bytes, utf8(bytes).length);
      head = { seq: entry.seq, hash };
    }
    const scope = JSON.parse(state.storage.sql.exec<{ v: string }>("SELECT v FROM meta WHERE k = 'scope'").one().v);
    scope.head = head; state.storage.sql.exec("UPDATE meta SET v = ? WHERE k = 'scope'", canonicalize(scope));
    return head;
  });
}
const appendOutcomes = (lane: Lane, roots: readonly Digest[], prepared?: Digest) => appendInputs(lane, roots.map(digest => ({ type: "outcome", operation: "0:0", attempt: 0, owner: "hold@1", kind: "archive-fixture", result: "confirmed", evidence: { basis: "own-answer", body: digest } })), prepared);
function outcomes(definition: ValidDefinition): ReviewedArchivePolicy {
  const rules: OperationRules = { selects: false, read: true, retries: () => false, valueDomains: [{ domain: "artroom-definition-1", max: PROPOSED_BOUNDS.definitionBytes }], values: evidence => [{ domain: "artroom-definition-1", max: PROPOSED_BOUNDS.definitionBytes, digest: evidence.body as Digest }] };
  return { ...policy(definition), support: { ...policy(definition).support, owners: new Map([["hold@1", new Map([["archive-fixture", rules]])]]) } };
}

test("an uncovered additional root at the final planned position aborts before ANY earlier rule/value/snapshot payload read or result", async () => {
  const root = variant(base.declared, data => { data.rules["always"] = "true"; });
  const good = leaf("covered-root"), uncovered = leaf("uncovered-final-root"), lane = await create({}, {}, root);
  const ruleBytes = "true", rule = digestBytes(utf8(ruleBytes));
  await lane.inside(state => { state.storage.sql.exec("INSERT INTO retained_input (kind, digest, bytes) VALUES ('rule', ?, ?)", rule, ruleBytes); });
  await keep(lane, [good, uncovered]);
  const through = await appendOutcomes(lane, [good.digest, uncovered.digest], rule);
  const policies = new Map([[root.digest, outcomes(root)], [good.digest, policy(good)]]);
  const refused = await scan(lane, through, policies);
  expect(payloadReads(refused.calls)).toEqual([]);
  expect(refused.result).toEqual({ ok: false, reason: "unsupported-archive-cohort" });
  expect(entryReads(refused.calls)).toHaveLength(3); // admitted local planning really ran
  const customOwner: OperationRules = { selects: false, read: true, retries: () => false, valueDomains: [{ domain: "custom-private-domain", max: 32 }] };
  policies.set(uncovered.digest, { ...policy(uncovered), support: { ...policy(uncovered).support, owners: new Map([["hold@1", new Map([["head", customOwner]])]]) } });
  const custom = await scan(lane, through, policies);
  expect(payloadReads(custom.calls)).toEqual([]);
  expect(custom.result).toEqual({ ok: false, reason: "unsupported-custom-domain" });
  policies.set(uncovered.digest, policy(uncovered));
  const covered = await scan(lane, through, policies);
  expect(covered.result.ok).toBe(true);
  if (covered.result.ok) {
    expect(covered.result.inventory.objects.some(object => object.key.kind === "rule" && object.key.digest === rule)).toBe(true);
    expect(covered.result.inventory.objects.filter(object => object.key.kind === "definition")).toHaveLength(3);
  }
  expect(payloadReads(covered.calls)).toHaveLength(1);
});

function chain(prefix: string, length: number): ValidDefinition[] {
  const nodes: ValidDefinition[] = [];
  let next: Digest | undefined;
  for (let n = length - 1; n >= 0; n--) { const node = leaf(`${prefix}-${n}`, next); nodes.unshift(node); next = node.digest; }
  return nodes;
}
async function graph(lengths: readonly number[]) {
  const lane = await create({}, {}, base), groups = lengths.map((length, n) => chain(`graph-${n}`, length)), nodes = groups.flat();
  await keep(lane, nodes);
  const through = await appendOutcomes(lane, groups.map(group => group[0]!.digest));
  const policies = new Map([[base.digest, outcomes(base)], ...nodes.map(node => [node.digest, policy(node)] as const)]);
  return scan(lane, through, policies);
}

test("native declaration metadata admits exactly 64 aggregate nodes while retaining the separate native root-plus-16 closure ceiling", async () => {
  // Synthetic outcome rows select four disjoint typed roots. The 63 stored
  // declarations plus genuine local root make 64 actual visited nodes.
  const exact = await graph([17, 17, 17, 12]);
  expect(exact.result.ok).toBe(true);
  if (exact.result.ok) { expect(exact.result.inventory.cost.nodes).toBe(64); expect(exact.result.inventory.objects).toHaveLength(64); }
  const aggregate = await graph([17, 17, 17, 13]);
  expect(aggregate.result).toEqual({ ok: false, reason: "limit" });
  expect(aggregate.cost.nodes).toBe(64);
  expect(payloadReads(aggregate.calls)).toEqual([]);
  const perRoot = await graph([18]);
  expect(perRoot.result).toEqual({ ok: false, reason: "limit" });
  expect(perRoot.cost.nodes).toBe(18); // local root + 17 visited; 18th child refused
  expect(payloadReads(perRoot.calls)).toEqual([]);
});

test("a genuine native pin to legacy membership refuses before local entry/dependency bodies despite a supplied support claim", async () => {
  // Stand-in platform data/rule and founding authority; native seed/name,
  // genesis write, pin binding and legacy-policy ordering are exercised.
  const { standingData } = await import("../../derive/test/fixtures-standing.ts");
  const { wired } = await import("./outside.ts");
  const { controls } = await import("../src/testing.ts");
  const { intentDigest, scopeIdOf, signIntent } = await import("@generalbusiness/artroom-bytes");
  const { START, at, objectOf, stubOf } = await import("./support.ts");
  const { runInDurableObject } = await import("cloudflare:test");
  const data = standingData(); data.name = "platform:membership";
  const named = "platform:membership@5";
  const intent = { v: 1 as const, to: null, actor: rita.key, kind: "found", on: null, expected: {}, fields: { source: "stand-in data for old-pin refusal" }, idempotencyKey: crypto.randomUUID(), notAfter: at(60) };
  const seed: Seed = { v: 1 as const, kind: "directory" as const, definition: named, creator: null, cause: intentDigest(intent), ordinal: 0 }, name = scopeIdOf(seed);
  controls(name, START);
  wired.set(name, () => ({ definitions: { read: async () => ({ ok: false, reason: "unavailable" }), platform: version => version === named ? { data, rules: { "settle-counter": { place: "effect", most: 1, run: () => [] } } } : null } }));
  try {
    const answer = await stubOf(name).create(signIntent(intent, rita.secret), named);
    if (answer.answer !== "accepted") return expect.fail(JSON.stringify(answer));
    const { result, bodies } = await runInDurableObject(objectOf(name), (_instance, state) => {
      const bodies: string[] = [];
      const result = inventoryArchive({ exec(query, ...args) { if (query.startsWith("SELECT bytes")) bodies.push(query); return state.storage.sql.exec(query, ...args); }, transaction: work => state.storage.transactionSync(work) }, answer.receipt.fact.at, answer.receipt.fact, PROPOSED_BOUNDS, new Map([[named, { ...policy(base), support: { ...policy(base).support, named } }]]));
      return { result, bodies };
    });
    expect(result).toEqual({ ok: false, reason: "unsupported-credential-cohort" });
    expect(bodies).toEqual([]);
  } finally { wired.delete(name); }
});

test("all eight closed local variants plan only native typed consumers; checkpoint state and unrelated digest strings add no dependency", async () => {
  // Synthetic closed forms test consumer coverage, not admitted judgments.
  const lane = await create({}, {}, base), unrelated = textDigest("not a dependency"), omitted = textDigest("omitted text");
  const signed = lane.intent(rita, "remark", { on: 0, fields: { text: omitted } });
  const through = await appendInputs(lane, [
    { type: "act", signed, authority: [], presented: {} },
    { type: "delivery", from: lane.genesis.fact, n: 0, message: { class: "control", type: "confirm", genesis: lane.genesis.fact } },
    { type: "timed", item: 0, rule: unrelated, due: lane.signed.intent.notAfter },
    { type: "diagnosis", of: { seq: 1, n: 0 }, finding: "undelivered", attempts: [] },
    { type: "outcome", owner: "hold@1", kind: "archive-fixture", operation: "0:0", attempt: 0, result: "confirmed", evidence: { basis: "own-answer", body: base.digest } },
    { type: "preparation", signed, authority: [], capability: "hold@1", step: "stage" },
    { type: "checkpoint", through: 6, state: unrelated },
  ]);
  const reviewed = outcomes(base), policies = new Map([[base.digest, { ...reviewed, support: { ...reviewed.support, preparations: new Map([["hold@1", new Set(["stage"])]]) } }]]);
  const complete = await scan(lane, through, policies);
  expect(complete.result.ok).toBe(true);
  if (complete.result.ok) {
    expect(complete.result.inventory.entries).toHaveLength(8);
    expect(complete.result.inventory.objects.map(object => object.key)).toEqual([{ kind: "definition", digest: base.digest }]);
    expect(complete.result.inventory.objects[0]!.consumers).toMatchObject([{ consumer: "declaration", origin: { input: "genesis" } }, { consumer: "outcome-value", origin: { input: "outcome" } }]);
    expect(complete.result.inventory.omittedTexts.map(text => text.key.digest)).toEqual([omitted]);
    expect(complete.calls.some(call => call.key === unrelated)).toBe(false);
  }
});

test("the original native pass deadline fences local planning and unreadable owner evidence cannot become an empty dependency claim", async () => {
  const lane = await create({}, {}, base), through = await appendOutcomes(lane, [base.digest]);
  const reviewed = outcomes(base), policies = new Map([[base.digest, reviewed]]);
  let time = 0;
  const timeout = await scan(lane, through, policies, {}, query => { if (query.startsWith("SELECT bytes FROM entry")) time = 10; }, { now: () => time, milliseconds: 10 });
  expect(timeout.result).toEqual({ ok: false, reason: "timeout" });
  expect(entryReads(timeout.calls)).toHaveLength(1);
  expect(payloadReads(timeout.calls)).toEqual([]);
  const rules = reviewed.support.owners.get("hold@1")!.get("archive-fixture")!;
  policies.set(base.digest, { ...reviewed, support: { ...reviewed.support, owners: new Map([["hold@1", new Map([["archive-fixture", { ...rules, retains: () => { throw new Error("scripted malformed owner evidence"); } }]])]]) } });
  const unreadable = await scan(lane, through, policies);
  expect(unreadable.result).toEqual({ ok: false, reason: "unsupported-archive-cohort" });
  expect(payloadReads(unreadable.calls)).toEqual([]);
});
