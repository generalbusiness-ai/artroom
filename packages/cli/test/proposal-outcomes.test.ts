import { expect, test } from "vitest";
import type { DutyId, Entry, FactRef, Item, Receipt, ScopeRef, Seed, SignedIntent, Summary } from "@generalbusiness/artroom-contract";
import { canonicalize, definitionDigest, entryHash, factRefOf, intentDigest, newIncarnation, scopeIdOf, textDigest, utf8, verifySignedIntent } from "@generalbusiness/artroom-bytes";
import { changeDemo3 } from "@generalbusiness/artroom-lanes";
import { command, memoryStore, type Context } from "../src/index.ts";

// CLI/HTTP boundary STAND-IN: summaries and accepted work are scripted, not
// native admission or authority. The real client still shapes and signs every
// request, validates HTTP answers and reads exact declaration bytes. Receipts
// name canonical entries containing the EXACT submitted signed envelope and
// its definition/effects; no room, provider, scheduler or replay runs here.
// Native accepted and post-admission lost-answer counterparts stay in
// lanes/test/manifest-tree.scope.test.ts.
type Category = "link-summary" | "link-request" | "link-unavailable" | "source-unavailable" | "source-refused" | "source-mismatch" | "rules-read";
const TIME = "2026-10-09T12:00:00Z";
const PRIVATE = "TEST private transport payload";
const CONTENT = "# TEST private source content\n";
const BASE = "a".repeat(40);
const PIN = definitionDigest(changeDemo3);
const DECLARATION = canonicalize(changeDemo3);
const DEFINITIONS = { directory: "platform:directory@3", membership: "platform:membership@2", rules: "platform:rules@2", destination: "platform:destination@3", lane: PIN } as const;
const ref = (label: string, kind: keyof typeof DEFINITIONS): ScopeRef => ({
  // Repeated base32 characters are not necessarily a canonical digest. Use
  // the real identifier codec even for this explicitly scripted identity.
  scope: scopeIdOf({ v: 1, kind, definition: DEFINITIONS[kind], creator: null, cause: textDigest(`scripted ${label}`), ordinal: 0 }),
  inc: newIncarnation(new Uint8Array(16).fill(7)), kind,
});
const item = (type: string, id: number, state: string, values: Item["values"] = {}, refs: Item["refs"] = {}, parties: Item["parties"] = {}): Item => ({ id, type, state, revision: 1, opened: null, values, refs, parties, attributed: [] });

async function fixture(category: Category) {
  const D = ref("a", "directory"), M = ref("b", "membership"), R = ref("c", "rules"), G = ref("d", "destination"), I = ref("e", "lane");
  const store = memoryStore(); await store.keep("test", new Uint8Array(32).fill(11));
  await store.save({ v: 1, service: "https://cli.test", key: "test", handle: "@rita", repository: { directory: D, membership: M, rules: R.scope, destination: G.scope } });
  const summaries = new Map<string, Summary>([
    [D.scope, { scope: D, definition: "platform:directory@3", status: "active", time: TIME, counts: [], items: [item("lane", 1, "created", { kind: "issue" }, { scope: I })] }],
    [R.scope, { scope: R, definition: "platform:rules@2", status: "active", time: TIME, counts: [], items: [item("definition", 1, "active", { name: "change", digest: PIN })] }],
    [G.scope, { scope: G, definition: "platform:destination@3", status: "active", time: TIME, counts: [], items: [item("branch", 0, "ready", { head: BASE })] }],
    [I.scope, { scope: I, definition: PIN, status: "active", time: TIME, counts: [], items: [item("intent", 0, "open", { number: 1, title: "Missing page" }, {}, { requester: { membership: M, member: "@rita" }, assignees: [] })] }],
  ]);
  const entries = new Map<string, Entry[]>();
  const accepted: { kind: string; path?: string; fact: FactRef; signed: SignedIntent }[] = [];
  const posted: SignedIntent[] = [];
  let lane: ScopeRef | null = null, sources = 0;
  const read = (value: unknown) => Response.json({ ok: true, at: { seq: 0, hash: textDigest("scripted head") }, complete: true, value });
  const fetch: NonNullable<Context["fetch"]> = async (url, init) => {
    const [, , , scope, what, arg] = new URL(url).pathname.split("/");
    if (what === "sessions") return Response.json({ ok: false, reason: "sessions-unavailable" });
    if (what === "retained") return read({ kind: "definition", digest: PIN, bytes: DECLARATION });
    if (what === "entries") {
      const entry = entries.get(scope!)?.find(e => e.seq === Number(arg));
      return entry ? read({ entry, hash: entryHash(entry) }) : Response.json({ ok: false, reason: "not-found" });
    }
    if (what !== "acts") {
      if (lane && scope === lane.scope && (category === "link-summary" && accepted.some(a => a.kind === "propose-manifest") || category === "rules-read" && accepted.some(a => a.kind === "ask-rules"))) throw new Error(PRIVATE);
      const summary = summaries.get(scope!);
      if (!summary) throw new Error(`Unexpected fixture read: ${scope}/${what}`);
      return read(summary);
    }
    const { signed } = JSON.parse(String(init?.body)) as { signed: SignedIntent };
    expect(verifySignedIntent(signed)).toBe(true);
    posted.push(signed);
    const kind = signed.intent.kind;
    if (kind === "link-own") {
      if (category === "link-request") throw new Error(PRIVATE);
      if (category === "link-unavailable") return Response.json({ answer: "unavailable", reason: "busy" });
    }
    if (kind === "propose-file" && ++sources === 2) {
      if (category === "source-unavailable") return Response.json({ answer: "unavailable", reason: "busy" });
      if (category === "source-mismatch") return Response.json({ answer: "mismatch", reason: "idempotency-mismatch" });
      if (category === "source-refused") return Response.json({ answer: "refused", reason: "bad-field", name: "test-refusal", judgedAt: { seq: 99, hash: textDigest("scripted refusal") } });
    }
    const target = signed.intent.to!;
    const prior = entries.get(target.scope) ?? [];
    const seq = prior.length + 1;
    const entry: Entry = { v: 1, at: target, seq, prev: prior.length ? entryHash(prior.at(-1)!) : textDigest("scripted prior head"), time: TIME, clamped: false, epoch: 0, input: { type: "act", signed, authority: [], presented: {} }, uses: [], prepared: [], effects: [], sends: [] };
    if (kind === "open-pr") {
      const seed: Seed = { v: 1, kind: "lane", definition: PIN, creator: D, cause: intentDigest(signed.intent), ordinal: 0 };
      lane = { scope: scopeIdOf(seed), inc: newIncarnation(new Uint8Array(16).fill(9)), kind: "lane" };
      entry.effects = [{ effect: "open", item: seq, type: "lane", state: "opened" }];
      entry.sends = [{ n: 0, to: seed, message: { class: "request", type: "create", body: { fields: signed.intent.fields } } }];
      const singles = Object.entries(changeDemo3.items).filter(([, t]) => !t.many).map(([type, t], id) => item(type, id, t.initial, type === "rules" ? { revision: 1 } : {}));
      summaries.set(lane.scope, { scope: lane, definition: PIN, status: "active", time: TIME, counts: [], items: singles });
    } else if (kind === "propose-file" || kind === "propose-manifest") {
      const type = kind === "propose-file" ? "source" : "manifest";
      entry.effects = [{ effect: "open", item: seq, type, state: kind === "propose-file" ? "collected" : "current" }];
    }
    prior.push(entry); entries.set(target.scope, prior);
    const fact = factRefOf(entry);
    accepted.push({ kind, ...(typeof signed.intent.fields["path"] === "string" ? { path: signed.intent.fields["path"] } : {}), fact, signed });
    const receipt: Receipt = { fact, definition: summaries.get(target.scope)!.definition, intent: intentDigest(signed.intent), effects: entry.effects, sends: entry.sends.map(s => `${seq}.${s.n}` as DutyId), epoch: 0 };
    return Response.json({ answer: "accepted", receipt });
  };
  const context: Context = { store, fetch, now: () => Date.parse(TIME), tries: 1, pause: async () => {}, read: async () => utf8(CONTENT), git: { run: async () => 0, files: async () => ({ ok: true, tip: BASE, files: [{ path: "one.md", bytes: utf8(CONTENT) }, { path: "docs/two.md", bytes: utf8("# Second source\n") }] }) } };
  return { context, accepted, posted };
}

// Invariant: after a known frozen proposal, read/pre-send/unknown-link categories
// retain its identity, redact transport details and sign no merge or retry.
test.each(["link-summary", "link-request", "link-unavailable"] as const)("CLI linking %s retains known proposal and stops before merge (HTTP STAND-IN)", async category => {
  const f = await fixture(category);
  const result = await command(f.context, ["edit", "one.md", "--file", "one.md", "--closes", "1"]);
  expect(f.accepted.some(a => a.kind === "propose-manifest"), result.lines.join("\n")).toBe(true);
  const manifest = f.accepted.find(a => a.kind === "propose-manifest")!.fact;
  expect(result.code).toBe(1);
  expect(result.lines[0]).toBe(`Proposed one.md (${utf8(CONTENT).length} bytes) as change ${manifest.at.scope}, version ${manifest.seq}.`);
  expect(result.lines[1]).toMatch(category === "link-unavailable" ? /^Unavailable: busy\./ : /^Linking could not be confirmed: a required request or reply was unavailable\.$/);
  expect(result.lines.at(-1)).toBe(`Inspect artroom show ${manifest.at.scope}:${manifest.seq} and artroom log ${manifest.at.scope} before another edit, link or merge. The proposal is recorded; linking was not confirmed and no mutation was retried.`);
  expect(f.posted.map(s => s.intent.kind)).toEqual(["open-pr", "ask-rules", "propose-file", "propose-manifest", ...(category === "link-summary" ? [] : ["link-own"])]);
  expect(f.accepted.map(a => a.kind)).toEqual(["open-pr", "ask-rules", "propose-file", "propose-manifest"]);
  expect(result.lines.join("\n")).not.toContain(PRIVATE);
  expect(result.lines.join("\n")).not.toContain(CONTENT.trim());
  for (const signed of f.posted) expect(result.lines.join("\n")).not.toContain(signed.sig);
});

// Invariant: rules-read has no current mutation; failed second-source replies
// preserve the first known source, the exact failed category/request and no
// manifest/merge. This asserts orchestration, not native refused/no-write facts.
test.each(["source-unavailable", "source-refused", "source-mismatch", "rules-read"] as const)("CLI partial proposal %s retains known work and stops the next phase (HTTP STAND-IN)", async category => {
  const f = await fixture(category);
  const result = await command(f.context, ["propose", "partial"]);
  expect(result.code).toBe(1);
  expect(f.accepted.some(a => a.kind === "ask-rules"), result.lines.join("\n")).toBe(true);
  for (const a of f.accepted) {
    const label = a.kind === "open-pr" ? "opening" : a.kind === "ask-rules" ? "rules request" : `source ${a.path}`;
    expect(result.lines).toContain(`Recorded ${label}: ${a.fact.at.scope}:${a.fact.seq}, hash ${a.fact.hash}.`);
  }
  const rules = f.accepted.find(a => a.kind === "ask-rules")!.fact;
  expect(result.lines).toContain(`Known change lane: ${rules.at.scope}.`);
  expect(f.posted.map(s => s.intent.kind)).toEqual(["open-pr", "ask-rules", ...(category === "rules-read" ? [] : ["propose-file", "propose-file"])]);
  expect(f.accepted.map(a => a.kind)).toEqual(["open-pr", "ask-rules", ...(category === "rules-read" ? [] : ["propose-file"])]);
  const last = f.posted.at(-1)!;
  expect(result.lines.join("\n")).toContain(category === "rules-read" ? "No current mutation request was submitted in this phase." : `propose-file request ${intentDigest(last.intent)}: ${category === "source-refused" ? "refused" : category === "source-mismatch" ? "mismatch" : "outcome unknown"}.`);
  if (category === "source-refused") expect(result.lines[0]).toContain("test-refusal");
  expect(result.lines.at(-1)).toContain("A fresh propose or edit opens another change lane and signs new requests");
  expect(result.lines.join("\n")).not.toContain(PRIVATE);
  expect(result.lines.join("\n")).not.toContain(CONTENT.trim());
  for (const signed of f.posted) expect(result.lines.join("\n")).not.toContain(signed.sig);
});
