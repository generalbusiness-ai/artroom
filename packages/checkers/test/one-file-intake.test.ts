import { expect, test } from "vitest";
import type { ActType, DeclaredDefinition, Effect, Entry, FieldValue, ItemType, Sealed } from "@generalbusiness/artroom-contract";
import { canonicalBytes, definitionDigest, digestBytes, entryHash, keyIdOfSecret, signIntent, timeOf, utf8 } from "@generalbusiness/artroom-bytes";
import { sealedTargetOf, type LoadedLaneContract, type SealedTargetRead } from "../src/one-file-intake.ts";
import type { CheckReadLimits } from "../src/one-file-validation.ts";
import { lane, otherLane } from "./support.ts";

// Hand-sealed, signed fixture entries and a MADE-UP locally loaded definition.
// No scope admitted these rows; no activation, original history, ABI closure,
// runner image, configured read, token or required-check result is proved.
const limits: CheckReadLimits = { bytes: 16384, tokens: 4096, records: 512, depth: 24 };
const secret = new Uint8Array(32).fill(4), actor = keyIdOfSecret(secret);
const rules = { ...lane, kind: "rules" as const };
const context = { lane, rules }, time = timeOf(Date.UTC(2099, 0, 1));
const abi = digestBytes(utf8("unretained fixture ABI")), configuration = { domain: "artroom-check-configuration-2", digest: digestBytes(utf8("fixture configuration")) };
const selector = { type: "record" as const, of: { domain: { type: "enum" as const, of: ["artroom-check-configuration-1", "artroom-check-configuration-2"], required: true }, digest: { type: "digest" as const, required: true } } };
const item = (initial: string): ItemType => ({ many: true, max: 8, states: { [initial]: { final: false } }, initial, parties: {}, refs: {}, values: {} });
const row = (on: string): ActType => ({ step: "open", on, also: {}, grant: "change.propose", fields: {}, guards: [], effects: [], sends: [], attention: [] });
const def: DeclaredDefinition = { format: "artroom-definition-1", name: "change", profile: { name: "fixture", version: 1 }, capabilities: [], genesis: "found", items: { manifest: item("current"), job: item("requested") }, acts: { "propose-file": row("manifest"), "propose-manifest": row("manifest"), "request-check": row("job") }, receives: {}, timed: {}, rules: {} };
for (const [name, shape, required] of [
  ["target", { type: "enum", of: ["integration", "one-file"] }, true], ["base", { type: "commit" }, true], ["tree", { type: "tree" }, false],
  ["integration", { type: "commit" }, false], ["path", { type: "text", max: 1024 }, false], ["digest", { type: "digest" }, false], ["size", { type: "int", min: 0, max: 65536 }, false],
] as const) def.items["manifest"]!.values[name] = { fixed: true, required, of: shape };
for (const [kind, mode, names] of [["propose-file", "one-file", ["base", "tree", "path", "digest", "size"]], ["propose-manifest", "integration", ["base", "tree", "integration"]]] as const) {
  const act = def.acts[kind]!;
  act.effects = [{ value: { slot: "target", from: { const: mode } } }, ...names.map((name) => ({ value: { slot: name, from: { field: name } } }))];
  for (const name of names) act.fields[name] = { ...def.items["manifest"]!.values[name]!.of, required: true };
}
def.acts["propose-file"]!.fields["content"] = { type: "text", max: 65536, required: true };
const request = def.acts["request-check"]!;
request.also = { manifest: { item: "manifest", by: "manifest" } };
request.fields = { manifest: { type: "item", of: "manifest", required: true }, name: { type: "text", max: 128, required: true }, configuration: { ...selector, required: true } };
def.items["job"]!.refs["manifest"] = { fixed: true, required: true, to: { type: "item", of: "manifest" } };
for (const [name, shape] of [["name", { type: "text", max: 128 }], ["configuration", selector], ["tree", { type: "tree" }], ["deadline", { type: "time" }]] as const)
  def.items["job"]!.values[name] = { fixed: true, required: true, of: shape };
request.effects = [{ ref: { slot: "manifest", from: { item: "also.manifest" } } }, { value: { slot: "name", from: { field: "name" } } }, { value: { slot: "configuration", from: { field: "configuration" } } }, { value: { slot: "tree", from: { slot: "tree", of: "also.manifest" } } }, { value: { slot: "deadline", from: { time: { plusSeconds: 1800 } } } }];
const loaded: LoadedLaneContract = { definition: definitionDigest(def), bytes: canonicalBytes(def), oneFileABI: abi };
const seal = (entry: Entry): Sealed => ({ entry, hash: entryHash(entry) });
const value = (item: number, slot: string, value: FieldValue): Effect => ({ effect: "value", item, slot, value });
function opening(seq: number, kind: string, fields: Record<string, FieldValue>, effects: Effect[]): Sealed {
  return seal({ v: 1, at: lane, seq, prev: digestBytes(utf8(`fixture-${seq}`)), time, clamped: false, epoch: 0, input: { type: "act", signed: signIntent({ v: 1, to: lane, actor, kind, on: null, expected: {}, fields, idempotencyKey: `fixture-${seq}`, notAfter: timeOf(Date.UTC(2099, 0, 1) + 60000) }, secret), authority: [], presented: {} }, uses: [], prepared: [], effects, sends: [] });
}
function evidence(kind: "one-file" | "integration" = "one-file") {
  const base = "1".repeat(40), tree = "2".repeat(40), content = "hé", digest = digestBytes(utf8(content));
  const fields = kind === "one-file" ? { base, tree, path: "README.md", digest, size: 3, content } : { base, tree, integration: "3".repeat(40) };
  const effects: Effect[] = [{ effect: "open", item: 5, type: "manifest", state: "current" }, value(5, "target", kind), ...Object.entries(fields).filter(([name]) => name !== "content").map(([name, v]) => value(5, name, v!))];
  const manifest = opening(5, kind === "one-file" ? "propose-file" : "propose-manifest", fields as Record<string, FieldValue>, effects);
  const job = opening(7, "request-check", { manifest: 5, name: "ci", configuration }, [{ effect: "open", item: 7, type: "job", state: "requested" }, { effect: "ref", item: 7, slot: "manifest", to: 5 }, value(7, "name", "ci"), value(7, "tree", tree), value(7, "configuration", configuration), value(7, "deadline", timeOf(Date.UTC(2099, 0, 1) + 1800000))]);
  const read: SealedTargetRead = { manifest, job, pinned: loaded.definition, activated: { rules, definition: loaded.definition, name: "change", state: "active" }, definitionBytes: loaded.bytes };
  const fact = { at: lane, seq: 7, hash: job.hash };
  return { read, fact, base, tree, content, digest };
}

test("sealed openings, exact loaded definition and explicit selector derive file/integration without absence inference", () => {
  const e = evidence();
  expect(sealedTargetOf(context, e.fact, e.read, loaded, limits)).toMatchObject({ job: { fact: e.fact, laneDefinition: loaded.definition, abi, target: { kind: "one-file", base: e.base, tree: e.tree, path: "README.md", content: "hé", size: 3, digest: e.digest }, configuration } });
  const integration = evidence("integration");
  expect(sealedTargetOf(context, integration.fact, integration.read, loaded, limits)).toMatchObject({ job: { abi: null, target: { kind: "integration", commit: "3".repeat(40) }, configuration } }); // Compatibility is deliberately not decided here.
  const substituted = structuredClone(e.read.manifest!);
  substituted.entry.effects = substituted.entry.effects.map((v) => v.effect === "value" && v.slot === "path" ? { ...v, value: "OTHER.md" } : v);
  expect(sealedTargetOf(context, e.fact, { ...e.read, manifest: seal(substituted.entry) }, loaded, limits)).toEqual({ unavailable: "target" });
  const unlabeled = structuredClone(e.read.manifest!);
  unlabeled.entry.effects = unlabeled.entry.effects.filter((v) => !(v.effect === "value" && v.slot === "target"));
  expect(sealedTargetOf(context, e.fact, { ...e.read, manifest: seal(unlabeled.entry) }, loaded, limits)).toEqual({ unavailable: "target" });
  const unsigned = structuredClone(e.read.manifest!);
  if (unsigned.entry.input.type === "act") unsigned.entry.input.signed.intent.fields["content"] = "xx";
  expect(sealedTargetOf(context, e.fact, { ...e.read, manifest: seal(unsigned.entry) }, loaded, limits)).toEqual({ unavailable: "manifest" });
});

test("missing context, substituted retained definition and digest-only old job stay unavailable", () => {
  const e = evidence();
  expect(sealedTargetOf(context, e.fact, e.read, null, limits)).toEqual({ unavailable: "definition" });
  expect(sealedTargetOf(context, e.fact, { ...e.read, activated: { ...e.read.activated!, rules: { ...rules, inc: otherLane.inc } } }, loaded, limits)).toEqual({ unavailable: "definition" });
  expect(sealedTargetOf(context, e.fact, { ...e.read, definitionBytes: canonicalBytes({ ...def, name: "other" }) }, loaded, limits)).toEqual({ unavailable: "definition" });
  expect(sealedTargetOf(context, e.fact, e.read, { ...loaded, oneFileABI: null }, limits)).toEqual({ unavailable: "contract" });
  const legacy = opening(7, "request-check", { manifest: 5, name: "ci", configuration: configuration.digest }, e.read.job!.entry.effects.map((v) => v.effect === "value" && v.slot === "configuration" ? { ...v, value: configuration.digest } : v));
  expect(sealedTargetOf(context, { ...e.fact, hash: legacy.hash }, { ...e.read, job: legacy }, loaded, limits)).toEqual({ unavailable: "job" });
});
