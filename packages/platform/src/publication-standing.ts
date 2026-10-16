/** Bounded current-generation standing provenance for the explicit D1
 * cohort. This reads native own records, never a history range or host.
 * A record/key list supplied by a request is not provenance. */
import type { FactRef, KeyId, OperationId, PlatformDefinition, ScopeRef } from "@generalbusiness/dap-contract";
import { canonicalize, entryHash, isFactRef, isKeyId, isRecord, isScopeRef, utf8 } from "@generalbusiness/artroom-bytes";
import type { Item, Operation, Own } from "@generalbusiness/dap-derive";
import type { ReservationStanding } from "./reservation.ts";

export interface StandingCheck {
  readonly name: string;
  readonly job: FactRef;
  readonly passed: boolean;
  readonly proof?: { readonly key: KeyId; readonly result: FactRef; readonly decided: number };
}
/** Versioned shape inside @5's existing passes slot; old pins keep arrays. */
export interface PublicationStandingRecord {
  readonly reservation: number;
  readonly base: { readonly merger: ReservationStanding["base"][number]; readonly approvals: ReservationStanding["base"] };
  readonly checks: readonly StandingCheck[];
}
export interface PublicationStandingContext {
  readonly at: ScopeRef;
  readonly membership: ScopeRef;
  readonly owner: PlatformDefinition;
  readonly before: number;
  readonly own: Own;
  operation(id: OperationId): Operation | null;
}
export type PublicationStandingRead = { readonly ok: true; readonly keys: readonly KeyId[] } | { readonly ok: false; readonly reason: "unavailable" | "limit" };
const same = (a: unknown, b: unknown): boolean => { try { return canonicalize(a) === canonicalize(b); } catch { return false; } };
const natural = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0 && !Object.is(n, -0);
const fields = (value: Record<string, unknown>, expected: string) => Object.keys(value).sort().join(",") === expected;
const named = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 128 && utf8(value).length <= 128;

/** Closed metadata before any own-record lookup. */
export function publicationStandingRecord(value: unknown): PublicationStandingRecord | null {
  if (!isRecord(value) || !fields(value, "base,checks,reservation") || !natural(value["reservation"]) || !isRecord(value["base"]) || !fields(value["base"], "approvals,merger") || !Array.isArray(value["base"]["approvals"]) || value["base"]["approvals"].length > 64 || !Array.isArray(value["checks"]) || value["checks"].length > 32) return null;
  if (![value["base"]["merger"], ...value["base"]["approvals"]].every(base => isRecord(base) && fields(base, "from,key") && isFactRef(base["from"]) && isKeyId(base["key"]))) return null;
  const names = new Set<string>();
  for (const check of value["checks"]) {
    if (!isRecord(check) || !fields(check, Object.hasOwn(check, "proof") ? "job,name,passed,proof" : "job,name,passed") || !named(check["name"]) || names.has(check["name"]) || !isFactRef(check["job"]) || typeof check["passed"] !== "boolean") return null;
    names.add(check["name"]);
    const proof = check["proof"];
    if (proof !== undefined && (!check["passed"] || !isRecord(proof) || !fields(proof, "decided,key,result") || !natural(proof["decided"]) || !isKeyId(proof["key"]) || !isFactRef(proof["result"]))) return null;
  }
  return value as unknown as PublicationStandingRecord;
}

/** At most one reservation plus 32 accepted decisions and their 32
 * opening entries (65 distinct own records). All
 * references bind the same scope/incarnation, holder and exact native
 * operation/attempt outcome. A newer fenced job cannot reuse an old key. */
export function publicationStandingKeys(context: PublicationStandingContext, publication: Item): PublicationStandingRead {
  const unavailable = (): PublicationStandingRead => ({ ok: false, reason: "unavailable" });
  try {
    const record = publicationStandingRecord(publication.values["passes"]), lane = publication.refs["lane"];
    if (context.owner !== "platform:destination@5" || publication.type !== "publication" || !natural(context.before) || !record || !isScopeRef(lane) || record.reservation !== publication.values["reservedAt"] || record.reservation >= context.before) return unavailable();
    const cache = new Map<number, ReturnType<Own>>();
    const own = (seq: number) => {
      if (!natural(seq) || seq < record.reservation || seq >= context.before) return null;
      if (!cache.has(seq)) {
        if (cache.size >= 65) return null;
        const got = context.own(seq);
        cache.set(seq, got && got.entry.seq === seq && same(got.entry.at, context.at) && entryHash(got.entry) === got.hash ? got : null);
      }
      return cache.get(seq) ?? null;
    };
    const accepted = (seq: number, kind: "judge" | "check-judge") => {
      const got = own(seq), input = got?.entry.input;
      if (!got || input?.type !== "outcome" || input.result !== "confirmed" || input.owner !== context.owner || input.kind !== kind) return null;
      const operation = context.operation(input.operation);
      if (!operation || operation.id !== input.operation || operation.owner !== context.owner || operation.kind !== kind || operation.for !== publication.id || !operation.attempts.some(attempt => attempt.attempt === input.attempt && attempt.outcomes.some(outcome => outcome.seq === seq && outcome.result === "confirmed"))) return null;
      const values = got.entry.effects.filter(effect => effect.effect === "value" && effect.item === publication.id && effect.slot === "passes");
      if (values.length !== 1 || values[0]?.effect !== "value") return null;
      const metadata = publicationStandingRecord(values[0].value);
      return metadata?.reservation === record.reservation && same(metadata.base, record.base) ? { got, operation, metadata } : null;
    };
    const reservation = accepted(record.reservation, "judge");
    if (!reservation || !reservation.got.entry.effects.some(effect => effect.effect === "value" && effect.item === publication.id && effect.slot === "reservedAt" && effect.value === record.reservation)) return unavailable();
    const keyObserved = (seq: number, key: KeyId): boolean => {
      const input = own(seq)?.entry.input;
      if (input?.type !== "outcome") return false;
      const observations = (input.observed ?? []).filter(use => !("subject" in use.observation) && use.observation.key === key);
      return observations.length === 1 && same(observations[0]!.observation.of, context.membership);
    };
    const keys = new Set<KeyId>();
    for (const base of [record.base.merger, ...record.base.approvals]) {
      if (!same(base.from.at, lane) || !reservation.got.entry.uses.some(use => same(use.fact, base.from)) || !keyObserved(record.reservation, base.key)) return unavailable();
      keys.add(base.key);
    }
    const required: unknown = publication.values["requiredChecks"] ?? record.checks.map(check => check.name);
    if (!Array.isArray(required) || required.length > 32 || !required.every(named) || new Set(required).size !== required.length) return unavailable();
    for (const name of required) {
      const row = record.checks.find(check => check.name === name), proof = row?.proof;
      if (!row?.passed || !proof || !same(row.job.at, lane) || !same(proof.result.at, lane)) return unavailable();
      const decision = accepted(proof.decided, proof.decided === record.reservation ? "judge" : "check-judge");
      if (!decision || !decision.metadata.checks.some(check => same(check, row)) || !keyObserved(proof.decided, proof.key)) return unavailable();
      if (proof.decided !== record.reservation) {
        const input = decision.got.entry.input;
        if (input.type !== "outcome" || !isRecord(input.evidence.body) || !same(input.evidence.body["result"], proof.result)) return unavailable();
        const [openingSeq, ordinal] = decision.operation.id.split(":").map(Number), opening = own(openingSeq!)?.entry;
        const opened = opening?.effects.filter(effect => effect.effect === "operation" && effect.k === ordinal);
        if (opened?.length !== 1 || opened[0]?.effect !== "operation" || opened[0].owner !== context.owner || opened[0].kind !== "check-judge" || opened[0].for !== publication.id) return unavailable();
        const message = opening?.input.type === "delivery" ? opening.input.message : null;
        if (message?.class !== "request" || message.type !== "tell" || !isRecord(message.body) || message.body["message"] !== "checked" || !isRecord(message.body["fields"]) || !same(message.body["fields"]["job"], row.job) || !same(message.body["fields"]["result"], proof.result)) return unavailable();
      }
      keys.add(proof.key);
    }
    // Complete distinct set or refusal; never return a truncated prefix.
    return keys.size <= 9 ? { ok: true, keys: [...keys] } : { ok: false, reason: "limit" };
  } catch { return unavailable(); }
}
