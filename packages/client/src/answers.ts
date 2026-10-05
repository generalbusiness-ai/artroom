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

import type { DeliveryRefusal, Dispatched, Duty, Message, MismatchReason, ReadRefusal, RefusalReason, RetainedInput, ScopeApi, Status, UnavailableReason } from "@generalbusiness/artroom-contract";
import { isDigest, isDutyId, isIncarnation, isPlatformDefinition, isScopeId, isScopeKind } from "@generalbusiness/artroom-bytes";

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
const STATUS: Record<Status, true> = { provisional: true, active: true, refused: true };
const CLASS: Record<Message["class"], true> = { request: true, result: true, control: true, advisory: true };
const DISPATCHED: Record<Dispatched["answer"], true> = { none: true, "wrong-incarnation": true, "not-found": true, retry: true, acknowledged: true };
const CLAUSE: Record<NonNullable<Duty["result"]>["clause"], true> = { applied: true, refused: true, superseded: true, conflict: true };
const FINDING: Record<NonNullable<Duty["diagnosis"]>["finding"], true> = { undelivered: true, "delivery-unavailable": true };
const RETAINED: Record<RetainedInput["kind"], true> = { definition: true, entry: true, rule: true };

// Each shape below is the contract's, to the depth of its own members: every member the contract requires is there and of its
// kind. What an effect, an input or a slot holds is the scope's to say, and is read no deeper here.
const isScope = (v: unknown): boolean => isObject(v) && isScopeId(v["scope"]) && isIncarnation(v["inc"]) && isScopeKind(v["kind"]);
const isHead = (v: unknown): boolean => isObject(v) && isSeq(v["seq"]) && isDigest(v["hash"]);
const isFact = (v: unknown): boolean => isHead(v) && isScope((v as Rec)["at"]);
const isDefinition = (v: unknown): boolean => isDigest(v) || isPlatformDefinition(v);
const isSeed = (v: unknown): boolean =>
  isObject(v) && v["v"] === 1 && isScopeKind(v["kind"]) && isDefinition(v["definition"]) && (v["creator"] === null || isScope(v["creator"])) && isDigest(v["cause"]) && isSeq(v["ordinal"]);
const isEffect = (v: unknown): boolean => isObject(v) && typeof v["effect"] === "string";
const isReceipt = (v: unknown): boolean =>
  isObject(v) && isFact(v["fact"]) && isDefinition(v["definition"]) && (v["intent"] === null || isDigest(v["intent"])) && listOf(v["effects"], isEffect) && listOf(v["sends"], isDutyId) && v["epoch"] === 0;
const isEntry = (v: unknown): boolean =>
  isObject(v) && v["v"] === 1 && isScope(v["at"]) && isSeq(v["seq"]) && (v["prev"] === null || isDigest(v["prev"])) && typeof v["time"] === "string" && typeof v["clamped"] === "boolean" && v["epoch"] === 0
  && isObject(v["input"]) && typeof v["input"]["type"] === "string" && listOf(v["uses"], isObject) && listOf(v["prepared"], isObject) && listOf(v["effects"], isEffect) && listOf(v["sends"], isObject);
const isSealed = (v: unknown): boolean => isObject(v) && isEntry(v["entry"]) && isDigest(v["hash"]);
const isItem = (v: unknown): boolean =>
  isObject(v) && isSeq(v["id"]) && typeof v["type"] === "string" && typeof v["state"] === "string" && isSeq(v["revision"]) && (v["opened"] === null || isDigest(v["opened"]))
  && isObject(v["parties"]) && isObject(v["refs"]) && isObject(v["values"]) && listOf(v["attributed"], isObject) && (v["epoch"] === undefined || isSeq(v["epoch"]));
const isSummary = (v: unknown): boolean =>
  isObject(v) && isScope(v["scope"]) && among(STATUS)(v["status"]) && isDefinition(v["definition"]) && typeof v["time"] === "string" && listOf(v["items"], isItem)
  && listOf(v["counts"], (c) => Array.isArray(c) && c.length === 3 && typeof c[0] === "string" && typeof c[1] === "string" && isSeq(c[2]));
const isDuty = (v: unknown): boolean =>
  isObject(v) && isDutyId(v["duty"]) && (isScope(v["to"]) || isSeed(v["to"])) && among(CLASS)(v["class"]) && typeof v["held"] === "boolean"
  && listOf(v["attempts"], (a) => isObject(a) && typeof a["at"] === "string" && among(DISPATCHED)(a["answer"]))
  && (v["acknowledged"] === null || isFact(v["acknowledged"]))
  && (v["result"] === null || (isObject(v["result"]) && isSeq(v["result"]["seq"]) && among(CLAUSE)(v["result"]["clause"])))
  && (v["diagnosis"] === null || (isObject(v["diagnosis"]) && isSeq(v["diagnosis"]["seq"]) && among(FINDING)(v["diagnosis"]["finding"])));
const isLogPage = (v: unknown): boolean =>
  isObject(v) && isScope(v["scope"]) && isDefinition(v["definition"]) && listOf(v["entries"], (e) => isObject(e) && isSeq(e["seq"]) && isDigest(e["hash"]) && typeof e["bytes"] === "string");
const isRetained = (v: unknown): boolean =>
  isObject(v) && among(RETAINED)(v["kind"]) && isDigest(v["digest"]) && typeof v["bytes"] === "string" && (v["under"] === undefined || typeof v["under"] === "string");

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

/** A read (section 9.1): a value of the route's shape at a stated head, or a refusal the contract names, with the reference it may carry. */
const isRead = (value: (v: unknown) => boolean) => (v: unknown): boolean => {
  if (!isObject(v)) return false;
  if (v["ok"] === false) return among(UNREAD)(v["reason"]) && (v["detail"] === undefined || isScope(v["detail"]) || isFact(v["detail"]));
  return v["ok"] === true && isHead(v["at"]) && typeof v["complete"] === "boolean" && (v["next"] === undefined || typeof v["next"] === "string") && value(v["value"]);
};

/** For each operation, whether a reply is an answer of that operation. */
export const ANSWERS: { [K in keyof ScopeApi]: (reply: unknown) => boolean } = {
  found: (v) => isAnswer(v, false),
  submit: (v) => isAnswer(v, true),
  settle: isRead(isReceipt),
  summary: isRead(isSummary),
  items: isRead((v) => listOf(v, isItem)),
  history: isRead((v) => listOf(v, isSealed)),
  entry: isRead(isSealed),
  outbox: isRead((v) => listOf(v, isDuty)),
  duty: isRead(isDuty),
  log: isRead(isLogPage),
  retained: isRead(isRetained),
};
