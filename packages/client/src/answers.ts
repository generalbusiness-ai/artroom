/**
 * What a transport may hand back as a scope's answer. A reply from a service
 * is untrusted data until it is seen to be one of the contract's answers:
 * its discriminant is one the contract names, its reason is one the contract
 * names for that answer, and it carries what that answer must carry. A
 * reply that is not is no answer, and the transport throws `TransportError`.
 *
 * The checks are of shape only. Whether a receipt is of this history is
 * `followReceipt`'s question, and it computes the hash itself.
 */

import type { DeliveryRefusal, MismatchReason, ReadRefusal, RefusalReason, ScopeApi, UnavailableReason } from "@generalbusiness/artroom-contract";
import { isDigest, isIncarnation, isScopeId } from "@generalbusiness/artroom-bytes";

type Rec = Record<string, unknown>;
const isObject = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const isSeq = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const listOf = (v: unknown, each: (e: unknown) => boolean): boolean => Array.isArray(v) && v.every(each);
const among = (names: Record<string, true>) => (v: unknown): boolean => typeof v === "string" && Object.hasOwn(names, v);

// Each table has every member of its union, and the compiler says so when the contract gains or loses one.
const REFUSED: Record<RefusalReason | DeliveryRefusal | "unsupported-definition", true> = {
  "revision-moved": true, alias: true, "duplicate-relation": true, "required-unset": true, "scope-full": true, "bad-intent": true, misaddressed: true, expired: true, "scope-refused": true,
  "unknown-act": true, "bad-field": true, "no-item": true, final: true, unauthorized: true, "guard-failed": true, "slot-full": true, "type-full": true, "send-unresolved": true,
  "unknown-message": true, "bad-input": true, "source-unverified": true, "unsupported-definition": true,
};
const UNAVAILABLE: Record<UnavailableReason, true> = { "dependency-unavailable": true, busy: true, "clock-behind": true, "scope-provisional": true, "guard-incomplete": true, unavailable: true };
const MISMATCH: Record<MismatchReason, true> = { "idempotency-mismatch": true };
const UNREAD: Record<ReadRefusal, true> = {
  "not-found": true, "wrong-incarnation": true, forbidden: true, "scope-provisional": true, "unsupported-definition": true, "history-unavailable": true, "too-large": true, unavailable: true,
};

const isScope = (v: unknown): boolean => isObject(v) && isScopeId(v["scope"]) && isIncarnation(v["inc"]) && typeof v["kind"] === "string";
const isHead = (v: unknown): boolean => isObject(v) && isSeq(v["seq"]) && isDigest(v["hash"]);
const isFact = (v: unknown): boolean => isHead(v) && isScope((v as Rec)["at"]);
const isReceipt = (v: unknown): boolean =>
  isObject(v) && isFact(v["fact"]) && typeof v["definition"] === "string" && (v["intent"] === null || isDigest(v["intent"])) && listOf(v["effects"], isObject) && listOf(v["sends"], (d) => typeof d === "string");
const isSealed = (v: unknown): boolean => isObject(v) && isObject(v["entry"]) && isDigest(v["hash"]);
const isItem = (v: unknown): boolean => isObject(v) && isSeq(v["id"]) && typeof v["type"] === "string" && typeof v["state"] === "string" && isSeq(v["revision"]);
const isDuty = (v: unknown): boolean => isObject(v) && typeof v["duty"] === "string" && isObject(v["to"]) && typeof v["class"] === "string" && typeof v["held"] === "boolean" && listOf(v["attempts"], isObject);

/** The answer to a founding or an act (section 4.2). A founding has no `mismatch`, and only an act's refusal names the head it was judged at. */
function isAnswer(v: unknown, act: boolean): boolean {
  if (!isObject(v)) return false;
  switch (v["answer"]) {
    case "accepted": return isReceipt(v["receipt"]);
    case "refused": return among(REFUSED)(v["reason"]) && (!act || isHead(v["judgedAt"]));
    case "unavailable": return among(UNAVAILABLE)(v["reason"]);
    case "mismatch": return act && among(MISMATCH)(v["reason"]);
    default: return false;
  }
}

/** A read (section 9.1): a value of the route's shape at a stated head, or a refusal the contract names. */
const isRead = (value: (v: unknown) => boolean) => (v: unknown): boolean => {
  if (!isObject(v)) return false;
  if (v["ok"] === false) return among(UNREAD)(v["reason"]);
  return v["ok"] === true && isHead(v["at"]) && typeof v["complete"] === "boolean" && (v["next"] === undefined || typeof v["next"] === "string") && value(v["value"]);
};

/** For each operation, whether a reply is an answer of that operation. */
export const ANSWERS: { [K in keyof ScopeApi]: (reply: unknown) => boolean } = {
  found: (v) => isAnswer(v, false),
  submit: (v) => isAnswer(v, true),
  settle: isRead(isReceipt),
  summary: isRead((v) => isObject(v) && isScope(v["scope"]) && typeof v["status"] === "string" && typeof v["definition"] === "string" && listOf(v["items"], isItem) && listOf(v["counts"], Array.isArray)),
  items: isRead((v) => listOf(v, isItem)),
  history: isRead((v) => listOf(v, isSealed)),
  entry: isRead(isSealed),
  outbox: isRead((v) => listOf(v, isDuty)),
  duty: isRead(isDuty),
  log: isRead((v) => isObject(v) && isScope(v["scope"]) && typeof v["definition"] === "string" && listOf(v["entries"], (e) => isObject(e) && isSeq(e["seq"]) && isDigest(e["hash"]) && typeof e["bytes"] === "string")),
  retained: isRead((v) => isObject(v) && typeof v["kind"] === "string" && isDigest(v["digest"]) && typeof v["bytes"] === "string"),
};
