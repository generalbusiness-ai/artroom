/**
 * Declared acts in the Room (docs/protocol.md section 33, stage 2): what
 * admission needs beyond the shared vocabulary (policy `vocabulary.ts`).
 *
 * - `stagedProblems`: a `v2` document that uses a step or hold setting the
 *   Room runs only from stage 4 is refused at propose time, so no such
 *   declaration can activate before the Room can honour it.
 * - `worded`: a declaration's refusal wording, filled from facts the room
 *   already reports (R-DECL-13).
 * - The step-4a refusals `kind-undeclared` and `binding-stale` (R-DECL-16).
 */

import type { ActDeclaration, Binding, PolicyDocumentV2, PolicyVersion, Refusal, RefusalSlot, Step } from "@generalbusiness/artroom-contract";
import { TARGET_ORDER } from "@generalbusiness/artroom-policy";
import { refusal } from "./authority.ts";

/**
 * Problems with a valid `v2` document that this Room cannot run yet: the
 * steps and hold settings of note section 8.5 stage 4. Each names the act.
 */
export function stagedProblems(doc: PolicyDocumentV2): string[] {
  const out: string[] = [];
  const later = (kind: string, what: string) => out.push(`acts.${kind}: ${what} is not run by this room until declared acts stage 4`);
  for (const [kind, d] of Object.entries(doc.acts)) {
    for (const shape of TARGET_ORDER) {
      const steps: readonly Step[] | undefined = d.targets[shape];
      if (!steps) continue;
      if (steps.length > 1) later(kind, `${steps.join(" then ")} in one act`); // G2:staged-pair
      if (steps.includes("hand-over")) later(kind, "the step hand-over"); // G2:staged-handover
      if (shape === "none" && steps.includes("comment")) later(kind, "a comment on target none"); // G2:staged-unanchored
    }
    const h = d.hold;
    if (!h) continue;
    if (h.scope !== "body.scope") later(kind, "a scope template"); // G2:staged-template
    if (h.conflict !== undefined) later(kind, "hold.conflict"); // G2:staged-conflict
    if (h.reserveSeconds !== undefined) later(kind, "hold.reserveSeconds"); // G2:staged-reserve
    if (h.workspace !== true) later(kind, "a hold without a workspace"); // G2:staged-workspace
  }
  return out;
}

/** The facts a refusal template may use (R-DECL-13). A slot with no fact is filled with nothing. */
export type RefusalFacts = Partial<Record<RefusalSlot, string>>;

/**
 * The most bytes a filled `reason` or `fix` has (R-DECL-13): a template of
 * 512 bytes with one path of the greatest length fits. A longer text is cut
 * at a character boundary, so a template that repeats a slot cannot make a
 * refusal, or the entry that records it, larger than this.
 */
export const WORDING_FILLED_BYTES = 8192;

/** Fill a template's slots. Only the eight slots are interpolated; validation refused any other brace. */
export function fill(template: string, facts: RefusalFacts): string {
  const text = template.replace(/\{(holder|lane|generation|obligation|path|reservedFor|until|kind)\}/g, (_, slot: RefusalSlot) => facts[slot] ?? ""); // G2:fill
  return clipBytes(text, WORDING_FILLED_BYTES); // G2:fill-bound
}

const encoder = new TextEncoder();

/**
 * `text` cut to at most `max` UTF-8 bytes, never inside a character. The
 * result is a prefix of `text` itself: nothing is decoded, so no character
 * of it is dropped or replaced (a leading U+FEFF stays).
 */
export function clipBytes(text: string, max: number): string {
  let bytes = 0;
  let end = 0;
  for (const ch of text) {
    bytes += encoder.encode(ch).length;
    if (bytes > max) break; // G2:fill-bound-character
    end += ch.length;
  }
  return text.slice(0, end);
}

/**
 * A platform refusal with the declaration's wording for its code, if it has
 * one (R-DECL-13). The room decided the refusal and its code; only `reason`
 * and `fix` change.
 */
export function worded(r: Refusal, d: ActDeclaration | null, facts: RefusalFacts): Refusal {
  const w = d?.refusals?.[r.rule as keyof NonNullable<ActDeclaration["refusals"]>];
  if (!w) return r;
  return { ...r, reason: fill(w.reason, facts), fix: fill(w.fix, facts) };
}

/** R-DECL-16 step 4a.1: the kind is not declared in the active document. Not recorded. */
export function kindUndeclared(kind: string, policy: PolicyVersion): Refusal {
  return refusal("kind-undeclared", `The kind ${kind} is not declared in the room's active policy, version ${policy}.`, "Read the room's declarations, the acts of .artroom/policy.json, and use a kind they declare.");
}

/** R-DECL-16 step 4a.2: the envelope is not `v: 2`, or its binding is not the active declaration's. Not recorded. */
export function bindingStale(kind: string, signed: string | undefined, current: Binding, policy: PolicyVersion): Refusal {
  return refusal(
    "binding-stale",
    signed === undefined
      ? `The act of ${kind} carries no binding; the active declaration's is ${current}, in policy version ${policy}.`
      : `The act was prepared for ${kind} as ${signed}; the active declaration's binding is ${current}, in policy version ${policy}.`,
    "Read the active declaration. Sign the act again under its binding only if that meaning is still what you intend.",
    { current: { binding: current, policy } },
  );
}
