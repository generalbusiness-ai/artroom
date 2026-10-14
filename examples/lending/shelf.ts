/**
 * The shelf of notes/2026-10-13-lending-library.md, section 4: one markdown page for
 * each thing, and the things themselves read from the lending scope's record.
 * Plain functions. Nothing here signs, sends or publishes.
 */
import type { Entry } from "@generalbusiness/dap-contract";

export type ThingState = "available" | "lent" | "gone";
/** A thing as the shelf shows it. `donor` and `borrower` are member handles. */
export interface Thing {
  id: number;
  state: ThingState;
  name: string;
  description: string;
  donor: string;
  borrower: string | null;
  reason: string | null;
  /** The entry that last changed this thing. */
  seq: number;
}
/** The lending entry a page reflects: the scope, its incarnation, and the entry's place and hash. */
export interface RecordPointer { scope: string; incarnation: string; seq: number; hash: string }

/** A thing's page. The path is the item's number, never a name a member typed. */
export const shelfPath = (id: number): string => {
  if (!Number.isSafeInteger(id) || id < 0) throw new Error("A shelf path needs an item number.");
  return `shelf/${id}.md`;
};

const PUNCTUATION = /[!-/:-@[-`{-~]/g;
// C0 controls, DEL, NEL, and the line and paragraph separators.
const CONTROL = new RegExp("[\\u0000-\\u001f\\u007f\\u0085\\u2028\\u2029]+", "g");
/**
 * A member's text as literal markdown on one line. Every ASCII punctuation character
 * is escaped, so none can open a heading, a list, a link, an emphasis, a table, code
 * or HTML. Line breaks, tabs and other control characters become one space, so the
 * text cannot start a second line.
 *
 * One thing an escape cannot stop: the site's renderer links a bare address
 * (`https://...`, `www....`, an email address) wherever it stands in text. Such a
 * link shows the address it goes to. A member's text cannot give a link other words.
 */
export function literal(text: string): string {
  return text.replace(CONTROL, " ").replace(/ {2,}/g, " ").trim().replace(PUNCTUATION, "\\$&");
}

const statusOf = (thing: Thing): string =>
  thing.state === "available" ? "available"
    : thing.state === "lent" ? `lent to ${literal(thing.borrower ?? "a member")}`
      : `gone: ${literal(thing.reason ?? "")}`.trimEnd();

/** The page of one thing, as it stands at `record`. The three list lines are the interface's alone. */
export function shelfPage(thing: Thing, record: RecordPointer): string {
  const name = literal(thing.name) || `Thing ${thing.id}`;
  const description = literal(thing.description);
  return [
    `# ${name}`, "",
    ...(description ? [description, ""] : []),
    `- Status: ${statusOf(thing)}`,
    `- Donated by: ${literal(thing.donor)}`,
    `- Record: lending scope ${record.scope}, incarnation ${record.incarnation}, entry ${record.seq}, hash ${record.hash}`,
    "",
  ].join("\n");
}

const text = (value: unknown): string => typeof value === "string" ? value : "";

/**
 * Every thing, live or gone, from the lending scope's complete record in order.
 * The scope's summary lists live things only, so a cancelled thing and its reason
 * are read here. Each act entry took effect: a refused act is not in the record.
 * The signer's handle is the subject of the one grant the scope judged.
 */
export function thingsOf(entries: readonly Entry[]): Thing[] {
  const things = new Map<number, Thing>();
  entries.forEach((entry, seq) => {
    if (entry.input.type !== "act") return;
    const { intent } = entry.input.signed;
    const signer = entry.input.authority[0]?.subject.member ?? "";
    if (intent.kind === "donate") {
      things.set(seq, { id: seq, state: "available", name: text(intent.fields["name"]), description: text(intent.fields["description"]), donor: signer, borrower: null, reason: null, seq });
      return;
    }
    const thing = typeof intent.on === "number" ? things.get(intent.on) : undefined;
    if (!thing) return;
    if (intent.kind === "borrow") Object.assign(thing, { state: "lent", borrower: signer, seq });
    else if (intent.kind === "return") Object.assign(thing, { state: "available", borrower: null, seq });
    else if (intent.kind === "cancel") Object.assign(thing, { state: "gone", borrower: null, reason: text(intent.fields["reason"]), seq });
  });
  return [...things.values()];
}
