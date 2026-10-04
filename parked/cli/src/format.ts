/**
 * Plain-text output: short and calm. Each result says what happened and
 * what to do next. A refusal shows its rule, reason and fix.
 */

import type {
  ArtroomError,
  AttentionItem,
  Claim,
  Explanation,
  LandOp,
  LogEntry,
  Obligation,
  Page,
  Proposal,
  RecordMeaning,
  Refusal,
} from "@generalbusiness/artroom-contract";
import { kindText } from "./declared.ts";

export const short = (sha: string) => sha.slice(0, 12);

export function refusalText(r: Refusal): string[] {
  const lines = [`Refused: ${r.rule}`, `  Reason: ${r.reason}`];
  if (r.fix) lines.push(`  Fix: ${r.fix}`);
  if (r.rule === "binding-stale" && r.current?.binding !== undefined) lines.push(`  Active binding: ${r.current.binding}, in policy version ${String(r.current.policy)}.`); // G5:cli-refusal-current
  if (r.act) lines.push(`  Recorded as ${r.act}. For the details: artroom explain ${r.act}`);
  return lines;
}

export function errorText(e: ArtroomError): string[] {
  // The CLI says how to retry in its own words, with the flag to use.
  const lines = [`Error (${e.code}): ${e.message.replace(/ Retry with idempotency key .*$/s, "")}`];
  if (e.maybeRecorded) lines.push("  The room may have recorded this. Repeat the same command with the same --idempotency-key to be sure.");
  else if (e.retryable) lines.push("  This may work if you try again.");
  return lines;
}

export function claimText(c: Claim): string[] {
  const verb = c.effect.type === "opened" ? "Claimed" : c.effect.type === "rescoped" ? "Changed the scope of" : "Took over";
  const lines = [`${verb} lane ${c.lane}, lease ${c.lease.generation}, until ${c.lease.expiresAt}.`, `Scope: ${c.scope.join(" ")}`];
  for (const o of c.overlaps) {
    lines.push(`${o.certain ? "Overlaps" : "May overlap"} ${o.lane} (${o.theirs})${o.holder ? `, held by ${o.holder}` : ""}. Consider a note: artroom note ${o.lane} -m "..."`);
  }
  lines.push("Next: artroom workspace");
  return lines;
}

function obligationText(o: Obligation): string {
  const who = o.kind === "review" ? `review by ${o.from.join(" or ")}${o.count > 1 ? ` (${o.count} people)` : ""}` : `check ${o.check} by ${o.by.join(" or ")}`;
  return `  ${o.state === "met" ? "met " : "open"}  ${o.id}: ${who}`;
}

export function proposalText(p: Proposal): string[] {
  const lines = [`Proposed generation ${p.generation} of lane ${p.lane}: ${short(p.head)}.`];
  if (p.obligations.length === 0) lines.push("It needs no reviews or checks.");
  else {
    lines.push("It needs:");
    lines.push(...p.obligations.map(obligationText));
  }
  for (const n of p.notCarried) lines.push(`  Not carried from earlier: ${n.act} (${n.code}): ${n.text}`);
  lines.push(`Preview: ${p.preview.state}.`);
  lines.push(p.obligations.every((o) => o.state === "met") ? "Next: artroom land --wait" : "Next: artroom attention, then artroom land --wait when everything is met.");
  return lines;
}

/** What a landing's state means, and the next command. Only a finished, unsuccessful landing suggests a new `land`. */
export function landText(op: LandOp): string[] {
  switch (op.state) {
    case "landed":
      return [`Landed: ${short(op.integration)} (reserved at seq ${op.reservedAt}).`, "Next: artroom release, or artroom renew to keep working on the lane."];
    case "retryable":
      return [`The landing stopped (${op.reason}): ${op.fix}`, "Next: start a new attempt with artroom land --wait"];
    case "failed":
      return [
        `The landing failed: ${op.reason.code === "conflict" ? `conflict in ${op.reason.paths.join(", ")}` : op.reason.code === "check-failed" ? `check ${op.reason.check} failed` : `${op.reason.refusal.rule}: ${op.reason.refusal.reason}`}.`,
        op.reason.code === "conflict" ? "Next: merge main into your branch, push, and artroom propose again." : `Next: artroom explain ${op.receipt}`,
      ];
    case "aborted":
      return [`The landing was aborted after ${op.abort.trigger}.`, `Next: artroom explain ${op.abort.trigger}`];
    case "unresolved":
      return [`The publication is unresolved since ${op.since}; the room keeps retrying.`, `Next: artroom wait ${op.id}`];
    default:
      return [`Landing ${op.id} is ${op.state}.`, `Next: artroom wait ${op.id}`];
  }
}

function where(item: AttentionItem): string {
  switch (item.why) {
    case "review-requested":
    case "check-requested":
    case "objection":
    case "evidence-invalidated":
      return `${item.proposal.lane}#${item.proposal.generation}`;
    case "land-outcome":
    case "publication-unresolved":
      return item.op;
    case "note":
      return item.note;
    case "policy":
      return item.act;
    case "log-publication-stalled":
      return `seq ${item.seq}`;
    default:
      return item.lane;
  }
}

export function attentionText(page: Page<AttentionItem>, all: boolean): string[] {
  const items = all ? page.items : page.items.filter((i) => i.open);
  const lines = items.length === 0 ? ["Nothing needs you."] : [`${items.length} ${items.length === 1 ? "item needs" : "items need"} you:`];
  for (const i of items) lines.push(`  ${i.why.padEnd(18)} ${where(i).padEnd(18)} ${i.text}${i.open ? "" : " (done)"}`);
  lines.push(page.more ? `More: artroom attention --cursor ${page.cursor}` : `Later, for only new items: artroom attention --cursor ${page.cursor}`);
  return lines;
}

function entryWhat(e: LogEntry, meaning?: RecordMeaning): string {
  if (e.entry.type === "system") return `system ${e.entry.event.type}`;
  const env = e.entry.act.envelope;
  // A declared kind is shown with the label it had at this entry's own seq (R-DECL-23).
  const what = env.kind === "roster" ? `roster ${(env.body as { op: string }).op}` : kindText(env.kind, meaning);
  const by = e.entry.receipt.authority.member ?? "recovery key";
  return `${e.entry.type === "refusal" ? `refused ${what} (${e.entry.receipt.refusal.rule})` : what} by ${by}`;
}

export function logText(acts: readonly LogEntry[], head: number, publishedThrough: number, more: boolean, cursor: string, meanings: ReadonlyMap<number, RecordMeaning> = new Map()): string[] {
  const lines = acts.map((e) => `${String(e.seq).padStart(5)}  act_${e.seq}_${e.hash.slice(7, 15)}  ${e.at}  ${entryWhat(e, meanings.get(e.seq))}`);
  lines.push(`Head ${head}, published through ${publishedThrough}.${more ? ` More: artroom log --cursor ${cursor}` : ""}`);
  return lines;
}

export function explainText(x: Explanation): string[] {
  const lines = [`${x.act}: ${kindText(x.kind, x.meaning)}, ${x.outcome}${x.published ? ", published" : ", not yet published"}.`];
  if (x.meaning?.vocabulary === "declared") lines.push(`Meaning: ${x.meaning.kind} as declared in policy version ${x.meaning.policy}, binding ${x.meaning.binding}.`); // G5:cli-explain-meaning
  if (x.entry.entry.type === "refusal") {
    const r = x.entry.entry.receipt.refusal;
    lines.push(`Refused by ${r.rule}: ${r.reason}${r.fix ? ` Fix: ${r.fix}` : ""}`);
  }
  if (x.entry.entry.type !== "system") {
    const a = x.entry.entry.receipt.authority;
    lines.push(`Authority: ${a.via}${a.member ? `, ${a.member} (${a.role})` : ""}.`);
  }
  for (const d of x.decisions) lines.push(`Rule ${d.rule} (${d.kind}): ${JSON.stringify(d.outcome)}`);
  for (const i of x.invariants) lines.push(`${i.held ? "Held" : "Failed"}: ${i.rule}${i.detail ? `: ${i.detail}` : ""}`);
  for (const ev of x.evidence ?? []) {
    lines.push(`Obligation ${ev.obligation}: ${ev.evidence.length} piece(s) of evidence${ev.notCarried.length ? `, ${ev.notCarried.length} not carried` : ""}.`);
  }
  return lines;
}
