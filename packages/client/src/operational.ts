/** Operational read extensions. These are outside the native ScopeApi. */
import type { Cursor, Digest, OutboxItem, OutboxId, OperationId, Read, ScopeId, ScopeRef, Timestamp } from "@generalbusiness/dap-contract";
import { isDigest, isOutboxItem, isOutboxId, isListOf, isOperationId, isRead, isRecord, isScopeRef, timeMs } from "@generalbusiness/artroom-bytes";

export type IncidentKind = "outcome-conflict" | "ref-mismatch" | "incarnation-conflict" | "pin-confirm-no-pin" | "unpin-never-admitted" | "token-unowned" | "branch-moved" | "bad-input" | "sent-again";
export type IncidentReference = { entry: number; hash?: Digest } | { operation: OperationId; attempt: number } | { outboxId: OutboxId };
export interface OperationalIncident { n: number; time: Timestamp; scope: ScopeRef | null; kind: IncidentKind; refs: readonly IncidentReference[] }
export interface RequestCorrelation { n: number; request: string; trace: string | null; time: Timestamp; seq: number | null; outboxId: OutboxId | null }
export interface RequestCorrelations { rows: readonly RequestCorrelation[]; window: { oldest: Timestamp; newest: Timestamp } | null }
export interface OperationalApi {
  incidents(scope: ScopeId, reader: unknown, cursor?: Cursor): Promise<Read<readonly OperationalIncident[]>>;
  waiting(scope: ScopeId, reader: unknown, list: "diagnosed" | "unanswered", cursor?: Cursor): Promise<Read<readonly OutboxItem[]>>;
  requests(scope: ScopeId, reader: unknown, request: string, cursor?: Cursor): Promise<Read<RequestCorrelations>>;
}
const natural = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0);
const timestamp = (value: unknown): value is Timestamp => typeof value === "string" && timeMs(value) !== null;
const kinds: readonly string[] = ["outcome-conflict", "ref-mismatch", "incarnation-conflict", "pin-confirm-no-pin", "unpin-never-admitted", "token-unowned", "branch-moved", "bad-input", "sent-again"];
function reference(value: unknown): value is IncidentReference {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return keys.every(key => ["entry", "hash"].includes(key)) && natural(value["entry"]) && (value["hash"] === undefined || isDigest(value["hash"]))
    || keys.length === 2 && isOperationId(value["operation"]) && natural(value["attempt"]) && value["attempt"] > 0
    || keys.length === 1 && isOutboxId(value["outboxId"]);
}
function incident(value: unknown): value is OperationalIncident {
  return isRecord(value) && Object.keys(value).length === 5 && natural(value["n"]) && value["n"] > 0 && timestamp(value["time"]) && (value["scope"] === null || isScopeRef(value["scope"])) && typeof value["kind"] === "string" && kinds.includes(value["kind"]) && Array.isArray(value["refs"]) && value["refs"].length <= 8 && value["refs"].every(reference);
}
function correlations(value: unknown): value is RequestCorrelations {
  if (!isRecord(value) || Object.keys(value).length !== 2 || !Array.isArray(value["rows"]) || value["rows"].length > 100) return false;
  const window = value["window"];
  if (!(window === null || isRecord(window) && Object.keys(window).length === 2 && timestamp(window["oldest"]) && timestamp(window["newest"]) && timeMs(window["oldest"])! <= timeMs(window["newest"])!)) return false;
  if (window === null && value["rows"].length > 0) return false;
  return value["rows"].every(row => isRecord(row) && Object.keys(row).length === 6 && natural(row["n"]) && row["n"] > 0 && typeof row["request"] === "string" && /^[0-9a-f]{16}$/.test(row["request"]) && (row["trace"] === null || typeof row["trace"] === "string" && /^[0-9a-f]{32}$/.test(row["trace"]) && !/^0+$/.test(row["trace"])) && timestamp(row["time"]) && (row["seq"] === null || natural(row["seq"])) && (row["outboxId"] === null || isOutboxId(row["outboxId"])) && (row["seq"] !== null || row["outboxId"] !== null));
}
export const OPERATIONAL_ANSWERS: { [K in keyof OperationalApi]: (reply: unknown) => reply is Awaited<ReturnType<OperationalApi[K]>> } = {
  incidents: isRead(isListOf(incident)), waiting: isRead(isListOf(isOutboxItem)), requests: isRead(correlations),
};
