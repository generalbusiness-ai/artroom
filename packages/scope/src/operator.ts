/**
 * The operator's record of one scope, and the instruction to send a waiting
 * request again (authority note, section 12, G13 "Incidents" and G17 "A
 * request that waits"; the contract's section 7.4).
 *
 * **The record.** Storage outside every history: one table of the scope's
 * object, which no entry holds and no digest covers. The runtime that finds
 * an incident writes it here: the time, the scope, the kind, and references
 * to the facts in conflict.
 *
 * - **No guard, effect, send or clause reads it.** Nothing in the commit
 *   protocol is given it. Losing it loses a notice and no fact.
 * - **It holds no credential and no private text.** A row is a kind from a
 *   fixed list and references of fixed forms: a position and a hash of this
 *   scope's history, an operation's ID with an attempt's number, and a
 *   send's duty ID. It has no member that takes free text, and `found`
 *   refuses a row of any other form.
 * - **Bounded.** It keeps the latest `rows` rows and drops the oldest.
 *
 * **Where an incident is kept.** In the entry that found it, when the
 * finding writes one, and always here. `incidentsOf` reads a sealed entry
 * and says what incident it holds, and `follow` writes those rows as the
 * history grows, from a mark that it keeps beside the record. A finding
 * that writes no entry is told to `found` by the component that made it.
 *
 * | Kind | Found by | Entry |
 * |---|---|---|
 * | `incarnation-conflict` | `follow`: a creation's result that ran the clause `conflict` (the contract's section 7.2). | That result's entry. |
 * | `outcome-conflict` | The operations driver: an answer that contradicts a recorded outcome (`operations.ts`). | None is written. The row names the entry that is contradicted. |
 * | `sent-again` | `sendAgain`, below. It is an instruction and no incident. | None. |
 *
 * The other kinds of section 12 are named in `IncidentKind`, and nothing
 * here finds them yet: each is found by a rule of the destination or of
 * `hold@1` that is not built (I3 deltas, entry ES12).
 */

import type { Digest, DutyId, Entry, OperationId, ScopeRef, Timestamp } from "@generalbusiness/artroom-contract";
import { canonicalize, isDigest, isDutyId, isOperationId } from "@generalbusiness/artroom-bytes";
import { isObject, timeMs } from "@generalbusiness/artroom-derive";
import type { Clock, Transport } from "./ports.ts";
import type { Sql } from "./sqlite.ts";
import type { Dispatched, Store } from "./store.ts";
import { LATE, within } from "./turn.ts";

/** What an incident is (section 12, "What is one"), and the one instruction that the record also holds. */
export type IncidentKind =
  | "outcome-conflict" | "ref-mismatch" | "incarnation-conflict" | "pin-confirm-no-pin" | "unpin-never-admitted" | "token-unowned" | "branch-moved" | "bad-input"
  | "sent-again";
const KINDS: ReadonlySet<string> = new Set<IncidentKind>([
  "outcome-conflict", "ref-mismatch", "incarnation-conflict", "pin-confirm-no-pin", "unpin-never-admitted", "token-unowned", "branch-moved", "bad-input", "sent-again",
]);

/** A reference to a fact in conflict. Each is a position or an ID of this scope, and none is text that a member or an outside system wrote. */
export type IncidentRef = { entry: number; hash?: Digest } | { operation: OperationId; attempt: number } | { duty: DutyId };

/** One row of the operator's record. `n` numbers the rows of this scope's record, from 1. */
export interface Incident { n: number; time: Timestamp; scope: ScopeRef | null; kind: IncidentKind; refs: readonly IncidentRef[] }

const position = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
function isRef(v: unknown): v is IncidentRef {
  if (!isObject(v)) return false;
  const keys = Object.keys(v).sort().join(",");
  if (keys === "entry") return position(v["entry"]);
  if (keys === "entry,hash") return position(v["entry"]) && isDigest(v["hash"]);
  if (keys === "attempt,operation") return position(v["attempt"]) && isOperationId(v["operation"]);
  return keys === "duty" && isDutyId(v["duty"]);
}

/** The most rows one scope's record keeps. Configuration: no text states a number (I3 deltas, entry ES12). */
export const RECORD_ROWS = 1024;
/** The most entries one pass of `follow` reads. */
const FOLLOW_ENTRIES = 256;

/**
 * The incidents that one sealed entry holds: a finding that wrote an entry
 * is in that entry. A creation's result that ran `conflict` is a second
 * incarnation for one seed: the row names this entry, and the entry of the
 * request that it answers.
 */
export function incidentsOf(entry: Entry, hash: Digest): { kind: IncidentKind; refs: IncidentRef[] }[] {
  const input = entry.input;
  if (input.type === "delivery" && input.message.class === "result" && "clause" in input && input.clause === "conflict") {
    return [{ kind: "incarnation-conflict", refs: [{ entry: entry.seq, hash }, { entry: input.message.of.from.seq }] }];
  }
  return [];
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS operator_record (n INTEGER PRIMARY KEY AUTOINCREMENT, time TEXT NOT NULL, scope TEXT, kind TEXT NOT NULL, refs TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS operator_mark (k TEXT PRIMARY KEY, v INTEGER NOT NULL) WITHOUT ROWID;
`;

export class OperatorRecord {
  readonly #sql: Pick<Sql, "exec">;
  readonly #clock: Clock;
  readonly #scope: () => ScopeRef | null;
  readonly #rows: number;

  /** `sql`: the storage of the scope's object. The record's two tables are its own, and no table of the store is read or written here. */
  constructor(sql: Pick<Sql, "exec">, clock: Clock, scope: () => ScopeRef | null, rows: number = RECORD_ROWS) {
    this.#sql = sql;
    this.#clock = clock;
    this.#scope = scope;
    this.#rows = rows;
    sql.exec(SCHEMA).toArray();
  }

  /** Write one row. A kind or a reference of another form is not written: false. */
  found(kind: IncidentKind, refs: readonly IncidentRef[]): boolean {
    if (!KINDS.has(kind) || refs.length > 8 || !refs.every(isRef)) return false;
    const scope = this.#scope();
    this.#sql.exec("INSERT INTO operator_record (time, scope, kind, refs) VALUES (?, ?, ?, ?)", this.#clock.read(), scope ? canonicalize(scope) : null, kind, canonicalize(refs)).toArray();
    this.#sql.exec("DELETE FROM operator_record WHERE n <= (SELECT MAX(n) FROM operator_record) - ?", this.#rows).toArray();
    return true;
  }

  /**
   * Write the incidents of the entries that were sealed since the last
   * pass, at most a bounded number in one pass. The mark is the first entry
   * that has not been read. A pass that stops before its mark is written
   * reads those entries again, and may then write a row twice: the record
   * is a notice, and a row names its entry.
   */
  follow(store: Pick<Store, "storedFrom">): void {
    const from = (this.#sql.exec("SELECT v FROM operator_mark WHERE k = 'next'").toArray()[0]?.["v"] as number | undefined) ?? 0;
    const rows = store.storedFrom(from, FOLLOW_ENTRIES);
    if (rows.length === 0) return;
    for (const row of rows) for (const incident of incidentsOf(JSON.parse(row.bytes) as Entry, row.hash)) this.found(incident.kind, incident.refs);
    this.#sql.exec("INSERT INTO operator_mark (k, v) VALUES ('next', ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v", from + rows.length).toArray();
  }

  /** At most `limit` rows after row `after`, in the order in which they were written. */
  page(after: number | null, limit: number): { incidents: Incident[]; more: boolean } {
    const rows = this.#sql.exec("SELECT n, time, scope, kind, refs FROM operator_record WHERE n > ? ORDER BY n LIMIT ?", after ?? 0, limit + 1).toArray();
    const incidents = rows.slice(0, limit).map((row): Incident => ({
      n: row["n"] as number, time: row["time"] as Timestamp, scope: row["scope"] === null ? null : JSON.parse(row["scope"] as string) as ScopeRef,
      kind: row["kind"] as IncidentKind, refs: JSON.parse(row["refs"] as string) as IncidentRef[],
    }));
    return { incidents, more: rows.length > limit };
  }
}

// ---------------------------------------------------------------- a request that waits

/** Which of the two lists of section 12, G17, a waiting request is in, or null: it is in neither. */
export function waitingIn(duty: { class: string; held: boolean; acknowledged: unknown; result: unknown; diagnosis: { finding: string } | null }): "diagnosed" | "unanswered" | null {
  if (duty.class !== "request" || duty.held || duty.result !== null) return null;
  // A request with a `delivery-unavailable` diagnosis.
  if (duty.diagnosis) return duty.diagnosis.finding === "delivery-unavailable" ? "diagnosed" : null;
  // A request that transport acknowledged and that has no result.
  return duty.acknowledged !== null ? "unanswered" : null;
}

/**
 * How an instruction to send again ended. `sent`: the one dispatch was
 * made, and `answer` is how transport answered it. Not sent: the duty ID
 * names no send of this scope; the send is in neither list; or this scope
 * has no transport.
 */
export type Resent = { sent: true; answer: Dispatched["answer"] | "source-unverified" } | { sent: false; reason: "not-found" | "not-waiting" | "no-transport" };

/**
 * The operator's instruction to send one waiting request again (G17,
 * "Sending again"). It names the duty by its entry and ordinal. The runtime
 * dispatches the same envelope again, once: the same source entry, ordinal
 * and message, so the request keeps its identity and a late result settles
 * it. It is bookkeeping: it writes no entry, reserves nothing and offers no
 * second diagnosis (the contract's section 7.4). The dispatch is one more
 * attempt in the log of that send, and one row of the operator's record,
 * written before the envelope leaves.
 *
 * Nothing is inferred from the answer and nothing is released on it. No
 * timer and no policy calls this: an automatic policy is not designed.
 */
export async function sendAgain(
  store: Pick<Store, "duty" | "stored" | "scope" | "attempted" | "acknowledge">, transport: Transport | null, clock: Clock, record: OperatorRecord, duty: unknown, seconds: number,
): Promise<Resent> {
  const at = isDutyId(duty) ? (duty.split(".").map(Number) as [number, number]) : null;
  const row = at ? store.duty(at[0], at[1]) : null;
  const kept = at ? store.stored(at[0]) : null;
  const scope = store.scope();
  const send = kept ? (JSON.parse(kept.bytes) as Entry).sends.find((s) => s.n === at![1]) : undefined;
  if (!at || !row || !kept || !scope || !send) return { sent: false, reason: "not-found" };
  if (waitingIn(row) === null) return { sent: false, reason: "not-waiting" };
  if (!transport) return { sent: false, reason: "no-transport" };
  const [seq, n] = at;
  const time = clock.read();
  const now = timeMs(time)!;
  const logged = (answer: Dispatched["answer"]): Dispatched[] => [...row.attempts, { at: time, answer }];
  record.found("sent-again", [{ duty: row.duty }]);
  // As the dispatcher does: the attempt is recorded before it is sent, as unanswered. The send is in no list of sends that are due, so no retry follows.
  store.attempted(seq, n, logged("none"), now);
  const answer = await within(() => transport.send({ to: send.to, from: { at: scope.at, seq, hash: kept.hash }, n, message: send.message }), seconds);
  if (answer === LATE || answer === null) return { sent: true, answer: "none" };
  if (answer.answer === "recorded") {
    store.acknowledge(seq, n, logged("acknowledged"), answer.fact);
    return { sent: true, answer: "acknowledged" };
  }
  const said = answer.answer === "routing" ? answer.reason : "retry";
  store.attempted(seq, n, logged(said), now);
  return { sent: true, answer: answer.answer === "source-unverified" ? "source-unverified" : said };
}
