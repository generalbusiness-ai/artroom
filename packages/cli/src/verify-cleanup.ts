/** Read-only cleanup observation, separate from the historical replay result. */
import type { FactRef, Head, Item, Read, Summary } from "@generalbusiness/artroom-contract";
import { canonicalize } from "@generalbusiness/artroom-bytes";

interface CleanupReader {
  summary(): Promise<Read<Summary>>;
  items(type: string, cursor?: string): Promise<Read<readonly Item[]>>;
}
export interface CleanupObservation { lines: string[]; finding: string | null }

/** No absence claim until a complete enumeration matches the replayed destination head. */
export async function observeCleanup(reader: CleanupReader, target: FactRef, pages = 1000): Promise<CleanupObservation> {
  const unavailable = (why: string): CleanupObservation => ({ lines: [`Cleanup status not read: destination ${target.at.scope}: ${why}.`], finding: `Cleanup status not read: destination ${target.at.scope}: ${why}.` });
  const sameHead = (head: Head) => head.seq === target.seq && head.hash === target.hash;
  const summary = await reader.summary();
  if (!summary.ok) return unavailable(summary.reason);
  if (!summary.complete || summary.next !== undefined) return unavailable("incomplete summary");
  if (!sameHead(summary.at) || canonicalize(summary.value.scope) !== canonicalize(target.at)) return unavailable("the current head or incarnation differs from the replay target");
  // Legacy pins define no staged-reservation cleanup status. Preserve their
  // historical output without adding any absence or cleanup-complete claim.
  if (summary.value.definition !== "platform:destination@3") return { lines: [], finding: null };
  if (!Number.isSafeInteger(pages) || pages < 1) return unavailable("the cleanup page bound must be a positive integer");
  // The summary contains live items; the items route enumerates retained
  // final items. An owed cleanup keeps custody and is deliberately live.
  const items = new Map<number, Item>(summary.value.items.filter((item) => item.type === "publication").map((item) => [item.id, item]));
  let cursor: string | undefined;
  for (let page = 0; page < pages; page++) {
    const read = await reader.items("publication", cursor);
    if (!read.ok) return unavailable(read.reason);
    if (!sameHead(read.at)) return unavailable("the head changed during cleanup enumeration");
    for (const item of read.value) {
      if (item.type !== "publication") return unavailable("the publication enumeration contains another item type");
      const prior = items.get(item.id);
      if (prior && canonicalize(prior) !== canonicalize(item)) return unavailable("the publication enumeration changed an item");
      items.set(item.id, item);
    }
    if (read.next === undefined) {
      if (!read.complete) return unavailable("incomplete publication enumeration");
      const end = await reader.summary();
      if (!end.ok) return unavailable(end.reason);
      if (!end.complete || end.next !== undefined || !sameHead(end.at) || canonicalize(end.value.scope) !== canonicalize(target.at) || end.value.definition !== "platform:destination@3") return unavailable("the destination changed before cleanup enumeration completed");
      const owed = [...items.values()].filter((item) => item.state === "cleanup-owed").sort((a, b) => a.id - b.id);
      const lines = owed.flatMap((item) => {
        const cleanup = item.values["cleanupReason"];
        const independent = cleanup !== null && typeof cleanup === "object" && !Array.isArray(cleanup) ? cleanup as Record<string, unknown> : null;
        const duties = independent ? [
          { reason: independent["refReason"], attempts: item.values["cleanupAttempts"] },
          { reason: independent["tokenReason"], attempts: independent["tokenAttempts"] },
        ].filter((duty) => typeof duty.reason === "string") : [{ reason: item.values["cleanupReason"], attempts: item.values["cleanupAttempts"] }];
        const integration = typeof item.values["integration"] === "string" ? `; integration commit ${item.values["integration"]}` : "";
        return (duties.length ? duties : [{ reason: "reason not recorded", attempts: null }]).map((duty) => {
          const reason = typeof duty.reason === "string" ? duty.reason : "reason not recorded";
          const attempts = typeof duty.attempts === "number" ? String(duty.attempts) : "not recorded";
          return `Owed cleanup: destination ${target.at.scope}, reservation ${item.id}, entry ${target.seq}: ${reason}; attempts ${attempts}${integration}; custody remains ${reason.includes("unknown") ? "unknown" : "owed"}.`;
        });
      });
      return { lines: lines.length ? lines : [`Cleanup status: destination ${target.at.scope}, entry ${target.seq}: no reservation is recorded as cleanup-owed.`], finding: lines.length ? `Owed cleanup: ${owed.length} reservation(s) at destination ${target.at.scope}; historical replay consistency does not settle cleanup.` : null };
    }
    if (read.next === cursor) return unavailable("the publication cursor did not advance");
    cursor = read.next;
  }
  return unavailable(`publication enumeration reached ${pages} pages with a cursor left`);
}
