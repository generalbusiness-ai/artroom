/** Successor intake preparation only. No service call, activation, replay,
 * acquisition, compatibility permission, mint, run, signing or storage. */
import type { ActType, DeclaredDefinition, Digest, Effect, FactRef, ScopeRef, Sealed, Timestamp } from "@generalbusiness/artroom-contract";
import { canonicalBytes, canonicalize, definitionDigest, entryHash, isDigest, isEntry, isFactRef, isLocalId, isRecord, isScopeRef, timeMs, utf8 } from "@generalbusiness/artroom-bytes";
import { verifySignedIntent } from "@generalbusiness/artroom-bytes";
import type { CheckTarget, ConfigurationSelector } from "./one-file-contract.ts";
import { readCanonicalCheckValue, readCheckTarget, readSelector, type CheckReadLimits } from "./one-file-validation.ts";

/** Supplied by the configured scope reader, never by a notice or a runner. */
export interface IntakeContext { lane: ScopeRef; rules: ScopeRef }
export interface SealedTargetRead {
  job: Sealed | null; manifest: Sealed | null; pinned: Digest | null;
  activated: { rules: ScopeRef; definition: Digest; name: "change"; state: "active" } | null;
  definitionBytes: Uint8Array | null;
}
/** The locally loaded, externally reviewed contract's exact bytes and ABI
 * binding. Whole-definition validation, activation and executable/source
 * correspondence are prerequisites; these bytes alone prove none of them. */
export interface LoadedLaneContract { definition: Digest; bytes: Uint8Array; oneFileABI: Digest | null }
/** Future configured-read input, not an implemented acquisition route. */
export interface ConfiguredConfigurationRead { rules: ScopeRef; selector: ConfigurationSelector; bytes: Uint8Array | null }
/** Future pre-mint compatibility input. No ready/compatible boolean and no
 * implication that matching metadata proves retained artifact closure or an
 * actual runtime image. Those proofs remain required at that boundary. */
export interface CompatibilityInput {
  laneDefinition: Digest;
  abi: { digest: Digest; bytes: Uint8Array } | null;
  runnerRelease: { abi: Digest; image: Digest; adapter: Digest; correspondence: Digest } | null;
}
export interface IntakeJob {
  lane: ScopeRef; fact: FactRef; name: string; deadline: Timestamp;
  target: CheckTarget; configuration: ConfigurationSelector;
  laneDefinition: Digest; abi: Digest | null;
}
export type IntakeUnavailable = "context" | "definition" | "contract" | "job" | "manifest" | "target";
export type SealedTargetIntake = { job: IntakeJob } | { unavailable: IntakeUnavailable };
const same = (a: unknown, b: unknown): boolean => canonicalize(a) === canonicalize(b);
const scope = (a: ScopeRef, b: ScopeRef): boolean => a.scope === b.scope && a.inc === b.inc && a.kind === b.kind;
const slot = (effects: readonly Effect[], item: number, name: string, kind: "value" | "ref" = "value"): unknown => {
  const found = effects.filter((e) => e.effect === kind && e.item === item && e.slot === name);
  const e = found[0];
  return found.length === 1 && e?.effect === "value" ? e.value : found.length === 1 && e?.effect === "ref" ? e.to : undefined;
};
function opening(sealed: Sealed | null, at: ScopeRef, seq: number, type: string): Sealed["entry"] | null {
  if (!sealed || !isEntry(sealed.entry) || !scope(sealed.entry.at, at) || sealed.entry.seq !== seq || entryHash(sealed.entry) !== sealed.hash) return null;
  const entry = sealed.entry, opens = entry.effects.filter((e) => e.effect === "open");
  if (opens.length !== 1 || opens[0]?.item !== seq || opens[0].type !== type || entry.input.type !== "act") return null;
  const signed = entry.input.signed;
  return signed.intent.to !== null && scope(signed.intent.to, at) && signed.intent.on === null && verifySignedIntent(signed) ? entry : null;
}
const selectorField = { type: "record", of: { domain: { type: "enum", of: ["artroom-check-configuration-1", "artroom-check-configuration-2"], required: true }, digest: { type: "digest", required: true } } };
function field(row: ActType, name: string, shape: unknown): boolean { return same(row.fields[name], { ...shape as object, required: true }); }
function source(row: ActType, kind: "value" | "ref", name: string, from: unknown): boolean {
  const found = row.effects.filter((e) => (e.of === undefined || e.of === "on") && kind in e && (e as unknown as Record<string, { slot: string }>)[kind]?.slot === name);
  if (found.length !== 1) return false;
  // Conditional writes and other sources are not this supported opening grammar.
  const e: Record<string, unknown> = { ...found[0] }; delete e["of"];
  return same(e, { [kind]: { slot: name, from } });
}
function fixed(def: DeclaredDefinition, item: string, name: string, shape: unknown, required: boolean | null = true): boolean {
  const slot = def.items[item]?.values[name];
  return slot !== undefined && same(slot, { fixed: true, required: required ?? slot.required, of: shape });
}
function supported(def: DeclaredDefinition, kind: "integration" | "one-file"): number | null {
  const row = def.acts[kind === "integration" ? "propose-manifest" : "propose-file"], job = def.acts["request-check"];
  if (!row || !job || row.step !== "open" || row.on !== "manifest" || job.step !== "open" || job.on !== "job") return null;
  if (!fixed(def, "manifest", "target", { type: "enum", of: ["integration", "one-file"] }) || !source(row, "value", "target", { const: kind })) return null;
  for (const [name, shape] of [["base", { type: "commit" }], ["tree", { type: "tree" }]] as const)
    if (!field(row, name, shape) || !fixed(def, "manifest", name, shape, name === "tree" ? null : true) || !source(row, "value", name, { field: name })) return null;
  if (kind === "integration") {
    if (!field(row, "integration", { type: "commit" }) || !fixed(def, "manifest", "integration", { type: "commit" }, false) || !source(row, "value", "integration", { field: "integration" })) return null;
  } else {
    for (const [name, shape] of [["path", { type: "text", max: 1024 }], ["digest", { type: "digest" }], ["size", { type: "int", min: 0, max: 65536 }]] as const)
      if (!field(row, name, shape) || !fixed(def, "manifest", name, shape, false) || !source(row, "value", name, { field: name })) return null;
    if (!field(row, "content", { type: "text", max: 65536 }) || row.effects.some((e) => (e.of === undefined || e.of === "on") && "value" in e && e.value.slot === "integration")) return null;
  }
  if (!field(job, "manifest", { type: "item", of: "manifest" }) || !same(job.also["manifest"], { item: "manifest", by: "manifest" })
    || !same(def.items["job"]?.refs["manifest"], { fixed: true, required: true, to: { type: "item", of: "manifest" } })
    || !source(job, "ref", "manifest", { item: "also.manifest" })) return null;
  for (const [name, shape] of [["name", { type: "text", max: 128 }], ["configuration", selectorField]] as const)
    if (!field(job, name, shape) || !fixed(def, "job", name, shape) || !source(job, "value", name, { field: name })) return null;
  if (!fixed(def, "job", "tree", { type: "tree" }) || !source(job, "value", "tree", { slot: "tree", of: "also.manifest" }) || !fixed(def, "job", "deadline", { type: "time" })) return null;
  const timed = job.effects.filter((e) => (e.of === undefined || e.of === "on") && "value" in e && e.value.slot === "deadline");
  const form = timed[0];
  if (timed.length !== 1 || !form || !("value" in form)) return null;
  const from: unknown = form.value.from;
  if (!isRecord(from) || !isRecord(from["time"])) return null;
  const seconds = from["time"]["plusSeconds"];
  return typeof seconds === "number" && Number.isSafeInteger(seconds) && seconds >= 0 && source(job, "value", "deadline", { time: { plusSeconds: seconds } }) ? seconds : null;
}

/** Consistency of explicit local evidence, not replay or run authorization.
 * Missing old-row fields never select a successor mode or configuration domain. */
export function sealedTargetOf(context: IntakeContext, fact: FactRef, read: SealedTargetRead, loaded: LoadedLaneContract | null, limits: CheckReadLimits): SealedTargetIntake {
  try {
    if (!isScopeRef(context.lane) || context.lane.kind !== "lane" || !isScopeRef(context.rules) || context.rules.kind !== "rules" || !isFactRef(fact) || !scope(fact.at, context.lane)) return { unavailable: "context" };
    const active = read.activated;
    if (!loaded || !isDigest(loaded.definition) || read.pinned !== loaded.definition || !active || !scope(active.rules, context.rules) || active.definition !== loaded.definition || active.name !== "change" || active.state !== "active" || !read.definitionBytes) return { unavailable: "definition" };
    const parsed = readCanonicalCheckValue(loaded.bytes, limits), retained = readCanonicalCheckValue(read.definitionBytes, limits);
    if (!parsed.ok || !retained.ok || !same(parsed.value, retained.value)) return { unavailable: "definition" };
    if (!isRecord(parsed.value) || parsed.value["format"] !== "artroom-definition-1" || parsed.value["name"] !== "change" || definitionDigest(parsed.value as unknown as DeclaredDefinition) !== loaded.definition) return { unavailable: "definition" };
    const entry = opening(read.job, context.lane, fact.seq, "job");
    if (!entry || read.job!.hash !== fact.hash || entry.input.type !== "act" || entry.input.signed.intent.kind !== "request-check") return { unavailable: "job" };
    const fields = entry.input.signed.intent.fields, manifestId = slot(entry.effects, fact.seq, "manifest", "ref");
    if (!isLocalId(manifestId) || fields["manifest"] !== manifestId) return { unavailable: "manifest" };
    const manifest = opening(read.manifest, context.lane, manifestId, "manifest");
    if (!manifest || manifest.seq >= entry.seq || manifest.input.type !== "act") return { unavailable: "manifest" };
    const kind = manifest.input.signed.intent.kind === "propose-file" ? "one-file" : manifest.input.signed.intent.kind === "propose-manifest" ? "integration" : null;
    if (!kind || slot(manifest.effects, manifest.seq, "target") !== kind) return { unavailable: "target" };
    const seconds = supported(parsed.value as unknown as DeclaredDefinition, kind);
    if (seconds === null || (kind === "one-file" && !isDigest(loaded.oneFileABI))
      || !entry.effects.some((e) => e.effect === "open" && e.state === (parsed.value as unknown as DeclaredDefinition).items["job"]?.initial)
      || !manifest.effects.some((e) => e.effect === "open" && e.state === (parsed.value as unknown as DeclaredDefinition).items["manifest"]?.initial)) return { unavailable: "contract" };
    const mf = manifest.input.signed.intent.fields;
    const names = kind === "integration" ? ["base", "tree", "integration"] : ["base", "tree", "path", "digest", "size"];
    if (names.some((name) => !same(mf[name], slot(manifest.effects, manifest.seq, name))) || (kind === "one-file" && manifest.effects.some((e) => e.effect === "value" && e.item === manifest.seq && e.slot === "integration"))) return { unavailable: "target" };
    const targetRead = readCheckTarget(canonicalBytes(kind === "integration"
      ? { kind, manifest: { at: context.lane, seq: manifest.seq, hash: read.manifest!.hash }, base: mf["base"], commit: mf["integration"], tree: mf["tree"] }
      : { kind, manifest: { at: context.lane, seq: manifest.seq, hash: read.manifest!.hash }, base: mf["base"], tree: mf["tree"], path: mf["path"], digest: mf["digest"], size: mf["size"], content: mf["content"] }), limits);
    if (!targetRead.ok || slot(entry.effects, fact.seq, "tree") !== targetRead.value.tree) return { unavailable: "target" };
    const configuration = readSelector(canonicalBytes(fields["configuration"]), limits), name = fields["name"], deadline = slot(entry.effects, fact.seq, "deadline");
    if (!configuration.ok || !same(fields["configuration"], slot(entry.effects, fact.seq, "configuration")) || typeof name !== "string" || !name || utf8(name).length > 128 || name !== slot(entry.effects, fact.seq, "name") || timeMs(deadline) === null || timeMs(deadline) !== timeMs(entry.time)! + seconds * 1000) return { unavailable: "job" };
    return { job: { lane: context.lane, fact, name, deadline: deadline as Timestamp, target: targetRead.value, configuration: configuration.value, laneDefinition: loaded.definition, abi: kind === "one-file" ? loaded.oneFileABI : null } };
  } catch { return { unavailable: "contract" }; } // No raw input/transport/provider diagnostic escapes.
}
