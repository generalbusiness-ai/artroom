/**
 * Plain sentences for log entries from a live room.
 *
 * An act or a recorded refusal is described under `D(s)`, the declarations
 * in force at its own seq (docs/protocol.md R-DECL-23, clarification
 * fa120186), never under the active ones:
 * - a legacy record, and `renew` and `roster` in every room, keep the
 *   sentences they have always had;
 * - a record made under the code-review declaration its sentence was written
 *   for (the same binding, not merely the same name) keeps that sentence;
 * - any other declared record is shown generically: who, the label in force
 *   at its seq, its target and its fields by name;
 * - a record whose kind had no meaning there is shown plainly with its
 *   kind. It is never dropped.
 *
 * Each guard is one statement marked `// G5U:<id>`.
 */

import type { ActId, LandOp, LogEntry, RecordMeaning } from "../contract.ts";
import { envelopeOf } from "../contract.ts";
import { checkCarriedText } from "../checks.ts";
import { recoveryNow } from "../recovery.ts";
import type { FeedEntry } from "../adapter.ts";
import { entryMeaning } from "../acts.ts";

/** How an entry's kind is to be read: its meaning at its own seq, and whether its binding is the code-review declaration's. */
export interface Under {
  /** Null when the declarations that governed the entry could not be read. */
  readonly meaning: RecordMeaning | null;
  /** True when the record's binding is the one the code-review sentence for its kind was written for. */
  readonly builtFor?: boolean;
}

/** The nine kinds of the legacy vocabulary: the only kinds a `v: 1` envelope with no readable declarations is assumed to be. */
const LEGACY = ["claim", "propose", "note", "review", "check", "land", "release", "renew", "roster"];

/** The envelope of an act of either version, as the feed reads it. */
interface Env {
  readonly v?: number;
  readonly kind: string;
  readonly target: unknown;
  readonly body: unknown;
}

/** The sentence a legacy or code-review record has always had, or null for a kind it was not written for. */
function reviewSentence(env: Env, by: string | null): string | null {
  const body = (typeof env.body === "object" && env.body !== null ? env.body : {}) as Record<string, unknown>;
  const target = (typeof env.target === "object" && env.target !== null ? env.target : {}) as Record<string, unknown>;
  switch (env.kind) {
    case "claim":
      return typeof body["goal"] === "string" && body["goal"] ? `${by} claimed “${body["goal"]}”.` : `${by} changed a claim.`;
    case "propose":
      return `${by} proposed a new generation.`;
    case "note":
      return `${by} wrote a note.`;
    case "review":
      return `${by} ${body["verdict"] === "approve" ? "approved" : "objected to"} generation ${String(target["generation"])}.`;
    case "check":
      return `${by} ran ${String(body["check"])}: ${body["ok"] ? "passed" : "failed"}.`;
    case "land":
      return `${by} asked to land generation ${String(target["generation"])}.`;
    case "release":
      return `${by} released a lane.`;
    case "renew":
      return `${by} renewed a lease.`;
    case "roster":
      return `${by ?? "The recovery key"} changed the roster (${String(body["op"])}).`;
    default:
      return null; // G5U:sentence-default
  }
}

/** One sentence for an accepted act, under its meaning at its own seq. */
function actSentence(env: Env, by: string | null, under: Under): string {
  const who = by ?? "Someone";
  const m = under.meaning;
  const plain = `${who} recorded an act of kind ${env.kind}.`;
  if (m === null) {
    // The declarations could not be read. Only a v: 1 envelope of a legacy kind is safe to read as one.
    const known = env.v === 1 && LEGACY.includes(env.kind) ? reviewSentence(env, by) : null; // G5U:unread-legacy-only
    return known ?? `${plain} Its meaning could not be read from this room.`;
  }
  switch (m.vocabulary) {
    case "artroom-legacy-v1":
      return reviewSentence(env, by) ?? plain;
    case "platform":
      if (env.kind === "recover") return `${who} ran a recovery step (${String((env.body as { op?: unknown } | null)?.op)}).`;
      return reviewSentence(env, by) ?? plain;
    case "declared":
      if (under.builtFor) return reviewSentence(env, by) ?? `${who}: ${m.label}.`; // G5U:built-for-sentence
      return `${who}: ${m.label}.`; // G5U:declared-sentence
    case "unknown":
      return `${plain} The policy in force then did not declare it.`; // G5U:unknown-shown
    default:
      return plain;
  }
}

/** What a refused act was, in the words in force at its seq. */
function refusedWhat(env: Env, under: Under): string {
  const m = under.meaning;
  return m !== null && m.vocabulary === "declared" && !under.builtFor ? `“${m.label}”` : env.kind; // G5U:refusal-label
}

/** `act_<seq>_<first 8 hex of the entry hash>` (R-ID-1). */
export const entryId = (e: LogEntry): ActId => `act_${e.seq}_${e.hash.slice("sha256:".length, "sha256:".length + 8)}`;

export function describeEntry(e: LogEntry, under: Under = { meaning: null }): FeedEntry {
  const id = entryId(e);
  const common = { id, seq: e.seq, at: e.at };
  const x = e.entry;
  if (x.type === "system") {
    const ev = x.event;
    const lane = "lane" in ev ? ev.lane : undefined;
    const text = (() => {
      switch (ev.type) {
        case "genesis":
          return `The room ${ev.genesis.name} was created.`;
        case "lease-expired":
          return `${ev.holder}'s lease expired. There is no handover note.`;
        case "policy-activated":
          return `A new policy became active. ${ev.recomputed.reopened} obligations reopened.`;
        case "check-carried":
          return checkCarriedText(ev);
        case "land-reserved":
          return `A landing was reserved: publication ${ev.publication}.`;
        case "abort-attempt":
          return `A key that is evidence for a reserved landing was revoked as compromised, so the room stopped pushing it forward and recorded an abort attempt${ev.attempt.tokenRevoked ? "; the publication token was revoked" : ""}.`;
        case "publication-unresolved":
          // Only what the event records. What the room does next depends on
          // whether an abort attempt exists, which this event cannot show.
          return ev.readBack.main === "unexpected"
            ? `A publication is unresolved: main read back as ${ev.readBack.observed.slice(0, 7)}, which is neither the expected main nor the reserved commit.`
            : "A publication is unresolved: main read back as the expected main, so the push had not landed.";
        case "land-outcome":
          switch (ev.outcome.state) {
            case "landed":
              return `A landing completed: main is ${ev.outcome.commit.slice(0, 7)} (publication ${ev.outcome.publication}).`;
            case "aborted":
              return `Publication ${ev.outcome.publication} was aborted: it is established that it did not and cannot land.`;
            case "retryable":
              return `A landing stopped before reservation (${ev.outcome.reason}); it needs a new land.`;
            case "failed":
              return ev.outcome.reason.code === "refused"
                ? `A landing was refused by ${ev.outcome.reason.refusal.rule}: ${ev.outcome.reason.refusal.reason} Fix: ${ev.outcome.reason.refusal.fix ?? "none recorded"}`
                : ev.outcome.reason.code === "conflict"
                  ? `A landing failed: it conflicts with main on ${ev.outcome.reason.paths.join(", ")}.`
                  : "A landing failed: a required check failed on its integration.";
          }
          break;
        case "revert-lane":
          return `The room opened a revert lane (${ev.reason.replace(/-/g, " ")}).`;
        case "notified":
          return `Told ${ev.to.join(", ") || "nobody"} about an act.`;
        case "checkpoint":
          return `The log was published through entry ${ev.through}.`;
      }
    })();
    const refusal = ev.type === "land-outcome" && ev.outcome.state === "failed" && ev.outcome.reason.code === "refused" ? { ...ev.outcome.reason.refusal, act: id } : undefined;
    const op = "op" in ev ? ev.op : undefined;
    return { ...common, type: "system", kind: ev.type, by: null, text: text ?? ev.type, flags: [], ...(lane ? { lane } : {}), ...(refusal ? { refusal } : {}), ...(op ? { op } : {}) };
  }
  const env = envelopeOf(e) as Env;
  const by = x.receipt.authority.member;
  const lane = env.target && typeof env.target === "object" && "lane" in env.target ? (env.target as { lane: ActId }).lane : undefined;
  const meaning = under.meaning !== null ? { meaning: entryMeaning(env, under.meaning) } : {}; // G5U:meaning-attached
  if (x.type === "refusal") {
    const r = x.receipt.refusal;
    return { ...common, type: "refusal", kind: env.kind, by, text: `${by ?? "Someone"}'s ${refusedWhat(env, under)} was refused: ${r.rule}.`, refusal: { ...r, act: id }, flags: [], ...(lane ? { lane } : {}), ...meaning };
  }
  return {
    ...common,
    type: "act",
    kind: env.kind,
    by,
    text: actSentence(env, by, under),
    flags: x.receipt.flags,
    ...(lane ? { lane } : {}),
    ...(x.receipt.after ? { after: x.receipt.after } : {}),
    ...meaning,
  };
}

/**
 * Add what is known now about an unresolved publication's recovery, from its
 * loaded operation. Without a loaded operation nothing is added: the history
 * may be truncated, so an abort attempt cannot be ruled out.
 */
export function withRecovery(entry: FeedEntry, ops: readonly LandOp[]): FeedEntry {
  if (entry.kind !== "publication-unresolved" || !entry.op) return entry;
  const op = ops.find((o) => o.id === entry.op);
  if (!op) return { ...entry, text: `${entry.text} Its current state was not loaded, so whether the room is still pushing it is not known here.` };
  if (op.state !== "unresolved") return entry;
  return { ...entry, text: `${entry.text} Now: ${recoveryNow(op)}` };
}
