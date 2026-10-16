/** Whole-prefix native metadata classification. No entry/value/text/foreign
 * body is returned here. Successful classification is not integrity,
 * replay, access/consent admission or permission to export. */
import { DOMAINS } from "@generalbusiness/dap-contract";
import type { Digest, Input, PlatformDefinition } from "@generalbusiness/dap-contract";
import { isDigest, isPlatformDefinition, platformName } from "@generalbusiness/artroom-bytes";
import { declarationValueDomains, type Capabilities, type OperationRules, type ValidDefinition } from "@generalbusiness/dap-derive";
import { platform } from "@generalbusiness/dap-platform";
import { ArchiveBudget } from "./archive-budget.ts";
import { ArchivePrefixStopped, type ArchivePrefix, type ArchivePosition } from "./archive-prefix.ts";
import type { Sql } from "./sqlite.ts";

/** Trusted native code/registry metadata. A request cannot supply this map;
 * unknown owners/capability steps fail closed. No dynamic package runs. */
export interface ArchiveSupport {
  readonly named: Digest | PlatformDefinition;
  readonly definition: ValidDefinition;
  readonly capabilities?: Capabilities;
  readonly owners: ReadonlyMap<string, ReadonlyMap<string, OperationRules>>;
  readonly records: ReadonlyMap<string, ReadonlySet<string>>;
  readonly preparations: ReadonlyMap<string, ReadonlySet<string>>;
}
export interface ArchivePrivacyPosition extends ArchivePosition { readonly input: Input["type"] }
export interface ArchivePrivacyPrefix extends Omit<ArchivePrefix, "positions"> { readonly positions: readonly ArchivePrivacyPosition[] }
const stop = (reason: ConstructorParameters<typeof ArchivePrefixStopped>[0]): never => { throw new ArchivePrefixStopped(reason); };
const variants = ["genesis", "act", "delivery", "timed", "diagnosis", "outcome", "preparation", "checkpoint"] as const;
const nativeDomains: ReadonlySet<string> = new Set(Object.values(DOMAINS));
// Each expression executes at most three JSON inspections of its bounded
// entry/effect input. The complete header + owner queries use fewer than
// the 64 full-entry equivalents reserved by archivePrefixMetadata.
const text = (path: string, max: number, source = "bytes") => `CASE WHEN typeof(json_extract(${source}, '${path}')) = 'text' AND octet_length(json_extract(${source}, '${path}')) <= ${max} THEN json_extract(${source}, '${path}') ELSE NULL END`;
const HEADER = `SELECT json_extract(bytes, '$.seq') AS seq, ${text("$.at.scope", 71)} AS scope, ${text("$.at.inc", 64)} AS inc, ${text("$.at.kind", 16)} AS kind, ${text("$.input.type", 16)} AS input, ${text("$.prev", 71)} AS prev, json_type(bytes, '$.prev') AS prevType, json_type(bytes, '$.uses') AS usesType, json_array_length(bytes, '$.uses') AS uses, json_type(bytes, '$.effects') AS effectsType, json_array_length(bytes, '$.effects') AS effects FROM entry WHERE seq = ? AND hash = ? AND size = ? AND octet_length(bytes) = ? LIMIT 1`;
const OWNER_LIMIT = 65;
const natural = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0 && !Object.is(n, -0);

/** Complete trusted support metadata, including owners/domains on selected
 * declarations with no entries in this prefix. The registry is finite;
 * its presence does not create a certificate or load package code. */
export function archiveSupportMetadata(support: ArchiveSupport, budget: ArchiveBudget): void {
  budget.check();
  if (declarationValueDomains(support.definition).some(domain => !nativeDomains.has(domain))) return stop("unsupported-custom-domain");
  const known = (name: string) => name === "hold@1" || name === "git-read@1" || isPlatformDefinition(name) && platform(name) !== null;
  if (support.owners.size > 64 || support.preparations.size > 64 || support.records.size > 64) return stop("limit");
  for (const [name, kinds] of support.owners) {
    if (name.length > 128 || !known(name)) return stop("unsupported-archive-cohort");
    if (kinds.size > 64) return stop("limit");
    for (const [kind, rules] of kinds) {
      budget.spend({ inputWork: 512 });
      if (!kind || kind.length > 128 || rules.values !== undefined && rules.valueDomains === undefined) return stop("unsupported-archive-cohort");
      if (rules.valueDomains !== undefined && (!Array.isArray(rules.valueDomains) || rules.valueDomains.length > 64)) return stop("limit");
      for (const domain of rules.valueDomains ?? []) {
        budget.spend({ inputWork: 512 });
        if (!nativeDomains.has(domain.domain)) return stop("unsupported-custom-domain");
        if (!Number.isSafeInteger(domain.max) || domain.max < 1 || domain.max > 1024 * 1024) return stop("unavailable");
      }
    }
  }
  for (const table of [support.preparations, support.records]) for (const [name, kinds] of table) {
    if (!["hold@1", "git-read@1"].includes(name)) return stop("unsupported-archive-cohort");
    if (kinds.size > 64) return stop("limit");
    for (const kind of kinds) { budget.spend({ inputWork: 256 }); if (!kind || kind.length > 128) return stop("unavailable"); }
  }
  budget.check();
}

export function archivePrivacyMetadata(sql: Pick<Sql, "exec">, prefix: ArchivePrefix, support: ArchiveSupport, budget: ArchiveBudget): ArchivePrivacyPrefix {
  budget.check();
  const named = prefix.pin.seed.definition;
  if (support.named !== named || (isDigest(named) ? support.definition.digest !== named : support.definition.declared.name !== platformName(named))) return stop("unavailable");
  archiveSupportMetadata(support, budget);
  const owner = (name: unknown, kind: unknown) => {
    if (typeof name !== "string" || typeof kind !== "string") return stop("unavailable");
    const rules = support.owners.get(name)?.get(kind);
    if (!rules || rules.values !== undefined && rules.valueDomains === undefined) return stop("unsupported-archive-cohort");
    if (rules.valueDomains?.some(domain => !nativeDomains.has(domain.domain))) return stop("unsupported-custom-domain");
  };
  const positions: ArchivePrivacyPosition[] = [];
  let previous: Digest | null = null;
  for (const position of prefix.positions) {
    budget.check();
    const read = (metadata: number) => budget.native(sql, () => ({ metadata, inputWork: 0 }));
    const rows = read(512).exec(HEADER, position.seq, position.hash, position.bytes, position.bytes).toArray(), row = rows[0];
    if (rows.length !== 1 || !row || row["seq"] !== position.seq || row["scope"] !== prefix.pin.at.scope || row["inc"] !== prefix.pin.at.inc || row["kind"] !== prefix.pin.at.kind || !(variants as readonly unknown[]).includes(row["input"]) || row["usesType"] !== "array" || !natural(row["uses"]) || row["effectsType"] !== "array" || !natural(row["effects"])) return stop("unavailable");
    if (position.seq === 0 ? row["input"] !== "genesis" || row["prevType"] !== "null" : row["input"] === "genesis" || row["prev"] !== previous) return stop("mismatch");
    if (row["uses"] !== 0) return stop("unsupported-foreign-copy");
    // Native per-entry effect ceilings also apply later during body checks.
    // This cap bounds owner metadata and cannot produce partial admission.
    if (row["effects"] > OWNER_LIMIT - 1) return stop("limit");
    const opened = row["effects"] === 0 ? [] : read((row["effects"] + 1) * 512).exec(`SELECT ${text("$.effect", 16, "value")} AS effect, ${text("$.owner", 128, "value")} AS owner, ${text("$.capability", 128, "value")} AS capability, ${text("$.kind", 128, "value")} AS kind FROM entry, json_each(entry.bytes, '$.effects') WHERE entry.seq = ? AND entry.hash = ? LIMIT ?`, position.seq, position.hash, OWNER_LIMIT).toArray();
    if (opened.length >= OWNER_LIMIT) return stop("limit");
    const effects = new Set(["open", "state", "party", "ref", "value", "list", "hold", "redact", "relation", "record", "activate", "operation", "attempt", "index", "attention"]);
    if (opened.length !== row["effects"]) return stop("unavailable");
    for (const effect of opened) {
      if (typeof effect["effect"] !== "string" || !effects.has(effect["effect"])) return stop("unavailable");
      if (effect["effect"] === "operation") owner(effect["owner"], effect["kind"]);
      if (effect["effect"] === "record" && (typeof effect["capability"] !== "string" || typeof effect["kind"] !== "string" || !support.records.get(effect["capability"])?.has(effect["kind"]))) return stop("unsupported-archive-cohort");
    }
    const input = row["input"] as Input["type"];
    if (input === "outcome") {
      const outcomes = read(320).exec(`SELECT ${text("$.input.owner", 128)} AS owner, ${text("$.input.kind", 128)} AS kind FROM entry WHERE seq = ? AND hash = ? LIMIT 1`, position.seq, position.hash).toArray();
      if (outcomes.length !== 1) return stop("unavailable");
      owner(outcomes[0]!["owner"], outcomes[0]!["kind"]);
    } else if (input === "preparation") {
      const preparations = read(320).exec(`SELECT ${text("$.input.capability", 128)} AS capability, ${text("$.input.step", 128)} AS step FROM entry WHERE seq = ? AND hash = ? LIMIT 1`, position.seq, position.hash).toArray(), preparation = preparations[0];
      if (preparations.length !== 1 || typeof preparation?.["capability"] !== "string" || typeof preparation["step"] !== "string" || !support.preparations.get(preparation["capability"])?.has(preparation["step"])) return stop("unsupported-archive-cohort");
    }
    positions.push({ ...position, input }); previous = position.hash;
  }
  budget.check();
  return { ...prefix, positions };
}
