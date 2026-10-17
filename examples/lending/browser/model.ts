/**
 * What the member interface shows and what it may ask for. Plain functions over
 * a summary and a record that were read together; nothing here signs or sends.
 */
import type { Entry, FieldValue, Item, KeyId, MemberRef, Summary } from "@generalbusiness/dap-contract";
import { canonicalize, isMemberRef } from "@generalbusiness/artroom-bytes";
import { ROLE_LISTS, isActions, type Role } from "@generalbusiness/dap-platform/membership-actions";
import { shelfPage, shelfPath, thingsOf, type RecordPointer, type Thing } from "../shelf.ts";

export type LendingAct = "donate" | "borrow" | "return" | "cancel" | "publish";
/** A thing with its retained revision; publish reads a gone thing without changing it. */
export interface ShownThing extends Thing {}
export interface LendingView {
  /** Every thing, live and gone, in the order it was donated. */
  things: ShownThing[];
  library: { id: number; revision: number } | null;
  /** The entry the view reflects. Each page written from this view names it. */
  record: RecordPointer;
  /** True when the record read is older than the summary: the list of gone things may be behind. */
  behind: boolean;
}

/** Labels from the retained donation journal, including things no longer in the live summary. */
export function journalRows(entries: readonly Entry[]): { seq: number; kind: string; signer: string; what: string }[] {
  const names = new Map(thingsOf(entries).map((thing) => [thing.id, thing.name]));
  return entries.flatMap((entry, seq) => {
    if (entry.input.type !== "act") return [];
    const { intent } = entry.input.signed;
    const id = intent.kind === "publish" ? intent.fields["thing"] : intent.on;
    const name = typeof id === "number" ? names.get(id) : undefined;
    const label = name === undefined ? `Unknown thing ${id ?? "(no ID)"}` : `${name || "Unnamed"} (thing ${id})`;
    const what = intent.kind === "donate" ? words(intent.fields["name"])
      : intent.kind === "cancel" ? `${label}: ${words(intent.fields["reason"])}` : label;
    return [{ seq, kind: intent.kind, signer: entry.input.authority[0]?.subject.member ?? "", what }];
  });
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
    things.push({ id, page: words(item.values["page"]), state, name: words(item.values["name"]), description: words(item.values["description"]),
      donor: handle(item.parties["donor"]) ?? "", borrower: handle(item.parties["borrower"]), reason: null,
      seq: known?.seq ?? item.revision, revision: item.revision });
  }
  for (const thing of recorded) if (!live.has(thing.id) && thing.state === "gone") things.push({ ...thing });
  things.sort((a, b) => a.id - b.id);
  const library = summary.items.find((item) => item.type === "library");
  return { things, library: library ? { id: library.id, revision: library.revision } : null, behind: entries.length <= at.seq,
    record: { scope: summary.scope.scope, incarnation: summary.scope.inc, seq: at.seq, hash: at.hash } };
}

/** The acts a thing's state allows. Whether the signer may cancel is membership's to say; the scope answers. */
export function actsFor(thing: ShownThing): LendingAct[] {
  return thing.state === "available" ? ["borrow", "cancel", "publish"] : thing.state === "lent" ? ["return", "cancel", "publish"] : ["publish"];
}

/** This key's active member in an authenticated membership summary.
 * The invitation's proposed handle supplies no identity evidence. */
export function memberForKey(summary: Summary, key: KeyId): MemberRef | null {
  if (summary.scope.kind !== "membership") return null;
  const keys = summary.items.filter(item => item.type === "key" && item.state === "active" && item.values["id"] === key);
  if (keys.length !== 1) return null;
  const seats = summary.items.filter(item => item.type === "member" && item.state === "active" && item.id === keys[0]!.refs["member"]);
  if (seats.length !== 1) return null;
  const seat = seats[0]!, who = seat.parties["member"];
  if (!isMemberRef(who) || canonicalize(who.membership) !== canonicalize(summary.scope) || seat.values["handle"] !== who.member) return null;
  return { membership: { ...who.membership }, member: who.member };
}

/** Presentation from the complete authenticated roster, following Page's key-to-member projection. This issues no grant. */
export function membershipActions(summary: Summary, who: MemberRef, key: KeyId): readonly string[] | null {
  if (canonicalize(summary.scope) !== canonicalize(who.membership)) return null;
  const roster = summary.items.find(item => item.type === "roster" && item.state === "open");
  const ownKey = summary.items.find(item => item.type === "key" && item.state === "active" && item.values["id"] === key);
  const seat = summary.items.find(item => item.type === "member" && item.state === "active" && item.id === ownKey?.refs["member"]);
  if (!roster || !seat || !isMemberRef(seat.parties["member"]) || canonicalize(seat.parties["member"]) !== canonicalize(who)
    || seat.values["handle"] !== who.member) return null;
  const role = seat.values["role"];
  if (typeof role !== "string" || !Object.hasOwn(ROLE_LISTS, role)) return null;
  const actions = roster.values[ROLE_LISTS[role as Role]];
  if (!isActions(actions)) return null;
  // An agent's controller must remain an active member with an active key, as in Page.
  const controller = seat.parties["controller"];
  if (seat.values["kind"] === "agent") {
    if (!isMemberRef(controller) || canonicalize(controller.membership) !== canonicalize(who.membership)) return null;
    const owner = summary.items.find(item => item.type === "member" && item.state === "active" && item.values["handle"] === controller.member);
    if (!owner || !summary.items.some(item => item.type === "key" && item.state === "active" && item.refs["member"] === owner.id)) return [];
  } else if (!["person", "checker"].includes(String(seat.values["kind"])) || controller != null) return null;
  return [...actions];
}

/** Unknown or stale standing offers no cancellation. Native authority still decides every submitted act. */
export function offeredActs(thing: ShownThing, actions: readonly string[] | null): LendingAct[] {
  return actsFor(thing).filter(kind => kind !== "cancel" || actions?.includes("lending.staff") === true);
}

export interface Proposal { kind: LendingAct; on: number | null; expected: Record<string, number>; fields: Record<string, FieldValue> }
export type Proposed = { ok: true; proposal: Proposal } | { ok: false; reason: string };
const no = (reason: string): Proposed => ({ ok: false, reason });

/** The exact act to sign, or why there is nothing to sign. A refusal here sends nothing. */
export function propose(view: LendingView, kind: LendingAct, input: { thing?: number; name?: string; description?: string; reason?: string } = {}, author = "", random: () => Uint8Array = () => crypto.getRandomValues(new Uint8Array(8))): Proposed {
  if (!view.library) return no("The library could not be read.");
  const expectedLibrary = { "library": view.library.revision };
  if (kind === "donate") {
    const name = (input.name ?? "").trim(), description = (input.description ?? "").trim();
    if (!name) return no("Give the thing a name.");
    if (!description) return no("Describe the thing.");
    if (bytes(name) > NAME_BYTES) return no(`The name is too long: at most ${NAME_BYTES} bytes.`);
    if (bytes(description) > DESCRIPTION_BYTES) return no(`The description is too long: at most ${DESCRIPTION_BYTES} bytes.`);
    const page = shelfPath(random());
    const content = shelfPage({ id: 0, page, revision: 1, state: "available", name, description, donor: author, borrower: null, reason: null, seq: 0 }, view.record);
    return { ok: true, proposal: { kind, on: null, expected: expectedLibrary, fields: { name, description, page, content } } };
  }
  const thing = view.things.find((candidate) => candidate.id === input.thing);
  if (!thing) return no("That thing is not in the library.");
  if (kind === "publish") return { ok: true, proposal: { kind, on: view.library.id, expected: { on: view.library.revision, thing: thing.revision }, fields: { thing: thing.id, content: shelfPage(thing, view.record) } } };
  if (thing.state === "gone") return no("That thing is gone.");
  if (!actsFor(thing).includes(kind)) return no(kind === "borrow" ? "That thing is already lent." : "That thing is not lent.");
  const fields: Record<string, FieldValue> = {};
  if (kind === "cancel") {
    const reason = (input.reason ?? "").trim();
    if (!reason) return no("Say why the thing is gone.");
    if (bytes(reason) > REASON_BYTES) return no(`The reason is too long: at most ${REASON_BYTES} bytes.`);
    fields["reason"] = reason;
  }
  const after = { ...thing, state: kind === "borrow" ? "lent" as const : kind === "return" ? "available" as const : "gone" as const, borrower: kind === "borrow" ? author : null, reason: kind === "cancel" ? String(fields["reason"]) : thing.reason };
  fields["content"] = shelfPage(after, view.record);
  return { ok: true, proposal: { kind, on: thing.id, expected: { on: thing.revision, ...expectedLibrary }, fields } };
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
