/**
 * What the member interface shows and what it may ask for. Plain functions over
 * a summary and a record that were read together; nothing here signs or sends.
 */
import type { Entry, FieldValue, Item, Summary } from "@generalbusiness/dap-contract";
import { thingsOf, type RecordPointer, type Thing } from "../shelf.ts";

export type LendingAct = "donate" | "borrow" | "return" | "cancel";
/** A thing with the revision an act on it must expect. A gone thing has none: no act can change it. */
export interface ShownThing extends Thing { revision: number | null }
export interface LendingView {
  /** Every thing, live and gone, in the order it was donated. */
  things: ShownThing[];
  /** The entry the view reflects. Each page written from this view names it. */
  record: RecordPointer;
  /** True when the record read is older than the summary: the list of gone things may be behind. */
  behind: boolean;
}

export const NAME_BYTES = 80, DESCRIPTION_BYTES = 1000, REASON_BYTES = 280;
const bytes = (text: string): number => new TextEncoder().encode(text).length;
const handle = (party: unknown): string | null =>
  typeof party === "object" && party !== null && typeof (party as { member?: unknown }).member === "string" ? (party as { member: string }).member : null;
const words = (value: FieldValue | null | undefined): string => typeof value === "string" ? value : "";

/**
 * The view of one coherent read: a summary, the head `at` that the read answered at,
 * and the record. Live things come from the summary, which has their revisions. Gone things have left the summary and come from the record.
 */
export function lendingView(summary: Summary, at: { seq: number; hash: string }, entries: readonly Entry[]): LendingView {
  const recorded = thingsOf(entries);
  const live = new Map<number, Item>(summary.items.filter((item) => item.type === "thing").map((item) => [item.id, item]));
  const things: ShownThing[] = [];
  for (const [id, item] of live) {
    const state = item.state === "lent" ? "lent" : "available";
    const known = recorded.find((thing) => thing.id === id);
    things.push({ id, state, name: words(item.values["name"]), description: words(item.values["description"]),
      donor: handle(item.parties["donor"]) ?? "", borrower: handle(item.parties["borrower"]), reason: null,
      seq: known?.seq ?? item.revision, revision: item.revision });
  }
  for (const thing of recorded) if (!live.has(thing.id) && thing.state === "gone") things.push({ ...thing, revision: null });
  things.sort((a, b) => a.id - b.id);
  return { things, behind: entries.length <= at.seq,
    record: { scope: summary.scope.scope, incarnation: summary.scope.inc, seq: at.seq, hash: at.hash } };
}

/** The acts a thing's state allows. Whether the signer may cancel is membership's to say; the scope answers. */
export function actsFor(thing: ShownThing): LendingAct[] {
  return thing.state === "available" ? ["borrow", "cancel"] : thing.state === "lent" ? ["return", "cancel"] : [];
}

export interface Proposal { kind: LendingAct; on: number | null; expected: Record<string, number>; fields: Record<string, FieldValue> }
export type Proposed = { ok: true; proposal: Proposal } | { ok: false; reason: string };
const no = (reason: string): Proposed => ({ ok: false, reason });

/** The exact act to sign, or why there is nothing to sign. A refusal here sends nothing. */
export function propose(view: LendingView, kind: LendingAct, input: { thing?: number; name?: string; description?: string; reason?: string } = {}): Proposed {
  if (kind === "donate") {
    const name = (input.name ?? "").trim(), description = (input.description ?? "").trim();
    if (!name) return no("Give the thing a name.");
    if (!description) return no("Describe the thing.");
    if (bytes(name) > NAME_BYTES) return no(`The name is too long: at most ${NAME_BYTES} bytes.`);
    if (bytes(description) > DESCRIPTION_BYTES) return no(`The description is too long: at most ${DESCRIPTION_BYTES} bytes.`);
    return { ok: true, proposal: { kind, on: null, expected: {}, fields: { name, description } } };
  }
  const thing = view.things.find((candidate) => candidate.id === input.thing);
  if (!thing) return no("That thing is not in the library.");
  if (thing.revision === null) return no("That thing is gone.");
  if (!actsFor(thing).includes(kind)) return no(kind === "borrow" ? "That thing is already lent." : "That thing is not lent.");
  const fields: Record<string, FieldValue> = {};
  if (kind === "cancel") {
    const reason = (input.reason ?? "").trim();
    if (!reason) return no("Say why the thing is gone.");
    if (bytes(reason) > REASON_BYTES) return no(`The reason is too long: at most ${REASON_BYTES} bytes.`);
    fields["reason"] = reason;
  }
  return { ok: true, proposal: { kind, on: thing.id, expected: { on: thing.revision }, fields } };
}

/** A refusal in plain words, with the reason the scope gave. */
export function refusalWords(kind: LendingAct, reason: string): string {
  const said = reason === "unauthorized" ? (kind === "cancel" ? "Only staff can cancel a thing." : "Your seat in this room does not allow that.")
    : reason === "guard-failed" ? (kind === "borrow" ? "That thing is already lent." : kind === "return" ? "That thing is not lent." : "That thing cannot be cancelled now.")
      : reason === "revision-moved" ? "Someone changed that thing first. Look again, then decide."
        : reason === "type-full" ? "The library is full: it holds 64 things. Staff can cancel one to make room."
          : reason === "final" ? "That thing is gone."
            : reason === "bad-field" ? "The library did not accept that text."
              : "The library refused.";
  return `${said} (${reason})`;
}
