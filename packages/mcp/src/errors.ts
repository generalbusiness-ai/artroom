/**
 * Readable errors, attributed to their source (plan 031, section 5). Every
 * answer that is not `accepted` becomes one sentence: what was asked, who
 * said what, the head it was judged at when the answer carries one, and the
 * next step, fixed per reason.
 *
 * The server renders only what the judge returned: a reason, an optional
 * guard name and a head. It never numbers guards, never reads the scope
 * again to infer which predicate failed, and says so when the scope does
 * not name the guard. What the server found itself, before signing or
 * beside the scope, is attributed to the server.
 */

import type { Answer, Head, MismatchReason, ReadRefusal, RefusalReason, UnavailableReason } from "@generalbusiness/dap-contract";
import { inline, sentenceNamed, type Sentence } from "./describe.ts";

/** What was asked, for the sentence. */
export interface Asked { scope: string; kind: string; on?: number | null; action?: string | null }

/** A sentence and its next step. */
export interface Said { sentence: string; next: string }

const HINTS = {
  again: "Read the subjects the sentence names with inspect or items; change the field or wait for the state; sign again with a new idempotencyKey.",
  fields: "Read the tool's description again; correct the fields; sign again with a new idempotencyKey.",
  read: "Read again with inspect, then sign again with a new idempotencyKey.",
  settle: "Call settle with the same idempotencyKey; do not sign again first.",
} as const;

/** One plain sentence for each refusal reason of the contract, and its next step. `name` is what the answer carries. */
export const REFUSALS: Readonly<Record<RefusalReason, (asked: Asked, name: string | undefined) => Said>> = {
  "revision-moved": () => ({ sentence: "an item this act names changed after it was read", next: HINTS.read }),
  alias: () => ({ sentence: "two names of the act name the same item", next: HINTS.fields }),
  "duplicate-relation": () => ({ sentence: "the relation this act asks for exists already", next: "Read the scope with inspect; nothing more is needed for that relation." }),
  "required-unset": () => ({ sentence: "a slot that must be set would be left unset. The scope does not name the slot", next: HINTS.fields }),
  "scope-full": () => ({ sentence: "the scope holds as many entries as it may", next: "Nothing more can be written to this scope; ask an admin." }),
  "bad-intent": () => ({ sentence: "the intent's signature, shape, expected revisions or deadline is not what an intent must be", next: "Sign again with a new idempotencyKey; if it repeats, report it, since the server built the intent." }),
  misaddressed: () => ({ sentence: "the intent is addressed to another scope or incarnation", next: "List tools again and call the tool with the scope's current reference." }),
  expired: () => ({ sentence: "the intent's deadline (notAfter) had passed when the scope judged it", next: "Sign again with a new idempotencyKey." }),
  "scope-refused": () => ({ sentence: "the scope refused its own creation and admits nothing", next: "Use another scope." }),
  "unknown-act": () => ({ sentence: "the kind is not an act of the scope's definition", next: "List tools again; call the tool that serves this scope." }),
  "bad-field": (_, name) => ({ sentence: `a field is unknown, missing or not a value of its type${name ? "" : ". The scope does not name the field"}`, next: HINTS.fields }),
  "no-item": () => ({ sentence: "an item that the act names does not exist. The scope does not name the item", next: "Read the scope's items with inspect or items; correct on or the item fields; sign again with a new idempotencyKey." }),
  final: () => ({ sentence: "the item is in a final state, and no act moves it", next: "Read the item with inspect; act on another item." }),
  "fact-mismatch": () => ({ sentence: "a fact field names an entry of this scope with a hash that is not that entry's", next: "Read the entry with step and give its exact fact; sign again with a new idempotencyKey." }),
  unauthorized: (asked) => ({ sentence: `your key holds no current grant${asked.action ? ` for ${asked.action}` : ""}`, next: "Call room to see your role; ask an admin for the action." }),
  "guard-failed": () => ({ sentence: "a guard does not hold", next: HINTS.again }),
  "capability-refused": (_, name) => ({ sentence: `a capability's rule does not hold${name ? "" : ""}`, next: "Prepare the capability's step with prepare, or read the scope; then submit again." }),
  "slot-full": () => ({ sentence: "a party list would pass its bound", next: "Remove a member from that list first, or act on another item." }),
  "type-full": () => ({ sentence: "the scope holds as many live items of that type as it may", next: "Close or finish one first." }),
  "entry-too-large": (_, name) => ({ sentence: `the entry would pass a bound${name ? ` (${name})` : ""}`, next: "Make the act smaller: fewer or shorter values." }),
  "send-unresolved": () => ({ sentence: "a send of the act names a target or item that resolves to nothing", next: "Read the scope; correct the fields that name the target." }),
  "unknown-message": () => ({ sentence: "the message names no handler of the definition", next: "Nothing an act tool can change; report it." }),
  "unsupported-definition": () => ({ sentence: "the definition bytes are not a definition this runtime can pin", next: "Use a definition that validates under the deployed bounds." }),
  "bad-input": () => ({ sentence: "the input does not follow from the scope's state", next: HINTS.read }),
};

export const UNAVAILABLE_NOTES: Readonly<Record<UnavailableReason, string>> = {
  "dependency-unavailable": "a scope or bytes it depends on could not be read",
  busy: "the scope is busy",
  "clock-behind": "the scope's clock reads earlier than its last entry",
  "scope-provisional": "the scope is not confirmed yet",
  "guard-incomplete": "a guard could not be completed",
  "authority-unavailable": "your standing could not be read",
  unavailable: "the scope is unavailable",
  "rate-limited": "too many requests of this kind",
};

export const MISMATCH_NOTES: Readonly<Record<MismatchReason, string>> = { "idempotency-mismatch": "the key is on another intent" };

export const READ_NOTES: Readonly<Record<ReadRefusal, Said>> = {
  "not-found": { sentence: "no such scope, entry or value is readable", next: "Check the ID; call room for the scopes of the room." },
  "wrong-incarnation": { sentence: "the scope has another incarnation than the one named", next: "Call room; use the scope's current reference." },
  forbidden: { sentence: "your key may not read it", next: "Call room to see your standing; a signed read reads only what your key signed, within its window." },
  "scope-provisional": { sentence: "the scope is not confirmed yet", next: "Call wait, then read again." },
  "unsupported-definition": { sentence: "the scope pins a definition this runtime cannot run", next: "Nothing to do here; report it." },
  "history-unavailable": { sentence: "the history cannot be read now", next: "Try later." },
  "too-large": { sentence: "the value is larger than one read may return", next: "Read a smaller page, with offset and limit." },
  unavailable: { sentence: "the scope is unavailable", next: "Try later." },
  "sessions-unavailable": { sentence: "the scope accepts no session now", next: "Try later; signed reads still work where your key signed." },
  "clock-behind": { sentence: "the scope's clock reads earlier than its last entry", next: "Try later." },
};

const at = (head: Head): string => `judged at head ${head.seq}`;

/**
 * The sentence for a scope's answer to an act. `guards`: the act's guard
 * sentences, from the complete text, so a refusal that names a guard always
 * has its sentence.
 */
export function answered(answer: Answer, asked: Asked, guards: readonly Sentence[] | null): Said {
  switch (answer.answer) {
    case "accepted": return { sentence: `${asked.scope} accepted ${asked.kind}: entry ${answer.receipt.fact.seq}${answer.receipt.sends.length > 0 ? `, with sends ${answer.receipt.sends.join(", ")}` : ""}.`, next: answer.receipt.sends.length > 0 ? "Call wait with this entry to see what it created or sent." : "Nothing more is needed." };
    case "refused": {
      if (answer.reason === "guard-failed" || answer.reason === "capability-refused") {
        if (answer.name) {
          const named = guards ? sentenceNamed(guards, answer.name) : null;
          const said = named ? inline(named) : `the guard named ${answer.name}; the act's declaration names no such guard`;
          const tagged = said.endsWith(`(${answer.name})`) || said.includes(`(${answer.name},`) || said.includes(`, ${answer.name})`) ? said : `${said} (${answer.name})`;
          return { sentence: `${asked.scope} refused ${asked.kind}, because this does not hold: ${tagged}, ${at(answer.judgedAt)}.`, next: answer.reason === "capability-refused" ? REFUSALS["capability-refused"](asked, answer.name).next : HINTS.again };
        }
        const all = guards && guards.length > 0 ? ` The act's guards are: ${guards.map(inline).join("; ")}.` : "";
        return { sentence: `${asked.scope} refused ${asked.kind}, because one of its guards does not hold, ${at(answer.judgedAt)}; the scope does not say which.${all}`, next: "Read the subjects the sentences name and compare; sign again with a new idempotencyKey." };
      }
      const said = REFUSALS[answer.reason](asked, answer.name);
      const name = answer.name && answer.reason !== "entry-too-large" ? ` (${answer.name})` : "";
      const named = answer.name && guards ? sentenceNamed(guards, answer.name) : null;
      return { sentence: `${asked.scope} refused ${asked.kind}, because ${said.sentence}${name}${named ? `: ${inline(named)}` : ""}, ${at(answer.judgedAt)}.`, next: said.next };
    }
    case "unavailable": return { sentence: `${asked.scope} did not judge ${asked.kind} (${answer.reason}: ${UNAVAILABLE_NOTES[answer.reason]}). Nothing is known to have been accepted; timed entries may have been written.`, next: HINTS.settle };
    case "mismatch": return { sentence: `Your key already signed another intent under this idempotency key on ${asked.scope} (${answer.reason}).`, next: "Use a new idempotencyKey for a new meaning." };
  }
}

/** A read that gave no value. */
export function readRefused(scope: string, reason: ReadRefusal): Said {
  const note = READ_NOTES[reason] ?? { sentence: reason, next: "Try later." };
  return { sentence: `${scope} did not answer the read: ${reason} (${note.sentence}).`, next: note.next };
}

/** How many characters of a caller's fragment (a target, a field name, a key, a value) a diagnostic repeats. */
export const FRAGMENT_CHARS = 128;

/** A field's path is clipped name by name where it is made (shape.ts); its whole is held to a few clipped names. */
const PATH_CHARS = 4 * FRAGMENT_CHARS;

/**
 * A caller's fragment as a diagnostic shows it: a string as given, any other value as its JSON, cut to FRAGMENT_CHARS
 * characters with an ellipsis and the original length when it is longer. A cut never splits a surrogate pair.
 */
export function clip(value: unknown, chars: number = FRAGMENT_CHARS): string {
  const whole = typeof value === "string" ? value : JSON.stringify(value) ?? String(value);
  if (whole.length <= chars) return whole;
  const cut = /[\uD800-\uDBFF]/.test(whole[chars - 1]!) ? chars - 1 : chars;
  return `${whole.slice(0, cut)}… (${whole.length} characters)`;
}

/**
 * The server's own findings, before or beside the scope's judgment. Each is a tool error, never a scope's answer. Every
 * fragment a caller gave (a field's path, a key, a scope or target as given, a tool's name) is clipped here, where the
 * sentence is made; a finding's `what` that quotes a caller's value clips it where it is written.
 */
export type Finding =
  | { error: "shape"; field: string; what: string; declared: string }
  | { error: "stale-descriptor"; scope: string; runs: string; tool: string | null }
  | { error: "restart" }
  | { error: "transport"; scope: string; submitted: boolean }
  | { error: "custody"; state: "conflicting" | "full" | "locked" | "unreadable" | "terminal" | "too-large"; key: string; scope: string; keys?: string[]; recorded?: string; bytes?: number; reason?: "budget";
      /** The dead reclaimer's file, relative to the custody directory (ARTROOM_HOME/private/mcp-custody). */
      stale?: string }
  | { error: "credential"; destination: string; why: string }
  | { error: "target"; what: string }
  | { error: "unknown-tool"; name: string }
  | { error: "read"; scope: string; reason: ReadRefusal };

export function finding(f: Finding): Said & { error: string } {
  switch (f.error) {
    case "shape": return { error: f.error, sentence: `Before signing, the server found field ${clip(f.field, PATH_CHARS)} ${f.what}; declared: ${f.declared}. Nothing was sent.`, next: "Correct the field and call again with the same idempotencyKey." };
    case "stale-descriptor": return { error: f.error, sentence: `Before signing, the server found that ${clip(f.scope)} runs ${clip(f.runs)}, which this tool does not serve. Nothing was sent.${f.tool ? ` The tool for that target is ${f.tool}.` : " No listed tool serves it for your standing."}`, next: "List tools again; call the named tool." };
    case "restart": return { error: f.error, sentence: "The tool list changed; list again from the start.", next: "Call tools/list without a cursor." };
    case "transport": return { error: f.error, sentence: `The reply from ${clip(f.scope)} was lost or malformed; the outcome is unknown.${f.submitted ? " The envelope is under custody." : ""}`, next: f.submitted ? HINTS.settle : "Call again; nothing was submitted." };
    case "custody": {
      const extra = f.state === "full" && f.reason === "budget" ? ` The server's custody store is at its budget: it holds ${f.bytes} bytes with what unresolved records may still receive, and admits no completion capacity for another dispatch; nothing was signed.`
        : f.state === "full" && f.bytes !== undefined ? ` The envelope would carry about ${f.bytes} bytes, more than a record of 2 MiB holds with its outcomes; nothing was signed.`
        : f.state === "full" && f.keys ? ` The oldest unresolved keys: ${f.keys.map((k) => clip(k)).join(", ")}.` : f.recorded ? ` It holds ${f.recorded}.`
        : f.state === "locked" && f.stale ? " A process died while recovering this lock and left its reclaim file, named in the next step; the server does not break it, so that no two processes can recover at once." : "";
      const next = f.state === "conflicting" ? "Use a new idempotencyKey for a new meaning."
        : f.state === "locked" && f.stale ? `Once no process of this ARTROOM_HOME runs, remove the file private/mcp-custody/${f.stale}, relative to ARTROOM_HOME, then call again with the same idempotencyKey.`
        : f.state === "locked" ? "Wait a moment and call again with the same idempotencyKey."
        : f.state === "full" && f.reason === "budget" ? "Call settle for the unresolved keys, or wait for them to complete; retained answers are still read."
        : f.state === "full" && f.bytes !== undefined ? "Make the act smaller: move long texts to detached texts or smaller values."
        : f.state === "full" ? "Call settle for the unresolved keys first."
        : f.state === "terminal" ? "The retained outcome is in the result; resubmit: true sends the same envelope again, deliberately."
        : f.state === "too-large" ? "Make the act smaller." : "Report it; nothing was sent.";
      return { error: f.error, sentence: `The server's record for key ${clip(f.key)} on ${clip(f.scope)} is ${f.state}; nothing was sent.${extra}`, next };
    }
    case "credential": return { error: f.error, sentence: `No read token of yours is readable at ${clip(f.destination)} (${f.why}); nothing was returned.`, next: "Call repository.read-token first (or act in --generic mode), then wait for its outcome, then credential." };
    case "target": return { error: f.error, sentence: `Before signing, the server could not resolve the target: ${f.what}. Nothing was sent.`, next: "Call room for the scopes and lanes of the room; give target as a scope ID or a number." };
    case "unknown-tool": return { error: f.error, sentence: `No tool is named ${clip(f.name)} in this list.`, next: "Call tools/list." };
    case "read": { const said = readRefused(clip(f.scope), f.reason); return { error: f.error, ...said }; }
  }
}
