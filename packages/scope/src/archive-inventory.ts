/** One local, caller-owned synchronous read frame. No route, writer,
 * certificate, provider lease, current authority or replay verdict. */
import type { Bounds, Digest, Head, Input, PlatformDefinition, ScopeRef } from "@generalbusiness/dap-contract";
import { canonicalize, entryHash, isDigest, isEntry, parseStrict, utf8 } from "@generalbusiness/artroom-bytes";
import { creates, derivable, localRetainedPlan, requiredDependency, snapshotRead, runnable, outcomeValueDomains, UnsupportedConsumer, validateDefinition } from "@generalbusiness/dap-derive";
import type { DependencyOrigin, LocalRetainedPlan, RequiredDependency, RetainedDependency, RetainedKey, TextDependency, ValidDefinition } from "@generalbusiness/dap-derive";
import { platform } from "@generalbusiness/dap-platform";
import { RULE_PROFILES } from "@generalbusiness/dap-derive/rule";
import { ArchiveBudget, ArchiveStopped, type ArchiveCost } from "./archive-budget.ts";
import { ARCHIVE_PIN_BYTES, ARCHIVE_SCOPE_METADATA_BYTES, readArchivePin } from "./archive-pin.ts";
import { archivePrefixMetadata, ArchivePrefixStopped, type ArchivePrefixReason } from "./archive-prefix.ts";
import { archivePrivacyMetadata, archiveSupportMetadata, type ArchiveSupport } from "./archive-privacy.ts";
import { ArchiveRetainedReader, readArchiveProbe } from "./archive-retained.ts";
import type { Sql } from "./sqlite.ts";

/** Loaded only from trusted reviewer/native configuration, never request
 * input. `entryTypes` is the reviewed coverage of inline signed fields and
 * owner evidence, in addition to the exact definition's policy. A supplied
 * support table or a digest in a set alone does not supply this coverage.
 * This module configures no new certificate, including for declarations.
 * The existing pin policy still excludes every legacy membership version. */
export interface ReviewedArchivePolicy {
  readonly review: string;
  readonly entryTypes: ReadonlySet<Input["type"]>;
  readonly support: ArchiveSupport;
}
export type ArchivePolicyRegistry = ReadonlyMap<Digest | PlatformDefinition, ReviewedArchivePolicy>;
export interface ArchiveSelectedObject {
  readonly key: RetainedKey;
  readonly bytes: number;
  readonly consumers: readonly RetainedDependency[];
}
export interface ArchiveInventory {
  readonly format: "artroom-local-inventory-1";
  readonly at: ScopeRef;
  readonly through: Head;
  readonly entries: readonly { readonly seq: number; readonly hash: Digest; readonly bytes: number }[];
  readonly objects: readonly ArchiveSelectedObject[];
  readonly omittedTexts: readonly TextDependency[];
  readonly ancestryUnwalked: readonly DependencyOrigin[];
  readonly replay: "unchecked";
  readonly retention: "observed-local";
  readonly cost: ArchiveCost;
}
export type ArchiveInventoryResult = { readonly ok: true; readonly inventory: ArchiveInventory } | { readonly ok: false; readonly reason: ArchivePrefixReason | "timeout" };
interface DefinitionMetadata { readonly definition: ValidDefinition; readonly bytes: number }
interface Closure { readonly root: Digest; readonly nodes: readonly Digest[]; readonly complete: boolean }
const nameOf = (key: RetainedKey) => JSON.stringify(key.kind === "value" ? [key.kind, key.domain, key.digest] : [key.kind, key.digest]);
const stop = (reason: ArchivePrefixReason): never => { throw new ArchivePrefixStopped(reason); };

/** Native Bounds and reviewed policies belong to the caller's trusted
 * context. The caller supplies its real Sql.transaction (transactionSync).
 * All work is synchronous: no provider task can outlive this frame. The
 * same one budget is used across every stage and every cache hit. */
export function inventoryArchive(sql: Sql, at: ScopeRef, through: Head, bounds: Bounds, reviewed: ArchivePolicyRegistry, budget = new ArchiveBudget()): ArchiveInventoryResult {
  try {
    return sql.transaction(() => {
      budget.check();
      const certified = { has: (digest: Digest) => reviewed.has(digest) };
      const prefix = archivePrefixMetadata(sql, at, through, bounds, budget, certified);
      const rootPolicy = reviewed.get(prefix.pin.seed.definition);
      if (!rootPolicy || !rootPolicy.review || rootPolicy.review.length > 512 || rootPolicy.support.named !== prefix.pin.seed.definition) return stop("unsupported-archive-cohort");
      const reader = new ArchiveRetainedReader(sql, budget);
      const metadata = new Map<Digest, DefinitionMetadata | null>(), visited = new Set<Digest>();
      const closures = new Map<Digest, Closure>();
      const policyOf = (digest: Digest): ReviewedArchivePolicy => {
        const policy = reviewed.get(digest);
        if (!policy || !policy.review || policy.review.length > 512 || policy.support.named !== digest || policy.support.definition.digest !== digest) return stop("unsupported-archive-cohort");
        return policy;
      };
      const declaration = (digest: Digest): DefinitionMetadata | null => {
        budget.check();
        // Even a cached/missing declaration request spends an attempt and
        // validation allowance through the same reader.
        if (!visited.has(digest)) { budget.spend({ nodes: 1 }); visited.add(digest); }
        if (!reviewed.has(digest) && !reader.definitionPresent(digest)) { metadata.set(digest, null); return null; }
        const policy = policyOf(digest);
        const got = reader.read({ kind: "definition", digest }, bounds.definitionBytes);
        if (!got) { metadata.set(digest, null); return null; }
        budget.spend({ inputWork: got.bytes.length * 3 * 16 });
        const checked = validateDefinition(got.value, bounds, RULE_PROFILES);
        budget.check();
        if (!checked.ok || checked.definition.digest !== digest || canonicalize(policy.support.definition.declared) !== got.bytes) return stop("mismatch");
        if (!derivable(checked.definition, policy.support.capabilities)) return stop("unsupported-archive-cohort");
        archiveSupportMetadata({ ...policy.support, definition: checked.definition }, budget);
        const value = { definition: checked.definition, bytes: utf8(got.bytes).length };
        metadata.set(digest, value); return value;
      };
      const closureOf = (root: Digest, platformRoot?: ValidDefinition): Closure => {
        // This is an actual closure request even on a cache hit. Read and
        // validate again; a cache never enlarges per-root/aggregate bounds.
        const asked = new Set<Digest>(platformRoot ? [root] : []), nodes: Digest[] = [], queue = platformRoot ? creates(platformRoot.declared) : [root];
        let complete = true;
        for (let digest = queue.shift(); digest !== undefined; digest = queue.shift()) {
          budget.check();
          if (asked.has(digest)) continue;
          // Native convention: root plus at most namedDefinitions children.
          if (asked.size > bounds.namedDefinitions) return stop("limit");
          asked.add(digest); nodes.push(digest);
          const found = declaration(digest);
          if (!found) { complete = false; continue; }
          queue.push(...creates(found.definition.declared));
        }
        const value = { root, nodes, complete }; closures.set(root, value); return value;
      };
      const rootOrigin: DependencyOrigin = { at: { at, seq: 0, hash: prefix.pin.genesis }, input: "genesis" };
      let definition = rootPolicy.support.definition;
      let platformClosure: Closure | null = null;
      if (isDigest(prefix.pin.seed.definition)) {
        const root = closureOf(prefix.pin.seed.definition);
        if (!root.complete) return stop("incomplete");
        definition = metadata.get(prefix.pin.seed.definition)!.definition;
      } else {
        // The supplied native platform data is trusted reviewed code; its
        // fixed native maximum is reserved before inspecting that object.
        budget.spend({ nodes: 1, inputWork: bounds.definitionBytes * 16 });
        const supplied = platform(prefix.pin.seed.definition);
        if (!supplied) return stop("unsupported-archive-cohort");
        const nativeBytes = canonicalize(supplied.data);
        if (utf8(nativeBytes).length > bounds.definitionBytes) return stop("limit");
        const checked = validateDefinition(supplied.data, bounds, RULE_PROFILES, { platform: true, outcomeValues: outcomeValueDomains(supplied.data, supplied.rules) });
        if (!checked.ok || canonicalize(definition.declared) !== nativeBytes || !runnable(checked.definition, supplied.rules) || !derivable(checked.definition, rootPolicy.support.capabilities)) return stop("unsupported-archive-cohort");
        definition = checked.definition;
        visited.add(definition.digest);
        platformClosure = closureOf(definition.digest, definition);
        if (!platformClosure.complete) return stop("incomplete");
      }
      const admitted = archivePrivacyMetadata(sql, prefix, { ...rootPolicy.support, definition }, budget);
      // First finish admission of ALL inline local-entry classes. A trusted
      // owner table/root certificate alone cannot authorize their bodies.
      if (admitted.positions.some(position => !rootPolicy.entryTypes.has(position.input))) return stop("unsupported-archive-cohort");
      const plans: { origin: DependencyOrigin; plan: LocalRetainedPlan }[] = [];
      for (const position of admitted.positions) {
        budget.spend({ inputWork: position.bytes * 32 });
        const rows = budget.native(sql, () => ({ metadata: 0, inputWork: position.bytes })).exec("SELECT bytes FROM entry WHERE seq = ? AND hash = ? AND size = ? AND typeof(bytes) = 'text' AND octet_length(bytes) = ? LIMIT 1", position.seq, position.hash, position.bytes, position.bytes).toArray();
        const bytes = rows[0]?.["bytes"];
        if (rows.length !== 1 || typeof bytes !== "string" || bytes.length > position.bytes || utf8(bytes).length !== position.bytes) return stop("mismatch");
        const entry: unknown = parseStrict(bytes);
        if (!isEntry(entry) || entry.seq !== position.seq || entry.at.scope !== at.scope || entry.at.inc !== at.inc || entry.at.kind !== at.kind || entry.input.type !== position.input || canonicalize(entry) !== bytes || entryHash(entry) !== position.hash) return stop("mismatch");
        if (entry.seq === 0 && (entry.input.type !== "genesis" || canonicalize(entry.input.seed) !== canonicalize(prefix.pin.seed) || entry.input.inc !== at.inc || canonicalize(entry.input.source) !== canonicalize(prefix.frame.genesis.source) || entry.input.n !== prefix.frame.genesis.n)) return stop("mismatch");
        // No copied-entry read for a delivery's sender identity. If exact
        // handler-under selection needs it, this v1 cannot plan that entry.
        if (entry.input.type === "delivery" && Object.values(definition.declared.receives).some(handler => handler.from.under !== undefined)) return stop("unsupported-foreign-copy");
        const rules = entry.input.type === "outcome" ? rootPolicy.support.owners.get(entry.input.owner)?.get(entry.input.kind) ?? null : null;
        const origin: DependencyOrigin = { at: { at, seq: entry.seq, hash: position.hash }, input: entry.input.type };
        const plan = localRetainedPlan(definition, entry, position.hash, rules, bounds);
        budget.check();
        plans.push({ origin, plan });
      }
      // The local-entry planning stage publishes no bodies or partial plan.
      // Classify every required and potential definition root/closure before
      // selecting ANY rule/snapshot/value payload. Potential probe roots may
      // be missing; only a subsequently selected root must be complete.
      for (const { plan } of plans) for (const { dependency } of plan.dependencies) {
        if (dependency.mode === "required" && dependency.key.kind === "definition") {
          if (!closureOf(dependency.key.digest).complete) return stop("incomplete");
        } else if (dependency.mode === "probe") for (const { key } of dependency.choices) if (key.kind === "definition") closureOf(key.digest);
      }
      const objects = new Map<string, { key: RetainedKey; bytes: number; consumers: RetainedDependency[] }>();
      const omittedTexts: TextDependency[] = [], ancestryUnwalked: DependencyOrigin[] = [];
      const add = (key: RetainedKey, bytes: number, consumer: RetainedDependency) => {
        const name = nameOf(key), prior = objects.get(name);
        if (prior) prior.consumers.push(consumer);
        else objects.set(name, { key, bytes, consumers: [consumer] });
      };
      const selectClosure = (digest: Digest, consumer: RequiredDependency | Extract<RetainedDependency, { mode: "probe" }>) => {
        const closure = closures.get(digest);
        if (!closure?.complete) return stop("incomplete");
        for (const node of closure.nodes) {
          const found = metadata.get(node);
          if (!found) return stop("incomplete");
          add({ kind: "definition", digest: node }, found.bytes, node === digest ? consumer : requiredDependency(consumer.origin, "definition-child", { kind: "definition", digest: node }));
        }
      };
      if (isDigest(prefix.pin.seed.definition)) selectClosure(prefix.pin.seed.definition, requiredDependency(rootOrigin, "declaration", { kind: "definition", digest: prefix.pin.seed.definition }));
      else for (const child of platformClosure!.nodes) {
        const found = metadata.get(child);
        if (!found) return stop("incomplete");
        add({ kind: "definition", digest: child }, found.bytes, requiredDependency(rootOrigin, "definition-child", { kind: "definition", digest: child }));
      }
      for (const { origin, plan } of plans) {
        for (const { dependency, max } of plan.dependencies) {
          budget.check();
          if (dependency.mode === "text") { omittedTexts.push(dependency); continue; }
          if (dependency.mode === "probe") {
            const selected = readArchiveProbe(reader, dependency, max, bounds.definitionBytes);
            if (!selected) return stop("incomplete");
            if (selected.key.kind === "definition") selectClosure(selected.key.digest, dependency);
            else add(selected.key, utf8(selected.value.bytes).length, dependency);
          } else if (dependency.key.kind === "definition") {
            const got = reader.read(dependency.key, max);
            if (!got) return stop("incomplete");
            selectClosure(dependency.key.digest, dependency);
          } else {
            const got = reader.read(dependency.key, max);
            if (!got) return stop("incomplete");
            if (dependency.key.kind === "snapshot") {
              const pairs = snapshotRead(dependency.key.digest, got.bytes);
              if (!pairs) return stop("mismatch");
              if (plan.ancestry?.snapshot.digest === dependency.key.digest && pairs.length !== plan.ancestry.snapshot.count) return stop("mismatch");
            }
            add(dependency.key, utf8(got.bytes).length, dependency);
          }
        }
        if (plan.ancestry) ancestryUnwalked.push(origin);
      }
      // Rebind native scope/pin/cutoff before the only result. No await or
      // mutation can occur between this fence and returning the descriptor.
      budget.spend({ inputWork: 4 * (ARCHIVE_PIN_BYTES + ARCHIVE_SCOPE_METADATA_BYTES) });
      const finalPin = readArchivePin(budget.native(sql, () => ({ metadata: ARCHIVE_PIN_BYTES + ARCHIVE_SCOPE_METADATA_BYTES, inputWork: 0 })), at);
      budget.check();
      if (!finalPin || canonicalize(finalPin) !== canonicalize(prefix.pin)) return stop("mismatch");
      const cutoff = budget.native(sql, () => ({ metadata: 128, inputWork: 0 })).exec("SELECT hash, size, octet_length(bytes) AS actual FROM entry WHERE seq = ? AND typeof(hash) = 'text' AND octet_length(hash) = 71 LIMIT 1", through.seq).toArray(), last = admitted.positions.at(-1)!;
      if (cutoff.length !== 1 || cutoff[0]?.["hash"] !== through.hash || cutoff[0]?.["size"] !== last.bytes || cutoff[0]?.["actual"] !== last.bytes) return stop("mismatch");
      budget.check();
      return { ok: true as const, inventory: { format: "artroom-local-inventory-1" as const, at, through, entries: prefix.positions, objects: [...objects.values()], omittedTexts, ancestryUnwalked, replay: "unchecked" as const, retention: "observed-local" as const, cost: budget.admitted() } };
    });
  } catch (error) {
    if (error instanceof ArchiveStopped || error instanceof ArchivePrefixStopped) return { ok: false, reason: error.reason };
    if (error instanceof UnsupportedConsumer) return { ok: false, reason: "unsupported-archive-cohort" };
    return { ok: false, reason: "unavailable" };
  }
}
